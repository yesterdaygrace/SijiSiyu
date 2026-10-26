import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const CDP_PORT = 9222;
const PORT = process.env.PORT || "3000";
const BACKEND_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const THREADS_URL = "https://www.threads.com/saved";

const args = process.argv.slice(2);
const isFullScan = args.includes("--full-scan") || process.env.FULL_SCAN === "1";
const isJsonEvents = args.includes("--json-events") || process.env.JSON_EVENTS === "1";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitEvent(type, data = {}) {
  const payload = { type, timestamp: Date.now(), ...data };
  if (isJsonEvents) {
    console.log(`[SYNC_EVENT] ${JSON.stringify(payload)}`);
  } else if (payload.message) {
    console.log(`[Sync] ${payload.message}`);
  }
}

async function isBackendRunning() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function getConnectedUsername() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/status`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      if (data.username) return data.username;
    }
  } catch {}
  return "vinkanaka";
}

async function ensureLocalProfile(username) {
  try {
    const devRes = await fetch(`${BACKEND_URL}/api/auth/dev-connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BACKEND_URL,
      },
      body: JSON.stringify({ username }),
    });
    if (devRes.ok) {
      const devData = await devRes.json();
      return { profile: devData.profile, sessionToken: devData.sessionToken };
    }
  } catch {}
  return { profile: { username }, sessionToken: "" };
}

function extractDecryptedCookies() {
  try {
    let secret = "";
    try {
      secret = execSync("secret-tool lookup application brave", { encoding: "utf8" }).trim();
    } catch {
      // secret-tool might not be available or returns empty
    }

    const key = secret ? crypto.pbkdf2Sync(secret, "saltysalt", 1, 16, "sha1") : null;
    const dbpath = path.join(os.homedir(), ".config", "BraveSoftware", "Brave-Browser", "Default", "Cookies");
    if (!fs.existsSync(dbpath)) return [];

    const tmpDb = path.join(os.tmpdir(), `brave-cookies-${Date.now()}.sqlite`);
    fs.copyFileSync(dbpath, tmpDb);

    try {
      const db = new Database(tmpDb, { readonly: true });
      const rows = db.prepare(
        "SELECT host_key, name, hex(encrypted_value) as hex_val, value, path, is_secure, is_httponly FROM cookies WHERE host_key LIKE '%threads%' OR host_key LIKE '%instagram%'"
      ).all();

      const cookies = [];
      for (const row of rows) {
        let val = row.value;
        if (key && row.hex_val && row.hex_val.length > 6) {
          const buf = Buffer.from(row.hex_val, "hex");
          const prefix = buf.subarray(0, 3).toString();
          if (prefix === "v11") {
            const iv = Buffer.from("                ");
            const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
            const dec = Buffer.concat([decipher.update(buf.subarray(3)), decipher.final()]);
            val = dec.subarray(32).toString("utf8");
          } else if (prefix === "v10") {
            const iv = Buffer.from("                ");
            const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
            const dec = Buffer.concat([decipher.update(buf.subarray(3)), decipher.final()]);
            val = dec.toString("utf8");
          }
        }
        if (val) {
          cookies.push({
            name: row.name,
            value: val,
            domain: row.host_key,
            path: row.path || "/",
            secure: Boolean(row.is_secure),
            httpOnly: Boolean(row.is_httponly),
          });
        }
      }
      return cookies;
    } finally {
      try {
        fs.rmSync(tmpDb, { force: true });
      } catch {}
    }
  } catch (err) {
    return [];
  }
}

function setupTempBraveProfile() {
  const tmpDir = path.join(os.tmpdir(), `brave-threads-auto-sync-${Date.now()}`);
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  const defaultDir = path.join(tmpDir, "Default");
  fs.mkdirSync(defaultDir, { recursive: true });

  const srcBase = path.join(os.homedir(), ".config", "BraveSoftware", "Brave-Browser");

  const filesToCopy = [
    ["Local State", "Local State"],
    ["Default/Preferences", "Default/Preferences"],
  ];

  for (const [srcRel, dstRel] of filesToCopy) {
    const srcPath = path.join(srcBase, srcRel);
    const dstPath = path.join(tmpDir, dstRel);
    if (fs.existsSync(srcPath)) {
      try {
        fs.copyFileSync(srcPath, dstPath);
      } catch (e) {}
    }
  }

  return tmpDir;
}

