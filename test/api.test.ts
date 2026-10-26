import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { clearSavedPosts, deleteAccount } from "../server/utils/db.ts";

let serverProc: ChildProcess;
const testPort = 3399;
const baseUrl = `http://localhost:${testPort}`;
const testDbPath = path.resolve("data/test.sqlite");

test.before(async () => {
  serverProc = spawn("node", [".output/server/index.mjs"], {
    env: {
      ...process.env,
      PORT: String(testPort),
      DATABASE_PATH: testDbPath,
    },
    stdio: "pipe",
  });

  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // Waiting for server
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw new Error("Nitro server failed to start for tests");
});

test.after(async () => {
  if (serverProc) {
    serverProc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
  }
});

test("API: GET /api/health returns ok", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "ok");
  assert.equal(data.service, "saved-threads-backend");
});

test("API: GET /api/auth/status returns configuration and connection status", async () => {
  deleteAccount();
  const res = await fetch(`${baseUrl}/api/auth/status`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.connected, false);
  assert.equal(data.encryptionConfigured, true);
});

test("API: Full workflow: dev-connect, sync posts, list, delete, disconnect", async () => {
  // 1. Connect local dev account
  const connectRes = await fetch(`${baseUrl}/api/auth/dev-connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "developer_test" }),
  });
  assert.equal(connectRes.status, 200);
  const connectData = await connectRes.json();
  assert.equal(connectData.connected, true);
  assert.equal(connectData.profile.username, "developer_test");

  // Extract session cookie
  const cookieHeader = connectRes.headers.get("set-cookie");
  assert.ok(cookieHeader);
  const sessionCookie = cookieHeader.split(";")[0];

  // 2. Check auth status with session cookie
  const statusRes = await fetch(`${baseUrl}/api/auth/status`, {
    headers: { Cookie: sessionCookie },
  });
  const statusData = await statusRes.json();
  assert.equal(statusData.connected, true);
  assert.equal(statusData.profile.username, "developer_test");

  // 3. Sync posts
  clearSavedPosts();
  const syncRes = await fetch(`${baseUrl}/api/saved-posts/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      completeScan: false,
      posts: [
        {
          permalink: "https://www.threads.net/@developer_test/post/TEST1",
          threadId: "TEST1",
          username: "developer_test",
          text: "Testing saved threads sync endpoint",
          timestamp: "2026-10-15T12:00:00.000Z",
          mediaType: "TEXT",
          savedAt: "2026-10-15T12:05:00.000Z",
        },
      ],
    }),
  });
  assert.equal(syncRes.status, 200);
  const syncData = await syncRes.json();
  assert.equal(syncData.synced, true);
  assert.equal(syncData.imported, 1);

  // 4. List posts
  const listRes = await fetch(`${baseUrl}/api/saved-posts?sort=author_asc`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.meta.total, 1);
  assert.equal(listData.meta.sort, "author_asc");
  assert.equal(listData.data[0].username, "developer_test");

  // 5. Delete post
  const deleteRes = await fetch(
    `${baseUrl}/api/saved-posts?permalink=${encodeURIComponent("https://www.threads.net/@developer_test/post/TEST1")}`,
    {
      method: "DELETE",
      headers: { Cookie: sessionCookie },
    },
  );
  assert.equal(deleteRes.status, 200);
  const deleteData = await deleteRes.json();
  assert.equal(deleteData.deleted, true);
  assert.equal(deleteData.currentCount, 0);

  // 6. Disconnect account
  const disconnectRes = await fetch(`${baseUrl}/api/auth/disconnect`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
  });
  assert.equal(disconnectRes.status, 200);

  // Check disconnected status
  const postDisconnectRes = await fetch(`${baseUrl}/api/auth/status`);
  const postDisconnectData = await postDisconnectRes.json();
  assert.equal(postDisconnectData.connected, false);
});

