// ─── PAGE MONITOR — RENDER ───────────────────────────────────────

function _renderMonitorIndicator() {
    const el = document.getElementById('monitorIndicator');
    if (!el) return;

    const pages   = data.monitoredPages || [];
    const total   = pages.length;
    const changed = _monitorChangedCount();
    const enabled = pages.filter(p => p.enabled).length;
    const errored = pages.filter(p => p.enabled && p.lastError && !p.lastHash).length;

    el.setAttribute('data-label',
        total === 0
            ? 'Page Monitor: no pages configured'
            : changed > 0
                ? `Page Monitor: ${changed} change${changed !== 1 ? 's' : ''} detected`
                : errored > 0
                    ? `Page Monitor: ${errored} page${errored !== 1 ? 's' : ''} failed to check`
                    : `Page Monitor: ${enabled} page${enabled !== 1 ? 's' : ''} monitored`
    );

    // Mirror the pattern used by other gdrive-indicator buttons:
    // 'connected' → green dot, 'conflict' → red dot
    el.classList.toggle('connected', total > 0 && changed === 0 && errored === 0 && enabled > 0);
    el.classList.toggle('conflict',  changed > 0 || errored > 0);
}

function _renderMonitorPopover() {
    const popover = document.getElementById('monitorPopover');
    if (!popover) return;

    const pages = data.monitoredPages || [];
    if (pages.length === 0) {
        popover.innerHTML = `
            <div class="monitor-popover-head">
                📡 Page Monitor
                <button class="monitor-popover-close" onclick="_closeMonitorPopover()" aria-label="Close">✕</button>
            </div>
            <div class="monitor-popover-empty">No pages configured.<br>Add pages in <strong>Edit</strong> mode.</div>
        `;
        return;
    }

    const items = pages.map(p => {
        const icon = !p.enabled ? '⏸️'
            : p.changed          ? '🔴'
            : p.lastHash         ? '🟢'
            : p.lastError        ? '⚠️'
            :                      '⏳';
        const when = p.changed && p.lastChangedAt
            ? `Changed ${_monitorRelTime(p.lastChangedAt)}`
            : p.lastError && p.lastChecked
                ? `Check failed ${_monitorRelTime(p.lastChecked)}: ${p.lastError}`
                : p.lastChecked
                    ? `Checked ${_monitorRelTime(p.lastChecked)}`
                    : 'Not checked yet';
        return `
            <div class="monitor-popover-item${p.changed ? ' monitor-popover-item--changed' : p.lastError && !p.lastHash ? ' monitor-popover-item--error' : ''}">
                <span class="monitor-popover-status">${icon}</span>
                <div class="monitor-popover-info">
                    <div class="monitor-popover-name">${escHtml(p.name || p.url)}</div>
                    <div class="monitor-popover-meta">${when}</div>
                </div>
                <div class="monitor-popover-actions">
                    ${p.changed ? `<button class="monitor-ack-btn" onclick="openMonitorDiffModal('${p.id}')" title="View change report">📋</button>` : ''}
                    <a href="${escHtml(p.url)}" target="_blank" rel="noopener" class="monitor-open-btn" title="Open page">↗</a>
                </div>
            </div>
        `;
    }).join('');

    popover.innerHTML = `
        <div class="monitor-popover-head">
            📡 Page Monitor
            <button class="monitor-popover-close" onclick="_closeMonitorPopover()" aria-label="Close">✕</button>
        </div>
        <div class="monitor-popover-body">${items}</div>
    `;
}

function _monitorRelTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function toggleMonitorPopover(e) {
    if (e) e.stopPropagation();
    if (editMode) {
        openMonitorManageModal();
        return;
    }
    const popover = document.getElementById('monitorPopover');
    if (!popover) return;
    _monitorPopoverOpen = !_monitorPopoverOpen;
    popover.classList.toggle('open', _monitorPopoverOpen);
    if (_monitorPopoverOpen) {
        _renderMonitorIndicator(); // ensure label/dot are current before showing
        _renderMonitorPopover();
    }
}

function _closeMonitorPopover() {
    _monitorPopoverOpen = false;
    const el = document.getElementById('monitorPopover');
    if (el) el.classList.remove('open');
}


