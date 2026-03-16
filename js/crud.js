// ─── EDIT MODE ─────────────────────────────────────────────────
function toggleEditMode() {
    editMode = !editMode;
    document.body.classList.toggle('edit-mode', editMode);
    const toggle = document.getElementById('editToggle');
    toggle.classList.toggle('active', editMode);
    document.getElementById('editLabel').textContent = editMode ? 'Editing' : 'Edit';
    // Keep all dial cards draggable in sync with edit mode
    document.querySelectorAll('.dial-card:not(.add-dial-btn)').forEach(c => {
        c.draggable = editMode;
    });
    renderTabs();
}


// ─── TAB CRUD ───────────────────────────────────────────────────
function openTabModal(tabId = null) {
    editingTabId = tabId;
    const tab = tabId ? data.tabs.find(t => t.id === tabId) : null;
    document.getElementById('tabModalTitle').textContent = tab?.isHome ? 'Edit Start Tab' : (tabId ? 'Edit Tab' : 'Add Tab');
    document.getElementById('tabDeleteBtn').style.display = (tabId && !tab?.isHome) ? '' : 'none';
    document.getElementById('tabName').value = tab ? tab.name : '';
    currentTabEmoji = tab ? (tab.emoji !== undefined ? tab.emoji : ICONS.defaultTab) : ICONS.defaultTab;
    const tabPreview = document.getElementById('tabEmojiPreview');
    const tabNoIconBtn = document.getElementById('tabNoIconBtn');
    if (currentTabEmoji === '') {
        tabPreview.textContent = '—';
        tabPreview.classList.add('emoji-preview-none');
        tabNoIconBtn.classList.add('active');
    } else {
        tabPreview.textContent = currentTabEmoji;
        tabPreview.classList.remove('emoji-preview-none');
        tabNoIconBtn.classList.remove('active');
    }
    openModal('tabModal');
}

function saveTab() {
    const name = document.getElementById('tabName').value.trim();
    if (!name) { showToast(`${ICONS.warn} Please enter a tab name`); return; }

    if (editingTabId) {
        const t = data.tabs.find(t => t.id === editingTabId);
        if (t) { t.name = name; t.emoji = currentTabEmoji; }
    } else {
        const newTab = { id: uid(), name, emoji: currentTabEmoji, groups: [] };
        data.tabs.push(newTab);
        activeTabId = newTab.id;
    }
    saveData(); render();
    closeModal('tabModal');
}

function deleteTab(tabId) {
    if (data.tabs.length <= 1) { showToast(`${ICONS.warn} Cannot delete the last tab`); return; }
    const t = data.tabs.find(t => t.id === tabId);
    if (!t) return;
    if (t.isHome) { showToast(`${ICONS.warn} The Start tab cannot be deleted`); return; }
    showConfirm(
        `${ICONS.delete} Delete tab?`,
        `"${t.name}" and all its groups and dials will be removed.`,
        () => {
            const backup = JSON.stringify(data);
            data.tabs = data.tabs.filter(tab => tab.id !== tabId);
            if (activeTabId === tabId) activeTabId = data.tabs[0].id;
            saveData(); render();
            showToastUndo(`${ICONS.delete} Tab "${t.name}" deleted`, backup);
        }
    );
}

// ─── GROUP CRUD ─────────────────────────────────────────────────
function setGroupSize(px) {
    currentGroupSize = px;
    const slider = document.getElementById('groupSizeSlider');
    const label  = document.getElementById('groupSizeValue');
    if (slider) slider.value = px;
    if (label)  label.textContent = px + 'px';
}

