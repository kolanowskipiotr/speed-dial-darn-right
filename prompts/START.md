# Speed Dial Darn Right — Project Instructions

Self-hosted browser speed-dial page. Pure HTML/CSS/JS served by nginx in Docker. No framework, no build step.

---

## Collaboration

If the user proposes a solution and a better alternative exists, say so before implementing. Explain why briefly, then ask which to proceed with or make a recommendation. Do not silently implement a suboptimal approach.

---

## Key rules

- No build step for app code — file changes in the mounted Docker volume are live immediately.
- External dependencies are vendored — downloaded and bundled during the Docker build process (into `/vendor/`) to enable offline usage. Managed by `scripts/bundle.mjs` and an Import Map in `index.html`.
- Domain-Driven Design (DDD) — all features are organized in `domain/`.
- All CRUD follows: mutate `data` → `saveData()` → `render()`.
- `saveData()` automatically triggers an async background sync to Google Drive via the `uploader` service.
- Use existing CSS variables, never hardcode colours.
- Never hardcode emoji strings outside of data definitions — always use `ICONS.*` from `domain/core/state.js`.

---

## Domain file map

```
index.html              — nginx SSI root: imports all partials, vendors, and scripts

domain/core/            — shared foundation
  state.js              — ICONS, EMOJI_*, all mutable global state (data, activeTabId,
                          activeTodoListId, editingTodoItemId, activeNoteId, editMode, …)
  themes.js             — theme definitions, applyTheme(), loadTheme()
  utils.js              — uid(), image upload/delete helpers, showToast(), showConfirm()
  tokens.css            — CSS variables and theme tokens
  base.css              — CSS reset and body defaults
  layout.css            — main grid layout and shared containers
  animations.css        — shared keyframes and transitions
  style.css             — deprecated stub only; do not add styles here

domain/persistence/
  domain.js             — loadData(), saveData(), migration, getActiveTab()
  export.js             — exportData(), importData(), background GDrive sync trigger
  sync.js               — sync settings CRUD, UI updaters, initSyncConfig(), handleSyncError()
  sync-auth.js          — initGis(), fetchFreshToken(), scheduleTokenRefresh(), loginGDrive()
  sync-backup.js        — folder/backup management, triggerManualSync(), checkAutoSync()
  modal-data.html       — unified Data Management modal (GDrive auth, backups, Keep sync)
  styles.css            — data modal layout styles

domain/dial/
  domain.js             — Tab/Group/Dial CRUD, toggleEditMode(), saveDial()
  render-dials.js       — makeDialCard(), escHtml()
  view.js               — render(), renderTabs(), renderHomeTab(), updateClock()
  drag-drop.js          — drag & drop for dials and groups
  modal-dial.html       — add/edit dial form
  modal-tab.html        — add/edit tab form
  modal-group.html      — add/edit group form
  styles.css            — dial cards, grids, dial animations

domain/todo/
  helpers.js            — module state vars (todoFullScreen, expandedItemId, drag state)
                          and helpers (findTodoList, findTodoItem, getFirstLine, …)
  render.js             — renderTodoPanel(), _makeTodoItemRow() (inline-edit input when expanded)
  crud.js               — list/item CRUD, saveTodoItem(), toggleTodoDone()
  editor.js             — openItemEditor(), full CodeMirror editor, image paste/drop
  drag.js               — _reorderTodoItem(), _reorderTodoList()
  codemirror.js         — (ES module) CodeMirror 6 bridge → window.TodoCM
  modal-list.html       — add/edit todo list
  modal-move.html       — move todo item between lists
  styles.css            — todo panel, accordion, items, inline content
  editor.css            — item editor split view, fullscreen, divider

domain/note/
  helpers.js            — module state vars (_notesSplitInstance, _notesTrashOpen, …)
                          and helpers (findNote, _noteExcerpt, _purgeOldTrash, …)
  render.js             — renderNotesPanel(), _buildNotesTabs(), mermaid helpers
  crud.js               — note CRUD, trash, rename, Keep modals, _notesCMDocChange
  keep-sync.js          — Google Keep bidirectional sync (push/pull/conflict)
  codemirror.js         — (ES module) CodeMirror 6 bridge → window.NotesCM
  modal-conflict.html   — 3-pane Keep conflict merge UI
  modal-import-keep.html — import notes from Google Keep
  styles.css            — note tabs, CM6 host, markdown preview, Mermaid, split gutter
  keep-sync.css         — Keep sync dot, cloud toggle, conflict modal layout

domain/ui/
  init.js               — DOMContentLoaded bootstrap, global event listeners
  search.js             — global search across dials, todos, and notes
  pickers.js            — emoji and favicon picker UI
  logo-animation.js     — page-load logo crash animation
  emoji-synonyms.js     — EMOJI_SYNONYMS map for enhanced search
  header.html           — logo, clock, search, edit bar, tab navigation
  main.html             — #groupsContainer and global toast
  modal-confirm.html    — shared delete confirmation dialog
  header.css            — header layout, clock, search, edit mode bar
  modals.css            — modal backdrops, containers, form elements
  pickers.css           — emoji, color, and favicon picker styles

nginx.conf              — static serving + /data/, /uploads/, /api/upload/ proxy
docker-compose.yml      — production base: speed-dial nginx + uploader Node sidecar
docker-compose.override.yml — dev-only source mounts (auto-merged by docker compose up)
Dockerfile              — multi-stage: vendors dependencies, then nginx:1.27-alpine
uploader/server.js      — tiny Node HTTP server (port 3001): POST/DELETE /upload/<id>
Formula/speed-dial-darn-right.rb — Homebrew formula (launchd/systemd via brew services)
```

---

## Compose file split

- `docker-compose.yml` — production base (no dev mounts); used by Homebrew formula and manual prod deploys.
- `docker-compose.override.yml` — dev-only source mounts; automatically merged by `docker compose up` during development.
- Never add dev mounts back to `docker-compose.yml`.

---

## Distribution

- `Formula/speed-dial-darn-right.rb` — Homebrew formula; supports macOS (launchd) and Linux (systemd --user) via `brew services`.
- Replace `GITHUB_USER` placeholder before publishing.
- See README for the release checklist (tag → sha256 → fill formula).

---

## After every confirmed task

**Always update `prompts/knowledge/` to reflect any changes made.**
The user confirms when a task is done — that is the trigger to update the relevant knowledge file(s).
If no existing file fits, create a new one and add it to the table below.

---

## Knowledge files

| File | Read when… |
|------|-----------|
| `prompts/knowledge/DATA_MODEL.md` | Touching data persistence, localStorage schema, tab/group/dial structure |
| `prompts/knowledge/JS_APP.md` | Any JS logic work — module map, global state, render pipeline |
| `prompts/knowledge/CSS_STYLES.md` | Any styling work — section map, CSS variables reference |
| `prompts/knowledge/HTML_MODALS.md` | Modifying modals or form inputs |
| `prompts/knowledge/DOCKER.md` | Deployment, nginx config, uploader sidecar, volumes |
| `prompts/knowledge/PATTERNS.md` | Before implementing any new feature — conventions and checklist |
| `prompts/knowledge/TESTING_GUIDE.md` | Running tests, test structure, troubleshooting test failures |
| `prompts/knowledge/M365_CALENDAR.md` | M365 calendar widget — debugging agenda display, ICS parsing, event filtering, CSS popover issues |
