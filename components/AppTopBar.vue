<script setup lang="ts">
import { computed } from "vue";
import { usePosts } from "~/composables/usePosts";
import { useCollections } from "~/composables/useCollections";
import { useAuth } from "~/composables/useAuth";
import { useSSE } from "~/composables/useSSE";

const emit = defineEmits<{
  (e: "open-sync"): void;
}>();

const { activeFilter, filteredPosts, fetchPosts, isLoading } = usePosts();
const { collections } = useCollections();
const { authState } = useAuth();
const { isLive, syncState } = useSSE();

const activeFilterTitle = computed(() => {
  if (activeFilter.value === "all") return "All Saved";
  if (activeFilter.value === "uncategorized") return "Uncategorized";
  const found = collections.value.find((c) => c.id === activeFilter.value);
  return found?.name || activeFilter.value;
});
</script>

<template>
  <header class="flex items-center justify-between gap-4 mb-8">
    <!-- Breadcrumb -->
    <div class="flex items-center gap-2 text-xs text-muted">
      <span>Library</span>
      <span>/</span>
      <span class="text-white font-semibold flex items-center gap-1.5">
        <span>{{ activeFilterTitle }}</span>
        <span class="text-[10px] text-muted font-mono font-normal">({{ filteredPosts.length }})</span>
      </span>
    </div>

    <!-- Right Controls: Status Badge, Sync Button & Refresh -->
    <div class="flex items-center gap-2.5">
      <!-- Sync Button -->
      <button
        @click="emit('open-sync')"
        class="px-3.5 py-1.5 rounded-full border text-xs font-bold flex items-center gap-2 transition-all shadow-sm"
        :class="syncState.isRunning 
          ? 'bg-white text-black border-white shadow-[0_0_12px_rgba(255,255,255,0.4)]' 
          : 'bg-surface hover:bg-surface-hover border-line hover:border-line-strong text-white'"
      >
        <span 
          v-if="syncState.isRunning" 
          class="w-2 h-2 rounded-full bg-black animate-ping"
        />
        <svg 
          v-else
          class="w-3.5 h-3.5 stroke-current fill-none" 
          viewBox="0 0 24 24" 
          stroke-width="2.2" 
          stroke-linecap="round" 
          stroke-linejoin="round"
        >
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
          <path d="M16 16h5v5"/>
        </svg>
        <span>{{ syncState.isRunning ? `Syncing (${syncState.scannedCount || '...'})` : 'Sync Threads' }}</span>
      </button>

      <!-- Live Sync Pill -->
      <div class="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border border-line bg-surface text-xs font-semibold text-body">
        <span 
          class="w-1.5 h-1.5 rounded-full" 
          :class="isLive ? 'bg-white shadow-[0_0_6px_#ffffff] animate-pulse-mono' : 'border border-muted bg-transparent'"
        />
        <span>{{ isLive ? 'Live SSE' : 'Offline' }}</span>
      </div>

      <!-- Account Badge -->
      <div v-if="authState.connected" class="flex items-center gap-2 px-2.5 py-1 rounded-full border border-line bg-surface text-xs text-body font-semibold">
        <div class="w-5 h-5 rounded-full bg-white text-black text-[10px] font-extrabold flex items-center justify-center">
          {{ (authState.username || 'U').slice(0, 2).toUpperCase() }}
        </div>
        <span class="text-white">@{{ authState.username }}</span>
      </div>

      <!-- Refresh Button -->
      <button 
        @click="fetchPosts"
        :disabled="isLoading"
        title="Refresh library"
        class="w-8 h-8 rounded-xl border border-line bg-surface hover:border-line-strong hover:bg-surface-hover flex items-center justify-center text-body hover:text-white transition-colors"
      >
        <svg 
          class="w-4 h-4 stroke-current fill-none transition-transform" 
          :class="{ 'animate-spin': isLoading }"
          viewBox="0 0 24 24" 
          stroke-width="1.8" 
          stroke-linecap="round" 
          stroke-linejoin="round"
        >
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
          <path d="M16 16h5v5"/>
        </svg>
      </button>
    </div>
  </header>
</template>
