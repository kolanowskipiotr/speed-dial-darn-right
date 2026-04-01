# Plan: Google Keep Sync for Notes

**Status:** Ready to implement — all decisions made
**Date:** 2026-04-01

---

## Overview

Per-note opt-in sync from local Notes to Google Keep.
Each note tab shows a cloud toggle; enabling it pushes the note to Keep (and keeps it in sync).
Only enabled notes are synced. Sync is both ways: **local ↔ Keep**.

---

## Decisions & Constraints

| # | Decision |
|---|----------|
| 1 | **Both-ways**: local ↔ Keep. Keep has no webhooks, so the Keep→local direction uses window-focus polling. |
| 2 | **Two triggers**: auto (debounced on every local save) + two manual buttons: "Sync now" in the **data management window** (syncs all keepSync notes) and "Sync now" in the **note header** (syncs current note only). |
| 3 | **Content**: synced as-is. Markdown arrives in Keep as raw markdown text; JSON as JSON, etc. No conversion. |
| 4 | **Aggregator**: a Keep Label named `Speed Dial Darn Right` groups all synced notes. Created once; ID stored in `speedDial_syncSettings`. |
| 5 | **Note identity in Keep**: title = `{note.name}` (clean). First line of the Keep note body = `speed-dial:{note.id}` (hidden metadata). Speed Dial strips this line on read and prepends it on write. Solves same-name collisions; also enables ID recovery if `keepNoteId` is ever lost. |
| 6 | **Note delete**: When a note is moved to trash, delete it from Keep too (fire-and-forget). |
| 7 | **Import from Keep**: A "+☁" button in the notes panel opens a modal listing **all** Keep notes (not filtered by label). User selects one; a new local note is created with that content and `keepSync: true`. On first sync the note gains the Speed Dial label and the first-line metadata is injected. |
| 8 | **Sync indicator**: Each synced note tab shows a small coloured dot (diode) reflecting sync state: grey = off, blue = in sync, orange = pending/syncing, red = conflict. |
| 9 | **Merge conflict resolution**: If both local and Keep are edited between syncs, a conflict icon appears on the tab. Clicking it opens a 3-pane modal: Local (read-only left) \| Merge result (editable centre) \| Keep (read-only right). Saving the merge overwrites local and pushes to Keep. **Feasibility confirmed**: `GET /notes/{name}` returns `updateTime`, so we can detect Keep-side edits reliably. |

