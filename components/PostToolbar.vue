<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { usePosts } from "~/composables/usePosts";
import { useCollections } from "~/composables/useCollections";

const {
  searchQuery,
  activeFilter,
  mediaFilter,
  dateFilter,
  currentSort,
  viewMode,
  setPage,
  filteredPosts,
  posts,
  categoryCounts,
  hasActiveFilters,
  resetFilters,
  setCollectionFilter,
  setMediaFilter,
  setDateFilter,
} = usePosts();

const { collections } = useCollections();
const searchInput = ref<HTMLInputElement | null>(null);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "/" && document.activeElement !== searchInput.value) {
    e.preventDefault();
    searchInput.value?.focus();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});

function clearSearch() {
  searchQuery.value = "";
  setPage(1);
}

function updateSort(val: any) {
  currentSort.value = val;
  setPage(1);
}

const activeCollectionLabel = computed(() => {
  if (activeFilter.value === "all") return "All Saved";
  if (activeFilter.value === "uncategorized") return "Uncategorized";
  const found = collections.value.find((c) => c.id === activeFilter.value);
  return found?.name || activeFilter.value;
});

const mediaFilterLabel = computed(() => {
  switch (mediaFilter.value) {
    case "media":
      return "Images & Video";
    case "text":
      return "Text Only";
    case "links":
      return "Contains Links";
    default:
      return "All Content";
  }
});

const dateFilterLabel = computed(() => {
  switch (dateFilter.value) {
    case "today":
      return "Past 24h";
    case "week":
      return "Past 7 days";
    case "month":
      return "Past 30 days";
    default:
      return "All Time";
  }
});

// Non-'all' collections for pills
const customCollections = computed(() => {
  return collections.value.filter((c) => c.id !== "all");
});
</script>

