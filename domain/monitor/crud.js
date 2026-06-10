// ─── PAGE MONITOR — CRUD ─────────────────────────────────────────

// ── Manage modal ─────────────────────────────────────────────────

function openMonitorManageModal() {
    if (!Array.isArray(data.monitoredPages)) data.monitoredPages = [];
    _renderMonitorPagesList();
    _updateMonitorNotifUI();
    openModal('monitorManageModal');
}

// Update the notification permission row in the manage modal.
function _updateMonitorNotifUI() {
    const row    = document.getElementById('monitorNotifRow');
    const status = document.getElementById('monitorNotifStatus');
    const btn    = document.getElementById('monitorNotifBtn');
    if (!row || !status || !btn) return;

    if (!('Notification' in window)) {
        status.innerHTML = '🔕 Notifications not supported in this browser';
        btn.style.display = 'none';
        return;
    }

    const perm = Notification.permission;
    if (perm === 'granted') {
        status.innerHTML = '✅ Browser permission granted &nbsp;·&nbsp; <span style="color:var(--text-dimmer);font-size:11px;">Not seeing popups? Check <strong>System Settings → Notifications → ' + _browserName() + '</strong> on macOS, or Focus / Do Not Disturb mode.</span>';
        btn.textContent  = '🔔 Send test notification';
        btn.style.display = '';
        btn.onclick = monitorTestNotification;
    } else if (perm === 'denied') {
        status.innerHTML = '🚫 Notifications blocked in browser — open <strong>browser settings</strong> and allow <em>localhost:8998</em>';
        btn.textContent  = '🔔 How to unblock';
        btn.style.display = '';
        btn.onclick = () => showToast(`${ICONS.warn} Open browser → Settings → Privacy & Security → Site Settings → Notifications → unblock localhost:8998`);
    } else {
        status.innerHTML = '🔔 Notifications not yet granted';
        btn.textContent  = '🔔 Enable notifications';
        btn.style.display = '';
        btn.onclick = monitorRequestNotifications;
    }
}

function _browserName() {
    const ua = navigator.userAgent;
    if (ua.includes('Edg/'))    return 'Microsoft Edge';
    if (ua.includes('Firefox/'))return 'Firefox';
    if (ua.includes('Chrome/')) return 'Google Chrome';
    if (ua.includes('Safari/')) return 'Safari';
    return 'your browser';
}

// Request notification permission (called from the button in the modal).
async function monitorRequestNotifications() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'denied') {
        showToast(`${ICONS.warn} Notifications are blocked — open browser Settings and allow localhost:8998`);
        return;
    }
    const result = await Notification.requestPermission();
    _updateMonitorNotifUI();
    if (result === 'granted') {
        monitorTestNotification();
    } else {
        showToast(`${ICONS.warn} Notification permission: ${result}`);
    }
}

// Fire a visible test notification so the user can confirm end-to-end delivery.
function monitorTestNotification() {
    if (Notification.permission !== 'granted') {
        showToast(`${ICONS.warn} Notifications not granted yet — click Enable first`);
        return;
    }
    showNotification(
        '📡 Page Monitor — test',
        'If you see this popup, OS notifications are working! If not, check System Settings → Notifications → ' + _browserName() + '.',
        { tag: 'monitor-test' }
    );
    showToast(`${ICONS.ok} Test notification sent — did a popup appear?`);
}

function _renderMonitorPagesList() {
    const container = document.getElementById('monitorPagesList');
    if (!container) return;
    const pages = data.monitoredPages || [];

    if (pages.length === 0) {
        container.innerHTML = `
            <div class="monitor-list-empty">
                No pages monitored yet. Click <strong>+ Add page</strong> to start.
            </div>`;
        return;
    }

    container.innerHTML = pages.map(p => {
        const icon = !p.enabled ? '⏸️'
            : p.changed          ? '🔴'
            : p.lastHash         ? '🟢'
            : p.lastError        ? '⚠️'
            :                      '⏳';
        const lastChecked = p.lastChecked
            ? new Date(p.lastChecked).toLocaleString()
            : 'Never';
        const changedBadge = p.changed
            ? `<strong class="monitor-changed-badge">Changed!</strong>`
            : '';
        const errorBadge = p.lastError && !p.lastHash
            ? `<span class="monitor-error-badge" title="${escHtml(p.lastError)}">⚠️ Check failed</span>`
            : '';
        const ignoreTag = (p.ignoredPhrases || []).length > 0
            ? `· 🚫 ${p.ignoredPhrases.length} ignored`
            : '';
        return `
            <div class="monitor-list-row">
                <span class="monitor-list-icon">${icon}</span>
                <div class="monitor-list-info">
                    <div class="monitor-list-name">${escHtml(p.name || p.url)}</div>
                    <div class="monitor-list-url">${escHtml(p.url)}</div>
                    <div class="monitor-list-meta">
                        Every ${p.interval}min
                        · ${p.enabled ? 'Active' : 'Paused'}
                        ${p.useHeadless ? '· 🌐 JS' : ''}
                        ${ignoreTag}
                        · Last check: ${lastChecked}
                        ${changedBadge}${errorBadge}
                    </div>
                </div>
                <div class="monitor-list-actions">
                    ${p.changed ? `<button class="btn-icon" onclick="openMonitorDiffModal('${p.id}')" title="View change report">📋</button>` : ''}
                    <button class="btn-icon" onclick="monitorCheckNow('${p.id}')" title="Check now">↻</button>
                    <button class="btn-icon" onclick="openMonitorPageModal('${p.id}')" title="Edit">${ICONS.edit}</button>
                    <button class="btn-icon danger" onclick="deleteMonitorPage('${p.id}')" title="Delete">${ICONS.delete}</button>
                </div>
            </div>
        `;
    }).join('');
}

