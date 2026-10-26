<script setup lang="ts">
import { usePosts } from "~/composables/usePosts";

const { currentPage, totalPages, filteredPosts, itemsPerPage, setPage } = usePosts();

const startItem = computed(() => (currentPage.value - 1) * itemsPerPage.value + 1);
const endItem = computed(() => Math.min(currentPage.value * itemsPerPage.value, filteredPosts.value.length));
</script>

<template>
  <div v-if="filteredPosts.length > 0" class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-line mt-8 text-xs text-muted">
    <div>
      Showing <span class="text-white font-semibold">{{ startItem }}</span>–<span class="text-white font-semibold">{{ endItem }}</span> of <span class="text-white font-semibold">{{ filteredPosts.length }}</span> saved posts
    </div>

    <!-- Pagination buttons -->
    <div v-if="totalPages > 1" class="flex items-center gap-1.5">
      <button
        @click="setPage(currentPage - 1)"
        :disabled="currentPage <= 1"
        class="px-3 py-1.5 rounded-lg border border-line bg-surface hover:border-line-strong hover:bg-surface-hover text-white disabled:opacity-40 disabled:pointer-events-none transition-colors"
      >
        Previous
      </button>

      <div class="px-3 py-1.5 rounded-lg border border-line bg-surface-2 font-mono text-white text-xs">
        {{ currentPage }} / {{ totalPages }}
      </div>

      <button
        @click="setPage(currentPage + 1)"
        :disabled="currentPage >= totalPages"
        class="px-3 py-1.5 rounded-lg border border-line bg-surface hover:border-line-strong hover:bg-surface-hover text-white disabled:opacity-40 disabled:pointer-events-none transition-colors"
      >
        Next
      </button>
    </div>
  </div>
</template>
