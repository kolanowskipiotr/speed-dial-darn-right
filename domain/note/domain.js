// ─── NOTES MODULE ─────────────────────────────────────────────────
// Loaded after todo.js, before drag-drop.js. All functions are global.

let _notesSplitInstance = null;  // split.js instance
let _notesPreviewEl = null;      // .notes-preview DOM element ref
let _notesDragId = null;         // id of tab being dragged for reorder
let _pendingNoteFocusId = null;  // note to make active after undo restores it
let _notesTrashOpen = false;     // whether the trash panel is visible
let _notesTrashPreviewId = null; // id of trash note currently previewed
let _mermaidRenderToken = 0;     // incremented each render to discard stale async results

// ─── HELPERS ─────────────────────────────────────────────────────

function findNote(id) {
    return (data.notes || []).find(n => n.id === id) || null;
}

function _findTrashNote(id) {
    return (data.notesTrash || []).find(n => n.id === id) || null;
}

function _noteExcerpt(note, maxLen = 140) {
    const raw = (note.content || '').trim();
    if (!raw) return '';
    let text;
    if (note.language === 'markdown' && window.marked) {
        // Render to HTML then strip tags to get readable plain text
        const html = marked.parse(raw);
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        text = tmp.textContent || tmp.innerText || '';
    } else {
        text = raw;
    }
    text = text.replace(/\s+/g, ' ').trim();
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function _formatDeletedAt(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _purgeOldTrash() {
    if (!data.notesTrash?.length) return;
    const now = Date.now();
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const expired = data.notesTrash.filter(n => {
        const deletedAt = n.deletedAt ? new Date(n.deletedAt).getTime() : 0;
        return deletedAt > 0 && deletedAt < cutoff;
    });
    if (!expired.length) return;
    data.notesTrash = data.notesTrash.filter(n => {
        const deletedAt = n.deletedAt ? new Date(n.deletedAt).getTime() : 0;
        return deletedAt === 0 || deletedAt >= cutoff;
    });
    saveData();
    expired.forEach(n => {
        const ids = extractUploadIds(n.content || '');
        if (ids.length) Promise.all(ids.map(id => deleteDialImage(id))).catch(() => {});
    });
}

function _isAppDark() {
    return !document.body.dataset.theme?.startsWith('light');
}

function _getNotesSortedByOrder() {
    return [...(data.notes || [])].sort((a, b) => a.order - b.order);
}

function _getNotesContainer() {
    return document.querySelector('.home-col-notes');
}

// ─── RENDER ──────────────────────────────────────────────────────

function renderNotesPanel(container) {
    // Purge expired trash entries on every render
    _purgeOldTrash();

    // Destroy old split instance before touching DOM
    if (_notesSplitInstance) {
        try { _notesSplitInstance.destroy(); } catch (e) {}
        _notesSplitInstance = null;
        _notesPreviewEl = null;
    }
    // Destroy old CM6 editor
    if (window.NotesCM) {
        NotesCM.destroy();
    }

    container.innerHTML = '';

    // Ensure we have at least one note (guard against corrupt state)
    if (!data.notes || !data.notes.length) {
        const now = new Date().toISOString();
        data.notes = [{ id: uid(), name: 'Note 1', content: '', language: 'markdown', order: 0, createdAt: now, updatedAt: now }];
        saveData();
    }

    // If a note was just deleted and undo restored it, make it active again
    if (_pendingNoteFocusId && findNote(_pendingNoteFocusId)) {
        activeNoteId = _pendingNoteFocusId;
        _pendingNoteFocusId = null;
    }

    // Ensure activeNoteId points to a valid note
    if (!activeNoteId || !findNote(activeNoteId)) {
        activeNoteId = _getNotesSortedByOrder()[0].id;
    }
    const note = findNote(activeNoteId);

    // ── Build panel DOM ──────────────────────────────────────────
    const panel = document.createElement('div');
    panel.className = 'notes-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'notes-panel-header';

    const title = document.createElement('span');
    title.className = 'notes-panel-title';
    title.textContent = ICONS.defaultNote + ' Notes';

    const headerActions = document.createElement('div');
    headerActions.className = 'notes-panel-header-actions';

    const languages = [
        { id: 'text',       label: 'txt' },
        { id: 'markdown',   label: 'md' },
        { id: 'mermaid',    label: 'mmd' },
        { id: 'json',       label: 'json' },
        { id: 'xml',        label: 'xml' },
        { id: 'javascript', label: 'js' },
        { id: 'html',       label: 'html' },
    ];
    languages.forEach(({ id, label }) => {
        const btn = document.createElement('button');
        btn.className = 'btn-icon notes-lang-btn' + (note.language === id ? ' active' : '');
        btn.textContent = label;
        btn.onclick = () => setNoteLanguage(id);
        headerActions.appendChild(btn);
    });

    const imgBtn = document.createElement('button');
    imgBtn.className = 'btn-icon notes-img-btn';
    imgBtn.title = 'Insert image';
    imgBtn.textContent = '📎';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.onchange = () => {
        const file = fileInput.files[0];
        if (file && window._notesUploadImage) window._notesUploadImage(file, null);
        fileInput.value = '';
    };
    imgBtn.onclick = () => fileInput.click();
    headerActions.appendChild(imgBtn);
    headerActions.appendChild(fileInput);

    const sep = document.createElement('span');
    sep.className = 'notes-header-sep';
    headerActions.appendChild(sep);

    if (googleUser && currentAccessToken) {
        if (note.keepSync) {
            const isSyncing = window._keepSyncInFlight?.has(note.id);
            const syncNowBtn = document.createElement('button');
            syncNowBtn.className = 'btn-icon notes-keep-sync-btn';
            if (isSyncing) syncNowBtn.classList.add('notes-keep-spinning');
            syncNowBtn.title = 'Sync now with Google Keep';
            syncNowBtn.textContent = ICONS.keepSyncing;
            syncNowBtn.onclick = () => syncNoteToKeep(note);
            headerActions.appendChild(syncNowBtn);
        }

        const importKeepBtn = document.createElement('button');
        importKeepBtn.className = 'btn-icon notes-import-keep-btn';
        importKeepBtn.title = 'Import note from Google Keep';
        importKeepBtn.textContent = ICONS.keepImport;
        importKeepBtn.onclick = () => _openImportKeepModal();
        headerActions.appendChild(importKeepBtn);

        const sep2 = document.createElement('span');
        sep2.className = 'notes-header-sep';
        headerActions.appendChild(sep2);
    }

    const infoBtn = document.createElement('button');
    infoBtn.className = 'btn-icon notes-info-btn';
    infoBtn.title = 'Keyboard shortcuts';
    infoBtn.textContent = ICONS.info;

    const tooltip = document.createElement('div');
    tooltip.className = 'notes-info-tooltip';
    tooltip.innerHTML = [
        '<div><kbd>Ctrl/Cmd+F</kbd> Find in note</div>',
        '<div><kbd>Ctrl/Cmd+H</kbd> Find &amp; Replace</div>',
        '<div><kbd>Ctrl/Cmd+D</kbd> Select next occurrence</div>',
        '<div><kbd>Alt+Click</kbd> Add cursor at click</div>',
        '<div><kbd>Alt+↑ / ↓</kbd> Move line up / down</div>',
        '<div><kbd>Double-click tab</kbd> Rename note</div>',
    ].join('');
    infoBtn.appendChild(tooltip);
    infoBtn.addEventListener('mouseenter', () => tooltip.classList.add('visible'));
    infoBtn.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));

    const fsBtn = document.createElement('button');
    fsBtn.className = 'btn-icon notes-fullscreen-btn';
    fsBtn.title = 'Toggle full screen';
    fsBtn.textContent = notesFullScreen ? '⛶' : '⤢';
    fsBtn.onclick = () => toggleNotesFullScreen();

    headerActions.appendChild(infoBtn);
    headerActions.appendChild(fsBtn);
    header.appendChild(title);
    header.appendChild(headerActions);
    panel.appendChild(header);

    // Tabs bar with anchored trash
    const tabsBar = document.createElement('div');
    tabsBar.className = 'notes-tabs-bar';

    const scrollArea = document.createElement('div');
    scrollArea.className = 'notes-tabs-scroll-area';
    _buildNotesTabs(scrollArea);
    tabsBar.appendChild(scrollArea);

    const addTabBtn = document.createElement('button');
    addTabBtn.className = 'notes-add-tab-btn';
    addTabBtn.title = 'New note';
    addTabBtn.textContent = '+';
    addTabBtn.onclick = () => addNote();
    tabsBar.appendChild(addTabBtn);

    // Ensure active tab is visible
    requestAnimationFrame(() => {
        const active = scrollArea.querySelector('.notes-tab.active');
        if (active) {
            const containerWidth = scrollArea.clientWidth;
            const scrollLeft = Math.ceil(scrollArea.scrollLeft);
            const itemLeft = active.offsetLeft;
            const itemWidth = active.offsetWidth;
            const buffer = 2; // small margin to prevent micro-jumps

            if (itemLeft < scrollLeft) {
                scrollArea.scrollTo({ left: itemLeft - buffer, behavior: 'smooth' });
            } else if (itemLeft + itemWidth > scrollLeft + containerWidth) {
                scrollArea.scrollTo({ left: itemLeft + itemWidth - containerWidth + buffer, behavior: 'smooth' });
            }
        }
    });

    // Horizontal scroll with mouse wheel
    scrollArea.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            scrollArea.scrollBy({ left: e.deltaY, behavior: 'auto' });
        }
    }, { passive: false });

    const trashCount = (data.notesTrash || []).length;
    const trashBtn = document.createElement('button');
    trashBtn.className = 'btn-icon notes-trash-btn' + (_notesTrashOpen ? ' active' : '');
    trashBtn.title = 'Trash';
    trashBtn.textContent = ICONS.delete;
    if (trashCount) {
        const badge = document.createElement('span');
        badge.className = 'notes-trash-badge';
        badge.textContent = trashCount;
        trashBtn.appendChild(badge);
    }
    trashBtn.onclick = () => {
        _notesTrashOpen = !_notesTrashOpen;
        _notesTrashPreviewId = null;
        const c = _getNotesContainer();
        if (c) renderNotesPanel(c);
    };
    tabsBar.appendChild(trashBtn);

    panel.appendChild(tabsBar);

    // Split host (editor + optional preview, OR trash panel)
    const splitHost = document.createElement('div');
    splitHost.className = 'notes-split-host';

    if (_notesTrashOpen) {
        _buildTrashPanel(splitHost);
        panel.appendChild(splitHost);
        container.appendChild(panel);
        return;
    }

    const cmHost = document.createElement('div');
    cmHost.className = 'notes-cm-host';
    splitHost.appendChild(cmHost);

    if (note.language === 'markdown' || note.language === 'mermaid') {
        const preview = document.createElement('div');
        preview.className = 'notes-preview';
        splitHost.appendChild(preview);
    }

    panel.appendChild(splitHost);
    container.appendChild(panel);

    // ── Mount CM6 editor ─────────────────────────────────────────
    function _mountEditor() {
        NotesCM.mount(cmHost, note.content, note.language, _isAppDark());
        // Consume search highlight if pending
        if (_notesSearchHighlight && _notesSearchHighlight.noteId === activeNoteId) {
            const q = _notesSearchHighlight.query;
            _notesSearchHighlight = null;
            requestAnimationFrame(() => NotesCM.focusAndHighlight(q));
        }
        if (note.language === 'markdown' || note.language === 'mermaid') {
            _initPreviewSplit();
        }
    }

    if (window.NotesCM) {
        _mountEditor();
    } else {
        document.addEventListener('notescmready', function h() {
            document.removeEventListener('notescmready', h);
            const host = document.querySelector('.notes-cm-host');
            const n = findNote(activeNoteId);
            if (host && n) {
                NotesCM.mount(host, n.content, n.language, _isAppDark());
                if (_notesSearchHighlight && _notesSearchHighlight.noteId === activeNoteId) {
                    const q = _notesSearchHighlight.query;
                    _notesSearchHighlight = null;
                    requestAnimationFrame(() => NotesCM.focusAndHighlight(q));
                }
                if (n.language === 'markdown' || n.language === 'mermaid') _initPreviewSplit();
            }
        }, { once: true });
    }
}

