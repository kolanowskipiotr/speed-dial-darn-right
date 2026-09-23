/**
 * Todo ordering (data.todoListOrder / list.itemOrder) end-to-end with backups:
 * real todo CRUD → real server calculateDiff → JSON → real client applyDiff.
 */

const test = require('node:test');
const assert = require('assert');

const { __test__: { calculateDiff, hasMeaningfulDiff } } = require('../../../uploader/sync');
const { createTodoHarness, loadClientApplyDiff, clone } = require('./helpers/load-todo');

const applyDiff = loadClientApplyDiff();

// ─── Helpers ────────────────────────────────────────────────────

function emptyData() {
    return { tabs: [], todoLists: [], notes: [], notesTrash: [], monitoredPages: [], _config: {}, _images: {} };
}

/** Harness with two lists: A (a1, a2, a3) and B (b1), normalized as after loadData(). */
function setup() {
    const h = createTodoHarness(emptyData());
    h.normalize();
    const A = h.ops.createList('A');
    const B = h.ops.createList('B');
    const a1 = h.ops.addItem(A, 'a1');
    const a2 = h.ops.addItem(A, 'a2');
    const a3 = h.ops.addItem(A, 'a3');
    const b1 = h.ops.addItem(B, 'b1');
    return { h, A, B, a1, a2, a3, b1 };
}

function snapshot(h) {
    return clone(h.data);
}

/** Diff against a full backup, serialized as JSON like the Drive upload. */
function diffFrom(full, h) {
    const d = calculateDiff({ id: 'full-1', name: 'backup.full.json', data: clone(full) }, snapshot(h));
    return JSON.parse(JSON.stringify(d));
}

function restoreFrom(full, diff) {
    return clone(applyDiff(clone(full), diff));
}

function assertInvariants(data) {
    const listIds = data.todoLists.map(l => l.id);
    assert.deepStrictEqual([...data.todoListOrder].sort(), [...listIds].sort(), 'todoListOrder must list every list exactly once');
    assert.strictEqual(new Set(data.todoListOrder).size, data.todoListOrder.length, 'no duplicate list ids');
    for (const list of data.todoLists) {
        assert(!('order' in list), `list ${list.id} must not carry legacy order`);
        const activeIds = list.items.filter(i => !i.isDone).map(i => i.id);
        assert.deepStrictEqual([...list.itemOrder].sort(), [...activeIds].sort(),
            `list ${list.id}: itemOrder must hold exactly the active items`);
        assert.strictEqual(new Set(list.itemOrder).size, list.itemOrder.length, 'no duplicate item ids');
        for (const item of list.items) assert(!('order' in item), `item ${item.id} must not carry legacy order`);
        const allIds = data.todoLists.flatMap(l => l.items.map(i => i.id));
        assert.strictEqual(new Set(allIds).size, allIds.length, 'item ids unique across lists');
    }
}

/** Restoring full + diff must reproduce current data exactly and need no repair. */
function assertRoundtrip(full, h) {
    const restored = restoreFrom(full, diffFrom(full, h));
    assert.deepStrictEqual(restored.todoLists, h.data.todoLists, 'restored todoLists equal current');
    assert.deepStrictEqual(restored.todoListOrder, h.data.todoListOrder, 'restored todoListOrder equals current');
    return restored;
}

// ─── Tests ──────────────────────────────────────────────────────

