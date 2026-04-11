const test = require('node:test');
const assert = require('assert');

const { fullBackupFixture } = require('../../../fixtures/backups');
const { verifyBackupStructure } = require('../../../fixtures/helpers');
const { applyDiff } = require('./helpers/restore-helpers');

test('Restore Full Backup scenario', async (t) => {
    await t.test('restore-full: download and apply full backup', () => {
        const backupFile = fullBackupFixture;

        verifyBackupStructure(backupFile, true);

        const restored = applyDiff({}, backupFile);

        assert.strictEqual(restored.tabs.length, 2);
        assert.strictEqual(restored.notes.length, 1);
        assert.strictEqual(restored.todoLists.length, 1);
    });
});

