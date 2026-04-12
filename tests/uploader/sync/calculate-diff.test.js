const test = require('node:test');
const assert = require('assert');

const {
    __test__: { calculateDiff, hasMeaningfulDiff }
} = require('../../../uploader/sync');
const {
    fullBackupFixture,
    fullBackupModified
} = require('../../fixtures/backups');
const {
    verifyBackupStructure,
    isDiffFormat2
} = require('../../fixtures/helpers');

test('Bug 1: calculateDiff — Format 2 diff backups', async (t) => {
    await t.test('should generate Format 2 with diffFormat=2 in _meta', () => {
        const fullBackup = { id: 'backup-001', name: 'backup_2026-04-11.full.json', data: fullBackupFixture };
        const diff = calculateDiff(fullBackup, fullBackupModified);

        verifyBackupStructure(diff, false);
        assert.strictEqual(diff._meta.diffFormat, 2);
        assert(isDiffFormat2(diff));
    });

    await t.test('should only include changed notes in notes_patch', () => {
        const fullBackup = { id: 'backup-001', name: 'backup_2026-04-11.full.json', data: fullBackupFixture };
        const diff = calculateDiff(fullBackup, fullBackupModified);

        assert(diff.notes_patch);
        assert.strictEqual(diff.notes_patch.upsert.length, 1);
        assert.strictEqual(diff.notes_patch.upsert[0].id, 'note-001');
    });

    await t.test('should only include changed todoLists in todoLists_patch', () => {
        const fullBackup = { id: 'backup-001', name: 'backup_2026-04-11.full.json', data: fullBackupFixture };
        const diff = calculateDiff(fullBackup, fullBackupModified);

        assert(diff.todoLists_patch);
        assert.strictEqual(diff.todoLists_patch.upsert.length, 1);
        assert.strictEqual(diff.todoLists_patch.upsert[0].items.length, 2);
    });

    await t.test('should be smaller than full backup when changes are small', () => {
        const fullBackup = { id: 'backup-001', name: 'backup_2026-04-11.full.json', data: fullBackupFixture };
        const diff = calculateDiff(fullBackup, fullBackupModified);

        const fullSize = JSON.stringify(fullBackupFixture).length;
        const diffSize = JSON.stringify(diff).length;

        assert(diffSize < fullSize, `Diff (${diffSize}B) should not exceed full size (${fullSize}B)`);
    });

    await t.test('should omit _patch keys if section did not change', () => {
        const unchangedBackup = JSON.parse(JSON.stringify(fullBackupFixture));
        const fullBackup = { id: 'backup-001', name: 'backup_2026-04-11.full.json', data: fullBackupFixture };
        const diff = calculateDiff(fullBackup, unchangedBackup);

        assert(!diff.notes_patch);
        assert(!diff.todoLists_patch);
        assert(!diff.tabs_patch);
    });

    await t.test('should report no meaningful diff when only metadata exists', () => {
        const unchangedBackup = JSON.parse(JSON.stringify(fullBackupFixture));
        const fullBackup = { id: 'backup-001', name: 'backup_2026-04-11.full.json', data: fullBackupFixture };
        const diff = calculateDiff(fullBackup, unchangedBackup);

        assert.strictEqual(hasMeaningfulDiff(diff), false);
    });

    await t.test('should report meaningful diff when any patch exists', () => {
        const fullBackup = { id: 'backup-001', name: 'backup_2026-04-11.full.json', data: fullBackupFixture };
        const diff = calculateDiff(fullBackup, fullBackupModified);

        assert.strictEqual(hasMeaningfulDiff(diff), true);
    });

    await t.test('should ignore visitCount changes in tabs/groups/dials patch', () => {
        const fullBackup = { id: 'backup-001', name: 'backup_2026-04-11.full.json', data: fullBackupFixture };
        const modified = JSON.parse(JSON.stringify(fullBackupFixture));

        // Symuluj tylko wzrost visitCount (jak po kliknięciu na dial)
        modified.tabs[1].groups[0].dials[0].visitCount = 99;

        const diff = calculateDiff(fullBackup, modified);

        // Nie powinno być tabs_patch gdy zmiana to tylko visitCount
        assert(!diff.tabs_patch, 'visitCount change should not create tabs_patch');
        assert.strictEqual(hasMeaningfulDiff(diff), false);
    });
});

