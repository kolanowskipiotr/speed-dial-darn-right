// ─── FAVICON PICKER ─────────────────────────────────────────────
function loadFaviconOptions(rawUrl) {
    let url = rawUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const picker = document.getElementById('faviconPicker');
    picker.innerHTML = '<div class="favicon-loading"><div class="spinner"></div><span>Loading icons…</span></div>';
    selectedFaviconUrl = '';

    const domain = getDomain(url);
    const bare = domain.replace(/^www\./, '');

    const candidates = [...new Set([
        `https://icons.duckduckgo.com/ip3/${domain}.ico`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        `https://${domain}/favicon.ico`,
        `https://${domain}/favicon.png`,
        `https://${domain}/apple-touch-icon.png`,
        `https://${bare}/favicon.ico`,
    ])];

    const found = [];
    let pending = candidates.length;

    const done = () => {
        pending--;
        if (pending === 0) renderFaviconTiles(found, picker);
    };

    candidates.forEach(src => {
        const img = new Image();
        let settled = false;
        const settle = (ok) => {
            if (settled) return; settled = true;
            clearTimeout(timer);
            if (ok && !found.includes(src)) found.push(src);
            done();
        };
        img.onload = () => settle(true);
        img.onerror = () => settle(false);
        const timer = setTimeout(() => settle(false), 4000);
        img.src = src;
    });
}

function renderFaviconTiles(found, picker) {
    picker.innerHTML = '';

    if (!found.length) {
        picker.innerHTML = '<span class="favicon-hint">No icons found — try Emoji or Custom URL</span>';
        return;
    }

    // Deduplicate visually identical icons by filtering after load
    found.forEach((src, i) => {
        const tile = document.createElement('div');
        tile.className = 'favicon-tile' + (i === 0 ? ' selected' : '');
        if (i === 0) selectedFaviconUrl = src;

        const img = document.createElement('img');
        img.src = src;
        img.alt = '';

        const check = document.createElement('div');
        check.className = 'favicon-check';
        check.textContent = '✓';

        tile.appendChild(img);
        tile.appendChild(check);
        tile.title = src;

        tile.addEventListener('click', () => {
            picker.querySelectorAll('.favicon-tile').forEach(t => t.classList.remove('selected'));
            tile.classList.add('selected');
            selectedFaviconUrl = src;
        });

        picker.appendChild(tile);
    });
}

// ─── EMOJI PICKER ───────────────────────────────────────────────
function buildEmojiPicker(pickerId, type) {
    const picker = document.getElementById(pickerId);
    picker.innerHTML = '';

    // Search bar
    const searchWrap = document.createElement('div');
    searchWrap.className = 'emoji-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'emoji-search';
    searchInput.placeholder = `${ICONS.search} Search emojis…`;
    searchInput.autocomplete = 'off';
    searchWrap.appendChild(searchInput);
    picker.appendChild(searchWrap);

    // Categories container (inside scroll area)
    const scrollArea = document.createElement('div');
    scrollArea.className = 'emoji-scroll-area';
    picker.appendChild(scrollArea);

    const catContainer = document.createElement('div');
    catContainer.className = 'emoji-cats';
    scrollArea.appendChild(catContainer);

    // No-results message
    const noResults = document.createElement('div');
    noResults.className = 'emoji-no-results';
    noResults.textContent = 'No emojis found';
    noResults.style.display = 'none';
    scrollArea.appendChild(noResults);

    function renderCategories(filter) {
        catContainer.innerHTML = '';
        let totalShown = 0;
        EMOJI_CATEGORIES.forEach(cat => {
            const matches = filter
                ? cat.emojis.filter(e => emojiMatchesFilter(e, filter))
                : cat.emojis;
            if (!matches.length) return;
            totalShown += matches.length;

            const catEl = document.createElement('div');
            catEl.className = 'emoji-category';

            const label = document.createElement('div');
            label.className = 'emoji-category-label';
            label.textContent = cat.label;
            catEl.appendChild(label);

            const grid = document.createElement('div');
            grid.className = 'emoji-grid';
            matches.forEach(e => {
                const span = document.createElement('span');
                span.className = 'emoji-opt';
                span.textContent = e;
                span.title = emojiName(e);
                span.onclick = () => selectEmoji(type, e);
                grid.appendChild(span);
            });
            catEl.appendChild(grid);
            catContainer.appendChild(catEl);
        });
        noResults.style.display = totalShown === 0 ? 'block' : 'none';
    }

    renderCategories('');

    searchInput.addEventListener('input', () => {
        renderCategories(searchInput.value.trim().toLowerCase());
    });

    // Clear search when picker opens
    picker._clearSearch = () => {
        searchInput.value = '';
        renderCategories('');
        const sa = picker.querySelector('.emoji-scroll-area');
        if (sa) sa.scrollTop = 0;
    };
}

