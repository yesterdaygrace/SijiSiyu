<script setup lang="ts">
import { ref, onMounted } from "vue";
import { usePosts } from "~/composables/usePosts";
import { useCollections, type CollectionItem } from "~/composables/useCollections";
import { useAuth } from "~/composables/useAuth";
import { useSSE } from "~/composables/useSSE";

const emit = defineEmits<{
  (e: "open-sync"): void;
}>();

const { activeFilter, categoryCounts, setPage } = usePosts();
const { collections, fetchCollections, createCollection, updateCollection, deleteCollection } = useCollections();
const { authState, devConnect, disconnect } = useAuth();
const { isLive, syncState } = useSSE();

const showCreateForm = ref(false);
const newCollectionName = ref("");
const newCollectionKeywords = ref("");
const isSubmitting = ref(false);

const editingCollectionId = ref<string | null>(null);
const editName = ref("");
const editKeywords = ref("");
const isEditing = ref(false);

const showDevPrompt = ref(false);
const devUsername = ref("");

onMounted(() => {
  fetchCollections();
});

function selectCategory(id: string) {
  activeFilter.value = id;
  setPage(1);
}

async function handleCreateCollection() {
  const name = newCollectionName.value.trim();
  if (!name || isSubmitting.value) return;

  isSubmitting.value = true;
  try {
    const created = await createCollection({
      name,
      keywords: newCollectionKeywords.value.trim(),
    });
    newCollectionName.value = "";
    newCollectionKeywords.value = "";
    showCreateForm.value = false;
    selectCategory(created.id);
  } finally {
    isSubmitting.value = false;
  }
}

function cancelCreate() {
  newCollectionName.value = "";
  newCollectionKeywords.value = "";
  showCreateForm.value = false;
}

function startEdit(cat: CollectionItem) {
  editingCollectionId.value = cat.id;
  editName.value = cat.name;
  editKeywords.value = cat.keywords || "";
}

function cancelEdit() {
  editingCollectionId.value = null;
  editName.value = "";
  editKeywords.value = "";
}

async function handleSaveEdit() {
  if (!editingCollectionId.value || !editName.value.trim() || isEditing.value) return;

  isEditing.value = true;
  try {
    await updateCollection({
      id: editingCollectionId.value,
      name: editName.value.trim(),
      keywords: editKeywords.value.trim(),
    });
    editingCollectionId.value = null;
  } finally {
    isEditing.value = false;
  }
}

async function handleDeleteCollection(cat: CollectionItem) {
  if (cat.id === "all") return;
  const ok = confirm(`Delete collection "${cat.name}"?\nSaved posts inside this collection will NOT be deleted.`);
  if (!ok) return;

  await deleteCollection(cat.id);
  if (activeFilter.value === cat.id) {
    selectCategory("all");
  }
}

function handleDevSubmit() {
  if (!devUsername.value.trim()) return;
  devConnect(devUsername.value.trim());
  showDevPrompt.value = false;
  devUsername.value = "";
}
</script>

