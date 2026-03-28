const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const BACKUP_FOLDER_ID = process.env.GDRIVE_FOLDER_ID;
const SERVICE_ACCOUNT_KEY = process.env.GDRIVE_SERVICE_ACCOUNT_JSON;

let drive = null;

async function initDrive() {
    if (drive) return drive;
    if (!SERVICE_ACCOUNT_KEY) {
        console.warn('[sync] GDRIVE_SERVICE_ACCOUNT_JSON not set, skipping GDrive sync');
        return null;
    }

    try {
        const credentials = JSON.parse(SERVICE_ACCOUNT_KEY);
        const auth = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
        drive = google.drive({ version: 'v3', auth });
        return drive;
    } catch (e) {
        console.error('[sync] Failed to initialize GDrive:', e);
        return null;
    }
}

async function getLatestFullBackup() {
    const d = await initDrive();
    if (!d) return null;

    const res = await d.files.list({
        q: `'${BACKUP_FOLDER_ID}' in parents and name contains 'full' and trashed = false`,
        orderBy: 'createdTime desc',
        pageSize: 1,
        fields: 'files(id, name)',
    });

    if (res.data.files.length === 0) return null;

    const fileId = res.data.files[0].id;
    const content = await d.files.get({ fileId, alt: 'media' });
    return content.data;
}

function calculateDiff(oldData, newData) {
    // Simple top-level diff for now, can be improved
    const diff = {
        _meta: {
            diffAt: new Date().toISOString(),
            baseExportedAt: oldData._exportMeta?.exportedAt
        }
    };

    if (JSON.stringify(oldData.tabs) !== JSON.stringify(newData.tabs)) {
        diff.tabs = newData.tabs;
    }
    if (JSON.stringify(oldData.todoLists) !== JSON.stringify(newData.todoLists)) {
        diff.todoLists = newData.todoLists;
    }
    if (JSON.stringify(oldData.notes) !== JSON.stringify(newData.notes)) {
        diff.notes = newData.notes;
    }
    if (JSON.stringify(oldData.notesTrash) !== JSON.stringify(newData.notesTrash)) {
        diff.notesTrash = newData.notesTrash;
    }
    if (JSON.stringify(oldData._config) !== JSON.stringify(newData._config)) {
        diff._config = newData._config;
    }
    
    // Only include new/changed images
    const newImages = {};
    for (const id in newData._images) {
        if (newData._images[id] !== oldData._images[id]) {
            newImages[id] = newData._images[id];
        }
    }
    if (Object.keys(newImages).length > 0) {
        diff._images = newImages;
    }

    return diff;
}

async function performSync(data) {
    const d = await initDrive();
    if (!d) return;

    try {
        const latestFull = await getLatestFullBackup();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // Decide if we should do a full backup or a diff
        // Policy: Full backup every 10 syncs or if no full backup exists
        const syncCount = await countRecentSyncs();
        const shouldDoFull = !latestFull || syncCount % 10 === 0;

        if (shouldDoFull) {
            console.log('[sync] Performing full backup');
            await uploadToDrive(`backup_${timestamp}.full.json`, JSON.stringify(data, null, 2));
        } else {
            console.log('[sync] Performing incremental backup (diff)');
            const diff = calculateDiff(latestFull, data);
            await uploadToDrive(`backup_${timestamp}.diff.json`, JSON.stringify(diff, null, 2));
        }

        await cleanupOldBackups();
    } catch (e) {
        console.error('[sync] Sync failed:', e);
    }
}

async function uploadToDrive(name, content) {
    const d = await initDrive();
    return d.files.create({
        requestBody: {
            name,
            parents: [BACKUP_FOLDER_ID],
            mimeType: 'application/json',
        },
        media: {
            mimeType: 'application/json',
            body: content,
        },
    });
}

async function countRecentSyncs() {
    const d = await initDrive();
    const res = await d.files.list({
        q: `'${BACKUP_FOLDER_ID}' in parents and trashed = false`,
        fields: 'files(id)',
    });
    return res.data.files.length;
}

async function cleanupOldBackups() {
    const d = await initDrive();
    const res = await d.files.list({
        q: `'${BACKUP_FOLDER_ID}' in parents and trashed = false`,
        orderBy: 'createdTime desc',
        fields: 'files(id, name, createdTime)',
    });

    const files = res.data.files;
    // Retention Policy: Keep last 50 backups
    if (files.length > 50) {
        const toDelete = files.slice(50);
        for (const file of toDelete) {
            console.log(`[sync] Deleting old backup: ${file.name}`);
            await d.files.delete({ fileId: file.id });
        }
    }
}

module.exports = { performSync };