<template>
  <div class="space-y-3 mb-6">
    <!-- Row 1: Collection Pills (Concise, Detailed, High-contrast) -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none select-none">
      <!-- 'All' Pill -->
      <button
        @click="setCollectionFilter('all')"
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0"
        :class="
          activeFilter === 'all'
            ? 'bg-white text-black border-white shadow-sm font-extrabold'
            : 'bg-surface border-line text-[#888888] hover:text-white hover:border-[#383838]'
        "
      >
        <svg class="w-3.5 h-3.5 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="2">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
        </svg>
        <span>All Saved</span>
        <span
          class="text-[10px] px-1.5 py-0.2 rounded-md font-mono"
          :class="activeFilter === 'all' ? 'bg-black/10 text-black font-bold' : 'bg-surface-2 text-muted border border-line'"
        >
          {{ categoryCounts.all || 0 }}
        </span>
      </button>

      <!-- Individual Collections Pills -->
      <button
        v-for="col in customCollections"
        :key="col.id"
        @click="setCollectionFilter(col.id)"
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0"
        :class="
          activeFilter === col.id
            ? 'bg-white text-black border-white shadow-sm font-extrabold'
            : 'bg-surface border-line text-[#888888] hover:text-white hover:border-[#383838]'
        "
        :title="col.keywords ? `Tags: ${col.keywords}` : col.name"
      >
        <!-- Dynamic Icon -->
        <svg v-if="col.icon === 'code'" class="w-3.5 h-3.5 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="2">
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>
        <svg v-else-if="col.icon === 'layout'" class="w-3.5 h-3.5 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="2">
          <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
        </svg>
        <svg v-else-if="col.icon === 'book-open'" class="w-3.5 h-3.5 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="2">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
        <svg v-else-if="col.icon === 'lightbulb'" class="w-3.5 h-3.5 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="2">
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>
        </svg>
        <svg v-else class="w-3.5 h-3.5 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="2">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
        </svg>

        <span>{{ col.name }}</span>
        <span
          class="text-[10px] px-1.5 py-0.2 rounded-md font-mono"
          :class="activeFilter === col.id ? 'bg-black/10 text-black font-bold' : 'bg-surface-2 text-muted border border-line'"
        >
          {{ categoryCounts[col.id] || col.postCount || 0 }}
        </span>
      </button>

      <!-- 'Uncategorized' Pill -->
      <button
        @click="setCollectionFilter('uncategorized')"
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0"
        :class="
          activeFilter === 'uncategorized'
            ? 'bg-white text-black border-white shadow-sm font-extrabold'
            : 'bg-surface border-line text-[#888888] hover:text-white hover:border-[#383838]'
        "
        title="Saved posts not assigned to any collection"
      >
        <svg class="w-3.5 h-3.5 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="2">
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
        </svg>
        <span>Uncategorized</span>
        <span
          class="text-[10px] px-1.5 py-0.2 rounded-md font-mono"
          :class="activeFilter === 'uncategorized' ? 'bg-black/10 text-black font-bold' : 'bg-surface-2 text-muted border border-line'"
        >
          {{ categoryCounts.uncategorized || 0 }}
        </span>
      </button>
    </div>

    <!-- Row 2: Search Bar + Detailed Specific Filters (Media, Date, Sort, View) -->
    <div class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
      <!-- Search Input -->
      <div class="relative flex-1">
        <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
          <svg class="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </div>

        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          placeholder="Search threads, authors, keywords..."
          class="w-full bg-surface border border-line rounded-xl pl-10 pr-16 py-2.5 text-xs text-white placeholder-muted focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all"
          @input="setPage(1)"
        />

        <div class="absolute inset-y-0 right-0 pr-3 flex items-center gap-1.5">
          <button
            v-if="searchQuery"
            @click="clearSearch"
            class="text-muted hover:text-white p-1 rounded-md text-xs"
            title="Clear search"
          >
            <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <span class="text-[10px] text-muted border border-line-strong px-1.5 py-0.5 rounded font-mono bg-oled">/</span>
        </div>
      </div>

      <!-- Specific Filters Row: Media, Date, Sort & View Mode -->
      <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
        <!-- Media Filter Dropdown -->
        <div class="relative">
          <select
            :value="mediaFilter"
            @change="setMediaFilter(($event.target as HTMLSelectElement).value as any)"
            class="appearance-none bg-surface border border-line rounded-xl pl-3 pr-8 py-2.5 text-xs text-white font-medium focus:outline-none focus:border-white transition-colors cursor-pointer"
            :class="{ 'border-white font-bold bg-[#161616]': mediaFilter !== 'all' }"
            title="Filter by media type"
          >
            <option value="all">All Content</option>
            <option value="media">Images & Video</option>
            <option value="text">Text Only</option>
            <option value="links">With Links</option>
          </select>
          <div class="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-muted">
            <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        <!-- Date Range Filter Dropdown -->
        <div class="relative">
          <select
            :value="dateFilter"
            @change="setDateFilter(($event.target as HTMLSelectElement).value as any)"
            class="appearance-none bg-surface border border-line rounded-xl pl-3 pr-8 py-2.5 text-xs text-white font-medium focus:outline-none focus:border-white transition-colors cursor-pointer"
            :class="{ 'border-white font-bold bg-[#161616]': dateFilter !== 'all' }"
            title="Filter by date"
          >
            <option value="all">All Time</option>
            <option value="today">Past 24h</option>
            <option value="week">Past 7 Days</option>
            <option value="month">Past 30 Days</option>
          </select>
          <div class="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-muted">
            <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        <!-- Sort Select -->
        <div class="relative">
          <select
            :value="currentSort"
            @change="updateSort(($event.target as HTMLSelectElement).value as any)"
            class="appearance-none bg-surface border border-line rounded-xl pl-3 pr-8 py-2.5 text-xs text-white font-medium focus:outline-none focus:border-white transition-colors cursor-pointer"
            title="Sort posts"
          >
            <option value="recent_saved">Recent Saved</option>
            <option value="oldest_saved">Oldest Saved</option>
            <option value="newest_post">Newest Thread</option>
            <option value="oldest_post">Oldest Thread</option>
            <option value="author_asc">Author (@A-Z)</option>
          </select>
          <div class="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-muted">
            <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        <!-- View Switcher -->
        <div class="flex items-center p-1 bg-surface border border-line rounded-xl shrink-0">
          <button
            @click="viewMode = 'list'"
            :class="viewMode === 'list' ? 'bg-[#222222] text-white shadow-sm' : 'text-muted hover:text-white'"
            class="p-1.5 rounded-lg transition-colors"
            title="List view"
          >
            <svg class="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>
          <button
            @click="viewMode = 'grid'"
            :class="viewMode === 'grid' ? 'bg-[#222222] text-white shadow-sm' : 'text-muted hover:text-white'"
            class="p-1.5 rounded-lg transition-colors"
            title="Grid view"
          >
            <svg class="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Row 3: Active Filter Summary Bar (Concise, Clear Specificity, 1-Click Reset) -->
    <div
      v-if="hasActiveFilters"
      class="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-[#0f0f0f] border border-line text-xs animate-slide-in flex-wrap"
    >
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-muted text-[11px] font-medium">
          Showing <strong class="text-white">{{ filteredPosts.length }}</strong> of
          <strong class="text-white">{{ posts.length }}</strong> posts
        </span>

        <!-- Active Collection Badge -->
        <span
          v-if="activeFilter !== 'all'"
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#181818] border border-[#2e2e2e] text-[11px] text-white"
        >
          <span class="text-muted">Collection:</span>
          <span class="font-bold">{{ activeCollectionLabel }}</span>
          <button
            @click="setCollectionFilter('all')"
            class="text-muted hover:text-white ml-0.5"
            title="Clear collection filter"
          >
            ✕
          </button>
        </span>

        <!-- Active Media Badge -->
        <span
          v-if="mediaFilter !== 'all'"
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#181818] border border-[#2e2e2e] text-[11px] text-white"
        >
          <span class="text-muted">Media:</span>
          <span class="font-bold">{{ mediaFilterLabel }}</span>
          <button
            @click="setMediaFilter('all')"
            class="text-muted hover:text-white ml-0.5"
            title="Clear media filter"
          >
            ✕
          </button>
        </span>

        <!-- Active Date Badge -->
        <span
          v-if="dateFilter !== 'all'"
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#181818] border border-[#2e2e2e] text-[11px] text-white"
        >
          <span class="text-muted">Date:</span>
          <span class="font-bold">{{ dateFilterLabel }}</span>
          <button
            @click="setDateFilter('all')"
            class="text-muted hover:text-white ml-0.5"
            title="Clear date filter"
          >
            ✕
          </button>
        </span>

        <!-- Active Search Badge -->
        <span
          v-if="searchQuery.trim()"
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#181818] border border-[#2e2e2e] text-[11px] text-white"
        >
          <span class="text-muted">Query:</span>
          <span class="font-mono font-bold">"{{ searchQuery }}"</span>
          <button
            @click="clearSearch"
            class="text-muted hover:text-white ml-0.5"
            title="Clear search query"
          >
            ✕
          </button>
        </span>
      </div>

      <!-- Reset All Action -->
      <button
        @click="resetFilters"
        class="text-[11px] text-[#888888] hover:text-white font-semibold transition-colors underline underline-offset-2 shrink-0 ml-auto"
      >
        Reset all filters
      </button>
    </div>
  </div>
</template>
