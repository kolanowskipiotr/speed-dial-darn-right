// ─── GOOGLE AUTH ─────────────────────────────────────────────────
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
                // Re-render notes panel so sync/import buttons appear immediately.
                const notesContainer = _getNotesContainer?.();
                if (notesContainer && typeof renderNotesPanel === 'function') {
                    renderNotesPanel(notesContainer);
                }
                await fetchGDriveFolders(true);
                if (currentFolderId) {
                    fetchGDriveBackups();
                } else {
                    folderSelect.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    folderSelect.focus();
                    try { folderSelect.showPicker(); } catch (_) {}
                }
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
                fetchGDriveFolders(true).then(() => {
                    if (currentFolderId) {
                        fetchGDriveBackups();
                    } else {
                        openDataModal();
                    }
                });
                checkAutoSync();
                // Re-render notes panel so sync/import buttons appear now that we have a token.
                const notesContainer = _getNotesContainer?.();
                if (notesContainer && typeof renderNotesPanel === 'function') {
                    renderNotesPanel(notesContainer);
                }
                if (typeof pollAllTaskNotes === 'function') pollAllTaskNotes();
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
    tokenClient.requestCode({ prompt: 'consent' });
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