function emojiName(e) {
    return EMOJI_KEYWORDS[e] || e;
}

// Full-text match: checks EMOJI_SYNONYMS array first, then EMOJI_KEYWORDS string.
// Returns true if any term contains the filter substring.
function emojiMatchesFilter(e, filter) {
    if (e === filter) return true;
    const synonyms = typeof EMOJI_SYNONYMS !== 'undefined' && EMOJI_SYNONYMS[e];
    if (synonyms && synonyms.some(s => s.toLowerCase().includes(filter))) return true;
    const kw = EMOJI_KEYWORDS[e];
    return kw ? kw.toLowerCase().includes(filter) : false;
}

function initEmojiPickers() {
    buildEmojiPicker('dialEmojiPicker', 'dial');
    buildEmojiPicker('groupEmojiPicker', 'group');
    buildEmojiPicker('tabEmojiPicker', 'tab');
}

function toggleEmojiPicker(type) {
    const picker = document.getElementById(type + 'EmojiPicker');
    const isOpen = picker.classList.contains('open');
    // Close all pickers first
    document.querySelectorAll('.emoji-picker').forEach(p => p.classList.remove('open'));
    if (!isOpen) {
        picker.classList.add('open');
        if (picker._clearSearch) picker._clearSearch();
        // Focus search input
        const si = picker.querySelector('.emoji-search');
        if (si) setTimeout(() => si.focus(), 50);
    }
}

function selectEmoji(type, emoji) {
    if (type === 'dial') {
        currentDialEmoji = emoji;
        document.getElementById('dialEmojiPreview').textContent = emoji;
    } else if (type === 'tab') {
        currentTabEmoji = emoji;
        const preview = document.getElementById('tabEmojiPreview');
        preview.textContent = emoji;
        preview.classList.remove('emoji-preview-none');
        document.getElementById('tabNoIconBtn').classList.remove('active');
    } else {
        currentGroupEmoji = emoji;
        const preview = document.getElementById('groupEmojiPreview');
        preview.textContent = emoji;
        preview.classList.remove('emoji-preview-none');
        document.getElementById('groupNoIconBtn').classList.remove('active');
    }
    document.getElementById(type + 'EmojiPicker').classList.remove('open');
}

function randomEmoji(type) {
    const list = (type === 'group' || type === 'tab') ? GROUP_EMOJIS : EMOJI_LIST;
    const emoji = pickRandomEmoji(list);
    if (type === 'dial') {
        currentDialEmoji = emoji;
        document.getElementById('dialEmojiPreview').textContent = emoji;
    } else if (type === 'tab') {
        currentTabEmoji = emoji;
        const preview = document.getElementById('tabEmojiPreview');
        preview.textContent = emoji;
        preview.classList.remove('emoji-preview-none');
        document.getElementById('tabNoIconBtn').classList.remove('active');
    } else {
        currentGroupEmoji = emoji;
        const preview = document.getElementById('groupEmojiPreview');
        preview.textContent = emoji;
        preview.classList.remove('emoji-preview-none');
        document.getElementById('groupNoIconBtn').classList.remove('active');
    }
}

function setNoIcon(type) {
    if (type === 'tab') {
        currentTabEmoji = '';
        const preview = document.getElementById('tabEmojiPreview');
        preview.textContent = '—';
        preview.classList.add('emoji-preview-none');
        document.getElementById('tabNoIconBtn').classList.add('active');
    } else {
        currentGroupEmoji = '';
        const preview = document.getElementById('groupEmojiPreview');
        preview.textContent = '—';
        preview.classList.add('emoji-preview-none');
        document.getElementById('groupNoIconBtn').classList.add('active');
    }
    document.getElementById(type + 'EmojiPicker').classList.remove('open');
}

// ─── MODAL HELPERS ──────────────────────────────────────────────
function openModal(id) {
    document.getElementById(id).classList.add('open');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

// Click backdrop to close
document.querySelectorAll('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', e => { if (e.target === bd) bd.classList.remove('open'); });
});

// ─── IMPORT / EXPORT ────────────────────────────────────────────
let _pendingImportJSON = null;

