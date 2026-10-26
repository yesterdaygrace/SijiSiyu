import { defineEventHandler, readBody } from "h3";
import { saveAccount } from "~/server/utils/db";
import { encryptSecret, secureRandomToken } from "~/server/utils/security";
import { createUserSession } from "~/server/utils/auth";
import { broadcastEvent } from "~/server/utils/sse";

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) || {};
  const username = String(body.username || "threads_user").replace(/^@/, "").trim() || "threads_user";
  const userId = `dev_${Date.now()}`;
  const profile = {
    id: userId,
    username,
    threads_biography: "Local development profile",
    threads_profile_picture_url: "",
  };
  const dummyToken = `dev_token_${secureRandomToken(16)}`;
  saveAccount({
    userId,
    username,
    profile,
    encryptedToken: encryptSecret(dummyToken),
    tokenExpiresAt: Date.now() + 60 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  });

  createUserSession(event);
  broadcastEvent("account_connected", { username, profile, devMode: true });

  return { connected: true, username, profile, devMode: true };
});