function openGroupModal(groupId = null) {
    editingGroupId = groupId;
    const isEdit = !!groupId;
    document.getElementById('groupModalTitle').textContent = isEdit ? 'Edit Group' : 'Add Group';
    if (isEdit) {
        const g = getActiveTab().groups.find(g => g.id === groupId);
        document.getElementById('groupName').value = g.name;
        currentGroupEmoji = g.emoji !== undefined ? g.emoji : pickRandomEmoji(GROUP_EMOJIS);
        setGroupSize(g.dialSize || 140);
    } else {
        document.getElementById('groupName').value = '';
        currentGroupEmoji = pickRandomEmoji(GROUP_EMOJIS);
        setGroupSize(140);
    }
    const groupPreview = document.getElementById('groupEmojiPreview');
    const groupNoIconBtn = document.getElementById('groupNoIconBtn');
    if (currentGroupEmoji === '') {
        groupPreview.textContent = '—';
        groupPreview.classList.add('emoji-preview-none');
        groupNoIconBtn.classList.add('active');
    } else {
        groupPreview.textContent = currentGroupEmoji;
        groupPreview.classList.remove('emoji-preview-none');
        groupNoIconBtn.classList.remove('active');
    }
    document.getElementById('groupEmojiPicker').classList.remove('open');
    openModal('groupModal');
}

function saveGroup() {
    const name = document.getElementById('groupName').value.trim();
    if (!name) { showToast(`${ICONS.warn} Please enter a group name`); return; }

    if (editingGroupId) {
        const g = getActiveTab().groups.find(g => g.id === editingGroupId);
        if (g) { g.name = name; g.emoji = currentGroupEmoji; g.dialSize = currentGroupSize; }
    } else {
        getActiveTab().groups.push({ id: uid(), name, emoji: currentGroupEmoji, dialSize: currentGroupSize, dials: [] });
    }

    saveData(); render();
    closeModal('groupModal');
}

function deleteGroup(groupId) {
    const g = getActiveTab().groups.find(g => g.id === groupId);
    if (!g) return;
    showConfirm(
        `${ICONS.delete} Delete group?`,
        `"${g.name}" and all ${g.dials.length} dial(s) inside will be permanently removed.`,
        () => {
            const backup = JSON.stringify(data);
            const _at = getActiveTab(); _at.groups = _at.groups.filter(gr => gr.id !== groupId);
            saveData(); render();
            showToastUndo(`${ICONS.delete} Group "${g.name}" deleted`, backup);
        }
    );
}

function moveGroup(groupId, dir) {
    const groups = getActiveTab().groups;
    const idx = groups.findIndex(g => g.id === groupId);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= groups.length) return;
    [groups[idx], groups[newIdx]] = [groups[newIdx], groups[idx]];
    saveData(); render();
}

// ─── DIAL CRUD ─────────────────────────────────────────────────
function openDialModal(dialId = null, groupId = null) {
    editingDialId = dialId;
    editingDialGroupId = groupId;

    document.getElementById('dialModalTitle').textContent = dialId ? 'Edit Dial' : 'Add Dial';
    document.getElementById('dialEmojiPicker').classList.remove('open');
    selectedFaviconUrl = '';
    document.getElementById('faviconPicker').innerHTML = '<span class="favicon-hint">Enter a URL above to load icons</span>';
    // reset upload state
    pendingImageBlob = null;
    const uploadPreview = document.getElementById('imgUploadPreview');
    if (uploadPreview) { uploadPreview.style.display = 'none'; uploadPreview.innerHTML = ''; }
    const uploadStatus = document.getElementById('imgUploadStatus');
    if (uploadStatus) uploadStatus.textContent = '';
    const prevEl = document.getElementById('customIconPreview');
    if (prevEl) { prevEl.style.display = 'none'; prevEl.innerHTML = ''; }
    const customInput = document.getElementById('dialCustomIcon');
    if (customInput) customInput.value = '';

    if (dialId) {
        const group = getActiveTab().groups.find(g => g.id === groupId);
        const dial = group?.dials.find(d => d.id === dialId);
        if (dial) {
            document.getElementById('dialName').value = dial.name;
            document.getElementById('dialUrl').value = dial.url;
            currentDialEmoji = dial.emoji;
            document.getElementById('dialEmojiPreview').textContent = currentDialEmoji;
            if (dial.iconType === 'none') setIconSrc('none');
            else if (dial.iconType === 'emoji') setIconSrc('emoji');
            else if (dial.iconType === 'custom') {
                setIconSrc('custom');
                document.getElementById('dialCustomIcon').value = dial.icon || '';
                if (dial.icon) setTimeout(() => previewCustomIcon(), 50);
            }
            else {
                setIconSrc('favicon');
                // Pre-select the stored icon if available
                if (dial.icon) selectedFaviconUrl = dial.icon;
                loadFaviconOptions(dial.url);
            }
        }
    } else {
        document.getElementById('dialName').value = '';
        document.getElementById('dialUrl').value = '';
        currentDialEmoji = pickRandomEmoji(EMOJI_LIST);
        document.getElementById('dialEmojiPreview').textContent = currentDialEmoji;
        setIconSrc('favicon');
    }

    openModal('dialModal');
}

