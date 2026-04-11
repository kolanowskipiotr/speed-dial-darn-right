// ─── DATA PERSISTENCE ──────────────────────────────────────────
function loadData() {
    try {
        const raw = localStorage.getItem('speedDial_v2');
        if (raw) data = JSON.parse(raw);
    } catch(e) { data = { tabs: [] }; }

    // Migrate old format: { groups: [...] } → { tabs: [{ id, name, groups }] }
    if (data.groups && !data.tabs) {
        data = { tabs: [{ id: uid(), name: 'Home', groups: data.groups }] };
        saveData();
    }
    if (!data.tabs) data = { tabs: [] };
    if (!data.tabs.length) {
        data.tabs.push({ id: uid(), name: 'Start', emoji: '🏠', isHome: true, groups: [] });
        saveData();
    }
    // Ensure one tab is marked as the home tab — prepend a new one if missing
    if (!data.tabs.some(t => t.isHome)) {
        data.tabs.unshift({ id: uid(), name: 'Start', emoji: '🏠', isHome: true, groups: [] });
        saveData();
    }
    activeTabId = data.tabs[0].id;

    // Ensure todoLists exists — create default list on first run
    if (!data.todoLists) {
        const now = new Date().toISOString();
        data.todoLists = [{
            id: uid(),
            name: 'TODO',
            emoji: '✅',
            createdAt: now,
            order: 0,
            items: [],
        }];
        saveData();
    }

    // Ensure notes exists — create default note on first run
    if (!Array.isArray(data.notes)) {
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
    if (!data.notes.length) {
        const now = new Date().toISOString();
        data.notes.push({
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
        });
        saveData();
    }

    // Backfill Tasks sync fields for existing notes.
    let notesTouched = false;
    data.notes.forEach((note, idx) => {
        if (typeof note.taskSync !== 'boolean') { note.taskSync = false; notesTouched = true; }
        if (!Array.isArray(note.taskIds)) { note.taskIds = []; notesTouched = true; }
        if (typeof note.taskLastSyncedAt === 'undefined') { note.taskLastSyncedAt = null; notesTouched = true; }
        if (typeof note.taskLocalDirty !== 'boolean') { note.taskLocalDirty = false; notesTouched = true; }
        if (typeof note.taskConflict !== 'boolean') { note.taskConflict = false; notesTouched = true; }
        if (typeof note.order !== 'number') { note.order = idx; notesTouched = true; }
    });
    if (notesTouched) saveData();

    activeNoteId = [...data.notes].sort((a, b) => a.order - b.order)[0].id;

    // Ensure notesTrash exists
    if (!data.notesTrash) {
        data.notesTrash = [];
        saveData();
    }
}

function getActiveTab() {
    return data.tabs.find(t => t.id === activeTabId) || data.tabs[0];
}

function saveData() {
    localStorage.setItem('speedDial_v2', JSON.stringify(data));
    if (typeof triggerSync === 'function') triggerSync();
}