// ── Partial tabs re-render ────────────────────────────────────────

function _buildNotesTabs(tabsBar) {
    if (!tabsBar) tabsBar = document.querySelector('.notes-tabs-scroll-area');
    if (!tabsBar) return;
    tabsBar.innerHTML = '';
    _getNotesSortedByOrder().forEach(note => {
        const tab = document.createElement('div');
        tab.className = 'notes-tab' + (note.id === activeNoteId ? ' active' : '');
        tab.dataset.noteId = note.id;
        tab.draggable = true;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'notes-tab-name';
        nameSpan.textContent = note.name;

        const dot = document.createElement('span');
        dot.className = 'notes-tab-sync-dot';
        const isSyncing = window._keepSyncInFlight?.has(note.id);

        if (!note.keepSync) {
            dot.classList.add('sync-dot--off');
        } else if (note.keepConflict) {
            dot.classList.add('sync-dot--conflict');
            dot.title = 'Sync conflict! Click to resolve.';
            dot.onclick = (e) => { e.stopPropagation(); _openConflictModal(note.id); };
        } else if (isSyncing) {
            dot.classList.add('sync-dot--pending');
            dot.textContent = ICONS.loading;
            dot.title = 'Syncing...';
        } else if (note.keepLocalDirty) {
            dot.classList.add('sync-dot--pending');
            dot.title = 'Sync pending...';
        } else {
            dot.classList.add('sync-dot--ok');
            dot.title = 'In sync with Google Keep';
        }
        if (!googleUser || !currentAccessToken) dot.style.display = 'none';

        const keepBtn = document.createElement('button');
        keepBtn.className = 'btn-icon notes-tab-keep-btn' + (note.keepSync ? ' keep-active' : '');
        keepBtn.textContent = isSyncing ? ICONS.keepSyncing : (note.keepSync ? ICONS.keepSyncOn : ICONS.keepSyncOff);
        keepBtn.title = note.keepSync ? 'Disable Google Keep sync' : 'Enable Google Keep sync';
        if (isSyncing) keepBtn.classList.add('notes-keep-spinning');
        keepBtn.onclick = (e) => { e.stopPropagation(); toggleNoteKeepSync(note.id); };
        if (!googleUser || !currentAccessToken) keepBtn.style.display = 'none';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'notes-tab-close';
        closeBtn.textContent = '×';
        closeBtn.title = 'Delete note';
        closeBtn.addEventListener('click', e => { e.stopPropagation(); deleteNote(note.id); });

        tab.appendChild(nameSpan);
        tab.appendChild(dot);
        tab.appendChild(keepBtn);
        tab.appendChild(closeBtn);

        // Click to open tab
        tab.addEventListener('click', e => {
            if (e.target === closeBtn) return;
            openNoteTab(note.id);
        });

        // Double-click name to rename
        nameSpan.addEventListener('dblclick', e => {
            e.stopPropagation();
            startNoteTabRename(note.id);
        });

        // Drag to reorder
        tab.addEventListener('dragstart', e => {
            _notesDragId = note.id;
            e.dataTransfer.effectAllowed = 'move';
            tab.classList.add('dragging');
        });
        tab.addEventListener('dragend', () => {
            tab.classList.remove('dragging');
            _notesDragId = null;
        });
        tab.addEventListener('dragover', e => {
            if (!_notesDragId || _notesDragId === note.id) return;
            e.preventDefault();
            const rect = tab.getBoundingClientRect();
            tab.classList.toggle('drop-before', e.clientX < rect.left + rect.width / 2);
            tab.classList.toggle('drop-after',  e.clientX >= rect.left + rect.width / 2);
        });
        tab.addEventListener('dragleave', () => {
            tab.classList.remove('drop-before', 'drop-after');
        });
        tab.addEventListener('drop', e => {
            if (!_notesDragId || _notesDragId === note.id) return;
            e.preventDefault();
            tab.classList.remove('drop-before', 'drop-after');

            const sorted = _getNotesSortedByOrder();
            const srcIdx = sorted.findIndex(n => n.id === _notesDragId);
            let tgtIdx  = sorted.findIndex(n => n.id === note.id);
            if (srcIdx === -1 || tgtIdx === -1) return;

            const rect = tab.getBoundingClientRect();
            const insertAfter = e.clientX >= rect.left + rect.width / 2;
            const [moved] = sorted.splice(srcIdx, 1);
            tgtIdx = sorted.findIndex(n => n.id === note.id);
            sorted.splice(insertAfter ? tgtIdx + 1 : tgtIdx, 0, moved);
            sorted.forEach((n, i) => { n.order = i; });
            _notesDragId = null;
            saveData();
            _buildNotesTabs(tabsBar);
        });

        tabsBar.appendChild(tab);
    });
}