test("API: SSE /api/events streams real-time post_saved and post_deleted events", async () => {
  // 1. Connect dev account
  const connectRes = await fetch(`${baseUrl}/api/auth/dev-connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "sse_tester" }),
  });
  const cookieHeader = connectRes.headers.get("set-cookie") || "";
  const sessionCookie = cookieHeader.split(";")[0];

  // 2. Open SSE connection
  const sseController = new AbortController();
  const sseRes = await fetch(`${baseUrl}/api/events`, {
    signal: sseController.signal,
  });
  assert.equal(sseRes.status, 200);
  assert.equal(sseRes.headers.get("content-type"), "text/event-stream");

  const reader = sseRes.body?.getReader();
  assert.ok(reader);
  const decoder = new TextDecoder();

  // Helper to read until a specific event appears in the stream
  async function waitForEvent(eventName: string): Promise<string> {
    let accumulated = "";
    while (true) {
      const { value, done } = await reader!.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      if (accumulated.includes(`event: ${eventName}`)) {
        return accumulated;
      }
    }
    return accumulated;
  }

  // Expect initial connected event
  const connectedChunk = await waitForEvent("connected");
  assert.ok(connectedChunk.includes("event: connected"));

  // 3. Trigger sync and verify post_saved event is received
  const syncPromise = fetch(`${baseUrl}/api/saved-posts/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      completeScan: false,
      posts: [
        {
          permalink: "https://www.threads.net/@sse_tester/post/SSE_TEST_1",
          threadId: "SSE_TEST_1",
          username: "sse_tester",
          text: "Real-time streaming test post",
          timestamp: "2026-10-18T10:00:00.000Z",
          mediaType: "TEXT",
          savedAt: "2026-10-18T10:00:00.000Z",
        },
      ],
    }),
  });

  const [_, savedChunk] = await Promise.all([syncPromise, waitForEvent("post_saved")]);
  assert.ok(savedChunk.includes("event: post_saved"));
  assert.ok(savedChunk.includes("SSE_TEST_1"));

  // 4. Trigger delete and verify post_deleted event is received
  const deletePromise = fetch(
    `${baseUrl}/api/saved-posts?permalink=${encodeURIComponent("https://www.threads.net/@sse_tester/post/SSE_TEST_1")}`,
    {
      method: "DELETE",
      headers: { Cookie: sessionCookie },
    },
  );

  const [__, deletedChunk] = await Promise.all([deletePromise, waitForEvent("post_deleted")]);
  assert.ok(deletedChunk.includes("event: post_deleted"));
  assert.ok(deletedChunk.includes("SSE_TEST_1"));

  // Clean up
  sseController.abort();
  deleteAccount();
});

test("API: Collections CRUD and assignment", async () => {
  // 1. GET /api/collections
  const getRes = await fetch(`${baseUrl}/api/collections`);
  assert.equal(getRes.status, 200);
  const data = await getRes.json();
  assert.ok(Array.isArray(data.collections));
  assert.ok(data.collections.some((c: any) => c.id === "all"));

  // 2. POST /api/collections (create)
  const createRes = await fetch(`${baseUrl}/api/collections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "API Test Collection",
      keywords: "api,testing",
      icon: "code",
    }),
  });
  assert.equal(createRes.status, 200);
  const createData = await createRes.json();
  assert.equal(createData.status, "ok");
  assert.equal(createData.collection.name, "API Test Collection");
  const newColId = createData.collection.id;

  // 3. POST /api/saved-posts/sync (insert post first)
  await fetch(`${baseUrl}/api/saved-posts/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      posts: [
        {
          permalink: "https://www.threads.net/@api_test/post/P1",
          username: "api_test",
          text: "Testing collection assignment",
        },
      ],
    }),
  });

  // 4. POST /api/collections/assign (assign post)
  const assignRes = await fetch(`${baseUrl}/api/collections/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      permalink: "https://www.threads.net/@api_test/post/P1",
      collectionId: newColId,
      action: "add",
    }),
  });
  assert.equal(assignRes.status, 200);
  const assignData = await assignRes.json();
  assert.equal(assignData.status, "ok");
  assert.ok(assignData.collections.includes(newColId));

  // 5. PUT /api/collections (update name & keywords)
  const updateRes = await fetch(`${baseUrl}/api/collections`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: newColId,
      name: "Updated API Collection",
      keywords: "api,testing,updated",
    }),
  });
  assert.equal(updateRes.status, 200);
  const updateData = await updateRes.json();
  assert.equal(updateData.status, "ok");
  assert.equal(updateData.collection.name, "Updated API Collection");

  // 6. DELETE /api/collections (delete)
  const delRes = await fetch(`${baseUrl}/api/collections?id=${newColId}`, {
    method: "DELETE",
  });
  assert.equal(delRes.status, 200);
  const delData = await delRes.json();
  assert.equal(delData.status, "ok");
  assert.equal(delData.deleted, true);
});
