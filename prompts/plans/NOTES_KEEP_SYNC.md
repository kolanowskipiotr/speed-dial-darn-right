# Plan: Google Keep Sync for Notes

**Status:** Ready to implement — all decisions made
**Date:** 2026-03-31

---

## Overview

Per-note opt-in sync from local Notes to Google Keep. Each note tab shows a cloud toggle; enabling it pushes the note to Keep (and keeps it in sync). Only enabled notes are synced. Sync is one-way: **local → Keep only**.

---

## Decisions & Constraints

| # | Decision |
|---|----------|
| 1 | **One-way**: local → Keep. Bidirectional would require polling (Keep has no webhooks). |
| 2 | **Two triggers**: auto (debounced on every save, same pattern as GDrive) + manual "Sync now" button in the header. |
| 3 | **Content**: synced as-is. Markdown arrives in Keep as raw markdown text; JSON as JSON, etc. No conversion. |
| 4 | **Aggregator**: a Keep Label named `Speed Dial Darn Right` groups all synced notes. Created once; ID stored in `speedDial_syncSettings`. |
| 5 | **Note title in Keep**: `{note.name}\|{note.id}` — the `|` separator makes it machine-parseable if needed later. |

### Critical API constraint
The Google Keep API **has no update endpoint**. Every "update" = `DELETE` old Keep note + `POST` new one. The local note stores `keepNoteId` (the Keep note's `name` field, e.g. `notes/abc123`) so the old note can be deleted before recreating.

---

## Keep API Reference

Base URL: `https://keepapi.googleapis.com/v1`
OAuth scope to add: `https://www.googleapis.com/auth/keep`

| Action | Endpoint | Payload |
|--------|----------|---------|
| Create note | `POST /notes` | `{ title, body: { text: { text } }, labels: [{ name: labelName }] }` |
| Delete note | `DELETE /{name}` | — (name = `"notes/{id}"`) |
| Create label | `POST /labels` | `{ displayName: "Speed Dial Darn Right" }` |
| List labels | `GET /labels` | — |

Response from create note: `{ name: "notes/{id}", title, ... }` → store `name` as `keepNoteId`.

> **Note**: The Keep scope is restricted but works with personal Google accounts in "testing" mode in Google Cloud Console. The existing GDrive OAuth client can be reused — just add the scope and the user re-authenticates once.

---

## Data Model Changes

### Per-note fields (in `data.notes[]`)

```js
{
  // existing fields unchanged...
  keepSync:   false,   // boolean — opt-in flag; default false
  keepNoteId: null,    // string | null — Keep note name ("notes/abc123"), null until first sync
}
```

No explicit migration needed: `undefined` is falsy, so existing notes without these fields behave as `keepSync: false` / `keepNoteId: null`.

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
keepSyncOff: '☁',   // cloud outline — sync disabled
keepSyncOn:  '☁',   // same glyph, but CSS class will colour it distinctly
keepSyncing: '↻',   // spinning/in-progress indicator
```
(Exact emoji TBD during implementation — prefer something that visually distinguishes on/off states.)

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

async function _getOrCreateKeepLabel()
  // Reads keepLabelId from syncSettings
  // If null: POST /labels to create "Speed Dial Darn Right", store result in syncSettings
  // Returns label name string ("labels/abc123")
  // Throws if not authenticated

async function syncNoteToKeep(note)
  // 1. Guard: if !currentAccessToken → show toast "Log in to Google first" and return
  // 2. Get/create label
  // 3. If note.keepNoteId exists → DELETE /{note.keepNoteId} (ignore 404)
  // 4. POST /notes with title=`{note.name}|{note.id}`, body text=note.content, label attached
  // 5. Store response.name → note.keepNoteId
  // 6. saveData() to persist the new ID
  // 7. Show toast on success/failure

async function removeNoteFromKeep(note)
  // If note.keepNoteId → DELETE /{note.keepNoteId} (ignore 404)
  // Clear note.keepNoteId = null
  // saveData()

function debounceKeepSync(note)
  // Clears existing timer for note.id, sets new 5s timeout → syncNoteToKeep(note)
  // Same debounce pattern as triggerSync() in export.js

function toggleNoteKeepSync(noteId)
  // Flips note.keepSync
  // If now true  → syncNoteToKeep(note) immediately + saveData()
  // If now false → removeNoteFromKeep(note) (saveData() called inside)
  // Partial UI re-render: _buildNotesTabs(scrollArea)
```

**Error handling in `syncNoteToKeep`:**
- HTTP 401/403 → show toast "Keep access denied — please log in again" (same pattern as `handleSyncError`)
- HTTP 404 on delete → silently ignore (note was already gone in Keep)
- Network error → show toast, do not corrupt local `keepNoteId`

---

### 4. `domain/note/domain.js` — data + CRUD hooks

**`addNote()`**: add `keepSync: false, keepNoteId: null` to new note objects.

**`window._notesCMDocChange()`**: after `saveData()`, add:
```js
if (note.keepSync) debounceKeepSync(note);
```

**`renameNote()`**: after `saveData()`, add:
```js
if (note.keepSync) debounceKeepSync(note);
// (rename = title change = must recreate in Keep since no update endpoint)
```

**`deleteNote()`**: before moving note to trash, add:
```js
if (note.keepSync && note.keepNoteId) removeNoteFromKeep(note);
// fire-and-forget; don't await (deletion is best-effort)
```

**New function `toggleNoteKeepSync(noteId)`**: defined in `keep-sync.js` (calls back into note domain), or defined in `domain.js` and calls into keep-sync helpers — either is fine. Keep in `keep-sync.js` to keep concerns separated.

---

### 5. `domain/note/domain.js` — UI changes

#### Note tab cloud toggle button
In `_buildNotesTabs()`, each tab gets a second action button alongside the existing `×` close button:

```
[ Note name ][ ☁ ][ × ]
```

- Button class: `notes-tab-keep-btn`
- `title` = "Enable Keep sync" / "Disable Keep sync" (toggled)
- `textContent` = `ICONS.keepSyncOff` or `ICONS.keepSyncOn` based on `note.keepSync`
- Active state class `keep-active` when `note.keepSync === true`
- `onclick`: `e.stopPropagation(); toggleNoteKeepSync(note.id);`
- Button is only shown when user is logged in (`googleUser !== null`)

#### "Sync now" button in header actions
In `renderNotesPanel()`, conditionally add a "Sync now" button to `headerActions`:

```js
if (note.keepSync && typeof googleUser !== 'undefined' && googleUser) {
    const keepBtn = document.createElement('button');
    keepBtn.className = 'btn-icon notes-keep-sync-btn';
    keepBtn.title = 'Sync to Google Keep now';
    keepBtn.textContent = ICONS.keepSyncOn;
    keepBtn.onclick = () => syncNoteToKeep(findNote(activeNoteId));
    headerActions.appendChild(keepBtn);  // insert before imgBtn
}
```

---

### 6. CSS (`domain/core/style.css` or `domain/persistence/styles.css`)

```css
/* Keep sync button on note tab */
.notes-tab-keep-btn {
    opacity: 0.35;
    font-size: 0.8em;
    padding: 0 2px;
    transition: opacity 0.15s;
}
.notes-tab:hover .notes-tab-keep-btn,
.notes-tab-keep-btn.keep-active {
    opacity: 1;
}
.notes-tab-keep-btn.keep-active {
    color: var(--accent);   /* uses existing CSS var — never hardcode */
}

/* Sync now button in header */
.notes-keep-sync-btn {
    color: var(--accent);
}
```

---

### 7. `index.html`

Add `keep-sync.js` to the load order, immediately after `domain/note/domain.js`:

```html
<script src="/domain/note/domain.js"></script>
<script src="/domain/note/keep-sync.js"></script>   <!-- NEW -->
<script type="module" src="/domain/note/codemirror.js"></script>
```

---

## Implementation Order

1. `domain/core/state.js` — add `ICONS.keepSyncOff / keepSyncOn / keepSyncing`
2. `domain/persistence/sync.js` — add Keep scope; update save/load for `keepLabelId`
3. `domain/note/keep-sync.js` — create file with all Keep API functions
4. `domain/note/domain.js` — add `keepSync`/`keepNoteId` to `addNote()`; wire CRUD hooks
5. `domain/note/domain.js` — add cloud button to `_buildNotesTabs()`; add "Sync now" to header
6. CSS — style for cloud button and sync-now button
7. `index.html` — add `keep-sync.js` to load order

---

## Edge Cases & Notes

| Scenario | Handling |
|----------|----------|
| User not logged in, tries to enable Keep sync | Toast: "Log in to Google first". Toggle does not flip. |
| Token lacks Keep scope (existing user pre-re-auth) | 403 on first Keep API call → toast "Re-authenticate to enable Keep sync" |
| Keep note deleted manually in Keep | Next sync creates a fresh one (the DELETE on old ID gets 404, ignored) |
| Note deleted locally while debounce timer pending | Timer fires, `findNote()` returns null — guard added at top of `syncNoteToKeep` |
| `keepLabelId` label deleted in Keep | Create label returns a new ID; store new ID in syncSettings |
| Multiple rapid edits | Per-note debounce (5s) — only last edit triggers a Keep sync |
| Notes in trash | `notesTrash` entries are NOT synced. Keep note is deleted when note moves to trash. |
