<script setup lang="ts">
import { ref } from "vue";
import { usePosts } from "~/composables/usePosts";
import { useToast } from "~/composables/useToast";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { syncPosts } = usePosts();
const { showToast } = useToast();

const permalink = ref("");
const username = ref("");
const text = ref("");
const isSubmitting = ref(false);

async function handleSubmit() {
  if (!permalink.value.trim()) {
    showToast("Permalink is required", "warning");
    return;
  }
  if (!text.value.trim()) {
    showToast("Post content is required", "warning");
    return;
  }

  // Format username
  let cleanUser = username.value.trim().replace(/^@/, "");
  if (!cleanUser) {
    // Attempt extract from URL: https://www.threads.net/@username/post/...
    const match = permalink.value.match(/@([^/]+)/);
    cleanUser = match ? match[1] : "threads_user";
  }

  isSubmitting.value = true;
  try {
    await syncPosts(
      [
        {
          permalink: permalink.value.trim(),
          username: cleanUser,
          text: text.value.trim(),
          timestamp: new Date().toISOString(),
          savedAt: new Date().toISOString(),
        },
      ],
      false,
      "manual-entry",
    );
    // Reset
    permalink.value = "";
    username.value = "";
    text.value = "";
    emit("close");
  } catch (err: any) {
    // Toast handled in syncPosts
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div 
    v-if="isOpen" 
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-lg bg-surface border border-line-strong rounded-2xl p-6 shadow-2xl space-y-5 animate-slide-in">
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-line">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-white text-black flex items-center justify-center">
            <svg class="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <h2 class="font-display font-bold text-base text-white">Save Thread Manually</h2>
        </div>
        <button @click="emit('close')" class="text-muted hover:text-white p-1 rounded-lg">
          <svg class="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Form Inputs -->
      <form @submit.prevent="handleSubmit" class="space-y-4 text-xs">
        <div>
          <label class="block text-muted font-semibold mb-1.5 uppercase tracking-wider text-[10px]">
            Thread Permalink *
          </label>
          <input
            v-model="permalink"
            type="url"
            required
            placeholder="https://www.threads.net/@user/post/xyz"
            class="w-full bg-oled border border-line rounded-xl px-3.5 py-2.5 text-white placeholder-muted focus:outline-none focus:border-white transition-colors"
          />
        </div>

        <div>
          <label class="block text-muted font-semibold mb-1.5 uppercase tracking-wider text-[10px]">
            Author Username
          </label>
          <input
            v-model="username"
            type="text"
            placeholder="@buildwithgo (optional, extracted from URL if blank)"
            class="w-full bg-oled border border-line rounded-xl px-3.5 py-2.5 text-white placeholder-muted focus:outline-none focus:border-white transition-colors"
          />
        </div>

        <div>
          <label class="block text-muted font-semibold mb-1.5 uppercase tracking-wider text-[10px]">
            Content / Notes *
          </label>
          <textarea
            v-model="text"
            rows="4"
            required
            placeholder="Key insights, quotes, or notes from this thread..."
            class="w-full bg-oled border border-line rounded-xl px-3.5 py-2.5 text-white placeholder-muted focus:outline-none focus:border-white transition-colors resize-none"
          />
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
          <button
            type="button"
            @click="emit('close')"
            class="px-4 py-2 rounded-xl border border-line hover:border-line-strong text-muted hover:text-white font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="px-5 py-2 rounded-xl bg-white text-black font-extrabold hover:bg-[#e5e5e5] transition-colors disabled:opacity-50"
          >
            {{ isSubmitting ? 'Saving...' : 'Save to Library' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
