<script setup lang="ts">
import { useSSE } from "~/composables/useSSE";

const emit = defineEmits<{
  (e: "open-add"): void;
  (e: "open-sync"): void;
}>();

const { syncState } = useSSE();
</script>

<template>
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
    <div>
      <div class="text-[10px] font-extrabold uppercase tracking-[0.18em] text-subtle mb-2">
        Threads Bookmark Archive
      </div>
      <h1 class="font-display font-extrabold text-3xl md:text-4xl text-white tracking-tight leading-tight">
        Your Threads library
      </h1>
      <p class="text-body text-xs md:text-sm mt-2 leading-relaxed max-w-xl">
        Archived threads, bookmarks, and saved references stored locally in SQLite with real-time SSE live updates.
      </p>
    </div>

    <!-- Action Buttons -->
    <div class="flex flex-wrap items-center gap-2.5 shrink-0">
      <button
        @click="emit('open-add')"
        class="px-3.5 py-2 rounded-xl border border-line bg-surface hover:bg-surface-hover hover:border-line-strong text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
      >
        <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>Add Post</span>
      </button>

      <!-- Primary Sync Threads Action Button -->
      <button
        @click="emit('open-sync')"
        class="px-4 py-2 rounded-xl bg-white text-black hover:bg-[#e5e5e5] text-xs font-extrabold flex items-center gap-1.5 transition-colors shadow-sm"
        :class="{ 'animate-pulse': syncState.isRunning }"
      >
        <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
          <path d="M16 16h5v5"/>
        </svg>
        <span>{{ syncState.isRunning ? `Syncing (${syncState.scannedCount || '...'})` : 'Sync Threads' }}</span>
      </button>
    </div>
  </div>
</template>
