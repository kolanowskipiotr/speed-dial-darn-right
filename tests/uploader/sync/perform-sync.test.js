/**
 * performSync error reporting + POST /api/sync status codes.
 * A failed backup must not look successful — the client starts its 1h cooldown on 200.
 */

const test = require('node:test');
const assert = require('assert');

const { performSync } = require('../../../uploader/sync');
const { createServer } = require('../../../uploader/server');

function fakeDrive({ files = [], contents = {}, failList, failCreate, failDelete } = {}) {
    const created = [];
    const deleted = [];
    return {
        created,
        deleted,
        files: {
            // `files` must be given newest first (the real calls use orderBy createdTime desc)
            async list({ q = '' } = {}) {
                if (failList) throw failList;
                const matching = q.includes("name contains 'full'") ? files.filter(f => f.name.includes('full')) : files;
                return { data: { files: matching } };
            },
            async get({ fileId }) { return { data: contents[fileId] }; },
            async create({ requestBody, media }) {
                if (failCreate) throw failCreate;
                created.push({ name: requestBody.name, body: JSON.parse(media.body) });
                return { data: { id: 'new' } };
            },
            async delete({ fileId }) {
                if (failDelete) throw failDelete;
                deleted.push(fileId);
            },
        },
    };
}

function gaxiosError(status) {
    const e = new Error(status === 401 ? 'Invalid Credentials' : 'Backend Error');
    e.code = status;
    e.response = { status };
    return e;
}

const DATA = { tabs: [], todoLists: [], todoListOrder: [], notes: [{ id: 'n1', content: 'x' }], notesTrash: [] };

test('performSync — outcomes', async (t) => {

    await t.test('no full backup yet → uploads full', async () => {
        const drive = fakeDrive();
        await performSync(DATA, 'tok', 'folder', { drive });
        assert.strictEqual(drive.created.length, 1);
        assert.match(drive.created[0].name, /\.full\.json$/);
    });

    await t.test('recent full + changes → uploads diff', async () => {
        const drive = fakeDrive({
            files: [{ id: 'f1', name: 'backup_x.full.json', createdTime: new Date().toISOString() }],
            contents: { f1: { ...DATA, notes: [{ id: 'n1', content: 'old' }] } },
        });
        await performSync(DATA, 'tok', 'folder', { drive });
        assert.strictEqual(drive.created.length, 1);
        assert.match(drive.created[0].name, /\.diff\.json$/);
        assert(drive.created[0].body.notes_patch);
    });

    await t.test('recent full + no changes → nothing uploaded, resolves', async () => {
        const drive = fakeDrive({
            files: [{ id: 'f1', name: 'backup_x.full.json', createdTime: new Date().toISOString() }],
            contents: { f1: DATA },
        });
        await performSync(DATA, 'tok', 'folder', { drive });
        assert.strictEqual(drive.created.length, 0);
    });

    await t.test('forceFull → full even with a recent full', async () => {
        const drive = fakeDrive({
            files: [{ id: 'f1', name: 'backup_x.full.json', createdTime: new Date().toISOString() }],
            contents: { f1: DATA },
        });
        await performSync(DATA, 'tok', 'folder', { drive, forceFull: true });
        assert.match(drive.created[0].name, /\.full\.json$/);
    });
});

test('performSync — failures are reported', async (t) => {

    await t.test('missing token → 400', async () => {
        await assert.rejects(performSync(DATA, '', 'folder', { drive: fakeDrive() }), { statusCode: 400 });
    });

    await t.test('missing folder → 400', async () => {
        await assert.rejects(performSync(DATA, 'tok', null, { drive: fakeDrive() }), { statusCode: 400 });
    });

    await t.test('Google rejects credentials → 401', async () => {
        const drive = fakeDrive({ failList: gaxiosError(401) });
        await assert.rejects(performSync(DATA, 'tok', 'folder', { drive }), { statusCode: 401 });
    });

    await t.test('upload fails → 500', async () => {
        const drive = fakeDrive({ failCreate: gaxiosError(503) });
        await assert.rejects(performSync(DATA, 'tok', 'folder', { drive }), { statusCode: 500 });
    });

    await t.test('cleanup fails after upload → still resolves (backup stored)', async () => {
        // >200 files forces cleanup to delete, and every delete fails
        const many = Array.from({ length: 205 }, (_, i) => ({ id: `d${i}`, name: `backup_${i}.diff.json`, createdTime: new Date().toISOString() }));
        const drive = fakeDrive({ files: many, failDelete: gaxiosError(500) });
        await performSync(DATA, 'tok', 'folder', { drive, forceFull: true });
        assert.strictEqual(drive.created.length, 1);
    });
});

