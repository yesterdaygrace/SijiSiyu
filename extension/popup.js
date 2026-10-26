// Saved — Extension Popup Script (Real-Time Synchronizer)
let collectedPosts = [];
let backendConnected = false;

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const threadsNotice = document.getElementById('threadsNotice');
const scannedCount = document.getElementById('scannedCount');
const queueStatus = document.getElementById('queueStatus');
const scanBtn = document.getElementById('scanBtn');
const scanVisibleBtn = document.getElementById('scanVisibleBtn');
const syncBtn = document.getElementById('syncBtn');
const flushQueueBtn = document.getElementById('flushQueueBtn');
const exportBtn = document.getElementById('exportBtn');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

async function checkBackend() {
  try {
    const res = await fetch('http://localhost:3000/api/auth/status', { credentials: 'include' });
    const data = await res.json();
    if (data.connected) {
      backendConnected = true;
      statusDot.classList.add('online');
      statusText.textContent = `Connected (@${data.profile?.username || 'user'})`;
    } else {
      backendConnected = false;
      statusDot.classList.remove('online');
      statusText.textContent = 'App not connected';
    }
  } catch {
    backendConnected = false;
    statusDot.classList.remove('online');
    statusText.textContent = 'App offline (port 3000)';
  }
  updateQueueDisplay();
}

function updateQueueDisplay() {
  chrome.runtime.sendMessage({ action: 'GET_QUEUE_STATUS' }, (res) => {
    const count = res?.queue?.length || 0;
    if (queueStatus) {
      queueStatus.textContent = count > 0 ? `Queue: ${count} pending` : 'Queue: empty';
    }
    if (flushQueueBtn) {
      flushQueueBtn.style.display = count > 0 && backendConnected ? 'inline-flex' : 'none';
      flushQueueBtn.textContent = `Flush Queue (${count})`;
    }
  });
}

async function checkCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isThreads = tab?.url && (tab.url.includes('threads.net') || tab.url.includes('threads.com'));
  if (!isThreads) {
    threadsNotice.style.display = 'block';
  } else {
    threadsNotice.style.display = 'none';
  }
  return tab;
}

function updateButtons() {
  const hasPosts = collectedPosts.length > 0;
  syncBtn.disabled = !hasPosts || !backendConnected;
  syncBtn.textContent = `Sync Batch to App (${collectedPosts.length})`;
  exportBtn.disabled = !hasPosts;
  scannedCount.textContent = collectedPosts.length;
}

async function executeScan(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  scanBtn.disabled = true;
  scanVisibleBtn.disabled = true;
  progressBar.style.display = 'block';
  progressFill.style.width = '30%';

  try {
    if (action === 'scan_visible') {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'scan_visible' });
      if (response && response.posts) {
        mergePosts(response.posts);
      }
    } else {
      progressFill.style.width = '50%';
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'auto_scroll_scan', maxScrolls: 15 });
      if (response && response.posts) {
        mergePosts(response.posts);
      }
    }
  } catch (err) {
    alert(`Could not scan tab: ${err.message}. Make sure you are on a Threads page.`);
  } finally {
    progressBar.style.display = 'none';
    progressFill.style.width = '0%';
    scanBtn.disabled = false;
    scanVisibleBtn.disabled = false;
    updateButtons();
  }
}

function mergePosts(newPosts) {
  const map = new Map();
  collectedPosts.forEach((p) => map.set(p.permalink, p));
  newPosts.forEach((p) => map.set(p.permalink, p));
  collectedPosts = Array.from(map.values());
  updateButtons();
}

async function syncToBackend() {
  if (!collectedPosts.length || !backendConnected) return;
  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing...';

  try {
    const res = await fetch('http://localhost:3000/api/saved-posts/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        completeScan: false,
        posts: collectedPosts,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);

    alert(`Successfully synced ${data.imported} posts! Local library has ${data.currentCount} bookmarks.`);
    collectedPosts = [];
    updateButtons();
  } catch (err) {
    alert(`Sync failed: ${err.message}`);
  } finally {
    syncBtn.disabled = false;
    updateButtons();
    updateQueueDisplay();
  }
}

flushQueueBtn?.addEventListener('click', () => {
  flushQueueBtn.disabled = true;
  flushQueueBtn.textContent = 'Flushing...';
  chrome.runtime.sendMessage({ action: 'FLUSH_QUEUE' }, (res) => {
    flushQueueBtn.disabled = false;
    if (res?.flushed > 0) {
      alert(`Flushed ${res.flushed} offline bookmarks to Saved!`);
    } else if (res?.error) {
      alert(`Could not flush queue: ${res.error}`);
    }
    updateQueueDisplay();
  });
});

scanBtn.addEventListener('click', () => executeScan('auto_scroll_scan'));
scanVisibleBtn.addEventListener('click', () => executeScan('scan_visible'));
syncBtn.addEventListener('click', syncToBackend);

exportBtn.addEventListener('click', () => {
  if (!collectedPosts.length) return;
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(collectedPosts, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `threads-saved-${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
});

chrome.runtime.onMessage.addListener((req) => {
  if (req.action === 'scan_progress') {
    const percent = Math.min(100, Math.round((req.scrollIndex / req.maxScrolls) * 100));
    progressFill.style.width = `${percent}%`;
    scannedCount.textContent = req.currentCount;
  }
});

checkBackend();
checkCurrentTab();
