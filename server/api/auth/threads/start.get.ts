import { defineEventHandler, setCookie, sendRedirect, createError } from "h3";
import { secureRandomToken } from "~/server/utils/security";
import { isOAuthConfigured, getRedirectUri, OAUTH_STATE_COOKIE_NAME, getAppBaseUrl } from "~/server/utils/auth";

export default defineEventHandler((event) => {
  if (!isOAuthConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: "Set THREADS_APP_ID, THREADS_APP_SECRET, and TOKEN_ENCRYPTION_KEY in .env.",
    });
  }

  const state = secureRandomToken(32);
  const isSecure = getAppBaseUrl(event).startsWith("https://");
  setCookie(event, OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    maxAge: 15 * 60,
    path: "/",
  });

  const authUrl = new URL("https://threads.net/oauth/authorize");
  authUrl.searchParams.set("client_id", process.env.THREADS_APP_ID!);
  authUrl.searchParams.set("redirect_uri", getRedirectUri(event));
  authUrl.searchParams.set("scope", "threads_basic");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  return sendRedirect(event, authUrl.toString(), 302);
});
