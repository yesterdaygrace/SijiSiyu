# SijiSiyu — Threads library + backend

A local-first Threads library UI plus a Node.js/TypeScript backend that uses Meta's **official Threads API** for OAuth, profile reads, and the connected account's own posts. SQLite stores the connected account's encrypted access token, server-side sessions, and any saved-post records imported by a future browser scanner.

> **Important API limitation:** the documented official Threads API does not expose the account's Saved/bookmarks collection and does not provide an endpoint to unsave somebody else's post. This backend does not invent either endpoint. Reading the Saved page and performing a verified Unsave action require a separate Chromium extension/content script that operates through the logged-in Threads website. That scanner is not included in this build yet.

## Official API references

- [Meta Threads API collection](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api)
- [Meta Threads developer documentation](https://developers.facebook.com/docs/threads/)

The collection documents OAuth, profile/media retrieval, publishing, replies, and insights. This project only requests the `threads_basic` permission for profile and own-post retrieval; the saved-bookmark UI is not documented as an API capability in those references.

## Stack

- **Nuxt** + **Vue 3** (Composition API, `<script setup>`, TypeScript, SSR)
- **Nitro Engine** (Unified server routes for SQLite, Meta OAuth, and Server-Sent Events)
- **Tailwind CSS** (Pure Black & White OLED theme: `#000000`, `#ffffff`, `#141414`, `#222222`)
- **SQLite** (`better-sqlite3` with WAL mode & atomic transactions)
- **Real-Time Live Sync** (Server-Sent Events via `/api/events` with instant reactive UI updates)
- **Meta Threads OAuth 2.0** and Graph API (`graph.threads.net`)
- **AES-256-GCM encryption** for access tokens at rest
- **HttpOnly/SameSite session cookies**; server stores only a SHA-256 hash of each session token

## Quick Start

### 1. One-Command Launch (Recommended)
You can launch Saved directly using the root startup script or the global CLI:

```bash
# Starts server and automatically opens http://localhost:3000 in your browser
./start.sh
```

Or install the global terminal shortcut:
```bash
./start.sh install
# Now you can launch from any directory just by typing:
saved
```

### 2. Available Startup Modes & Commands

| Command | Action |
|---|---|
| `./start.sh` or `saved` | Interactive dev mode with live reload + auto opens browser |
| `./start.sh sync` or `saved sync` | Sync saved posts directly from your Threads account in Brave |
| `saved sync --full` | Full lifetime history scan of all saved posts |
| `./start.sh daemon` or `saved daemon` | Runs the server in the background (detached) |
| `./start.sh status` or `saved status` | Checks server health, active port, and saved post count |
| `./start.sh logs` or `saved logs` | Live stream server logs |
| `./start.sh stop` or `saved stop` | Cleanly stops the running background server |
| `./start.sh restart` or `saved restart` | Restarts the background server |
| `./start.sh service` | Installs an auto-starting systemd user service on Linux |
| `npm run dev` | Nuxt development server with live reload |
| `npm start` | Builds Nuxt and runs the production server |

Add `-n` or `--no-open` to any command (e.g., `./start.sh --no-open` or `saved daemon --no-open`) to start without opening the browser.

---

## Setup & Environment

```bash
npm install
cp .env.example .env
openssl rand -hex 32
```

Without Meta credentials, the UI remains in preview mode and the backend still starts. OAuth only becomes available after configuring a Meta app.

## Configure Meta Threads OAuth

1. Create an app in Meta for Developers using the Threads use case.
2. Copy the Threads App ID and App Secret into `THREADS_APP_ID` and `THREADS_APP_SECRET` in `.env`.
3. Register this exact redirect URI in the Meta app: `http://localhost:3000/api/auth/threads/callback`.
4. Keep `APP_BASE_URL=http://localhost:3000` and `THREADS_REDIRECT_URI=http://localhost:3000/api/auth/threads/callback` for local development.
5. Request the `threads_basic` permission for the implemented profile/own-post reads. Use a Meta app role/tester during development and complete Meta's review requirements if the app will be used by other people.
6. Restart `npm run dev`, open the UI, and select **Connect Threads**.

Do not expose this development server to the public internet. For public deployment, use HTTPS, a private database volume, a strong token encryption key, restricted origins, and a reviewed OAuth/app configuration.

## API routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health/configuration status without secrets |
| `GET` | `/api/auth/status` | Current browser session and connection status |
| `POST` | `/api/auth/dev-connect` | Quick local connection without requiring Meta developer credentials |
| `GET` | `/api/auth/threads/start` | Start official Threads OAuth |
| `GET` | `/api/auth/threads/callback` | Validate OAuth state, exchange/refresh token, fetch profile, save encrypted token |
| `POST` | `/api/auth/disconnect` | Remove local account/token and sessions (does not change Threads saved posts) |
| `GET` | `/api/threads/profile` | Read the connected account profile from Threads API |
| `GET` | `/api/threads/posts?limit=50&after=...` | Paginate posts authored by the connected account |
| `POST` | `/api/threads/refresh` | Refresh a long-lived access token |
| `GET` | `/api/threads/capabilities` | Explicit capability boundary for official API vs browser scanner |
| `GET` | `/api/saved-posts?limit=100&offset=0&search=...` | Read the local archive imported by the scanner |
| `POST` | `/api/saved-posts/sync` | Import scanner results; only a completed scan may reconcile missing records |
| `DELETE` | `/api/saved-posts?permalink=...` | Remove a post from the local database archive |
| `GET` | `/api/collections` | List all collections with real-time post counts |
| `POST` | `/api/collections` | Create a new collection (name, icon, optional keywords for auto-tagging) |
| `DELETE` | `/api/collections?id=...` | Delete a collection (posts remain safely archived in library) |
| `POST` | `/api/collections/assign` | Add or remove a post to/from a collection |

`/api/threads/posts` intentionally returns **your own authored posts**, not your saved posts. Saved-post ingestion is a separate route because Meta's documented API does not supply that collection.

## Browser Scanner Extension

A Chromium extension (compatible with Brave, Chrome, and Edge) is included in the `extension/` directory:
1. Open `brave://extensions` or `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder in this repo.
4. Navigate to [threads.net/saved](https://www.threads.net/saved) while logged into Threads.
5. Click the **Saved Scanner** extension icon to scan visible posts or auto-scroll through the feed.
6. Click **Sync to Saved App** to import directly into your local database!

### In-App Import & 1-Click Bookmarklet
In addition to the extension, the Saved web UI includes:
- **Populate Sample Posts**: Instantly populate the SQLite database with 14 curated tech/design posts.
- **Import JSON File**: Import any JSON file containing saved posts.
- **1-Click Bookmarklet**: Copy a console snippet to run on `threads.net/saved` without installing an extension.

## Security notes

- The Threads access token is encrypted at rest using AES-256-GCM. It is never returned to the frontend.
- Session cookies are HttpOnly and SameSite=Lax; SQLite stores only the SHA-256 hash of session tokens.
- OAuth state is validated to mitigate login CSRF.
- Request payloads for scanner imports are limited and restricted to `threads.net` / `threads.com` permalinks.
- The API is intended for local personal use. Do not expose it publicly as-is.
- Disconnect removes the local encrypted credential and sessions, but cannot revoke the token at Meta by itself.

## UI behavior

- Minimalist list is the default; grid mode shows 3 × 3 cards (nine per page).
- When connected, the UI displays real posts from your local SQLite database archive.
- **Dynamic Collections**: Create custom collections with optional auto-tagging keywords, or delete existing collections with 1 click (saved posts are never deleted).
- **Post Organization**: Assign/remove posts to/from collections directly from post cards or list rows.
- **Clean Threads Copy Link**: Each post features a 1-click "Copy Link" action that strips tracking parameters (`?s=...`, `?utm_...`) and displays a 2-second inline `✓ Copied!` confirmation.
- Category filters (Development, Design, Articles & reads, Ideas) auto-categorize saved posts based on content.
- Unsave removes the post from your local database with instant feedback.
- Preview mode can still be opened by opening `index.html` directly, but backend functions require the server at `http://localhost:3000`.

## Verify

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

## License

[MIT](LICENSE) © 2026 vinkanaka

