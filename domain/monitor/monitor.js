// ─── PAGE MONITOR — BACKGROUND POLLING ──────────────────────────
// Calls the uploader sidecar to fetch page content server-side (no CORS),
// hashes cleaned text (ignoredPhrases stripped), stores content for diffing,
// and fires a browser notification on change.

async function _monitorCheckPage(page) {
    if (!page || !page.enabled) return;
    if (_monitorCheckInFlight.has(page.id)) return;
    _monitorCheckInFlight.add(page.id);

    try {
        const res = await fetch('/api/monitor/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: page.url, useHeadless: !!page.useHeadless }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { ok, content, error } = await res.json();

        const p = _findMonitoredPage(page.id);
        if (!p) return; // page was deleted while checking

        const now = new Date().toISOString();
        p.lastChecked = now;

        if (!ok) {
            console.warn(`[monitor] Could not fetch ${p.url}:`, error);
            p.lastError = error || 'Unknown error';
        } else {
            p.lastError = null;
            // Apply ignored phrases before comparing — strips noise the user has dismissed
            const cleanContent = _monitorApplyIgnored(content, p.ignoredPhrases);
            const prevHash = p.lastHash;

            // Compute hash of cleaned content
            const encoder = new TextEncoder();
            const buf = await crypto.subtle.digest('SHA-256', encoder.encode(cleanContent));
            const newHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

            if (prevHash === null) {
                // First check — store baseline, no notification
                p.lastHash = newHash;
                _monitorSaveContent(p.id, 'current', cleanContent);
            } else if (newHash !== prevHash) {
                // Change detected — save prev content for diff, update current
                if (!p.changed) {
                    _monitorSaveContent(p.id, 'prev', _monitorLoadContent(p.id, 'current'));
                    p.changed = true;
                    p.lastChangedAt = now;
                    _monitorNotify(p);
                }
                // Always update current content so we accumulate changes until acknowledged
                _monitorSaveContent(p.id, 'current', cleanContent);
                p.lastHash = newHash;
            } else {
                // No change — update current content (reflects any ignoredPhrases changes)
                _monitorSaveContent(p.id, 'current', cleanContent);
            }
        }

        saveData();
        _renderMonitorIndicator();
        if (_monitorPopoverOpen) _renderMonitorPopover();

        const manageModal = document.getElementById('monitorManageModal');
        if (manageModal && manageModal.classList.contains('open')) _renderMonitorPagesList();

    } catch (e) {
        // Network-level failure (fetch threw, 502, etc.) — still record the attempt
        // so the UI doesn't show a stale "Checked Xm ago" timestamp.
        console.warn(`[monitor] Check error for ${page.url}:`, e.message);
        const pErr = _findMonitoredPage(page.id);
        if (pErr) {
            pErr.lastChecked = new Date().toISOString();
            pErr.lastError   = e.message || 'Network error';
            saveData();
        }
        _renderMonitorIndicator();
    } finally {
        _monitorCheckInFlight.delete(page.id);
    }
}

function _monitorNotify(page) {
    // Browser notification (only fires if permission is 'granted')
    showNotification(
        '📡 Page changed',
        `"${page.name || page.url}" has been updated.`,
        { tag: `monitor-${page.id}` }
    );
    // In-app toast fallback — always visible regardless of notification permission
    showToast(`📡 Change detected: <strong>${escHtml(page.name || page.url)}</strong>`);
}

// ── Scheduler ────────────────────────────────────────────────────
// Single global tick (every 30 s) checks ALL pages for overdue intervals.
// This avoids per-page setInterval timers which:
//   • self-destruct if _findMonitoredPage returns null even once
//   • are aggressively throttled by Chrome for ≥5-min intervals in bg tabs
//
// 30 s << any user-configured interval, so every page fires on time.
// visibilitychange catches up immediately when the user returns to the tab.

function _monitorRunOverdue() {
    (data.monitoredPages || []).forEach(p => {
        if (_monitorIsOverdue(p) && !_monitorCheckInFlight.has(p.id)) {
            _monitorCheckPage(p);
        }
    });
}

function _rescheduleAllMonitors() {
    if (_monitorGlobalTick) {
        clearInterval(_monitorGlobalTick);
        _monitorGlobalTick = null;
    }
    const hasEnabled = (data.monitoredPages || []).some(p => p.enabled);
    if (!hasEnabled) return;
    _monitorGlobalTick = setInterval(_monitorRunOverdue, 30 * 1000);
}

// Keep _monitorSchedulePage as a no-op shim so callers in crud.js don't break.
// Rescheduling the global tick when a single page changes is enough.
function _monitorSchedulePage(_page) {
    _rescheduleAllMonitors();
}

function initMonitor() {
    if (!Array.isArray(data.monitoredPages)) data.monitoredPages = [];
    _rescheduleAllMonitors();
    _renderMonitorIndicator();
    if (data.monitoredPages.length > 0) requestNotificationPermission();

    // Run overdue checks immediately on page load (covers the unchecked-baseline
    // case AND any page whose interval elapsed while the tab was closed/away).
    _monitorRunOverdue();

    // Also catch up whenever the user switches back to this tab after being away.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') _monitorRunOverdue();
    });

    // Re-render after first paint to ensure CSS classes are applied.
    requestAnimationFrame(_renderMonitorIndicator);
}
