# Plan: Google Tasks Sync for Notes

**Status:** Ready to implement — all decisions made
**Date:** 2026-04-11

---

## Overview

Per-note opt-in sync from local Notes to Google Tasks.
Instead of Google Keep, we use **Google Tasks API** to store long notes that exceed Keep's limitations.
Each note can be synced to a dedicated Google Tasks list named **"SDDR - Notes"**.
Long notes are automatically split into multiple tasks (each task = one part of the note).
Sync is both ways: **local ↔ Tasks**.

---

## Problem Solved

When a note exceeds Keep's limitations (or to avoid Keep's restrictions), notes are stored as tasks in Google Tasks.
Long notes are **split across multiple tasks** with sequence markers to preserve order.
On update, all parts are deleted and recreated (to avoid misalignment when content changes in the middle).

---

## Decisions & Constraints

| # | Decision |
|---|----------|
| 1 | **Both-ways**: local ↔ Tasks. Tasks API has no webhooks, so the Tasks→local direction uses window-focus polling. |
| 2 | **Two triggers**: auto (debounced on every local save) + two manual buttons: "Sync now" in the **data management window** (syncs all taskSync notes) and "Sync now" in the **note header** (syncs current note only). |
| 3 | **Content**: synced as-is. Markdown, JSON, etc. — no conversion. Stored in task title/description as needed. |
| 4 | **Aggregator list**: a Tasks list named **"SDDR - Notes"** created once; ID stored in `speedDial_syncSettings` as `tasksNotesListId`. |
| 5 | **Note identity in Tasks**: Each note is stored as one or more tasks. Task title pattern: `[SDDR] {note.name} (part {i}/{total})` for multi-part notes, or `[SDDR] {note.name}` for single-task notes. Task description = metadata + content: `speed-dial:{note.id}\n{content}`. Solves same-name collisions; enables recovery if `taskIds` lost. |
| 6 | **Long note splitting**: If note content > 8000 chars, split into multiple tasks. Each task holds ~8000 chars. Order preserved via part number: `[SDDR] note-name (part 1/3)`, `(part 2/3)`, `(part 3/3)`. |
| 7 | **Update strategy**: On note update, **always delete all old task parts and create new ones** (even if only part changed). This prevents misalignment and ordering issues. |
| 8 | **Note delete**: When a note is moved to trash, delete all its task parts from Tasks (fire-and-forget). |
| 9 | **Import from Tasks**: A "+📋" button in the notes panel opens a modal listing all "SDDR - Notes" tasks. User selects one or more parts; they are automatically reassembled into a new local note with `taskSync: true`. |
| 10 | **Sync indicator**: Each synced note tab shows a small coloured dot (diode) reflecting sync state: grey = off, blue = in sync, orange = pending/syncing, red = conflict. |
| 11 | **Merge conflict resolution**: If both local and Tasks are edited between syncs, a conflict icon appears on the tab. Clicking it opens a 3-pane modal: Local (read-only left) \| Merge result (editable centre) \| Tasks (read-only right). Saving the merge overwrites local and pushes to Tasks. |

### Critical API constraint
Google Tasks API has **no update endpoint**. Every "update" = `DELETE` all old task parts + `POST` new ones. The local note stores `taskIds` (array of task IDs) so all old parts can be deleted before recreating.

---

## Tasks API Reference

Base URL: `https://www.googleapis.com/tasks/v1`
OAuth scope to add: `https://www.googleapis.com/auth/tasks`

| Action | Endpoint | Payload / Notes |
|--------|----------|-----------------|
| List task lists | `GET /users/@me/lists` | Returns `{ items: [{ id, title }] }`. Used to find or create "SDDR - Notes" list. |
| Create task list | `POST /users/@me/lists` | `{ title: "SDDR - Notes" }` |
| List tasks in list | `GET /users/@me/lists/{listId}/tasks` | Returns `{ items: [{ id, title, notes, updated }] }`. Optional `showDeleted=false` to hide trashed tasks. |
| Get task | `GET /users/@me/lists/{listId}/tasks/{taskId}` | Returns single task. Used for polling + conflict detection. |
| Create task | `POST /users/@me/lists/{listId}/tasks` | `{ title, notes }`. Returns `{ id, updated, ... }` |
| Delete task | `DELETE /users/@me/lists/{listId}/tasks/{taskId}` | Soft-trashes the task. |

