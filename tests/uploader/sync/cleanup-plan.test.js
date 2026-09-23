/**
 * planBackupCleanup — which Drive files the cleanup deletes.
 * Files are numbered newest first, like the backup list in the UI.
 */

const test = require('node:test');
const assert = require('assert');

const { __test__: { planBackupCleanup } } = require('../../../uploader/sync');

/** Builds a newest-first list; `fulls` are the positions (1-based) of full backups. */
function backups(count, fulls) {
    return Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        return { id: `#${n}`, name: `backup_${n}.${fulls.includes(n) ? 'full' : 'diff'}.json` };
    });
}

function kept(files, max) {
    const del = new Set(planBackupCleanup(files, max));
    return files.filter(f => !del.has(f)).map(f => f.id);
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `#${from + i}`);

test('planBackupCleanup', async (t) => {

    await t.test('scenario A: 1–50 diff, 51 full, 52–200 diff, 201 full → older chain flattened to 52 + 201', () => {
        assert.deepStrictEqual(kept(backups(201, [51, 201]), 200), [...range(1, 51), '#52', '#201']);
    });

    await t.test('scenario B: …51 full, …101 full, 102–249 diff, 250 full → oldest chain flattened to 102 + 250', () => {
        assert.deepStrictEqual(kept(backups(250, [51, 101, 250]), 200), [...range(1, 101), '#102', '#250']);
    });

    await t.test('flattening goes oldest first and stops once within the limit', () => {
        // chains: 1–100 (100), 101–150 (50), 151–260 (110) = 260
        // flatten 151–260 → drops 108 → 152 ≤ 200; chain 101–150 stays intact
        assert.deepStrictEqual(kept(backups(260, [100, 150, 260]), 200), [...range(1, 150), '#151', '#260']);
    });

    await t.test('over time: newest chain intact, older chains as diff+full pairs', () => {
        // newest chain 1–196, old chains 197–200, 201–205, 206–210 → flattening all gives 202,
        // so the oldest pair (206 + 210) goes too
        const files = backups(210, [196, 200, 205, 210]);
        assert.deepStrictEqual(kept(files, 200), [...range(1, 196), '#197', '#200', '#201', '#205']);
    });

    await t.test('flattened chains are deleted oldest first until within the limit', () => {
        // newest chain 1–197 (197) + three old chains of 10 → flattened to 2 each = 203 → drop 2 oldest pairs
        const files = backups(227, [197, 207, 217, 227]);
        assert.deepStrictEqual(kept(files, 200), [...range(1, 197), '#198', '#207']);
    });

    await t.test('newest generation alone over the limit → its full + 199 newest diffs', () => {
        // 1–400 diff, 401 full, 402–599 diff, 600 full
        assert.deepStrictEqual(kept(backups(600, [401, 600]), 200), [...range(1, 199), '#401']);
    });

    await t.test('within the limit → nothing deleted', () => {
        const files = backups(200, [51, 200]);
        assert.deepStrictEqual(planBackupCleanup(files, 200), []);
    });

    await t.test('generations are kept while they fit, even with several fulls', () => {
        // gens: 1–10 (10), 11–60 (50), 61–200 (140) = 200 total → all fit
        assert.deepStrictEqual(planBackupCleanup(backups(200, [10, 60, 200]), 200), []);
        // one more old chain of 5 → 205 → flatten it (−3) → 202 → flatten 61–200 (−138) → 64
        assert.deepStrictEqual(kept(backups(205, [10, 60, 200, 205]), 200), [...range(1, 61), '#200', '#201', '#205']);
    });

    await t.test('chain with a single full and no diffs is kept as is when flattening', () => {
        // chains: 1–199 (199), 200 (full only), 201–205 (5) → flatten 201–205 to 2 → 202 → delete pair → 200
        assert.deepStrictEqual(kept(backups(205, [199, 200, 205]), 200), range(1, 200));
    });

    await t.test('diffs older than the oldest full are orphans → deleted', () => {
        // 1–5 diff, 6 full, 7–9 diff (no older full)
        assert.deepStrictEqual(kept(backups(9, [6]), 200), range(1, 6));
    });

    await t.test('no full at all → all diffs are orphans', () => {
        assert.deepStrictEqual(kept(backups(5, []), 200), []);
    });

    await t.test('the newest full is never deleted', () => {
        for (const [count, fulls] of [[201, [51, 201]], [250, [51, 101, 250]], [600, [401, 600]], [300, [300]], [1, [1]]]) {
            const files = backups(count, fulls);
            const newestFull = files.find(f => f.name.includes('.full.'));
            assert(!planBackupCleanup(files, 200).includes(newestFull), `count ${count}`);
        }
    });

    await t.test('result never exceeds the limit and every kept diff has its full', () => {
        for (let count = 1; count <= 450; count += 7) {
            const fulls = [3, 40, 41, 150, 230, 420].filter(n => n <= count);
            const keptIds = new Set(kept(backups(count, fulls), 200));
            assert(keptIds.size <= 200, `count ${count}: ${keptIds.size} kept`);
            if (fulls.length) assert(keptIds.has(`#${fulls[0]}`), `count ${count}: newest full kept`);
            // each kept diff's base is the nearest older full — it must be kept too
            for (const id of keptIds) {
                const n = Number(id.slice(1));
                if (fulls.includes(n)) continue;
                const base = fulls.find(f => f > n);
                assert(base && keptIds.has(`#${base}`), `count ${count}: diff ${id} kept without its full`);
            }
            // a kept older chain is either intact or flattened to its newest diff + full
            fulls.slice(1).forEach((full, i) => {
                const firstDiff = fulls[i] + 1;
                const chainIds = range(firstDiff, full);
                const keptChain = chainIds.filter(id => keptIds.has(id));
                if (!keptChain.length || keptChain.length === chainIds.length) return;
                const flattened = chainIds.length > 1 ? [chainIds[0], chainIds[chainIds.length - 1]] : chainIds;
                assert.deepStrictEqual(keptChain, flattened, `count ${count}: chain ending ${full} partially kept`);
            });
            // the newest chain is trimmed only when every older chain is gone
            if (fulls.length) {
                const newestChain = range(1, fulls[0]);
                const olderKept = [...keptIds].some(id => Number(id.slice(1)) > fulls[0]);
                if (newestChain.some(id => !keptIds.has(id))) assert(!olderKept, `count ${count}: newest trimmed while older kept`);
            }
        }
    });

    await t.test('non-backup files are never deleted', () => {
        const files = [
            { id: 'notes', name: 'readme.txt' },
            ...backups(8, [4]),
            { id: 'img', name: 'photo.jpg' },
        ];
        const del = planBackupCleanup(files, 2).map(f => f.id);
        assert(!del.includes('notes') && !del.includes('img'));
    });
});
