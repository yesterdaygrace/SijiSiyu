import test from "node:test";
import assert from "node:assert/strict";
import { cleanThreadsUrl } from "../composables/useClipboard.ts";

test("cleanThreadsUrl: strips tracking parameters from Threads URLs", () => {
  const dirtyUrl = "https://www.threads.net/@zuck/post/DE342345?xmt=AQG0&s=123&utm_source=threads&igshid=xyz";
  const clean = cleanThreadsUrl(dirtyUrl);
  assert.equal(clean, "https://www.threads.net/@zuck/post/DE342345");

  const simpleUrl = "https://www.threads.net/@buildwithgo/post/C-go-patterns-101";
  assert.equal(cleanThreadsUrl(simpleUrl), simpleUrl);
});