Response from create task: `{ id: "taskId", updated: "2026-04-11T12:34:56.789Z", ... }` → store `id` in `taskIds[]`, `updated` as `taskLastSyncedAt`.

> **Note**: The Tasks scope works with personal Google accounts. The existing GDrive OAuth client can be reused — just add the scope and the user re-authenticates once.

---

## Data Model Changes

### Per-note fields (in `data.notes[]`)

```js
{
  // existing fields unchanged...
  taskSync:            false,  // boolean — opt-in flag; default false
  taskIds:             [],     // array of task IDs; one or more if note is split across tasks
  taskLastSyncedAt:    null,   // ISO timestamp — set after every successful push; used to detect Tasks-side edits
  taskLocalDirty:      false,  // true if note was edited locally after last sync; cleared on successful push
  taskConflict:        false,  // true when both local and Tasks were edited since last sync
}
```

No explicit migration needed: `undefined` is falsy, so existing notes without these fields behave correctly with all guards.

### Sync settings (`speedDial_syncSettings`)

Add one new field:
```js
{
  // existing fields unchanged...
  tasksNotesListId: null,  // string | null — Tasks list ID (e.g. "MTk..."), created once on first sync
}
```

---

## File Changes

### 1. `domain/core/state.js`
Add Tasks-related icons to `ICONS`:
```js
taskSyncOff:     '📋',  // tasks — sync disabled (shown faded)
taskSyncOn:      '📋',  // same glyph, accent colour when active
taskSyncing:     '↻',   // in-progress
taskConflict:    '⚠',   // conflict indicator
taskImport:      '⊕',   // import-from-Tasks button
```

---

### 2. `domain/persistence/sync.js`
Add Tasks scope to `SCOPES`:
```js
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/tasks',       // NEW
];
```
Also update `saveSyncSettings()` / `loadSyncSettings()` to persist/load `tasksNotesListId`.

---

### 3. `domain/note/tasks-sync.js` (new file)

All Tasks API calls are direct browser fetches — no backend changes needed.