// ─── CUSTOM ICON PREVIEW ────────────────────────────────────────
let customPreviewTimer = null;

function previewCustomIcon() {
    clearTimeout(customPreviewTimer);
    // typing a URL cancels any pending image upload
    pendingImageBlob = null;
    const uploadPreview = document.getElementById('imgUploadPreview');
    if (uploadPreview) { uploadPreview.style.display = 'none'; uploadPreview.innerHTML = ''; }
    const uploadStatus = document.getElementById('imgUploadStatus');
    if (uploadStatus) uploadStatus.textContent = '';
    customPreviewTimer = setTimeout(() => {
        const url = document.getElementById('dialCustomIcon').value.trim();
        const preview = document.getElementById('customIconPreview');
        if (!url) { preview.style.display = 'none'; return; }
        preview.style.display = 'flex';
        preview.innerHTML = '';
        [32, 64].forEach(sz => {
            const wrap = document.createElement('div');
            wrap.style.cssText = `width:${sz+16}px;height:${sz+16}px;background:var(--surface3);border-radius:10px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border)`;
            const i = document.createElement('img');
            i.src = url;
            i.style.cssText = `width:${sz}px;height:${sz}px;object-fit:contain`;
            i.onerror = () => { wrap.innerHTML = `<span style="font-size:18px">${ICONS.error}</span>`; };
            wrap.appendChild(i);
            preview.appendChild(wrap);
        });
    }, 400);
}

function onUrlInput() {
    const status = document.getElementById('titleFetchStatus');
    if (status) status.textContent = '';
    if (currentIconSrc === 'favicon') {
        const url = document.getElementById('dialUrl').value.trim();
        if (url.length > 6) loadFaviconOptions(url);
    }
}

async function fetchPageTitle() {
    const urlRaw = document.getElementById('dialUrl').value.trim();
    const nameField = document.getElementById('dialName');
    const status = document.getElementById('titleFetchStatus');
    if (!urlRaw || nameField.value.trim()) return;

    let url = urlRaw;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    status.textContent = `${ICONS.loading} Fetching title…`;
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
        const text = await resp.text();
        const match = text.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
        if (match?.[1]) {
            nameField.value = match[1].replace(/\s+/g, ' ').trim();
            status.textContent = `${ICONS.ok} Title fetched`;
            setTimeout(() => { status.textContent = ''; }, 2000);
        } else {
            status.textContent = `${ICONS.warn} No title found`;
        }
    } catch {
        status.textContent = `${ICONS.warn} Could not fetch`;
    }
}

