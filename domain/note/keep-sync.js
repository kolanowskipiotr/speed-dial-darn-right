// ─── GOOGLE KEEP SYNC ──────────────────────────────────────────────

// Module globals
let _keepSyncTimers = {};   // { [noteId]: timeoutId } — per-note debounce
let _keepSyncInFlight = new Set(); // noteIds currently being synced (lock)
const KEEP_BASE_URL = '/api/keep';
const KEEP_LABEL_DISPLAY_NAME = 'Speed Dial Darn Right';

function _isStaleKeepLabelError(err) {
    const msg = (err?.apiMessage || err?.message || '').toLowerCase();
    return msg.includes('label') && (msg.includes('not found') || msg.includes('invalid'));
}

function _formatKeepSyncError(err, noteName = '') {
    const nameSuffix = noteName ? ` for '${noteName}'` : '';
    const msg = (err?.apiMessage || err?.message || '').toLowerCase();

    if (err?.status === 403 && msg.includes('insufficient authentication scopes')) {
        return `${ICONS.warn} Keep access not granted${nameSuffix}. Log out and log in again.`;
    }
    if (err?.status === 403 && (msg.includes('api has not been used') || msg.includes('is not enabled') || msg.includes('service disabled'))) {
        return `${ICONS.warn} Google Keep API is disabled for this Google project.`;
    }
    if (msg.includes('proxy error') || msg.includes('failed to fetch') || msg.includes('network')) {
        return `${ICONS.error} Keep proxy/network error${nameSuffix}.`;
    }

    const status = err?.status ? ` (HTTP ${err.status})` : '';
    const details = err?.apiMessage ? `: ${err.apiMessage}` : '';
    return `${ICONS.error} Keep sync failed${nameSuffix}${status}${details}`;
}

/**
 * Centralized Keep API fetcher with auth handling
 */
async function _keepFetch(endpoint, options = {}) {
    let path = endpoint;
    if (!path.startsWith('/')) path = '/' + path;
    const url = endpoint.startsWith(KEEP_BASE_URL) ? endpoint : `${KEEP_BASE_URL}${path}`;
    const headers = {
        'Authorization': `Bearer ${currentAccessToken}`,
        'X-Access-Token': currentAccessToken,
        ...options.headers
    };

    try {
        const res = await fetch(url, { ...options, headers });
        if (res.status === 401) {
            if (typeof handleSyncError === 'function') {
                handleSyncError(new Error(res.status.toString()));
            }
            return null;
        }
        if (res.status === 404) return { status: 404 };
        if (!res.ok) {
            const raw = await res.text().catch(() => '');
            let payload = {};
            if (raw) {
                try {
                    payload = JSON.parse(raw);
                } catch {
                    payload = { error: { message: raw } };
                }
            }
            const error = new Error(payload.error?.message || `API Error: ${res.status}`);
            error.status = res.status;
            error.apiMessage = payload.error?.message || '';
            throw error;
        }
        return res.status === 204 ? { ok: true } : res.json();
    } catch (e) {
        console.error(`[keep] Fetch error (${url}):`, e);
        throw e;
    }
}

// ── Label ──────────────────────────────────────────────────────────────────
async function _getOrCreateKeepLabel() {
    if (typeof keepLabelId !== 'undefined' && keepLabelId) return keepLabelId;

    try {
        const data = await _keepFetch('/labels');
        if (!data) return null;

        const existing = data.labels?.find(l => l.displayName === KEEP_LABEL_DISPLAY_NAME);
        if (existing) {
            if (typeof keepLabelId !== 'undefined') keepLabelId = existing.name;
            saveSyncSettings();
            return existing.name;
        }

        const label = await _keepFetch('/labels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: KEEP_LABEL_DISPLAY_NAME })
        });
        if (!label) return null;

        if (typeof keepLabelId !== 'undefined') keepLabelId = label.name;
        saveSyncSettings();
        return label.name;
    } catch (e) {
        console.error('[keep] Could not initialize Google Keep label:', e);
        throw e;
    }
}

async function _createKeepNote(note, labelName) {
    return _keepFetch('/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: note.name,
            body: { text: { text: _encodeKeepBody(note) } },
            labels: [{ name: labelName }]
        })
    });
}

// ── Body encoding helpers ─────────────────────────────────────────────────
function _encodeKeepBody(note) {
    return `speed-dial:${note.id}\n${note.content}`;
}

function _decodeKeepBody(rawText) {
    if (!rawText) return '';
    const match = rawText.match(/^speed-dial:[^\n]+\n/);
    if (match) {
        return rawText.slice(match[0].length);
    }
    return rawText;
}

