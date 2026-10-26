import { defineEventHandler, readBody, createError } from "h3";
import { startSyncJob } from "~/server/utils/syncManager";

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) || {};
  const fullScan = Boolean(body.fullScan);

  const result = startSyncJob({ fullScan });
  if (!result.ok) {
    throw createError({
      statusCode: 409,
      statusMessage: result.message,
    });
  }

  return {
    status: "ok",
    message: result.message,
    fullScan,
  };
});
