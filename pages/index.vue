<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { usePosts } from "~/composables/usePosts";
import { useAuth } from "~/composables/useAuth";
import { useSSE } from "~/composables/useSSE";

const {
  paginatedPosts,
  filteredPosts,
  isLoading,
  fetchPosts,
  populateSamplePosts,
  viewMode,
  hasActiveFilters,
  resetFilters,
} = usePosts();
const { fetchStatus } = useAuth();
const { connect, disconnect } = useSSE();

const isAddModalOpen = ref(false);
const isSyncModalOpen = ref(false);

onMounted(async () => {
  await fetchStatus();
  await fetchPosts();
  // If the library is brand new and empty, populate initial sample posts
  if (filteredPosts.value.length === 0) {
    await populateSamplePosts();
  }
  connect();
});

onUnmounted(() => {
  disconnect();
});
</script>

<template>
  <div class="min-h-screen bg-oled text-white flex">
    <!-- Desktop Sidebar -->
    <AppSidebar @open-sync="isSyncModalOpen = true" />

    <!-- Main Content Area -->
    <main class="flex-1 min-w-0 p-6 md:p-10 max-w-7xl mx-auto flex flex-col">
      <!-- Top Navigation & Status -->
      <AppTopBar @open-sync="isSyncModalOpen = true" />

      <!-- Page Heading & Actions -->
      <PageHeader 
        @open-add="isAddModalOpen = true"
        @open-sync="isSyncModalOpen = true"
      />

      <!-- Toolbar: Search, Sort & View Mode Switcher -->
      <PostToolbar />

      <!-- Post Feed -->
      <div class="flex-1">
        <!-- Loading State -->
        <div v-if="isLoading && filteredPosts.length === 0" class="space-y-4 py-8">
          <div v-for="i in 3" :key="i" class="p-6 rounded-2xl bg-surface border border-line animate-pulse space-y-3">
            <div class="w-1/4 h-3 bg-line-strong rounded" />
            <div class="w-3/4 h-4 bg-line rounded" />
            <div class="w-1/2 h-3 bg-line rounded" />
          </div>
        </div>

        <!-- Empty State -->
        <div 
          v-else-if="filteredPosts.length === 0" 
          class="border border-dashed border-line rounded-3xl p-12 text-center flex flex-col items-center justify-center my-8 bg-surface/50"
        >
          <div class="w-12 h-12 rounded-2xl bg-surface-2 border border-line-strong flex items-center justify-center text-muted mb-4">
            <svg class="w-6 h-6 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="1.8">
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
            </svg>
          </div>
          <h3 class="font-display font-bold text-base text-white mb-1">No saved posts found</h3>
          <p class="text-xs text-muted max-w-sm mb-6 leading-relaxed">
            There are no saved posts matching your search query or filter. Sync directly from your Threads account or load curated sample posts.
          </p>
          <div class="flex flex-wrap justify-center gap-3">
            <button
              v-if="hasActiveFilters"
              @click="resetFilters"
              class="px-4 py-2 rounded-xl bg-white text-black font-extrabold text-xs hover:bg-[#e5e5e5] transition-colors shadow-sm"
            >
              Reset Filters
            </button>
            <button
              @click="isSyncModalOpen = true"
              class="px-4 py-2 rounded-xl bg-surface border border-line hover:border-line-strong text-white font-semibold text-xs hover:bg-surface-hover transition-colors"
            >
              Sync from Threads Account
            </button>
            <button
              @click="populateSamplePosts"
              class="px-4 py-2 rounded-xl border border-line hover:border-line-strong text-white text-xs font-semibold transition-colors"
            >
              Load Sample Posts
            </button>
          </div>
        </div>

        <!-- List View -->
        <div v-else-if="viewMode === 'list'" class="space-y-3">
          <PostRow 
            v-for="post in paginatedPosts" 
            :key="post.permalink" 
            :post="post" 
          />
        </div>

        <!-- Grid View -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <PostCard 
            v-for="post in paginatedPosts" 
            :key="post.permalink" 
            :post="post" 
          />
        </div>

        <!-- Pagination -->
        <Pagination />
      </div>
    </main>

    <!-- Modals -->
    <ModalSyncProgress
      :is-open="isSyncModalOpen"
      @close="isSyncModalOpen = false"
    />

    <ModalAddPost 
      :is-open="isAddModalOpen" 
      @close="isAddModalOpen = false" 
    />
  </div>
</template>
