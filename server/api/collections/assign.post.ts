import { defineEventHandler, readBody, createError } from "h3";
import { assignPostToCollection, getPostCollections } from "~/server/utils/db";
import { broadcastEvent } from "~/server/utils/sse";

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) || {};
  const permalink = typeof body.permalink === "string" ? body.permalink.trim() : "";
  const collectionId = typeof body.collectionId === "string" ? body.collectionId.trim() : "";
  const action = body.action === "remove" ? "remove" : "add";

  if (!permalink || !collectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: "'permalink' and 'collectionId' are required.",
    });
  }

  try {
    assignPostToCollection(permalink, collectionId, action);
  } catch (err: any) {
    if (err?.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      throw createError({
        statusCode: 404,
        statusMessage: "Post not found in local library.",
      });
    }
    throw createError({
      statusCode: 400,
      statusMessage: err.message || "Failed to assign post to collection",
    });
  }

  const updatedCollections = getPostCollections(permalink);

  broadcastEvent("post_collection_updated", {
    permalink,
    collectionId,
    action,
    collections: updatedCollections,
    timestamp: Date.now(),
  });

  return {
    status: "ok",
    permalink,
    collectionId,
    action,
    collections: updatedCollections,
  };
});