// ─── MERMAID HELPERS ─────────────────────────────────────────────

async function _renderMermaidPreview(code, el) {
    const token = ++_mermaidRenderToken;
    if (!window.mermaid || !code.trim()) {
        el.innerHTML = '<span class="notes-mermaid-empty">Start typing a diagram\u2026</span>';
        return;
    }
    try {
        mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, theme: _isAppDark() ? 'dark' : 'default' });
        const id = 'mmd-' + Date.now().toString(36);
        const { svg } = await mermaid.render(id, code);
        if (token !== _mermaidRenderToken) return;
        el.innerHTML = svg;
    } catch (e) {
        if (token !== _mermaidRenderToken) return;
        const msg = (e.message || 'Diagram error').replace(/</g, '&lt;');
        el.innerHTML = `<pre class="notes-mermaid-error">${msg}</pre>`;
    }
}

async function _applyMermaidInMarkdown(previewEl) {
    if (!window.mermaid) return;
    const codeEls = previewEl.querySelectorAll('pre > code.language-mermaid');
    if (!codeEls.length) return;
    mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, theme: _isAppDark() ? 'dark' : 'default' });
    for (const code of codeEls) {
        const pre = code.parentElement;
        try {
            const id = 'mmd-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
            const { svg } = await mermaid.render(id, code.textContent);
            const div = document.createElement('div');
            div.className = 'mermaid-diagram';
            div.innerHTML = svg;
            pre.replaceWith(div);
        } catch (e) {
            // leave the code block as-is on parse error
        }
    }
}

