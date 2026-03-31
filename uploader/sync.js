const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

function getDriveClient(token) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token });
    return google.drive({ version: 'v3', auth });
}

async function getLatestFullBackup(d, folderId) {
    const res = await d.files.list({
        q: `'${folderId}' in parents and name contains 'full' and trashed = false`,
        orderBy: 'createdTime desc',
        pageSize: 1,
        fields: 'files(id, name, createdTime)',
    });

    if (res.data.files.length === 0) return null;

    const file = res.data.files[0];
    const content = await d.files.get({ fileId: file.id, alt: 'media' });
    return { id: file.id, name: file.name, createdTime: file.createdTime, data: content.data };
}

function calculateDiff(fullBackup, newData) {
    const oldData = fullBackup.data;
    const diff = {
        _type: 'diff',
        _meta: {
            diffAt: new Date().toISOString(),
            fullBackupId: fullBackup.id,
            fullBackupName: fullBackup.name,
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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function performSync(data, token, folderId) {
    if (!token || !folderId) {
        console.warn('[sync] Missing token or folderId, skipping sync');
        return;
    }
    const d = getDriveClient(token);

    try {
        const latestFull = await getLatestFullBackup(d, folderId);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        const fullBackupAge = latestFull ? Date.now() - new Date(latestFull.createdTime).getTime() : Infinity;
        const shouldDoFull = !latestFull || fullBackupAge >= SEVEN_DAYS_MS;

        if (shouldDoFull) {
            console.log('[sync] Performing full backup');
            await uploadToDrive(d, folderId, `backup_${timestamp}.full.json`, JSON.stringify(data, null, 2));
        } else {
            console.log('[sync] Performing incremental backup (diff)');
            const diff = calculateDiff(latestFull, data);
            await uploadToDrive(d, folderId, `backup_${timestamp}.diff.json`, JSON.stringify(diff, null, 2));
        }

        await cleanupOldBackups(d, folderId);
    } catch (e) {
        console.error('[sync] Sync failed:', e);
    }
}

async function uploadToDrive(d, folderId, name, content) {
    return d.files.create({
        requestBody: {
            name,
            parents: [folderId],
            mimeType: 'application/json',
        },
        media: {
            mimeType: 'application/json',
            body: content,
        },
    });
}

async function cleanupOldBackups(d, folderId) {
    const res = await d.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        orderBy: 'createdTime desc',
        fields: 'files(id, name, createdTime)',
    });

    const files = res.data.files;
    if (files.length > 50) {
        const toDelete = files.slice(50);
        for (const file of toDelete) {
            console.log(`[sync] Deleting old backup: ${file.name}`);
            await d.files.delete({ fileId: file.id });
        }
    }
}

async function listGDriveFolders(token) {
    const d = getDriveClient(token);
    const res = await d.files.list({
        q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: 'files(id, name)',
    });
    return res.data.files;
}

async function listGDriveBackups(token, folderId) {
    const d = getDriveClient(token);
    const res = await d.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        orderBy: 'createdTime desc',
        fields: 'files(id, name, createdTime)',
    });
    return res.data.files;
}

async function fetchGDriveFile(token, fileId) {
    const d = getDriveClient(token);
    const res = await d.files.get({ fileId, alt: 'media' });
    return res.data;
}

async function createGDriveFolder(token, name) {
    const d = getDriveClient(token);
    const res = await d.files.create({
        requestBody: {
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id, name',
    });
    return res.data;
}

module.exports = { performSync, listGDriveFolders, listGDriveBackups, fetchGDriveFile, createGDriveFolder };
