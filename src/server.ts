import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import compression from "compression";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanExpiredSessions,
  createSession,
  db,
  deleteAccount,
  deleteSavedPost,
  deleteSession,
  getAccount,
  getLatestSyncRun,
  getSavedPostsCount,
  hasSession,
  listSavedPosts,
  logPartialSync,
  reconcileSavedPosts,
  saveAccount,
  upsertSavedPosts,
  type SavedPostInput,
} from "./db.js";
import {
  constantTimeEqual,
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
  parseCookies,
  secureRandomToken,
  sha256,
} from "./security.js";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getOwnThreads,
  getProfile,
  refreshLongLivedToken,
  ThreadsApiError,
} from "./threads-api.js";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const appBaseUrl = process.env.APP_BASE_URL ?? `http://localhost:${port}`;
const redirectUri = process.env.THREADS_REDIRECT_URI ?? `${appBaseUrl}/api/auth/threads/callback`;
const isProduction = process.env.NODE_ENV === "production";
const cookieSecure = appBaseUrl.startsWith("https://");
const sessionCookieName = "saved_session";
const oauthStateCookieName = "threads_oauth_state";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

app.disable("x-powered-by");
app.use(
  compression({
    filter: (req: Request, res: Response) => {
      if (req.path === "/api/events" || req.headers.accept === "text/event-stream") {
        return false;
      }
      return compression.filter(req, res);
    },
    threshold: 1024,
  }),
);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", "https://threads.net"],
    },
  },
  referrerPolicy: { policy: "no-referrer" },
}));
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.get("origin");
  if (
    origin &&
    (origin.startsWith("chrome-extension://") ||
      origin.startsWith("moz-extension://") ||
      origin === appBaseUrl ||
      origin.includes("threads.net") ||
      origin.includes("threads.com"))
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: "8mb", strict: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 240, standardHeaders: "draft-8", legacyHeaders: false }));

const oauthLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false });

// Server-Sent Events (SSE) Client Registry for real-time live sync
const sseClients = new Set<Response>();

export function broadcastEvent(eventType: string, data: unknown): void {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function isOAuthConfigured(): boolean {
  return Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET && isEncryptionConfigured());
}

function setCookie(res: Response, name: string, value: string, maxAgeSeconds: number): void {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (cookieSecure) attributes.push("Secure");
  res.append("Set-Cookie", attributes.join("; "));
}

function clearCookie(res: Response, name: string): void {
  const attributes = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (cookieSecure) attributes.push("Secure");
  res.append("Set-Cookie", attributes.join("; "));
}

function sessionHashFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken && bearerToken.length <= 256) {
      const hash = sha256(bearerToken);
      if (hasSession(hash)) return hash;
    }
  }
  const sessionCookie = parseCookies(req.headers.cookie)[sessionCookieName];
  if (!sessionCookie || sessionCookie.length > 256) return null;
  const hash = sha256(sessionCookie);
  return hasSession(hash) ? hash : null;
}