test('todo ordering — CRUD keeps order arrays consistent', async (t) => {

    await t.test('new lists and items append in creation order', () => {
        const { h, A, B, a1, a2, a3, b1 } = setup();
        assertInvariants(h.data);
        assert.deepStrictEqual(h.orderedListIds(), [A, B]);
        assert.deepStrictEqual(h.orderedActiveIds(A), [a1, a2, a3]);
        assert.deepStrictEqual(h.orderedActiveIds(B), [b1]);
    });

    await t.test('item added at top goes first', () => {
        const { h, A, a1, a2, a3 } = setup();
        const top = h.ops.addItem(A, 'top', 'top');
        assert.deepStrictEqual(h.orderedActiveIds(A), [top, a1, a2, a3]);
        assertInvariants(h.data);
    });

    await t.test('drag item before / after target', () => {
        const { h, A, a1, a2, a3 } = setup();
        h.ops.reorderItem(a3, A, a1, true);
        assert.deepStrictEqual(h.orderedActiveIds(A), [a3, a1, a2]);
        h.ops.reorderItem(a3, A, a2, false);
        assert.deepStrictEqual(h.orderedActiveIds(A), [a1, a2, a3]);
        assertInvariants(h.data);
    });

    await t.test('drag onto itself / unknown target is a no-op', () => {
        const { h, A, a1, a2, a3 } = setup();
        h.ops.reorderItem(a2, A, a2, true);
        h.ops.reorderItem(a2, A, 'missing', true);
        assert.deepStrictEqual(h.orderedActiveIds(A), [a1, a2, a3]);
    });

    await t.test('move item to top / bottom', () => {
        const { h, A, a1, a2, a3 } = setup();
        h.ops.moveToPosition(a3, A, 'top');
        assert.deepStrictEqual(h.orderedActiveIds(A), [a3, a1, a2]);
        h.ops.moveToPosition(a3, A, 'bottom');
        assert.deepStrictEqual(h.orderedActiveIds(A), [a1, a2, a3]);
        assertInvariants(h.data);
    });

    await t.test('done item leaves itemOrder; reopened item returns at the top', () => {
        const { h, A, a1, a2, a3 } = setup();
        h.ops.toggleDone(a3);
        assert.deepStrictEqual(h.orderedActiveIds(A), [a1, a2]);
        assertInvariants(h.data);
        h.ops.toggleDone(a3);
        assert.deepStrictEqual(h.orderedActiveIds(A), [a3, a1, a2]);
        assertInvariants(h.data);
    });

    await t.test('delete item removes it from itemOrder', () => {
        const { h, A, a1, a3, a2 } = setup();
        h.ops.deleteItem(a2);
        assert.deepStrictEqual(h.orderedActiveIds(A), [a1, a3]);
        assertInvariants(h.data);
    });

    await t.test('move active item to another list lands at its top', () => {
        const { h, A, B, a1, a2, a3, b1 } = setup();
        h.ops.moveToList(a2, B);
        assert.deepStrictEqual(h.orderedActiveIds(A), [a1, a3]);
        assert.deepStrictEqual(h.orderedActiveIds(B), [a2, b1]);
        assertInvariants(h.data);
    });

    await t.test('move done item to another list keeps it out of itemOrder', () => {
        const { h, A, B, a2, b1 } = setup();
        h.ops.toggleDone(a2);
        h.ops.moveToList(a2, B);
        assert.deepStrictEqual(h.orderedActiveIds(B), [b1]);
        assert(h.data.todoLists.find(l => l.id === B).items.some(i => i.id === a2));
        assertInvariants(h.data);
    });

    await t.test('reorder and delete lists', () => {
        const { h, A, B } = setup();
        const C = h.ops.createList('C');
        h.ops.reorderList(C, A, true);
        assert.deepStrictEqual(h.orderedListIds(), [C, A, B]);
        h.ops.deleteList(A);
        assert.deepStrictEqual(h.orderedListIds(), [C, B]);
        assertInvariants(h.data);
    });

    await t.test('item edits do not touch ordering', () => {
        const { h, A, a1, a2, a3 } = setup();
        const before = clone(h.data.todoLists.find(l => l.id === A).itemOrder);
        h.ops.editItem(a2, 'a2 edited');
        assert.deepStrictEqual(h.data.todoLists.find(l => l.id === A).itemOrder, before);
        assert.deepStrictEqual(h.orderedActiveIds(A), [a1, a2, a3]);
    });
});

