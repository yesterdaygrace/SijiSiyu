const GRAPH_BASE = "https://graph.threads.net";

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  user_id?: string | number;
  error?: { message?: string; type?: string; code?: number };
}

export class ThreadsApiError extends Error {
  constructor(message: string, public readonly statusCode = 502) {
    super(message);
    this.name = "ThreadsApiError";
  }
}

function versionedUrl(path: string): URL {
  const version = (process.env.THREADS_API_VERSION || "v1.0").replace(/^\/+|\/+$/g, "");
  return new URL(`/${version}${path.startsWith("/") ? path : `/${path}`}`, GRAPH_BASE);
}

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const rawError = record.error && typeof record.error === "object"
      ? record.error as Record<string, unknown>
      : {};
    const message = typeof rawError.message === "string"
      ? rawError.message
      : `Threads API request failed with HTTP ${response.status}`;
    throw new ThreadsApiError(message, response.status === 401 ? 401 : 502);
  }
  return body as T;
}

export async function exchangeCodeForShortLivedToken(code: string, redirectUri: string): Promise<TokenResponse> {
  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  if (!appId || !appSecret) throw new ThreadsApiError("Threads OAuth credentials are not configured.", 503);

  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const response = await fetch(`${GRAPH_BASE}/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return readJson<TokenResponse>(response);
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<TokenResponse> {
  const appSecret = process.env.THREADS_APP_SECRET;
  if (!appSecret) throw new ThreadsApiError("THREADS_APP_SECRET is not configured.", 503);
  const url = new URL("/access_token", GRAPH_BASE);
  url.searchParams.set("grant_type", "th_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortLivedToken);
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  return readJson<TokenResponse>(response);
}

export async function refreshLongLivedToken(accessToken: string): Promise<TokenResponse> {
  const url = new URL("/refresh_access_token", GRAPH_BASE);
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  return readJson<TokenResponse>(response);
}

export interface ThreadsProfile {
  id: string;
  username: string;
  threads_biography?: string;
  threads_profile_picture_url?: string;
}

export async function getProfile(accessToken: string): Promise<ThreadsProfile> {
  const url = versionedUrl("/me");
  url.searchParams.set("fields", "id,username,threads_biography,threads_profile_picture_url");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  return readJson<ThreadsProfile>(response);
}

export interface ThreadsMedia {
  id: string;
  username?: string;
  text?: string;
  timestamp?: string;
  permalink?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  shortcode?: string;
}

export interface ThreadsMediaPage {
  data: ThreadsMedia[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

export async function getOwnThreads(accessToken: string, options: { limit: number; after?: string }): Promise<ThreadsMediaPage> {
  const url = versionedUrl("/me/threads");
  url.searchParams.set("fields", "id,username,text,timestamp,permalink,media_type,media_url,thumbnail_url,shortcode");
  url.searchParams.set("limit", String(options.limit));
  if (options.after) url.searchParams.set("after", options.after);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  return readJson<ThreadsMediaPage>(response);
}
