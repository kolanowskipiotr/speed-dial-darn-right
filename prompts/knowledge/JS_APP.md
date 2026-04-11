# JS Modules & Domain Structure — Reference

The application is organized into domains following Domain-Driven Design (DDD) principles. All files share the global scope (except for CodeMirror modules).

## Domain Map

### core
- `domain/core/state.js` — Single source of truth for emojis, icons, and **all** mutable global state. Includes dial/tab vars (`activeTabId`, `editMode`, `editingDialId`, …), todo vars (`activeTodoListId`, `editingTodoListId`, `editingTodoItemId`), and note vars (`activeNoteId`, `notesFullScreen`, `_notesSearchHighlight`). Domain-level `helpers.js` files declare only their own module-private state.
- `domain/core/themes.js` — Theme definitions, loading, and application logic.
- `domain/core/utils.js` — Shared utility functions (UID, image resizing, uploads, toasts, confirms).

### persistence
- `domain/persistence/domain.js` — Data loading, saving, and format migration.
- `domain/persistence/export.js` — Unified export logic, import processing, and GDrive background sync.

### persistence (sync)
- `domain/persistence/sync.js` — Constants, state vars, DOM refs, `initSyncConfig`, settings CRUD, all UI updaters, `handleSyncError`, toggle functions.
- `domain/persistence/sync-auth.js` — GIS init (`initGis`), `fetchFreshToken`, `scheduleTokenRefresh`, `loginGDrive`, `logoutGDrive`.
- `domain/persistence/sync-backup.js` — Folder & backup management (`fetchGDriveFolders`, `onFolderSelected`, `fetchGDriveBackups`, `renderBackupList`, `restoreFromGDrive`), `applyDiff`, `triggerManualSync`, `checkAutoSync`, `createBackupFolder`, and backend API call helpers.

### dials
- `domain/dial/domain.js` — CRUD logic for Tabs, Groups, and Dials.
- `domain/dial/render-dials.js` — `makeDialCard()` (full card builder for home and regular tabs) and `escHtml()`.
- `domain/dial/view.js` — `renderTabs`, `renderHomeTab`, `render`, `updateClock`, `updateDialCount`, `updateTabSizeSlider`, `trackDialVisit`.
- `domain/dial/drag-drop.js` — Drag and drop orchestration for dials and groups.

### todo
- `domain/todo/helpers.js` — Module state vars (`todoFullScreen`, `expandedItemId`, drag state) and shared helpers (`findTodoList`, `findTodoItem`, `extractUploadIds`, `getFirstLine`, `_getRawFirstLine`, `_replaceFirstLine`, `_getTodoContainer`).
- `domain/todo/render.js` — `renderTodoPanel`, `_renderTodoAccordion`, `_renderTodoItems`, `_makeTodoItemRow`. When a todo item is expanded (`expandedItemId === item.id`), the first-line span is replaced with a `<input class="todo-item-first-line-edit">` showing the raw (unstripped) first line. Blur saves silently; Enter saves + collapses; Escape discards + collapses. Auto-focus fires via `setTimeout` after row is inserted.
- `domain/todo/crud.js` — List CRUD (`openTodoListModal`, `saveTodoList`, `deleteTodoListFromModal`), item add (`addTodoItem`), item CRUD (`saveTodoItem`, `toggleTodoDone`, `deleteTodoItem`, `moveTodoItemToPosition`), and move-between-lists (`openTodoMoveModal`, `moveTodoItem`).
- `domain/todo/editor.js` — Item editor (`openItemEditor`, `_renderItemEditor`, `closeItemEditor`), image paste/drop (`_handleTodoImagePaste`, `_uploadTodoImage`), fullscreen (`toggleTodoFullScreen`, `exitTodoFullScreen`).
- `domain/todo/drag.js` — `_clearTodoDragIndicators`, `_reorderTodoItem`, `_reorderTodoList`.
- `domain/todo/codemirror.js` — (Module) CodeMirror 6 bridge for todo item editing.

