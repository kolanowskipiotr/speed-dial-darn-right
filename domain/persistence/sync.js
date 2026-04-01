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
let tokenExpiry = null; // timestamp (ms) when the current access token expires
let currentFolderId = null;
let gdriveSyncEnabled = false;
let showModalOnDisconnect = true; // Default to true as requested
let lastAutoSync = null;
let backupInProgress = false; // true while a backup fetch is in-flight

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
const showModalOnDisconnectToggle = document.getElementById('showModalOnDisconnectToggle');
const gdriveBackupList = document.getElementById('gdriveBackupList');
const manualSyncBtn = document.getElementById('manualSyncBtn');
const syncStatusSpan = document.getElementById('syncStatus');

// --- Initialization ---
function initSyncConfig() {
    loadSyncSettings();
    updateAuthUI();
    updateSyncConfigUI();
    // checkAutoSync() is intentionally NOT called here — it runs after the token
    // is confirmed valid inside initGis(), to avoid using a stale stored token.
    // Refresh the indicator labels every minute so the countdown stays accurate.
    setInterval(updateSyncIndicators, 60_000);
    window.addEventListener('beforeunload', (e) => {
        if (backupInProgress) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

function loadSyncSettings() {
    const settings = JSON.parse(localStorage.getItem('speedDial_syncSettings') || '{}');
    googleUser = settings.user || null;
    currentAccessToken = settings.token || null;
    tokenExpiry = settings.tokenExpiry || null;
    currentFolderId = settings.folderId || null;
    gdriveSyncEnabled = settings.autoSync || false;
    showModalOnDisconnect = (settings.showModalOnDisconnect !== undefined) ? settings.showModalOnDisconnect : true;
    lastAutoSync = settings.lastAutoSync || null;

    // Don't fetch folders/backups here — wait for the token to be confirmed
    // valid inside initGis(). Fetching with a stale stored token causes
    // the folder/backup list to appear while the login button is showing.
    updateAutoSyncToggleUI();
    updateShowModalOnDisconnectToggleUI();
    updateSyncIndicators();
}

function saveSyncSettings() {
    localStorage.setItem('speedDial_syncSettings', JSON.stringify({
        user: googleUser,
        token: currentAccessToken,
        tokenExpiry: tokenExpiry,
        folderId: currentFolderId,
        autoSync: gdriveSyncEnabled,
        showModalOnDisconnect: showModalOnDisconnect,
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

function _autoSyncLabel() {
    if (!gdriveSyncEnabled) return 'Daily auto-backup: off';
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const nextAt = lastAutoSync ? lastAutoSync + twentyFourHours : null;
    const msLeft = nextAt ? nextAt - Date.now() : 0;
    if (!nextAt || msLeft <= 0) return 'Daily auto-backup: on — due now';
    const h = Math.floor(msLeft / 3_600_000);
    const m = Math.floor((msLeft % 3_600_000) / 60_000);
    const at = new Date(nextAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const remaining = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return `Daily auto-backup: on — next in ${remaining} (at ${at})`;
}

function updateSyncIndicators() {
    const isConnected  = !!(googleUser && currentAccessToken);
    const tokenFresh   = !!(currentAccessToken && tokenExpiry && Date.now() < tokenExpiry);

    const dots = {
        gdriveIndicator:           { on: isConnected,          label: isConnected ? `Google Drive: ${googleUser.email}` : 'Google Drive: not connected' },
        gdriveTokenIndicator:      { on: tokenFresh,           label: tokenFresh  ? `Token valid — expires ${new Date(tokenExpiry).toLocaleTimeString()}` : 'Token: no session' },
        gdriveAutoSyncIndicator:   { on: gdriveSyncEnabled,    label: _autoSyncLabel() },
        gdriveDisconnectIndicator: { on: showModalOnDisconnect, label: `Manage on disconnect: ${showModalOnDisconnect ? 'on' : 'off'}` },
    };

    for (const [id, { on, label }] of Object.entries(dots)) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.classList.toggle('connected', on);
        el.dataset.label = label;
    }
}

function updateAuthUI() {
    if (!gdriveAuthSection || !gdriveUserDiv || !gdriveLoginBtn || !gdriveLogoutBtn) return;

    const gisLoaded  = typeof google !== 'undefined';
    const isConnected = !!(googleUser && currentAccessToken);

    updateSyncIndicators();

    if (isConnected) {
        gdriveLoginBtn.style.display = 'none';
        gdriveLogoutBtn.style.display = '';
        gdriveUserDiv.style.display = '';
        gdriveEmailSpan.textContent = googleUser.email;
    } else {
        gdriveLoginBtn.style.display = '';
        gdriveLogoutBtn.style.display = 'none';
        gdriveUserDiv.style.display = 'none';

        // If GIS not loaded, disable button and show reason
        if (!gisLoaded) {
            gdriveLoginBtn.disabled = true;
            gdriveLoginBtn.innerHTML = `${ICONS.warn || '⚠️'} Google Login Unavailable (Offline)`;
            gdriveLoginBtn.title = 'The Google login script could not be loaded. Please check your internet connection.';
        } else {
            gdriveLoginBtn.disabled = false;
            gdriveLoginBtn.innerHTML = '<span style="margin-right: 8px;">🔑</span> Log in with Google';
            gdriveLoginBtn.title = '';
        }
    }
}

function updateSyncConfigUI() {
    if (!syncConfigSection) return;
    const loggedIn = !!(googleUser && currentAccessToken);
    syncConfigSection.style.display = loggedIn ? '' : 'none';
    manualSyncBtn.style.display = loggedIn ? '' : 'none';
}

function updateAutoSyncToggleUI() {
    if (!autoSyncToggle) return;
    autoSyncToggle.classList.toggle('active', gdriveSyncEnabled);
}

function updateShowModalOnDisconnectToggleUI() {
    if (!showModalOnDisconnectToggle) return;
    showModalOnDisconnectToggle.classList.toggle('active', showModalOnDisconnect);
}

// Centralized error handling for sync operations
function handleSyncError(e, customMsg) {
    console.error('Sync error:', e);
    const isAuthError = e.message && (e.message.includes('401') || e.message.includes('Invalid Credentials') || e.message.includes('Session expired'));
    const isNetworkError = e.message && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError'));
    const gisLoaded = typeof google !== 'undefined';

    if (isAuthError) {
        googleUser = null;
        currentAccessToken = null;
        tokenExpiry = null;
        saveSyncSettings();
        updateAuthUI();
        updateSyncConfigUI();
        // Safe to open modal here: token is cleared so openDataModal won't re-trigger fetches
        if (showModalOnDisconnect && gisLoaded) {
            openDataModal();
        }
        showToast(`${ICONS.warn} Google session expired. Please log in again.`);
        return true; // handled
    }

    if (customMsg) showToast(`${ICONS.error} ${customMsg}`);
    else if (isNetworkError) showToast(`${ICONS.error} Network error. Could not connect to Google.`);

    updateAuthUI();

    return false; // not an auth error
}

// --- Google Auth ---
// Uses GIS Authorization Code flow (initCodeClient). The authorization code is
// sent to the uploader sidecar which exchanges it for tokens using the client
// secret and stores the refresh token. Background refresh is then possible via
// GET /api/sync/auth/token — a plain HTTP call, no popup required.
let tokenClient;

function initGis() {
    if (typeof google === 'undefined') {
        console.warn('GIS script not loaded yet');
        return;
    }

    // Code client — used only for the one-time manual login popup
    tokenClient = google.accounts.oauth2.initCodeClient({
        client_id: GAPI_CLIENT_ID,
        scope: SCOPES.join(' '),
        ux_mode: 'popup',
        callback: async (resp) => {
            if (resp.error) {
                console.error('GIS Error:', resp);
                showToast(`${ICONS.error} Login failed.`);
                return;
            }
            try {
                // Send code to backend — it exchanges for tokens, stores refresh token
                const result = await fetch(`${BACKUP_BASE_URL}/auth`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: resp.code }),
                }).then(r => r.json());

                currentAccessToken = result.access_token;
                tokenExpiry = result.expiry;
                googleUser = { email: result.email };
                saveSyncSettings();
                updateAuthUI();
                updateSyncConfigUI();
                updateSyncIndicators();
                scheduleTokenRefresh();
                await fetchGDriveFolders(true);
                if (currentFolderId) fetchGDriveBackups();
                syncStatusSpan.textContent = 'Logged in successfully.';
                checkAutoSync();
            } catch (e) {
                console.error('[sync] Code exchange failed:', e);
                showToast(`${ICONS.error} Login failed — see console.`);
            }
        },
    });

    if (googleUser) {
        // On every page load: silently get a fresh token from the backend.
        // The backend uses the stored refresh token — no popup needed.
        fetchFreshToken().then(ok => {
            if (ok) {
                fetchGDriveFolders(true).then(() => { if (currentFolderId) fetchGDriveBackups(); });
                checkAutoSync();
            } else {
                // Refresh token missing or expired — need a new login
                googleUser = null;
                currentAccessToken = null;
                tokenExpiry = null;
                saveSyncSettings();
                updateAuthUI();
                updateSyncConfigUI();
                updateSyncIndicators();
                if (gdriveSyncEnabled && showModalOnDisconnect) openDataModal();
            }
        });
    } else {
        updateAuthUI();
    }
}

// Calls the backend to silently get a fresh access token using the stored
// refresh token. Returns true on success, false if re-login is needed.
async function fetchFreshToken() {
    try {
        const res = await fetch(`${BACKUP_BASE_URL}/auth/token`);
        if (!res.ok) return false;
        const { access_token, expiry } = await res.json();
        currentAccessToken = access_token;
        tokenExpiry = expiry;
        saveSyncSettings();
        updateSyncIndicators();
        scheduleTokenRefresh();
        console.log('[sync] Token refreshed from backend.');
        return true;
    } catch (e) {
        console.error('[sync] fetchFreshToken failed:', e);
        return false;
    }
}

// Schedule a silent background refresh ~5 minutes before the token expires.
// Safe to run from a timer — it's just an HTTP call, not a popup.
function scheduleTokenRefresh() {
    if (!tokenExpiry || !googleUser) return;
    const delay = tokenExpiry - Date.now() - 5 * 60 * 1000;
    if (delay > 0) {
        setTimeout(() => { if (googleUser) fetchFreshToken(); }, delay);
    }
}

async function loginGDrive() {
    if (!tokenClient) initGis();
    if (!tokenClient) {
        showToast(`${ICONS.error} Google login not available.`);
        return;
    }
    tokenClient.requestCode();
}

function logoutGDrive() {
    googleUser = null;
    currentAccessToken = null;
    tokenExpiry = null;
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
    if (diff.tabs !== undefined)       result.tabs = diff.tabs;
    if (diff.todoLists !== undefined)  result.todoLists = diff.todoLists;
    if (diff.notes !== undefined)      result.notes = diff.notes;
    if (diff.notesTrash !== undefined) result.notesTrash = diff.notesTrash;
    if (diff._config !== undefined)    result._config = diff._config;
    if (diff._images !== undefined)    result._images = { ...fullData._images, ...diff._images };
    return result;
}

async function triggerManualSync() {
    if (!googleUser || !currentAccessToken || !currentFolderId) {
        showToast(`${ICONS.warn} Please log in and select a folder first.`);
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
                'X-GDrive-Folder-Id': currentFolderId // Pass folder ID for backend
            },
            body: JSON.stringify(exportObj)
        });
        if (res.ok) {
            syncStatusSpan.textContent = 'Backup successful!';
            lastAutoSync = Date.now(); // Update last sync time
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

function toggleAutoSync() {
    gdriveSyncEnabled = !gdriveSyncEnabled;
    updateAutoSyncToggleUI();
    updateSyncIndicators();
    saveSyncSettings();
    syncStatusSpan.textContent = gdriveSyncEnabled ? 'Auto-backup enabled.' : 'Auto-backup disabled.';
}

function toggleShowModalOnDisconnect() {
    showModalOnDisconnect = !showModalOnDisconnect;
    updateShowModalOnDisconnectToggleUI();
    updateSyncIndicators();
    saveSyncSettings();
    syncStatusSpan.textContent = showModalOnDisconnect ? 'Modal on disconnect enabled.' : 'Modal on disconnect disabled.';
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
