const test = require('node:test');
const assert = require('assert');

const { __test__: { calculateDiff, hasMeaningfulDiff } } = require('../../../uploader/sync');
const {
    SnapshotBuilder, makeTodoList, makeTodoItem,
    modify, asFullBackup
} = require('../../fixtures/builders');

// ─── Helpers ────────────────────────────────────────────────────

function diff(base, modified) {
    return calculateDiff(asFullBackup(base), modified);
}

function baseWithList(listOverrides = {}, items = []) {
    return new SnapshotBuilder()
        .todoList(makeTodoList({ id: 'list-1', name: 'Tasks', emoji: '✅', order: 1, ...listOverrides }, items))
        .build();
}

function baseWithTwoLists() {
    return new SnapshotBuilder()
        .todoList(makeTodoList({ id: 'list-1', name: 'Work', order: 1 }, [
            makeTodoItem({ id: 'item-1', content: 'First task', order: 1 })
        ]))
        .todoList(makeTodoList({ id: 'list-2', name: 'Personal', order: 2 }, [
            makeTodoItem({ id: 'item-p1', content: 'Buy groceries', order: 1 })
        ]))
        .build();
}

// ─── Tests ──────────────────────────────────────────────────────

test('calculateDiff — todo lists and items', async (t) => {

    // ── No changes ──────────────────────────────────────────────

    await t.test('unchanged snapshot → no todoLists_patch, no todoItems_patch', () => {
        const base = baseWithTwoLists();
        const result = diff(base, modify(base, () => {}));
        assert(!result.todoLists_patch);
        assert(!result.todoItems_patch);
        assert.strictEqual(hasMeaningfulDiff(result), false);
    });

    // ── List metadata changes ────────────────────────────────────

    await t.test('list name change → todoLists_patch.upsert (metadata only, no items)', () => {
        const base = baseWithList({}, [makeTodoItem({ id: 'item-1' })]);
        const modified = modify(base, s => { s.todoLists[0].name = 'Renamed'; });
        const result = diff(base, modified);
        assert(result.todoLists_patch, 'todoLists_patch should exist');
        assert.strictEqual(result.todoLists_patch.upsert.length, 1);
        assert.strictEqual(result.todoLists_patch.upsert[0].name, 'Renamed');
        // Metadata-only patch: items are tracked separately in todoItems_patch
        assert(!result.todoLists_patch.upsert[0].items, 'items should not be embedded in metadata patch');
    });

    await t.test('list emoji change → todoLists_patch', () => {
        const base = baseWithList();
        const modified = modify(base, s => { s.todoLists[0].emoji = '📝'; });
        const result = diff(base, modified);
        assert(result.todoLists_patch);
        assert.strictEqual(result.todoLists_patch.upsert[0].emoji, '📝');
    });

    await t.test('list order change → todoLists_patch', () => {
        const base = baseWithTwoLists();
        const modified = modify(base, s => {
            s.todoLists[0].order = 2;
            s.todoLists[1].order = 1;
        });
        const result = diff(base, modified);
        assert(result.todoLists_patch);
        assert.strictEqual(result.todoLists_patch.upsert.length, 2);
    });

    await t.test('list deleted → todoLists_patch.delete', () => {
        const base = baseWithTwoLists();
        const modified = modify(base, s => { s.todoLists = s.todoLists.filter(l => l.id !== 'list-2'); });
        const result = diff(base, modified);
        assert(result.todoLists_patch);
        assert.strictEqual(result.todoLists_patch.delete.length, 1);
        assert.strictEqual(result.todoLists_patch.delete[0], 'list-2');
    });

    await t.test('new list without items → full list in todoLists_patch.upsert', () => {
        const base = baseWithList();
        const modified = modify(base, s => {
            s.todoLists.push(makeTodoList({ id: 'list-new', name: 'New List', order: 2 }));
        });
        const result = diff(base, modified);
        assert(result.todoLists_patch);
        const newList = result.todoLists_patch.upsert.find(l => l.id === 'list-new');
        assert(newList, 'New list should be in upsert');
        assert(Array.isArray(newList.items), 'items array should be present on new list');
    });

    await t.test('new list with items → full list in todoLists_patch.upsert (items embedded, not separate)', () => {
        const base = baseWithList();
        const modified = modify(base, s => {
            s.todoLists.push(makeTodoList({ id: 'list-new', name: 'Backlog' }, [
                makeTodoItem({ id: 'new-item-1', content: 'Feature A' }),
                makeTodoItem({ id: 'new-item-2', content: 'Feature B' })
            ]));
        });
        const result = diff(base, modified);
        assert(result.todoLists_patch);
        const newList = result.todoLists_patch.upsert.find(l => l.id === 'list-new');
        assert(newList);
        assert.strictEqual(newList.items.length, 2, 'Items must be embedded in the full-list upsert');
        // No separate item-level patch for a brand new list
        assert(!result.todoItems_patch?.['list-new'], 'New list items must not appear in todoItems_patch');
    });

    // ── Item-level changes ───────────────────────────────────────

    await t.test('new item in existing list → todoItems_patch', () => {
        const base = baseWithList({}, [makeTodoItem({ id: 'item-1' })]);
        const modified = modify(base, s => {
            s.todoLists[0].items.push(makeTodoItem({ id: 'item-2', content: 'New task', order: 2 }));
        });
        const result = diff(base, modified);
        assert(result.todoItems_patch, 'todoItems_patch should exist');
        assert(result.todoItems_patch['list-1']);
        assert.strictEqual(result.todoItems_patch['list-1'].upsert.length, 1);
        assert.strictEqual(result.todoItems_patch['list-1'].upsert[0].id, 'item-2');
        assert(!result.todoLists_patch, 'Pure item add should not create todoLists_patch');
    });

    await t.test('item content change → todoItems_patch.upsert', () => {
        const base = baseWithList({}, [makeTodoItem({ id: 'item-1', content: 'Old content' })]);
        const modified = modify(base, s => { s.todoLists[0].items[0].content = 'New content'; });
        const result = diff(base, modified);
        assert(result.todoItems_patch?.['list-1']);
        assert.strictEqual(result.todoItems_patch['list-1'].upsert[0].content, 'New content');
    });

    await t.test('item content with image reference → tracked in todoItems_patch', () => {
        const base = baseWithList({}, [makeTodoItem({ id: 'item-1', content: 'No image' })]);
        const modified = modify(base, s => {
            s.todoLists[0].items[0].content = 'With image: ![screenshot](/uploads/img-001.png)';
            s.todoLists[0].items[0].updatedAt = '2026-04-20T10:00:00.000Z';
        });
        const result = diff(base, modified);
        assert(result.todoItems_patch?.['list-1']);
        assert(result.todoItems_patch['list-1'].upsert[0].content.includes('/uploads/img-001.png'));
    });

    await t.test('item marked done → todoItems_patch (isDone, doneAt, updatedAt all captured)', () => {
        const base = baseWithList({}, [makeTodoItem({ id: 'item-1', isDone: false, doneAt: null })]);
        const modified = modify(base, s => {
            s.todoLists[0].items[0].isDone = true;
            s.todoLists[0].items[0].doneAt = '2026-04-20T10:00:00.000Z';
            s.todoLists[0].items[0].updatedAt = '2026-04-20T10:00:00.000Z';
        });
        const result = diff(base, modified);
        const patched = result.todoItems_patch['list-1'].upsert[0];
        assert.strictEqual(patched.isDone, true);
        assert.strictEqual(patched.doneAt, '2026-04-20T10:00:00.000Z');
    });

    await t.test('item marked undone → todoItems_patch', () => {
        const base = baseWithList({}, [
            makeTodoItem({ id: 'item-1', isDone: true, doneAt: '2026-04-01T00:00:00.000Z' })
        ]);
        const modified = modify(base, s => {
            s.todoLists[0].items[0].isDone = false;
            s.todoLists[0].items[0].doneAt = null;
        });
        const result = diff(base, modified);
        const patched = result.todoItems_patch['list-1'].upsert[0];
        assert.strictEqual(patched.isDone, false);
        assert.strictEqual(patched.doneAt, null);
    });

    await t.test('item order change → todoItems_patch', () => {
        const base = baseWithList({}, [
            makeTodoItem({ id: 'item-1', order: 1 }),
            makeTodoItem({ id: 'item-2', order: 2 })
        ]);
        const modified = modify(base, s => {
            s.todoLists[0].items[0].order = 2;
            s.todoLists[0].items[1].order = 1;
        });
        const result = diff(base, modified);
        assert(result.todoItems_patch?.['list-1']);
        assert.strictEqual(result.todoItems_patch['list-1'].upsert.length, 2, 'Both reordered items in patch');
    });

    await t.test('item deleted → todoItems_patch.delete', () => {
        const base = baseWithList({}, [
            makeTodoItem({ id: 'item-1' }),
            makeTodoItem({ id: 'item-2' })
        ]);
        const modified = modify(base, s => {
            s.todoLists[0].items = s.todoLists[0].items.filter(i => i.id !== 'item-2');
        });
        const result = diff(base, modified);
        assert.strictEqual(result.todoItems_patch['list-1'].delete.length, 1);
        assert.strictEqual(result.todoItems_patch['list-1'].delete[0], 'item-2');
    });

    await t.test('changes in multiple lists → separate entries in todoItems_patch', () => {
        const base = baseWithTwoLists();
        const modified = modify(base, s => {
            s.todoLists[0].items[0].content = 'Updated work task';
            s.todoLists[1].items[0].content = 'Updated personal task';
        });
        const result = diff(base, modified);
        assert(result.todoItems_patch?.['list-1'], 'list-1 items should be patched');
        assert(result.todoItems_patch?.['list-2'], 'list-2 items should be patched');
    });

    await t.test('list metadata + item changes → both todoLists_patch and todoItems_patch', () => {
        const base = baseWithList({}, [makeTodoItem({ id: 'item-1' })]);
        const modified = modify(base, s => {
            s.todoLists[0].name = 'Renamed';
            s.todoLists[0].items[0].content = 'Updated';
        });
        const result = diff(base, modified);
        assert(result.todoLists_patch, 'Metadata change must create todoLists_patch');
        assert(result.todoItems_patch, 'Item change must create todoItems_patch');
    });
});
