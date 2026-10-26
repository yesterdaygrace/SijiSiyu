import { ref } from "vue";

export interface Toast {
  id: string;
  message: string;
  type?: "info" | "success" | "warning";
}

const activeToast = ref<Toast | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

export function useToast() {
  function showToast(message: string, type: "info" | "success" | "warning" = "info", duration = 3000) {
    if (timer) clearTimeout(timer);
    activeToast.value = { id: String(Date.now()), message, type };
    timer = setTimeout(() => {
      activeToast.value = null;
    }, duration);
  }

  function clearToast() {
    if (timer) clearTimeout(timer);
    activeToast.value = null;
  }

  return {
    toast: activeToast,
    showToast,
    clearToast,
  };
}
