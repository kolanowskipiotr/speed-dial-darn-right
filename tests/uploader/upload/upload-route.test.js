const test = require('node:test');
const assert = require('assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Must be set before server.js is loaded — it reads UPLOADS_DIR at require time
const UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-uploads-'));
process.env.UPLOADS_DIR = UPLOADS_DIR;
const { createServer } = require('../../../uploader/server');

async function withServer(fn) {
    const server = createServer();
    await new Promise(resolve => server.listen(0, resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        await fn(base);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

test('upload route — id formats', async (t) => {

    await t.test('UUID with extension: upload, file written, delete', () => withServer(async (base) => {
        const id = `${randomUUID()}.png`;
        const res = await fetch(`${base}/upload/${id}`, { method: 'POST', body: 'img' });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(fs.readFileSync(path.join(UPLOADS_DIR, id), 'utf8'), 'img');

        const del = await fetch(`${base}/upload/${id}`, { method: 'DELETE' });
        assert.strictEqual(del.status, 200);
        assert(!fs.existsSync(path.join(UPLOADS_DIR, id)));
    }));

    await t.test('UUID without extension is stored as .jpg (dial icons)', () => withServer(async (base) => {
        const id = randomUUID();
        const res = await fetch(`${base}/upload/${id}`, { method: 'POST', body: 'icon' });
        assert.strictEqual(res.status, 200);
        assert(fs.existsSync(path.join(UPLOADS_DIR, `${id}.jpg`)));
    }));

    await t.test('legacy base36 id still accepted', () => withServer(async (base) => {
        const res = await fetch(`${base}/upload/m1x2k9ab3cd.jpg`, { method: 'POST', body: 'x' });
        assert.strictEqual(res.status, 200);
    }));

    await t.test('unsafe or malformed ids are rejected', () => withServer(async (base) => {
        for (const bad of ['-leading.jpg', '..%2Fetc%2Fpasswd', 'a.b.c', 'UPPER.jpg', 'a_b.jpg', 'x.toolongext']) {
            const res = await fetch(`${base}/upload/${bad}`, { method: 'POST', body: 'x' });
            assert.strictEqual(res.status, 404, `${bad} must be rejected`);
        }
        assert.deepStrictEqual(
            fs.readdirSync(UPLOADS_DIR).filter(f => !/^[a-z0-9][a-z0-9-]*\.[a-z0-9]{2,5}$/.test(f)),
            [],
            'nothing outside the allowed pattern was written'
        );
    }));
});