// ─── PREVIEW SPLIT ───────────────────────────────────────────────

function _initPreviewSplit() {
    const cmHost  = document.querySelector('.notes-cm-host');
    const preview = document.querySelector('.notes-preview');
    if (!cmHost || !preview || typeof Split === 'undefined') return;
    _notesPreviewEl = preview;
    const note = findNote(activeNoteId);
    if (note) {
        if (note.language === 'markdown') {
            preview.innerHTML = marked.parse(note.content || '');
            _applyMermaidInMarkdown(preview);
        } else if (note.language === 'mermaid') {
            _renderMermaidPreview(note.content || '', preview);
        }
    }
    _notesSplitInstance = Split([cmHost, preview], {
        sizes:     [50, 50],
        minSize:   [120, 120],
        gutterSize: 5,
        direction: 'horizontal',
    });
}

// ─── CRUD ─────────────────────────────────────────────────────────

function openNoteTab(noteId) {
    if (noteId === activeNoteId) return;
    _notesTrashOpen = false;
    // Save current editor content before switching
    if (window.NotesCM && activeNoteId) {
        const cur = findNote(activeNoteId);
        if (cur) {
            cur.content = NotesCM.getValue();
            cur.updatedAt = new Date().toISOString();
            saveData();
        }
    }
    activeNoteId = noteId;
    const container = _getNotesContainer();
    if (container) renderNotesPanel(container);
}