async function waitForCdp(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    await delay(300);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
  }
  throw new Error("Timeout waiting for Brave CDP endpoint on port 9222");
}

async function findPageTab(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    await delay(300);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      if (res.ok) {
        const tabs = await res.json();
        const pageTab = tabs.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (pageTab) return pageTab;
      }
    } catch {}
  }
  throw new Error("Could not find active browser tab in Brave");
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) rej(new Error(msg.error.message));
            else res(msg.result);
          }
        } catch {}
      };
    });
  }

  async send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }
}

async function saveDirectToSqlite(posts) {
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "saved.sqlite"));
  db.pragma("journal_mode = WAL");

  const stmt = db.prepare(`
    INSERT INTO saved_posts (
      permalink, thread_id, username, text, timestamp, media_type,
      media_url, thumbnail_url, saved_at, source, payload_json, updated_at
    ) VALUES (
      @permalink, @threadId, @username, @text, @timestamp, @mediaType,
      @mediaUrl, @thumbnailUrl, @savedAt, @source, @payloadJson, @updatedAt
    )
    ON CONFLICT(permalink) DO UPDATE SET
      thread_id=excluded.thread_id,
      username=excluded.username,
      text=excluded.text,
      timestamp=excluded.timestamp,
      media_type=excluded.media_type,
      media_url=excluded.media_url,
      thumbnail_url=excluded.thumbnail_url,
      saved_at=COALESCE(excluded.saved_at, saved_posts.saved_at),
      source=excluded.source,
      payload_json=excluded.payload_json,
      updated_at=excluded.updated_at
  `);

  const now = Date.now();
  const insertMany = db.transaction((items) => {
    for (const post of items) {
      stmt.run({
        permalink: post.permalink,
        threadId: post.threadId || null,
        username: post.username || "",
        text: post.text || "",
        timestamp: post.timestamp || null,
        mediaType: post.mediaType || null,
        mediaUrl: post.mediaUrl || null,
        thumbnailUrl: post.thumbnailUrl || null,
        savedAt: post.savedAt || null,
        source: "browser-scan",
        payloadJson: JSON.stringify(post.payload || {}),
        updatedAt: now,
      });
    }
  });

  insertMany(posts);
  const total = db.prepare("SELECT COUNT(*) AS count FROM saved_posts").get().count;
  return { imported: posts.length, currentCount: total };
}

