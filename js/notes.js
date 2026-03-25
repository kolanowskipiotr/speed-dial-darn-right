// ─── NOTES MODULE ─────────────────────────────────────────────────
// Loaded after todo.js, before drag-drop.js. All functions are global.

let _notesSplitInstance = null;  // split.js instance
let _notesPreviewEl = null;      // .notes-preview DOM element ref
let _notesDragId = null;         // id of tab being dragged for reorder
let _pendingNoteFocusId = null;  // note to make active after undo restores it

// ─── HELPERS ─────────────────────────────────────────────────────

function findNote(id) {
    return (data.notes || []).find(n => n.id === id) || null;
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

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-icon notes-add-btn';
    addBtn.title = 'Add new note';
    addBtn.textContent = '＋';
    addBtn.onclick = () => addNote();

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

    headerActions.appendChild(addBtn);
    headerActions.appendChild(infoBtn);
    headerActions.appendChild(fsBtn);
    header.appendChild(title);
    header.appendChild(headerActions);
    panel.appendChild(header);

    // Tabs bar
    const tabsBar = document.createElement('div');
    tabsBar.className = 'notes-tabs-bar';
    _buildNotesTabs(tabsBar);
    panel.appendChild(tabsBar);

    // Split host (editor + optional preview)
    const splitHost = document.createElement('div');
    splitHost.className = 'notes-split-host';

    const cmHost = document.createElement('div');
    cmHost.className = 'notes-cm-host';
    splitHost.appendChild(cmHost);

    if (note.language === 'markdown') {
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
        if (note.language === 'markdown') {
            _initMarkdownSplit();
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
                if (n.language === 'markdown') _initMarkdownSplit();
            }
        }, { once: true });
    }
}

// ── Partial tabs re-render ────────────────────────────────────────

function _buildNotesTabs(tabsBar) {
    tabsBar.innerHTML = '';
    _getNotesSortedByOrder().forEach(note => {
        const tab = document.createElement('div');
        tab.className = 'notes-tab' + (note.id === activeNoteId ? ' active' : '');
        tab.dataset.noteId = note.id;
        tab.draggable = true;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'notes-tab-name';
        nameSpan.textContent = note.name;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'notes-tab-close';
        closeBtn.textContent = '×';
        closeBtn.title = 'Delete note';
        closeBtn.addEventListener('click', e => { e.stopPropagation(); deleteNote(note.id); });

        tab.appendChild(nameSpan);
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

// ─── MARKDOWN SPLIT ──────────────────────────────────────────────

function _initMarkdownSplit() {
    const cmHost  = document.querySelector('.notes-cm-host');
    const preview = document.querySelector('.notes-preview');
    if (!cmHost || !preview || typeof Split === 'undefined') return;
    _notesPreviewEl = preview;
    const note = findNote(activeNoteId);
    if (note) preview.innerHTML = marked.parse(note.content || '');
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

function addNote() {
    const sorted = _getNotesSortedByOrder();
    const maxOrder = sorted.length ? sorted[sorted.length - 1].order : -1;
    const now = new Date().toISOString();
    const newNote = {
        id:        uid(),
        name:      'New Note',
        content:   '',
        language:  'markdown',
        order:     maxOrder + 1,
        createdAt: now,
        updatedAt: now,
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
    if ((data.notes || []).length <= 1) {
        showToast(ICONS.warn + ' Cannot delete the last note');
        return;
    }
    const note = findNote(noteId);
    if (!note) return;

    // Full-data backup for undo; remember which note to re-activate if undo is clicked
    const backup = JSON.stringify(data);
    _pendingNoteFocusId = noteId;

    // Clean up image uploads in note content
    extractUploadIds(note.content || '').forEach(id => deleteDialImage(id));

    data.notes = data.notes.filter(n => n.id !== noteId);

    // Update activeNoteId if needed
    if (activeNoteId === noteId) {
        const sorted = _getNotesSortedByOrder();
        activeNoteId = sorted.length ? sorted[0].id : null;
    }

    saveData();
    const container = _getNotesContainer();
    if (container) renderNotesPanel(container);
    showToastUndo(ICONS.delete + ' Note deleted', backup);
}

function renameNote(noteId, newName) {
    const note = findNote(noteId);
    if (!note) return;
    const trimmed = (newName || '').trim();
    note.name = trimmed || note.name;
    note.updatedAt = new Date().toISOString();
    saveData();
    // Partial re-render: tabs bar only
    const tabsBar = document.querySelector('.notes-tabs-bar');
    if (tabsBar) _buildNotesTabs(tabsBar);
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
    note.content = content;
    note.updatedAt = new Date().toISOString();
    saveData();
    if (note.language === 'markdown' && _notesPreviewEl) {
        _notesPreviewEl.innerHTML = marked.parse(content);
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
        }
    }
};
