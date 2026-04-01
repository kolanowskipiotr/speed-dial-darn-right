# JS Modules & Domain Structure — Reference

The application is organized into domains following Domain-Driven Design (DDD) principles. All files share the global scope (except for CodeMirror modules).

## Domain Map

### core
- `domain/core/state.js` — Single source of truth for emojis, icons, and mutable global state.
- `domain/core/themes.js` — Theme definitions, loading, and application logic.
- `domain/core/utils.js` — Shared utility functions (UID, image resizing, uploads, toasts, confirms).

### persistence
- `domain/persistence/domain.js` — Data loading, saving, and format migration.
- `domain/persistence/export.js` — Unified export logic, import processing, and GDrive background sync.

### dials
- `domain/dial/domain.js` — CRUD logic for Tabs, Groups, and Dials.
- `domain/dial/view.js` — Rendering pipeline for dials grids, tab bars, and the Home tab.
- `domain/dial/drag-drop.js` — Drag and drop orchestration for dials and groups.

### todo
- `domain/todo/domain.js` — CRUD and logic for Todo Lists and Todo Items.
- `domain/todo/codemirror.js` — (Module) CodeMirror 6 bridge for todo item editing.

### notes
- `domain/note/domain.js` — Logic for Note management, tabs, and Trash system.
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
5. `domain/persistence/export.js`
6. `domain/ui/emoji-synonyms.js`
7. `domain/ui/pickers.js`
8. `domain/ui/logo-animation.js`
9. `domain/ui/search.js`
10. `domain/todo/domain.js`
11. `domain/todo/codemirror.js` (module)
12. `domain/note/domain.js`
13. `domain/note/codemirror.js` (module)
14. `domain/dial/domain.js`
15. `domain/dial/view.js`
16. `domain/dial/drag-drop.js`
17. `domain/ui/init.js`

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
