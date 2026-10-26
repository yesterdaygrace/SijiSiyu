// Saved — Extension Background Service Worker (Real-Time Sync Engine)

const BACKEND_URL = 'http://localhost:3000';

// Flash badge text temporarily
function flashBadge(text, color = '#ffffff', timeout = 2500) {
  try {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
    setTimeout(() => {
      chrome.storage.local.get(['sync_queue'], (res) => {
        const count = (res.sync_queue || []).length;
        chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
        chrome.action.setBadgeBackgroundColor({ color: '#525252' });
      });
    }, timeout);
  } catch (e) {
    console.error('Error updating badge:', e);
  }
}

// Queue offline post
async function queuePost(post) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['sync_queue'], (result) => {
      const queue = result.sync_queue || [];
      const exists = queue.some((p) => p.permalink === post.permalink);
      if (!exists) {
        queue.push(post);
        chrome.storage.local.set({ sync_queue: queue }, () => {
          chrome.action.setBadgeText({ text: String(queue.length) });
          chrome.action.setBadgeBackgroundColor({ color: '#525252' });
          resolve(queue.length);
        });
      } else {
        resolve(queue.length);
      }
    });
  });
}

// Attempt to flush offline queue
async function flushQueue() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['sync_queue'], async (result) => {
      const queue = result.sync_queue || [];
      if (!queue.length) {
        resolve({ flushed: 0 });
        return;
      }

      try {
        const res = await fetch(`${BACKEND_URL}/api/saved-posts/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completeScan: false, posts: queue }),
        });

        if (res.ok) {
          chrome.storage.local.set({ sync_queue: [] }, () => {
            flashBadge('✓', '#ffffff', 2000);
            resolve({ flushed: queue.length });
          });
        } else {
          resolve({ flushed: 0, error: 'Backend error' });
        }
      } catch (err) {
        resolve({ flushed: 0, error: err.message });
      }
    });
  });
}

// Send single post to Saved backend
async function syncSinglePost(post) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/saved-posts/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completeScan: false, posts: [post] }),
    });

    if (res.ok) {
      flashBadge('✓', '#ffffff', 2500);
      // Attempt to flush any previously queued items
      flushQueue().catch(() => {});
      return { success: true, queued: false };
    } else {
      const queueLen = await queuePost(post);
      return { success: false, queued: true, queueLength: queueLen };
    }
  } catch {
    const queueLen = await queuePost(post);
    return { success: false, queued: true, queueLength: queueLen };
  }
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'SYNC_SINGLE_POST') {
    syncSinglePost(message.post).then(sendResponse);
    return true; // Asynchronous reply
  }

  if (message.action === 'FLUSH_QUEUE') {
    flushQueue().then(sendResponse);
    return true;
  }

  if (message.action === 'GET_QUEUE_STATUS') {
    chrome.storage.local.get(['sync_queue'], (result) => {
      sendResponse({ queue: result.sync_queue || [] });
    });
    return true;
  }
});

// Create periodic alarm to flush queue when backend comes online
chrome.alarms?.create('check_sync_queue', { periodInMinutes: 1 });
chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === 'check_sync_queue') {
    flushQueue().catch(() => {});
  }
});

console.log('Saved — Real-time Background Sync Worker initialized.');
