// ─── TODO MODULE ─────────────────────────────────────────────────
// Loaded before todo/render.js. All functions are global (no module system).

let todoFullScreen = false;
let doneExpandedListId = null;  // id of list whose Done section is expanded; JS-only, resets on load
let expandedItemId = null;      // id of item shown inline-expanded

// Drag state — all JS-only, no persistence
let _todoDragItemId  = null;  // id of item being dragged
let _todoDragListId  = null;  // source list id for item drag
let _todoDragListElemId = null; // id of list being dragged (list reorder)

// ─── HELPERS ─────────────────────────────────────────────────────

function findTodoList(id) {
    return (data.todoLists || []).find(l => l.id === id) || null;
}

function findTodoItem(itemId) {
    for (const list of data.todoLists || []) {
        const item = (list.items || []).find(i => i.id === itemId);
        if (item) return { item, list };
    }
    return null;
}

function extractUploadIds(content) {
    const re = /\/uploads\/([\w.\-]+)/g;
    const ids = [];
    let m;
    while ((m = re.exec(content)) !== null) ids.push(m[1]);
    return ids;
}

function getFirstLine(content) {
    if (!content) return '';
    const line = content.split('\n').find(l => l.trim()) || '';
    // Strip common markdown markers for a clean preview
    return line
        .replace(/^#+\s+/, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^\s*[-*+]\s+/, '')
        .replace(/^\s*\d+\.\s+/, '')
        .trim();
}

function _getRawFirstLine(content) {
    if (!content) return '';
    return content.split('\n').find(l => l.trim()) || '';
}

function _replaceFirstLine(content, newLine) {
    if (!content) return newLine;
    const lines = content.split('\n');
    const idx = lines.findIndex(l => l.trim());
    if (idx === -1) return newLine;
    lines[idx] = newLine;
    return lines.join('\n');
}

function _getTodoContainer() {
    return document.querySelector('.home-col-todo');
}