```
// Module globals
let _tasksSyncTimers = {};        // { [noteId]: timeoutId } — per-note debounce
const TASKS_API_BASE = 'https://www.googleapis.com/tasks/v1';
const TASKS_LIST_NAME = 'SDDR - Notes';
const MAX_TASK_LENGTH = 8000;     // approximate; split notes larger than this

// ── List Management ────────────────────────────────────────────────────────
async function _getOrCreateTasksList()
  // Reads tasksNotesListId from syncSettings
  // If null:
  //   - GET /users/@me/lists to find "SDDR - Notes"
  //   - If not found: POST /users/@me/lists → create it
  //   - Store result.id in syncSettings
  // Returns list ID string (e.g. "MTk...")

// ── Body encoding helpers ─────────────────────────────────────────────────
function _encodeTaskBody(note)
  // Returns: `speed-dial:{note.id}\n{note.content}`

function _decodeTaskBody(noteText)
  // If first line matches /^speed-dial:[^\n]+\n/, strip it and return rest
  // Otherwise return noteText as-is (safe for notes imported without metadata)

function _splitNoteIntoTasks(content)
  // If content.length <= MAX_TASK_LENGTH: return [{ content }]
  // Else: split into chunks of ~MAX_TASK_LENGTH, return array:
  //   [{ content: chunk1, partNum: 1, totalParts: N }, ...]

function _reassembleTasksToNote(tasks)
  // Expects tasks sorted by part number (ascending)
  // Concatenates all .content fields
  // Decodes from body format

// ── Local → Tasks (push) ────────────────────────────────────────────────────
async function syncNoteToTasks(note)
  // 1. Guard: if !currentAccessToken → toast "Log in to Google first" and return
  // 2. Guard: if note.taskConflict → toast "Resolve conflict before syncing" and return
  // 3. Get/create list
  // 4. If note.taskIds.length > 0 → DELETE each task in taskIds (ignore 404)
  // 5. Split note into task parts via _splitNoteIntoTasks()
  // 6. For each part: POST /lists/{listId}/tasks
  //    - title = `[SDDR] {note.name}` (if single part) or `[SDDR] {note.name} (part {i}/{total})` (if multi)
  //    - notes = _encodeTaskBody(part.content)
  // 7. Store all response.id in note.taskIds
  //    Store response.updated (from first task) in note.taskLastSyncedAt
  //    Set note.taskLocalDirty = false
  // 8. saveData()
  // 9. Update indicator dot for this note

function debounceTasksSync(note)
  // Clears existing timer for note.id, sets new 5s timeout → syncNoteToTasks(note)
  // Sets taskLocalDirty = true immediately (before debounce fires)

// ── Tasks → Local (pull / conflict detection) ──────────────────────────────
async function pollNoteFromTasks(note)
  // 1. Guard: if !currentAccessToken or note.taskIds.length === 0 → return
  // 2. For each taskId in note.taskIds:
  //    - GET /lists/{listId}/tasks/{taskId}
  //    - If 404 → remove from taskIds
  //    - Collect all tasks
  // 3. If note.taskIds now empty after 404s → saveData(); return
  // 4. Sort tasks by part number
  // 5. Get max .updated timestamp from all task parts
  // 6. If updateTime === note.taskLastSyncedAt → no change on Tasks side; return
  // 7. Tasks were edited externally:
  //    a. If !note.taskLocalDirty → auto-pull:
  //         content = _reassembleTasksToNote(tasks)
  //         note.content = _decodeTaskBody(content)
  //         note.taskLastSyncedAt = updateTime
  //         saveData()
  //         toast("Note '{note.name}' updated from Google Tasks")
  //    b. If note.taskLocalDirty → conflict: set note.taskConflict = true, saveData(),
  //       update indicator dot to red

async function pollAllTaskNotes()
  // Called on window 'focus' event (throttled to once per 60s)
  // Iterates all notes where taskSync && taskIds.length > 0
  // Calls pollNoteFromTasks(note) for each

// ── Conflict resolution ───────────────────────────────────────────────────
async function resolveTaskConflict(noteId, mergedContent)
  // 1. Set note.content = mergedContent
  // 2. Set note.taskConflict = false, note.taskLocalDirty = false
  // 3. saveData()
  // 4. Immediately syncNoteToTasks(note) (no debounce — push merged result now)
  // 5. Re-render editor with merged content

// ── Delete ────────────────────────────────────────────────────────────────
async function removeNoteFromTasks(note)
  // If note.taskIds.length > 0:
  //   - For each taskId: DELETE /lists/{listId}/tasks/{taskId} (ignore 404)
  // Clear taskIds, taskLastSyncedAt, taskLocalDirty, taskConflict
  // saveData()

// ── Toggle ────────────────────────────────────────────────────────────────
function toggleNoteTasksSync(noteId)
  // Flips note.taskSync
  // If now true  → syncNoteToTasks(note) immediately
  // If now false → removeNoteFromTasks(note)
  // Partial UI re-render: _buildNotesTabs()

// ── Import from Tasks ──────────────────────────────────────────────────────
async function listTasksNotes()
  // GET /lists/{listId}/tasks?showDeleted=false
  // Returns array of all tasks in SDDR - Notes list
  // Group by note name (extract from title via regex /^\[SDDR\]\s*(.+?)(?:\s+\(part\s+\d+\/\d+\))?$/)
  // Return: { [noteNameKey]: { name, parts: [{ id, partNum, totalParts, preview }] } }

async function importNoteFromTasks(noteGroup)
  // noteGroup = { name, parts: [{ id, partNum, totalParts, ... }] }
  // 1. Fetch all parts: GET /lists/{listId}/tasks/{taskId} for each part
  // 2. Sort by partNum; concatenate content
  // 3. content = _reassembleTasksToNote(tasks)
  // 4. addNote() with name = noteGroup.name, content = content
  // 5. Set note.taskSync = true
  //    Set note.taskIds = [part.id for each part]
  //    Set note.taskLastSyncedAt = (max updated timestamp)
  //    Set note.taskLocalDirty = false
  // 6. saveData()
  // 7. Immediately syncNoteToTasks(note) to refresh metadata
  // 8. Close import modal; switch to the new note
```

