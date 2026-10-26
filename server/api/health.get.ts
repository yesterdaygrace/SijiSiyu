import { defineEventHandler } from "h3";
import { isOAuthConfigured } from "~/server/utils/auth";

export default defineEventHandler(() => {
  return {
    status: "ok",
    service: "saved-threads-backend",
    threadsOAuthConfigured: isOAuthConfigured(),
    apiVersion: process.env.THREADS_API_VERSION || "v1.0",
  };
});
