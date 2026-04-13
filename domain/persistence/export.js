// ─── UNIFIED EXPORT & SYNC ──────────────────────────────────────

async function getExportObject() {
    const images = {};
    let imageErrors = 0;

    // Helper to fetch and convert image to base64
    async function _includeImage(id, path) {
        if (images[id]) return;
        try {
            const resp = await fetch(path);
            if (resp.ok) {
                const blob = await resp.blob();
                images[id] = await _blobToBase64(blob);
            } else {
                console.warn(`[export] ${path} → HTTP ${resp.status}`);
                imageErrors++;
            }
        } catch (e) {
            console.error(`[export] failed to fetch ${path}:`, e);
            imageErrors++;
        }
    }

    for (const tab of data.tabs) {
        for (const group of (tab.groups || [])) {
            for (const dial of (group.dials || [])) {
                if (dial.iconType === 'custom' && dial.icon && dial.icon.startsWith('/uploads/')) {
                    await _includeImage(dial.id, dial.icon);
                }
            }
        }
    }

    // Also collect images referenced in todo item content
    for (const list of (data.todoLists || [])) {
        for (const item of (list.items || [])) {
            const uploadIds = (item.content || '').match(/\/uploads\/([\w.\-]+)/g) || [];
            for (const ref of uploadIds) {
                const id = ref.replace('/uploads/', '');
                await _includeImage(id, ref);
            }
        }
    }

    // Also collect images referenced in notes content (active + trash)
    for (const note of [...(data.notes || []), ...(data.notesTrash || [])]) {
        const uploadIds = (note.content || '').match(/\/uploads\/([\w.\-]+)/g) || [];
        for (const ref of uploadIds) {
            const id = ref.replace('/uploads/', '');
            await _includeImage(id, ref);
        }
    }

    return {
        ...data,
        _config: {
            theme: localStorage.getItem('speedDial_theme') || 'dark-yellow',
            logoAnim: logoAnimEnabled,
            weather: JSON.parse(localStorage.getItem('speedDial_weather') || 'null'),
            syncConfig: {
                autoSync: typeof gdriveSyncEnabled !== 'undefined' ? gdriveSyncEnabled : false,
                showModalOnDisconnect: typeof showModalOnDisconnect !== 'undefined' ? showModalOnDisconnect : true,
                folderId: typeof currentFolderId !== 'undefined' ? currentFolderId : null,
            }
        },
        _images: images,
        _exportMeta: {
            version: '2.0',
            exportedAt: new Date().toISOString(),
            imageErrors
        }
    };
}

async function exportData() {
    showToast(`${ICONS.loading} Preparing export…`);
    try {
        const exportObj = await getExportObject();
        const json = JSON.stringify(exportObj, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `speed-dial-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        const imgCount = Object.keys(exportObj._images).length;
        if (exportObj._exportMeta.imageErrors) {
            showToast(`${ICONS.warn} Exported — ${exportObj._exportMeta.imageErrors} image(s) failed`);
        } else {
            showToast(`${ICONS.ok} Exported${imgCount ? ` (${imgCount} image(s) included)` : ''}`);
        }
    } catch (e) {
        console.error('[export] failed:', e);
        showToast(`${ICONS.error} Export failed`);
    }
}

// ─── SYNC ────────────────────────────────────────────────────────

let _syncTimer = null;
async function triggerSync() {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async () => {
        try {
            // Background sync runs only for an authenticated session.
            if (!googleUser || !currentAccessToken) {
                return;
            }

            const exportObj = await getExportObject();
            const syncHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAccessToken}`,
                'X-Access-Token': currentAccessToken,
            };
            if (typeof currentFolderId !== 'undefined' && currentFolderId) {
                syncHeaders['X-GDrive-Folder-Id'] = currentFolderId;
            }

            let res = await fetch('/api/sync', {
                method: 'POST',
                headers: syncHeaders,
                body: JSON.stringify(exportObj)
            });

            // Token might expire between autosaves; try one silent refresh + retry.
            if (res.status === 401 && typeof fetchFreshToken === 'function') {
                const refreshed = await fetchFreshToken();
                if (refreshed && currentAccessToken) {
                    syncHeaders['Authorization'] = `Bearer ${currentAccessToken}`;
                    syncHeaders['X-Access-Token'] = currentAccessToken;
                    res = await fetch('/api/sync', {
                        method: 'POST',
                        headers: syncHeaders,
                        body: JSON.stringify(exportObj)
                    });
                }
            }

            if (res.ok) {
                console.log('[sync] successful');
            } else {
                if (res.status === 401 && typeof handleSyncError === 'function') {
                    handleSyncError(new Error('401'));
                }
                console.warn('[sync] failed:', res.status);
            }
        } catch (e) {
            console.error('[sync] error:', e);
        }
    }, 5000); // Debounce sync by 5s
}

