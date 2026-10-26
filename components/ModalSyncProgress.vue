<script setup lang="ts">
import { ref } from "vue";
import { useSSE } from "~/composables/useSSE";
import { useToast } from "~/composables/useToast";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { syncState, triggerSync, cancelSync } = useSSE();
const { showToast } = useToast();

const isFullScan = ref(false);

const bookmarkletSnippet = `javascript:(function(){
  const posts = [];
  document.querySelectorAll('div[data-pressable-container="true"], article').forEach(el => {
    const link = el.querySelector('a[href*="/post/"]');
    if (!link) return;
    const permalink = link.href.split('?')[0];
    const userEl = el.querySelector('a[role="link"] span, h2, span');
    const textEl = el.querySelector('div[dir="auto"], span[dir="auto"]');
    posts.push({
      permalink,
      username: userEl ? userEl.innerText.replace('@','') : '',
      text: textEl ? textEl.innerText : '',
      savedAt: new Date().toISOString()
    });
  });
  if (posts.length === 0) { alert('No posts found on this page. Scroll down to load more!'); return; }
  fetch('http://localhost:3000/api/saved-posts/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ posts, source: 'bookmarklet' })
  }).then(r => r.json()).then(d => alert('Synced ' + d.imported + ' posts to your Saved app!'))
    .catch(e => alert('Failed to sync. Make sure Saved server is running at localhost:3000'));
})();`;

function copyBookmarklet() {
  if (navigator?.clipboard) {
    navigator.clipboard.writeText(bookmarkletSnippet);
    showToast("Bookmarklet copied to clipboard!", "success");
  }
}

async function handleStart() {
  try {
    await triggerSync(isFullScan.value);
  } catch {}
}

function handleMinimize() {
  emit("close");
  showToast("Sync running in background. You will be notified when complete.", "info");
}
</script>

