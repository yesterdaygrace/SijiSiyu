import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanExpiredSessions,
  clearSavedPosts,
  createSession,
  deleteAccount,
  deleteSavedPost,
  deleteSession,
  getAccount,
  getSavedPostsCount,
  hasSession,
  listSavedPosts,
  reconcileSavedPosts,
  saveAccount,
  upsertSavedPosts,
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  assignPostToCollection,
  getPostCollections,
  type SavedPostInput,
} from "../server/utils/db.ts";

test("Database accounts: save, retrieve, and delete", () => {
  deleteAccount();
  assert.equal(getAccount(), null);

  const testAccount = {
    userId: "test_user_1",
    username: "coder",
    profile: { id: "test_user_1", username: "coder", threads_biography: "hello" },
    encryptedToken: { ciphertext: "abc", iv: "123", tag: "456" },
    tokenExpiresAt: Date.now() + 10000,
    updatedAt: Date.now(),
  };

  saveAccount(testAccount);
  const fetched = getAccount();
  assert.ok(fetched !== null);
  assert.equal(fetched.username, "coder");
  assert.equal(fetched.userId, "test_user_1");

  deleteAccount();
  assert.equal(getAccount(), null);
});

test("Database sessions: create, verify, expire, and delete", () => {
  const hash = "session_hash_test_123";
  deleteSession(hash);
  assert.equal(hasSession(hash), false);

  // Active session
  createSession(hash, Date.now() + 60000);
  assert.equal(hasSession(hash), true);

  deleteSession(hash);
  assert.equal(hasSession(hash), false);

  // Expired session
  const expiredHash = "expired_hash_test_456";
  createSession(expiredHash, Date.now() - 1000);
  assert.equal(hasSession(expiredHash), false);
});

test("Database saved posts: upsert, list, search, and delete", () => {
  clearSavedPosts();
  assert.equal(getSavedPostsCount(), 0);

  const posts: SavedPostInput[] = [
    {
      permalink: "https://www.threads.net/@buildwithgo/post/POST1",
      threadId: "POST1",
      username: "buildwithgo",
      text: "Go concurrency patterns with channels and goroutines",
      timestamp: "2026-10-14T10:00:00.000Z",
      mediaType: "TEXT",
      savedAt: "2026-10-14T11:00:00.000Z",
    },
    {
      permalink: "https://www.threads.net/@minimal.product/post/POST2",
      threadId: "POST2",
      username: "minimal.product",
      text: "A good interface knows when to get out of the way",
      timestamp: "2026-10-13T10:00:00.000Z",
      mediaType: "IMAGE",
      savedAt: "2026-10-13T11:00:00.000Z",
    },
  ];

  upsertSavedPosts(posts);
  assert.equal(getSavedPostsCount(), 2);

  // List all
  const list = listSavedPosts({ limit: 10, offset: 0 });
  assert.equal(list.total, 2);
  assert.equal(list.posts.length, 2);

  // Search by keyword
  const searchResults = listSavedPosts({ limit: 10, offset: 0, search: "concurrency" });
  assert.equal(searchResults.total, 1);
  assert.equal(searchResults.posts[0].username, "buildwithgo");

  // Sort by author asc / desc
  const authorAsc = listSavedPosts({ limit: 10, offset: 0, sort: "author_asc" });
  assert.equal(authorAsc.posts[0].username, "buildwithgo");
  assert.equal(authorAsc.posts[1].username, "minimal.product");

  const authorDesc = listSavedPosts({ limit: 10, offset: 0, sort: "author_desc" });
  assert.equal(authorDesc.posts[0].username, "minimal.product");
  assert.equal(authorDesc.posts[1].username, "buildwithgo");

  // Sort by oldest saved
  const oldestSaved = listSavedPosts({ limit: 10, offset: 0, sort: "oldest_saved" });
  assert.equal(oldestSaved.posts[0].username, "minimal.product");

  // Sort by recent saved (default)
  const recentSaved = listSavedPosts({ limit: 10, offset: 0, sort: "recent_saved" });
  assert.equal(recentSaved.posts[0].username, "buildwithgo");

  // Delete single post
  const deleted = deleteSavedPost("https://www.threads.net/@buildwithgo/post/POST1");
  assert.equal(deleted, true);
  assert.equal(getSavedPostsCount(), 1);

  // Reconcile
  reconcileSavedPosts([], "browser-scan", true);
  assert.equal(getSavedPostsCount(), 0);
});

test("Database collections: create, list, assign, and delete", () => {
  // Initial collections exist
  const initial = listCollections();
  assert.ok(initial.length >= 4);

  // Create a new collection
  const created = createCollection({
    name: "AI & ML",
    icon: "lightbulb",
    keywords: "ai,gpt,llm",
  });
  assert.equal(created.name, "AI & ML");
  assert.ok(created.id.includes("ai"));

  // Add a test post
  const testPost = {
    permalink: "https://www.threads.net/@dev/post/AIPOST",
    username: "dev",
    text: "Building an AI agent with prompt engineering",
  };
  upsertSavedPosts([testPost]);

  // Check that post was auto-assigned by keyword
  let postCols = getPostCollections(testPost.permalink);
  assert.ok(postCols.includes(created.id));

  // Filter listSavedPosts by collection
  const colList = listSavedPosts({ limit: 10, offset: 0, collection: created.id });
  assert.equal(colList.total, 1);
  assert.equal(colList.posts[0].permalink, testPost.permalink);

  // Update collection: rename and add new keyword
  const updated = updateCollection(created.id, {
    name: "Artificial Intelligence",
    keywords: "ai,gpt,llm,prompt",
  });
  assert.equal(updated.name, "Artificial Intelligence");
  assert.equal(updated.keywords, "ai,gpt,llm,prompt");

  // Test uncategorized filter
  const unassignedPost = {
    permalink: "https://www.threads.net/@user/post/PLAIN1",
    username: "user",
    text: "Just a random thought with no matching keywords",
  };
  upsertSavedPosts([unassignedPost]);

  const uncategorizedList = listSavedPosts({ limit: 10, offset: 0, collection: "uncategorized" });
  assert.ok(uncategorizedList.posts.some((p) => p.permalink === unassignedPost.permalink));

  // Explicitly remove assignment
  assignPostToCollection(testPost.permalink, created.id, "remove");
  assert.equal(getPostCollections(testPost.permalink).includes(created.id), false);

  // Explicitly add assignment
  assignPostToCollection(testPost.permalink, created.id, "add");
  assert.equal(getPostCollections(testPost.permalink).includes(created.id), true);

  // Delete collection
  const deleted = deleteCollection(created.id);
  assert.equal(deleted, true);

  // Deleting collection should NOT delete the saved post
  assert.equal(getSavedPostsCount(), 2);

  // Clean up
  clearSavedPosts();
});
