# Tasks Sync Implementation Plan

**Status:** Planning
**Date:** 2026-04-11
**Context:** Migration from Google Keep API (Workspace-restricted) to Google Tasks API (personal Gmail-friendly)

---

## Problem Statement

Google Keep API requires Google Workspace ($6/month) — not available for personal Gmail accounts. Need alternative for note sync that:
1. Works with personal Gmail accounts (no Workspace requirement)
2. Handles long notes (15+ KB) via chunking
3. Uses dedicated task list to avoid namespace collisions with user's own tasks
4. Supports bidirectional sync + conflict detection

**Solution:** Google Tasks API + dedicated "SDDR - Notes" list + content chunking (max ~7.5 KB per task)

---

## Architecture

### Task List Structure

**List Name:** `SDDR - Notes`
**Purpose:** Isolated namespace for all synced notes from Speed Dial Darn Right

**Task Format:**
```
Title: [Note Name] (Part 1/3)
Notes: [up to 7.5 KB of content]
```

Metadata embedded in title: `speed-dial:{noteId}:part{X}/{TOTAL}`

### Chunking Strategy

- **Max task.notes size:** ~7.5 KB (safety margin from API 8 KB limit)
- **Split on save:** If note > 7.5 KB, divide into multiple tasks
- **Delete-then-create:** On update, DELETE all old chunks + POST all new chunks (avoid partial orphans)
- **Merge on read:** Pull all chunks in order (1/3, 2/3, 3/3) and concatenate

---

## Implementation Phases

### Phase 1: Setup & OAuth (30 min)

**Tasks:**
- [x] Add `https://www.googleapis.com/auth/tasks` to `SCOPES` in `sync.js`
- [ ] Add Tasks scope to GCP OAuth Consent Screen → Data Access → "Manually add scopes"
  - Filter clear, paste: `https://www.googleapis.com/auth/tasks`
  - Click "Add to table" → "Update"
- [ ] Logout & re-login to app (get new token with Tasks scope)
- [ ] Verify token includes Tasks scope (check browser DevTools)

**Files Modified:**
- `domain/persistence/sync.js` — SCOPES array

---

### Phase 2: Backend Proxy (15 min)

**Tasks:**
- [ ] Add `/api/tasks` route in `uploader/server.js`
  - Proxy to `https://www.googleapis.com/tasks/v1`
  - Support: GET (list tasks), POST (create), DELETE, PATCH
  - Fallback token auth: `x-access-token` header (like `/api/sync`)

**Files Modified:**
- `uploader/server.js`

**Example flow:**
```
Client: POST /api/tasks/lists/@default/tasks
  → Headers: Authorization: Bearer ${token}, X-Access-Token: ${token}
  → Body: { title: "...", notes: "..." }

Uploader: proxy to https://www.googleapis.com/tasks/v1/lists/@default/tasks
  → Response: { id: "task123", ... }
```

---

### Phase 3: Tasks Sync Module (2-3h)

**File:** `domain/note/tasks-sync.js` (new)

**State Variables:**
```js
let tasksListId = null;                    // SDDR - Notes list ID
let _tasksSyncInFlight = new Set();        // per-note lock
let _tasksSyncTimers = {};                 // per-note debounce (5s)
```

**Core Functions:**

#### `_getOrCreateTasksList()`
- GET `/api/tasks/lists` (list all task lists)
- Search for `title === "SDDR - Notes"`
- If found: save `tasksListId`, return
- If not found: POST to create list, save `tasksListId`
- Save to localStorage via `saveSyncSettings()`

#### `_chunkContent(text, maxSize = 7500)`
Returns: `{ chunks: [chunk1, chunk2, ...], totalParts: N }`
- Split text on newlines to avoid breaking paragraphs
- Each chunk ≤ maxSize
- Return array with metadata about total parts

#### `_encodeTaskTitle(noteName, partNum, totalParts)`
Returns: `"[Netia] (Part 1/3)  [speed-dial:noteId:1/3]"`
- Human-readable title
- Metadata tag for parsing on read

