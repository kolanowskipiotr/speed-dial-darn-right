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
        data.notes = [{
            id: uid(),
            name: 'Note 1',
            content: '',
            language: 'markdown',
            order: 0,
            createdAt: now,
            updatedAt: now,
            taskSync: false,
            taskIds: [],
            taskLastSyncedAt: null,
            taskLocalDirty: false,
            taskConflict: false,
        }];
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
        // Sync ALL notes that have sync enabled — always visible when logged in
        const anySyncing = (data.notes || []).some(n => n.taskSync && window._tasksSyncInFlight?.has(n.id));
        const syncNowBtn = document.createElement('button');
        syncNowBtn.className = 'btn-icon notes-tasks-sync-btn';
        if (anySyncing) syncNowBtn.classList.add('notes-sync-spinning');
        syncNowBtn.title = 'Refresh sync for all notes';
        syncNowBtn.textContent = ICONS.taskSyncing;
        syncNowBtn.onclick = () => syncAllTaskNotes();
        headerActions.appendChild(syncNowBtn);

        // Import from Tasks — always visible when logged in
        const importTasksBtn = document.createElement('button');
        importTasksBtn.className = 'btn-icon notes-import-tasks-btn';
        importTasksBtn.title = 'Import note from Google Tasks';
        importTasksBtn.textContent = ICONS.taskImport;
        importTasksBtn.onclick = () => _openImportTasksModal();
        headerActions.appendChild(importTasksBtn);

        const openTasksUiBtn = document.createElement('button');
        openTasksUiBtn.className = 'btn-icon notes-open-tasks-ui-btn';
        openTasksUiBtn.title = 'Open Google Tasks UI';
        openTasksUiBtn.textContent = ICONS.openExternal;
        openTasksUiBtn.onclick = () => openGoogleTasksUi();
        headerActions.appendChild(openTasksUiBtn);

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
            requestAnimationFrame(_initPreviewSplit);
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
        const isSyncing = window._tasksSyncInFlight?.has(note.id);

        if (!note.taskSync) {
            dot.classList.add('sync-dot--off');
            dot.title = 'Google Tasks sync disabled';
        } else if (note.taskConflict) {
            dot.classList.add('sync-dot--conflict');
            dot.title = 'Sync conflict! Click to resolve.';
            dot.onclick = (e) => { e.stopPropagation(); _openConflictModal(note.id); };
        } else {
            dot.classList.add('sync-dot--ok');
            dot.title = isSyncing ? 'Syncing...' : (note.taskLocalDirty ? 'Sync pending...' : 'Google Tasks sync enabled');
        }
        if (!googleUser || !currentAccessToken) dot.style.display = 'none';

        const tasksBtn = document.createElement('button');
        tasksBtn.className = 'btn-icon notes-tab-tasks-btn' + (note.taskSync ? ' tasks-active' : '');
        tasksBtn.textContent = isSyncing ? ICONS.taskSyncing : (note.taskSync ? ICONS.taskSyncOn : ICONS.taskSyncOff);
        tasksBtn.title = note.taskSync ? 'Disable Google Tasks sync' : 'Enable Google Tasks sync';
        if (isSyncing) tasksBtn.classList.add('notes-sync-spinning');
        tasksBtn.onclick = (e) => { e.stopPropagation(); toggleNoteTasksSync(note.id); };
        if (!googleUser || !currentAccessToken) tasksBtn.style.display = 'none';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'notes-tab-close';
        closeBtn.textContent = '×';
        closeBtn.title = 'Delete note';
        closeBtn.addEventListener('click', e => { e.stopPropagation(); deleteNote(note.id); });

        tab.appendChild(nameSpan);
        tab.appendChild(dot);
        tab.appendChild(tasksBtn);
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
