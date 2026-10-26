// Saved — Threads Scanner & Real-Time Sync Content Script
(() => {
  // Prevent duplicate script execution
  if (window.__SAVED_THREADS_INITIALIZED__) return;
  window.__SAVED_THREADS_INITIALIZED__ = true;

  let lastActivePostContainer = null;
  const autoSyncedPermalinks = new Set();

  function showInPageToast(message) {
    try {
      let toast = document.getElementById('__saved_threads_toast__');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = '__saved_threads_toast__';
        toast.style.position = 'fixed';
        toast.style.bottom = '24px';
        toast.style.right = '24px';
        toast.style.zIndex = '999999';
        toast.style.backgroundColor = '#0c0c0c';
        toast.style.color = '#ffffff';
        toast.style.border = '1px solid #333333';
        toast.style.borderRadius = '10px';
        toast.style.padding = '12px 18px';
        toast.style.fontSize = '13px';
        toast.style.fontWeight = '600';
        toast.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        toast.style.boxShadow = '0 16px 40px rgba(0,0,0,0.85)';
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.gap = '8px';
        toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        toast.style.pointerEvents = 'none';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        document.body.appendChild(toast);
      }
      toast.innerHTML = `<span style="display:inline-block;width:6px;height:6px;background:#fff;border-radius:50%"></span> ${message}`;
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
      clearTimeout(window.__savedToastTimeout);
      window.__savedToastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
      }, 2800);
    } catch (e) {
      console.log('[Saved]', message);
    }
  }

  function extractSinglePost(container) {
    if (!container) return null;
    const link = container.querySelector('a[href*="/post/"]');
    if (!link) return null;

    const href = link.getAttribute('href') || '';
    const match = href.match(/(?:@|%40)?([a-zA-Z0-9._]+)\/post\/([a-zA-Z0-9_-]+)/);
    if (!match) return null;

    const username = match[1].replace(/^@/, '');
    const threadId = match[2];
    const permalink = `https://www.threads.net/@${username}/post/${threadId}`;

    let timestamp = null;
    const timeEl = container.querySelector('time');
    if (timeEl && timeEl.getAttribute('datetime')) {
      timestamp = timeEl.getAttribute('datetime');
    }

    const textElements = container.querySelectorAll('span[dir="auto"], div[dir="auto"]');
    const textParts = [];
    textElements.forEach((el) => {
      const t = el.textContent?.trim();
      if (!t) return;
      const tl = t.toLowerCase();
      if (tl === username.toLowerCase() || tl === '@' + username.toLowerCase()) return;
      if (tl === 'translate' || tl === 'translated' || tl === 'original audio' || tl === 'threads' || tl.endsWith(' threads')) return;
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t)) return;
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return;
      if (/^\d+[smhdw]$/i.test(t)) return;
      if (/^(\d+(\.\d+)?[KMkm]?\s*)+$/.test(t) && /\d/.test(t)) return;
      if (/^\d+[\s]*(likes?|replies|reposts?|views?|shares?)/i.test(t)) return;
      if (!textParts.includes(t)) {
        textParts.push(t);
      }
    });
    const text = textParts.join('\n');

    let mediaUrl = null;
    let thumbnailUrl = null;
    let mediaType = 'TEXT';

    const imgs = container.querySelectorAll('img');
    for (const img of imgs) {
      const src = img.getAttribute('src');
      if (src && !src.includes('profile') && !src.includes('avatar') && !src.includes('emoji')) {
        mediaUrl = src;
        thumbnailUrl = src;
        mediaType = 'IMAGE';
        break;
      }
    }

    const video = container.querySelector('video');
    if (video) {
      mediaType = 'VIDEO';
      if (video.src) mediaUrl = video.src;
      if (video.poster) thumbnailUrl = video.poster;
    }

    return {
      permalink,
      threadId,
      username,
      text: text || 'Saved Threads post',
      timestamp: timestamp || new Date().toISOString(),
      mediaType,
      mediaUrl,
      thumbnailUrl,
      savedAt: new Date().toISOString(),
    };
  }

  function extractPostsFromDOM() {
    const postMap = new Map();
    const links = document.querySelectorAll('a[href*="/post/"]');

    links.forEach((link) => {
      const container = link.closest('[role="article"]') ||
        link.closest('[data-pressable-container="true"]') ||
        link.closest('div[style*="flex-direction: column"]') ||
        link.parentElement?.parentElement;

      if (!container) return;
      const post = extractSinglePost(container);
      if (post && !postMap.has(post.permalink)) {
        postMap.set(post.permalink, post);
      }
    });

    return Array.from(postMap.values());
  }

  async function scrollAndCollect(maxScrolls = 80, onProgress) {
    const collected = new Map();
    let prevSize = 0;
    let staleCount = 0;

    for (let i = 0; i < maxScrolls; i++) {
      const modalBtn = Array.from(document.querySelectorAll("div[role='button'], button")).find((el) => {
        const txt = el.textContent.trim().toLowerCase();
        return txt === 'close' || txt === 'dismiss' || txt === 'ignore' || txt === 'not now';
      });
      if (modalBtn) modalBtn.click();

      const current = extractPostsFromDOM();
      current.forEach((p) => collected.set(p.permalink, p));

      if (onProgress) {
        onProgress({ currentCount: collected.size, scrollIndex: i + 1, maxScrolls });
      }

      if (collected.size === prevSize) {
        staleCount++;
        window.scrollBy({ top: -300, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 400));
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        await new Promise((r) => setTimeout(r, 1200));

        const retry = extractPostsFromDOM();
        retry.forEach((p) => collected.set(p.permalink, p));
        if (collected.size > prevSize) {
          staleCount = 0;
        } else if (staleCount >= 3) {
          break;
        }
      } else {
        staleCount = 0;
      }
      prevSize = collected.size;

      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await new Promise((r) => setTimeout(r, 1300));
    }

    return Array.from(collected.values());
  }

  // --- Real-time Click Detection ---
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;

    // Track last active article on menu or card click
    const article = target.closest('[role="article"]') || target.closest('[data-pressable-container="true"]');
    if (article) {
      lastActivePostContainer = article;
    }

    // Check if clicked element is a bookmark ribbon or "Save" button
    const saveTrigger = target.closest(
      'button[aria-label*="Save" i], button[aria-label*="Simpan" i], button[aria-label*="Bookmark" i], ' +
      'div[aria-label*="Save" i], div[aria-label*="Simpan" i], ' +
      '[role="menuitem"], div[role="button"]'
    );

    if (saveTrigger) {
      const text = (saveTrigger.textContent || '').trim().toLowerCase();
      const aria = (saveTrigger.getAttribute('aria-label') || '').toLowerCase();
      const isSaveAction =
        text === 'save' ||
        text === 'simpan' ||
        text.includes('save post') ||
        text.includes('simpan postingan') ||
        aria.includes('save') ||
        aria.includes('simpan') ||
        aria.includes('bookmark');

      if (isSaveAction) {
        const container = saveTrigger.closest('[role="article"]') || lastActivePostContainer;
        if (container) {
          const post = extractSinglePost(container);
          if (post) {
            chrome.runtime?.sendMessage?.({ action: 'SYNC_SINGLE_POST', post }, (res) => {
              if (res?.success) {
                showInPageToast(`Saved @${post.username}'s post to library ✓`);
              } else if (res?.queued) {
                showInPageToast(`Saved to library queue (offline)`);
              }
            });
          }
        }
      }
    }
  }, { capture: true });

  // --- Real-time Auto-Observer on /saved page ---
  if (window.location.pathname.includes('/saved')) {
    let syncTimer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        const posts = extractPostsFromDOM();
        const newPosts = posts.filter((p) => !autoSyncedPermalinks.has(p.permalink));
        if (newPosts.length > 0) {
          newPosts.forEach((p) => autoSyncedPermalinks.add(p.permalink));
          newPosts.forEach((post) => {
            chrome.runtime?.sendMessage?.({ action: 'SYNC_SINGLE_POST', post });
          });
          showInPageToast(`Auto-synced ${newPosts.length} new bookmark${newPosts.length > 1 ? 's' : ''} to library ✓`);
        }
      }, 1500);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // --- Message Listener for Popup Manual Scans ---
  chrome.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
    if (request.action === 'scan_visible') {
      const posts = extractPostsFromDOM();
      sendResponse({ success: true, count: posts.length, posts });
      return true;
    }

    if (request.action === 'auto_scroll_scan') {
      scrollAndCollect(request.maxScrolls || 15, (prog) => {
        try {
          chrome.runtime.sendMessage({ action: 'scan_progress', ...prog });
        } catch {
          // Popup might be closed
        }
      }).then((posts) => {
        sendResponse({ success: true, count: posts.length, posts });
      }).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
  });

  window.__SAVED_THREADS_EXTRACT__ = extractPostsFromDOM;
  window.__SAVED_THREADS_SCROLL_COLLECT__ = scrollAndCollect;
  console.log('Saved — Real-time Threads listener active.');
})();
