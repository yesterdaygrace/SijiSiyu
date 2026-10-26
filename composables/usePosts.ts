import { ref, computed } from "vue";
import { useToast } from "./useToast";

export interface SavedPost {
  permalink: string;
  threadId?: string | null;
  username: string;
  text: string;
  timestamp?: string | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  savedAt?: string | null;
  source?: string;
  category?: string;
  filter?: string;
  collections?: string[];
  isNew?: boolean;
}

export function detectCategory(text = "", username = ""): { category: string; filter: string } {
  const lower = `${text} ${username}`.toLowerCase();
  if (
    /\b(code|go|golang|python|rust|sql|db|postgres|api|concurrency|dev|developer|backend|frontend|linux|git|docker|programming|typescript|javascript|vue|nuxt|react)\b/.test(
      lower,
    )
  ) {
    return { category: "Development", filter: "dev" };
  }
  if (
    /\b(design|ui|ux|interface|typography|tokens|css|layout|whitespace|visual|palette|brand|oled|minimal)\b/.test(
      lower,
    )
  ) {
    return { category: "Design", filter: "design" };
  }
  if (
    /\b(read|book|programmer|craft|notes|article|essay|queue|study|learn|review|guide|book)\b/.test(
      lower,
    )
  ) {
    return { category: "Articles & reads", filter: "articles" };
  }
  if (
    /\b(idea|project|tool|startup|product|feature|workflow|system|automation|club|saas|indie)\b/.test(
      lower,
    )
  ) {
    return { category: "Ideas", filter: "ideas" };
  }
  return { category: "Saved", filter: "all" };
}

export const SAMPLE_POSTS: SavedPost[] = [
  {
    permalink: "https://www.threads.net/@buildwithgo/post/C-go-patterns-101",
    username: "buildwithgo",
    text: "Go concurrency patterns I keep coming back to: practical collection of patterns for goroutines, channels, cancellation, and keeping concurrent code understandable. The best abstraction is usually the one your teammate can reason about at 2 AM.",
    timestamp: "2026-10-13T10:00:00Z",
    savedAt: "2026-10-13T12:00:00Z",
  },
  {
    permalink: "https://www.threads.net/@minimal.product/post/C-minimal-interface-102",
    username: "minimal.product",
    text: "A good interface knows when to get out of the way. Whitespace is not wasted space. Clear hierarchy, restrained color, and fewer competing actions make the important thing easier to find. Design for the task, not for the screenshot.",
    timestamp: "2026-10-12T14:30:00Z",
    savedAt: "2026-10-12T16:00:00Z",
  },
  {
    permalink: "https://www.threads.net/@read.more/post/C-pragmatic-programmer-104",
    username: "read.more",
    text: "The Pragmatic Programmer — notes worth revisiting: Care about your craft, automate repetitive work, and make reversible decisions where uncertainty is high. Small habits compound, especially when the codebase outlives the original plan.",
    timestamp: "2026-10-10T09:15:00Z",
    savedAt: "2026-10-10T11:00:00Z",
  },
  {
    permalink: "https://www.threads.net/@sideproject.club/post/C-tiny-tool-portfolio-107",
    username: "sideproject.club",
    text: "A tiny tool can be a better portfolio project: Pick a real irritation, keep the scope brutally small, finish the boring edges, and write down why you made each trade-off. A complete small tool often says more than a giant unfinished clone.",
    timestamp: "2026-10-07T18:00:00Z",
    savedAt: "2026-10-07T19:30:00Z",
  },
];

const posts = ref<SavedPost[]>([]);
const totalCount = ref(0);
const isLoading = ref(false);
const searchQuery = ref("");
const activeFilter = ref("all");
const mediaFilter = ref<"all" | "media" | "text" | "links">("all");
const dateFilter = ref<"all" | "today" | "week" | "month">("all");
const currentSort = ref<"recent_saved" | "oldest_saved" | "newest_post" | "oldest_post" | "author_asc">("recent_saved");
const viewMode = ref<"grid" | "list">("list");
const currentPage = ref(1);
const itemsPerPage = ref(12);