function requireSession(req: Request, res: Response, next: NextFunction): void {
  cleanExpiredSessions();
  const account = getAccount();
  if (!account) {
    res.status(401).json({ error: "threads_not_connected", message: "Connect a Threads account first." });
    return;
  }
  let hash = sessionHashFromRequest(req);
  if (!hash) {
    const origin = req.get("origin") || "";
    const isExtension = origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://");
    const isThreads = origin.includes("threads.net") || origin.includes("threads.com");
    const isLoopback = req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "::ffff:127.0.0.1" || !origin;
    if (isExtension || isThreads || isLoopback) {
      const existing = db.prepare("SELECT hash FROM sessions WHERE expires_at > ? LIMIT 1").get(Date.now()) as { hash: string } | undefined;
      if (existing) {
        hash = existing.hash;
      } else {
        const sessionToken = secureRandomToken(32);
        hash = sha256(sessionToken);
        createSession(hash, Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
    }
  }

  if (!hash) {
    res.status(401).json({ error: "threads_not_connected", message: "Connect a Threads account first." });
    return;
  }
  res.locals.sessionHash = hash;
  next();
}

function checkSameOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get("origin");
  if (!origin) {
    next();
    return;
  }
  if (
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("moz-extension://") ||
    origin.includes("threads.net") ||
    origin.includes("threads.com")
  ) {
    next();
    return;
  }
  try {
    if (new URL(origin).origin !== new URL(appBaseUrl).origin) {
      res.status(403).json({ error: "origin_not_allowed", message: "This request must originate from the Saved app or scanner extension." });
      return;
    }
  } catch {
    res.status(403).json({ error: "origin_not_allowed", message: "Invalid request origin." });
    return;
  }
  next();
}

function tokenForConnectedAccount(): string {
  const account = getAccount();
  if (!account) throw new ThreadsApiError("Connect a Threads account first.", 401);
  return decryptSecret(account.encryptedToken);
}

function safeProfile(profile: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!profile) return null;
  const result: Record<string, unknown> = {};
  for (const key of ["id", "username", "threads_biography", "threads_profile_picture_url"]) {
    const value = profile[key];
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

function asString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" ? value.slice(0, maxLength) : undefined;
}

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 3000) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function cleanPostContent(rawText: string, username?: string): string {
  if (!rawText) return "";
  const uLower = (username || "").toLowerCase().replace(/^@/, "");
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const cleanLines: string[] = [];

  for (let line of lines) {
    // Strip trailing Translate labels and page indicators like "Translate 1/2"
    line = line.replace(/[\s\u00a0]*(Translate|See translation)[\s\u00a0]*(\d+\/\d+)?$/i, "").replace(/[\s\u00a0]*\d+\/\d+$/, "").trim();
    if (!line) continue;

    const lLower = line.toLowerCase();
    // Skip author handle or username line
    if (uLower && (lLower === uLower || lLower === `@${uLower}`)) continue;
    // Skip raw date strings like 09/21/26, 10/07/26, 2026-10-14, 2d, 5h, 1w
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(line)) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(line)) continue;
    if (/^\d+[hdwmy]$/i.test(line)) continue;
    // Skip Threads tags/UI
    if (/^(ai threads|tech threads|design threads|business threads|software engineer|content creators|upwork|freelance|kerja luar negri)$/i.test(line)) continue;
    if (/^(threads|original audio|translated|translate|replying to|edited|\d+\/\d+)$/i.test(line)) continue;
    if (lLower.endsWith(" threads")) continue;
    // Skip numeric metrics counters like "2.9K 405 159 1.7K" or "100 likes"
    if (/^(\d+(\.\d+)?[KMkm]?\s*)+$/.test(line) && /\d/.test(line)) continue;
    if (/^\d+[\s]*(likes?|replies|reposts?|views?|shares?)/i.test(line)) continue;

    cleanLines.push(line);
  }

  return cleanLines.join("\n") || rawText;
}

function normalizeSavedPost(raw: unknown): SavedPostInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const permalink = safeHttpUrl(item.permalink ?? item.url);
  if (!permalink) return null;
  const host = new URL(permalink).hostname.toLowerCase();
  if (!new Set(["threads.net", "www.threads.net", "threads.com", "www.threads.com"]).has(host)) return null;

  const payload = item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
    ? item.payload as Record<string, unknown>
    : {};
  const rawUsername = asString(item.username ?? item.handle, 100) ?? "";
  const username = rawUsername.replace(/^@/, "");
  const rawText = asString(item.text, 20_000) ?? "";
  const text = cleanPostContent(rawText, username);
  const timestamp = asString(item.timestamp, 100) ?? null;
  const savedAt = asString(item.savedAt ?? item.saved_at, 100) ?? timestamp ?? null;
  return {
    permalink,
    threadId: asString(item.threadId ?? item.thread_id ?? item.id, 200) ?? null,
    username,
    text,
    timestamp,
    mediaType: asString(item.mediaType ?? item.media_type ?? item.type, 50) ?? null,
    mediaUrl: safeHttpUrl(item.mediaUrl ?? item.media_url) ?? null,
    thumbnailUrl: safeHttpUrl(item.thumbnailUrl ?? item.thumbnail_url) ?? null,
    savedAt,
    payload,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ThreadsApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "An unexpected server error occurred.";
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "saved-threads-backend",
    threadsOAuthConfigured: isOAuthConfigured(),
    apiVersion: process.env.THREADS_API_VERSION ?? "v1.0",
  });
});