#### `syncNoteToTasks(note)`
- Lock: `if (_tasksSyncInFlight.has(note.id)) return`
- Check auth: `if (!currentAccessToken) { showToast(...); return }`
- Ensure list: `tasksListId = await _getOrCreateTasksList()`
- Get existing chunks: GET `/api/tasks/lists/{tasksListId}/tasks?q=speed-dial:{noteId}`
- Delete old: `DELETE /api/tasks/lists/{tasksListId}/tasks/{taskId}` for each old chunk
- Create new chunks from `_chunkContent(note.content)`
- For each chunk:
  ```
  POST /api/tasks/lists/{tasksListId}/tasks
  { title: _encodeTaskTitle(...), notes: chunk }
  ```
- Update note metadata:
  ```js
  note.tasksTaskIds = [taskId1, taskId2, ...];
  note.tasksLastSyncedAt = Date.now();
  note.tasksLocalDirty = false;
  saveData();
  ```
- Show toast: `"✓ Synced to Google Tasks"`

#### `debounceTasksSync(note)`
- Clear existing timer: `if (_tasksSyncTimers[note.id]) clearTimeout(...)`
- Set dirty flag: `note.tasksLocalDirty = true`
- Schedule sync: `_tasksSyncTimers[note.id] = setTimeout(() => syncNoteToTasks(note), 5000)`

#### `pollNoteFromTasks(note)`
- Skip if: no token, no `tasksTaskIds`, or `_tasksSyncInFlight.has(note.id)`
- GET `/api/tasks/lists/{tasksListId}/tasks` → filter by `speed-dial:{noteId}`
- Parse chunks in order (1/3, 2/3, 3/3)
- Merge into `remoteContent`
- If `remoteContent === note.content`: return (no change)
- If `note.tasksLocalDirty === false`: auto-pull
  ```js
  note.content = remoteContent;
  note.tasksLastSyncedAt = Date.now();
  saveData();
  showToast(`✓ Note '${note.name}' updated from Google Tasks`);
  ```
- Else: conflict detected
  ```js
  note.tasksConflict = true;
  saveData();
  // Show conflict modal
  ```

#### `pollAllTasksNotes()`
- Filter: `data.notes.filter(n => n.tasksSync && n.tasksTaskIds?.length)`
- Parallel: `Promise.allSettled(notes.map(n => pollNoteFromTasks(n)))`

#### `syncAllTasksNotes()`
- Validate: logged in, has notes with tasksSync enabled
- Parallel sync: `Promise.allSettled(syncedNotes.map(...))`
- Show status

#### `toggleNoteTasksSync(noteId)`
- Toggle `note.tasksSync` flag
- If enabling: sync immediately
- If disabling: delete from Tasks

#### `removeNoteFromTasks(note)`
- DELETE all tasks in `note.tasksTaskIds`
- Clear metadata: `note.tasksTaskIds = null`, `note.tasksLastSyncedAt = null`, etc.
- Save

#### `resolveTasksConflict(noteId, mergedContent)`
- Update note with merged content
- Clear conflict flag
- Call `syncNoteToTasks(note)` to push resolution

---

### Phase 4: UI Integration (1h)

**File Modifications:**

#### `domain/note/crud.js`
- Replace Keep sync toggle with Tasks sync toggle
- Call: `toggleNoteTasksSync(noteId)` instead of `toggleNoteKeepSync(noteId)`
- Update conflict modal → show "Tasks Conflict" header
- Show merge UI (same 3-pane logic)

#### `domain/note/render.js`
- Update `_buildNotesTabs()` — show Tasks cloud icon if `note.tasksSync`
- Update polling: call `pollAllTasksNotes()` on focus instead of Keep

#### `domain/note/helpers.js`
- Update `_getNotesContainer()` logic if needed
- Ensure Tasks metadata fields are recognized

#### `domain/persistence/sync.js`
- Add state: `let tasksListId = null`
- Update `loadSyncSettings()` to restore `tasksListId`
- Update `saveSyncSettings()` to persist `tasksListId`

#### `index.html`
- Load `domain/note/tasks-sync.js` instead of (or alongside) `keep-sync.js`
- Note: keep-sync.js can stay for reference/future Google Workspace support

---

### Phase 5: Storage & Settings (30 min)

