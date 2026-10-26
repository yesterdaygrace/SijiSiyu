import { defineEventHandler } from "h3";
import { registerSSEClient, unregisterSSEClient } from "~/server/utils/sse";
import { getAccount, getSavedPostsCount } from "~/server/utils/db";

export default defineEventHandler((event) => {
  const res = event.node.res;
  const req = event.node.req;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const account = getAccount();
  res.write(
    `event: connected\ndata: ${JSON.stringify({
      time: Date.now(),
      connected: Boolean(account),
      profile: account?.profile ?? null,
      savedPostCount: getSavedPostsCount(),
    })}\n\n`,
  );

  registerSSEClient(res);

  req.on("close", () => {
    unregisterSSEClient(res);
  });

  return new Promise(() => {});
});