app.get("/api/auth/status", (req, res) => {
  const account = getAccount();
  let connectedSession = Boolean(sessionHashFromRequest(req) && account);
  if (!connectedSession && account) {
    const sessionToken = secureRandomToken(32);
    createSession(sha256(sessionToken), Date.now() + 30 * 24 * 60 * 60 * 1000);
    setCookie(res, sessionCookieName, sessionToken, 30 * 24 * 60 * 60);
    connectedSession = true;
  }
  res.json({
    configured: isOAuthConfigured(),
    encryptionConfigured: isEncryptionConfigured(),
    connected: connectedSession,
    profile: connectedSession && account ? safeProfile(account.profile) : null,
    tokenExpiresAt: connectedSession ? account?.tokenExpiresAt ?? null : null,
    savedPostCount: connectedSession ? getSavedPostsCount() : 0,
    savedCollectionSource: "browser-scanner-not-official-api",
  });
});

app.post("/api/auth/dev-connect", checkSameOrigin, (req, res) => {
  if (!isEncryptionConfigured()) {
    res.status(503).json({ error: "encryption_not_configured", message: "TOKEN_ENCRYPTION_KEY is missing or invalid. Set it in .env." });
    return;
  }
  const body = req.body as Record<string, unknown> | undefined;
  const username = asString(body?.username, 50)?.replace(/^@/, "").trim() || "threads_user";
  const dummyToken = secureRandomToken(32);
  const encryptedToken = encryptSecret(dummyToken);
  const profile = {
    id: "dev_" + secureRandomToken(8),
    username,
    threads_biography: "Local profile connected in Saved library.",
    threads_profile_picture_url: "",
  };
  saveAccount({
    userId: profile.id,
    username: profile.username,
    profile,
    encryptedToken,
    tokenExpiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  });

  const sessionToken = secureRandomToken(32);
  createSession(sha256(sessionToken), Date.now() + 30 * 24 * 60 * 60 * 1000);
  setCookie(res, sessionCookieName, sessionToken, 30 * 24 * 60 * 60);

  res.json({
    connected: true,
    sessionToken,
    profile,
    message: "Local profile connected successfully. SQLite archive is ready for saved posts.",
  });
});

