import { defineEventHandler, getQuery, getCookie, deleteCookie, sendRedirect } from "h3";
import { constantTimeEqual, encryptSecret } from "~/server/utils/security";
import { saveAccount } from "~/server/utils/db";
import {
  createUserSession,
  getRedirectUri,
  OAUTH_STATE_COOKIE_NAME,
} from "~/server/utils/auth";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getProfile,
} from "~/server/utils/threads-api";
import { broadcastEvent } from "~/server/utils/sse";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const code = typeof query.code === "string" ? query.code : null;
  const state = typeof query.state === "string" ? query.state : null;
  const errorParam = typeof query.error === "string" ? query.error : null;
  const errorDescription = typeof query.error_description === "string" ? query.error_description : "";

  if (errorParam) {
    return sendRedirect(event, `/?auth=error&reason=${encodeURIComponent(errorDescription || errorParam)}`, 302);
  }

  const expectedState = getCookie(event, OAUTH_STATE_COOKIE_NAME);
  deleteCookie(event, OAUTH_STATE_COOKIE_NAME, { path: "/" });

  if (!code || !state || !expectedState || !constantTimeEqual(state, expectedState)) {
    return sendRedirect(event, "/?auth=error&reason=invalid_oauth_state", 302);
  }

  try {
    const redirectUri = getRedirectUri(event);
    const shortLived = await exchangeCodeForShortLivedToken(code, redirectUri);
    let accessToken = shortLived.access_token;
    let tokenExpiresAt: number | null = null;
    try {
      const longLived = await exchangeForLongLivedToken(shortLived.access_token);
      accessToken = longLived.access_token;
      tokenExpiresAt = longLived.expires_in ? Date.now() + longLived.expires_in * 1000 : null;
    } catch (e: any) {
      console.warn("Falling back to short-lived token:", e?.message || e);
    }

    const profile = await getProfile(accessToken);
    saveAccount({
      userId: profile.id,
      username: profile.username,
      profile: {
        id: profile.id,
        username: profile.username,
        threads_biography: profile.threads_biography ?? "",
        threads_profile_picture_url: profile.threads_profile_picture_url ?? "",
      },
      encryptedToken: encryptSecret(accessToken),
      tokenExpiresAt,
      updatedAt: Date.now(),
    });

    createUserSession(event);
    broadcastEvent("account_connected", { username: profile.username, profile });
    return sendRedirect(event, "/?auth=success", 302);
  } catch (error: any) {
    return sendRedirect(event, `/?auth=error&reason=${encodeURIComponent(error?.message || "oauth_failed")}`, 302);
  }
});
