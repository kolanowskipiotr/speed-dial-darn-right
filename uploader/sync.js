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
 * Rekurencyjnie porównuje dwa obiekty pomijając pola techniczne (visitCount, lastVisited).
 * Zwraca true jeśli obiekty są istotnie równe (bez zmian w danych użytkownika).
 */
function _areEssentiallyEqual(oldItem, newItem) {
    // Skopiuj obiekty i usuń pola techniczne
    const oldCopy = JSON.parse(JSON.stringify(oldItem));
    const newCopy = JSON.parse(JSON.stringify(newItem));

    // Rekurencyjnie usuń visitCount i lastVisited ze wszystkich poziomów
    function stripTechnicalFields(obj) {
        if (typeof obj !== 'object' || obj === null) return obj;
        if (Array.isArray(obj)) {
            return obj.map(item => stripTechnicalFields(item));
        }
        for (const key in obj) {
            if (key === 'visitCount' || key === 'lastVisited') {
                delete obj[key];
            } else {
                obj[key] = stripTechnicalFields(obj[key]);
            }
        }
        return obj;
    }

    const stripped_old = stripTechnicalFields(oldCopy);
    const stripped_new = stripTechnicalFields(newCopy);

    return JSON.stringify(stripped_old) === JSON.stringify(stripped_new);
}

/**
 * Buduje patch dla tablicy obiektów identyfikowanych przez pole `id`.
 * - upsert: obiekty nowe lub zmienione (wg JSON.stringify), pomijając visitCount i lastVisited
 * - delete: id obiektów obecnych w oldArr, brakujących w newArr
 */
function buildArrayPatch(oldArr = [], newArr = []) {
    const oldMap = new Map(oldArr.map(item => [item.id, item]));
    const newMap = new Map(newArr.map(item => [item.id, item]));

    const upsert = [];
    for (const [id, newItem] of newMap) {
        const oldItem = oldMap.get(id);
        if (!oldItem || !_areEssentiallyEqual(oldItem, newItem)) {
            upsert.push(newItem);
        }
    }

    const deleted = [];
    for (const id of oldMap.keys()) {
        if (!newMap.has(id)) deleted.push(id);
    }

    return { upsert, delete: deleted };
}

function _stripTodoItems(todoList = {}) {
    const { items, ...rest } = todoList;
    return rest;
}

