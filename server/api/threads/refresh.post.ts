import { defineEventHandler, createError } from "h3";
import { validateSession } from "~/server/utils/auth";
import { getAccount, saveAccount } from "~/server/utils/db";
import { decryptSecret, encryptSecret } from "~/server/utils/security";
import { refreshLongLivedToken } from "~/server/utils/threads-api";

export default defineEventHandler(async (event) => {
  if (!validateSession(event)) {
    throw createError({
      statusCode: 401,
      statusMessage: "Active session required.",
    });
  }

  const account = getAccount();
  if (!account) {
    throw createError({
      statusCode: 404,
      statusMessage: "No account to refresh.",
    });
  }

  const accessToken = decryptSecret(account.encryptedToken);
  if (account.userId.startsWith("dev_")) {
    return { refreshed: true, expiresAt: Date.now() + 60 * 24 * 60 * 60 * 1000 };
  }

  const token = await refreshLongLivedToken(accessToken);
  const expiresAt = token.expires_in ? Date.now() + token.expires_in * 1000 : null;
  saveAccount({
    ...account,
    encryptedToken: encryptSecret(token.access_token),
    tokenExpiresAt: expiresAt,
    updatedAt: Date.now(),
  });

  return { refreshed: true, expiresAt };
});