// ── Local → Keep (push) ────────────────────────────────────────────────────
async function syncNoteToKeep(note) {
    if (!note) return;
    if (_keepSyncInFlight.has(note.id)) return; // Lock: prevent concurrent syncs

    if (typeof currentAccessToken === 'undefined' || !currentAccessToken) {
        showToast(`${ICONS.warn} Log in to Google first to sync with Keep.`);
        return;
    }
    if (note.keepConflict) {
        showToast(`${ICONS.warn} Resolve conflict before syncing '${note.name}'.`);
        return;
    }

    _keepSyncInFlight.add(note.id);
    const scrollArea = document.querySelector('.notes-tabs-scroll-area');
    if (scrollArea) _buildNotesTabs(scrollArea); // Show "syncing" state (TBD CSS)

    try {
        let labelName = await _getOrCreateKeepLabel();
        if (!labelName) return;

        // Every update is a DELETE + POST because Keep API has no update endpoint
        if (note.keepNoteId) {
            await _keepFetch(`/${note.keepNoteId}`, { method: 'DELETE' });
        }

        let keepNote;
        try {
            keepNote = await _createKeepNote(note, labelName);
        } catch (e) {
            if (_isStaleKeepLabelError(e)) {
                keepLabelId = null;
                saveSyncSettings();
                labelName = await _getOrCreateKeepLabel();
                if (!labelName) throw e;
                keepNote = await _createKeepNote(note, labelName);
            } else {
                throw e;
            }
        }

        if (keepNote) {
            note.keepNoteId = keepNote.name;
            note.keepLastSyncedAt = keepNote.updateTime;
            note.keepLocalDirty = false;
            saveData();
        }
    } catch (e) {
        console.error(`[keep] Sync failed for '${note.name}':`, e);
        showToast(_formatKeepSyncError(e, note.name));
    } finally {
        _keepSyncInFlight.delete(note.id);
        if (typeof activeNoteId !== 'undefined' && activeNoteId === note.id) {
            if (scrollArea) _buildNotesTabs(scrollArea);
        }
    }
}

function debounceKeepSync(note) {
    if (_keepSyncTimers[note.id]) clearTimeout(_keepSyncTimers[note.id]);

    note.keepLocalDirty = true;
    const scrollArea = document.querySelector('.notes-tabs-scroll-area');
    if (scrollArea) _buildNotesTabs(scrollArea);

    _keepSyncTimers[note.id] = setTimeout(() => {
        delete _keepSyncTimers[note.id];
        syncNoteToKeep(note);
    }, 5000);
}

// ── Keep → Local (pull / conflict detection) ──────────────────────────────
async function pollNoteFromKeep(note) {
    if (typeof currentAccessToken === 'undefined' || !currentAccessToken || !note.keepNoteId) return;
    if (_keepSyncInFlight.has(note.id)) return; // Skip if currently pushing

    try {
        const keepNote = await _keepFetch(`/${note.keepNoteId}`);
        if (!keepNote) return;

        if (keepNote.status === 404) {
            note.keepNoteId = null;
            note.keepLastSyncedAt = null;
            note.keepLocalDirty = false;
            saveData();
            const scrollArea = document.querySelector('.notes-tabs-scroll-area');
            if (scrollArea) _buildNotesTabs(scrollArea);
            return;
        }

        if (keepNote.updateTime === note.keepLastSyncedAt) return; // No change

        if (!note.keepLocalDirty) {
            // Auto-pull
            note.content = _decodeKeepBody(keepNote.body?.text?.text || '');
            note.keepLastSyncedAt = keepNote.updateTime;
            saveData();
            showToast(`${ICONS.info} Note '${note.name}' updated from Google Keep`);
            if (typeof activeNoteId !== 'undefined' && activeNoteId === note.id && window.NotesCM) {
                window.NotesCM.setValue(note.content);
            }
            const scrollArea = document.querySelector('.notes-tabs-scroll-area');
            if (scrollArea) _buildNotesTabs(scrollArea);
        } else {
            // Conflict detected
            note.keepConflict = true;
            saveData();
            const scrollArea = document.querySelector('.notes-tabs-scroll-area');
            if (scrollArea) _buildNotesTabs(scrollArea);
        }
    } catch (e) {
        console.error('[keep] Poll failed:', e);
    }
}

async function pollAllKeepNotes() {
    if (typeof currentAccessToken === 'undefined' || !currentAccessToken) return;

    const syncedNotes = data.notes.filter(n => n.keepSync && n.keepNoteId);
    if (!syncedNotes.length) return;

    // Parallel polling with Promise.allSettled for maximum throughput
    await Promise.allSettled(syncedNotes.map(note => pollNoteFromKeep(note)));
}

/**
 * Global sync for all enabled Keep notes
 * Triggered from the Data Management modal
 */
