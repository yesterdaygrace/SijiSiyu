import { defineEventHandler, createError } from "h3";
import { validateSession } from "~/server/utils/auth";
import { getAccount } from "~/server/utils/db";
import { decryptSecret } from "~/server/utils/security";
import { getProfile } from "~/server/utils/threads-api";

export default defineEventHandler(async (event) => {
  if (!validateSession(event)) {
    throw createError({
      statusCode: 401,
      statusMessage: "Connect your account to view profile.",
    });
  }

  const account = getAccount();
  if (!account) {
    throw createError({
      statusCode: 404,
      statusMessage: "No connected account found.",
    });
  }

  const accessToken = decryptSecret(account.encryptedToken);
  if (account.userId.startsWith("dev_")) {
    return {
      id: account.userId,
      username: account.username,
      profile: account.profile,
      devMode: true,
    };
  }

  return await getProfile(accessToken);
});
