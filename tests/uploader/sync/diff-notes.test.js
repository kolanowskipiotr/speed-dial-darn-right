const test = require('node:test');
const assert = require('assert');

const { __test__: { calculateDiff, hasMeaningfulDiff } } = require('../../../uploader/sync');
const {
    SnapshotBuilder, makeNote, makeTrashedNote,
    modify, asFullBackup
} = require('../../fixtures/builders');

// ─── Helpers ────────────────────────────────────────────────────

function diff(base, modified) {
    return calculateDiff(asFullBackup(base), modified);
}

function baseWithNote(overrides = {}) {
    return new SnapshotBuilder()
        .note(makeNote({ id: 'note-1', name: 'Plans', content: 'Hello', ...overrides }))
        .build();
}

function baseWithTrashedNote(overrides = {}) {
    return new SnapshotBuilder()
        .trashedNote(makeTrashedNote({ id: 'trash-1', name: 'Old note', ...overrides }))
        .build();
}

// ─── Tests ──────────────────────────────────────────────────────

test('calculateDiff — notes, trash, and Google Tasks sync fields', async (t) => {

    // ── No changes ──────────────────────────────────────────────

    await t.test('unchanged snapshot → no notes_patch, no notesTrash_patch', () => {
        const base = baseWithNote();
        const result = diff(base, modify(base, () => {}));
        assert(!result.notes_patch);
        assert(!result.notesTrash_patch);
        assert.strictEqual(hasMeaningfulDiff(result), false);
    });

    // ── Note content & metadata ──────────────────────────────────

    await t.test('note content change → notes_patch.upsert', () => {
        const base = baseWithNote({ content: 'Original' });
        const modified = modify(base, s => {
            s.notes[0].content = 'Updated content';
            s.notes[0].updatedAt = '2026-04-20T12:00:00.000Z';
        });
        const result = diff(base, modified);
        assert(result.notes_patch, 'notes_patch should exist');
        assert.strictEqual(result.notes_patch.upsert.length, 1);
        assert.strictEqual(result.notes_patch.upsert[0].content, 'Updated content');
    });

    await t.test('note name change → notes_patch', () => {
        const base = baseWithNote();
        const modified = modify(base, s => { s.notes[0].name = 'Renamed Note'; });
        const result = diff(base, modified);
        assert(result.notes_patch);
        assert.strictEqual(result.notes_patch.upsert[0].name, 'Renamed Note');
    });

    await t.test('note language change → notes_patch', () => {
        const base = baseWithNote({ language: 'markdown' });
        const modified = modify(base, s => { s.notes[0].language = 'javascript'; });
        const result = diff(base, modified);
        assert(result.notes_patch);
        assert.strictEqual(result.notes_patch.upsert[0].language, 'javascript');
    });

    await t.test('note order change → notes_patch', () => {
        const base = new SnapshotBuilder()
            .note(makeNote({ id: 'note-1', order: 1 }))
            .note(makeNote({ id: 'note-2', order: 2 }))
            .build();
        const modified = modify(base, s => { s.notes[0].order = 2; s.notes[1].order = 1; });
        const result = diff(base, modified);
        assert(result.notes_patch);
        assert.strictEqual(result.notes_patch.upsert.length, 2);
    });

    await t.test('note with image reference in content → notes_patch captures full content', () => {
        const base = baseWithNote({ content: 'No image' });
        const modified = modify(base, s => {
            s.notes[0].content = '# Header\n\n![diagram](/uploads/diagram-001.png)';
        });
        const result = diff(base, modified);
        assert(result.notes_patch);
        assert(result.notes_patch.upsert[0].content.includes('/uploads/diagram-001.png'));
    });

    await t.test('new note → notes_patch.upsert', () => {
        const base = baseWithNote();
        const modified = modify(base, s => {
            s.notes.push(makeNote({ id: 'note-new', name: 'New Note', content: 'Brand new' }));
        });
        const result = diff(base, modified);
        assert(result.notes_patch);
        assert.strictEqual(result.notes_patch.upsert.length, 1);
        assert.strictEqual(result.notes_patch.upsert[0].id, 'note-new');
    });

    await t.test('note deleted (moved to trash) → notes_patch.delete + notesTrash_patch.upsert', () => {
        const base = baseWithNote();
        const modified = modify(base, s => {
            const note = s.notes[0];
            s.notes = [];
            s.notesTrash.push({ ...note, deletedAt: '2026-04-20T12:00:00.000Z' });
        });
        const result = diff(base, modified);
        assert(result.notes_patch, 'notes_patch should exist for deleted note');
        assert.strictEqual(result.notes_patch.delete.length, 1);
        assert.strictEqual(result.notes_patch.delete[0], 'note-1');
        assert(result.notesTrash_patch, 'notesTrash_patch should exist for newly trashed note');
        assert.strictEqual(result.notesTrash_patch.upsert.length, 1);
        assert.strictEqual(result.notesTrash_patch.upsert[0].deletedAt, '2026-04-20T12:00:00.000Z');
    });

    await t.test('unchanged notes not included in notes_patch', () => {
        const base = new SnapshotBuilder()
            .note(makeNote({ id: 'note-1', content: 'Unchanged' }))
            .note(makeNote({ id: 'note-2', content: 'Will change' }))
            .build();
        const modified = modify(base, s => { s.notes[1].content = 'Changed'; });
        const result = diff(base, modified);
        assert(result.notes_patch);
        const upsertedIds = result.notes_patch.upsert.map(n => n.id);
        assert(!upsertedIds.includes('note-1'), 'Unchanged note must not appear in patch');
        assert(upsertedIds.includes('note-2'));
    });

    // ── Notes trash ──────────────────────────────────────────────

    await t.test('trashed note content change → notesTrash_patch', () => {
        const base = baseWithTrashedNote({ content: 'Old trashed content' });
        const modified = modify(base, s => { s.notesTrash[0].content = 'Updated trashed content'; });
        const result = diff(base, modified);
        assert(result.notesTrash_patch);
        assert.strictEqual(result.notesTrash_patch.upsert[0].content, 'Updated trashed content');
    });

    await t.test('trashed note permanently deleted → notesTrash_patch.delete', () => {
        const base = baseWithTrashedNote();
        const modified = modify(base, s => { s.notesTrash = []; });
        const result = diff(base, modified);
        assert(result.notesTrash_patch);
        assert.strictEqual(result.notesTrash_patch.delete.length, 1);
        assert.strictEqual(result.notesTrash_patch.delete[0], 'trash-1');
    });

    await t.test('trashed note restored (moved back to notes) → notesTrash_patch.delete + notes_patch.upsert', () => {
        const trashedNote = makeTrashedNote({ id: 'trash-1', name: 'Restored' });
        const base = new SnapshotBuilder().trashedNote(trashedNote).build();
        const modified = modify(base, s => {
            const { deletedAt, ...restored } = s.notesTrash[0];
            s.notesTrash = [];
            s.notes.push(restored);
        });
        const result = diff(base, modified);
        assert(result.notesTrash_patch?.delete.includes('trash-1'));
        assert(result.notes_patch?.upsert.some(n => n.id === 'trash-1'));
    });

    await t.test('no trash changes → no notesTrash_patch', () => {
        const base = baseWithTrashedNote();
        const result = diff(base, modify(base, () => {}));
        assert(!result.notesTrash_patch);
    });

    // ── Google Tasks sync fields ─────────────────────────────────

    await t.test('taskSync enabled (false → true) → notes_patch with taskSync:true', () => {
        const base = baseWithNote({ taskSync: false, taskIds: [] });
        const modified = modify(base, s => {
            s.notes[0].taskSync = true;
            s.notes[0].taskIds = ['google-task-abc123'];
            s.notes[0].taskLastSyncedAt = '2026-04-20T10:00:00.000Z';
        });
        const result = diff(base, modified);
        assert(result.notes_patch);
        const patched = result.notes_patch.upsert[0];
        assert.strictEqual(patched.taskSync, true);
        assert.deepStrictEqual(patched.taskIds, ['google-task-abc123']);
        assert.strictEqual(patched.taskLastSyncedAt, '2026-04-20T10:00:00.000Z');
    });

    await t.test('taskIds change (chunked note gets new chunk ID) → notes_patch', () => {
        const base = baseWithNote({ taskSync: true, taskIds: ['task-id-1'] });
        const modified = modify(base, s => { s.notes[0].taskIds = ['task-id-1', 'task-id-2']; });
        const result = diff(base, modified);
        assert(result.notes_patch);
        assert.deepStrictEqual(result.notes_patch.upsert[0].taskIds, ['task-id-1', 'task-id-2']);
    });

    await t.test('taskLocalDirty change → notes_patch', () => {
        const base = baseWithNote({ taskSync: true, taskLocalDirty: false });
        const modified = modify(base, s => { s.notes[0].taskLocalDirty = true; });
        const result = diff(base, modified);
        assert(result.notes_patch);
        assert.strictEqual(result.notes_patch.upsert[0].taskLocalDirty, true);
    });

    await t.test('taskConflict change → notes_patch', () => {
        const base = baseWithNote({ taskSync: true, taskConflict: false });
        const modified = modify(base, s => { s.notes[0].taskConflict = true; });
        const result = diff(base, modified);
        assert(result.notes_patch);
        assert.strictEqual(result.notes_patch.upsert[0].taskConflict, true);
    });

    await t.test('taskLastSyncedAt update after successful sync → notes_patch', () => {
        const base = baseWithNote({ taskSync: true, taskLastSyncedAt: '2026-04-19T10:00:00.000Z', taskLocalDirty: true });
        const modified = modify(base, s => {
            s.notes[0].taskLastSyncedAt = '2026-04-20T10:00:00.000Z';
            s.notes[0].taskLocalDirty = false;
        });
        const result = diff(base, modified);
        assert(result.notes_patch);
        const patched = result.notes_patch.upsert[0];
        assert.strictEqual(patched.taskLastSyncedAt, '2026-04-20T10:00:00.000Z');
        assert.strictEqual(patched.taskLocalDirty, false);
    });

    await t.test('fully synced note with no changes → no notes_patch', () => {
        const base = baseWithNote({
            taskSync: true,
            taskIds: ['task-id-1'],
            taskLastSyncedAt: '2026-04-20T10:00:00.000Z',
            taskLocalDirty: false,
            taskConflict: false
        });
        const result = diff(base, modify(base, () => {}));
        assert(!result.notes_patch);
    });
});
