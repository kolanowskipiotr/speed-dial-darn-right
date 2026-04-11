const test = require('node:test');
const assert = require('assert');

const { assertDeepEqual } = require('../../../fixtures/helpers');
const { applyArrayPatch } = require('./helpers/restore-helpers');

test('Edge cases', async (t) => {
    await t.test('should handle empty arrays in patch', () => {
        const baseArr = [{ id: '1', name: 'a' }, { id: '2', name: 'b' }];
        const patch = { upsert: [], delete: [] };

        const result = applyArrayPatch(baseArr, patch);

        assertDeepEqual(result, baseArr, 'Should preserve array when patch is empty');
    });

    await t.test('should preserve order when applying patch', () => {
        const baseArr = [
            { id: 'a', order: 1 },
            { id: 'b', order: 2 },
            { id: 'c', order: 3 }
        ];
        const patch = {
            upsert: [{ id: 'b', order: 2, updated: true }],
            delete: []
        };

        const result = applyArrayPatch(baseArr, patch);

        assert.strictEqual(result[0].id, 'a');
        assert.strictEqual(result[1].id, 'b');
        assert(result[1].updated);
        assert.strictEqual(result[2].id, 'c');
    });

    await t.test('should append new items to end after preserving order', () => {
        const baseArr = [{ id: 'a', order: 1 }, { id: 'b', order: 2 }];
        const patch = {
            upsert: [{ id: 'c', order: 3 }],
            delete: []
        };

        const result = applyArrayPatch(baseArr, patch);

        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[2].id, 'c');
    });
});

