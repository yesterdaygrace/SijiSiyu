import { defineEventHandler } from "h3";
import { deleteAccount } from "~/server/utils/db";
import { clearUserSession } from "~/server/utils/auth";
import { broadcastEvent } from "~/server/utils/sse";

export default defineEventHandler((event) => {
  deleteAccount();
  clearUserSession(event);
  broadcastEvent("account_disconnected", {});
  return { connected: false };
});
