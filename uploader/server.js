const http = require('http');
const fs   = require('fs');
const path = require('path');

const UPLOADS_DIR = '/uploads';
const PORT = 3001;

http.createServer((req, res) => {
    // Allow /upload/<id> (dial icons, saved as .jpg) or /upload/<id>.<ext> (todo images, saved as-is)
    const match = req.url.match(/^\/upload\/([a-z0-9]+(?:\.[a-z0-9]{2,5})?)$/);
    if (!match) { res.writeHead(404); res.end('not found'); return; }

    const id       = match[1];
    // If id already includes an extension (e.g. abc123.png), use it as-is; else append .jpg for backward compat
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
