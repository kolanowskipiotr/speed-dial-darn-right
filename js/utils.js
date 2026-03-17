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

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerHTML = `<span>${msg}</span>`;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function showToastUndo(msg, backup) {
    const t = document.getElementById('toast');
    t.innerHTML = `<span>${msg}</span><button class="toast-undo" onclick="undoDelete('${encodeURIComponent(backup)}')">Undo</button>`;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}

function undoDelete(encodedBackup) {
    try {
        data = JSON.parse(decodeURIComponent(encodedBackup));
        saveData(); render();
        showToast(`${ICONS.undo} Restored`);
    } catch(e) { showToast(`${ICONS.error} Could not undo`); }
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
