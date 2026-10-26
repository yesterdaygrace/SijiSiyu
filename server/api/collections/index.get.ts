import { defineEventHandler, setResponseHeader } from "h3";
import { listCollections, getSavedPostsCount } from "~/server/utils/db";

export default defineEventHandler((event) => {
  setResponseHeader(event, "Cache-Control", "no-cache, no-store, must-revalidate");
  const collections = listCollections();
  const totalSaved = getSavedPostsCount();

  return {
    collections: [
      {
        id: "all",
        name: "All Saved",
        icon: "bookmark",
        color: "#ffffff",
        keywords: "",
        isDefault: true,
        createdAt: 0,
        postCount: totalSaved,
      },
      ...collections,
    ],
  };
});
