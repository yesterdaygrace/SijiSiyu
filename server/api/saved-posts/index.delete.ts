import { defineEventHandler, getQuery, readBody, createError } from "h3";
import { deleteSavedPost, getSavedPostsCount } from "~/server/utils/db";
import { broadcastEvent } from "~/server/utils/sse";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  let permalink = typeof query.permalink === "string" ? query.permalink : null;

  if (!permalink) {
    const body = (await readBody(event).catch(() => ({}))) || {};
    if (typeof body.permalink === "string") {
      permalink = body.permalink;
    }
  }

  if (!permalink) {
    throw createError({
      statusCode: 400,
      statusMessage: "'permalink' parameter is required.",
    });
  }

  const deleted = deleteSavedPost(permalink);
  const currentCount = getSavedPostsCount();

  if (deleted) {
    broadcastEvent("post_deleted", {
      permalink,
      count: currentCount,
      timestamp: Date.now(),
    });
    return {
      status: "ok",
      deleted: true,
      permalink,
      currentCount,
    };
  }

  throw createError({
    statusCode: 404,
    statusMessage: "Post not found in local library.",
  });
});
