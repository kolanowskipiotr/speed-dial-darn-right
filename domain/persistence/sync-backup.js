// ─── FOLDER & BACKUP MANAGEMENT ──────────────────────────────────

async function createBackupFolder() {
    if (!googleUser || !currentAccessToken) {
        showToast(`${ICONS.warn} Please log in first.`);
        return;
    }
    const folderName = prompt('Enter a name for the new backup folder:', 'Speed Dial Darn Right - Backups');
    if (!folderName) return;

    syncStatusSpan.textContent = 'Creating folder...';
    try {
        const res = await fetch(`${BACKUP_BASE_URL}/create-folder`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAccessToken}`,
                'X-Access-Token': currentAccessToken,
            },
            body: JSON.stringify({ name: folderName })
        });
        if (!res.ok) throw new Error('Folder creation failed');
        const folder = await res.json();

        showToast(`${ICONS.ok} Folder created!`);
        await fetchGDriveFolders(true); // Re-fetch with force
        currentFolderId = folder.id;
        folderSelect.value = folder.id;
        onFolderSelected(folderSelect);
    } catch (e) {
        console.error('Failed to create folder:', e);
        showToast(`${ICONS.error} Could not create folder.`);
        syncStatusSpan.textContent = 'Folder creation error.';
    }
}

async function fetchGDriveFolders(force = false) {
    if (!googleUser || !currentAccessToken) {
        folderSelect.innerHTML = '<option value="">Login to select folder</option>';
        return;
    }
    if (!force && folderSelect.dataset.foldersLoaded) return; // Avoid re-fetching if already loaded

    folderSelect.innerHTML = '<option value="">Loading folders…</option>';
    try {
        const folders = await listGDriveFolders(currentAccessToken);
        folderSelect.innerHTML = '<option value="">— Select a folder —</option>'; // placeholder
        if (!folders || folders.length === 0) {
            folderSelect.innerHTML = '<option value="">No folders found</option>';
            return;
        }
        folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            folderSelect.appendChild(option);
        });
        // Restore previously selected folder if available
        if (currentFolderId && folderSelect.querySelector(`option[value="${currentFolderId}"]`)) {
            folderSelect.value = currentFolderId;
            fetchGDriveBackups(); // Ensure backups are fetched for the restored folder
        } else {
            // If folderId is missing or not found, clear it — show placeholder so user knows to pick
            currentFolderId = null;
            folderSelect.value = '';
            saveSyncSettings();
        }
        folderSelect.dataset.foldersLoaded = 'true';
    } catch (e) {
        if (!handleSyncError(e)) {
            folderSelect.innerHTML = '<option value="">Error loading folders</option>';
            showToast(`${ICONS.error} Could not load Google Drive folders.`);
        }
    }
}

async function onFolderSelected(selectElement) {
    currentFolderId = selectElement.value;
    saveSyncSettings();
    if (currentFolderId) {
        syncStatusSpan.textContent = 'Folder selected.';
        fetchGDriveBackups(); // Fetch backups for the new folder
    } else {
        syncStatusSpan.textContent = 'Select a folder to enable sync.';
        gdriveBackupList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dimmer);">Select a folder to see backups</div>';
    }
}

async function fetchGDriveBackups() {
    if (!googleUser || !currentAccessToken || !currentFolderId) {
        gdriveBackupList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dimmer);">Login and select a folder to see backups</div>';
        return;
    }

    gdriveBackupList.innerHTML = '<div style="padding: 20px; text-align: center;">Loading backups...</div>';
    try {
        const backups = await listGDriveBackups(currentAccessToken, currentFolderId);
        renderBackupList(backups);
        syncStatusSpan.textContent = `${backups.length} backup(s) found.`;
    } catch (e) {
        if (!handleSyncError(e)) {
            gdriveBackupList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--danger);">Error loading backups</div>';
            syncStatusSpan.textContent = 'Error loading backups.';
        } else {
            gdriveBackupList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dimmer);">Session expired — please log in again.</div>';
        }
    }
}

function renderBackupList(backups) {
    gdriveBackupList.innerHTML = '';
    if (!backups || backups.length === 0) {
        gdriveBackupList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dimmer);">No backups found in this folder</div>';
        return;
    }
    backups.forEach(backup => {
        const isFull = backup.name.includes('.full.');
        const isDiff = backup.name.includes('.diff.');
        const badge = isFull
            ? `<span class="backup-type-badge backup-type-full">FULL</span>`
            : isDiff
                ? `<span class="backup-type-badge backup-type-diff">DIFF</span>`
                : '';
        const div = document.createElement('div');
        div.className = 'notes-trash-row';
        div.innerHTML = `
            <div class="notes-trash-info">
                <div class="notes-trash-name">${badge}${backup.name}</div>
                <div class="notes-trash-date">${new Date(backup.createdTime).toLocaleString()}</div>
            </div>
            <div class="notes-trash-actions">
                <button class="btn-icon" title="Restore" onclick="restoreFromGDrive('${backup.id}', '${backup.name}')">${ICONS.restore || '↩'}</button>
            </div>
        `;
        gdriveBackupList.appendChild(div);
    });
}

async function restoreFromGDrive(fileId, fileName) {
    const isDiff = fileName.includes('.diff.');
    const confirmMsg = isDiff
        ? 'This will download the base full backup, apply this diff on top, and replace your current configuration. Continue?'
        : 'This will replace your current configuration with the selected backup. Continue?';

    showConfirm(
        `Restore from ${fileName}?`,
        confirmMsg,
        async () => {
            showToast(`${ICONS.loading} Restoring from ${fileName}...`);
            try {
                const backupData = await fetchGDriveFile(fileId);
                if (!backupData) throw new Error('Failed to fetch backup data.');

                let parsed = JSON.parse(backupData);

                if (parsed._type === 'diff') {
                    const { fullBackupId, fullBackupName } = parsed._meta;
                    showToast(`${ICONS.loading} Fetching base backup: ${fullBackupName}...`);
                    const fullData = await fetchGDriveFile(fullBackupId);
                    if (!fullData) throw new Error('Failed to fetch base full backup.');
                    parsed = applyDiff(JSON.parse(fullData), parsed);
                }

                await _doImport(parsed);
                showToast(`${ICONS.ok} Restored from ${fileName}`);
            } catch (e) {
                console.error('Restore failed:', e);
                showToast(`${ICONS.error} Restore failed. See console for details.`);
            }
        },
        { btnLabel: 'Restore', danger: false }
    );
}

function applyDiff(fullData, diff) {
    const result = { ...fullData };
    const isNewFormat = diff._meta?.diffFormat === 2
        || Object.keys(diff).some(k => k.endsWith('_patch'));

    if (isNewFormat) {
        // Format 2: item-level patches
        if (diff.tabs_patch)       result.tabs       = applyArrayPatch(fullData.tabs       || [], diff.tabs_patch);
        if (diff.todoLists_patch || diff.todoItems_patch) {
            result.todoLists = applyTodoListsDiffPatch(
                fullData.todoLists || [],
                diff.todoLists_patch,
                diff.todoItems_patch
            );
        }
        if (diff.notes_patch)      result.notes      = applyArrayPatch(fullData.notes      || [], diff.notes_patch);
        if (diff.notesTrash_patch) result.notesTrash = applyArrayPatch(fullData.notesTrash || [], diff.notesTrash_patch);
    } else {
        // Format 1 (stary): section-level overwrite — zachowane dla backupów historycznych
        if (diff.tabs !== undefined)       result.tabs = diff.tabs;
        if (diff.todoLists !== undefined)  result.todoLists = diff.todoLists;
        if (diff.notes !== undefined)      result.notes = diff.notes;
        if (diff.notesTrash !== undefined) result.notesTrash = diff.notesTrash;
    }

    // Wspólne dla obu formatów
    if (diff._config !== undefined)  result._config = diff._config;
    if (diff._images !== undefined)  result._images = { ...fullData._images, ...diff._images };

    return result;
}

/**
 * Aplikuje patch {upsert, delete} na tablicę obiektów identyfikowanych przez `id`.
 * - Zachowuje kolejność: elementy bazowe (niezmienione lub zaktualizowane) na swoich miejscach
 * - Usunięte (wg id) są odfiltrowywane
 * - Nowe (wg id nieobecne w baseArr) dołączane na końcu
 */
function applyArrayPatch(baseArr, patch) {
    const upsertMap = new Map((patch.upsert || []).map(item => [item.id, item]));
    const deleteSet = new Set(patch.delete || []);

    // Przefiltruj usunięte, zaktualizuj zmienione — zachowaj kolejność
    const result = baseArr
        .filter(item => !deleteSet.has(item.id))
        .map(item => upsertMap.has(item.id) ? upsertMap.get(item.id) : item);

    // Dodaj nowe elementy (id nieobecne w baseArr)
    const existingIds = new Set(baseArr.map(item => item.id));
    for (const item of (patch.upsert || [])) {
        if (!existingIds.has(item.id)) result.push(item);
    }

    return result;
}

function applyTodoListsDiffPatch(baseTodoLists, listsPatch, itemsPatchByListId) {
    const deleteSet = new Set(listsPatch?.delete || []);
    const upsertMap = new Map((listsPatch?.upsert || []).map(item => [item.id, item]));

    const result = (baseTodoLists || [])
        .filter(list => !deleteSet.has(list.id))
        .map(list => {
            const listCopy = {
                ...list,
                items: Array.isArray(list.items) ? [...list.items] : []
            };
            if (!upsertMap.has(list.id)) return listCopy;

            const listPatch = upsertMap.get(list.id);
            const merged = { ...listCopy, ...listPatch };
            // Metadata-only list patch should not wipe existing items.
            if (!Array.isArray(listPatch.items)) {
                merged.items = listCopy.items;
            }
            return merged;
        });

    const existingIds = new Set(result.map(list => list.id));
    for (const listPatch of (listsPatch?.upsert || [])) {
        if (existingIds.has(listPatch.id)) continue;

        const newList = { ...listPatch };
        if (!Array.isArray(newList.items)) newList.items = [];
        result.push(newList);
    }

    for (const list of result) {
        const itemPatch = itemsPatchByListId?.[list.id];
        if (!itemPatch) continue;
        list.items = applyArrayPatch(Array.isArray(list.items) ? list.items : [], itemPatch);
    }

    return result;
}

async function triggerManualSync() {
    if (!googleUser || !currentAccessToken || !currentFolderId) {
        showToast(`${ICONS.warn} Please log in and select a folder first.`);
        return;
    }

    // Rate-limit: max jeden ręczny backup na 24h
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (lastManualSync && (Date.now() - lastManualSync) < twentyFourHours) {
        const nextAt = new Date(lastManualSync + twentyFourHours)
            .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        showToast(`${ICONS.warn} Manual backup cooldown active. Next available at ${nextAt}.`);
        return;
    }

    manualSyncBtn.disabled = true;
    backupInProgress = true;
    syncStatusSpan.textContent = 'Backing up...';
    try {
        const exportObj = await getExportObject(); // Reuse export logic
        const res = await fetch(BACKUP_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAccessToken}`, // Pass token for backend auth
                'X-Access-Token': currentAccessToken,
                'X-GDrive-Folder-Id': currentFolderId // Pass folder ID for backend
            },
            body: JSON.stringify(exportObj)
        });
        if (res.ok) {
            syncStatusSpan.textContent = 'Backup successful!';
            lastManualSync = Date.now(); // FIX: używa lastManualSync, NIE lastAutoSync
            saveSyncSettings();
            updateSyncIndicators();
            showToast(`${ICONS.ok} Backup complete!`);
            setTimeout(fetchGDriveBackups, 1500); // brief delay for GDrive to index the new file
        } else {
            const errorText = `Backup failed: ${res.status}`;
            if (!handleSyncError({ message: errorText }, errorText)) {
                syncStatusSpan.textContent = errorText;
            }
        }
    } catch (e) {
        if (!handleSyncError(e, 'Backup error. Check console.')) {
            syncStatusSpan.textContent = 'Backup error. Check console.';
        }
    } finally {
        manualSyncBtn.disabled = false;
        backupInProgress = false;
    }
}

