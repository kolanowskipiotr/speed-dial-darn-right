// ─── PAGE MONITOR — HELPERS ──────────────────────────────────────
// Module-level state for the page monitor domain.

let _monitorCheckInFlight  = new Set(); // page IDs currently being checked
let _monitorGlobalTick     = null;      // single global setInterval handle
let _monitorPopoverOpen    = false;
let _editingMonitorPageId  = null;      // null = new page, string = editing existing page

function _findMonitoredPage(id) {
    return (data.monitoredPages || []).find(p => p.id === id) || null;
}

function _monitorChangedCount() {
    return (data.monitoredPages || []).filter(p => p.changed && p.enabled).length;
}

// Returns true when a page's check interval has elapsed since its last check.
function _monitorIsOverdue(page) {
    if (!page.enabled) return false;
    const intervalMs = (page.interval || 60) * 60 * 1000;
    const lastCheck  = page.lastChecked ? new Date(page.lastChecked).getTime() : 0;
    return (Date.now() - lastCheck) >= intervalMs;
}

// ── Per-page content stored in separate localStorage keys ─────────
// This keeps the main speedDial_v2 object lean.
// 'current' = content from last successful check (with ignoredPhrases applied)
// 'prev'    = content before the last detected change (for diffing)

function _monitorSaveContent(pageId, type, content) {
    try { localStorage.setItem(`speedDial_monCon_${pageId}_${type}`, content || ''); } catch (_) {}
}

function _monitorLoadContent(pageId, type) {
    return localStorage.getItem(`speedDial_monCon_${pageId}_${type}`) || '';
}

function _monitorDeleteContent(pageId) {
    localStorage.removeItem(`speedDial_monCon_${pageId}_current`);
    localStorage.removeItem(`speedDial_monCon_${pageId}_prev`);
}

// Apply ignored phrases: replace each phrase (case-insensitive) with ''
function _monitorApplyIgnored(text, ignoredPhrases) {
    if (!Array.isArray(ignoredPhrases) || ignoredPhrases.length === 0) return text;
    let clean = text;
    ignoredPhrases.forEach(phrase => {
        if (!phrase) return;
        const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        clean = clean.replace(re, '');
    });
    // Re-normalise: remove empty lines left after removal
    return clean.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n');
}