### notes
- `domain/note/helpers.js` — Module state vars (`_notesSplitInstance`, `_notesTrashOpen`, etc.) and shared helpers (`findNote`, `_findTrashNote`, `_noteExcerpt`, `_purgeOldTrash`, etc.).
- `domain/note/render.js` — `renderNotesPanel`, `_buildNotesTabs`, mermaid helpers (`_renderMermaidPreview`, `_applyMermaidInMarkdown`), `_initPreviewSplit`.
- `domain/note/crud.js` — Note CRUD (`openNoteTab`, `addNote`, `deleteNote`, `restoreNote`, `permanentlyDeleteNote`, `emptyTrash`), trash panel (`_buildTrashPanel`), rename/language/fullscreen, Keep modals (`_openConflictModal`, `_openImportKeepModal`), `startNoteTabRename`, and window callbacks (`_notesCMDocChange`, `_notesUploadImage`).
- `domain/note/keep-sync.js` — Logic for Google Keep bidirectional synchronization.
  - **Atomic Sync Lock**: Uses `_keepSyncInFlight` (Set) to prevent concurrent push/pull operations for the same note.
  - **Metadata Handling**: Notes are identified in Keep via a first-line `speed-dial:{id}` header. This is stripped by `_decodeKeepBody()` before showing in the UI or conflict modal.
  - **API Wrapper**: `_keepFetch()` centralizes Keep API calls, handling authentication errors (401/403) via the unified `handleSyncError()` in `sync.js`. Sends both `Authorization: Bearer` and `X-Access-Token` headers for proxy compatibility.
  - **Conflict Resolution**: Detected during polling if `keepLocalDirty` is true and Keep `updateTime` has changed. Resolved via a 3-pane merge modal.
  - **⚠️ KNOWN LIMITATION (confirmed 2026-04-11)**: The `https://www.googleapis.com/auth/keep` OAuth scope is a **Google Workspace-restricted scope**. It cannot be added to the OAuth consent screen for personal Gmail accounts (Google rejects it as "invalid" in GCP console). Keep sync is therefore **non-functional** for personal accounts. The scope is commented out in `sync.js`. The Keep sync UI code remains in place for potential future use (e.g., if Google opens access or a service account approach is implemented).
- `domain/note/codemirror.js` — (Module) CodeMirror 6 bridge for note editing.
- Mermaid.js is vendored at `vendor/mermaid.min.js` and initialized with `startOnLoad: false` in `index.html`. Mermaid diagrams render in two contexts: (1) `language === 'mermaid'` notes show a full live split-pane preview; (2) fenced `mermaid` code blocks inside markdown notes are replaced with rendered SVGs via `_applyMermaidInMarkdown()`. The `_renderMermaidPreview()` async helper uses a render token to discard stale results. `_initPreviewSplit()` supersedes the former `_initMarkdownSplit()` and handles both `markdown` and `mermaid` note types.

### ui
- `domain/ui/init.js` — Bootstrap logic, global event listeners, and Safari focus fix.
- `domain/ui/search.js` — Global search functionality across dials, todos, and notes.
- `domain/ui/pickers.js` — Emoji and Favicon picker UI management.
- `domain/ui/logo-animation.js` — Page-load logo crash animation.
- `domain/ui/emoji-synonyms.js` — Search synonym map for emojis.

---

## Load Order (index.html)

1. `domain/core/state.js`
2. `domain/core/themes.js`
3. `domain/core/utils.js`
4. `domain/persistence/domain.js`
5. `domain/persistence/sync.js`
6. `domain/persistence/sync-auth.js`
7. `domain/persistence/sync-backup.js`
8. `domain/persistence/export.js`
9. `domain/ui/emoji-synonyms.js`
10. `domain/ui/pickers.js`
11. `domain/ui/logo-animation.js`
12. `domain/ui/search.js`
13. `domain/todo/helpers.js`
14. `domain/todo/render.js`
15. `domain/todo/crud.js`
16. `domain/todo/editor.js`
17. `domain/todo/drag.js`
18. `domain/todo/codemirror.js` (module)
19. `domain/note/helpers.js`
20. `domain/note/render.js`
21. `domain/note/crud.js`
22. `domain/note/keep-sync.js`
23. `domain/note/codemirror.js` (module)
24. `domain/dial/domain.js`
25. `domain/dial/render-dials.js`
26. `domain/dial/view.js`
27. `domain/dial/drag-drop.js`
28. `domain/ui/init.js`

