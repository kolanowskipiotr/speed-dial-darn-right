const test = require('node:test');
const assert = require('assert');

const {
    __test__: { calculateDiff }
} = require('../../../../uploader/sync');
const {
    fullBackupFixture,
    diffFormat2
} = require('../../../fixtures/backups');
const { applyDiff } = require('./helpers/restore-helpers');

test('Restore Diff Backup scenario', async (t) => {
    await t.test('restore-diff: download full, fetch diff, apply both', () => {
        const fullBackup = fullBackupFixture;
        const diff = diffFormat2;

        assert.strictEqual(diff._meta.fullBackupId, 'backup-full-001');

        const restored = applyDiff(fullBackup, diff);

        assert.strictEqual(restored.notes[0].content, 'Working on backup improvements — UPDATED!');
        assert.strictEqual(restored.todoLists[0].items.length, 2);
    });

    await t.test('restore-diff: chain multiple diffs', () => {
        let state = fullBackupFixture;

        state = applyDiff(state, diffFormat2);

        const secondModified = JSON.parse(JSON.stringify(state));
        secondModified.notes[0].content = 'SECOND UPDATE';

        const diff2 = calculateDiff(
            { id: 'backup-001', name: 'backup_2026-04-11T11.full.json', data: state },
            secondModified
        );

        state = applyDiff(state, diff2);

        assert.strictEqual(state.notes[0].content, 'SECOND UPDATE');
    });
});

