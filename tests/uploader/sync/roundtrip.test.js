/**
 * Roundtrip tests: calculateDiff(base → modified) |> applyDiff(base) === modified
 *
 * These tests verify that the diff+restore pipeline reconstructs the intended
 * state for every section of the data model.
 */

const test = require('node:test');
const assert = require('assert');

const { __test__: { calculateDiff } } = require('../../../uploader/sync');
const { applyDiff } = require('../../domain/persistence/sync-backup/helpers/restore-helpers');
const {
    SnapshotBuilder, makeTab, makeGroup, makeDial,
    makeTodoList, makeTodoItem, makeNote, makeTrashedNote,
    modify, asFullBackup
} = require('../../fixtures/builders');

// ─── Helpers ────────────────────────────────────────────────────

function roundtrip(base, modified) {
    const d = calculateDiff(asFullBackup(base), modified);
    return applyDiff(base, d);
}

// ─── Tests ──────────────────────────────────────────────────────

test('Backup roundtrip: calculateDiff → applyDiff', async (t) => {

    await t.test('no-op: unchanged snapshot → restored equals base', () => {
        const base = new SnapshotBuilder()
            .tab(makeTab({ id: 'tab-1', name: 'Work' }))
            .note(makeNote({ id: 'note-1', content: 'Hello' }))
            .todoList(makeTodoList({ id: 'list-1' }, [makeTodoItem({ id: 'item-1' })]))
            .build();
        const restored = roundtrip(base, modify(base, () => {}));
        assert.deepStrictEqual(restored.tabs, base.tabs);
        assert.deepStrictEqual(restored.notes, base.notes);
        assert.deepStrictEqual(restored.todoLists, base.todoLists);
        assert.deepStrictEqual(restored._config, base._config);
    });

    // ── Tabs roundtrip ───────────────────────────────────────────

    await t.test('tab name change roundtrip', () => {
        const base = new SnapshotBuilder()
            .tab(makeTab({ id: 'tab-1', name: 'Old Name' }))
            .build();
        const modified = modify(base, s => { s.tabs[0].name = 'New Name'; });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored.tabs[0].name, 'New Name');
    });

    await t.test('new dial added to group roundtrip', () => {
        const base = new SnapshotBuilder()
            .tab(makeTab({ id: 'tab-1' }, [
                makeGroup({ id: 'grp-1' }, [
                    makeDial({ id: 'dial-1', url: 'https://github.com' })
                ])
            ]))
            .build();
        const modified = modify(base, s => {
            s.tabs[0].groups[0].dials.push(makeDial({ id: 'dial-new', url: 'https://gitlab.com' }));
        });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored.tabs[0].groups[0].dials.length, 2);
        assert.strictEqual(restored.tabs[0].groups[0].dials[1].url, 'https://gitlab.com');
    });

    await t.test('tab deleted roundtrip', () => {
        const base = new SnapshotBuilder()
            .tab(makeTab({ id: 'tab-1', name: 'Keep' }))
            .tab(makeTab({ id: 'tab-2', name: 'Delete me' }))
            .build();
        const modified = modify(base, s => { s.tabs = s.tabs.filter(t => t.id !== 'tab-2'); });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored.tabs.length, 1);
        assert.strictEqual(restored.tabs[0].id, 'tab-1');
    });

    await t.test('group dialSize change roundtrip', () => {
        const base = new SnapshotBuilder()
            .tab(makeTab({ id: 'tab-1' }, [makeGroup({ id: 'grp-1', dialSize: 140 })]))
            .build();
        const modified = modify(base, s => { s.tabs[0].groups[0].dialSize = 200; });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored.tabs[0].groups[0].dialSize, 200);
    });

    // ── Todo roundtrip ───────────────────────────────────────────

    await t.test('new todo item roundtrip', () => {
        const base = new SnapshotBuilder()
            .todoList(makeTodoList({ id: 'list-1' }, [makeTodoItem({ id: 'item-1', content: 'Existing' })]))
            .build();
        const modified = modify(base, s => {
            s.todoLists[0].items.push(makeTodoItem({ id: 'item-2', content: 'New task', order: 2 }));
        });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored.todoLists[0].items.length, 2);
        assert.strictEqual(restored.todoLists[0].items[1].content, 'New task');
    });

    await t.test('item marked done roundtrip', () => {
        const base = new SnapshotBuilder()
            .todoList(makeTodoList({ id: 'list-1' }, [makeTodoItem({ id: 'item-1', isDone: false })]))
            .build();
        const modified = modify(base, s => {
            s.todoLists[0].items[0].isDone = true;
            s.todoLists[0].items[0].doneAt = '2026-04-20T10:00:00.000Z';
        });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored.todoLists[0].items[0].isDone, true);
        assert.strictEqual(restored.todoLists[0].items[0].doneAt, '2026-04-20T10:00:00.000Z');
    });

    await t.test('list metadata + item both changed roundtrip', () => {
        const base = new SnapshotBuilder()
            .todoList(makeTodoList({ id: 'list-1', name: 'Old Name' }, [
                makeTodoItem({ id: 'item-1', content: 'Old content' })
            ]))
            .build();
        const modified = modify(base, s => {
            s.todoLists[0].name = 'New Name';
            s.todoLists[0].items[0].content = 'New content';
        });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored.todoLists[0].name, 'New Name');
        assert.strictEqual(restored.todoLists[0].items[0].content, 'New content');
    });

    await t.test('new list with items roundtrip', () => {
        const base = new SnapshotBuilder().build();
        const modified = modify(base, s => {
            s.todoLists.push(makeTodoList({ id: 'list-new', name: 'Backlog' }, [
                makeTodoItem({ id: 'item-a', content: 'Alpha' }),
                makeTodoItem({ id: 'item-b', content: 'Beta' })
            ]));
        });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored.todoLists.length, 1);
        assert.strictEqual(restored.todoLists[0].name, 'Backlog');
        assert.strictEqual(restored.todoLists[0].items.length, 2);
    });

    // ── Notes roundtrip ──────────────────────────────────────────

    await t.test('note content change roundtrip', () => {
        const base = new SnapshotBuilder()
            .note(makeNote({ id: 'note-1', content: 'Original' }))
            .build();
        const modified = modify(base, s => { s.notes[0].content = 'Updated'; });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored.notes[0].content, 'Updated');
    });

    await t.test('note deleted (moved to trash) roundtrip', () => {
        const base = new SnapshotBuilder()
            .note(makeNote({ id: 'note-1', name: 'To delete' }))
            .build();
        const modified = modify(base, s => {
            const n = s.notes[0];
            s.notes = [];
            s.notesTrash.push({ ...n, deletedAt: '2026-04-20T12:00:00.000Z' });
        });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored.notes.length, 0);
        assert.strictEqual(restored.notesTrash.length, 1);
        assert.strictEqual(restored.notesTrash[0].id, 'note-1');
    });

    await t.test('taskSync fields roundtrip', () => {
        const base = new SnapshotBuilder()
            .note(makeNote({ id: 'note-1', taskSync: false, taskIds: [] }))
            .build();
        const modified = modify(base, s => {
            s.notes[0].taskSync = true;
            s.notes[0].taskIds = ['tasks-abc'];
            s.notes[0].taskLastSyncedAt = '2026-04-20T10:00:00.000Z';
            s.notes[0].taskLocalDirty = false;
            s.notes[0].taskConflict = false;
        });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored.notes[0].taskSync, true);
        assert.deepStrictEqual(restored.notes[0].taskIds, ['tasks-abc']);
        assert.strictEqual(restored.notes[0].taskLastSyncedAt, '2026-04-20T10:00:00.000Z');
    });

    // ── Config & images roundtrip ────────────────────────────────

    await t.test('config change roundtrip', () => {
        const base = new SnapshotBuilder().config({ theme: 'dark-yellow' }).build();
        const modified = modify(base, s => { s._config.theme = 'light-blue'; });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored._config.theme, 'light-blue');
    });

    await t.test('new image added roundtrip', () => {
        const base = new SnapshotBuilder().image('img-a', 'data:image/png;base64,A').build();
        const modified = modify(base, s => { s._images['img-b'] = 'data:image/png;base64,B'; });
        const restored = roundtrip(base, modified);
        assert.strictEqual(restored._images['img-a'], 'data:image/png;base64,A');
        assert.strictEqual(restored._images['img-b'], 'data:image/png;base64,B');
    });

    // ── Full multi-section roundtrip ─────────────────────────────

    await t.test('complex multi-section change roundtrip', () => {
        const base = new SnapshotBuilder()
            .tab(makeTab({ id: 'tab-1', name: 'Work' }, [
                makeGroup({ id: 'grp-1' }, [makeDial({ id: 'dial-1', url: 'https://a.com' })])
            ]))
            .todoList(makeTodoList({ id: 'list-1', name: 'Tasks' }, [
                makeTodoItem({ id: 'item-1', content: 'Do A' })
            ]))
            .note(makeNote({ id: 'note-1', content: 'Meeting notes', taskSync: false }))
            .trashedNote(makeTrashedNote({ id: 'trash-1', name: 'Old draft' }))
            .image('img-1', 'data:image/png;base64,INITIAL')
            .config({ theme: 'dark-yellow' })
            .build();

        const modified = modify(base, s => {
            // Tab: rename
            s.tabs[0].name = 'Development';
            // New dial
            s.tabs[0].groups[0].dials.push(makeDial({ id: 'dial-new', url: 'https://b.com' }));
            // Todo: new item + rename list
            s.todoLists[0].name = 'Sprint Tasks';
            s.todoLists[0].items.push(makeTodoItem({ id: 'item-2', content: 'Do B', order: 2 }));
            // Note: enable taskSync
            s.notes[0].taskSync = true;
            s.notes[0].taskIds = ['task-xyz'];
            // Trash: permanently remove
            s.notesTrash = [];
            // Config: change theme
            s._config.theme = 'light-blue';
            // Image: add new
            s._images['img-2'] = 'data:image/png;base64,NEW';
        });

        const restored = roundtrip(base, modified);

        assert.strictEqual(restored.tabs[0].name, 'Development');
        assert.strictEqual(restored.tabs[0].groups[0].dials.length, 2);
        assert.strictEqual(restored.todoLists[0].name, 'Sprint Tasks');
        assert.strictEqual(restored.todoLists[0].items.length, 2);
        assert.strictEqual(restored.notes[0].taskSync, true);
        assert.deepStrictEqual(restored.notes[0].taskIds, ['task-xyz']);
        assert.strictEqual(restored.notesTrash.length, 0);
        assert.strictEqual(restored._config.theme, 'light-blue');
        assert.strictEqual(restored._images['img-2'], 'data:image/png;base64,NEW');
    });
});