**Error handling in `syncNoteToTasks`:**
- HTTP 401/403 → toast "Tasks access denied — please log in again"
- HTTP 404 on delete → silently ignore
- Network error → toast, do not corrupt local `taskIds`

**Polling setup (module init):**
```js
window.addEventListener('focus', _onWindowFocus);
let _lastPollAt = 0;
function _onWindowFocus() {
    if (Date.now() - _lastPollAt < 60_000) return;
    _lastPollAt = Date.now();
    pollAllTaskNotes();
}
```

---

### 4. `domain/note/domain.js` — data + CRUD hooks

**`addNote()`**: add to new note objects:
```js
taskSync: false, taskIds: [],
taskLastSyncedAt: null, taskLocalDirty: false, taskConflict: false,
```

**`window._notesCMDocChange()`**: after `saveData()`, add:
```js
if (note.taskSync && !note.taskConflict) debounceTasksSync(note);
```

**`renameNote()`**: after `saveData()`, add:
```js
if (note.taskSync && !note.taskConflict) debounceTasksSync(note);
```

**`deleteNote()`**: before moving note to trash:
```js
if (note.taskSync && note.taskIds.length > 0) removeNoteFromTasks(note);   // fire-and-forget
```

---

### 5. `domain/note/domain.js` — UI changes

#### Note tab: tasks toggle + conflict button + indicator dot

In `_buildNotesTabs()`, each tab gets additional elements (only shown when `googleUser !== null`):

```
[ Note name ][ 🔴 dot ][ 📋 toggle ][ × ]
```

- **Sync dot** `.notes-tab-sync-dot`: small `<span>` element; CSS class controls colour (same as Keep)
- **Tasks toggle** `.notes-tab-tasks-btn`: `ICONS.taskSyncOff/On`
- Dot and toggle hidden via CSS when not logged in

#### Conflict modal (opened on dot click when `taskConflict === true`)

A new modal `#notes-conflict-modal` with three panels side-by-side:
- Left: `<textarea readonly>` — local content
- Centre: `<textarea>` — editable merge result (pre-filled with local content)
- Right: `<textarea readonly>` — Tasks content (fetched live via GET when modal opens)
- Footer: "Save merge" button → calls `resolveTaskConflict(noteId, mergeTextarea.value)`

#### "Sync now" button in header actions
In `renderNotesPanel()`, conditionally add when `note.taskSync && googleUser`:
```js
tasksBtn.onclick = () => syncNoteToTasks(findNote(activeNoteId));
```

#### "Import from Tasks" button in notes panel header
A `+📋` button (`.notes-import-tasks-btn`) that opens a modal listing all "SDDR - Notes" tasks grouped by note name.

**Import modal `#notes-import-tasks-modal`:**
- Shows a scrollable list grouped by note name
- Each group shows: note name + number of parts + "Import" button
- Clicking "Import" → calls `importNoteFromTasks(noteGroup)` → modal closes

---

### 6. CSS

```css
/* Sync indicator dot on note tab — same as Keep */
.notes-tab-sync-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin: 0 2px;
    vertical-align: middle;
    transition: background-color 0.2s;
}
.notes-tab-sync-dot.sync-dot--off      { background: var(--text-muted); opacity: 0.3; }
.notes-tab-sync-dot.sync-dot--ok       { background: var(--accent); }
.notes-tab-sync-dot.sync-dot--pending  { background: var(--warning, #e8a000); }
.notes-tab-sync-dot.sync-dot--conflict { background: var(--danger, #d93025); cursor: pointer; }

/* Tasks toggle button */
.notes-tab-tasks-btn {
    opacity: 0.35;
    font-size: 0.8em;
    padding: 0 2px;
    transition: opacity 0.15s;
}
.notes-tab:hover .notes-tab-tasks-btn,
.notes-tab-tasks-btn.tasks-active { opacity: 1; }
.notes-tab-tasks-btn.tasks-active { color: var(--accent); }

/* Sync now + import buttons in header */
.notes-tasks-sync-btn    { color: var(--accent); }
.notes-import-tasks-btn  { color: var(--accent); }

/* Conflict modal 3-pane layout — same as Keep */
#notes-conflict-modal .conflict-panes {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: var(--space-sm);
    height: 60vh;
}
#notes-conflict-modal .conflict-panes textarea {
    width: 100%;
    height: 100%;
    resize: none;
    font-family: var(--font-mono);
    font-size: 0.85em;
}
```

