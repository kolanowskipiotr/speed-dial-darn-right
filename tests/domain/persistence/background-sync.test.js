/**
 * Background backup trigger (domain/persistence/export.js → triggerSync) with a fake clock.
 * Changes made during the 1h cooldown must still reach a backup once it ends.
 */

const test = require('node:test');
const assert = require('assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EXPORT_JS = path.resolve(__dirname, '../../../domain/persistence/export.js');
const HOUR = 60 * 60 * 1000;

function createHarness({ status = 200, loggedIn = true, storage = {} } = {}) {
    let now = Date.parse('2026-09-23T12:00:00Z');
    let timers = [];
    let timerSeq = 0;
    const requests = [];
    const store = { ...storage };

    class FakeDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }

    const ctx = {
        console: { log() {}, warn() {}, error() {} },
        Date: FakeDate,
        JSON,
        Promise,
        setTimeout(fn, ms) { const id = ++timerSeq; timers.push({ id, fn, at: now + ms }); return id; },
        clearTimeout(id) { timers = timers.filter(t => t.id !== id); },
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: k => { delete store[k]; },
        },
        async fetch(url, opts) {
            requests.push({ url, at: now, opts });
            return { ok: status >= 200 && status < 300, status };
        },
        data: { tabs: [], todoLists: [], notes: [], notesTrash: [] },
        googleUser: loggedIn ? { email: 'x' } : null,
        currentAccessToken: loggedIn ? 'tok' : null,
        currentFolderId: 'folder',
        logoAnimEnabled: true,
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(EXPORT_JS, 'utf8'), ctx, { filename: 'export.js' });

    /** Advances the fake clock, running due timers (and their async work) in order. */
    async function advance(ms) {
        const until = now + ms;
        for (;;) {
            const due = timers.filter(t => t.at <= until).sort((a, b) => a.at - b.at)[0];
            if (!due) break;
            timers = timers.filter(t => t !== due);
            now = due.at;
            await due.fn();
            for (let i = 0; i < 20; i++) await Promise.resolve();
        }
        now = until;
    }

    const syncs = () => requests.filter(r => r.url === '/api/sync');
    return { ctx, store, advance, syncs, get now() { return now; } };
}

test('background backup — cooldown and pending changes', async (t) => {

    await t.test('change with no cooldown → backup after the 5s debounce, pending cleared', async () => {
        const h = createHarness();
        h.ctx.triggerSync();
        assert.strictEqual(h.store.speedDial_bgSyncPending, '1');
        await h.advance(4000);
        assert.strictEqual(h.syncs().length, 0);
        await h.advance(1500);
        assert.strictEqual(h.syncs().length, 1);
        assert.strictEqual(h.store.speedDial_bgSyncPending, undefined);
        assert.strictEqual(Number(h.store.speedDial_lastBgSync), h.syncs()[0].at);
    });

    await t.test('change during cooldown → backed up when the cooldown ends, without another edit', async () => {
        const h = createHarness();
        h.store.speedDial_lastBgSync = String(h.now - 20 * 60 * 1000); // 40 min left
        h.ctx.triggerSync();
        await h.advance(39 * 60 * 1000);
        assert.strictEqual(h.syncs().length, 0, 'nothing during the cooldown');
        assert.strictEqual(h.store.speedDial_bgSyncPending, '1');
        await h.advance(2 * 60 * 1000);
        assert.strictEqual(h.syncs().length, 1, 'backup right after the cooldown');
        assert.strictEqual(h.store.speedDial_bgSyncPending, undefined);
    });

    await t.test('many changes during cooldown → one deferred backup', async () => {
        const h = createHarness();
        h.store.speedDial_lastBgSync = String(h.now - 50 * 60 * 1000);
        for (let i = 0; i < 5; i++) {
            h.ctx.triggerSync();
            await h.advance(60 * 1000);
        }
        await h.advance(HOUR);
        assert.strictEqual(h.syncs().length, 1);
    });

    await t.test('change right after a backup → next backup exactly one cooldown later', async () => {
        const h = createHarness();
        h.ctx.triggerSync();
        await h.advance(6000);
        const first = h.syncs()[0].at;
        h.ctx.triggerSync();
        await h.advance(2 * HOUR);
        assert.strictEqual(h.syncs().length, 2);
        const gap = h.syncs()[1].at - first;
        assert(gap >= HOUR && gap < HOUR + 10000, `gap ${gap}ms`);
    });

    await t.test('failed backup → no cooldown, changes stay pending, next edit retries at once', async () => {
        const h = createHarness({ status: 500 });
        h.ctx.triggerSync();
        await h.advance(6000);
        assert.strictEqual(h.syncs().length, 1);
        assert.strictEqual(h.store.speedDial_lastBgSync, undefined, 'failure must not start the cooldown');
        assert.strictEqual(h.store.speedDial_bgSyncPending, '1');
        h.ctx.triggerSync();
        await h.advance(6000);
        assert.strictEqual(h.syncs().length, 2);
    });

    await t.test('page load with pending changes → resumePendingSync backs them up', async () => {
        const h = createHarness({ storage: { speedDial_bgSyncPending: '1' } });
        h.ctx.resumePendingSync();
        await h.advance(6000);
        assert.strictEqual(h.syncs().length, 1);
        assert.strictEqual(h.store.speedDial_bgSyncPending, undefined);
    });

    await t.test('page load with pending changes during cooldown → deferred to its end', async () => {
        const h = createHarness({ storage: { speedDial_bgSyncPending: '1' } });
        h.store.speedDial_lastBgSync = String(h.now - 30 * 60 * 1000);
        h.ctx.resumePendingSync();
        await h.advance(29 * 60 * 1000);
        assert.strictEqual(h.syncs().length, 0);
        await h.advance(2 * 60 * 1000);
        assert.strictEqual(h.syncs().length, 1);
    });

    await t.test('page load without pending changes → no backup', async () => {
        const h = createHarness();
        h.ctx.resumePendingSync();
        await h.advance(HOUR);
        assert.strictEqual(h.syncs().length, 0);
    });

    await t.test('not logged in → no request, changes stay pending', async () => {
        const h = createHarness({ loggedIn: false });
        h.ctx.triggerSync();
        await h.advance(HOUR);
        assert.strictEqual(h.syncs().length, 0);
        assert.strictEqual(h.store.speedDial_bgSyncPending, '1');
    });
});