test('todo ordering — incremental backup content', async (t) => {

    await t.test('item drag → only the list itemOrder in diff, no item records', () => {
        const { h, A, a1, a3 } = setup();
        const full = snapshot(h);
        h.ops.reorderItem(a3, A, a1, true);
        const d = diffFrom(full, h);
        assert(!d.todoItems_patch, 'no item records for a pure reorder');
        assert(!d.todoListOrder, 'list order unchanged');
        assert.strictEqual(d.todoLists_patch.upsert.length, 1);
        const meta = d.todoLists_patch.upsert[0];
        assert.strictEqual(meta.id, A);
        assert(!meta.items, 'list metadata patch must not embed items');
        assert.deepStrictEqual(meta.itemOrder, h.data.todoLists.find(l => l.id === A).itemOrder);
        assertRoundtrip(full, h);
    });

    await t.test('list drag → only todoListOrder in diff', () => {
        const { h, A, B } = setup();
        const full = snapshot(h);
        h.ops.reorderList(B, A, true);
        const d = diffFrom(full, h);
        assert.deepStrictEqual(d.todoListOrder, [B, A]);
        assert(!d.todoLists_patch, 'no list records for a pure list reorder');
        assert(!d.todoItems_patch);
        assertRoundtrip(full, h);
    });

    await t.test('content edit → only that item, ordering untouched', () => {
        const { h, A, a2 } = setup();
        const full = snapshot(h);
        h.ops.editItem(a2, 'changed');
        const d = diffFrom(full, h);
        assert(!d.todoLists_patch, 'list metadata unchanged');
        assert(!d.todoListOrder);
        assert.deepStrictEqual(d.todoItems_patch[A].upsert.map(i => i.id), [a2]);
        assertRoundtrip(full, h);
    });

    await t.test('mark done → that item + itemOrder only', () => {
        const { h, A, a2 } = setup();
        const full = snapshot(h);
        h.ops.toggleDone(a2);
        const d = diffFrom(full, h);
        assert.deepStrictEqual(d.todoItems_patch[A].upsert.map(i => i.id), [a2]);
        assert.deepStrictEqual(d.todoLists_patch.upsert.map(l => l.id), [A]);
        assertRoundtrip(full, h);
    });

    await t.test('no change → no meaningful diff', () => {
        const { h } = setup();
        const full = snapshot(h);
        assert.strictEqual(hasMeaningfulDiff(diffFrom(full, h)), false);
    });

    await t.test('roundtrip after each kind of operation (cumulative vs one full)', () => {
        const { h, A, B, a1, a2, a3, b1 } = setup();
        const full = snapshot(h);
        const steps = [
            () => h.ops.reorderItem(a3, A, a1, true),
            () => h.ops.toggleDone(a1),
            () => h.ops.addItem(B, 'b-top', 'top'),
            () => h.ops.moveToList(a2, B),
            () => h.ops.toggleDone(a1),
            () => h.ops.reorderList(B, A, true),
            () => h.ops.createList('C'),
            () => h.ops.renameList(A, 'A renamed'),
            () => h.ops.deleteItem(b1),
            () => h.ops.moveToPosition(a3, A, 'bottom'),
            () => h.ops.deleteList(B),
        ];
        for (const step of steps) {
            step();
            assertInvariants(h.data);
            assertRoundtrip(full, h);
        }
    });

    await t.test('restored data is already consistent (normalize is a no-op)', () => {
        const { h, A, B, a1, a3 } = setup();
        const full = snapshot(h);
        h.ops.reorderItem(a3, A, a1, true);
        h.ops.reorderList(B, A, true);
        const restored = restoreFrom(full, diffFrom(full, h));
        const r = createTodoHarness(restored);
        assert.strictEqual(r.normalize(), false);
        assert.deepStrictEqual(r.orderedListIds(), [B, A]);
        assert.deepStrictEqual(r.orderedActiveIds(A), h.orderedActiveIds(A));
    });

    await t.test('restoring the full backup alone gives the full-time state', () => {
        const { h, A, a1, a2, a3 } = setup();
        const full = snapshot(h);
        h.ops.reorderItem(a3, A, a1, true);
        const r = createTodoHarness(clone(full));
        assert.strictEqual(r.normalize(), false);
        assert.deepStrictEqual(r.orderedActiveIds(A), [a1, a2, a3]);
    });
});