function buildTodoListsPatch(oldLists = [], newLists = []) {
    const oldMap = new Map(oldLists.map(list => [list.id, list]));
    const newMap = new Map(newLists.map(list => [list.id, list]));

    const listsPatch = { upsert: [], delete: [] };
    const itemsPatchByListId = {};

    for (const [listId, newList] of newMap) {
        const oldList = oldMap.get(listId);

        if (!oldList) {
            // New list must carry full payload (including items) so restore can create it in one step.
            listsPatch.upsert.push(newList);
            continue;
        }

        const oldMeta = _stripTodoItems(oldList);
        const newMeta = _stripTodoItems(newList);
        if (!_areEssentiallyEqual(oldMeta, newMeta)) {
            // Existing list metadata update: keep items separate to avoid full-list upserts.
            listsPatch.upsert.push(newMeta);
        }

        const itemsPatch = buildArrayPatch(oldList.items || [], newList.items || []);
        if (itemsPatch.upsert.length > 0 || itemsPatch.delete.length > 0) {
            itemsPatchByListId[listId] = itemsPatch;
        }
    }

    for (const listId of oldMap.keys()) {
        if (!newMap.has(listId)) {
            listsPatch.delete.push(listId);
        }
    }

    return { listsPatch, itemsPatchByListId };
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

    const { listsPatch: todoListsPatch, itemsPatchByListId } = buildTodoListsPatch(oldData.todoLists, newData.todoLists);
    if (todoListsPatch.upsert.length > 0 || todoListsPatch.delete.length > 0) {
        diff.todoLists_patch = todoListsPatch;
    }
    if (Object.keys(itemsPatchByListId).length > 0) {
        diff.todoItems_patch = itemsPatchByListId;
    }
    // List order is a plain id array — store it whole when it changes
    if (JSON.stringify(oldData.todoListOrder || []) !== JSON.stringify(newData.todoListOrder || [])) {
        diff.todoListOrder = newData.todoListOrder || [];
    }

    const notesPatch = buildArrayPatch(oldData.notes, newData.notes);
    if (notesPatch.upsert.length > 0 || notesPatch.delete.length > 0) {
        diff.notes_patch = notesPatch;
    }

    const notesTrashPatch = buildArrayPatch(oldData.notesTrash, newData.notesTrash);
    if (notesTrashPatch.upsert.length > 0 || notesTrashPatch.delete.length > 0) {
        diff.notesTrash_patch = notesTrashPatch;
    }

    const monitoredPagesPatch = buildArrayPatch(oldData.monitoredPages || [], newData.monitoredPages || []);
    if (monitoredPagesPatch.upsert.length > 0 || monitoredPagesPatch.delete.length > 0) {
        diff.monitoredPages_patch = monitoredPagesPatch;
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

function hasMeaningfulDiff(diff) {
    return Object.keys(diff).some(k => k !== '_type' && k !== '_meta');
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function _syncError(message, statusCode, cause) {
    const err = new Error(message, cause ? { cause } : undefined);
    err.statusCode = statusCode;
    return err;
}

/**
 * Uploads a full or diff backup. Throws on failure (err.statusCode: 400 missing
 * token/folder, 401 rejected Google credentials, 500 otherwise) so the client
 * does not treat a failed backup as done.
 */
async function performSync(data, token, folderId, { forceFull = false, drive } = {}) {
    if (!token || !folderId) {
        throw _syncError('Missing token or folderId', 400);
    }
    const d = drive || getDriveClient(token);

    try {
        const latestFull = await getLatestFullBackup(d, folderId);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        const fullBackupAge = latestFull ? Date.now() - new Date(latestFull.createdTime).getTime() : Infinity;
        const shouldDoFull = forceFull || !latestFull || fullBackupAge >= SEVEN_DAYS_MS;

        if (shouldDoFull) {
            console.log('[sync] Performing full backup');
            await uploadToDrive(d, folderId, `backup_${timestamp}.full.json`, JSON.stringify(data, null, 2));
        } else {
            console.log('[sync] Performing incremental backup (diff)');
            const diff = calculateDiff(latestFull, data);
            if (!hasMeaningfulDiff(diff)) {
                console.log('[sync] No meaningful changes detected, skipping incremental backup');
                return;
            }
            await uploadToDrive(d, folderId, `backup_${timestamp}.diff.json`, JSON.stringify(diff, null, 2));
        }
    } catch (e) {
        console.error('[sync] Sync failed:', e);
        const status = Number(e.response?.status || e.code);
        throw _syncError(`Backup failed: ${e.message}`, status === 401 ? 401 : 500, e);
    }

    // Backup is already stored — a cleanup failure must not report it as failed
    try {
        await cleanupOldBackups(d, folderId);
    } catch (e) {
        console.error('[sync] Cleanup of old backups failed:', e);
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

/**
 * Drive API v3 caps files.list at pageSize (default 100, max 1000) per call.
 * Must page through nextPageToken to see the true full list.
 */
async function listAllFiles(d, query, fields = 'files(id, name, createdTime)') {
    let files = [];
    let pageToken;
    do {
        const res = await d.files.list({
            q: query,
            orderBy: 'createdTime desc',
            fields: `nextPageToken, ${fields}`,
            pageSize: 1000,
            pageToken,
        });
        files = files.concat(res.data.files || []);
        pageToken = res.data.nextPageToken;
    } while (pageToken);
    return files;
}

const MAX_BACKUP_FILES = 200;

/**
 * Picks backup files to delete. `files` must be newest first.
 *
 * A full backup plus the diffs newer than it (up to the next full) form a chain.
 * Diffs are differential (each against the chain's full), so a chain's newest diff
 * alone restores the chain's final state. While over `max` files:
 *   1. older chains, oldest first, are flattened to their full + newest diff
 *   2. flattened chains are deleted, oldest first
 *   3. the newest chain keeps its full + its newest diffs
 * Diffs older than the oldest full have no base and are always deleted.
 * Files that are not backups are never touched.
 */
function planBackupCleanup(files, max = MAX_BACKUP_FILES) {
    const isFull = f => f.name.includes('.full.');
    const backups = files.filter(f => isFull(f) || f.name.includes('.diff.'));

    const chains = []; // newest first; each: [newest diff, …, oldest diff, full]
    let pending = [];
    for (const f of backups) {
        pending.push(f);
        if (isFull(f)) { chains.push(pending); pending = []; }
    }
    const toDelete = [...pending]; // orphaned diffs
    let total = chains.reduce((n, c) => n + c.length, 0);

    for (let i = chains.length - 1; i >= 1 && total > max; i--) {
        const middle = chains[i].slice(1, -1);
        toDelete.push(...middle);
        total -= middle.length;
    }
    while (chains.length > 1 && total > max) {
        const oldest = chains.pop();
        const kept = oldest.length > 1 ? [oldest[0], oldest[oldest.length - 1]] : oldest;
        toDelete.push(...kept);
        total -= kept.length;
    }
    if (chains.length === 1 && total > max) {
        const diffs = chains[0].slice(0, -1);
        toDelete.push(...diffs.slice(diffs.length - (total - max)));
    }
    return toDelete;
}

async function cleanupOldBackups(d, folderId) {
    const files = await listAllFiles(d, `'${folderId}' in parents and trashed = false`); // newest first
    for (const file of planBackupCleanup(files)) {
        console.log(`[sync] Deleting old backup: ${file.name}`);
        await d.files.delete({ fileId: file.id });
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
    return listAllFiles(d, `'${folderId}' in parents and trashed = false`);
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
    __test__: { buildArrayPatch, calculateDiff, hasMeaningfulDiff, planBackupCleanup }
};
