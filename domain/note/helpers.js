// ─── NOTES MODULE ─────────────────────────────────────────────────
// Loaded before note/render.js. All functions are global.

let _notesSplitInstance = null;  // split.js instance
let _notesPreviewEl = null;      // .notes-preview DOM element ref
let _notesDragId = null;         // id of tab being dragged for reorder
let _pendingNoteFocusId = null;  // note to make active after undo restores it
let _notesTrashOpen = false;     // whether the trash panel is visible
let _notesTrashPreviewId = null; // id of trash note currently previewed
let _mermaidRenderToken = 0;     // incremented each render to discard stale async results

// ─── HELPERS ─────────────────────────────────────────────────────

function findNote(id) {
    return (data.notes || []).find(n => n.id === id) || null;
}

function _findTrashNote(id) {
    return (data.notesTrash || []).find(n => n.id === id) || null;
}

function _noteExcerpt(note, maxLen = 140) {
    const raw = (note.content || '').trim();
    if (!raw) return '';
    let text;
    if (note.language === 'markdown' && window.marked) {
        // Render to HTML then strip tags to get readable plain text
        const html = marked.parse(raw);
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        text = tmp.textContent || tmp.innerText || '';
    } else {
        text = raw;
    }
    text = text.replace(/\s+/g, ' ').trim();
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function _formatDeletedAt(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _purgeOldTrash() {
    if (!data.notesTrash?.length) return;
    const now = Date.now();
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const expired = data.notesTrash.filter(n => {
        const deletedAt = n.deletedAt ? new Date(n.deletedAt).getTime() : 0;
        return deletedAt > 0 && deletedAt < cutoff;
    });
    if (!expired.length) return;
    data.notesTrash = data.notesTrash.filter(n => {
        const deletedAt = n.deletedAt ? new Date(n.deletedAt).getTime() : 0;
        return deletedAt === 0 || deletedAt >= cutoff;
    });
    saveData();
    expired.forEach(n => {
        const ids = extractUploadIds(n.content || '');
        if (ids.length) Promise.all(ids.map(id => deleteDialImage(id))).catch(() => {});
    });
}

function _isAppDark() {
    return !document.body.dataset.theme?.startsWith('light');
}

function _getNotesSortedByOrder() {
    return [...(data.notes || [])].sort((a, b) => a.order - b.order);
}

function _getNotesContainer() {
    return document.querySelector('.home-col-notes');
}
