import { ref } from "vue";
import { usePosts, type SavedPost, detectCategory } from "./usePosts";
import { useAuth } from "./useAuth";
import { useToast } from "./useToast";

export interface LiveSyncState {
  isRunning: boolean;
  step: string;
  message: string;
  scannedCount: number;
  importedCount: number;
  error: string | null;
  requiresAuth: boolean;
}

const syncState = ref<LiveSyncState>({
  isRunning: false,
  step: "idle",
  message: "Idle",
  scannedCount: 0,
  importedCount: 0,
  error: null,
  requiresAuth: false,
});

const isLive = ref(false);
let eventSource: EventSource | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

export function useSSE() {
  const { posts, totalCount, fetchPosts } = usePosts();
  const { fetchStatus } = useAuth();
  const { showToast } = useToast();

  function connect() {
    if (typeof window === "undefined") return;
    if (eventSource) {
      eventSource.close();
    }

    try {
      eventSource = new EventSource("/api/events");

      eventSource.addEventListener("open", () => {
        isLive.value = true;
      });

      eventSource.addEventListener("connected", () => {
        isLive.value = true;
      });

      eventSource.addEventListener("sync_event", (e) => {
        try {
          const data = JSON.parse(e.data);
          syncState.value = {
            isRunning: Boolean(data.isRunning),
            step: data.step || syncState.value.step,
            message: data.message || syncState.value.message,
            scannedCount: data.scannedCount ?? syncState.value.scannedCount,
            importedCount: data.importedCount ?? syncState.value.importedCount,
            error: data.error || null,
            requiresAuth: Boolean(data.requiresAuth),
          };

          if (data.step === "completed") {
            fetchPosts();
            showToast(`🎉 Sync complete: ${data.importedCount || 0} posts imported`, "success");
          } else if (data.step === "error" && data.error) {
            showToast(`Sync error: ${data.error}`, "warning");
          }
        } catch (err) {
          console.error("Error parsing sync_event:", err);
        }
      });

      eventSource.addEventListener("post_saved", (e) => {
        try {
          const postData = JSON.parse(e.data);
          // If bulk posts array
          const incomingItems = Array.isArray(postData.posts) ? postData.posts : [postData];

          for (const item of incomingItems) {
            if (!item.permalink) continue;
            const cat = detectCategory(item.text, item.username);
            const newPost: SavedPost = {
              permalink: item.permalink,
              username: item.username,
              text: item.text,
              timestamp: item.timestamp || new Date().toISOString(),
              savedAt: item.savedAt || new Date().toISOString(),
              category: cat.category,
              filter: cat.filter,
              isNew: true,
            };

            const existingIndex = posts.value.findIndex((p) => p.permalink === newPost.permalink);
            if (existingIndex >= 0) {
              posts.value[existingIndex] = { ...posts.value[existingIndex], ...newPost };
            } else {
              posts.value.unshift(newPost);
              totalCount.value++;
            }
          }

          if (incomingItems.length === 1) {
            showToast(`⚡ Live sync: Saved post from @${incomingItems[0].username || "thread"}`, "success");
          }
        } catch (err) {
          console.error("Error processing post_saved SSE:", err);
        }
      });

      eventSource.addEventListener("post_deleted", (e) => {
        try {
          const { permalink } = JSON.parse(e.data);
          posts.value = posts.value.filter((p) => p.permalink !== permalink);
          totalCount.value = Math.max(0, totalCount.value - 1);
          showToast("⚡ Live sync: Post removed", "info");
        } catch (err) {
          console.error("Error processing post_deleted SSE:", err);
        }
      });

      eventSource.addEventListener("posts_synced", (e) => {
        try {
          const data = JSON.parse(e.data);
          fetchPosts();
          showToast(`⚡ Synced ${data.importedCount} posts from Threads`, "success");
        } catch (err) {
          console.error("Error processing posts_synced SSE:", err);
        }
      });

      eventSource.addEventListener("account_connected", () => {
        fetchStatus();
        showToast("Account connected", "success");
      });

      eventSource.addEventListener("account_disconnected", () => {
        fetchStatus();
        showToast("Account disconnected", "info");
      });

      eventSource.onerror = () => {
        isLive.value = false;
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            connect();
          }, 3000);
        }
      };
    } catch (err) {
      console.warn("EventSource failed to initialize:", err);
      isLive.value = false;
    }
  }

  function disconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    isLive.value = false;
  }

  async function triggerSync(fullScan = false) {
    try {
      syncState.value.isRunning = true;
      syncState.value.step = "init";
      syncState.value.message = "Initializing Threads sync engine...";
      syncState.value.error = null;
      syncState.value.requiresAuth = false;
      await $fetch("/api/sync/run", {
        method: "POST",
        body: { fullScan },
      });
    } catch (err: any) {
      syncState.value.isRunning = false;
      syncState.value.error = err?.data?.statusMessage || err?.message || "Failed to start sync";
      showToast(syncState.value.error!, "warning");
      throw err;
    }
  }

  async function cancelSync() {
    try {
      await $fetch("/api/sync/cancel", { method: "POST" });
      syncState.value.isRunning = false;
      syncState.value.step = "cancelled";
      syncState.value.message = "Sync cancelled.";
    } catch {}
  }

  return {
    isLive,
    syncState,
    connect,
    disconnect,
    triggerSync,
    cancelSync,
  };
}
