# Saved — Real-Time Threads Extension

A lightweight Chromium (Brave, Chrome, Edge) extension that connects your live Threads browsing session to your local **Saved** library in real time.

---

## What It Does

1. **Zero-Click Real-Time Sync**:
   - As you browse `threads.net`, whenever you click **"Save"** (or the bookmark ribbon icon / dropdown option) on any post, the extension intercepts it and immediately streams it to your local Saved app (`http://localhost:3000`).
   - Displays an in-page confirmation toast: *"Saved @username's post to library ✓"*.
   - The open Saved app updates instantly via **Server-Sent Events (SSE)** without refreshing.

2. **Offline Queue & Resiliency**:
   - If you bookmark a post while `npm run dev` is paused or offline, the extension automatically buffers it in `chrome.storage.local`.
   - As soon as the Saved backend starts up, the background worker auto-flushes the queue.

3. **Auto-Scan on `/saved` Feed**:
   - When browsing [threads.net/saved](https://www.threads.net/saved), a MutationObserver automatically captures and syncs newly loaded bookmarks as you scroll.

4. **Manual Bulk Scanner**:
   - Open the extension popup to run an auto-scrolling scan across your entire history or download a raw JSON backup.

---

## How to Install / Reload (Brave, Chrome, Edge)

1. Open your browser and navigate to:
   - **Brave:** `brave://extensions`
   - **Chrome:** `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner).
3. If previously installed, click the **Reload icon (↻)** on the **Saved** extension card.
   - If installing for the first time, click **Load unpacked** and select this directory:
     `/home/vinkanaka/Documents/Github/saved-threads-ui/extension`
4. Pin the **Saved** extension icon to your browser toolbar.

---

## Testing Real-Time Sync

1. Make sure the local Saved server is running:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:3000` — the topbar will display **`• Live sync active`**.
3. Open `threads.net` in any tab while logged into your Threads account.
4. Click **Save** on any post:
   - You will see a toast on Threads: *"Saved @username's post to library ✓"*.
   - Switch back to `http://localhost:3000`: the post will be rendered right at the top of your library with updated counters in real time!