function addNote(newName) {
    _notesTrashOpen = false;
    const sorted = _getNotesSortedByOrder();
    const maxOrder = sorted.length ? sorted[sorted.length - 1].order : -1;
    const now = new Date().toISOString();
    const newNote = {
        id:        uid(),
        name:      newName || 'New Note',
        content:   '',
        language:  'markdown',
        order:     maxOrder + 1,
        createdAt: now,
        updatedAt: now,
        keepSync:  false,
        keepNoteId: null,
        keepLastSyncedAt: null,
        keepLocalDirty: false,
        keepConflict: false,
    };
    data.notes.push(newNote);
    activeNoteId = newNote.id;
    saveData();
    const container = _getNotesContainer();
    if (container) {
        renderNotesPanel(container);
        requestAnimationFrame(() => startNoteTabRename(newNote.id));
    }
}

function deleteNote(noteId) {
    const note = findNote(noteId);
    if (!note) return;

    // Save current editor content before moving to trash
    if (window.NotesCM && noteId === activeNoteId) {
        note.content = NotesCM.getValue();
        note.updatedAt = new Date().toISOString();
    }

    if (note.keepSync && note.keepNoteId) removeNoteFromKeep(note);   // fire-and-forget

    // Move to trash with deletion timestamp
    if (!data.notesTrash) data.notesTrash = [];
    data.notesTrash.push({ ...note, deletedAt: new Date().toISOString() });

    data.notes = data.notes.filter(n => n.id !== noteId);

    // If all notes were deleted, create a fresh default note
    if (!data.notes.length) {
        const now = new Date().toISOString();
        data.notes = [{ id: uid(), name: 'Note 1', content: '', language: 'markdown', order: 0, createdAt: now, updatedAt: now }];
    }

    // Update activeNoteId if needed
    if (activeNoteId === noteId) {
        activeNoteId = _getNotesSortedByOrder()[0].id;
    }

    saveData();
    const container = _getNotesContainer();
    if (container) renderNotesPanel(container);
    showToast(`${ICONS.delete} Note moved to trash`);
}

