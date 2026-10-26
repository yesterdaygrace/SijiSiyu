import type { H3Event } from "h3";
import { getCookie, setCookie, deleteCookie } from "h3";
import { sha256, isEncryptionConfigured, secureRandomToken } from "./security.js";
import { hasSession, createSession, deleteSession } from "./db.js";

export const SESSION_COOKIE_NAME = "saved_session";
export const OAUTH_STATE_COOKIE_NAME = "threads_oauth_state";

export function isOAuthConfigured(): boolean {
  return Boolean(
    process.env.THREADS_APP_ID &&
    process.env.THREADS_APP_SECRET &&
    isEncryptionConfigured()
  );
}

export function getAppBaseUrl(event: H3Event): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const host = getRequestHeader(event, "host") || "localhost:3000";
  const proto = getRequestHeader(event, "x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export function getRedirectUri(event: H3Event): string {
  if (process.env.THREADS_REDIRECT_URI) return process.env.THREADS_REDIRECT_URI;
  return `${getAppBaseUrl(event)}/api/auth/threads/callback`;
}

export function validateSession(event: H3Event): boolean {
  const token = getCookie(event, SESSION_COOKIE_NAME);
  if (!token) return false;
  return hasSession(sha256(token));
}

export function createUserSession(event: H3Event, maxAgeSeconds = 30 * 24 * 60 * 60): string {
  const token = secureRandomToken(32);
  const hash = sha256(token);
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  createSession(hash, expiresAt);

  const isSecure = getAppBaseUrl(event).startsWith("https://");
  setCookie(event, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    maxAge: maxAgeSeconds,
    path: "/",
  });

  return token;
}

export function clearUserSession(event: H3Event): void {
  const token = getCookie(event, SESSION_COOKIE_NAME);
  if (token) {
    deleteSession(sha256(token));
  }
  deleteCookie(event, SESSION_COOKIE_NAME, { path: "/" });
}
