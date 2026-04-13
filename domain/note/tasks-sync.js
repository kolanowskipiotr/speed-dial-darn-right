// ─── GOOGLE TASKS SYNC ─────────────────────────────────────────────

let _tasksSyncTimers = {}; // { [noteId]: timeoutId }
let _tasksSyncInFlight = new Set();
const TASKS_API_BASE = 'https://www.googleapis.com/tasks/v1';
const TASKS_LIST_NAME = 'SDDR - Notes';
const MAX_TASK_LENGTH = 8000;

function _encodeTaskBody(noteId, content) {
    return `speed-dial:${noteId}\n${content || ''}`;
}

function _decodeTaskBody(rawText) {
    if (!rawText) return '';
    const match = rawText.match(/^speed-dial:[^\n]+\n/);
    return match ? rawText.slice(match[0].length) : rawText;
}

function _splitNoteIntoTasks(content) {
    const text = content || '';
    if (text.length <= MAX_TASK_LENGTH) {
        return [{ content: text, partNum: 1, totalParts: 1 }];
    }
    const chunks = [];
    for (let i = 0; i < text.length; i += MAX_TASK_LENGTH) {
        chunks.push(text.slice(i, i + MAX_TASK_LENGTH));
    }
    const totalParts = chunks.length;
    return chunks.map((chunk, idx) => ({ content: chunk, partNum: idx + 1, totalParts }));
}

function _parseTaskTitle(title) {
    const match = (title || '').match(/^\[SDDR\]\s*(.+?)(?:\s+\(part\s+(\d+)\/(\d+)\))?$/i);
    if (!match) return null;
    return {
        name: match[1].trim(),
        partNum: Number(match[2] || 1),
        totalParts: Number(match[3] || 1),
    };
}

function _taskSortKey(task) {
    const parsed = _parseTaskTitle(task.title);
    return parsed ? parsed.partNum : 1;
}

function _reassembleTasksToNote(tasks) {
    const sorted = [...tasks].sort((a, b) => _taskSortKey(a) - _taskSortKey(b));
    const joined = sorted.map(t => _decodeTaskBody(t.notes || '')).join('');
    return joined;
}

