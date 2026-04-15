// ─── GOOGLE DRIVE SYNC CONFIGURATION ──────────────────────────────
// Auth functions → sync-auth.js  |  Backup/folder functions → sync-backup.js

// --- Constants & State ---
const GAPI_CLIENT_ID = '130093064192-5odc4arfjdpj0370emlse0rvg3e84jiq.apps.googleusercontent.com';
const GAPI_API_KEY = 'YOUR_GOOGLE_API_KEY'; // Needed for some non-auth calls, if any
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/tasks',
];
const BACKUP_BASE_URL = '/api/sync'; // Base URL for backend sync API

let googleUser = null;
let currentAccessToken = null;
let tokenExpiry = null; // timestamp (ms) when the current access token expires
let currentFolderId = null;
let tasksNotesListId = null;
let gdriveSyncEnabled = false;
let showModalOnDisconnect = true; // Default to true as requested
let lastAutoSync = null;
let lastManualSync = null;  // timestamp (ms) ostatniego ręcznego backupu
let backupInProgress = false; // true while a backup fetch is in-flight
let showStatusIndicators = true; // Show/hide the State indicators row in the header
let showHeaderSearch = true; // Show/hide search input in the header
let showHeaderClock = true; // Show/hide clock/date column in the header
let m365CalendarConfig = {
    enabled: true,
    icsUrl: '',
    timezone: '',
};

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
const tasksSyncHintIcon = document.getElementById('tasksSyncHintIcon');

// --- Initialization ---
function initSyncConfig() {
    loadSyncSettings();
    if (tasksSyncHintIcon) tasksSyncHintIcon.textContent = ICONS.taskSyncOn;
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
    tasksNotesListId = settings.tasksNotesListId || null;
    gdriveSyncEnabled = settings.autoSync || false;
    showModalOnDisconnect = (settings.showModalOnDisconnect !== undefined) ? settings.showModalOnDisconnect : true;
    showStatusIndicators = (settings.showStatusIndicators !== undefined) ? settings.showStatusIndicators : true;
    showHeaderSearch = (settings.showHeaderSearch !== undefined) ? settings.showHeaderSearch : true;
    showHeaderClock = (settings.showHeaderClock !== undefined) ? settings.showHeaderClock : true;
    lastAutoSync = settings.lastAutoSync || null;
    lastManualSync = settings.lastManualSync || null;
    m365CalendarConfig = {
        enabled: settings.m365CalendarConfig?.enabled !== false,
        icsUrl: settings.m365CalendarConfig?.icsUrl || '',
        timezone: settings.m365CalendarConfig?.timezone || '',
    };

    // Don't fetch folders/backups here — wait for the token to be confirmed
    // valid inside initGis(). Fetching with a stale stored token causes
    // the folder/backup list to appear while the login button is showing.
    updateAutoSyncToggleUI();
    updateShowModalOnDisconnectToggleUI();
    updateStatusIndicatorsUI();
    updateHeaderVisibilityUI();
    updateSyncIndicators();
}