function restoreNote(noteId) {
    const note = _findTrashNote(noteId);
    if (!note) return;

    // Remove deletedAt and put back in active notes
    const { deletedAt, ...restored } = note;
    // Give it a fresh order at the end
    const maxOrder = _getNotesSortedByOrder().reduce((m, n) => Math.max(m, n.order), -1);
    restored.order = maxOrder + 1;
    data.notes.push(restored);
    data.notesTrash = data.notesTrash.filter(n => n.id !== noteId);

    activeNoteId = restored.id;
    _notesTrashOpen = false;
    _notesTrashPreviewId = null;
    saveData();
    const container = _getNotesContainer();
    if (container) renderNotesPanel(container);
    showToast(`${ICONS.ok} Note restored`);
}

function permanentlyDeleteNote(noteId) {
    const note = _findTrashNote(noteId);
    if (!note) return;
    showConfirm(
        'Delete permanently?',
        `"${note.name}" will be deleted forever with all its images.`,
        () => {
            const ids = extractUploadIds(note.content || '');
            data.notesTrash = data.notesTrash.filter(n => n.id !== noteId);
            saveData();
            const container = _getNotesContainer();
            if (container) renderNotesPanel(container);
            if (ids.length) {
                Promise.all(ids.map(id => deleteDialImage(id))).then(() => {
                    showToast(`${ICONS.delete} ${ids.length} image${ids.length > 1 ? 's' : ''} removed from storage`);
                }).catch(() => {});
            } else {
                showToast(`${ICONS.delete} Permanently deleted`);
            }
        },
        { btnLabel: 'Delete forever', danger: true }
    );
}

function emptyTrash() {
    if (!data.notesTrash?.length) return;
    showConfirm(
        'Empty trash?',
        'All notes in trash will be permanently deleted along with their images.',
        () => {
            const allIds = data.notesTrash.flatMap(n => extractUploadIds(n.content || ''));
            data.notesTrash = [];
            saveData();
            const container = _getNotesContainer();
            if (container) renderNotesPanel(container);
            if (allIds.length) {
                Promise.all(allIds.map(id => deleteDialImage(id))).then(() => {
                    showToast(`${ICONS.delete} ${allIds.length} image${allIds.length > 1 ? 's' : ''} removed from storage`);
                }).catch(() => {});
            } else {
                showToast(`${ICONS.delete} Trash emptied`);
            }
        },
        { btnLabel: 'Empty trash', danger: true }
    );
}

