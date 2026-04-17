const test = require('node:test');
const assert = require('assert');

const {
    fullBackupFixture,
    fullBackupModified,
    diffFormat2,
    diffFormat1
} = require('../../../fixtures/backups');
const { applyDiff } = require('./helpers/restore-helpers');

test('Bug 1: applyDiff — restore scenarios', async (t) => {
    await t.test('should restore from Format 2 diff correctly', () => {
        const restored = applyDiff(fullBackupFixture, diffFormat2);

        assert.strictEqual(restored.notes[0].content, 'Working on backup improvements — UPDATED!');
        assert.strictEqual(restored.todoLists[0].items.length, 2);
    });

    await t.test('should restore from Format 1 diff correctly (backward compatibility)', () => {
        const restored = applyDiff(fullBackupFixture, diffFormat1);

        assert.strictEqual(restored.notes[0].content, fullBackupModified.notes[0].content);
        assert.strictEqual(restored.todoLists[0].items.length, 2);
    });

    await t.test('should restore full backup as-is', () => {
        const restored = applyDiff({}, fullBackupFixture);

        assert.strictEqual(restored.tabs.length, fullBackupFixture.tabs.length);
        assert.strictEqual(restored.notes.length, fullBackupFixture.notes.length);
        assert.strictEqual(restored.todoLists.length, fullBackupFixture.todoLists.length);
    });

    await t.test('should merge _images from diff into existing images', () => {
        const baseWithImages = JSON.parse(JSON.stringify(fullBackupFixture));
        baseWithImages._images = { 'img-001': 'data:image/png;base64,ABC123' };

        const diffWithNewImage = JSON.parse(JSON.stringify(diffFormat2));
        diffWithNewImage._images = { 'img-002': 'data:image/png;base64,DEF456' };

        const restored = applyDiff(baseWithImages, diffWithNewImage);

        assert.strictEqual(Object.keys(restored._images).length, 2);
        assert.strictEqual(restored._images['img-001'], 'data:image/png;base64,ABC123');
        assert.strictEqual(restored._images['img-002'], 'data:image/png;base64,DEF456');
    });

    await t.test('should preserve existing TODO items when list metadata is patched without items', () => {
        const diffWithTodoMetaOnly = {
            _type: 'diff',
            _meta: {
                diffAt: '2026-04-11T11:00:00.000Z',
                fullBackupId: 'backup-full-001',
                fullBackupName: 'backup_2026-04-11T10.full.json',
                baseExportedAt: '2026-04-11T10:00:00.000Z',
                diffFormat: 2
            },
            todoLists_patch: {
                upsert: [{ id: 'list-001', name: 'TODO Renamed' }],
                delete: []
            }
        };

        const restored = applyDiff(fullBackupFixture, diffWithTodoMetaOnly);

        assert.strictEqual(restored.todoLists[0].name, 'TODO Renamed');
        assert.strictEqual(restored.todoLists[0].items.length, 1);
        assert.strictEqual(restored.todoLists[0].items[0].id, 'item-001');
    });
});

