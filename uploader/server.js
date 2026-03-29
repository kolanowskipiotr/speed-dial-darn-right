const http = require('http');
const fs   = require('fs');
const path = require('path');
const { performSync, listGDriveFolders, listGDriveBackups, fetchGDriveFile } = require('./sync');

const UPLOADS_DIR = '/uploads';
const PORT = 3001;

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Helper to get authenticated drive client from request headers/token
async function getAuthenticatedDrive(req) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) throw new Error('No auth token provided');

    // This token is from the frontend (OAuth access token), not a service account.
    // We need to create a JWT client on the fly using the service account key
    // but authorize it with the user's token scope. This is complex.
    // A simpler approach for now: assume the token is directly usable or the backend proxies calls.
    // For this example, let's assume the token itself is enough or the backend has it.
    // In a real app, you'd validate the token and get user-specific credentials or use Google APIs directly if possible without server keys.

    // For now, we will pass the token to the sync module, which might need adjustments.
    // The initial initDrive() in sync.js uses service account. We need to make it flexible.
    // Or, the server itself should instantiate the drive client.

    // Simulating drive client init for now, would need proper JWT setup with user token
    // This part requires careful handling of Google API auth for user tokens vs service accounts.
    // For this exercise, we'll assume sync.js can take a token and folderId and it knows how to use it.
    // This is a simplification.
    return { token }; // Returning token to sync module
}

http.createServer((req, res) => {
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
            getAuthenticatedDrive(req).then(async ({ token }) => {
                try {
                    const folders = await listGDriveFolders(token); // Assumes listGDriveFolders can use token
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(folders));
                } catch (e) {
                    console.error('[sync] GET /api/sync/folders failed:', e);
                    res.writeHead(500);
                    res.end('error');
                }
            }).catch(e => {
                console.error('[sync] Auth error for /api/sync/folders:', e.message);
                res.writeHead(401);
                res.end('Unauthorized');
            });
            return;
        }

        if (req.url === '/api/sync' && req.method === 'POST') { // Backup
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', async () => {
                try {
                    const data = JSON.parse(Buffer.concat(chunks).toString());
                    await performSync(data, token, folderId); // Pass token and folderId
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
            const { folderId: queryFolderId } = req.query;
            const targetFolderId = queryFolderId || folderId;
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
                console.error(`[sync] GET /api/sync/list failed for folder ${targetFolderId}:`, e);
                res.writeHead(500);
                res.end('error');
            }
        } else if (req.url.startsWith('/api/sync/fetch') && req.method === 'GET') { // Fetch backup
            const fileId = req.url.split('?fileId=')[1];
            if (!fileId) {
                res.writeHead(400);
                res.end('Bad Request: File ID missing');
                return;
            }
            try {
                const content = await fetchGDriveFile(token, fileId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(content);
            } catch (e) {
                console.error(`[sync] GET /api/sync/fetch failed for file ${fileId}:`, e);
                res.writeHead(500);
                res.end('error');
            }
        }
        return; // Handle sync API requests
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
