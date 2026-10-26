import { defineEventHandler } from "h3";
import { cancelSyncJob } from "~/server/utils/syncManager";

export default defineEventHandler(() => {
  const cancelled = cancelSyncJob();
  return { status: "ok", cancelled };
});
