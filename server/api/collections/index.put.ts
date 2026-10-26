import { defineEventHandler, readBody, createError } from "h3";
import { updateCollection } from "~/server/utils/db";
import { broadcastEvent } from "~/server/utils/sse";

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) || {};
  const id = typeof body.id === "string" ? body.id.trim() : "";

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Collection 'id' is required.",
    });
  }

  if (id === "all" || id === "uncategorized") {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot modify '${id}' collection.`,
    });
  }

  try {
    const updated = updateCollection(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      icon: typeof body.icon === "string" ? body.icon : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
      keywords: typeof body.keywords === "string" ? body.keywords : undefined,
    });

    broadcastEvent("collection_updated", updated);

    return {
      status: "ok",
      collection: updated,
    };
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 400,
      statusMessage: err.message || "Failed to update collection",
    });
  }
});
