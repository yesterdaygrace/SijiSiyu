<script setup lang="ts">
import { ref, computed } from "vue";
import type { SavedPost } from "~/composables/usePosts";
import { usePosts } from "~/composables/usePosts";
import { useCollections } from "~/composables/useCollections";
import { useToast } from "~/composables/useToast";
import { copyToClipboard, cleanThreadsUrl } from "~/composables/useClipboard";

const props = defineProps<{
  post: SavedPost;
}>();

const { deletePost, setCollectionFilter } = usePosts();
const { collections, togglePostCollection } = useCollections();
const { showToast } = useToast();

const copied = ref(false);
const showCollectionMenu = ref(false);

const initials = computed(() => {
  const name = props.post.username.replace(/^@/, "");
  return name.slice(0, 2).toUpperCase() || "TH";
});

const formattedDate = computed(() => {
  const raw = props.post.timestamp || props.post.savedAt;
  if (!raw) return "Recent";
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return raw;
  }
});

const assignedCollections = computed(() => {
  if (!props.post.collections || props.post.collections.length === 0) return [];
  return collections.value.filter((c) => c.id !== "all" && props.post.collections?.includes(c.id));
});

const availableCustomCollections = computed(() => {
  return collections.value.filter((c) => c.id !== "all");
});

async function copyPermalink() {
  const cleanUrl = cleanThreadsUrl(props.post.permalink);
  const success = await copyToClipboard(cleanUrl);
  if (success) {
    copied.value = true;
    showToast("Threads link copied to clipboard", "success");
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } else {
    showToast("Failed to copy link", "warning");
  }
}

function handleUnsave() {
  if (confirm(`Remove saved post from @${props.post.username}?`)) {
    deletePost(props.post.permalink);
  }
}

async function handleToggleCollection(colId: string) {
  const isAssigned = props.post.collections?.includes(colId) || false;
  await togglePostCollection(props.post.permalink, colId, isAssigned);
  if (!props.post.collections) props.post.collections = [];
  if (isAssigned) {
    props.post.collections = props.post.collections.filter((id) => id !== colId);
  } else {
    props.post.collections.push(colId);
  }
}
</script>

