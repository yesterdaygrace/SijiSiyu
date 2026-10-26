import { defineEventHandler } from "h3";
import { cleanExpiredSessions, getAccount, getSavedPostsCount } from "~/server/utils/db";
import { isEncryptionConfigured } from "~/server/utils/security";
import { isOAuthConfigured, validateSession } from "~/server/utils/auth";

export default defineEventHandler((event) => {
  cleanExpiredSessions();
  const account = getAccount();
  const sessionActive = validateSession(event);
  return {
    connected: Boolean(account),
    sessionActive,
    oauthConfigured: isOAuthConfigured(),
    encryptionConfigured: isEncryptionConfigured(),
    username: account?.username ?? null,
    profile: account?.profile ?? null,
    tokenExpiresAt: account?.tokenExpiresAt ?? null,
    savedPostCount: getSavedPostsCount(),
  };
});
