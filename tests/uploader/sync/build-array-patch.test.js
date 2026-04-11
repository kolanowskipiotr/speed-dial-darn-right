const test = require('node:test');
const assert = require('assert');

const {
    __test__: { buildArrayPatch }
} = require('../../../uploader/sync');

test('Bug 1: buildArrayPatch — item-level patches', async (t) => {
    await t.test('should identify upserted items (modified)', () => {
        const oldNotes = [{ id: 'note-001', name: 'First', content: 'original' }];
        const newNotes = [{ id: 'note-001', name: 'First', content: 'modified' }];

        const patch = buildArrayPatch(oldNotes, newNotes);

        assert.strictEqual(patch.upsert.length, 1);
        assert.strictEqual(patch.upsert[0].content, 'modified');
        assert.strictEqual(patch.delete.length, 0);
    });

    await t.test('should identify new items', () => {
        const patch = buildArrayPatch([], [{ id: 'note-001', name: 'New', content: 'brand new' }]);

        assert.strictEqual(patch.upsert.length, 1);
        assert.strictEqual(patch.delete.length, 0);
    });

    await t.test('should identify deleted items', () => {
        const patch = buildArrayPatch([{ id: 'note-001', name: 'First', content: 'original' }], []);

        assert.strictEqual(patch.upsert.length, 0);
        assert.strictEqual(patch.delete.length, 1);
        assert.strictEqual(patch.delete[0], 'note-001');
    });

    await t.test('should NOT upsert unchanged items', () => {
        const oldNotes = [
            { id: 'note-001', name: 'First', content: 'same' },
            { id: 'note-002', name: 'Second', content: 'also same' }
        ];
        const newNotes = [
            { id: 'note-001', name: 'First', content: 'same' },
            { id: 'note-002', name: 'Second', content: 'also same' }
        ];

        const patch = buildArrayPatch(oldNotes, newNotes);

        assert.strictEqual(patch.upsert.length, 0);
        assert.strictEqual(patch.delete.length, 0);
    });
});

