import { ref } from "vue";
import { useToast } from "./useToast";

export interface AuthState {
  connected: boolean;
  sessionActive: boolean;
  oauthConfigured: boolean;
  encryptionConfigured: boolean;
  username: string | null;
  profile: any | null;
  tokenExpiresAt: number | null;
  savedPostCount: number;
}

const authState = ref<AuthState>({
  connected: false,
  sessionActive: false,
  oauthConfigured: false,
  encryptionConfigured: false,
  username: null,
  profile: null,
  tokenExpiresAt: null,
  savedPostCount: 0,
});

const isChecking = ref(false);

export function useAuth() {
  const { showToast } = useToast();

  async function fetchStatus() {
    isChecking.value = true;
    try {
      const data = await $fetch<AuthState>("/api/auth/status");
      authState.value = data;
    } catch (err: any) {
      console.warn("Could not fetch auth status:", err?.message || err);
    } finally {
      isChecking.value = false;
    }
  }

  async function devConnect(username = "threads_user") {
    try {
      const res = await $fetch<any>("/api/auth/dev-connect", {
        method: "POST",
        body: { username },
      });
      await fetchStatus();
      showToast(`Connected as @${res.username} (dev mode)`, "success");
      return res;
    } catch (err: any) {
      showToast("Dev connect failed: " + (err?.data?.message || err.message), "warning");
      throw err;
    }
  }

  async function disconnect() {
    try {
      await $fetch("/api/auth/disconnect", { method: "POST" });
      await fetchStatus();
      showToast("Account disconnected", "info");
    } catch (err: any) {
      showToast("Disconnect failed: " + (err?.data?.message || err.message), "warning");
    }
  }

  return {
    authState,
    isChecking,
    fetchStatus,
    devConnect,
    disconnect,
  };
}
