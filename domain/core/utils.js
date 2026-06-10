// ─── UTILS ─────────────────────────────────────────────────────
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Resize image file/blob to exactly 400×300 (cover crop), returns JPEG blob
function resizeImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objUrl = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(objUrl);
            const W = 400, H = 300;
            const scale = Math.max(W / img.width, H / img.height);
            const sw = img.width * scale, sh = img.height * scale;
            const canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            canvas.getContext('2d').drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh);
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/jpeg', 0.85);
        };
        img.onerror = reject;
        img.src = objUrl;
    });
}

async function uploadDialImage(id, blob) {
    const res = await fetch(`/api/upload/${id}`, { method: 'POST', body: blob });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
}

function deleteDialImage(id) {
    return fetch(`/api/upload/${id}`, { method: 'DELETE' });
}

function handleDropZonePaste(e) {
    e.preventDefault();
    // clear any stray text nodes contenteditable may have allowed in
    const zone = document.getElementById('imgDropZone');
    // strip any text nodes while keeping element children
    [...zone.childNodes].forEach(n => { if (n.nodeType === Node.TEXT_NODE) n.remove(); });

    const imageItem = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (!imageItem) { showToast(`${ICONS.warn} No image in clipboard`); return; }
    handleImageFile(imageItem.getAsFile());
}

function handleImageFile(file) {
    if (!file) return;
    document.getElementById('dialCustomIcon').value = '';
    const customPreview = document.getElementById('customIconPreview');
    if (customPreview) customPreview.style.display = 'none';
    const status = document.getElementById('imgUploadStatus');
    const preview = document.getElementById('imgUploadPreview');
    status.textContent = `${ICONS.loading} Resizing…`;
    preview.style.display = 'none';
    resizeImage(file).then(blob => {
        pendingImageBlob = blob;
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        preview.innerHTML = '';
        preview.appendChild(img);
        preview.style.display = 'block';
        status.textContent = `${ICONS.ok} Ready — will upload on Save`;
    }).catch(() => {
        status.textContent = `${ICONS.error} Could not process image`;
    });
}

function pickRandomEmoji(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch { return ''; }
}

// Returns ordered favicon URL candidates for a domain
function getFaviconCandidates(url) {
    const domain = getDomain(url);
    if (!domain) return [];
    const bare = domain.replace(/^www\./, '');
    return [
        `https://icons.duckduckgo.com/ip3/${domain}.ico`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        `https://${domain}/favicon.ico`,
        `https://${domain}/apple-touch-icon.png`,
        `https://${bare}/favicon.ico`,
    ];
}

// Directly chain onerror on the DOM img element through each candidate
function attachFavicon(imgEl, dialUrl, fallbackEmoji) {
    const candidates = getFaviconCandidates(dialUrl);
    if (!candidates.length) { showEmojiInstead(imgEl, fallbackEmoji); return; }
    let idx = 0;
    function tryNext() {
        if (!document.body.contains(imgEl)) return;
        if (idx >= candidates.length) { showEmojiInstead(imgEl, fallbackEmoji); return; }
        imgEl.onerror = () => { imgEl.onerror = null; imgEl.onload = null; tryNext(); };
        imgEl.onload = null;
        imgEl.src = candidates[idx++];
    }
    tryNext();
}

function showEmojiInstead(imgEl, emoji) {
    const wrap = imgEl.parentElement;
    if (wrap) wrap.innerHTML = `<span class="dial-emoji">${emoji || ICONS.faviconFallback}</span>`;
}

let toastTimer = null;
let _undoBackup = null;

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerHTML = `<span>${msg}</span>`;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function showToastUndo(msg, backup) {
    _undoBackup = backup;
    const t = document.getElementById('toast');
    t.innerHTML = `<span>${msg}</span><button class="toast-undo" onclick="undoDelete()">Undo</button>`;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); _undoBackup = null; }, 4000);
}

function undoDelete() {
    if (!_undoBackup) return;
    try {
        data = JSON.parse(_undoBackup);
        _undoBackup = null;
        saveData(); render();
        showToast(`${ICONS.undo} Restored`);
    } catch(e) { showToast(`${ICONS.error} Could not undo`); }
}

function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('open');
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('open');
}

// ─── WEB NOTIFICATIONS ────────────────────────────────────────
/**
 * Request browser notification permission.
 * Also registers the service worker (needed for reliable OS notifications on Chrome).
 * Returns a Promise resolving to 'granted' | 'denied' | 'default'.
 */
function requestNotificationPermission() {
    if (!('Notification' in window)) return Promise.resolve('denied');
    // Register SW early so it is ready before the first notification fires.
    _ensureSwRegistered();
    return Notification.requestPermission();
}

let _swRegistrationPromise = null;
function _ensureSwRegistered() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    if (_swRegistrationPromise) return _swRegistrationPromise;
    _swRegistrationPromise = navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(reg => { console.log('[sw] registered, scope:', reg.scope); return reg; })
        .catch(e  => { console.warn('[sw] registration failed:', e.message); return null; });
    return _swRegistrationPromise;
}

/**
 * Show an OS-level notification via Service Worker (Chrome/macOS reliable)
 * with a fallback to the legacy Notification constructor.
 */
function showNotification(title, body, opts = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return null;

    const payload = {
        body,
        icon:   opts.icon || '/favicon.ico',
        badge:  '/favicon.ico',
        tag:    opts.tag  || 'speed-dial-monitor',
        silent: opts.silent || false,
        ...opts,
    };

    // Prefer Service Worker notification — goes through the OS pipeline on Chrome/macOS.
    // navigator.serviceWorker.ready resolves only when the SW is fully *active*, which is
    // required for reg.showNotification() to work (the earlier registration promise may
    // resolve while the SW is still installing, causing silent failures).
    if ('serviceWorker' in navigator) {
        _ensureSwRegistered(); // kick off registration if not already started
        navigator.serviceWorker.ready
            .then(reg => reg.showNotification(title, payload))
            .catch(() => {
                // SW ready but showNotification failed — fall back to constructor.
                try { new Notification(title, payload); } catch (_) {}
            });
    } else {
        // Fallback: direct Notification constructor (Firefox, Safari, non-SW environments).
        try { new Notification(title, payload); } catch (_) {}
    }

    return true; // indicates the attempt was made
}

function showConfirm(title, message, onConfirm, opts = {}) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    const btn = document.getElementById('confirmOkBtn');
    btn.textContent = opts.btnLabel || 'Delete';
    btn.style.background = opts.danger === false ? '' : 'var(--danger)';
    btn.style.color = opts.danger === false ? '' : '#fff';
    btn.onclick = () => { closeModal('confirmModal'); onConfirm(); };
    openModal('confirmModal');
}
