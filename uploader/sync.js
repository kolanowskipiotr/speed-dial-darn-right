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

/**
 * Buduje patch dla tablicy obiektów identyfikowanych przez pole `id`.
 * - upsert: obiekty nowe lub zmienione (wg JSON.stringify)
 * - delete: id obiektów obecnych w oldArr, brakujących w newArr
 */
function buildArrayPatch(oldArr = [], newArr = []) {
    const oldMap = new Map(oldArr.map(item => [item.id, item]));
    const newMap = new Map(newArr.map(item => [item.id, item]));

    const upsert = [];
    for (const [id, newItem] of newMap) {
        const oldItem = oldMap.get(id);
        if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
            upsert.push(newItem);
        }
    }

    const deleted = [];
    for (const id of oldMap.keys()) {
        if (!newMap.has(id)) deleted.push(id);
    }

    return { upsert, delete: deleted };
}

function calculateDiff(fullBackup, newData) {
    const oldData = fullBackup.data;
    const diff = {
        _type: 'diff',
        _meta: {
            diffAt: new Date().toISOString(),
            fullBackupId: fullBackup.id,
            fullBackupName: fullBackup.name,
            baseExportedAt: oldData._exportMeta?.exportedAt,
            diffFormat: 2
        }
    };

    const tabsPatch = buildArrayPatch(oldData.tabs, newData.tabs);
    if (tabsPatch.upsert.length > 0 || tabsPatch.delete.length > 0) {
        diff.tabs_patch = tabsPatch;
    }

    const todoListsPatch = buildArrayPatch(oldData.todoLists, newData.todoLists);
    if (todoListsPatch.upsert.length > 0 || todoListsPatch.delete.length > 0) {
        diff.todoLists_patch = todoListsPatch;
    }

    const notesPatch = buildArrayPatch(oldData.notes, newData.notes);
    if (notesPatch.upsert.length > 0 || notesPatch.delete.length > 0) {
        diff.notes_patch = notesPatch;
    }

    const notesTrashPatch = buildArrayPatch(oldData.notesTrash, newData.notesTrash);
    if (notesTrashPatch.upsert.length > 0 || notesTrashPatch.delete.length > 0) {
        diff.notesTrash_patch = notesTrashPatch;
    }

    if (JSON.stringify(oldData._config) !== JSON.stringify(newData._config)) {
        diff._config = newData._config;
    }

    // _images: tylko nowe/zmienione obrazy (logika bez zmian)
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

module.exports = {
    performSync,
    listGDriveFolders,
    listGDriveBackups,
    fetchGDriveFile,
    createGDriveFolder,
    // Test exports
    __test__: { buildArrayPatch, calculateDiff }
};
