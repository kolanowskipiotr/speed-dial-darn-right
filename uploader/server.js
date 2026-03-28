const http = require('http');
const fs   = require('fs');
const path = require('path');
const { performSync } = require('./sync');

const UPLOADS_DIR = '/uploads';
const PORT = 3001;

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

http.createServer((req, res) => {
    // API: SYNC (JSON backup to GDrive)
    if (req.url === '/api/sync' && req.method === 'POST') {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
            try {
                const data = JSON.parse(Buffer.concat(chunks).toString());
                await performSync(data);
                res.writeHead(200);
                res.end('ok');
            } catch (e) {
                console.error('[sync] Request failed:', e);
                res.writeHead(500);
                res.end('error');
            }
        });
        return;
    }

    // Allow /upload/<id> (dial icons, saved as .jpg) or /upload/<id>.<ext> (todo images, saved as-is)
    const match = req.url.match(/^\/upload\/([a-z0-9]+(?:\.[a-z0-9]{2,5})?)$/);
    if (!match) { res.writeHead(404); res.end('not found'); return; }

    const id       = match[1];
    const filename = id.includes('.') ? id : id + '.jpg';
    const filepath = path.join(UPLOADS_DIR, filename);

    if (req.method === 'POST') {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            fs.writeFile(filepath, Buffer.concat(chunks), err => {
                if (err) { console.error('write error', err); res.writeHead(500); res.end('error'); return; }
                res.writeHead(200);
                res.end('ok');
            });
        });

    } else if (req.method === 'DELETE') {
        fs.unlink(filepath, err => {
            if (err && err.code !== 'ENOENT') {
                console.error('unlink error', err);
                res.writeHead(500); res.end('error'); return;
            }
            res.writeHead(200);
            res.end('ok');
        });

    } else {
        res.writeHead(405);
        res.end('method not allowed');
    }

}).listen(PORT, () => console.log(`uploader listening on ${PORT}`));