export function usePosts() {
  const { showToast } = useToast();

  async function fetchPosts() {
    isLoading.value = true;
    try {
      const data = await $fetch<{ posts: SavedPost[]; total: number }>("/api/saved-posts", {
        params: {
          limit: 200,
          offset: 0,
          sort: currentSort.value,
        },
      });

      // Enhance posts with category & filter detection
      posts.value = (data.posts || []).map((p) => {
        const cat = detectCategory(p.text, p.username);
        const colList = Array.isArray(p.collections) ? [...p.collections] : [];
        if (colList.length === 0 && cat.filter && cat.filter !== "all") {
          colList.push(cat.filter);
        }
        return {
          ...p,
          category: cat.category,
          filter: cat.filter,
          collections: colList,
        };
      });
      totalCount.value = data.total;
    } catch (err: any) {
      console.warn("Could not fetch posts:", err?.message || err);
    } finally {
      isLoading.value = false;
    }
  }

  async function deletePost(permalink: string) {
    try {
      await $fetch("/api/saved-posts", {
        method: "DELETE",
        params: { permalink },
      });
      posts.value = posts.value.filter((p) => p.permalink !== permalink);
      totalCount.value = Math.max(0, totalCount.value - 1);
      showToast("Post removed from local library", "info");
    } catch (err: any) {
      showToast("Failed to delete post: " + (err?.data?.message || err.message), "warning");
    }
  }

  async function syncPosts(inputPosts: SavedPost[], completeScan = false, source = "manual-import") {
    try {
      const res = await $fetch<{ imported: number; total: number }>("/api/saved-posts/sync", {
        method: "POST",
        body: {
          posts: inputPosts,
          completeScan,
          source,
        },
      });
      await fetchPosts();
      showToast(`Imported ${res.imported} saved posts`, "success");
      return res;
    } catch (err: any) {
      showToast("Sync failed: " + (err?.data?.message || err.message), "warning");
      throw err;
    }
  }

  async function populateSamplePosts() {
    return await syncPosts(SAMPLE_POSTS, false, "sample-data");
  }

  // Filtered & Sorted list
  const filteredPosts = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    const filter = activeFilter.value;
    const media = mediaFilter.value;
    const dateRange = dateFilter.value;

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    let list = posts.value.filter((p) => {
      // 1. Collection filter
      if (filter === "uncategorized") {
        if (p.collections && p.collections.length > 0) return false;
      } else if (filter !== "all") {
        const inCols = (p.collections && p.collections.includes(filter)) || p.filter === filter;
        if (!inCols) return false;
      }

      // 2. Media filter
      if (media === "media") {
        const hasMedia = Boolean(
          p.mediaUrl ||
          p.thumbnailUrl ||
          (p.mediaType && p.mediaType.toUpperCase() !== "TEXT") ||
          /\.(jpg|jpeg|png|gif|webp|mp4|mov)/i.test(p.text),
        );
        if (!hasMedia) return false;
      } else if (media === "text") {
        const hasMedia = Boolean(
          p.mediaUrl ||
          p.thumbnailUrl ||
          (p.mediaType && p.mediaType.toUpperCase() !== "TEXT"),
        );
        if (hasMedia) return false;
      } else if (media === "links") {
        const hasLinks = /\bhttps?:\/\/\S+/i.test(p.text);
        if (!hasLinks) return false;
      }

      // 3. Date range filter
      if (dateRange !== "all") {
        const timeStr = p.savedAt || p.timestamp;
        if (timeStr) {
          const itemTime = new Date(timeStr).getTime();
          if (!isNaN(itemTime)) {
            const age = now - itemTime;
            if (dateRange === "today" && age > ONE_DAY) return false;
            if (dateRange === "week" && age > 7 * ONE_DAY) return false;
            if (dateRange === "month" && age > 30 * ONE_DAY) return false;
          }
        }
      }

      // 4. Search query
      if (q) {
        const haystack = `${p.username} ${p.text} ${p.category || ""} ${p.permalink} ${(p.collections || []).join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      const aSaved = a.savedAt || a.timestamp || "";
      const bSaved = b.savedAt || b.timestamp || "";
      const aTime = a.timestamp || a.savedAt || "";
      const bTime = b.timestamp || b.savedAt || "";

      switch (currentSort.value) {
        case "oldest_saved":
          return aSaved.localeCompare(bSaved);
        case "newest_post":
          return bTime.localeCompare(aTime);
        case "oldest_post":
          return aTime.localeCompare(bTime);
        case "author_asc":
          return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
        case "recent_saved":
        default:
          return bSaved.localeCompare(aSaved);
      }
    });

    return list;
  });

  // Pagination
  const totalPages = computed(() => Math.ceil(filteredPosts.value.length / itemsPerPage.value) || 1);
  const paginatedPosts = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value;
    return filteredPosts.value.slice(start, start + itemsPerPage.value);
  });

  // Category & collection counts with zero double-counting
  const categoryCounts = computed(() => {
    const counts: Record<string, number> = {
      all: posts.value.length,
      uncategorized: 0,
      dev: 0,
      design: 0,
      articles: 0,
      ideas: 0,
    };
    for (const p of posts.value) {
      const assigned = p.collections || [];
      if (assigned.length === 0) {
        counts.uncategorized++;
      } else {
        for (const colId of assigned) {
          counts[colId] = (counts[colId] || 0) + 1;
        }
      }
    }
    return counts;
  });

  const hasActiveFilters = computed(() => {
    return (
      activeFilter.value !== "all" ||
      mediaFilter.value !== "all" ||
      dateFilter.value !== "all" ||
      searchQuery.value.trim() !== ""
    );
  });

  function resetFilters() {
    activeFilter.value = "all";
    mediaFilter.value = "all";
    dateFilter.value = "all";
    searchQuery.value = "";
    currentPage.value = 1;
  }

  function setCollectionFilter(id: string) {
    activeFilter.value = id;
    currentPage.value = 1;
  }

  function setMediaFilter(val: "all" | "media" | "text" | "links") {
    mediaFilter.value = val;
    currentPage.value = 1;
  }

  function setDateFilter(val: "all" | "today" | "week" | "month") {
    dateFilter.value = val;
    currentPage.value = 1;
  }

  function setPage(page: number) {
    if (page >= 1 && page <= totalPages.value) {
      currentPage.value = page;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return {
    posts,
    totalCount,
    isLoading,
    searchQuery,
    activeFilter,
    mediaFilter,
    dateFilter,
    currentSort,
    viewMode,
    currentPage,
    itemsPerPage,
    totalPages,
    filteredPosts,
    paginatedPosts,
    categoryCounts,
    hasActiveFilters,
    fetchPosts,
    deletePost,
    syncPosts,
    populateSamplePosts,
    setPage,
    resetFilters,
    setCollectionFilter,
    setMediaFilter,
    setDateFilter,
  };
}
