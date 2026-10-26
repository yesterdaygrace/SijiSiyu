import { defineEventHandler, getQuery, setResponseHeader } from "h3";
import { listSavedPosts, getLatestSyncRun } from "~/server/utils/db";

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const limit = Math.min(Math.max(Number.parseInt(String(query.limit || "50"), 10) || 50, 1), 200);
  const offset = Math.max(Number.parseInt(String(query.offset || "0"), 10) || 0, 0);
  const search = typeof query.search === "string" ? query.search : undefined;
  const sort = typeof query.sort === "string" ? query.sort : undefined;
  const collection = typeof query.collection === "string" ? query.collection : undefined;
  const mediaType = typeof query.mediaType === "string" ? query.mediaType : undefined;

  const { posts, total } = listSavedPosts({ limit, offset, search, sort, collection, mediaType });
  setResponseHeader(event, "Cache-Control", "no-cache, no-store, must-revalidate");

  return {
    data: posts,
    posts,
    meta: {
      total,
      limit,
      offset,
      sort: sort || "recent_saved",
      latestSync: getLatestSyncRun(),
    },
    total,
    limit,
    offset,
    latestSyncRun: getLatestSyncRun(),
  };
});