<template>
  <div 
    v-if="isOpen" 
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-lg bg-surface border border-line-strong rounded-3xl p-6 shadow-2xl space-y-6 animate-slide-in">
      <!-- Modal Header -->
      <div class="flex items-center justify-between pb-4 border-b border-line">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center font-bold">
            <svg class="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 16h5v5"/>
            </svg>
          </div>
          <div>
            <h2 class="font-display font-bold text-base text-white">Sync Threads Saved Bookmarks</h2>
            <div class="text-[11px] text-muted">Direct sync from your logged-in Threads account</div>
          </div>
        </div>
        <button @click="emit('close')" class="text-muted hover:text-white p-1 rounded-lg">
          <svg class="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Sync Active State -->
      <div v-if="syncState.isRunning" class="space-y-5">
        <!-- Live Status Card -->
        <div class="p-5 rounded-2xl bg-oled border border-line-strong space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_#ffffff] animate-pulse-mono" />
              <span class="text-xs font-bold text-white capitalize">{{ syncState.step }}</span>
            </div>
            <div class="text-[11px] font-mono text-muted">
              Live CDP Runner
            </div>
          </div>

          <div class="text-xs text-body leading-relaxed">
            {{ syncState.message }}
          </div>

          <!-- Counter Badge -->
          <div v-if="syncState.scannedCount > 0" class="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-line">
            <span class="text-xs text-muted">Saved posts collected:</span>
            <span class="text-sm font-bold font-mono text-white">{{ syncState.scannedCount }}</span>
          </div>

          <!-- Animated Progress Line -->
          <div class="w-full h-1.5 bg-[#181818] rounded-full overflow-hidden">
            <div class="h-full bg-white animate-pulse" style="width: 100%" />
          </div>
        </div>

        <!-- Controls while syncing -->
        <div class="flex items-center justify-between gap-3 pt-2">
          <button
            @click="cancelSync"
            class="px-4 py-2 rounded-xl border border-line hover:border-line-strong text-muted hover:text-white text-xs font-semibold transition-colors"
          >
            Cancel Sync
          </button>
          <button
            @click="handleMinimize"
            class="px-5 py-2 rounded-xl bg-white text-black font-extrabold text-xs hover:bg-[#e5e5e5] transition-colors"
          >
            Run in Background
          </button>
        </div>
      </div>

      <!-- Error / Auth Required Fallback State -->
      <div v-else-if="syncState.step === 'error'" class="space-y-4 text-xs">
        <div class="p-4 rounded-2xl bg-[#140808] border border-red-950/80 space-y-3">
          <div class="flex items-center gap-2 text-white font-bold">
            <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>Authentication Notice</span>
          </div>
          <p class="text-body leading-relaxed text-[11px]">
            {{ syncState.message || syncState.error }}
          </p>
        </div>

        <!-- Fast Fallback Options -->
        <div class="space-y-2 pt-2">
          <div class="text-[10px] font-bold text-muted uppercase tracking-wider">Fast Alternatives:</div>
          
          <a
            href="https://www.threads.net/saved"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-between p-3 rounded-xl bg-oled border border-line hover:border-line-strong text-white font-medium transition-colors"
          >
            <div class="flex items-center gap-2.5">
              <span>1. Open Threads in Browser to Log In</span>
            </div>
            <svg class="w-3.5 h-3.5 stroke-current fill-none text-muted" viewBox="0 0 24 24" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>

          <div class="p-3 rounded-xl bg-oled border border-line space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-white font-medium">2. Use 1-Click Bookmarklet</span>
              <button
                @click="copyBookmarklet"
                class="px-2.5 py-1 bg-white text-black font-bold text-[10px] rounded hover:bg-[#e5e5e5]"
              >
                Copy Code
              </button>
            </div>
            <p class="text-[10px] text-muted">
              Paste in DevTools Console on <code class="text-white">threads.net/saved</code> to sync instantly.
            </p>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-line">
          <button
            @click="syncState.step = 'idle'"
            class="px-4 py-2 rounded-xl bg-white text-black font-extrabold text-xs hover:bg-[#e5e5e5]"
          >
            Try Again
          </button>
        </div>
      </div>

      <!-- Completed State -->
      <div v-else-if="syncState.step === 'completed'" class="space-y-4 text-xs">
        <div class="p-5 rounded-2xl bg-oled border border-line space-y-3 text-center">
          <div class="w-10 h-10 rounded-full bg-white text-black font-extrabold flex items-center justify-center mx-auto">
            <svg class="w-5 h-5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h3 class="font-display font-bold text-base text-white">Sync Completed!</h3>
          <p class="text-body text-xs max-w-sm mx-auto leading-relaxed">
            {{ syncState.message }}
          </p>
          <div class="text-[11px] text-muted font-mono pt-1">
            Library successfully updated in SQLite.
          </div>
        </div>

        <div class="flex justify-end pt-2">
          <button
            @click="emit('close')"
            class="px-5 py-2.5 rounded-xl bg-white text-black font-extrabold text-xs hover:bg-[#e5e5e5] transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      <!-- Idle Start State -->
      <div v-else class="space-y-5 text-xs">
        <p class="text-body leading-relaxed">
          The automated sync engine connects directly to your logged-in Threads session in Brave, scrolls your saved bookmarks, and imports them directly into your local SQLite library.
        </p>

        <!-- Mode Toggle -->
        <div class="p-4 rounded-2xl bg-oled border border-line space-y-3">
          <label class="flex items-start gap-3 cursor-pointer">
            <input 
              v-model="isFullScan" 
              type="checkbox" 
              class="mt-0.5 rounded border-line bg-surface accent-white w-4 h-4 cursor-pointer"
            />
            <div>
              <div class="font-semibold text-white">Full Lifetime Scan</div>
              <div class="text-[11px] text-muted mt-0.5 leading-relaxed">
                Scrolls through your entire bookmark history to the bottom. Uncheck for fast incremental sync (stops after recent bookmarks).
              </div>
            </div>
          </label>
        </div>

        <div class="flex items-center justify-between text-muted text-[11px] px-1">
          <span>• Archive policy: Additive (never deletes old posts)</span>
          <span>• Engine: Local CDP</span>
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
          <button
            @click="emit('close')"
            class="px-4 py-2 rounded-xl border border-line hover:border-line-strong text-muted hover:text-white font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            @click="handleStart"
            class="px-5 py-2.5 rounded-xl bg-white text-black font-extrabold text-xs hover:bg-[#e5e5e5] transition-colors shadow-sm flex items-center gap-2"
          >
            <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 16h5v5"/>
            </svg>
            <span>Start Syncing Now</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
