// ─── CRUD ─────────────────────────────────────────────────────────

function openNoteTab(noteId) {
    // If trash is open: clicking any tab (even the active one) should close trash
    if (_notesTrashOpen) {
        _notesTrashOpen = false;
        activeNoteId = noteId;
        const container = _getNotesContainer();
        if (container) renderNotesPanel(container);
        return;
    }
    if (noteId === activeNoteId) return;
    // Save current editor content before switching (only when editor is actually mounted)
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
        taskSync: false,
        taskIds: [],
        taskLastSyncedAt: null,
        taskLocalDirty: false,
        taskConflict: false,
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

    if (note.taskSync && note.taskIds?.length) removeNoteFromTasks(note); // fire-and-forget

    // Move to trash with deletion timestamp
    if (!data.notesTrash) data.notesTrash = [];
    data.notesTrash.push({ ...note, deletedAt: new Date().toISOString() });

    data.notes = data.notes.filter(n => n.id !== noteId);

    // If all notes were deleted, create a fresh default note
    if (!data.notes.length) {
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
        (a, b) => new Date(a.deletedAt) - new Date(b.deletedAt)
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
    if (note.taskSync && !note.taskConflict) debounceTasksSync(note);
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

function _splitConflictLines(text) {
    return String(text || '').replace(/\r\n/g, '\n').split('\n');
}

function _computeChangedLineSet(aText, bText) {
    const a = _splitConflictLines(aText);
    const b = _splitConflictLines(bText);
    const maxLen = Math.max(a.length, b.length);
    const changed = new Set();
    for (let i = 0; i < maxLen; i += 1) {
        if ((a[i] || '') !== (b[i] || '')) changed.add(i + 1);
    }
    return changed;
}

function _unionLineSets(a, b) {
    const out = new Set(a);
    b.forEach(line => out.add(line));
    return out;
}

function _buildConflictLineGradients(textarea, lineSet, color) {
    if (!textarea || !lineSet?.size) return 'none';
    const style = getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight) || 18;
    const padTop = parseFloat(style.paddingTop) || 8;

    return [...lineSet]
        .sort((a, b) => a - b)
        .map(lineNum => {
            const top = padTop + (lineNum - 1) * lineHeight;
            const bottom = top + lineHeight;
            return `linear-gradient(to bottom, transparent ${top}px, ${color} ${top}px, ${color} ${bottom}px, transparent ${bottom}px)`;
        })
        .join(',');
}

function _replaceConflictLine(text, lineNum, nextLine) {
    const lines = _splitConflictLines(text);
    while (lines.length < lineNum) lines.push('');
    lines[lineNum - 1] = nextLine || '';
    return lines.join('\n');
}

function _renderConflictLineActions(localArea, mergeArea, remoteArea, lineSet) {
    const modal = document.getElementById('notes-conflict-modal');
    if (!modal) return;

    const leftInner  = modal.querySelector('#conflictGutterLeft .conflict-gutter-inner');
    const rightInner = modal.querySelector('#conflictGutterRight .conflict-gutter-inner');
    if (!leftInner || !rightInner) return;

    leftInner.innerHTML  = '';
    rightInner.innerHTML = '';
    if (!lineSet?.size) return;

    const localLines  = _splitConflictLines(localArea.value  || '');
    const remoteLines = _splitConflictLines(remoteArea.value || '');

    const style     = getComputedStyle(mergeArea);
    const lineHeight = parseFloat(style.lineHeight) || 18;
    const padTop     = parseFloat(style.paddingTop)  || 8;
    const scrollTop  = mergeArea.scrollTop;

    // Offset from gutter-inner top to first text line inside the adjacent textarea.
    // The gutter has no label — its inner starts at the same Y as the pane top,
    // so we need to skip past the label+gap height.
    const mergePane = mergeArea.closest('.conflict-pane') || mergeArea.parentElement;
    const labelEl   = mergePane?.querySelector('label');
    const labelOffset = labelEl ? (labelEl.offsetHeight + 4) : 0; // 4px = flex gap

    [...lineSet].sort((a, b) => a - b).forEach(lineNum => {
        const top = labelOffset + padTop + (lineNum - 1) * lineHeight - scrollTop + (lineHeight - 16) / 2;

        // >> button in LEFT gutter  →  copies local line into merge
        const leftBtn = document.createElement('button');
        leftBtn.type  = 'button';
        leftBtn.className = 'conflict-gutter-btn';
        leftBtn.title     = `Use line ${lineNum} from local (left)`;
        leftBtn.textContent = '»';
        leftBtn.style.top   = `${top}px`;
        leftBtn.onclick = (e) => {
            e.stopPropagation();
            mergeArea.value = _replaceConflictLine(mergeArea.value || '', lineNum, localLines[lineNum - 1] || '');
            _refreshConflictLineHighlights(localArea, mergeArea, remoteArea);
        };
        leftInner.appendChild(leftBtn);

        // << button in RIGHT gutter  →  copies remote line into merge
        const rightBtn = document.createElement('button');
        rightBtn.type  = 'button';
        rightBtn.className = 'conflict-gutter-btn';
        rightBtn.title     = `Use line ${lineNum} from Google Tasks (right)`;
        rightBtn.textContent = '«';
        rightBtn.style.top   = `${top}px`;
        rightBtn.onclick = (e) => {
            e.stopPropagation();
            mergeArea.value = _replaceConflictLine(mergeArea.value || '', lineNum, remoteLines[lineNum - 1] || '');
            _refreshConflictLineHighlights(localArea, mergeArea, remoteArea);
        };
        rightInner.appendChild(rightBtn);
    });
}

function _refreshConflictLineHighlights(localArea, mergeArea, remoteArea) {
    if (!localArea || !mergeArea || !remoteArea) return;

    const localText = localArea.value || '';
    const remoteText = remoteArea.value || '';
    const mergeText = mergeArea.value || '';

    const changedLocalRemote = _computeChangedLineSet(localText, remoteText);
    const mergeVsLocal = _computeChangedLineSet(mergeText, localText);
    const mergeVsRemote = _computeChangedLineSet(mergeText, remoteText);
    const changedMerge = _unionLineSets(mergeVsLocal, mergeVsRemote);

    localArea.style.setProperty('--conflict-line-gradients', _buildConflictLineGradients(localArea, changedLocalRemote, 'var(--surface3)'));
    remoteArea.style.setProperty('--conflict-line-gradients', _buildConflictLineGradients(remoteArea, changedLocalRemote, 'var(--surface3)'));
    mergeArea.style.setProperty('--conflict-line-gradients', _buildConflictLineGradients(mergeArea, changedMerge, 'var(--accent2)'));
    _renderConflictLineActions(localArea, mergeArea, remoteArea, changedMerge);
}

async function _openConflictModal(noteId) {
    const note = findNote(noteId);
    if (!note || !note.taskIds?.length) return;

    const modal = document.getElementById('notes-conflict-modal');
    if (!modal) return;

    const localArea = modal.querySelector('.conflict-local');
    const mergeArea = modal.querySelector('.conflict-merge');
    const remoteArea = modal.querySelector('.conflict-remote');
    const saveBtn   = modal.querySelector('.conflict-save-btn');

    localArea.value = note.content;
    mergeArea.value = note.content;
    remoteArea.value = 'Loading from Google Tasks...';
    _refreshConflictLineHighlights(localArea, mergeArea, remoteArea);
    mergeArea.oninput = () => _refreshConflictLineHighlights(localArea, mergeArea, remoteArea);
    mergeArea.onscroll = () => _refreshConflictLineHighlights(localArea, mergeArea, remoteArea);
    saveBtn.disabled = true;

    openModal('notes-conflict-modal');

    try {
        const tasksContent = await _fetchTasksNoteContentForConflict(note);
        if (tasksContent === null) {
            remoteArea.value = 'Note not found in Google Tasks.';
            return;
        }
        remoteArea.value = tasksContent;
        _refreshConflictLineHighlights(localArea, mergeArea, remoteArea);
        saveBtn.disabled = false;

        saveBtn.onclick = async () => {
            await resolveTaskConflict(noteId, mergeArea.value);
            closeModal('notes-conflict-modal');
        };
    } catch (e) {
        remoteArea.value = 'Error loading note from Google Tasks.';
        console.error(e);
    }
}

async function _openImportTasksModal() {
    const modal = document.getElementById('notes-import-tasks-modal');
    if (!modal) return;

    const listContainer = modal.querySelector('.notes-import-tasks-list');
    listContainer.innerHTML = '<div style="padding: 20px; text-align: center;">Loading notes from Google Tasks...</div>';

    openModal('notes-import-tasks-modal');

    const notes = await listTasksNotes();
    listContainer.innerHTML = '';

    if (!notes.length) {
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dimmer);">No notes found in Google Tasks</div>';
        return;
    }

    notes.forEach(noteGroup => {
        const row = document.createElement('div');
        row.className = 'notes-trash-row';

        const info = document.createElement('div');
        info.className = 'notes-trash-info';

        const name = document.createElement('span');
        name.className = 'notes-trash-name';
        name.textContent = noteGroup.name || '(No title)';

        const preview = document.createElement('span');
        preview.className = 'notes-trash-preview';
        const totalParts = noteGroup.parts?.length || 0;
        const firstPreview = noteGroup.parts?.[0]?.preview || '';
        preview.textContent = `${totalParts} part${totalParts === 1 ? '' : 's'}${firstPreview ? ` · ${firstPreview}` : ''}`;

        info.appendChild(name);
        info.appendChild(preview);

        const actions = document.createElement('div');
        actions.className = 'notes-trash-actions';

        const importBtn = document.createElement('button');
        importBtn.className = 'btn-icon notes-import-btn';
        importBtn.title = 'Import';
        importBtn.textContent = ICONS.taskImport;
        importBtn.onclick = async () => {
            await importNoteFromTasks(noteGroup);
            closeModal('notes-import-tasks-modal');
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
    const fitInput = () => { input.style.width = `${Math.max(input.value.length, 4) + 1}ch`; };
    fitInput();
    input.addEventListener('input', fitInput);
    tab.classList.add('renaming');
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
    if (note.taskSync && !note.taskConflict) debounceTasksSync(note);
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
