const test = require('node:test');
const assert = require('assert');

const { __test__: { calculateDiff, hasMeaningfulDiff } } = require('../../../uploader/sync');
const { SnapshotBuilder, makeTab, makeGroup, makeDial, modify, asFullBackup } = require('../../fixtures/builders');

// ─── Helpers ────────────────────────────────────────────────────

function diff(base, modified) {
    return calculateDiff(asFullBackup(base), modified);
}

function baseWithTab(tabOverrides = {}, groups = []) {
    return new SnapshotBuilder()
        .tab(makeTab({ id: 'tab-1', name: 'Work', isHome: false, ...tabOverrides }, groups))
        .build();
}

function baseWithTwoTabs() {
    return new SnapshotBuilder()
        .tab(makeTab({ id: 'tab-home', name: 'Start', isHome: true }))
        .tab(makeTab({ id: 'tab-work', name: 'Work' }, [
            makeGroup({ id: 'grp-1', name: 'Tools', dialSize: 140 }, [
                makeDial({ id: 'dial-1', name: 'GitHub', url: 'https://github.com' })
            ])
        ]))
        .build();
}

// ─── Tests ──────────────────────────────────────────────────────

test('calculateDiff — tabs / groups / dials', async (t) => {

    // ── No changes ──────────────────────────────────────────────

    await t.test('unchanged snapshot → no tabs_patch', () => {
        const base = baseWithTwoTabs();
        const result = diff(base, modify(base, () => {}));
        assert(!result.tabs_patch, 'tabs_patch should be absent when nothing changed');
        assert.strictEqual(hasMeaningfulDiff(result), false);
    });

    await t.test('only visitCount change → no tabs_patch', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].groups[0].dials[0].visitCount = 999; });
        const result = diff(base, modified);
        assert(!result.tabs_patch, 'visitCount is a technical field and must not trigger a diff');
    });

    await t.test('only lastVisited change → no tabs_patch', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].groups[0].dials[0].lastVisited = '2026-04-20T10:00:00Z'; });
        const result = diff(base, modified);
        assert(!result.tabs_patch, 'lastVisited is a technical field and must not trigger a diff');
    });

    // ── Tab-level changes ────────────────────────────────────────

    await t.test('tab name change → tabs_patch.upsert with updated tab', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].name = 'Development'; });
        const result = diff(base, modified);
        assert(result.tabs_patch, 'tabs_patch should exist');
        assert.strictEqual(result.tabs_patch.upsert.length, 1);
        assert.strictEqual(result.tabs_patch.upsert[0].id, 'tab-work');
        assert.strictEqual(result.tabs_patch.upsert[0].name, 'Development');
        assert.strictEqual(result.tabs_patch.delete.length, 0);
    });

    await t.test('tab emoji change → tabs_patch', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].emoji = '💻'; });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert[0].emoji, '💻');
    });

    await t.test('tab isHome flag change → tabs_patch', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[0].isHome = false; });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert[0].id, 'tab-home');
    });

    await t.test('new tab added → tabs_patch.upsert with new tab', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => {
            s.tabs.push(makeTab({ id: 'tab-personal', name: 'Personal' }));
        });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert.length, 1);
        assert.strictEqual(result.tabs_patch.upsert[0].id, 'tab-personal');
        assert.strictEqual(result.tabs_patch.delete.length, 0);
    });

    await t.test('tab deleted → tabs_patch.delete', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs = s.tabs.filter(t => t.id !== 'tab-work'); });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.delete.length, 1);
        assert.strictEqual(result.tabs_patch.delete[0], 'tab-work');
        assert.strictEqual(result.tabs_patch.upsert.length, 0);
    });

    await t.test('unchanged tab not included in tabs_patch.upsert', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].name = 'Dev'; });
        const result = diff(base, modified);
        const upsertedIds = result.tabs_patch.upsert.map(t => t.id);
        assert(!upsertedIds.includes('tab-home'), 'Unchanged home tab must not appear in upsert');
    });

    // ── Group-level changes (entire tab goes into patch) ─────────

    await t.test('group name change → tabs_patch (full tab upserted)', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].groups[0].name = 'Dev Tools'; });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        const upserted = result.tabs_patch.upsert[0];
        assert.strictEqual(upserted.id, 'tab-work');
        assert.strictEqual(upserted.groups[0].name, 'Dev Tools');
    });

    await t.test('group emoji change → tabs_patch', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].groups[0].emoji = '🛠️'; });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert[0].groups[0].emoji, '🛠️');
    });

    await t.test('group dialSize change → tabs_patch', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].groups[0].dialSize = 200; });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert[0].groups[0].dialSize, 200);
    });

    await t.test('new group added to tab → tabs_patch with updated tab', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => {
            s.tabs[1].groups.push(makeGroup({ id: 'grp-new', name: 'Bookmarks' }));
        });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert[0].groups.length, 2);
    });

    await t.test('group deleted → tabs_patch with tab containing fewer groups', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].groups = []; });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert[0].groups.length, 0);
    });

    // ── Dial-level changes ───────────────────────────────────────

    await t.test('dial URL change → tabs_patch (whole tab)', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].groups[0].dials[0].url = 'https://github.com/org'; });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert[0].groups[0].dials[0].url, 'https://github.com/org');
    });

    await t.test('dial name change → tabs_patch', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].groups[0].dials[0].name = 'GitHub (work)'; });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert[0].groups[0].dials[0].name, 'GitHub (work)');
    });

    await t.test('dial emoji change → tabs_patch', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].groups[0].dials[0].emoji = '🐙'; });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert[0].groups[0].dials[0].emoji, '🐙');
    });

    await t.test('dial iconType changed to custom with icon URL → tabs_patch', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => {
            s.tabs[1].groups[0].dials[0].iconType = 'custom';
            s.tabs[1].groups[0].dials[0].icon = '/uploads/myicon.png';
        });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        const dial = result.tabs_patch.upsert[0].groups[0].dials[0];
        assert.strictEqual(dial.iconType, 'custom');
        assert.strictEqual(dial.icon, '/uploads/myicon.png');
    });

    await t.test('dial iconType set to none → tabs_patch', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => {
            s.tabs[1].groups[0].dials[0].iconType = 'none';
            s.tabs[1].groups[0].dials[0].icon = '';
        });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert[0].groups[0].dials[0].iconType, 'none');
    });

    await t.test('new dial added to group → tabs_patch', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => {
            s.tabs[1].groups[0].dials.push(makeDial({ id: 'dial-new', name: 'Jira', url: 'https://jira.example.com' }));
        });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert[0].groups[0].dials.length, 2);
    });

    await t.test('dial deleted from group → tabs_patch with fewer dials', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => { s.tabs[1].groups[0].dials = []; });
        const result = diff(base, modified);
        assert(result.tabs_patch);
        assert.strictEqual(result.tabs_patch.upsert[0].groups[0].dials.length, 0);
    });

    await t.test('visitCount change alongside real change → tabs_patch (real change wins)', () => {
        const base = baseWithTwoTabs();
        const modified = modify(base, s => {
            s.tabs[1].groups[0].dials[0].visitCount = 999;
            s.tabs[1].groups[0].dials[0].name = 'GitHub Enterprise';
        });
        const result = diff(base, modified);
        assert(result.tabs_patch, 'Real change should create a patch even with visitCount also changed');
        assert.strictEqual(result.tabs_patch.upsert[0].groups[0].dials[0].name, 'GitHub Enterprise');
    });
});
