const test = require('node:test');
const assert = require('assert');

test('Rate-limiting manual backups', async (t) => {
    await t.test('should enforce 24h cooldown between manual backups', () => {
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const lastManualSync = now - 1000;

        const canBackupNow = !(lastManualSync && (now - lastManualSync) < twentyFourHours);

        assert(!canBackupNow);
    });

    await t.test('should allow backup after 24h cooldown expires', () => {
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const lastManualSync = now - (twentyFourHours + 1000);

        const canBackupNow = !(lastManualSync && (now - lastManualSync) < twentyFourHours);

        assert(canBackupNow);
    });

    await t.test('should allow first manual backup (lastManualSync is null)', () => {
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const lastManualSync = null;

        const canBackupNow = !(lastManualSync && (now - lastManualSync) < twentyFourHours);

        assert(canBackupNow);
    });
});

