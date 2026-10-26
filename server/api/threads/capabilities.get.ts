import { defineEventHandler } from "h3";

export default defineEventHandler(() => {
  return {
    officialThreadsApi: {
      profile: "GET /me (supported)",
      ownPosts: "GET /me/threads (supported)",
      publish: "threads_content_publish (supported by Meta, omitted from this local library)",
      savedPosts: "Not supported by documented Meta API endpoints",
      unsaveAction: "Not supported by documented Meta API endpoints",
    },
    localArchive: {
      savedPostsCollection: "Stored locally in SQLite via browser scanner or manual import",
      deleteLocalCopy: "Supported (does not change state on threads.net)",
    },
  };
});