function saveSyncSettings() {
    localStorage.setItem('speedDial_syncSettings', JSON.stringify({
        user: googleUser,
        token: currentAccessToken,
        tokenExpiry: tokenExpiry,
        folderId: currentFolderId,
        tasksNotesListId: tasksNotesListId,
        autoSync: gdriveSyncEnabled,
        showModalOnDisconnect: showModalOnDisconnect,
        showStatusIndicators: showStatusIndicators,
        showHeaderSearch: showHeaderSearch,
        showHeaderClock: showHeaderClock,
        lastAutoSync: lastAutoSync,
        lastManualSync: lastManualSync,
        m365CalendarConfig: m365CalendarConfig,
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
    const notes = (typeof data !== 'undefined' && Array.isArray(data.notes)) ? data.notes : [];
    const notesSyncOn = notes.some(n => n.taskSync);
    const notesSyncConflict = notes.some(n => n.taskSync && n.taskConflict);
    const notesSyncMode = notesSyncConflict ? 'conflict' : (notesSyncOn ? 'on' : 'off');

    const dots = {
        gdriveIndicator:           { mode: isConnected ? 'on' : 'off', label: isConnected ? `Google Drive: ${googleUser.email}` : 'Google Drive: not connected' },
        gdriveTokenIndicator:      { mode: tokenFresh ? 'on' : 'off', label: tokenFresh  ? `Token valid — expires ${new Date(tokenExpiry).toLocaleTimeString()}` : 'Token: no session' },
        gdriveAutoSyncIndicator:   { mode: gdriveSyncEnabled ? 'on' : 'off', label: _autoSyncLabel() },
        gdriveDisconnectIndicator: { mode: showModalOnDisconnect ? 'on' : 'off', label: `Manage on disconnect: ${showModalOnDisconnect ? 'on' : 'off'}` },
        gdriveNotesSyncIndicator:  {
            mode: notesSyncMode,
            label: notesSyncConflict
                ? 'Notes Tasks sync: conflict (merge required)'
                : (notesSyncOn ? 'Notes Tasks sync: on' : 'Notes Tasks sync: off'),
        },
    };

    for (const [id, { mode, label }] of Object.entries(dots)) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.classList.toggle('connected', mode === 'on');
        el.classList.toggle('conflict', mode === 'conflict');
        el.dataset.label = label;
    }
}

function updateAuthUI() {
    if (!gdriveAuthSection || !gdriveUserDiv || !gdriveLoginBtn || !gdriveLogoutBtn) return;

    const gisLoaded  = typeof google !== 'undefined';
    const isConnected = !!(googleUser && currentAccessToken);

    updateSyncIndicators();

    // Toggle Tasks global sync button
    const tasksSyncAllBtn = document.getElementById('tasksSyncAllBtn');
    if (tasksSyncAllBtn) tasksSyncAllBtn.style.display = isConnected ? '' : 'none';

    // Refresh notes tabs if they exist (shows/hides Tasks icons)
    if (typeof _buildNotesTabs === 'function') {
        const scrollArea = document.querySelector('.notes-tabs-scroll-area');
        if (scrollArea) _buildNotesTabs(scrollArea);
    }

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

function updateStatusIndicatorsUI() {
    document.body.classList.toggle('hide-status-indicators', !showStatusIndicators);
    const toggle = document.getElementById('statusIndicatorsToggle');
    if (toggle) toggle.classList.toggle('active', showStatusIndicators);
}

function updateHeaderVisibilityUI() {
    document.body.classList.toggle('hide-header-search', !showHeaderSearch);
    document.body.classList.toggle('hide-header-clock', !showHeaderClock);

    const searchToggle = document.getElementById('headerSearchToggle');
    if (searchToggle) searchToggle.classList.toggle('active', showHeaderSearch);

    const clockToggle = document.getElementById('headerClockToggle');
    if (clockToggle) clockToggle.classList.toggle('active', showHeaderClock);

    if (!showHeaderSearch) {
        const searchInput = document.getElementById('searchInput');
        if (searchInput && document.activeElement === searchInput) searchInput.blur();
        if (typeof hideSearchResults === 'function') hideSearchResults();
    }
}

// Centralized error handling for sync operations
function handleSyncError(e, customMsg) {
    console.error('Sync error:', e);
    const isAuthError = e.message && (e.message.includes('401') || e.message.includes('Invalid Credentials') || e.message.includes('Session expired'));
    const isNetworkError = e.message && (
        e.message.includes('Failed to fetch') ||
        e.message.includes('NetworkError') ||
        e.message.includes('Load failed')
    );
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

function toggleStatusIndicators() {
    showStatusIndicators = !showStatusIndicators;
    updateStatusIndicatorsUI();
    saveSyncSettings();
}

function toggleHeaderSearch() {
    showHeaderSearch = !showHeaderSearch;
    updateHeaderVisibilityUI();
    saveSyncSettings();
}

function toggleHeaderClock() {
    showHeaderClock = !showHeaderClock;
    updateHeaderVisibilityUI();
    saveSyncSettings();
}