app.get("/api/auth/threads/start", oauthLimiter, (req, res) => {
  if (!process.env.THREADS_APP_ID || !process.env.THREADS_APP_SECRET) {
    res.status(503).send("Threads OAuth is not configured. Copy .env.example to .env and set THREADS_APP_ID, THREADS_APP_SECRET, and TOKEN_ENCRYPTION_KEY.");
    return;
  }
  if (!isEncryptionConfigured()) {
    res.status(503).send("TOKEN_ENCRYPTION_KEY is missing or invalid. Generate one with: openssl rand -hex 32");
    return;
  }

  const state = secureRandomToken(24);
  setCookie(res, oauthStateCookieName, state, 10 * 60);
  const clientId = process.env.THREADS_APP_ID;
  if (!clientId) {
    res.status(503).send("THREADS_APP_ID is not configured.");
    return;
  }
  const authorizeUrl = new URL("https://threads.net/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "threads_basic");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);
  res.redirect(authorizeUrl.toString());
});

app.get("/api/auth/threads/callback", oauthLimiter, async (req, res, next) => {
  try {
    const oauthError = typeof req.query.error === "string" ? req.query.error : null;
    if (oauthError) {
      clearCookie(res, oauthStateCookieName);
      res.redirect("/?oauth=denied");
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const cookieState = parseCookies(req.headers.cookie)[oauthStateCookieName] ?? "";
    clearCookie(res, oauthStateCookieName);
    if (!code || !state || !cookieState || !constantTimeEqual(state, cookieState)) {
      res.status(400).send("OAuth state validation failed. Go back to Saved and try connecting again.");
      return;
    }
    if (!isOAuthConfigured()) {
      res.status(503).send("Threads OAuth credentials or token encryption key are not configured.");
      return;
    }

    const shortToken = await exchangeCodeForShortLivedToken(code, redirectUri);
    let accessTokenResponse;
    try {
      accessTokenResponse = await exchangeForLongLivedToken(shortToken.access_token);
    } catch (error) {
      console.error("Threads long-lived token exchange failed; account was not connected.", errorMessage(error));
      res.status(502).send("Threads token exchange failed. Check your Meta app credentials and redirect URI, then try again.");
      return;
    }
    if (!accessTokenResponse.access_token) throw new ThreadsApiError("Threads did not return an access token.", 502);
    const profile = await getProfile(accessTokenResponse.access_token);
    const expiresIn = accessTokenResponse.expires_in ?? 60 * 24 * 60 * 60;
    const encryptedToken = encryptSecret(accessTokenResponse.access_token);
    saveAccount({
      userId: String(profile.id || accessTokenResponse.user_id || ""),
      username: profile.username,
      profile: profile as unknown as Record<string, unknown>,
      encryptedToken,
      tokenExpiresAt: Date.now() + expiresIn * 1000,
      updatedAt: Date.now(),
    });

    db.prepare("DELETE FROM sessions").run();
    const sessionToken = secureRandomToken(32);
    createSession(sha256(sessionToken), Date.now() + 30 * 24 * 60 * 60 * 1000);
    setCookie(res, sessionCookieName, sessionToken, 30 * 24 * 60 * 60);
    res.redirect("/?connected=1");
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/disconnect", checkSameOrigin, requireSession, (req, res) => {
  deleteAccount();
  clearCookie(res, sessionCookieName);
  res.json({ disconnected: true });
});

app.get("/api/threads/profile", requireSession, async (_req, res, next) => {
  try {
    const profile = await getProfile(tokenForConnectedAccount());
    res.json({ data: profile });
  } catch (error) {
    next(error);
  }
});

app.get("/api/threads/posts", requireSession, async (req, res, next) => {
  try {
    const limitRaw = Number.parseInt(String(req.query.limit ?? "50"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 50;
    const after = typeof req.query.after === "string" ? req.query.after.slice(0, 500) : undefined;
    const page = await getOwnThreads(tokenForConnectedAccount(), { limit, after });
    res.json({
      data: page.data,
      paging: {
        nextCursor: page.paging?.cursors?.after ?? null,
        hasNextPage: Boolean(page.paging?.next),
      },
      note: "These are posts authored by the connected account, not saved posts from other accounts.",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/threads/refresh", checkSameOrigin, requireSession, async (_req, res, next) => {
  try {
    const account = getAccount();
    if (!account) throw new ThreadsApiError("Connect a Threads account first.", 401);
    const currentToken = decryptSecret(account.encryptedToken);
    const refreshed = await refreshLongLivedToken(currentToken);
    if (!refreshed.access_token) throw new ThreadsApiError("Threads did not return a refreshed access token.", 502);
    saveAccount({
      ...account,
      encryptedToken: encryptSecret(refreshed.access_token),
      tokenExpiresAt: Date.now() + (refreshed.expires_in ?? 60 * 24 * 60 * 60) * 1000,
      updatedAt: Date.now(),
    });
    res.json({ refreshed: true, tokenExpiresAt: getAccount()?.tokenExpiresAt ?? null });
  } catch (error) {
    next(error);
  }
});

app.get("/api/saved-posts", requireSession, (req, res) => {
  const limitRaw = Number.parseInt(String(req.query.limit ?? "100"), 10);
  const offsetRaw = Number.parseInt(String(req.query.offset ?? "0"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 100;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
  const search = typeof req.query.search === "string" ? req.query.search.slice(0, 150) : undefined;
  const sort = typeof req.query.sort === "string" ? req.query.sort.slice(0, 50) : undefined;
  const result = listSavedPosts({ limit, offset, search, sort });
  res.json({
    data: result.posts,
    meta: { total: result.total, limit, offset, sort: sort || "recent_saved", latestSync: getLatestSyncRun() },
    note: "The official Threads API does not expose a saved-post collection. These records must be supplied by a local browser scanner.",
  });
});

app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const account = getAccount();
  res.write(
    `event: connected\ndata: ${JSON.stringify({
      time: Date.now(),
      connected: Boolean(account),
      profile: account ? safeProfile(account.profile) : null,
      savedPostCount: getSavedPostsCount(),
    })}\n\n`,
  );

  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(":ping\n\n");
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

app.post("/api/saved-posts/sync", checkSameOrigin, requireSession, (req, res) => {
  const body = req.body as Record<string, unknown> | undefined;
  const rawPosts = Array.isArray(body?.posts) ? body.posts : null;
  if (!rawPosts) {
    res.status(400).json({ error: "posts_array_required", message: "Expected a posts array." });
    return;
  }
  if (rawPosts.length > 5000) {
    res.status(413).json({ error: "too_many_posts", message: "A single scan may contain at most 5,000 posts." });
    return;
  }
  const normalized = rawPosts.map(normalizeSavedPost).filter((post): post is SavedPostInput => post !== null);
  if (normalized.length !== rawPosts.length) {
    res.status(400).json({
      error: "invalid_posts",
      message: "One or more posts lacked a valid Threads permalink or contained invalid data. Nothing was synced.",
      accepted: normalized.length,
      received: rawPosts.length,
    });
    return;
  }
  const completeScan = body?.completeScan === true;
  const confirmEmpty = body?.confirmEmpty === true;
  const startedCount = normalized.length;
  try {
    if (completeScan) {
      if (normalized.length === 0 && getSavedPostsCount() > 0 && !confirmEmpty) {
        res.status(409).json({
          error: "empty_scan_confirmation_required",
          message: "The scan is empty but the library already has posts. Confirm a genuinely empty Saved feed before reconciliation.",
        });
        return;
      }
      reconcileSavedPosts(normalized, "browser-scan", confirmEmpty || getSavedPostsCount() === 0);
    } else {
      upsertSavedPosts(normalized, "browser-scan");
      logPartialSync(startedCount, "browser-scan");
    }

    const currentCount = getSavedPostsCount();
    // Broadcast real-time live update to all connected frontend clients
    broadcastEvent("post_saved", {
      posts: normalized,
      count: currentCount,
      completeScan,
      timestamp: Date.now(),
    });

    res.json({
      synced: true,
      completeScan,
      imported: normalized.length,
      currentCount,
      message: completeScan
        ? "Saved-post archive reconciled with the completed browser scan. This does not perform an Unsave action on Threads."
        : "Posts imported. Existing records not present in a partial scan were left untouched.",
    });
  } catch (error) {
    res.status(500).json({ error: "sync_failed", message: errorMessage(error) });
  }
});

app.delete("/api/saved-posts", checkSameOrigin, requireSession, (req, res) => {
  const body = req.body as Record<string, unknown> | undefined;
  const permalink = typeof req.query.permalink === "string" ? req.query.permalink : typeof body?.permalink === "string" ? body.permalink : "";
  if (!permalink) {
    res.status(400).json({ error: "permalink_required", message: "A permalink query or body parameter is required." });
    return;
  }
  const deleted = deleteSavedPost(permalink);
  const currentCount = getSavedPostsCount();
  if (deleted) {
    broadcastEvent("post_deleted", {
      permalink,
      count: currentCount,
      timestamp: Date.now(),
    });
  }
  res.json({
    deleted,
    permalink,
    currentCount,
    message: deleted ? "Post removed from local archive." : "Post not found in local archive.",
  });
});

app.get("/api/threads/capabilities", (_req, res) => {
  res.json({
    officialApi: {
      oauth: true,
      readOwnProfile: true,
      readOwnThreads: true,
      readSavedCollection: false,
      removeAnotherUsersPostFromSaved: false,
    },
    localBrowserScanner: {
      importSavedCollection: true,
      performAndVerifyUnsave: false,
      implementedInThisBuild: false,
    },
    explanation: "Saved bookmarks and unsaving posts are not available in the documented official Threads API endpoints used by this backend.",
  });
});

app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf-8");
  res.send(html);
});
app.get("/logo.svg", (_req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  const svg = fs.readFileSync(path.join(root, "logo.svg"));
  res.send(svg);
});
app.get("/favicon.ico", (_req, res) => res.redirect(302, "/logo.svg"));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "not_found", message: "API endpoint not found." });
    return;
  }
  res.status(404).send("Not found");
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = error instanceof ThreadsApiError ? error.statusCode : 500;
  if (status >= 500) console.error("Saved backend request failed:", errorMessage(error));
  res.status(status).json({
    error: error instanceof ThreadsApiError ? "threads_api_error" : "internal_error",
    message: status === 500 && isProduction ? "An internal server error occurred." : errorMessage(error),
  });
});

export { app };

const isDirectRun = Boolean(
  process.argv[1] &&
    (process.argv[1] === fileURLToPath(import.meta.url) ||
      path.basename(process.argv[1]).startsWith("server.")),
);

if (isDirectRun && process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`Saved is running at ${appBaseUrl}`);
    console.log(`Threads OAuth configured: ${isOAuthConfigured() ? "yes" : "no"}`);
    console.log("Saved-post collection import is separate from the official Threads API.");
  });
}