<template>
  <aside class="w-64 border-r border-line bg-[#080808] flex flex-col h-screen sticky top-0 p-5 shrink-0 z-20 overflow-y-auto">
    <!-- Brand -->
    <div class="flex items-center gap-3 px-2 mb-8">
      <div class="w-9 h-9 rounded-xl bg-white text-black font-extrabold flex items-center justify-center border border-white shrink-0 shadow-sm">
        <svg class="w-5 h-5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
        </svg>
      </div>
      <div>
        <div class="font-display font-extrabold text-xl text-white tracking-tight leading-none">saved.</div>
        <div class="text-[10px] tracking-widest uppercase font-bold text-muted mt-1">Threads Library</div>
      </div>
    </div>

    <!-- Navigation Label & New Collection Action -->
    <div class="px-2 flex items-center justify-between mb-2">
      <span class="text-[10px] font-bold uppercase tracking-wider text-subtle">
        Collections
      </span>
      <button
        @click="showCreateForm = !showCreateForm"
        title="Create new collection"
        class="w-5 h-5 rounded-md hover:bg-[#1f1f1f] text-[#888888] hover:text-white flex items-center justify-center transition-colors"
      >
        <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2.2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>

    <!-- Inline Create Collection Form -->
    <div v-if="showCreateForm" class="p-3 mb-2 rounded-xl bg-[#121212] border border-[#262626] space-y-2 animate-slide-in">
      <div class="text-[10px] font-bold uppercase tracking-wider text-muted">New Collection</div>
      <input
        v-model="newCollectionName"
        type="text"
        placeholder="Collection name (e.g. AI & ML)..."
        class="w-full bg-[#181818] border border-[#2b2b2b] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-[#666666] focus:outline-none focus:border-white transition-colors"
        @keydown.enter="handleCreateCollection"
        @keydown.esc="cancelCreate"
        autofocus
      />
      <input
        v-model="newCollectionKeywords"
        type="text"
        placeholder="Keywords to auto-match (e.g. ai, llm)..."
        class="w-full bg-[#181818] border border-[#2b2b2b] rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-[#555555] focus:outline-none focus:border-white transition-colors"
        @keydown.enter="handleCreateCollection"
        @keydown.esc="cancelCreate"
      />
      <div class="text-[9px] text-[#666666] leading-tight">
        Comma-separated keywords will auto-assign saved threads into this collection.
      </div>
      <div class="flex items-center justify-end gap-1.5 pt-1">
        <button
          @click="cancelCreate"
          class="px-2 py-1 rounded-md text-[10px] text-[#888888] hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          @click="handleCreateCollection"
          :disabled="!newCollectionName.trim() || isSubmitting"
          class="px-2.5 py-1 rounded-md bg-white text-black font-bold text-[10px] hover:bg-[#e0e0e0] disabled:opacity-50 transition-colors"
        >
          {{ isSubmitting ? '...' : 'Create' }}
        </button>
      </div>
    </div>

    <!-- Category / Collection Nav List -->
    <nav class="space-y-1 mb-6">
      <div
        v-for="cat in collections"
        :key="cat.id"
        class="group relative"
      >
        <!-- Inline Edit Mode for Collection -->
        <div
          v-if="editingCollectionId === cat.id"
          class="p-2.5 rounded-xl bg-[#141414] border border-[#333333] space-y-2 animate-slide-in mb-1"
        >
          <div class="text-[10px] font-bold uppercase tracking-wider text-muted">Edit Collection</div>
          <input
            v-model="editName"
            type="text"
            placeholder="Collection name"
            class="w-full bg-[#1a1a1a] border border-[#2b2b2b] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-white"
            @keydown.enter="handleSaveEdit"
            @keydown.esc="cancelEdit"
          />
          <input
            v-model="editKeywords"
            type="text"
            placeholder="Keywords (comma-separated)"
            class="w-full bg-[#1a1a1a] border border-[#2b2b2b] rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-white font-mono"
            @keydown.enter="handleSaveEdit"
            @keydown.esc="cancelEdit"
          />
          <div class="flex items-center justify-end gap-1.5 pt-0.5">
            <button
              @click="cancelEdit"
              class="px-2 py-0.5 rounded text-[10px] text-muted hover:text-white"
            >
              Cancel
            </button>
            <button
              @click="handleSaveEdit"
              :disabled="!editName.trim() || isEditing"
              class="px-2.5 py-0.5 rounded bg-white text-black font-bold text-[10px] hover:bg-[#e0e0e0] disabled:opacity-50"
            >
              {{ isEditing ? '...' : 'Save' }}
            </button>
          </div>
        </div>

        <!-- Normal Collection Button -->
        <div v-else class="relative flex items-center">
          <button
            @click="selectCategory(cat.id)"
            class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left"
            :class="[
              activeFilter === cat.id 
                ? 'bg-[#161616] text-white font-bold border border-[#2b2b2b]' 
                : 'text-[#888888] hover:bg-[#141414] hover:text-white border border-transparent',
              cat.id !== 'all' ? 'pr-16' : ''
            ]"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <!-- Dynamic Category Icons -->
              <svg v-if="cat.icon === 'code'" class="w-4 h-4 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
              <svg v-else-if="cat.icon === 'layout'" class="w-4 h-4 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
              </svg>
              <svg v-else-if="cat.icon === 'book-open'" class="w-4 h-4 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
              <svg v-else-if="cat.icon === 'lightbulb'" class="w-4 h-4 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>
              </svg>
              <svg v-else-if="cat.icon === 'folder'" class="w-4 h-4 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
              </svg>
              <svg v-else class="w-4 h-4 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
              </svg>
              <div class="min-w-0">
                <div class="truncate leading-snug">{{ cat.name }}</div>
                <div 
                  v-if="cat.keywords" 
                  class="text-[9px] text-[#666666] truncate max-w-[120px] font-mono leading-none mt-0.5"
                  :title="'Keywords: ' + cat.keywords"
                >
                  tags: {{ cat.keywords }}
                </div>
              </div>
            </div>

            <span 
              class="text-[11px] px-2 py-0.5 rounded-md font-semibold border transition-colors shrink-0"
              :class="activeFilter === cat.id 
                ? 'bg-[#262626] text-white border-[#383838]' 
                : 'bg-[#181818] text-[#888888] border-[#222222]'"
            >
              {{ cat.id === 'all' ? (categoryCounts.all || 0) : (categoryCounts[cat.id] ?? cat.postCount ?? 0) }}
            </span>
          </button>

          <!-- Hover Actions: Edit and Delete for non-'all' collections -->
          <div
            v-if="cat.id !== 'all'"
            class="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity"
          >
            <!-- Edit Button -->
            <button
              @click.stop="startEdit(cat)"
              title="Edit collection name & keywords"
              class="p-1 rounded-md text-[#666666] hover:text-white hover:bg-[#222222] transition-colors"
            >
              <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
            </button>

            <!-- Delete Button -->
            <button
              @click.stop="handleDeleteCollection(cat)"
              title="Delete collection"
              class="p-1 rounded-md text-[#666666] hover:text-white hover:bg-[#222222] transition-colors"
            >
              <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Dedicated 'Uncategorized' Filter Option in Sidebar -->
      <div class="pt-2 border-t border-line/40 mt-2">
        <button
          @click="selectCategory('uncategorized')"
          class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left"
          :class="[
            activeFilter === 'uncategorized' 
              ? 'bg-[#161616] text-white font-bold border border-[#2b2b2b]' 
              : 'text-[#888888] hover:bg-[#141414] hover:text-white border border-transparent'
          ]"
          title="Threads not yet organized into any collection"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <svg class="w-4 h-4 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
            </svg>
            <div class="min-w-0">
              <div class="truncate leading-snug">Uncategorized</div>
              <div class="text-[9px] text-[#666666] leading-none mt-0.5">Inbox / Untagged</div>
            </div>
          </div>

          <span 
            class="text-[11px] px-2 py-0.5 rounded-md font-semibold border transition-colors shrink-0"
            :class="activeFilter === 'uncategorized' 
              ? 'bg-[#262626] text-white border-[#383838]' 
              : 'bg-[#181818] text-[#888888] border-[#222222]'"
          >
            {{ categoryCounts.uncategorized || 0 }}
          </span>
        </button>
      </div>
    </nav>

    <!-- Sidebar Bottom: Real-Time Sync & Account Card -->
    <div class="mt-auto space-y-3 pt-4 border-t border-line/60">
      <!-- Sync Status Box -->
      <div class="border border-line rounded-2xl p-4 bg-surface text-xs space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 font-bold text-white">
            <span 
              class="w-2 h-2 rounded-full inline-block"
              :class="isLive ? 'bg-white shadow-[0_0_8px_#ffffff] animate-pulse-mono' : 'border border-muted bg-transparent'"
            />
            <span>{{ isLive ? 'Real-Time Sync' : 'Offline / Standby' }}</span>
          </div>
          <span class="text-[10px] text-muted uppercase font-bold tracking-wider">SSE</span>
        </div>

        <!-- Sync Trigger Button -->
        <button
          @click="emit('open-sync')"
          class="w-full py-2 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
          :class="syncState.isRunning 
            ? 'bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.4)] animate-pulse' 
            : 'bg-white text-black hover:bg-[#e5e5e5]'"
        >
          <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
            <path d="M16 16h5v5"/>
          </svg>
          <span>{{ syncState.isRunning ? `Syncing (${syncState.scannedCount || '...'})` : 'Sync from Threads' }}</span>
        </button>

        <!-- Connected Account Info -->
        <div v-if="authState.connected" class="space-y-2 pt-1 border-t border-line/60">
          <div class="text-[11px] text-body flex items-center justify-between">
            <span>Account:</span>
            <span class="text-white font-semibold">@{{ authState.username }}</span>
          </div>
          <div class="text-[11px] text-body flex items-center justify-between">
            <span>Library Posts:</span>
            <span class="text-white font-semibold">{{ categoryCounts.all || 0 }}</span>
          </div>
          <button 
            @click="disconnect"
            class="w-full mt-1 py-1.5 px-3 rounded-lg border border-line-strong hover:border-white hover:text-white bg-oled text-body text-[11px] font-semibold transition-colors"
          >
            Disconnect Account
          </button>
        </div>

        <!-- Disconnected State -->
        <div v-else class="space-y-2 pt-1 border-t border-line/60">
          <p class="text-[11px] text-muted leading-relaxed">
            Local archive ready. Connect your account or use dev mode.
          </p>

          <a 
            v-if="authState.oauthConfigured"
            href="/api/auth/threads/start"
            class="block text-center w-full py-2 px-3 rounded-lg bg-white text-black font-bold text-xs hover:bg-[#e5e5e5] transition-colors"
          >
            Connect Threads
          </a>

          <button 
            v-if="!showDevPrompt"
            @click="showDevPrompt = true"
            class="w-full py-1.5 px-3 rounded-lg border border-line-strong hover:border-white hover:text-white bg-oled text-body text-[11px] font-semibold transition-colors"
          >
            Dev Quick Connect
          </button>

          <div v-if="showDevPrompt" class="space-y-2 pt-1">
            <input 
              v-model="devUsername" 
              placeholder="@username"
              @keydown.enter="handleDevSubmit"
              class="w-full px-2.5 py-1.5 bg-oled border border-line text-xs rounded-lg text-white focus:outline-none focus:border-white"
            />
            <div class="flex gap-1.5">
              <button 
                @click="handleDevSubmit"
                class="flex-1 py-1 bg-white text-black rounded text-[11px] font-bold hover:bg-[#e5e5e5]"
              >
                Connect
              </button>
              <button 
                @click="showDevPrompt = false"
                class="px-2 py-1 border border-line text-muted rounded text-[11px] hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Info -->
      <div class="px-2 text-[10px] text-[#555555] flex items-center justify-between">
        <span>Nuxt + SQLite</span>
        <span>v0.2.0</span>
      </div>
    </div>
  </aside>
</template>
