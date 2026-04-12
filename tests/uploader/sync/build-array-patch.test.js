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

    await t.test('should ignore visitCount changes (technical metadata)', () => {
        const oldDials = [{ id: 'dial-001', name: 'Google', url: 'https://google.com', visitCount: 5 }];
        const newDials = [{ id: 'dial-001', name: 'Google', url: 'https://google.com', visitCount: 42 }];

        const patch = buildArrayPatch(oldDials, newDials);

        assert.strictEqual(patch.upsert.length, 0, 'visitCount change should not trigger upsert');
        assert.strictEqual(patch.delete.length, 0);
    });

    await t.test('should ignore lastVisited changes (technical metadata)', () => {
        const oldDials = [{ id: 'dial-001', name: 'Google', url: 'https://google.com', lastVisited: '2026-01-01T00:00:00Z' }];
        const newDials = [{ id: 'dial-001', name: 'Google', url: 'https://google.com', lastVisited: '2026-04-12T10:00:00Z' }];

        const patch = buildArrayPatch(oldDials, newDials);

        assert.strictEqual(patch.upsert.length, 0, 'lastVisited change should not trigger upsert');
        assert.strictEqual(patch.delete.length, 0);
    });

    await t.test('should detect real changes even when visitCount also changed', () => {
        const oldDials = [{ id: 'dial-001', name: 'Google', url: 'https://google.com', visitCount: 5 }];
        const newDials = [{ id: 'dial-001', name: 'Google', url: 'https://google.com', visitCount: 42, emoji: '🔍' }];

        const patch = buildArrayPatch(oldDials, newDials);

        assert.strictEqual(patch.upsert.length, 1, 'real change (emoji) should trigger upsert even with visitCount change');
        assert.strictEqual(patch.upsert[0].emoji, '🔍');
    });
});
