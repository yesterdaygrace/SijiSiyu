# AGENTS.md (saved-threads-ui)

Project-level context and operational standards for AI coding agents working on `saved-threads-ui`. This file overrides global defaults where project-specific conventions apply.

---

## Project Context

```text
Build:           npm run build
Test:            npm test
Single test:     DATABASE_PATH=data/test.sqlite tsx --test test/api.test.ts
Lint / format:   npx prettier --write .
Run locally:     ./start.sh run   (or 'saved run', 'npm run dev' on http://localhost:3000)
Sync account:    ./start.sh sync  (or 'saved sync', 'saved sync --full')
Layout:
  - app.vue, pages/, components/, composables/: Nuxt 4 frontend (Tailwind v4, Vue 3)
  - server/api/, server/utils/: Nitro backend API handlers & SSE streams
  - src/db.ts, data/: SQLite schema, migration, and runtime database
  - scripts/: auto-sync-threads.mjs (Brave CDP cookie & bookmark ingestion)
  - start.sh: CLI orchestration daemon & management tool
Gotchas:
  - Pure black & white OLED palette (#000000, #ffffff, #141414, #222222); no saturated colors.
  - SQLite uses WAL mode. Never delete database records unless explicitly instructed.
  - Collections: Users can create and delete collections. Deleting a collection cascades associations but NEVER deletes saved posts.
  - Copy Link: Always copies clean Threads URL stripped of tracking parameters with 2-second inline visual confirmation.
  - Automated sync uses Brave CDP on Linux; cookies are extracted via secret-tool decryption.
  - When writing API routes in server/api/, always use defineEventHandler and createError.
```

---

## Engineering Rules for this Repository

1. **Additive Ingestion**: Saved posts imported from Threads are permanent bookmarks. Scrapers and sync operations must never prune or truncate the database.
2. **Dual-Mode Sync Execution**:
   - When web server is running on port 3000, sync requests go via `POST /api/sync/run` with real-time SSE progress streaming.
   - When server is offline, CLI sync operations connect directly to SQLite via `better-sqlite3`.
3. **Verification**: Always run `npm test` before claiming any feature or bug fix is complete.