async function syncAllKeepNotes() {
    if (typeof currentAccessToken === 'undefined' || !currentAccessToken) {
        showToast(`${ICONS.warn} Log in to Google first.`);
        return;
    }

    const syncedNotes = data.notes.filter(n => n.keepSync);
    if (!syncedNotes.length) {
        showToast(`${ICONS.info} No notes have Keep sync enabled.`);
        return;
    }

    const statusEl = document.getElementById('keepSyncStatus');
    const btn = document.getElementById('keepSyncAllBtn');

    if (statusEl) statusEl.textContent = `Syncing ${syncedNotes.length} notes...`;
    if (btn) btn.disabled = true;

    try {
        // Parallel sync (push for local edits, pull for remote edits)
        await Promise.allSettled(syncedNotes.map(note => {
            // If it has a Keep ID, we poll it first to detect remote changes
            if (note.keepNoteId) return pollNoteFromKeep(note);
            // If it's new, we just push it
            return syncNoteToKeep(note);
        }));

        showToast(`${ICONS.ok} Google Keep sync complete!`);
        if (statusEl) statusEl.textContent = 'Sync successful.';
    } catch (e) {
        console.error('[keep] Global sync failed:', e);
        showToast(`${ICONS.error} Some notes failed to sync.`);
        if (statusEl) statusEl.textContent = 'Sync completed with errors.';
    } finally {
        if (btn) btn.disabled = false;
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    }
}

// ── Conflict resolution ───────────────────────────────────────────────────
async function resolveKeepConflict(noteId, mergedContent) {
    const note = data.notes.find(n => n.id === noteId);
    if (!note) return;

    note.content = mergedContent;
    note.keepConflict = false;
    note.keepLocalDirty = false;
    saveData();

    if (typeof activeNoteId !== 'undefined' && activeNoteId === note.id && window.NotesCM) {
        window.NotesCM.setValue(note.content);
    }

    await syncNoteToKeep(note);
}

// ── Delete ────────────────────────────────────────────────────────────────
async function removeNoteFromKeep(note) {
    if (note.keepNoteId && typeof currentAccessToken !== 'undefined' && currentAccessToken) {
        try {
            await _keepFetch(`/${note.keepNoteId}`, { method: 'DELETE' });
        } catch (e) {}
    }
    note.keepNoteId = null;
    note.keepLastSyncedAt = null;
    note.keepLocalDirty = false;
    note.keepConflict = false;
    saveData();
}

// ── Toggle ────────────────────────────────────────────────────────────────
function toggleNoteKeepSync(noteId) {
    const note = data.notes.find(n => n.id === noteId);
    if (!note) return;

    if (!note.keepSync && (typeof currentAccessToken === 'undefined' || !currentAccessToken)) {
        showToast(`${ICONS.warn} Log in to Google first.`);
        return;
    }

    note.keepSync = !note.keepSync;
    if (note.keepSync) {
        syncNoteToKeep(note);
    } else {
        removeNoteFromKeep(note);
    }
    const scrollArea = document.querySelector('.notes-tabs-scroll-area');
    if (scrollArea) _buildNotesTabs(scrollArea);
}

// ── Import from Keep ──────────────────────────────────────────────────────
async function listKeepNotes() {
    if (typeof currentAccessToken === 'undefined' || !currentAccessToken) return [];
    try {
        const data = await _keepFetch('/notes');
        return data?.notes || [];
    } catch (e) {
        return [];
    }
}

async function importNoteFromKeep(keepNote) {
    const content = _decodeKeepBody(keepNote.body?.text?.text || '');
    const newNote = addNote(keepNote.title || 'Imported Note');
    newNote.content = content;
    newNote.keepSync = true;
    newNote.keepNoteId = keepNote.name;
    newNote.keepLastSyncedAt = keepNote.updateTime;
    newNote.keepLocalDirty = false;

    saveData();
    if (typeof activeNoteId !== 'undefined') activeNoteId = newNote.id;
    renderNotesPanel(_getNotesContainer());
    await syncNoteToKeep(newNote);
}

// ── Expose to window ──────────────────────────────────────────────────────
window.syncNoteToKeep = syncNoteToKeep;
window.debounceKeepSync = debounceKeepSync;
window.pollNoteFromKeep = pollNoteFromKeep;
window.pollAllKeepNotes = pollAllKeepNotes;
window.syncAllKeepNotes = syncAllKeepNotes;
window.resolveKeepConflict = resolveKeepConflict;
window.removeNoteFromKeep = removeNoteFromKeep;
window.toggleNoteKeepSync = toggleNoteKeepSync;
window.listKeepNotes = listKeepNotes;
window.importNoteFromKeep = importNoteFromKeep;
window._decodeKeepBody = _decodeKeepBody;
window.KEEP_BASE_URL = KEEP_BASE_URL;
window._keepSyncInFlight = _keepSyncInFlight;

// ── Polling Setup ─────────────────────────────────────────────────────────
let _lastPollAt = 0;
window.addEventListener('focus', () => {
    if (Date.now() - _lastPollAt < 60_000) return;
    _lastPollAt = Date.now();
    pollAllKeepNotes();
});


