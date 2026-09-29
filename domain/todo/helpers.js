// ─── TODO MODULE ─────────────────────────────────────────────────
// Loaded before todo/render.js. All functions are global (no module system).

let todoFullScreen = false;
let doneExpandedListId = null;  // id of list whose Done section is expanded; JS-only, resets on load
let expandedItemId = null;      // id of item shown inline-expanded (preview)
let editingFirstLineItemId = null; // id of expanded item whose first line is an input (dblclick)
let _todoTitleClickTimer = null;   // delays single-click toggle so dblclick can cancel it

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

// ─── ORDERING ────────────────────────────────────────────────────
// Order lives apart from the records, so reordering never rewrites list/item data:
//   data.todoListOrder — list ids, top to bottom
//   list.itemOrder     — ids of active (not done) items, top to bottom
// Done items are not ordered — they sort by doneAt.

function getOrderedTodoLists() {
    const byId = new Map((data.todoLists || []).map(l => [l.id, l]));
    return (data.todoListOrder || []).map(id => byId.get(id)).filter(Boolean);
}

function getOrderedActiveItems(list) {
    const byId = new Map((list.items || []).filter(i => !i.isDone).map(i => [i.id, i]));
    return (list.itemOrder || []).map(id => byId.get(id)).filter(Boolean);
}

function _removeOrderId(arr, id) {
    const idx = arr.indexOf(id);
    if (idx !== -1) arr.splice(idx, 1);
}

// Puts `id` at the 'top' or bottom of `arr`, removing any earlier occurrence
function _placeOrderId(arr, id, position) {
    _removeOrderId(arr, id);
    if (position === 'top') arr.unshift(id);
    else arr.push(id);
}

// Moves `dragId` right before/after `targetId` within `arr`
function _moveOrderIdRelative(arr, dragId, targetId, insertBefore) {
    if (dragId === targetId || !arr.includes(dragId) || !arr.includes(targetId)) return false;
    _removeOrderId(arr, dragId);
    const idx = arr.indexOf(targetId);
    arr.splice(insertBefore ? idx : idx + 1, 0, dragId);
    return true;
}

// Keeps ids of `order` still present in `records`, then appends the missing ones in records' order
function _reconcileOrder(order, records) {
    const ids = new Set(records.map(r => r.id));
    const kept = [...new Set((Array.isArray(order) ? order : []).filter(id => ids.has(id)))];
    const keptSet = new Set(kept);
    return kept.concat(records.filter(r => !keptSet.has(r.id)).map(r => r.id));
}

// Brings order arrays in line with the records (after load/import): drops stale or
// duplicate ids and appends missing ones. Returns true if data changed.
function normalizeTodoOrder() {
    const lists = data.todoLists || [];
    let changed = false;

    const listOrder = _reconcileOrder(data.todoListOrder, lists);
    if (JSON.stringify(listOrder) !== JSON.stringify(data.todoListOrder)) {
        data.todoListOrder = listOrder;
        changed = true;
    }

    for (const list of lists) {
        const active = (list.items || []).filter(i => !i.isDone);
        const itemOrder = _reconcileOrder(list.itemOrder, active);
        if (JSON.stringify(itemOrder) !== JSON.stringify(list.itemOrder)) {
            list.itemOrder = itemOrder;
            changed = true;
        }
    }

    return changed;
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

function _getWeekStart(dateInput) {
    const d = new Date(dateInput);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=Sun..6=Sat
    d.setDate(d.getDate() + (day === 0 ? -6 : 1) - day);
    return d;
}

function _formatWeekRangeLabel(weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const opts = { month: 'short', day: 'numeric' };
    return `${weekStart.toLocaleDateString('en-US', opts)} – ${weekEnd.toLocaleDateString('en-US', opts)}, ${weekEnd.getFullYear()}`;
}

// Groups already-sorted (doneAt desc) done items into Monday–Sunday week buckets,
// newest week first; items with no doneAt land in a trailing "No date" bucket.
function _groupDoneItemsByWeek(doneItems) {
    const byWeek = new Map(); // weekStart timestamp -> { weekStart, items }
    const noDate = [];

    doneItems.forEach(item => {
        if (!item.doneAt) { noDate.push(item); return; }
        const weekStart = _getWeekStart(item.doneAt);
        const key = weekStart.getTime();
        if (!byWeek.has(key)) byWeek.set(key, { weekStart, items: [] });
        byWeek.get(key).items.push(item);
    });

    const groups = [...byWeek.values()]
        .sort((a, b) => b.weekStart - a.weekStart)
        .map(g => ({ label: _formatWeekRangeLabel(g.weekStart), items: g.items }));

    if (noDate.length) groups.push({ label: 'No date', items: noDate });

    return groups;
}