---

### 7. `index.html`

Add `tasks-sync.js` to the load order immediately after `domain/note/domain.js`:

```html
<script src="/domain/note/domain.js"></script>
<script src="/domain/note/tasks-sync.js"></script>   <!-- NEW -->
<script type="module" src="/domain/note/codemirror.js"></script>
```

Add the new modals (`#notes-import-tasks-modal`) alongside existing note modals.

---

## Implementation Order

1. `domain/core/state.js` — add `ICONS.taskSyncOff / taskSyncOn / taskSyncing / taskConflict / taskImport`
2. `domain/persistence/sync.js` — add Tasks scope; update save/load for `tasksNotesListId`
3. `domain/note/tasks-sync.js` — create file: list management, push, pull/poll, conflict resolution, toggle, import, list
4. `domain/note/domain.js` — add new fields to `addNote()`; wire CRUD hooks (content change, rename, delete)
5. `index.html` — add `tasks-sync.js` to load order; add import modal HTML
6. `domain/note/domain.js` — UI: sync dot + tasks toggle in `_buildNotesTabs()`; "Sync now" + "Import" buttons in header
7. CSS — sync indicator, conflict modal 3-pane layout, tasks button styles

---

## Key Differences from Keep Sync

| Aspect | Keep Sync | Tasks Sync |
|--------|-----------|-----------|
| **API** | Google Keep API | Google Tasks API |
| **Storage** | One Keep note per local note | One or more Tasks per local note (split if long) |
| **Long notes** | Limited by Keep size | Split across multiple tasks with part markers |
| **Update cost** | Delete + recreate (1–2 API calls) | Delete all parts + recreate (N+1 API calls for N parts) |
| **Scope** | `https://www.googleapis.com/auth/keep` | `https://www.googleapis.com/auth/tasks` |
| **Label/List** | Keep Label "Speed Dial Darn Right" | Tasks List "SDDR - Notes" |
| **Identifier** | `keepNoteId` (single) | `taskIds` (array) |

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User not logged in, tries to enable Tasks sync | Toast: "Log in to Google first". Toggle does not flip. |
| Token lacks Tasks scope (existing user pre-re-auth) | 403 on first Tasks API call → toast "Re-authenticate to enable Tasks sync" |
| Task deleted manually in Tasks | `pollNoteFromTasks` gets 404 on part → remove from `taskIds`; if all parts gone, clear sync |
| Note edited to become shorter (multi-part → single-part) | Delete all old tasks, create single new task |
| Note edited to become longer (single-part → multi-part) | Delete old task, create multiple new tasks |
| Part order corrupted in Tasks | `pollNoteFromTasks` sorts by part number; re-sync corrects it |
| Both sides edited (conflict) | `taskConflict = true`; debounce push blocked until resolved; red dot on tab |
| Note deleted locally while debounce timer pending | Timer fires, `findNote()` returns null — guard at top of `syncNoteToTasks` |
| `tasksNotesListId` list deleted in Tasks | `_getOrCreateTasksList` creates a new list; new ID stored in syncSettings |
| Multiple rapid edits | Per-note 5s debounce — only last edit triggers a Tasks push |
| Import: select multiple parts from different notes | Import modal only shows full note groups; user cannot mix parts |
| Window focus poll during ongoing sync | `pollAllTaskNotes` checks `taskLocalDirty`; dirty notes are skipped (push already in flight) |

---

## Known Limitations

- Task list search/filter not yet implemented; import modal shows all tasks (acceptable for small lists)
- No progress indicator for multi-part sync (acceptable; typical sync < 2s)
- No automatic part reassembly on mid-note edit; user must re-sync (acceptable; trade-off for simplicity)

```

