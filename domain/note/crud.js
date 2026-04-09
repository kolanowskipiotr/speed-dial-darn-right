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
