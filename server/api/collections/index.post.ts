import { defineEventHandler, readBody, createError } from "h3";
import { createCollection } from "~/server/utils/db";
import { broadcastEvent } from "~/server/utils/sse";

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) || {};
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: "Collection 'name' is required.",
    });
  }

  try {
    const created = createCollection({
      name,
      icon: typeof body.icon === "string" ? body.icon : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
      keywords: typeof body.keywords === "string" ? body.keywords : undefined,
    });

    broadcastEvent("collection_created", created);

    return {
      status: "ok",
      collection: created,
    };
  } catch (err: any) {
    throw createError({
      statusCode: 400,
      statusMessage: err.message || "Failed to create collection",
    });
  }
});
