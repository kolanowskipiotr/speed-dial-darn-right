// ─── GOOGLE DRIVE SYNC CONFIGURATION ──────────────────────────────

// --- Constants & State ---
const GAPI_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID'; // Replace with actual client ID
const GAPI_API_KEY = 'YOUR_GOOGLE_API_KEY'; // Needed for some non-auth calls, if any
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const BACKUP_BASE_URL = '/api/sync'; // Base URL for backend sync API

let googleUser = null;
let currentAccessToken = null;
let currentFolderId = null;
let gdriveSyncEnabled = false;
let lastAutoSync = null;

// --- DOM Elements ---
const syncModal = document.getElementById('syncModal');
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
        if (currentFolderId) {
            fetchGDriveFolders(true); // Fetch folders if already configured
        }
        fetchGDriveBackups(); // Fetch backups if logged in
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
async function loginGDrive() {
    // Use Google Identity Services (GIS) for client-side OAuth2
    // This will trigger the Google Sign-In prompt
    // For simplicity, this example assumes a basic implicit flow for token retrieval
    // A more robust implementation might use the authorization code flow
    try {
        // This part depends heavily on GIS setup and callback handling
        // For now, we'll simulate a login and token retrieval.
        // In a real app, GIS would handle the popup and return tokens.
        
        // Placeholder for actual GIS token retrieval
        const tokenResponse = await new Promise(resolve => setTimeout(() => resolve({ 
            access_token: 'mock_access_token_xyz', 
            expires_at: Date.now() + 3600 * 1000 // 1 hour expiry
        }), 500)); // Simulate async token fetch

        if (tokenResponse && tokenResponse.access_token) {
            googleUser = { email: 'user@example.com' }; // Mock user info
            currentAccessToken = tokenResponse.access_token;
            // In a real app, you'd store refresh token securely if using auth code flow
            
            saveSyncSettings();
            updateAuthUI();
            fetchGDriveFolders(true); // Fetch folders after login
            syncStatusSpan.textContent = 'Logged in successfully.';
        } else {
            throw new Error('Failed to get access token.');
        }
    } catch (e) {
        console.error('Google Login Error:', e);
        showToast(`${ICONS.error} Login failed. Please try again.`);
        logoutGDrive(); // Clear state on failure
    }
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
        folderSelect.innerHTML = ''; // Clear loading message
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
        } else {
            // If folderId is missing or not found, clear it and disable sync config
            currentFolderId = null;
            saveSyncSettings();
            updateSyncConfigUI(); // This will hide sync config if folderId is null
        }
        folderSelect.dataset.foldersLoaded = 'true';
    } catch (e) {
        console.error('Failed to fetch GDrive folders:', e);
        folderSelect.innerHTML = '<option value="">Error loading folders</option>';
        showToast(`${ICONS.error} Could not load Google Drive folders.`);
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
        gdriveBackupList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--danger);">Error loading backups</div>';
        syncStatusSpan.textContent = 'Error loading backups.';
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
            fetchGDriveBackups(); // Refresh list
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

// --- Placeholder functions (will be called by backend API) ---
// These functions would be called by the backend API endpoints
// and would handle the actual Google Drive API interactions.
// For now, they are placeholders or rely on frontend token.

async function listGDriveFolders(accessToken) {
    // Placeholder: In a real app, call GDrive API here with accessToken
    // Example: Using Google Picker API or Drive API directly (requires setup)
    console.log("Listing GDrive folders with token:", accessToken);
    // Simulate fetching folders
    return new Promise(resolve => setTimeout(() => resolve([
        { id: 'root', name: 'My Drive (Root)' },
        { id: 'folder_123', name: 'Speed Dial Backups' },
        { id: 'folder_456', name: 'Important Data' }
    ]), 500));
}

async function listGDriveBackups(accessToken, folderId) {
    console.log(`Listing backups for folder ${folderId} with token:`, accessToken);
    // Placeholder: Call GDrive API to list files in folderId
    // Filter for .json files, sort by date desc
    return new Promise(resolve => setTimeout(() => resolve([
        { id: 'backup_abc', name: 'backup-2023-10-27.full.json', createdTime: '2023-10-27T10:00:00Z' },
        { id: 'backup_def', name: 'backup-2023-10-26.diff.json', createdTime: '2023-10-26T11:00:00Z' },
        { id: 'backup_ghi', name: 'backup-2023-10-25.full.json', createdTime: '2023-10-25T12:00:00Z' },
    ]), 500));
}

async function fetchGDriveFile(fileId) {
    console.log("Fetching GDrive file:", fileId);
    // Placeholder: Call GDrive API to download file content
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (fileId === 'backup_abc') {
                resolve(JSON.stringify({ tabs: [{ id: 'tab1', name: 'Restored Tab', groups: [] }] }));
            } else {
                reject(new Error('File not found or invalid'));
            }
        }, 500);
    });
}

// Initial setup call when the script loads
// initSyncConfig(); // This would be called by domains/ui/init.js