test('cleanup via performSync — max 200 files, newest full backup always kept', async (t) => {

    const now = Date.now();
    const file = (id, kind, minutesAgo) => ({
        id, name: `backup_${id}.${kind}.json`, createdTime: new Date(now - minutesAgo * 60000).toISOString(),
    });
    const changedData = { ...DATA, notes: [{ id: 'n1', content: 'changed' }] };

    await t.test('≤ 200 files → nothing deleted', async () => {
        const files = [...Array.from({ length: 199 }, (_, i) => file(`d${i}`, 'diff', i)), file('F', 'full', 500)];
        const drive = fakeDrive({ files, contents: { F: DATA } });
        await performSync(changedData, 'tok', 'folder', { drive });
        assert.deepStrictEqual(drive.deleted, []);
    });

    await t.test('example: 400 diffs, full, 198 diffs, full → 199 newest diffs + the newer full', async () => {
        // Numbered newest first like the backup list: 1..400 diff, 401 full, 402..599 diff, 600 full
        const files = Array.from({ length: 600 }, (_, i) => {
            const n = i + 1;
            return file(`#${n}`, n === 401 || n === 600 ? 'full' : 'diff', n);
        });
        const drive = fakeDrive({ files, contents: { '#401': DATA } });
        await performSync(changedData, 'tok', 'folder', { drive });

        assert.match(drive.created[0].name, /\.diff\.json$/, 'new diff based on full #401');
        const kept = files.filter(f => !drive.deleted.includes(f.id)).map(f => f.id);
        const expected = [...Array.from({ length: 199 }, (_, i) => `#${i + 1}`), '#401'];
        assert.deepStrictEqual(kept, expected);
        assert.strictEqual(kept.length, 200, 'total stays at the limit');
    });

    await t.test('older fulls and old diffs are deleted when the newest full is protected', async () => {
        const diffs = Array.from({ length: 250 }, (_, i) => file(`d${i}`, 'diff', i));
        const files = [...diffs, file('F-new', 'full', 300), file('F-old', 'full', 400), file('d-old', 'diff', 450)];
        const drive = fakeDrive({ files, contents: { 'F-new': DATA } });
        await performSync(changedData, 'tok', 'folder', { drive });

        assert(!drive.deleted.includes('F-new'), 'newest full must survive');
        assert(drive.deleted.includes('F-old'), 'older full may go');
        assert(drive.deleted.includes('d-old'));
        assert.deepStrictEqual(drive.deleted.filter(id => id.startsWith('d') && id !== 'd-old'),
            diffs.slice(199).map(f => f.id), 'diffs beyond the newest 199 deleted');
        assert.strictEqual(files.length - drive.deleted.length, 200);
    });

    await t.test('diffs older than the only full are orphans → deleted', async () => {
        const files = [file('F', 'full', 0), ...Array.from({ length: 210 }, (_, i) => file(`d${i}`, 'diff', i + 1))];
        const drive = fakeDrive({ files, contents: { F: DATA } });
        await performSync(changedData, 'tok', 'folder', { drive });
        assert(!drive.deleted.includes('F'));
        assert.strictEqual(drive.deleted.length, 210);
    });
});

test('POST /api/sync — status codes', async (t) => {

    async function post(performSyncImpl) {
        const server = createServer({ performSync: performSyncImpl });
        await new Promise(resolve => server.listen(0, resolve));
        try {
            const res = await fetch(`http://127.0.0.1:${server.address().port}/api/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok', 'X-GDrive-Folder-Id': 'folder' },
                body: JSON.stringify(DATA),
            });
            return res.status;
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    }

    await t.test('success → 200', async () => {
        assert.strictEqual(await post(async () => {}), 200);
    });

    await t.test('credentials rejected → 401 (client refreshes token and retries)', async () => {
        assert.strictEqual(await post(async () => { throw Object.assign(new Error('x'), { statusCode: 401 }); }), 401);
    });

    await t.test('missing folder → 400', async () => {
        assert.strictEqual(await post(async () => { throw Object.assign(new Error('x'), { statusCode: 400 }); }), 400);
    });

    await t.test('unexpected error → 500', async () => {
        assert.strictEqual(await post(async () => { throw new Error('boom'); }), 500);
    });

    await t.test('arguments forwarded: token, folder, forceFull header', async () => {
        let args;
        await post(async (...a) => { args = a; });
        assert.strictEqual(args[1], 'tok');
        assert.strictEqual(args[2], 'folder');
        assert.strictEqual(args[3].forceFull, false);
    });
});
