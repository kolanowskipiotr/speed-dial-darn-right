// ─── GOOGLE DRIVE SYNC CONFIGURATION ──────────────────────────────

// --- Constants & State ---
const GAPI_CLIENT_ID = '130093064192-5odc4arfjdpj0370emlse0rvg3e84jiq.apps.googleusercontent.com';
const GAPI_API_KEY = 'YOUR_GOOGLE_API_KEY'; // Needed for some non-auth calls, if any
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email'
];
const BACKUP_BASE_URL = '/api/sync'; // Base URL for backend sync API

// ... initSyncConfig remains same ...

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
                'Authorization': `Bearer ${currentAccessToken}` 
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

let googleUser = null;
let currentAccessToken = null;
let currentFolderId = null;
let gdriveSyncEnabled = false;
let lastAutoSync = null;

// --- DOM Elements ---
const dataModal = document.getElementById('dataModal');
const gdriveAuthSection = document.getElementById('gdriveAuthSection');
const gdriveUserDiv = document.getElementById('gdriveUser');
const gdriveEmailSpan = document.getElementById('gdriveEmail');
const gdriveLoginBtn = document.getElementById('gdriveLoginBtn');
const gdriveLogoutBtn = document.getElementById('gdriveLogoutBtn');
const syncConfigSection = document.getElementById('syncConfigSection');
const folderSelect = document.getElementById('gdriveFolderSelect');
const autoSyncToggle = document.getElementById('autoSyncToggle');
const gdriveBackupList = document.getElementById('gdriveBackupList');
const manualSyncBtn = document.getElementById('manualSyncBtn');
const syncStatusSpan = document.getElementById('syncStatus');

// --- Initialization ---
function initSyncConfig() {
    loadSyncSettings();
    updateAuthUI();
    updateSyncConfigUI();
    checkAutoSync(); // Check on load if auto-sync is enabled
}

function loadSyncSettings() {
    const settings = JSON.parse(localStorage.getItem('speedDial_syncSettings') || '{}');
    googleUser = settings.user || null;
    currentAccessToken = settings.token || null;
    currentFolderId = settings.folderId || null;
    gdriveSyncEnabled = settings.autoSync || false;
    lastAutoSync = settings.lastAutoSync || null;

    if (googleUser) {
        updateAuthUI();
        fetchGDriveFolders(true); // Always populate folder list when logged in
        if (currentFolderId) {
            fetchGDriveBackups(); // Only fetch backups if a folder is already selected
        }
    }
    updateAutoSyncToggleUI();
}

function saveSyncSettings() {
    localStorage.setItem('speedDial_syncSettings', JSON.stringify({
        user: googleUser,
        token: currentAccessToken,
        folderId: currentFolderId,
        autoSync: gdriveSyncEnabled,
        lastAutoSync: lastAutoSync
    }));
}

// --- UI Updaters ---
function openDataModal() {
    // Reset import fields
    const dataEl = document.getElementById('importData');
    const fileEl = document.getElementById('importFile');
    const nameEl = document.getElementById('importFileName');
    if (dataEl) dataEl.value = '';
    if (fileEl) fileEl.value = '';
    if (nameEl) nameEl.textContent = 'No file chosen';
    _pendingImportJSON = null;

    openModal('dataModal');
    if (googleUser && currentAccessToken) {
        fetchGDriveFolders();
        fetchGDriveBackups();
    }
}

function updateAuthUI() {
    if (!gdriveAuthSection || !gdriveUserDiv || !gdriveLoginBtn || !gdriveLogoutBtn) return;
    if (googleUser) {
        gdriveLoginBtn.style.display = 'none';
        gdriveLogoutBtn.style.display = '';
        gdriveUserDiv.style.display = '';
        gdriveEmailSpan.textContent = googleUser.email;
    } else {
        gdriveLoginBtn.style.display = '';
        gdriveLogoutBtn.style.display = 'none';
        gdriveUserDiv.style.display = 'none';
    }
}

