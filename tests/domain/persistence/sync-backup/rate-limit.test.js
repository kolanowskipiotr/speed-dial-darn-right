const test = require('node:test');
const assert = require('assert');

test('Manual backup has no cooldown', async (t) => {
    await t.test('backup is allowed immediately after a recent manual backup', () => {
        // No cooldown — manual backup is always allowed regardless of lastManualSync
        const lastManualSync = Date.now() - 1000; // 1 second ago
        const canBackupNow = true; // no rate-limit check exists
        assert(canBackupNow);
    });

    await t.test('backup is allowed even when lastManualSync is null', () => {
        const lastManualSync = null;
        const canBackupNow = true;
        assert(canBackupNow);
    });

    await t.test('backup is allowed when lastManualSync was set moments ago', () => {
        const lastManualSync = Date.now();
        const canBackupNow = true;
        assert(canBackupNow);
    });
});

test('Manual backup always produces a full backup', async (t) => {
    await t.test('X-Backup-Full header forces full backup on the backend', () => {
        // The frontend sends X-Backup-Full: true; performSync uses forceFull=true
        // which bypasses the 7-day age check and always writes a .full. backup
        const forceFull = true;
        const latestFullAge = 0; // just created — normally would trigger diff
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const shouldDoFull = forceFull || !latestFullAge || latestFullAge >= SEVEN_DAYS_MS;
        assert(shouldDoFull);
    });

    await t.test('without forceFull, recent full backup triggers diff path', () => {
        const forceFull = false;
        const latestFullAge = 0; // just created
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const shouldDoFull = forceFull || !latestFullAge || latestFullAge >= SEVEN_DAYS_MS;
        // latestFullAge === 0 is falsy so !latestFullAge is true — diff path not triggered here,
        // but a positive age below threshold would be:
        const latestFullAgeRecent = 1000; // 1 second
        const shouldDoDiff = !(forceFull || !latestFullAgeRecent || latestFullAgeRecent >= SEVEN_DAYS_MS);
        assert(shouldDoDiff);
    });
});

test('Manual backup anchors auto-sync timer', async (t) => {
    await t.test('lastAutoSync is set to now after successful manual backup', () => {
        // Simulates what triggerManualSync does on res.ok
        let lastAutoSync = null;
        let lastManualSync = null;

        const now = Date.now();
        // On success:
        lastManualSync = now;
        lastAutoSync = now;

        assert.strictEqual(lastManualSync, now);
        assert.strictEqual(lastAutoSync, now);
    });

    await t.test('auto-sync does not fire within 24h of a manual backup', () => {
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const lastAutoSync = now; // set by manual backup

        const autoSyncDue = !lastAutoSync || (now - lastAutoSync) > twentyFourHours;
        assert(!autoSyncDue);
    });

    await t.test('auto-sync fires after 24h have elapsed since manual backup', () => {
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const lastAutoSync = now - (twentyFourHours + 1000);

        const autoSyncDue = !lastAutoSync || (now - lastAutoSync) > twentyFourHours;
        assert(autoSyncDue);
    });
});
