import { defineEventHandler, getQuery, readBody, createError } from "h3";
import { deleteCollection } from "~/server/utils/db";
import { broadcastEvent } from "~/server/utils/sse";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  let id = typeof query.id === "string" ? query.id.trim() : null;

  if (!id) {
    const body = (await readBody(event).catch(() => ({}))) || {};
    if (typeof body.id === "string") {
      id = body.id.trim();
    }
  }

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Collection 'id' parameter is required.",
    });
  }

  if (id === "all") {
    throw createError({
      statusCode: 400,
      statusMessage: "Cannot delete the default 'All Saved' collection.",
    });
  }

  try {
    const deleted = deleteCollection(id);
    if (!deleted) {
      throw createError({
        statusCode: 404,
        statusMessage: `Collection '${id}' not found.`,
      });
    }

    broadcastEvent("collection_deleted", { id, timestamp: Date.now() });

    return {
      status: "ok",
      deleted: true,
      id,
    };
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 400,
      statusMessage: err.message || "Failed to delete collection",
    });
  }
});
