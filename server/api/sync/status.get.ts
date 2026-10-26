import { defineEventHandler } from "h3";
import { getSyncStatus } from "~/server/utils/syncManager";

export default defineEventHandler(() => {
  return getSyncStatus();
});