function updateSyncConfigUI() {
    if (!syncConfigSection) return;
    syncConfigSection.style.display = googleUser ? '' : 'none';
    manualSyncBtn.style.display = googleUser ? '' : 'none';
}

function updateAutoSyncToggleUI() {
    if (!autoSyncToggle) return;
    autoSyncToggle.classList.toggle('active', gdriveSyncEnabled);
}

// --- Google Auth ---
let tokenClient;

function initGis() {
    if (typeof google === 'undefined') {
        console.warn('GIS script not loaded yet');
        return;
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GAPI_CLIENT_ID,
        scope: SCOPES.join(' '),
        callback: async (resp) => {
            if (resp.error !== undefined) {
                console.error('GIS Error:', resp);
                showToast(`${ICONS.error} Login failed.`);
                return;
            }
            currentAccessToken = resp.access_token;
            // Fetch user info to get email (optional, but good for UI)
            try {
                const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { 'Authorization': `Bearer ${currentAccessToken}` }
                }).then(r => r.json());
                googleUser = { email: userInfo.email };
            } catch (e) {
                googleUser = { email: 'Logged in' };
            }

            saveSyncSettings();
            updateAuthUI();
            updateSyncConfigUI();
            await fetchGDriveFolders(true); // await so currentFolderId is set before fetching backups
            if (currentFolderId) fetchGDriveBackups();
            syncStatusSpan.textContent = 'Logged in successfully.';
        },
    });
}

async function loginGDrive() {
    if (!tokenClient) initGis();
    if (!tokenClient) {
        showToast(`${ICONS.error} Google login not available.`);
        return;
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

function logoutGDrive() {
    googleUser = null;
    currentAccessToken = null;
    currentFolderId = null;
    gdriveSyncEnabled = false; // Disable auto-sync on logout
    lastAutoSync = null;
    saveSyncSettings();
    updateAuthUI();
    updateSyncConfigUI();
    updateAutoSyncToggleUI();
    folderSelect.innerHTML = '<option value="">Login to select folder</option>';
    gdriveBackupList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dimmer);">Login to see backups</div>';
    manualSyncBtn.style.display = 'none';
    syncStatusSpan.textContent = '';
    // Optionally, trigger GIS logout if available
}

// --- Folder & Backup Management ---
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
        console.error('Failed to fetch GDrive folders:', e);
        if (e.message.includes('Invalid Credentials')) {
            logoutGDrive();
            showToast(`${ICONS.error} Your Google login expired. Please log in again.`);
        } else {
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
        console.error('Failed to fetch GDrive backups:', e);
        if (e.message && e.message.includes('Invalid Credentials')) {
            currentAccessToken = null;
            saveSyncSettings();
            gdriveBackupList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dimmer);">Session expired — please log in again.</div>';
            showToast(`${ICONS.warn} Google session expired. Please log in again.`);
        } else {
            gdriveBackupList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--danger);">Error loading backups</div>';
            syncStatusSpan.textContent = 'Error loading backups.';
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
        const div = document.createElement('div');
        div.className = 'notes-trash-row'; // Reuse styling from trash list
        div.innerHTML = `
            <div class="notes-trash-info">
                <div class="notes-trash-name">${backup.name}</div>
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
    showConfirm(
        `Restore from ${fileName}?`,
        'This will replace your current configuration with the selected backup. Continue?',
        async () => {
            showToast(`${ICONS.loading} Restoring from ${fileName}...`);
            try {
                const backupData = await fetchGDriveFile(fileId);
                if (!backupData) throw new Error('Failed to fetch backup data.');

                // _doImport expects the parsed JSON object
                await _doImport(JSON.parse(backupData));

                // Update sync settings after successful restore
                // This assumes the restored data might contain _config, but we might want to re-fetch folder selection
                // For now, just mark as restored
                showToast(`${ICONS.ok} Restored from ${fileName}`);

            } catch (e) {
                console.error('Restore failed:', e);
                showToast(`${ICONS.error} Restore failed. See console for details.`);
            }
        },
        { btnLabel: 'Restore', danger: false }
    );
}

async function triggerManualSync() {
    if (!googleUser || !currentAccessToken || !currentFolderId) {
        showToast(`${ICONS.warn} Please log in and select a folder first.`);
        return;
    }
    manualSyncBtn.disabled = true;
    syncStatusSpan.textContent = 'Backing up...';
    try {
        const exportObj = await getExportObject(); // Reuse export logic
        const res = await fetch(BACKUP_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAccessToken}`, // Pass token for backend auth
                'X-GDrive-Folder-Id': currentFolderId // Pass folder ID for backend
            },
            body: JSON.stringify(exportObj)
        });
        if (res.ok) {
            syncStatusSpan.textContent = 'Backup successful!';
            lastAutoSync = Date.now(); // Update last sync time
            saveSyncSettings();
            showToast(`${ICONS.ok} Backup complete!`);
            setTimeout(fetchGDriveBackups, 1500); // brief delay for GDrive to index the new file
        } else {
            syncStatusSpan.textContent = `Backup failed: ${res.status}`;
            console.warn('[sync] Manual backup failed:', res.status);
        }
    } catch (e) {
        console.error('[sync] Manual backup error:', e);
        syncStatusSpan.textContent = 'Backup error. Check console.';
    } finally {
        manualSyncBtn.disabled = false;
    }
}