function saveDial() {
    const nameField = document.getElementById('dialName');
    const name = nameField.value.trim();
    let url = document.getElementById('dialUrl').value.trim();
    if (!url) { showToast(`${ICONS.warn} Please enter a URL`); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    if (!name) {
        const status = document.getElementById('titleFetchStatus');
        status.textContent = `${ICONS.loading} Fetching title…`;
        fetch(url, { signal: AbortSignal.timeout(6000) })
            .then(r => r.text())
            .then(text => {
                const match = text.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
                nameField.value = match?.[1]?.replace(/\s+/g, ' ').trim() || getDomain(url);
                status.textContent = '';
                _doSaveDial();
            })
            .catch(() => { nameField.value = getDomain(url); status.textContent = ''; _doSaveDial(); });
        return;
    }
    _doSaveDial();
}

async function _doSaveDial() {
    const name = document.getElementById('dialName').value.trim() || 'Untitled';
    let url = document.getElementById('dialUrl').value.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const newId = editingDialId || uid();

    let icon, iconType;
    if (pendingImageBlob) {
        const statusEl = document.getElementById('imgUploadStatus');
        if (statusEl) statusEl.textContent = `${ICONS.loading} Uploading…`;
        try {
            await uploadDialImage(newId, pendingImageBlob);
            icon = `/uploads/${newId}.jpg`;
            iconType = 'custom';
            pendingImageBlob = null;
        } catch {
            showToast(`${ICONS.error} Image upload failed`);
            if (statusEl) statusEl.textContent = `${ICONS.error} Upload failed`;
            return;
        }
    } else if (currentIconSrc === 'none') {
        icon = '';
        iconType = 'none';
    } else if (currentIconSrc === 'favicon') {
        icon = selectedFaviconUrl || '';
        iconType = 'favicon';
    } else if (currentIconSrc === 'custom') {
        icon = document.getElementById('dialCustomIcon').value.trim();
        iconType = 'custom';
    } else {
        icon = currentDialEmoji;
        iconType = 'emoji';
    }

    if (editingDialId) {
        const group = getActiveTab().groups.find(g => g.id === editingDialGroupId);
        const dial = group?.dials.find(d => d.id === editingDialId);
        if (dial) { dial.name = name; dial.url = url; dial.icon = icon; dial.iconType = iconType; dial.emoji = currentDialEmoji; }
    } else {
        const group = getActiveTab().groups.find(g => g.id === editingDialGroupId);
        if (group) {
            group.dials.push({ id: newId, name, url, icon, iconType, emoji: currentDialEmoji });
        }
    }

    saveData(); render();
    closeModal('dialModal');
}

function deleteDial(groupId, dialId) {
    const group = getActiveTab().groups.find(g => g.id === groupId);
    if (!group) return;
    const dial = group.dials.find(d => d.id === dialId);
    if (!dial) return;
    showConfirm(
        `${ICONS.delete} Delete dial?`,
        `"${dial.name}" will be permanently removed.`,
        () => {
            const backup = JSON.stringify(data);
            if (dial.iconType === 'custom' && dial.icon?.startsWith('/uploads/')) {
                deleteDialImage(dialId).catch(() => {}); // best-effort
            }
            group.dials = group.dials.filter(d => d.id !== dialId);
            saveData(); render();
            showToastUndo(`${ICONS.delete} "${dial.name}" deleted`, backup);
        }
    );
}

function moveDial(groupId, dialId, dir) {
    const group = getActiveTab().groups.find(g => g.id === groupId);
    if (!group) return;
    const idx = group.dials.findIndex(d => d.id === dialId);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= group.dials.length) return;
    [group.dials[idx], group.dials[newIdx]] = [group.dials[newIdx], group.dials[idx]];
    saveData(); render();
}

// ─── ICON SOURCE ────────────────────────────────────────────────
function setIconSrc(src) {
    currentIconSrc = src;
    ['favicon','emoji','custom','none'].forEach(s => {
        const btn = document.getElementById('iconSrc' + s.charAt(0).toUpperCase() + s.slice(1));
        if (btn) btn.classList.toggle('active', s === src);
    });
    document.getElementById('faviconPickerGroup').style.display = src === 'favicon' ? '' : 'none';
    document.getElementById('emojiPickerGroup').style.display = src === 'emoji' ? '' : 'none';
    document.getElementById('customIconGroup').style.display = src === 'custom' ? '' : 'none';
    if (src !== 'custom') {
        const p = document.getElementById('customIconPreview');
        if (p) p.style.display = 'none';
    }

    if (src === 'favicon') {
        const url = document.getElementById('dialUrl').value.trim();
        if (url) loadFaviconOptions(url);
    }
    if (src === 'custom') {
        // focus the drop zone (contenteditable) so Ctrl/Cmd+V paste fires on it
        setTimeout(() => document.getElementById('imgDropZone').focus(), 30);
    }
}
