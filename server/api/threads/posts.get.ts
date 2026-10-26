import { defineEventHandler, getQuery, createError } from "h3";
import { validateSession } from "~/server/utils/auth";
import { getAccount } from "~/server/utils/db";
import { decryptSecret } from "~/server/utils/security";
import { getOwnThreads } from "~/server/utils/threads-api";

export default defineEventHandler(async (event) => {
  if (!validateSession(event)) {
    throw createError({
      statusCode: 401,
      statusMessage: "Connect your account to view posts.",
    });
  }

  const account = getAccount();
  if (!account) {
    throw createError({
      statusCode: 404,
      statusMessage: "No connected account found.",
    });
  }

  const query = getQuery(event);
  const limit = Math.min(Math.max(Number.parseInt(String(query.limit || "25"), 10) || 25, 1), 100);
  const after = typeof query.after === "string" ? query.after : undefined;

  const accessToken = decryptSecret(account.encryptedToken);
  if (account.userId.startsWith("dev_")) {
    return { data: [], paging: {}, note: "Dev mode mock" };
  }

  return await getOwnThreads(accessToken, { limit, after });
});