function _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function exportData() {
    showToast(`${ICONS.loading} Preparing export…`);
    const images = {};
    let imageErrors = 0;
    for (const tab of data.tabs) {
        for (const group of (tab.groups || [])) {
            for (const dial of (group.dials || [])) {
                if (dial.iconType === 'custom' && dial.icon && dial.icon.startsWith('/uploads/')) {
                    try {
                        const resp = await fetch(dial.icon);
                        if (resp.ok) {
                            const blob = await resp.blob();
                            images[dial.id] = await _blobToBase64(blob);
                        } else {
                            console.warn(`[export] ${dial.icon} → HTTP ${resp.status}`);
                            imageErrors++;
                        }
                    } catch (e) {
                        console.error(`[export] failed to fetch ${dial.icon}:`, e);
                        imageErrors++;
                    }
                }
            }
        }
    }
    const exportObj = {
        ...data,
        _config: {
            theme: localStorage.getItem('speedDial_theme') || 'dark-yellow',
            logoAnim: logoAnimEnabled,
        },
        _images: images,
    };
    const json = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'speed-dial.json';
    a.click();
    const imgCount = Object.keys(images).length;
    if (imageErrors) {
        showToast(`${ICONS.warn} Exported — ${imageErrors} image${imageErrors > 1 ? 's' : ''} failed (see console)`);
    } else {
        showToast(`${ICONS.ok} Exported${imgCount ? ` (${imgCount} image${imgCount > 1 ? 's' : ''} included)` : ''}`);
    }
}

function openImportModal() {
    _pendingImportJSON = null;
    document.getElementById('importData').value = '';
    document.getElementById('importFile').value = '';
    document.getElementById('importFileName').textContent = 'No file chosen';
    openModal('importModal');
}

function onImportFileSelected(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('importFileName').textContent = file.name;
    const reader = new FileReader();
    reader.onload = e => { _pendingImportJSON = e.target.result; };
    reader.readAsText(file);
}

function importData() {
    const raw = _pendingImportJSON || document.getElementById('importData').value.trim();
    if (!raw) { showToast(`${ICONS.warn} No data to import`); return; }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch(e) {
        showToast(`${ICONS.error} Invalid JSON format`);
        return;
    }
    closeModal('importModal');
    showConfirm('Import Configuration', 'This will replace your current configuration. Continue?', () => {
        _doImport(parsed);
    }, { btnLabel: 'Replace', danger: false });
}

async function _doImport(imported) {
    // Support both old { groups } and new { tabs } format
    if (imported.groups && !imported.tabs) {
        imported = { tabs: [{ id: uid(), name: 'Home', groups: imported.groups }] };
    }
    if (!imported.tabs || !Array.isArray(imported.tabs)) {
        showToast(`${ICONS.error} Invalid format`);
        return;
    }
    const images = imported._images || {};
    const config = imported._config || {};
    delete imported._images;
    delete imported._config;
    data = imported;

    if (config.theme) applyTheme(config.theme);
    if (config.logoAnim !== undefined) {
        logoAnimEnabled = config.logoAnim;
        localStorage.setItem('logoAnim', logoAnimEnabled ? 'true' : 'false');
        updateAnimToggleUI();
        if (logoAnimEnabled) setTimeout(runLogoAnimation, 100);
    }
    if (!data.tabs.some(t => t.isHome)) {
        data.tabs.unshift({ id: uid(), name: 'Start', emoji: '🏠', isHome: true, groups: [] });
    }
    activeTabId = data.tabs[0].id;
    saveData();
    render();

    const imageIds = Object.keys(images);
    if (imageIds.length) {
        showToast(`${ICONS.loading} Restoring ${imageIds.length} image${imageIds.length > 1 ? 's' : ''}…`);
        for (const dialId of imageIds) {
            try {
                const b64 = images[dialId];
                const byteStr = atob(b64);
                const arr = new Uint8Array(byteStr.length);
                for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
                const blob = new Blob([arr], { type: 'image/jpeg' });
                await uploadDialImage(dialId, blob);
            } catch(e) { /* skip failed images */ }
        }
        render();
        showToast(`${ICONS.ok} Imported — ${imageIds.length} image${imageIds.length > 1 ? 's' : ''} restored`);
    } else {
        showToast(`${ICONS.ok} Imported successfully`);
    }
}

// ─── KEYBOARD SHORTCUTS ─────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
    }
});