function _toIso(ts) {
    if (!ts) return null;
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function _maxUpdated(tasks) {
    return tasks.reduce((max, t) => {
        const cur = _toIso(t.updated);
        if (!cur) return max;
        return (!max || cur > max) ? cur : max;
    }, null);
}

function _isTasksNetworkError(err) {
    const msg = String(err?.message || '');
    return /Failed to fetch|NetworkError|Load failed/i.test(msg);
}

async function _tasksFetch(endpoint, options = {}) {
    if (!currentAccessToken) throw new Error('No access token');
    let path = endpoint || '';
    if (!path.startsWith('/')) path = '/' + path;
    const url = `${TASKS_API_BASE}${path}`;
    const headers = {
        Authorization: `Bearer ${currentAccessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };

    const res = await fetch(url, { ...options, headers });
    if (res.status === 404) return { status: 404 };

    if (!res.ok) {
        const raw = await res.text().catch(() => '');
        let message = `HTTP ${res.status}`;
        try {
            const parsed = JSON.parse(raw || '{}');
            message = parsed.error?.message || message;
        } catch {
            if (raw) message = raw;
        }
        const err = new Error(message);
        err.status = res.status;
        throw err;
    }

    if (res.status === 204) return { ok: true };
    return res.json();
}

async function _getOrCreateTasksList() {
    if (tasksNotesListId) {
        const existing = await _tasksFetch(`/users/@me/lists/${tasksNotesListId}`).catch(() => null);
        if (existing && existing.id) return tasksNotesListId;
        tasksNotesListId = null;
        saveSyncSettings();
    }

    const lists = await _tasksFetch('/users/@me/lists');
    const found = (lists.items || []).find(l => l.title === TASKS_LIST_NAME);
    if (found?.id) {
        tasksNotesListId = found.id;
        saveSyncSettings();
        return tasksNotesListId;
    }

    const created = await _tasksFetch('/users/@me/lists', {
        method: 'POST',
        body: JSON.stringify({ title: TASKS_LIST_NAME }),
    });
    tasksNotesListId = created?.id || null;
    saveSyncSettings();
    return tasksNotesListId;
}

function _tasksTitleForPart(noteName, partNum, totalParts) {
    if (totalParts <= 1) return `[SDDR] ${noteName}`;
    return `[SDDR] ${noteName} (part ${partNum}/${totalParts})`;
}

function _refreshNotesTabs() {
    const scrollArea = document.querySelector('.notes-tabs-scroll-area');
    if (scrollArea) _buildNotesTabs(scrollArea);
    if (typeof updateSyncIndicators === 'function') updateSyncIndicators();
}

async function syncNoteToTasks(note) {
    if (!note) return;
    const currentNote = findNote(note.id);
    if (!currentNote) return;
    if (_tasksSyncInFlight.has(currentNote.id)) return;

    if (!currentAccessToken) {
        showToast(`${ICONS.warn} Log in to Google first.`);
        return;
    }
    if (currentNote.taskConflict) {
        showToast(`${ICONS.warn} Resolve conflict before syncing '${currentNote.name}'.`);
        return;
    }

    _tasksSyncInFlight.add(currentNote.id);
    _refreshNotesTabs();

    try {
        const listId = await _getOrCreateTasksList();
        if (!listId) throw new Error('Could not initialize Google Tasks list.');

        // Pre-push conflict check: if local note is dirty and remote changed meanwhile,
        // mark conflict and stop before destructive delete+recreate.
        if (currentNote.taskLocalDirty && Array.isArray(currentNote.taskIds) && currentNote.taskIds.length && currentNote.taskLastSyncedAt) {
            const remoteParts = [];
            for (const taskId of currentNote.taskIds) {
                const remoteTask = await _tasksFetch(`/lists/${listId}/tasks/${taskId}`);
                if (remoteTask?.status === 404) continue;
                remoteParts.push(remoteTask);
            }
            const remoteUpdatedAt = _maxUpdated(remoteParts);
            if (remoteUpdatedAt && remoteUpdatedAt !== currentNote.taskLastSyncedAt) {
                currentNote.taskConflict = true;
                saveData();
                showToast(`${ICONS.warn} Conflict detected for '${currentNote.name}'. Resolve it before syncing.`);
                return;
            }
        }

        const oldTaskIds = Array.isArray(currentNote.taskIds) ? [...currentNote.taskIds] : [];
        for (const taskId of oldTaskIds) {
            const del = await _tasksFetch(`/lists/${listId}/tasks/${taskId}`, { method: 'DELETE' }).catch(e => e);
            if (del?.status && del.status !== 404) throw del;
        }

        const parts = _splitNoteIntoTasks(currentNote.content || '');
        const created = [];
        for (const part of parts) {
            const payload = {
                title: _tasksTitleForPart(currentNote.name, part.partNum, part.totalParts),
                notes: _encodeTaskBody(currentNote.id, part.content),
            };
            const task = await _tasksFetch(`/lists/${listId}/tasks`, {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            created.push(task);
        }

        currentNote.taskIds = created.map(t => t.id).filter(Boolean);
        currentNote.taskLastSyncedAt = _maxUpdated(created);
        currentNote.taskLocalDirty = false;
        currentNote.taskConflict = false;
        saveData();
    } catch (e) {
        // Keep the dot in pending state after a failed push; otherwise UI may show false "in sync".
        currentNote.taskLocalDirty = true;
        saveData();

        const isNetworkError = _isTasksNetworkError(e);

        if (e?.status === 401 || e?.status === 403) {
            if (typeof handleSyncError === 'function') handleSyncError(new Error(String(e.status)));
            showToast(`${ICONS.warn} Tasks access denied - please log in again.`);
        } else if (isNetworkError) {
            if (typeof handleSyncError === 'function') handleSyncError(e);
        } else {
            showToast(`${ICONS.error} Tasks sync failed for '${currentNote.name}'.`);
        }
        if (!isNetworkError) console.error('[tasks] Sync failed:', e);
    } finally {
        _tasksSyncInFlight.delete(currentNote.id);
        _refreshNotesTabs();
    }
}

function debounceTasksSync(note) {
    if (!note) return;
    if (_tasksSyncTimers[note.id]) clearTimeout(_tasksSyncTimers[note.id]);

    note.taskLocalDirty = true;
    _refreshNotesTabs();

    _tasksSyncTimers[note.id] = setTimeout(() => {
        delete _tasksSyncTimers[note.id];
        const fresh = findNote(note.id);
        if (!fresh || !fresh.taskSync) return;
        syncNoteToTasks(fresh);
    }, 5000);
}

async function pollNoteFromTasks(note) {
    if (!note || !currentAccessToken || !Array.isArray(note.taskIds) || !note.taskIds.length) return;
    if (_tasksSyncInFlight.has(note.id)) return;

    const listId = await _getOrCreateTasksList().catch(() => null);
    if (!listId) return;

    const fetched = [];
    const remainingIds = [];

    for (const taskId of note.taskIds) {
        try {
            const task = await _tasksFetch(`/lists/${listId}/tasks/${taskId}`);
            if (task?.status === 404) continue;
            fetched.push(task);
            remainingIds.push(taskId);
        } catch (e) {
            if (e?.status === 401 || e?.status === 403) {
                if (typeof handleSyncError === 'function') handleSyncError(new Error(String(e.status)));
                return;
            }
            if (e?.status !== 404) console.error('[tasks] Poll failed:', e);
        }
    }

    const idsChanged = JSON.stringify(remainingIds) !== JSON.stringify(note.taskIds || []);
    note.taskIds = remainingIds;

    if (!note.taskIds.length) {
        note.taskLastSyncedAt = null;
        note.taskLocalDirty = false;
        note.taskConflict = false;
        saveData();
        _refreshNotesTabs();
        return;
    }

    const remoteUpdatedAt = _maxUpdated(fetched);
    if (!remoteUpdatedAt || remoteUpdatedAt === note.taskLastSyncedAt) {
        if (idsChanged) {
            saveData();
            _refreshNotesTabs();
        }
        return;
    }

    if (!note.taskLocalDirty) {
        note.content = _reassembleTasksToNote(fetched);
        note.taskLastSyncedAt = remoteUpdatedAt;
        note.taskConflict = false;
        saveData();
        if (activeNoteId === note.id && window.NotesCM) {
            window.NotesCM.setValue(note.content);
        }
        showToast(`${ICONS.info} Note '${note.name}' updated from Google Tasks`);
    } else {
        note.taskConflict = true;
        saveData();
    }

    _refreshNotesTabs();
}

async function pollAllTaskNotes() {
    if (!currentAccessToken) return;
    const syncedNotes = (data.notes || []).filter(n => n.taskSync && Array.isArray(n.taskIds) && n.taskIds.length);
    if (!syncedNotes.length) return;
    await Promise.allSettled(syncedNotes.map(note => pollNoteFromTasks(note)));
}

async function syncAllTaskNotes() {
    if (!currentAccessToken) {
        showToast(`${ICONS.warn} Log in to Google first.`);
        return;
    }

    const syncedNotes = (data.notes || []).filter(n => n.taskSync);
    if (!syncedNotes.length) {
        showToast(`${ICONS.info} No notes have Tasks sync enabled.`);
        return;
    }

    const statusEl = document.getElementById('tasksSyncStatus');
    const btn = document.getElementById('tasksSyncAllBtn');
    if (statusEl) statusEl.textContent = `Syncing ${syncedNotes.length} notes...`;
    if (btn) btn.disabled = true;

    try {
        await Promise.allSettled(syncedNotes.map(note => {
            if (note.taskConflict) return Promise.resolve();
            if (note.taskLocalDirty || !Array.isArray(note.taskIds) || !note.taskIds.length) return syncNoteToTasks(note);
            return pollNoteFromTasks(note);
        }));
        showToast(`${ICONS.ok} Google Tasks sync complete.`);
        if (statusEl) statusEl.textContent = 'Sync successful.';
    } catch (e) {
        showToast(`${ICONS.error} Some notes failed to sync.`);
        if (statusEl) statusEl.textContent = 'Sync completed with errors.';
    } finally {
        if (btn) btn.disabled = false;
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    }
}

async function resolveTaskConflict(noteId, mergedContent) {
    const note = findNote(noteId);
    if (!note) return;

    note.content = mergedContent;
    note.taskConflict = false;
    note.taskLocalDirty = false;
    saveData();

    if (activeNoteId === note.id && window.NotesCM) {
        window.NotesCM.setValue(note.content);
    }

    await syncNoteToTasks(note);
}

async function removeNoteFromTasks(note) {
    if (!note) return;
    if (_tasksSyncTimers[note.id]) {
        clearTimeout(_tasksSyncTimers[note.id]);
        delete _tasksSyncTimers[note.id];
    }

    if (!currentAccessToken) {
        note.taskIds = [];
        note.taskLastSyncedAt = null;
        note.taskLocalDirty = false;
        note.taskConflict = false;
        saveData();
        return;
    }

    const listId = await _getOrCreateTasksList().catch(() => null);
    if (listId && Array.isArray(note.taskIds) && note.taskIds.length) {
        await Promise.allSettled(note.taskIds.map(taskId =>
            _tasksFetch(`/lists/${listId}/tasks/${taskId}`, { method: 'DELETE' }).catch(e => {
                if (e?.status !== 404) throw e;
            })
        ));
    }

    note.taskIds = [];
    note.taskLastSyncedAt = null;
    note.taskLocalDirty = false;
    note.taskConflict = false;
    saveData();
    _refreshNotesTabs();
}

function toggleNoteTasksSync(noteId) {
    const note = findNote(noteId);
    if (!note) return;

    if (!note.taskSync && !currentAccessToken) {
        showToast(`${ICONS.warn} Log in to Google first.`);
        return;
    }

    note.taskSync = !note.taskSync;
    if (note.taskSync) {
        syncNoteToTasks(note);
    } else {
        removeNoteFromTasks(note);
    }
    _refreshNotesTabs();
}

async function listTasksNotes() {
    if (!currentAccessToken) return [];
    const listId = await _getOrCreateTasksList().catch(() => null);
    if (!listId) return [];

    try {
        const payload = await _tasksFetch(`/lists/${listId}/tasks?showDeleted=false`);
        const groups = {};
        for (const task of payload.items || []) {
            // Accept both SDDR-tagged tasks and manually created plain tasks.
            const parsed = _parseTaskTitle(task.title);
            const name     = parsed ? parsed.name : (task.title || '(no title)');
            const partNum  = parsed ? parsed.partNum  : 1;
            const totalParts = parsed ? parsed.totalParts : 1;

            const key = name.toLowerCase();
            if (!groups[key]) groups[key] = { name, parts: [] };
            groups[key].parts.push({
                id: task.id,
                partNum,
                totalParts,
                preview: _decodeTaskBody(task.notes || '').slice(0, 120),
            });
        }

        return Object.values(groups)
            .map(group => ({
                ...group,
                parts: group.parts.sort((a, b) => a.partNum - b.partNum),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        console.error('[tasks] List failed:', e);
        return [];
    }
}

async function importNoteFromTasks(noteGroup) {
    if (!noteGroup?.parts?.length) return;

    const listId = await _getOrCreateTasksList().catch(() => null);
    if (!listId) return;

    const fetched = [];
    for (const part of noteGroup.parts) {
        const task = await _tasksFetch(`/lists/${listId}/tasks/${part.id}`).catch(() => null);
        if (task?.id) fetched.push(task);
    }
    if (!fetched.length) {
        showToast(`${ICONS.warn} Could not import from Google Tasks.`);
        return;
    }

    const content = _reassembleTasksToNote(fetched);
    addNote(noteGroup.name || 'Imported Note');
    const note = findNote(activeNoteId);
    if (!note) return;

    note.content = content;
    note.taskSync = true;
    note.taskIds = fetched.map(t => t.id);
    note.taskLastSyncedAt = _maxUpdated(fetched);
    note.taskLocalDirty = false;
    note.taskConflict = false;
    saveData();

    await syncNoteToTasks(note);

    closeModal('notes-import-tasks-modal');
    const container = _getNotesContainer();
    if (container) renderNotesPanel(container);
}

async function _fetchTasksNoteContentForConflict(note) {
    if (!note || !Array.isArray(note.taskIds) || !note.taskIds.length) return null;
    const listId = await _getOrCreateTasksList().catch(() => null);
    if (!listId) return '';

    const tasks = [];
    for (const taskId of note.taskIds) {
        const task = await _tasksFetch(`/lists/${listId}/tasks/${taskId}`).catch(() => null);
        if (task?.id) tasks.push(task);
    }
    if (!tasks.length) return null;
    return _reassembleTasksToNote(tasks);
}

function openGoogleTasksUi() {
    window.open('https://tasks.google.com/tasks', '_blank', 'noopener,noreferrer');
}

window.syncNoteToTasks = syncNoteToTasks;
window.debounceTasksSync = debounceTasksSync;
window.pollNoteFromTasks = pollNoteFromTasks;
window.pollAllTaskNotes = pollAllTaskNotes;
window.syncAllTaskNotes = syncAllTaskNotes;
window.resolveTaskConflict = resolveTaskConflict;
window.removeNoteFromTasks = removeNoteFromTasks;
window.toggleNoteTasksSync = toggleNoteTasksSync;
window.listTasksNotes = listTasksNotes;
window.importNoteFromTasks = importNoteFromTasks;
window.openGoogleTasksUi = openGoogleTasksUi;
window._fetchTasksNoteContentForConflict = _fetchTasksNoteContentForConflict;
window._tasksSyncInFlight = _tasksSyncInFlight;

let _lastTasksPollAt = 0;
function _onTasksWindowFocus() {
    if (Date.now() - _lastTasksPollAt < 60_000) return;
    _lastTasksPollAt = Date.now();
    pollAllTaskNotes();
}
window.addEventListener('focus', _onTasksWindowFocus);