**localStorage keys added:**
```js
{
  // ... existing sync settings ...
  tasksListId: "tasksListIdFromGoogle",
}
```

**Note object fields:**
```js
{
  name: "Netia",
  content: "...",

  // Tasks sync metadata
  tasksSync: false,              // enable/disable
  tasksTaskIds: ["id1", "id2"], // array of Task IDs
  tasksLastSyncedAt: 1712864200000,
  tasksLocalDirty: false,        // local changes pending
  tasksConflict: false,          // conflict detected
}
```

---

### Phase 6: Testing & Debug (1-1.5h)

**Test Cases:**

1. **Initialization**
   - [ ] Login with new Tasks scope
   - [ ] Verify SDDR - Notes list created in Google Tasks
   - [ ] Verify `tasksListId` saved to localStorage

2. **Short note sync (< 7.5 KB)**
   - [ ] Create note "Netia" with small content
   - [ ] Click Tasks sync icon
   - [ ] Verify task appears in Google Tasks (1 task, no chunking)
   - [ ] Edit note locally, verify delete-create pattern

3. **Long note sync (> 7.5 KB)**
   - [ ] Create note "LongNote" with 15 KB content
   - [ ] Click sync
   - [ ] Verify 2-3 tasks created in Google Tasks
   - [ ] Check titles: `[LongNote] (Part 1/2)`, `[LongNote] (Part 2/2)`
   - [ ] Edit local content → verify all old tasks deleted + new tasks created

4. **Pull from Tasks**
   - [ ] Edit task in Google Tasks app (add text to `notes` field)
   - [ ] Return to Speed Dial, click note tab → trigger poll
   - [ ] Verify content updated (no local changes = auto-pull)

5. **Conflict Detection**
   - [ ] Edit note locally (set `tasksLocalDirty = true`)
   - [ ] Edit task in Google Tasks simultaneously
   - [ ] Poll → conflict modal appears
   - [ ] Merge & resolve → sync back to Tasks

6. **Cleanup**
   - [ ] Delete note locally → verify all tasks deleted from list
   - [ ] Toggle sync OFF → verify tasks deleted

---

### Phase 7: Documentation (30 min)

**Files:**

#### `prompts/knowledge/JS_APP.md`
Update note section:
```md
- `domain/note/tasks-sync.js` — Google Tasks bidirectional sync (replaces Keep API).
  - **Chunking**: Notes > 7.5 KB split across multiple tasks in "SDDR - Notes" list
  - **Delete-create pattern**: Updates always DELETE old chunks + POST new (avoid orphans)
  - **Namespace isolation**: Dedicated task list prevents collision with user's own tasks
  - **Metadata**: Encoded in task titles (`[noteName] (Part X/Y)  [speed-dial:id:X/Y]`)
```

#### `sync.js` comment
```js
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/tasks',
    // NOTE: Google Keep API (https://www.googleapis.com/auth/keep) is Workspace-only.
    // Replaced with Tasks API for personal Gmail account support (see tasks-sync.js).
];
```

---

## Rollout Strategy

1. **Local test** — Verify all 6 test cases on dev machine
2. **Deploy** — Merge to main, rebuild Docker image
3. **User rollout** — Tell user to login again (get new Tasks scope)
4. **Monitor** — Check browser console for any chunking/sync errors

---

## Known Limitations & Future Improvements

### Limitations
- Tasks field max ~8 KB → content truncated if > N chunks' worth
- Conflict modal (same 3-pane merge from Keep sync) requires manual resolution
- No automatic background sync (only on focus, like Keep)

### Future Improvements
- Add "watch" mode (push-to-Tasks on every keystroke, not just 5s debounce)
- Implement automatic conflict resolution (last-write-wins)
- Add progress indicator for long notes (X of Y chunks synced)
- Consider Tasks subtasks for hierarchical note structure (future)

---

## Success Criteria

- ✓ Personal Gmail account can sync notes to Google Tasks without Workspace
- ✓ Notes > 8 KB split into chunks correctly
- ✓ Updates delete old chunks + create new (no orphans)
- ✓ Conflict detection works
- ✓ UI shows Tasks icon, not Keep icon
- ✓ All 6 test cases pass