<template>
  <article 
    class="relative flex items-start gap-4 p-5 rounded-2xl bg-surface border border-line hover:border-line-strong hover:bg-surface-hover transition-all duration-200 group"
    :class="{ 'animate-slide-in border-white/40': post.isNew }"
  >
    <!-- Avatar -->
    <div class="w-10 h-10 rounded-full bg-surface-2 border border-line-strong text-white font-extrabold text-xs flex items-center justify-center shrink-0 tracking-wider">
      {{ initials }}
    </div>

    <!-- Main Content -->
    <div class="flex-1 min-w-0">
      <!-- Meta line -->
      <div class="flex items-center gap-2 text-xs text-muted mb-1.5 flex-wrap">
        <a 
          :href="cleanThreadsUrl(post.permalink)" 
          target="_blank" 
          rel="noopener noreferrer"
          class="font-semibold text-white hover:underline"
        >
          @{{ post.username }}
        </a>
        <span>•</span>
        <span>{{ formattedDate }}</span>
        <span>•</span>
        <span>Thread</span>
      </div>

      <!-- Post Body -->
      <p class="text-xs md:text-[13px] text-body leading-relaxed whitespace-pre-line break-words select-text">
        {{ post.text }}
      </p>

      <!-- Footer Tags & Collection Badges -->
      <div class="flex items-center gap-2 mt-3.5 flex-wrap">
        <!-- Category Badge -->
        <button
          v-if="post.category && !assignedCollections.some(c => c.name.toLowerCase() === post.category?.toLowerCase())"
          @click.stop="post.filter ? setCollectionFilter(post.filter) : null"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-2 border border-line text-[11px] font-semibold text-white hover:border-white transition-colors cursor-pointer"
          :title="post.filter ? `Filter by ${post.category}` : post.category"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-white" />
          {{ post.category }}
        </button>

        <!-- Custom Collection Badges (Clickable to Filter) -->
        <button
          v-for="col in assignedCollections"
          :key="col.id"
          @click.stop="setCollectionFilter(col.id)"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#161616] border border-[#2b2b2b] text-[10px] text-[#cccccc] hover:text-white hover:border-white font-medium transition-colors cursor-pointer"
          :title="`Filter by collection: ${col.name}`"
        >
          <svg class="w-2.5 h-2.5 stroke-current fill-none text-[#888888]" viewBox="0 0 24 24" stroke-width="2">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
          </svg>
          <span>{{ col.name }}</span>
        </button>

        <!-- Collection Assign Trigger -->
        <div class="relative inline-block">
          <button
            @click="showCollectionMenu = !showCollectionMenu"
            title="Organize into collections"
            class="text-[11px] text-muted hover:text-white flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface-2 transition-colors border border-transparent hover:border-line"
          >
            <svg class="w-3 h-3 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2">
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
            </svg>
            <span>+ Collection</span>
          </button>

          <!-- Popover Menu -->
          <div
            v-if="showCollectionMenu"
            class="absolute bottom-8 left-0 w-48 bg-[#121212] border border-[#2a2a2a] rounded-xl p-2 shadow-2xl z-30 animate-slide-in space-y-1"
          >
            <div class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-subtle border-b border-[#222] mb-1 flex items-center justify-between">
              <span>Assign Collection</span>
              <button @click="showCollectionMenu = false" class="text-muted hover:text-white">✕</button>
            </div>

            <div v-if="availableCustomCollections.length === 0" class="px-2 py-2 text-[11px] text-muted text-center">
              No collections yet. Create one in the sidebar!
            </div>

            <div v-else class="max-h-40 overflow-y-auto space-y-0.5">
              <button
                v-for="col in availableCustomCollections"
                :key="col.id"
                @click="handleToggleCollection(col.id)"
                class="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs hover:bg-[#1c1c1c] text-left transition-colors"
                :class="post.collections?.includes(col.id) ? 'text-white font-semibold' : 'text-[#888888]'"
              >
                <span class="truncate">{{ col.name }}</span>
                <span v-if="post.collections?.includes(col.id)" class="text-white text-xs">✓</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
      <!-- Copy Link with Instant Visual Feedback -->
      <button 
        @click="copyPermalink"
        :title="copied ? 'Copied to clipboard!' : 'Copy clean Threads link'"
        class="px-2.5 py-1.5 rounded-lg border transition-all duration-200 flex items-center gap-1.5"
        :class="copied 
          ? 'bg-white text-black font-extrabold border-white shadow-[0_0_10px_rgba(255,255,255,0.4)]' 
          : 'border-transparent hover:border-line hover:bg-surface-2 text-muted hover:text-white'"
      >
        <template v-if="copied">
          <svg class="w-3.5 h-3.5 stroke-current fill-none stroke-[2.8]" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span class="text-[10px] tracking-wide font-black">Copied!</span>
        </template>
        <template v-else>
          <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
          </svg>
          <span class="text-[10px] font-semibold">Copy Link</span>
        </template>
      </button>

      <!-- Open on Threads -->
      <a 
        :href="cleanThreadsUrl(post.permalink)" 
        target="_blank" 
        rel="noopener noreferrer"
        title="Open on Threads"
        class="w-8 h-8 rounded-lg border border-transparent hover:border-line hover:bg-surface-2 text-muted hover:text-white flex items-center justify-center transition-colors"
      >
        <svg class="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>

      <!-- Unsave/Delete -->
      <button 
        @click="handleUnsave"
        title="Unsave post"
        class="w-8 h-8 rounded-lg border border-transparent hover:border-line hover:bg-surface-2 text-muted hover:text-white flex items-center justify-center transition-colors"
      >
        <svg class="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><line x1="9" y1="10" x2="15" y2="10"/>
        </svg>
      </button>
    </div>
  </article>
</template>