function _buildTrashPanel(container) {
    const trash = [...(data.notesTrash || [])].sort(
        (a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)
    );

    const panel = document.createElement('div');
    panel.className = 'notes-trash-panel';

    const header = document.createElement('div');
    header.className = 'notes-trash-header';

    const title = document.createElement('span');
    title.className = 'notes-trash-title';
    title.textContent = `${ICONS.delete} Trash`;

    header.appendChild(title);

    if (trash.length) {
        const emptyBtn = document.createElement('button');
        emptyBtn.className = 'btn-icon notes-trash-empty-btn';
        emptyBtn.title = 'Empty trash';
        emptyBtn.textContent = ICONS.sweep;
        emptyBtn.onclick = () => emptyTrash();
        header.appendChild(emptyBtn);
    }

    panel.appendChild(header);

    if (!trash.length) {
        const empty = document.createElement('div');
        empty.className = 'notes-trash-empty';
        empty.textContent = 'Trash is empty';
        panel.appendChild(empty);
    } else {
        const list = document.createElement('div');
        list.className = 'notes-trash-list';

        trash.forEach(note => {
            const row = document.createElement('div');
            row.className = 'notes-trash-row';

            const info = document.createElement('div');
            info.className = 'notes-trash-info';

            const name = document.createElement('span');
            name.className = 'notes-trash-name';
            name.textContent = note.name;

            const daysLeft = Math.ceil((new Date(note.deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000));

            const date = document.createElement('span');
            date.className = 'notes-trash-date';
            date.textContent = `${_formatDeletedAt(note.deletedAt)} · deletes in ${daysLeft}d`;

            info.appendChild(name);
            info.appendChild(date);

            const excerpt = _noteExcerpt(note);
            if (excerpt) {
                const preview = document.createElement('span');
                preview.className = 'notes-trash-preview';
                preview.textContent = excerpt;
                info.appendChild(preview);
            }

            const actions = document.createElement('div');
            actions.className = 'notes-trash-actions';

            const isExpanded = _notesTrashPreviewId === note.id;

            const previewBtn = document.createElement('button');
            previewBtn.className = 'btn-icon notes-trash-preview-btn' + (isExpanded ? ' active' : '');
            previewBtn.title = isExpanded ? 'Hide preview' : 'Preview note';
            previewBtn.textContent = ICONS.preview;
            previewBtn.onclick = () => {
                _notesTrashPreviewId = isExpanded ? null : note.id;
                const c = _getNotesContainer();
                if (c) renderNotesPanel(c);
            };

            const restoreBtn = document.createElement('button');
            restoreBtn.className = 'btn-icon';
            restoreBtn.title = 'Restore';
            restoreBtn.textContent = ICONS.undo;
            restoreBtn.onclick = () => restoreNote(note.id);

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon notes-trash-del-btn';
            delBtn.title = 'Delete permanently';
            delBtn.textContent = ICONS.delete;
            delBtn.onclick = () => permanentlyDeleteNote(note.id);

            actions.appendChild(previewBtn);
            actions.appendChild(restoreBtn);
            actions.appendChild(delBtn);

            row.appendChild(info);
            row.appendChild(actions);
            list.appendChild(row);

            if (isExpanded) {
                const previewEl = document.createElement('div');
                previewEl.className = 'notes-trash-full-preview';
                if (note.language === 'markdown' && window.marked) {
                    previewEl.classList.add('notes-preview');
                    previewEl.innerHTML = marked.parse(note.content || '');
                } else {
                    previewEl.classList.add('notes-trash-full-preview-plain');
                    previewEl.textContent = note.content || '';
                }
                list.appendChild(previewEl);
            }
        });

        panel.appendChild(list);
    }

    container.appendChild(panel);
}

function renameNote(noteId, newName) {
    const note = findNote(noteId);
    if (!note) return;
    const trimmed = (newName || '').trim();
    note.name = trimmed || note.name;
    note.updatedAt = new Date().toISOString();
    saveData();
    if (note.keepSync && !note.keepConflict) debounceKeepSync(note);
    // Partial re-render: tabs scroll area only (leaves + and trash buttons intact)
    const scrollArea = document.querySelector('.notes-tabs-scroll-area');
    if (scrollArea) _buildNotesTabs(scrollArea);
}

function setNoteLanguage(lang) {
    const note = findNote(activeNoteId);
    if (!note || note.language === lang) return;
    note.language = lang;
    note.updatedAt = new Date().toISOString();
    saveData();
    const container = _getNotesContainer();
    if (container) renderNotesPanel(container);
}

function toggleNotesFullScreen() {
    // Mutual exclusion: exit todo fullscreen when entering notes fullscreen
    if (!notesFullScreen && typeof todoFullScreen !== 'undefined' && todoFullScreen) {
        exitTodoFullScreen();
    }
    notesFullScreen = !notesFullScreen;
    document.body.classList.toggle('notes-fullscreen', notesFullScreen);
    const btn = document.querySelector('.notes-fullscreen-btn');
    if (btn) btn.textContent = notesFullScreen ? '⛶' : '⤢';
}

async function _openConflictModal(noteId) {
    const note = findNote(noteId);
    if (!note || !note.keepNoteId) return;

    const modal = document.getElementById('notes-conflict-modal');
    if (!modal) return;

    const localArea = modal.querySelector('.conflict-local');
    const mergeArea = modal.querySelector('.conflict-merge');
    const keepArea  = modal.querySelector('.conflict-keep');
    const saveBtn   = modal.querySelector('.conflict-save-btn');

    localArea.value = note.content;
    mergeArea.value = note.content;
    keepArea.value  = 'Loading from Google Keep...';
    saveBtn.disabled = true;

    openModal('notes-conflict-modal');

    try {
        const keepNote = await _keepFetch(`/${note.keepNoteId}`);
        if (!keepNote || keepNote.status === 404) {
            keepArea.value = 'Note not found in Google Keep.';
            return;
        }
        const keepContent = _decodeKeepBody(keepNote.body?.text?.text || '');
        keepArea.value = keepContent;
        saveBtn.disabled = false;
        
        saveBtn.onclick = async () => {
            await resolveKeepConflict(noteId, mergeArea.value);
            closeModal('notes-conflict-modal');
        };
    } catch (e) {
        keepArea.value = 'Error loading note from Google Keep.';
        console.error(e);
    }
}

async function _openImportKeepModal() {
    const modal = document.getElementById('notes-import-keep-modal');
    if (!modal) return;

    const listContainer = modal.querySelector('.notes-import-keep-list');
    listContainer.innerHTML = '<div style="padding: 20px; text-align: center;">Loading notes from Google Keep...</div>';

    openModal('notes-import-keep-modal');

    const notes = await listKeepNotes();
    listContainer.innerHTML = '';

    if (!notes.length) {
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dimmer);">No notes found in Google Keep</div>';
        return;
    }

    notes.forEach(keepNote => {
        const row = document.createElement('div');
        row.className = 'notes-trash-row';

        const info = document.createElement('div');
        info.className = 'notes-trash-info';

        const name = document.createElement('span');
        name.className = 'notes-trash-name';
        name.textContent = keepNote.title || '(No title)';

        const isChecklist = !keepNote.body?.text;
        const content = keepNote.body?.text?.text || '';
        const preview = document.createElement('span');
        preview.className = 'notes-trash-preview';
        preview.textContent = isChecklist ? '(checklist — not importable)' : (_decodeKeepBody(content).slice(0, 80) + '...');

        info.appendChild(name);
        info.appendChild(preview);

        const actions = document.createElement('div');
        actions.className = 'notes-trash-actions';

        const importBtn = document.createElement('button');
        importBtn.className = 'btn-icon notes-import-btn';
        importBtn.title = 'Import';
        importBtn.textContent = ICONS.keepImport;
        importBtn.disabled = isChecklist;
        importBtn.onclick = async () => {
            await importNoteFromKeep(keepNote);
            closeModal('notes-import-keep-modal');
        };

        actions.appendChild(importBtn);
        row.appendChild(info);
        row.appendChild(actions);
        listContainer.appendChild(row);
    });
}