---

## Core Patterns

### CRUD Loop
`mutate state` → `saveData()` → `render()`

`saveData()` automatically triggers a debounced background sync to the `uploader` service, which handles Google Drive backups.

### Render Pipeline
`render()` (in `view.js`) performs a full DOM rebuild of the active tab.
- If `tab.isHome`, it delegates to `renderHomeTab()`.
- Home tab combines Dials (Most/Recently used), Todo Panel, and Notes Panel.

### Safari Focus Fix
`domain/ui/init.js` explicitly blurs any focused element on load and delays `initSearch()` to ensure Safari's address bar retains focus on new tabs.

### GDrive Sync (Unified Export)
`domain/persistence/export.js` generates a standard JSON export object including all configuration and base64-encoded images. The `uploader` sidecar compares this with the latest full backup on GDrive to decide between an incremental (diff) or full upload.

### GDrive Auth & Token Refresh (`domain/persistence/sync.js`)
- Uses Google Identity Services (GIS) implicit flow — access tokens only, no refresh tokens.
- `tokenExpiry` (ms timestamp) is stored in localStorage alongside the access token.
- Uses **GIS Authorization Code flow** (`initCodeClient`, `ux_mode: 'popup'`). The one-time login popup sends an authorization code to the frontend, which POSTs it to `POST /api/sync/auth` on the uploader sidecar. The sidecar exchanges it (with the client secret) for an access token + refresh token, stores the refresh token in `/uploads/refresh_token.json`, and returns `{ access_token, expiry, email }`.
- **Background token refresh** works via `GET /api/sync/auth/token` — a plain HTTP call to the sidecar, which uses the stored refresh token to get a fresh access token from Google. No popup, no user gesture needed. Called on every page load and scheduled ~5 minutes before expiry via `scheduleTokenRefresh()`.
- `fetchFreshToken()` in `sync.js` calls the endpoint, updates `currentAccessToken`/`tokenExpiry` in memory + localStorage, reschedules the timer, and returns `true`/`false`.
- Required env vars for the uploader sidecar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Set in `.env` and referenced in both `docker-compose.yml` and `docker-compose.override.yml`.
- The refresh token is stored at `/uploads/refresh_token.json` (persistent Docker volume, not in localStorage).
- Four LED indicator buttons (`.gdrive-indicators` cluster in the header, between search and edit toggle) show sync state at a glance: (1) GDrive connected, (2) token fresh, (3) daily auto-backup on, (4) manage-on-disconnect on. All four are driven by `updateSyncIndicators()` in `sync.js`, called from `updateAuthUI()`, `toggleAutoSync()`, `toggleShowModalOnDisconnect()`, and `loadSyncSettings()`. Clicking any dot opens the data modal.
- Auth errors (401) clear **both** `googleUser` and `currentAccessToken` to keep state consistent. `updateSyncConfigUI()` gates on `googleUser && currentAccessToken` so the folder/backup section is always hidden when either is missing.
- `loadSyncSettings()` does **not** call `fetchGDriveFolders`/`fetchGDriveBackups` — these run after token confirmation in `initGis()` callback to prevent showing data with a stale token.
- `checkAutoSync()` is **not** called from `initSyncConfig()` — it is called only from within `initGis()` once the token is confirmed valid (or just refreshed). This prevents using a stale stored token.
- `backupInProgress` flag is set to `true` during any backup fetch. A `beforeunload` listener (registered in `initSyncConfig`) blocks tab/window close while this is `true`.