test('todo ordering — randomized operations with backup roundtrip', async (t) => {
    // Seeded PRNG so failures are reproducible
    function mulberry32(seed) {
        return () => {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let x = Math.imul(seed ^ seed >>> 15, 1 | seed);
            x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
            return ((x ^ x >>> 14) >>> 0) / 4294967296;
        };
    }

    for (const seed of [1, 7, 42, 1234, 99999]) {
        await t.test(`seed ${seed}: 400 ops, periodic new full backups`, () => {
            const rnd = mulberry32(seed);
            const pick = arr => arr[Math.floor(rnd() * arr.length)];
            const { h } = setup();
            let full = snapshot(h);

            for (let step = 0; step < 400; step++) {
                const lists = h.data.todoLists;
                const list = lists.length ? pick(lists) : null;
                const items = list ? list.items : [];
                const active = list ? h.orderedActiveIds(list.id) : [];
                const op = Math.floor(rnd() * 11);

                if (!list || op === 0) h.ops.createList(`L${step}`);
                else if (op === 1) h.ops.addItem(list.id, `i${step}`, rnd() < 0.5 ? 'top' : 'bottom');
                else if (op === 2 && items.length) h.ops.toggleDone(pick(items).id);
                else if (op === 3 && items.length) h.ops.deleteItem(pick(items).id);
                else if (op === 4 && active.length > 1) h.ops.reorderItem(pick(active), list.id, pick(active), rnd() < 0.5);
                else if (op === 5 && active.length) h.ops.moveToPosition(pick(active), list.id, rnd() < 0.5 ? 'top' : 'bottom');
                else if (op === 6 && items.length && lists.length > 1) h.ops.moveToList(pick(items).id, pick(lists.filter(l => l !== list)).id);
                else if (op === 7 && lists.length > 1) h.ops.reorderList(list.id, pick(lists).id, rnd() < 0.5);
                else if (op === 8 && items.length) h.ops.editItem(pick(items).id, `edit ${step}`);
                else if (op === 9 && lists.length > 2 && rnd() < 0.3) h.ops.deleteList(list.id);
                else h.ops.addItem(list.id, `i${step}`);

                assertInvariants(h.data);
                assertRoundtrip(full, h);
                if (rnd() < 0.05) full = snapshot(h); // weekly full backup
            }
        });
    }
});

test('todo ordering — normalize (load/import repair)', async (t) => {

    await t.test('missing order arrays are built in stored record order', () => {
        const h = createTodoHarness({
            ...emptyData(),
            todoLists: [
                { id: 'L1', name: 'L1', items: [
                    { id: 'x', content: 'x', isDone: false },
                    { id: 'y', content: 'y', isDone: true, doneAt: '2026-01-01T00:00:00.000Z' },
                    { id: 'z', content: 'z', isDone: false },
                ] },
                { id: 'L2', name: 'L2', items: [] },
            ],
        });
        assert.strictEqual(h.normalize(), true);
        assert.deepStrictEqual(h.orderedListIds(), ['L1', 'L2']);
        assert.deepStrictEqual(h.orderedActiveIds('L1'), ['x', 'z'], 'done y excluded');
        assert.strictEqual(h.normalize(), false, 'second run is a no-op');
        assertInvariants(h.data);
    });

    await t.test('item ids of any format are kept as they are', () => {
        const ids = ['mn2xpbakoj5su', '023b2936-7f03-489e-9320-151bb8fb89eb'];
        const h = createTodoHarness({
            ...emptyData(),
            todoLists: [{ id: 'L1', name: 'L1', items: ids.map(id => ({ id, content: id, isDone: false })) }],
        });
        h.normalize();
        assert.deepStrictEqual(h.data.todoLists[0].items.map(i => i.id), ids);
        assert.deepStrictEqual(h.orderedActiveIds('L1'), ids);
    });

    await t.test('repairs stale, duplicate, done and missing ids', () => {
        const h = createTodoHarness({
            ...emptyData(),
            todoListOrder: ['gone', 'L1', 'L1'],
            todoLists: [
                { id: 'L1', name: 'L1', itemOrder: ['gone', 'b', 'done', 'b'], items: [
                    { id: 'a', content: 'a', isDone: false },
                    { id: 'b', content: 'b', isDone: false },
                    { id: 'done', content: 'd', isDone: true },
                ] },
                { id: 'L2', name: 'L2', items: [] },
            ],
        });
        assert.strictEqual(h.normalize(), true);
        assert.deepStrictEqual(h.orderedListIds(), ['L1', 'L2']);
        assert.deepStrictEqual(h.data.todoLists[0].itemOrder, ['b', 'a']);
        assertInvariants(h.data);
    });

    await t.test('empty data gets empty order arrays', () => {
        const h = createTodoHarness(emptyData());
        h.normalize();
        assert.deepStrictEqual(h.data.todoListOrder, []);
    });
});

test('uid() — app-wide id format', async (t) => {

    await t.test('timestamp (base36) + 5 random chars', () => {
        const { realUid } = createTodoHarness(emptyData());
        for (const id of Array.from({ length: 20 }, realUid)) {
            assert.match(id, /^[0-9a-z]{9,}$/, `${id} is lowercase base36`);
            assert(Math.abs(parseInt(id.slice(0, -5), 36) - Date.now()) < 60000, `${id} starts with the current timestamp`);
        }
    });
});