// ── Add / edit page modal ─────────────────────────────────────────

function openMonitorPageModal(id = null) {
    _editingMonitorPageId = id;
    const page = id ? _findMonitoredPage(id) : null;

    document.getElementById('monitorPageModalTitle').textContent =
        id ? 'Edit Monitored Page' : 'Add Monitored Page';
    document.getElementById('monitorPageName').value  = page?.name || '';
    document.getElementById('monitorPageUrl').value   = page?.url  || '';
    document.getElementById('monitorPageInterval').value = String(page?.interval || 60);

    const toggle = document.getElementById('monitorPageEnabledToggle');
    if (toggle) toggle.classList.toggle('active', page ? page.enabled !== false : true);

    const headlessToggle = document.getElementById('monitorPageHeadlessToggle');
    if (headlessToggle) headlessToggle.classList.toggle('active', page ? !!page.useHeadless : false);

    openModal('monitorPageModal');
}

function toggleMonitorPageEnabled() {
    const toggle = document.getElementById('monitorPageEnabledToggle');
    if (toggle) toggle.classList.toggle('active');
}

function toggleMonitorPageHeadless() {
    const toggle = document.getElementById('monitorPageHeadlessToggle');
    if (toggle) toggle.classList.toggle('active');
}

function saveMonitorPage() {
    const name           = document.getElementById('monitorPageName').value.trim();
    const rawUrl         = document.getElementById('monitorPageUrl').value.trim();
    const interval       = parseInt(document.getElementById('monitorPageInterval').value, 10) || 60;
    const toggle         = document.getElementById('monitorPageEnabledToggle');
    const enabled        = toggle ? toggle.classList.contains('active') : true;
    const headlessToggle = document.getElementById('monitorPageHeadlessToggle');
    const useHeadless    = headlessToggle ? headlessToggle.classList.contains('active') : false;

    if (!rawUrl) { showToast(`${ICONS.warn} Please enter a URL`); return; }

    let url = rawUrl;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    if (!Array.isArray(data.monitoredPages)) data.monitoredPages = [];

    if (_editingMonitorPageId) {
        const page = _findMonitoredPage(_editingMonitorPageId);
        if (page) {
            const urlChanged      = page.url !== url;
            const headlessChanged = !!page.useHeadless !== useHeadless;
            page.name        = name || url;
            page.url         = url;
            page.interval    = interval;
            page.enabled     = enabled;
            page.useHeadless = useHeadless;
            if (urlChanged || headlessChanged) {
                page.lastHash      = null;
                page.changed       = false;
                page.lastChangedAt = null;
                page.lastChecked   = null;
                page.lastError     = null;
                _monitorDeleteContent(page.id);
            }
            _monitorSchedulePage(page);
        }
    } else {
        const page = {
            id:             uid(),
            name:           name || url,
            url,
            interval,
            enabled,
            useHeadless,
            ignoredPhrases: [],
            lastChecked:    null,
            lastHash:       null,
            changed:        false,
            lastChangedAt:  null,
        };
        data.monitoredPages.push(page);
        _monitorSchedulePage(page); // starts/restarts global tick
        _monitorCheckPage(page);    // immediate baseline check
    }

    saveData();
    _renderMonitorIndicator();
    _renderMonitorPagesList();
    closeModal('monitorPageModal');
    showToast(`${ICONS.ok} Monitor saved`);
    requestNotificationPermission();
}

// ── Actions ──────────────────────────────────────────────────────

function monitorAcknowledge(id) {
    const page = _findMonitoredPage(id);
    if (!page) return;
    page.changed = false;
    _monitorSaveContent(id, 'prev', '');
    saveData();
    _renderMonitorIndicator();
    if (_monitorPopoverOpen) _renderMonitorPopover();
    _renderMonitorPagesList();
}

function monitorCheckNow(id) {
    const page = _findMonitoredPage(id);
    if (!page) { showToast(`${ICONS.warn} Page not found`); return; }
    showToast(`${ICONS.loading} Checking…`);
    _monitorCheckPage(page);
}

function deleteMonitorPage(id) {
    const page = _findMonitoredPage(id);
    if (!page) return;
    showConfirm(
        'Stop monitoring?',
        `Remove "${page.name || page.url}" from the monitor list?`,
        () => {
            _monitorDeleteContent(id);
            data.monitoredPages = (data.monitoredPages || []).filter(p => p.id !== id);
            _rescheduleAllMonitors(); // restart global tick without this page
            saveData();
            _renderMonitorIndicator();
            _renderMonitorPagesList();
            showToast(`${ICONS.ok} Removed from monitor`);
        }
    );
}

// ── Ignore phrase via manual input in diff modal ─────────────────

function monitorAddIgnorePhrase() {
    const input = document.getElementById('monitorIgnoredInput');
    if (!input) return;
    const phrase = input.value.trim();
    if (!phrase) return;
    const pageId = _monitorDiffPageId;
    if (!pageId) return;
    monitorIgnoreLine(pageId, phrase);
    input.value = '';
}
