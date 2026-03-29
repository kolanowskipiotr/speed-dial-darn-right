const http = require('http');
const fs   = require('fs');
const path = require('path');
const { performSync, listGDriveFolders, listGDriveBackups, fetchGDriveFile, createGDriveFolder } = require('./sync');

const UPLOADS_DIR = '/uploads';
const PORT = 3001;

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

http.createServer(async (req, res) => {
    // API: SYNC OPERATIONS (POST, GET)
    if (req.url.startsWith('/api/sync')) {
        const folderId = req.headers['x-gdrive-folder-id'];
        const token = req.headers['authorization']?.split(' ')[1];

        if (!token) {
            res.writeHead(401);
            res.end('Unauthorized: No token provided');
            return;
        }

        // --- Folders API ---
        if (req.url === '/api/sync/folders' && req.method === 'GET') {
            try {
                const folders = await listGDriveFolders(token);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(folders));
            } catch (e) {
                const status = e.status || e.code;
                if (status === 401) { res.writeHead(401); res.end('Unauthorized'); return; }
                console.error('[sync] GET /api/sync/folders failed:', e.message);
                res.writeHead(500);
                res.end('error');
            }
            return;
        }

        // --- Create Folder API ---
        if (req.url === '/api/sync/create-folder' && req.method === 'POST') {
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', async () => {
                try {
                    const { name } = JSON.parse(Buffer.concat(chunks).toString());
                    const folder = await createGDriveFolder(token, name);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(folder));
                } catch (e) {
                    console.error('[sync] POST /api/sync/create-folder failed:', e.message);
                    res.writeHead(500);
                    res.end('error');
                }
            });
            return;
        }

        if (req.url === '/api/sync' && req.method === 'POST') { // Backup
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', async () => {
                try {
                    const data = JSON.parse(Buffer.concat(chunks).toString());
                    await performSync(data, token, folderId);
                    res.writeHead(200);
                    res.end('ok');
                } catch (e) {
                    console.error('[sync] POST /api/sync failed:', e);
                    res.writeHead(500);
                    res.end('error');
                }
            });
            return;
        } else if (req.url.startsWith('/api/sync/list') && req.method === 'GET') { // List backups
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const targetFolderId = urlObj.searchParams.get('folderId') || folderId;
            if (!targetFolderId) {
                res.writeHead(400);
                res.end('Bad Request: Folder ID missing');
                return;
            }
            try {
                const backups = await listGDriveBackups(token, targetFolderId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(backups));
            } catch (e) {
                const status = e.status || e.code;
                if (status === 401) { res.writeHead(401); res.end('Unauthorized'); return; }
                console.error(`[sync] GET /api/sync/list failed for folder ${targetFolderId}:`, e);
                res.writeHead(500);
                res.end('error');
            }
            return;
        } else if (req.url.startsWith('/api/sync/fetch') && req.method === 'GET') { // Fetch backup
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const fileId = urlObj.searchParams.get('fileId');
            if (!fileId) {
                res.writeHead(400);
                res.end('Bad Request: File ID missing');
                return;
            }
            try {
                const content = await fetchGDriveFile(token, fileId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(content));
            } catch (e) {
                console.error(`[sync] GET /api/sync/fetch failed for file ${fileId}:`, e);
                res.writeHead(500);
                res.end('error');
            }
            return;
        }
        return;
    }

    // --- File Uploads ---
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