### Critical API constraint
The Google Keep API **has no update endpoint**. Every "update" = `DELETE` old Keep note + `POST` new one. The local note stores `keepNoteId` (the Keep note's `name` field, e.g. `notes/abc123`) so the old note can be deleted before recreating.

---

## Keep API Reference

Base URL: `https://keepapi.googleapis.com/v1`
OAuth scope to add: `https://www.googleapis.com/auth/keep`

| Action | Endpoint | Payload / Notes |
|--------|----------|-----------------|
| List notes | `GET /notes` | Optional `filter` param (e.g. `label:{labelName}`). Returns `{ notes[], nextPageToken }`. Each note has `name`, `title`, `body.text.text`, `createTime`, `updateTime`. |
| Get note | `GET /{name}` | `name` = `"notes/{id}"`. Returns same shape as list item. Used for polling + conflict detection. |
| Create note | `POST /notes` | `{ title, body: { text: { text } }, labels: [{ name: labelName }] }` |
| Delete note | `DELETE /{name}` | Soft-trashes the note in Keep. |
| Create label | `POST /labels` | `{ displayName: "Speed Dial Darn Right" }` |
| List labels | `GET /labels` | — |

Response from create note: `{ name: "notes/{id}", title, updateTime, ... }` → store `name` as `keepNoteId`, `updateTime` as `keepLastSyncedAt`.

> **Note**: The Keep scope is restricted but works with personal Google accounts in "testing" mode in Google Cloud Console. The existing GDrive OAuth client can be reused — just add the scope and the user re-authenticates once.

---

## Data Model Changes

### Per-note fields (in `data.notes[]`)

```js
{
  // existing fields unchanged...
  keepSync:            false,  // boolean — opt-in flag; default false
  keepNoteId:          null,   // string | null — Keep note name ("notes/abc123")
  keepLastSyncedAt:    null,   // ISO timestamp — set after every successful push; used to detect Keep-side edits
  keepLocalDirty:      false,  // true if note was edited locally after last sync; cleared on successful push
  keepConflict:        false,  // true when both local and Keep were edited since last sync
}
```

No explicit migration needed: `undefined` is falsy, so existing notes without these fields behave correctly with all guards.

### Sync settings (`speedDial_syncSettings`)

Add one new field:
```js
{
  // existing fields unchanged...
  keepLabelId: null,   // string | null — Keep label name ("labels/abc123"), created once on first sync
}
```

---

## File Changes

### 1. `domain/core/state.js`
Add Keep-related icons to `ICONS`:
```js
keepSyncOff:     '☁',   // cloud — sync disabled (shown faded)
keepSyncOn:      '☁',   // same glyph, accent colour when active
keepSyncing:     '↻',   // in-progress
keepConflict:    '⚠',   // conflict indicator
keepImport:      '⊕',   // import-from-Keep button
```
(Exact glyphs TBD during implementation.)

---

### 2. `domain/persistence/sync.js`
Add Keep scope to `SCOPES`:
```js
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/keep',          // NEW
];
```
Also update `saveSyncSettings()` / `loadSyncSettings()` to persist/load `keepLabelId`.

> Existing users will be prompted to re-authenticate the next time they click "Log in with Google". The token stored in `currentAccessToken` will NOT have the Keep scope until they re-auth — this is handled gracefully in `keep-sync.js` (see error handling below).

---

### 3. `domain/note/keep-sync.js` (new file)

All Keep API calls are direct browser fetches — no backend changes needed.

```
// Module globals
let _keepSyncTimers = {};   // { [noteId]: timeoutId } — per-note debounce

// ── Label ──────────────────────────────────────────────────────────────────
async function _getOrCreateKeepLabel()
  // Reads keepLabelId from syncSettings
  // If null: POST /labels → "Speed Dial Darn Right", store result in syncSettings
  // Returns label name string ("labels/abc123")

// ── Body encoding helpers ─────────────────────────────────────────────────
function _encodeKeepBody(note)
  // Returns: `speed-dial:{note.id}\n{note.content}`

function _decodeKeepBody(rawText)
  // If first line matches /^speed-dial:[^\n]+\n/, strip it and return rest
  // Otherwise return rawText as-is (safe for notes imported without metadata)

// ── Local → Keep (push) ────────────────────────────────────────────────────
async function syncNoteToKeep(note)
  // 1. Guard: if !currentAccessToken → toast "Log in to Google first" and return
  // 2. Guard: if note.keepConflict → toast "Resolve conflict before syncing" and return
  // 3. Get/create label
  // 4. If note.keepNoteId → DELETE /{note.keepNoteId} (ignore 404)
  // 5. POST /notes: title = note.name, body text = _encodeKeepBody(note), label attached
  // 6. Store response.name → note.keepNoteId
  //    Store response.updateTime → note.keepLastSyncedAt
  //    Set note.keepLocalDirty = false
  // 7. saveData()
  // 8. Update indicator dot for this note

function debounceKeepSync(note)
  // Clears existing timer for note.id, sets new 5s timeout → syncNoteToKeep(note)
  // Sets keepLocalDirty = true immediately (before debounce fires)

// ── Keep → Local (pull / conflict detection) ──────────────────────────────
async function pollNoteFromKeep(note)
  // 1. Guard: if !currentAccessToken or !note.keepNoteId → return
  // 2. GET /notes/{keepNoteId}
  // 3. If 404 → clear note.keepNoteId, keepLastSyncedAt, keepLocalDirty; saveData(); return
  // 4. If keepNote.updateTime === note.keepLastSyncedAt → no change on Keep side; return
  // 5. Keep was edited externally:
  //    a. If !note.keepLocalDirty → auto-pull:
  //         note.content = _decodeKeepBody(keepNote.body.text.text)
  //         note.keepLastSyncedAt = keepNote.updateTime
  //         saveData()  ← persists updated content; shown on next open or reload
  //         toast("Note '{note.name}' updated from Google Keep")
  //    b. If note.keepLocalDirty → conflict: set note.keepConflict = true, saveData(),
  //       update indicator dot to red

async function pollAllKeepNotes()
  // Called on window 'focus' event (throttled to once per 60s)
  // Iterates all notes where keepSync && keepNoteId
  // Calls pollNoteFromKeep(note) for each

// ── Conflict resolution ───────────────────────────────────────────────────
async function resolveKeepConflict(noteId, mergedContent)
  // 1. Set note.content = mergedContent
  // 2. Set note.keepConflict = false, note.keepLocalDirty = false
  // 3. saveData()
  // 4. Immediately syncNoteToKeep(note) (no debounce — push merged result now)
  // 5. Re-render editor with merged content

// ── Delete ────────────────────────────────────────────────────────────────
async function removeNoteFromKeep(note)
  // If note.keepNoteId → DELETE /{note.keepNoteId} (ignore 404)
  // Clear keepNoteId, keepLastSyncedAt, keepLocalDirty, keepConflict
  // saveData()

// ── Toggle ────────────────────────────────────────────────────────────────
function toggleNoteKeepSync(noteId)
  // Flips note.keepSync
  // If now true  → syncNoteToKeep(note) immediately
  // If now false → removeNoteFromKeep(note)
  // Partial UI re-render: _buildNotesTabs()

// ── Import from Keep ──────────────────────────────────────────────────────
async function listKeepNotes()
  // GET /notes (no filter — show all, let user pick)
  // Returns array of { name, title, body.text.text, updateTime }
  // If Keep note body is a list type (checklist), body.text is absent — skip or show as "(checklist, not importable)"

async function importNoteFromKeep(keepNote)
  // 1. content = _decodeKeepBody(keepNote.body.text.text)
  // 2. addNote() with name = keepNote.title, content = content
  // 3. Set note.keepSync = true
  //    Set note.keepNoteId = keepNote.name  ← will be replaced on first sync (delete+recreate)
  //    Set note.keepLastSyncedAt = keepNote.updateTime
  //    Set note.keepLocalDirty = false
  // 4. saveData()
  // 5. Immediately syncNoteToKeep(note) to add label + inject first-line metadata
  // 6. Close import modal; switch to the new note
```

**Error handling in `syncNoteToKeep`:**
- HTTP 401/403 → toast "Keep access denied — please log in again" (same pattern as `handleSyncError`)
- HTTP 404 on delete → silently ignore
- Network error → toast, do not corrupt local `keepNoteId`

**Polling setup (module init):**
```js
window.addEventListener('focus', _onWindowFocus);
let _lastPollAt = 0;
function _onWindowFocus() {
    if (Date.now() - _lastPollAt < 60_000) return;
    _lastPollAt = Date.now();
    pollAllKeepNotes();
}
```

---

### 4. `domain/note/domain.js` — data + CRUD hooks

**`addNote()`**: add to new note objects:
```js
keepSync: false, keepNoteId: null,
keepLastSyncedAt: null, keepLocalDirty: false, keepConflict: false,
```

**`window._notesCMDocChange()`**: after `saveData()`, add:
```js
if (note.keepSync && !note.keepConflict) debounceKeepSync(note);
```

**`renameNote()`**: after `saveData()`, add:
```js
if (note.keepSync && !note.keepConflict) debounceKeepSync(note);
```

**`deleteNote()`**: before moving note to trash:
```js
if (note.keepSync && note.keepNoteId) removeNoteFromKeep(note);   // fire-and-forget
```

---

### 5. `domain/note/domain.js` — UI changes

#### Note tab: cloud toggle + conflict button + indicator dot

In `_buildNotesTabs()`, each tab gets additional elements (only shown when `googleUser !== null`):

```
[ Note name ][ 🔴 dot ][ ☁ toggle ][ × ]
```

- **Sync dot** `.notes-tab-sync-dot`: small `<span>` element; CSS class controls colour:
  - `sync-dot--off` (grey, opacity 0.3) — keepSync false
  - `sync-dot--ok` (blue/accent) — keepSync true, no conflict
  - `sync-dot--pending` (orange/warning) — keepLocalDirty true
  - `sync-dot--conflict` (red/danger) — keepConflict true; dot is clickable → opens conflict modal
- **Cloud toggle** `.notes-tab-keep-btn`: same as before, `ICONS.keepSyncOff/On`
- Dot and toggle hidden via CSS when not logged in

#### Conflict modal (opened on dot click when `keepConflict === true`)

A new modal `#notes-conflict-modal` with three panels side-by-side:
- Left: `<textarea readonly>` — local content
- Centre: `<textarea>` — editable merge result (pre-filled with local content)
- Right: `<textarea readonly>` — Keep content (fetched live via GET when modal opens)
- Footer: "Save merge" button → calls `resolveKeepConflict(noteId, mergeTextarea.value)`

#### "Sync now" button in header actions
In `renderNotesPanel()`, conditionally add when `note.keepSync && googleUser`:
```js
keepBtn.onclick = () => syncNoteToKeep(findNote(activeNoteId));
```

#### "Import from Keep" button in notes panel header
A `+☁` button (`.notes-import-keep-btn`) that opens a modal listing all Keep notes.

**Import modal `#notes-import-keep-modal`:**
- Shows a scrollable list; each row: note title + preview snippet + "Import" button
- Checklist notes shown greyed with "(checklist — not importable)"
- Clicking "Import" → calls `importNoteFromKeep(keepNote)` → modal closes

---

### 6. CSS

```css
/* Sync indicator dot on note tab */
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

/* Cloud toggle button */
.notes-tab-keep-btn {
    opacity: 0.35;
    font-size: 0.8em;
    padding: 0 2px;
    transition: opacity 0.15s;
}
.notes-tab:hover .notes-tab-keep-btn,
.notes-tab-keep-btn.keep-active { opacity: 1; }
.notes-tab-keep-btn.keep-active { color: var(--accent); }

/* Sync now + import buttons in header */
.notes-keep-sync-btn  { color: var(--accent); }
.notes-import-keep-btn { color: var(--accent); }

/* Conflict modal 3-pane layout */
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

Add `keep-sync.js` to the load order immediately after `domain/note/domain.js`:

```html
<script src="/domain/note/domain.js"></script>
<script src="/domain/note/keep-sync.js"></script>   <!-- NEW -->
<script type="module" src="/domain/note/codemirror.js"></script>
```

Add the two new modals (`#notes-conflict-modal`, `#notes-import-keep-modal`) alongside existing note modals.

---

## Implementation Order

1. `domain/core/state.js` — add `ICONS.keepSyncOff / keepSyncOn / keepSyncing / keepConflict / keepImport`
2. `domain/persistence/sync.js` — add Keep scope; update save/load for `keepLabelId`
3. `domain/note/keep-sync.js` — create file: label, push, pull/poll, conflict resolution, toggle, import, list
4. `domain/note/domain.js` — add new fields to `addNote()`; wire CRUD hooks (content change, rename, delete)
5. `index.html` — add `keep-sync.js` to load order; add conflict modal + import modal HTML
6. `domain/note/domain.js` — UI: sync dot + cloud toggle in `_buildNotesTabs()`; "Sync now" + "Import" buttons in header; conflict modal open/render logic
7. CSS — dot indicator, conflict modal 3-pane layout, import button styles

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User not logged in, tries to enable Keep sync | Toast: "Log in to Google first". Toggle does not flip. |
| Token lacks Keep scope (existing user pre-re-auth) | 403 on first Keep API call → toast "Re-authenticate to enable Keep sync" |
| Keep note deleted manually in Keep | `pollNoteFromKeep` gets 404 → clear `keepNoteId`; next save creates a fresh one |
| Note deleted locally while debounce timer pending | Timer fires, `findNote()` returns null — guard at top of `syncNoteToKeep` |
| `keepLabelId` label deleted in Keep | `_getOrCreateKeepLabel` creates a new label; new ID stored in syncSettings |
| Multiple rapid edits | Per-note 5s debounce — only last edit triggers a Keep push |
| Notes in trash | `notesTrash` entries are NOT polled. Keep note deleted when note moves to trash. |
| Both sides edited (conflict) | `keepConflict = true`; debounce push blocked until resolved; red dot on tab |
| Imported Keep note is a checklist | Listed but not importable (checklist body has no `.text.text`); shown greyed out |
| `updateTime` unchanged but content drifted | Cannot happen — Keep always bumps `updateTime` on edits |
| Import: Keep note has no `body.text` (checklist) | `_decodeKeepBody` receives undefined → shown greyed out in import modal as "(checklist — not importable)" |
| Recovery: `keepNoteId` lost | Scan Keep notes by label, match first-line `speed-dial:{note.id}` to re-link |
| Window focus poll during ongoing sync | `pollAllKeepNotes` checks `keepLocalDirty`; dirty notes are skipped (push already in flight) |
