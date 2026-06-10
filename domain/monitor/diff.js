// ─── PAGE MONITOR — DIFF & REPORT ────────────────────────────────
// Computes a line-level diff between old and new page content,
// renders the change-report modal, and handles the "ignore phrase" workflow.

// ── Diff algorithm ───────────────────────────────────────────────

/**
 * Simple line-level set-diff.
 * Returns { removed: string[], added: string[], unchanged: string[] }
 * Lines that appear more times in old than new are "removed" and vice versa.
 */
function _monitorLineDiff(oldText, newText) {
    const toLines = t => (t || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const oldLines = toLines(oldText);
    const newLines = toLines(newText);

    const countMap = (arr) => {
        const m = new Map();
        arr.forEach(l => m.set(l, (m.get(l) || 0) + 1));
        return m;
    };
    const oldMap = countMap(oldLines);
    const newMap = countMap(newLines);

    const removed = [];
    const added   = [];
    const seen    = new Set();

    oldLines.forEach(l => {
        if (seen.has(l)) return;
        seen.add(l);
        if ((oldMap.get(l) || 0) > (newMap.get(l) || 0)) removed.push(l);
    });

    seen.clear();
    newLines.forEach(l => {
        if (seen.has(l)) return;
        seen.add(l);
        if ((newMap.get(l) || 0) > (oldMap.get(l) || 0)) added.push(l);
    });

    const unchanged = oldLines.filter(l => newMap.has(l) && !removed.includes(l));

    return { removed, added, unchanged, hasChanges: removed.length > 0 || added.length > 0 };
}

// ── Diff modal ────────────────────────────────────────────────────

let _monitorDiffPageId = null;

function openMonitorDiffModal(pageId) {
    const page = _findMonitoredPage(pageId);
    if (!page) return;
    _monitorDiffPageId = pageId;

    document.getElementById('monitorDiffTitle').textContent =
        `Change report — ${page.name || page.url}`;

    _renderMonitorDiff(pageId);
    _renderMonitorIgnoredList(pageId);
    openModal('monitorDiffModal');
}

function _renderMonitorDiff(pageId) {
    const page = _findMonitoredPage(pageId);
    const container = document.getElementById('monitorDiffBody');
    if (!container || !page) return;

    const prev    = _monitorLoadContent(pageId, 'prev');
    const current = _monitorLoadContent(pageId, 'current');

    if (!prev && !current) {
        container.innerHTML = '<div class="monitor-diff-empty">No content stored yet.</div>';
        return;
    }
    if (!prev) {
        container.innerHTML = '<div class="monitor-diff-empty">No previous content — this was the first change detected.</div>';
        return;
    }

    const diff = _monitorLineDiff(prev, current);

    if (!diff.hasChanges) {
        container.innerHTML = '<div class="monitor-diff-empty">✅ No visible differences (all changes may be in the ignore list).</div>';
        return;
    }

    let html = '';

    if (diff.added.length > 0) {
        html += '<div class="monitor-diff-section-label monitor-diff-added-label">➕ Added / changed to</div>';
        diff.added.forEach(line => {
            html += `<div class="monitor-diff-row monitor-diff-row--added">
                <span class="monitor-diff-line">${escHtml(line)}</span>
                <button class="monitor-diff-ignore-btn" onclick="monitorIgnoreLine('${pageId}', ${escHtml(JSON.stringify(line))})" title="Ignore this line in future">Ignore</button>
            </div>`;
        });
    }

    if (diff.removed.length > 0) {
        html += '<div class="monitor-diff-section-label monitor-diff-removed-label">➖ Removed / was</div>';
        diff.removed.forEach(line => {
            html += `<div class="monitor-diff-row monitor-diff-row--removed">
                <span class="monitor-diff-line">${escHtml(line)}</span>
                <button class="monitor-diff-ignore-btn" onclick="monitorIgnoreLine('${pageId}', ${escHtml(JSON.stringify(line))})" title="Ignore this line in future">Ignore</button>
            </div>`;
        });
    }

    container.innerHTML = html;
}

function _renderMonitorIgnoredList(pageId) {
    const page = _findMonitoredPage(pageId);
    const container = document.getElementById('monitorIgnoredList');
    if (!container || !page) return;

    const phrases = page.ignoredPhrases || [];
    if (phrases.length === 0) {
        container.innerHTML = '<div class="monitor-ignored-empty">No ignored phrases yet.</div>';
        return;
    }

    container.innerHTML = phrases.map((p, i) => `
        <div class="monitor-ignored-row">
            <span class="monitor-ignored-text">${escHtml(p)}</span>
            <button class="btn-icon danger" onclick="monitorRemoveIgnoredPhrase('${pageId}', ${i})" title="Remove">🗑</button>
        </div>
    `).join('');
}

// ── Ignore actions ────────────────────────────────────────────────

function monitorIgnoreLine(pageId, line) {
    const page = _findMonitoredPage(pageId);
    if (!page || !line) return;
    if (!Array.isArray(page.ignoredPhrases)) page.ignoredPhrases = [];
    if (page.ignoredPhrases.includes(line)) return; // already ignored

    page.ignoredPhrases.push(line);

    // Await the async re-apply so content + hash are updated before saving/rendering
    _monitorReapplyIgnored(page).then(() => {
        saveData();
        _renderMonitorDiff(pageId);
        _renderMonitorIgnoredList(pageId);
        showToast(`${ICONS.ok} Line added to ignore list`);
    });
}

function monitorRemoveIgnoredPhrase(pageId, index) {
    const page = _findMonitoredPage(pageId);
    if (!page || !Array.isArray(page.ignoredPhrases)) return;
    page.ignoredPhrases.splice(index, 1);

    _monitorReapplyIgnored(page).then(() => {
        saveData();
        _renderMonitorDiff(pageId);
        _renderMonitorIgnoredList(pageId);
    });
}

/**
 * After changing ignoredPhrases: re-clean stored contents, recompute hash,
 * and clear `changed` if the diff is now empty.
 */
async function _monitorReapplyIgnored(page) {
    const rawCurrent = _monitorLoadContent(page.id, 'current');
    const rawPrev    = _monitorLoadContent(page.id, 'prev');

    const cleanCurrent = _monitorApplyIgnored(rawCurrent, page.ignoredPhrases);
    const cleanPrev    = _monitorApplyIgnored(rawPrev,    page.ignoredPhrases);

    _monitorSaveContent(page.id, 'current', cleanCurrent);
    if (rawPrev) _monitorSaveContent(page.id, 'prev', cleanPrev);

    // Recompute hash
    const encoder = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', encoder.encode(cleanCurrent));
    page.lastHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

    // If diff is now empty, auto-clear the change flag
    if (page.changed) {
        const diff = _monitorLineDiff(cleanPrev, cleanCurrent);
        if (!diff.hasChanges) {
            page.changed = false;
            _monitorSaveContent(page.id, 'prev', '');
            showToast(`${ICONS.ok} Change cleared — no meaningful differences remain`);
            _renderMonitorIndicator();
            if (_monitorPopoverOpen) _renderMonitorPopover();
            if (document.getElementById('monitorManageModal')?.classList.contains('open')) {
                _renderMonitorPagesList();
            }
        }
    }
}

function monitorAcknowledgeDiff(pageId) {
    monitorAcknowledge(pageId);
    closeModal('monitorDiffModal');
}