// ─── IMPORT ──────────────────────────────────────────────────────

// ─── IMPORT UI ───────────────────────────────────────────────────

let _pendingImportJSON = null;

function onImportFileSelected(input) {
    const file = input.files[0];
    if (!file) return;
    const nameEl = document.getElementById('importFileName');
    if (nameEl) nameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = e => { _pendingImportJSON = e.target.result; };
    reader.readAsText(file);
}

function importData() {
    const dataEl = document.getElementById('importData');
    const raw = _pendingImportJSON || (dataEl ? dataEl.value.trim() : '');
    if (!raw) { showToast(`${ICONS.warn} No data to import`); return; }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch(e) {
        showToast(`${ICONS.error} Invalid JSON format`);
        return;
    }
    closeModal('dataModal');
    showConfirm('Import Configuration', 'This will replace your current configuration. Continue?', () => {
        _doImport(parsed);
    }, { btnLabel: 'Replace', danger: false });
}

async function _doImport(imported) {
    // Support both old { groups } and new { tabs } format
    if (imported.groups && !imported.tabs) {
        imported.tabs = [{ id: uid(), name: 'Home', groups: imported.groups }];
    }
    if (!imported.tabs || !Array.isArray(imported.tabs)) {
        showToast(`${ICONS.error} Invalid format`);
        return;
    }

    const images = imported._images || {};
    const config = imported._config || {};
    delete imported._images;
    delete imported._config;
    delete imported._exportMeta;

    // Upload images back to server
    const imgIds = Object.keys(images);
    if (imgIds.length) {
        showToast(`${ICONS.loading} Importing ${imgIds.length} images…`);
        for (const id of imgIds) {
            try {
                const blob = await _base64ToBlob(images[id]);
                await uploadDialImage(id, blob);
            } catch (e) {
                console.error(`[import] failed to upload image ${id}:`, e);
            }
        }
    }

    // Update data and config
    data = imported;
    if (config.theme) applyTheme(config.theme);
    if (config.logoAnim !== undefined) {
        logoAnimEnabled = config.logoAnim;
        localStorage.setItem('logoAnim', logoAnimEnabled);
        if (typeof updateAnimToggleUI === 'function') updateAnimToggleUI();
    }

    if (config.weather !== undefined && config.weather !== null) {
        localStorage.setItem('speedDial_weather', JSON.stringify(config.weather));
        if (typeof _loadWeatherConfig === 'function') _loadWeatherConfig();
        if (typeof _updateInline === 'function') _updateInline();
    }

    if (config.syncConfig) {
        const settings = JSON.parse(localStorage.getItem('speedDial_syncSettings') || '{}');
        if (config.syncConfig.autoSync !== undefined) {
            settings.autoSync = config.syncConfig.autoSync;
            if (typeof gdriveSyncEnabled !== 'undefined') gdriveSyncEnabled = settings.autoSync;
        }
        if (config.syncConfig.showModalOnDisconnect !== undefined) {
            settings.showModalOnDisconnect = config.syncConfig.showModalOnDisconnect;
            if (typeof showModalOnDisconnect !== 'undefined') showModalOnDisconnect = settings.showModalOnDisconnect;
        }
        if (config.syncConfig.folderId !== undefined) {
            settings.folderId = config.syncConfig.folderId;
            if (typeof currentFolderId !== 'undefined') currentFolderId = settings.folderId;
        }
        localStorage.setItem('speedDial_syncSettings', JSON.stringify(settings));

        // Refresh UI if functions are available
        if (typeof updateAutoSyncToggleUI === 'function') updateAutoSyncToggleUI();
        if (typeof updateShowModalOnDisconnectToggleUI === 'function') updateShowModalOnDisconnectToggleUI();
    }

    saveData();
    render();
    showToast(`${ICONS.ok} Import successful`);
}

function _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function _base64ToBlob(b64) {
    const res = await fetch(b64);
    return res.blob();
}
