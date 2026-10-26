import { defineEventHandler, readBody, createError } from "h3";
import {
  upsertSavedPosts,
  reconcileSavedPosts,
  logPartialSync,
  getSavedPostsCount,
  type SavedPostInput,
} from "~/server/utils/db";
import { broadcastEvent } from "~/server/utils/sse";

function normalizePermalink(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const hostname = url.hostname.toLowerCase();
    if (!hostname.endsWith("threads.net") && !hostname.endsWith("threads.com")) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null);
  if (!body || typeof body !== "object") {
    throw createError({
      statusCode: 400,
      statusMessage: "A JSON payload is required.",
    });
  }

  const source = typeof body.source === "string" ? body.source.slice(0, 64) : "browser-scan";
  const completeScan = Boolean(body.completeScan);
  const confirmEmpty = Boolean(body.confirmEmpty);
  const rawPosts: unknown = body.posts;

  if (!Array.isArray(rawPosts)) {
    throw createError({
      statusCode: 400,
      statusMessage: "'posts' must be an array.",
    });
  }

  const sanitized: SavedPostInput[] = [];
  for (const raw of rawPosts) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const permalink = normalizePermalink(item.permalink ?? item.url);
    if (!permalink) continue;
    sanitized.push({
      permalink,
      threadId: typeof item.threadId === "string" ? item.threadId.slice(0, 64) : null,
      username: typeof item.username === "string" ? item.username.replace(/^@/, "").slice(0, 64) : "",
      text: typeof item.text === "string" ? item.text.slice(0, 5000) : "",
      timestamp: typeof item.timestamp === "string" ? item.timestamp.slice(0, 64) : null,
      mediaType: typeof item.mediaType === "string" ? item.mediaType.slice(0, 32) : null,
      mediaUrl: typeof item.mediaUrl === "string" ? item.mediaUrl.slice(0, 1024) : null,
      thumbnailUrl: typeof item.thumbnailUrl === "string" ? item.thumbnailUrl.slice(0, 1024) : null,
      savedAt: typeof item.savedAt === "string" ? item.savedAt.slice(0, 64) : null,
      payload: item.payload && typeof item.payload === "object" ? (item.payload as Record<string, unknown>) : {},
    });
  }

  try {
    if (completeScan) {
      reconcileSavedPosts(sanitized, source, confirmEmpty);
    } else {
      upsertSavedPosts(sanitized, source);
      logPartialSync(sanitized.length, source);
    }

    const currentCount = getSavedPostsCount();

    broadcastEvent("posts_synced", {
      importedCount: sanitized.length,
      completeScan,
      source,
      totalCount: currentCount,
    });

    broadcastEvent("post_saved", {
      posts: sanitized,
      count: currentCount,
      completeScan,
      timestamp: Date.now(),
    });

    for (const post of sanitized) {
      broadcastEvent("post_saved_item", {
        permalink: post.permalink,
        username: post.username,
        text: post.text,
        timestamp: post.timestamp,
        savedAt: post.savedAt,
      });
    }

    return {
      status: "ok",
      synced: true,
      imported: sanitized.length,
      total: currentCount,
      currentCount,
      completeScan,
      source,
    };
  } catch (error: any) {
    throw createError({
      statusCode: 400,
      statusMessage: error?.message || "Sync failed",
    });
  }
});
