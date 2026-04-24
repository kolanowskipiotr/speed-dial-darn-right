/**
 * Builder utilities for backup tests.
 *
 * Use factory functions (makeDial, makeGroup, …) to create individual entities
 * with sensible defaults, then compose them with SnapshotBuilder.
 *
 * Pattern:
 *   const base = new SnapshotBuilder()
 *       .tab(makeTab({ id: 'tab-1' }, [makeGroup({ id: 'grp-1' }, [makeDial({ id: 'dial-1' })])]))
 *       .note(makeNote({ id: 'note-1', content: 'Hello' }))
 *       .build();
 *
 *   const modified = modify(base, snap => { snap.notes[0].content = 'Updated'; });
 *   const diff = calculateDiff(asFullBackup(base), modified);
 */

let _seq = 0;
function uid() { return `t${String(++_seq).padStart(4, '0')}`; }

// ─── Entity factories ────────────────────────────────────────────

function makeDial(overrides = {}) {
    return {
        id: uid(),
        name: 'Dial',
        url: 'https://example.com',
        emoji: '',
        iconType: 'favicon',
        icon: 'https://example.com/favicon.ico',
        visitCount: 0,
        ...overrides
    };
}

function makeGroup(overrides = {}, dials = []) {
    return { id: uid(), name: 'Group', emoji: '📁', dialSize: 140, dials, ...overrides };
}

function makeTab(overrides = {}, groups = []) {
    return { id: uid(), name: 'Tab', emoji: '', isHome: false, groups, ...overrides };
}

function makeTodoItem(overrides = {}) {
    return {
        id: uid(),
        content: 'Todo item',
        isDone: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        doneAt: null,
        order: 1,
        ...overrides
    };
}

function makeTodoList(overrides = {}, items = []) {
    return {
        id: uid(),
        name: 'List',
        emoji: '✅',
        createdAt: '2026-01-01T00:00:00.000Z',
        order: 1,
        items,
        ...overrides
    };
}

function makeNote(overrides = {}) {
    return {
        id: uid(),
        name: 'Note',
        content: '',
        language: 'markdown',
        order: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        taskSync: false,
        taskIds: [],
        taskLastSyncedAt: null,
        taskLocalDirty: false,
        taskConflict: false,
        ...overrides
    };
}

function makeTrashedNote(overrides = {}) {
    return { ...makeNote(), deletedAt: '2026-01-15T12:00:00.000Z', ...overrides };
}

function makeConfig(overrides = {}) {
    return {
        theme: 'dark-yellow',
        logoAnim: true,
        weather: null,
        syncConfig: {
            autoSync: false,
            showModalOnDisconnect: true,
            folderId: null
        },
        ...overrides
    };
}

function makeExportMeta(overrides = {}) {
    return { version: '2.0', exportedAt: '2026-01-01T00:00:00.000Z', imageErrors: 0, ...overrides };
}

// ─── SnapshotBuilder ─────────────────────────────────────────────

class SnapshotBuilder {
    constructor() {
        this._data = {
            tabs: [],
            todoLists: [],
            notes: [],
            notesTrash: [],
            _config: makeConfig(),
            _images: {},
            _exportMeta: makeExportMeta()
        };
    }

    tab(tabObj)         { this._data.tabs.push(tabObj);           return this; }
    todoList(listObj)   { this._data.todoLists.push(listObj);     return this; }
    note(noteObj)       { this._data.notes.push(noteObj);         return this; }
    trashedNote(noteObj){ this._data.notesTrash.push(noteObj);    return this; }

    image(id, b64 = 'data:image/png;base64,ABC123') {
        this._data._images[id] = b64;
        return this;
    }

    config(overrides) {
        Object.assign(this._data._config, overrides);
        return this;
    }

    build() { return JSON.parse(JSON.stringify(this._data)); }
}

// ─── Helpers ────────────────────────────────────────────────────

/** Deep-clone snapshot and apply mutating function, returning the clone. */
function modify(snapshot, fn) {
    const clone = JSON.parse(JSON.stringify(snapshot));
    fn(clone);
    return clone;
}

/** Wrap a snapshot as a full-backup ref accepted by calculateDiff. */
function asFullBackup(snapshot, id = 'bk-001', name = 'backup.full.json') {
    return { id, name, data: snapshot };
}

module.exports = {
    uid,
    makeDial,
    makeGroup,
    makeTab,
    makeTodoItem,
    makeTodoList,
    makeNote,
    makeTrashedNote,
    makeConfig,
    makeExportMeta,
    SnapshotBuilder,
    modify,
    asFullBackup
};