function startNoteTabRename(noteId) {
    const tab = document.querySelector(`.notes-tab[data-note-id="${noteId}"]`);
    const nameSpan = tab?.querySelector('.notes-tab-name');
    if (!nameSpan) return;
    const originalName = nameSpan.textContent;
    const input = document.createElement('input');
    input.className = 'notes-tab-rename-input';
    input.value = originalName;
    nameSpan.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => renameNote(noteId, input.value || originalName);
    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  input.blur();
        if (e.key === 'Escape') { input.value = originalName; input.blur(); }
        e.stopPropagation();
    });
}

// ─── WINDOW CALLBACKS (called by notes-cm.js) ─────────────────────

// Called by NotesCM on debounced doc change
window._notesCMDocChange = function(content) {
    const note = findNote(activeNoteId);
    if (!note) return;
    const oldIds = extractUploadIds(note.content || '');
    note.content = content;
    note.updatedAt = new Date().toISOString();
    saveData();
    if (note.keepSync && !note.keepConflict) debounceKeepSync(note);
    if (note.language === 'markdown' && _notesPreviewEl) {
        _notesPreviewEl.innerHTML = marked.parse(content);
        _applyMermaidInMarkdown(_notesPreviewEl);
    } else if (note.language === 'mermaid' && _notesPreviewEl) {
        _renderMermaidPreview(content, _notesPreviewEl);
    }
    const newIds = new Set(extractUploadIds(content));
    const removed = oldIds.filter(id => !newIds.has(id));
    if (removed.length) {
        Promise.all(removed.map(id => deleteDialImage(id))).then(() => {
            showToast(`${ICONS.delete} ${removed.length} image${removed.length > 1 ? 's' : ''} removed from storage`);
        }).catch(() => {});
    }
};

// Called by NotesCM image paste/drop and by toolbar 📎 button
window._notesUploadImage = async function(file) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const id = uid() + '.' + ext;
    try {
        await uploadDialImage(id, file);
    } catch (e) {
        showToast(ICONS.error + ' Image upload failed');
        return;
    }
    const md = `![image](/uploads/${id})`;
    if (window.NotesCM) NotesCM.insertAtCursor(md);
    const note = findNote(activeNoteId);
    if (note) {
        note.content = window.NotesCM ? NotesCM.getValue() : note.content + '\n' + md;
        note.updatedAt = new Date().toISOString();
        saveData();
        if (note.language === 'markdown' && _notesPreviewEl) {
            _notesPreviewEl.innerHTML = marked.parse(note.content);
            _applyMermaidInMarkdown(_notesPreviewEl);
        }
    }
};