async function main() {
  emitEvent("step", { step: "init", message: "Starting Threads sync engine..." });

  const hasBackend = await isBackendRunning();
  const username = await getConnectedUsername();
  emitEvent("step", { step: "auth", message: `Connecting profile @${username}...` });

  let sessionToken = "";
  if (hasBackend) {
    const profileInfo = await ensureLocalProfile(username);
    sessionToken = profileInfo.sessionToken;
  }

  emitEvent("step", { step: "cookies", message: "Reading Threads session from Brave browser profile..." });
  const cookies = extractDecryptedCookies();

  if (cookies.length === 0) {
    emitEvent("error", {
      requiresAuth: true,
      message: "No active Threads session cookies found in Brave Browser. Please log into threads.net in Brave, or use the 1-Click Bookmarklet.",
    });
    return;
  }

  emitEvent("step", { step: "browser", message: `Launching browser automation with ${cookies.length} session cookies...` });
  const tmpProfile = setupTempBraveProfile();

  const braveProc = spawn(
    "brave-browser",
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmpProfile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    {
      stdio: "ignore",
      detached: false,
    }
  );

  let cdpClient = null;

  try {
    const cdpInfo = await waitForCdp();
    const tab = await findPageTab();
    cdpClient = new CdpClient(tab.webSocketDebuggerUrl);
    await cdpClient.connect();

    // Inject decrypted cookies
    await cdpClient.send("Network.enable", {});
    for (const c of cookies) {
      await cdpClient.send("Network.setCookie", c);
      if (c.domain.includes("threads.com")) {
        await cdpClient.send("Network.setCookie", {
          ...c,
          domain: c.domain.replace("threads.com", "threads.net"),
        });
      }
    }

    emitEvent("step", { step: "navigating", message: `Navigating to ${THREADS_URL}...` });
    await cdpClient.send("Page.navigate", { url: THREADS_URL });

    emitEvent("step", { step: "scanning", message: "Waiting for saved bookmarks to render..." });
    let initialCount = 0;
    for (let i = 1; i <= 20; i++) {
      await delay(1000);
      try {
        await cdpClient.evaluate(`(() => {
          const btn = Array.from(document.querySelectorAll("div[role='button'], button")).find(el => {
            const txt = el.textContent.trim().toLowerCase();
            return txt === 'close' || txt === 'dismiss' || txt === 'ignore' || txt === 'not now' || txt === 'maybe later';
          });
          if (btn) btn.click();
        })()`);

        const count = await cdpClient.evaluate(`document.querySelectorAll('a[href*="/post/"]').length`);
        if (typeof count === "number" && count > 0) {
          initialCount = count;
          break;
        }
      } catch {}
    }

    if (initialCount === 0) {
      // Check if redirected to login page
      const currentUrl = await cdpClient.evaluate(`window.location.href`);
      if (currentUrl && (currentUrl.includes("/login") || currentUrl.includes("/accounts/login"))) {
        emitEvent("error", {
          requiresAuth: true,
          message: "Threads presented a login page. Please log into your Threads account in Brave.",
        });
        return;
      }
    }

    // Define in-page extractor
    await cdpClient.evaluate(`
      window.__SAVED_POST_MAP__ = new Map();

      window.__SAVED_EXTRACT__ = function() {
        const btn = Array.from(document.querySelectorAll("div[role='button'], button")).find(el => {
          const txt = el.textContent.trim().toLowerCase();
          return txt === 'close' || txt === 'dismiss' || txt === 'ignore' || txt === 'not now';
        });
        if (btn) btn.click();

        const links = document.querySelectorAll('a[href*="/post/"]');
        links.forEach((link) => {
          const href = link.getAttribute('href') || '';
          const match = href.match(/(?:@|%40)?([a-zA-Z0-9._]+)\\/post\\/([a-zA-Z0-9_-]+)/);
          if (!match) return;

          const username = match[1].replace(/^@/, '');
          const threadId = match[2];
          const permalink = 'https://www.threads.net/@' + username + '/post/' + threadId;

          if (window.__SAVED_POST_MAP__.has(permalink)) return;

          const container = link.closest('[role="article"]') ||
            link.closest('[data-pressable-container="true"]') ||
            link.closest('div[style*="flex-direction: column"]') ||
            link.parentElement?.parentElement;

          let text = '';
          let timestamp = null;
          let mediaUrl = null;
          let thumbnailUrl = null;
          let mediaType = 'TEXT';

          if (container) {
            const timeEl = container.querySelector('time');
            if (timeEl && timeEl.getAttribute('datetime')) {
              timestamp = timeEl.getAttribute('datetime');
            }

            const textElements = container.querySelectorAll('span[dir="auto"], div[dir="auto"]');
            const textParts = [];
            textElements.forEach((el) => {
              const t = el.textContent ? el.textContent.trim() : '';
              if (
                t &&
                !t.startsWith('@') &&
                t !== 'Translate' &&
                !t.match(/^\\d+[hdwmy]$/) &&
                !textParts.includes(t)
              ) {
                textParts.push(t);
              }
            });
            text = textParts.join('\\n');

            const imgs = container.querySelectorAll('img');
            for (const img of imgs) {
              const src = img.getAttribute('src');
              if (src && !src.includes('profile') && !src.includes('avatar') && !src.includes('emoji')) {
                mediaUrl = src;
                thumbnailUrl = src;
                mediaType = 'IMAGE';
                break;
              }
            }

            const video = container.querySelector('video');
            if (video) {
              mediaType = 'VIDEO';
              mediaUrl = video.getAttribute('src') || mediaUrl;
              thumbnailUrl = video.getAttribute('poster') || thumbnailUrl;
            }
          }

          window.__SAVED_POST_MAP__.set(permalink, {
            permalink,
            threadId,
            username,
            text: text || 'Saved thread',
            timestamp: timestamp || new Date().toISOString(),
            mediaType,
            mediaUrl,
            thumbnailUrl,
            savedAt: timestamp || new Date().toISOString()
          });
        });
        return window.__SAVED_POST_MAP__.size;
      };
    `);

    let currentTotal = await cdpClient.evaluate(`window.__SAVED_EXTRACT__()`);
    emitEvent("progress", {
      scannedCount: currentTotal,
      message: `Initial batch captured: ${currentTotal} saved posts`,
    });

    // Auto-scroll loop
    const maxScrolls = isFullScan ? 80 : 15;
    let prevTotal = currentTotal;
    let staleCount = 0;

    for (let s = 1; s <= maxScrolls; s++) {
      await cdpClient.evaluate(`
        (() => {
          const maxH = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.offsetHeight
          );
          window.scrollTo(0, maxH);
          window.dispatchEvent(new Event('scroll'));
        })()
      `);

      await delay(1600);
      currentTotal = await cdpClient.evaluate(`window.__SAVED_EXTRACT__()`);

      emitEvent("progress", {
        scroll: s,
        maxScrolls,
        scannedCount: currentTotal,
        message: `Scanned ${currentTotal} saved posts (scroll ${s}/${maxScrolls})...`,
      });

      if (currentTotal > prevTotal) {
        staleCount = 0;
        prevTotal = currentTotal;
      } else {
        staleCount++;
        // Nudge scroll slightly to trigger intersection observer
        await cdpClient.evaluate(`
          window.scrollBy(0, -500);
          window.dispatchEvent(new Event('scroll'));
        `);
        await delay(500);
        await cdpClient.evaluate(`
          window.scrollTo(0, document.body.scrollHeight);
          window.dispatchEvent(new Event('scroll'));
        `);
        await delay(1600);

        const retryTotal = await cdpClient.evaluate(`window.__SAVED_EXTRACT__()`);
        if (retryTotal > prevTotal) {
          staleCount = 0;
          prevTotal = retryTotal;
        } else if (staleCount >= (isFullScan ? 5 : 2)) {
          break;
        }
      }
    }

    const posts = await cdpClient.evaluate(`Array.from(window.__SAVED_POST_MAP__.values())`);
    emitEvent("step", { step: "importing", message: `Importing ${posts?.length || 0} posts into SQLite...`, scannedCount: posts?.length || 0 });

    if (posts && posts.length > 0) {
      let syncResult;
      if (hasBackend) {
        const syncRes = await fetch(`${BACKEND_URL}/api/saved-posts/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}`, Cookie: `saved_session=${sessionToken}` } : {}),
            Origin: BACKEND_URL,
          },
          body: JSON.stringify({
            completeScan: false,
            posts,
            source: "brave-cdp-sync",
          }),
        });
        if (!syncRes.ok) {
          throw new Error(`Sync HTTP error: ${syncRes.statusText}`);
        }
        syncResult = await syncRes.json();
      } else {
        syncResult = await saveDirectToSqlite(posts);
      }

      emitEvent("complete", {
        importedCount: syncResult.imported || posts.length,
        totalCount: syncResult.total || syncResult.currentCount,
        message: `Successfully synced ${syncResult.imported || posts.length} posts into your Saved library!`,
      });
    } else {
      emitEvent("complete", {
        importedCount: 0,
        totalCount: 0,
        message: "No saved posts found to import.",
      });
    }
  } finally {
    if (cdpClient) cdpClient.close();
    braveProc.kill("SIGTERM");
    await delay(600);
    if (fs.existsSync(tmpProfile)) {
      try {
        fs.rmSync(tmpProfile, { recursive: true, force: true });
      } catch {}
    }
  }
}

main().catch((err) => {
  emitEvent("error", {
    error: err.message,
    message: `Sync failed: ${err.message}`,
  });
  process.exit(1);
});