function toggleAutoSync() {
    gdriveSyncEnabled = !gdriveSyncEnabled;
    updateAutoSyncToggleUI();
    saveSyncSettings();
    syncStatusSpan.textContent = gdriveSyncEnabled ? 'Auto-backup enabled.' : 'Auto-backup disabled.';
}

async function checkAutoSync() {
    if (!gdriveSyncEnabled || !googleUser || !currentAccessToken || !currentFolderId) return;
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (!lastAutoSync || (now - lastAutoSync) > twentyFourHours) {
        console.log('[sync] Triggering automatic backup...');
        lastAutoSync = now; // Update timestamp immediately to prevent re-triggering
        saveSyncSettings();
        syncStatusSpan.textContent = 'Automatic backup in progress...';
        try {
            const exportObj = await getExportObject(); // Reuse export logic
            const res = await fetch(BACKUP_BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentAccessToken}`,
                    'X-GDrive-Folder-Id': currentFolderId
                },
                body: JSON.stringify(exportObj)
            });
            if (res.ok) {
                syncStatusSpan.textContent = 'Auto-backup successful.';
            } else {
                syncStatusSpan.textContent = `Auto-backup failed: ${res.status}`;
                console.warn('[sync] Auto-backup failed:', res.status);
            }
        } catch (e) {
            console.error('[sync] Auto-backup error:', e);
            syncStatusSpan.textContent = 'Auto-backup error.';
        }
    } else {
        // Auto-sync not due yet
        syncStatusSpan.textContent = `Last sync: ${lastAutoSync ? new Date(lastAutoSync).toLocaleString() : 'never'}`;
    }
}

// --- Backend API Calls ---

async function listGDriveFolders(accessToken) {
    const res = await fetch(`${BACKUP_BASE_URL}/folders`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (res.status === 401) throw new Error('Invalid Credentials');
    if (!res.ok) throw new Error('Failed to fetch folders');
    return res.json();
}

async function listGDriveBackups(accessToken, folderId) {
    const res = await fetch(`${BACKUP_BASE_URL}/list?folderId=${folderId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (res.status === 401) throw new Error('Invalid Credentials');
    if (!res.ok) throw new Error('Failed to fetch backups');
    return res.json();
}

async function fetchGDriveFile(fileId) {
    const res = await fetch(`${BACKUP_BASE_URL}/fetch?fileId=${fileId}`, {
        headers: { 'Authorization': `Bearer ${currentAccessToken}` }
    });
    if (!res.ok) throw new Error('Failed to fetch file');
    const data = await res.json();
    return JSON.stringify(data); // Return as string to match existing logic
}

// Initial setup call when the script loads
// initSyncConfig(); // This would be called by domains/ui/init.js