async function checkAutoSync() {
    if (!gdriveSyncEnabled) return;

    // Auto-sync enabled but session is gone — prompt re-login
    if (!googleUser || !currentAccessToken) {
        showToast(`${ICONS.warn} Auto-backup is on but you're not logged in to Google. Please log in again.`);
        if (showModalOnDisconnect) {
            openDataModal();
        }
        return;
    }

    if (!currentFolderId) return;
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (!lastAutoSync || (now - lastAutoSync) > twentyFourHours) {
        console.log('[sync] Triggering automatic backup...');
        lastAutoSync = now; // Update timestamp immediately to prevent re-triggering
        saveSyncSettings();
        updateSyncIndicators();
        backupInProgress = true;
        syncStatusSpan.textContent = 'Automatic backup in progress...';
        try {
            const exportObj = await getExportObject(); // Reuse export logic
            const res = await fetch(BACKUP_BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentAccessToken}`,
                    'X-Access-Token': currentAccessToken,
                    'X-GDrive-Folder-Id': currentFolderId
                },
                body: JSON.stringify(exportObj)
            });
            if (res.ok) {
                syncStatusSpan.textContent = 'Auto-backup successful.';
            } else {
                const errorText = `Auto-backup failed: ${res.status}`;
                if (!handleSyncError({ message: errorText }, errorText)) {
                    syncStatusSpan.textContent = errorText;
                }
            }
        } catch (e) {
            if (!handleSyncError(e)) {
                syncStatusSpan.textContent = 'Auto-backup error.';
            }
        } finally {
            backupInProgress = false;
        }
    } else {
        // Auto-sync not due yet
        syncStatusSpan.textContent = `Last sync: ${lastAutoSync ? new Date(lastAutoSync).toLocaleString() : 'never'}`;
    }
}

// ─── BACKEND API CALLS ────────────────────────────────────────────

async function listGDriveFolders(accessToken) {
    const res = await fetch(`${BACKUP_BASE_URL}/folders`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Access-Token': accessToken,
        }
    });
    if (res.status === 401) throw new Error('Invalid Credentials');
    if (!res.ok) throw new Error('Failed to fetch folders');
    return res.json();
}

async function listGDriveBackups(accessToken, folderId) {
    const res = await fetch(`${BACKUP_BASE_URL}/list?folderId=${folderId}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Access-Token': accessToken,
        }
    });
    if (res.status === 401) throw new Error('Invalid Credentials');
    if (!res.ok) throw new Error('Failed to fetch backups');
    return res.json();
}

async function fetchGDriveFile(fileId) {
    const res = await fetch(`${BACKUP_BASE_URL}/fetch?fileId=${fileId}`, {
        headers: {
            'Authorization': `Bearer ${currentAccessToken}`,
            'X-Access-Token': currentAccessToken,
        }
    });
    if (!res.ok) throw new Error('Failed to fetch file');
    const data = await res.json();
    return JSON.stringify(data); // Return as string to match existing logic
}
