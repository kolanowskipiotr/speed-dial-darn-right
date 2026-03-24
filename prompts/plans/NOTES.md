# Plan: Notes

**Status:** Ready to implement — all decisions made
**Date:** 2026-03-24

---

## Overview

A Sublime-style multi-tab text/code/markdown editor embedded in the right column of the home tab.
Replaces the "Coming soon" placeholder in `.home-col-notes`.
Can go full-screen (same mechanism as Todo — `body.notes-fullscreen` CSS class).
Mutually exclusive with todo full-screen: entering one exits the other.

---

## Libraries (all plugin-covered — no from-scratch editor behavior)

| Feature | Plugin | Source |
|---|---|---|
| Line numbers | `lineNumbers()` from `@codemirror/view` | esm.sh (pinned after impl) |
| Syntax highlighting | `@codemirror/lang-markdown/json/xml/html/javascript` | esm.sh (pinned) |
| Multi-cursor: select next occurrence (Ctrl+D) | `selectNextOccurrence` from `@codemirror/commands` | esm.sh (pinned) |
| Multi-cursor: add cursor above/below | `addCursorDown`/`addCursorUp` from `@codemirror/commands` | esm.sh (pinned) |
| Rectangular/column selection | `rectangularSelection()` from `@codemirror/view` | esm.sh (pinned) |
| Find / Find+Replace (case-insensitive, regex) | `@codemirror/search` with `searchKeymap` | esm.sh (pinned) |
| Dark editor theme | `@codemirror/theme-one-dark` | esm.sh (pinned) |
| Light editor theme | CM6 default | builtin |
| Theme hot-swap when app theme changes | CM6 `Compartment` API | builtin |
| Draggable split divider | `split.js` (creates and owns gutter element) | jsDelivr CDN |
| Markdown preview | `marked.js` | already loaded |

**Version pinning:** After the first working implementation, pin all `@6` imports to exact versions (e.g. `@6.0.1`).

---

## Data model

New top-level key `data.notes[]` alongside `data.tabs` and `data.todoLists`:

```js
{
  id:        string,   // uid()
  name:      string,   // tab label
  content:   string,   // raw text; images as ![alt](/uploads/id.ext)
  language:  'markdown' | 'json' | 'xml' | 'html' | 'javascript' | 'text',
  order:     number,   // integer, 0-based; sorted ascending; drag-to-reorder
  createdAt: string,   // ISO 8601
  updatedAt: string,   // ISO 8601
}
```

No `images[]` array — image refs live inline in `content` as `![alt](/uploads/id.ext)`.
`activeNoteId` is JS-only state — never persisted.

**Migration in `loadData()`:** after the existing `todoLists` migration block:
```js
if (!data.notes) {
  const now = new Date().toISOString();
  data.notes = [{ id: uid(), name: 'Note 1', content: '', language: 'markdown', order: 0, createdAt: now, updatedAt: now }];
  saveData();
}
```

---

## New files

| File | Type | Purpose |
|---|---|---|
| `js/notes-cm.js` | ES module | CM6 editor — exposes `window.NotesCM`, fires `notescmready` event |
| `js/notes.js` | Classic script | Panel logic: CRUD, tabs, drag-reorder, image upload, search hookup |
| `css/notes.css` | CSS | All notes styles (loaded after `todo.css`) |

---

## Files touched

| File | Change |
|---|---|
| `js/render.js` | Replace "Coming soon" placeholder with `renderNotesPanel(notesCol)` |
| `js/state.js` | Add `activeNoteId`, `notesFullScreen`, `_notesSearchHighlight`; extend `ICONS` |
| `js/persistence.js` | Add `data.notes` migration block |
| `js/themes.js` | One line at end of `applyTheme()`: `if (window.NotesCM) NotesCM.setTheme(isDark)` |
| `js/search.js` | Add note result type + `jumpToNote()` |
| `js/init.js` | Extend Escape handler for notes fullscreen mutual exclusion |
| `js/pickers.js` | Extend `exportData()` + `_doImport()` to include `data.notes` and note images |
| `index.html` | Add `split.js` script, `notes.css` link, `notes.js` script, `notes-cm.js` module |

---

## `js/notes-cm.js` — CM6 bridge (ES module)

### Async loading fix — `notescmready` event

ES modules load asynchronously. `notes.js` (classic) may call `renderNotesPanel()` before CM6 finishes loading.
Fix: at the end of `notes-cm.js`, after `window.NotesCM` is set:
```js
document.dispatchEvent(new CustomEvent('notescmready'));
```

In `renderNotesPanel()`, mount the editor defensively:
```js
if (window.NotesCM) {
  NotesCM.mount(cmHostEl, note.content, note.language, _isAppDark());
} else {
  document.addEventListener('notescmready', function h() {
    document.removeEventListener('notescmready', h);
    const host = document.querySelector('.notes-cm-host');
    const n = findNote(activeNoteId);
    if (host && n) NotesCM.mount(host, n.content, n.language, _isAppDark());
  }, { once: true });
}
```
Single code path. No fallback textarea. No flicker. Panel shell renders immediately; editor mounts as soon as CM6 is ready.

### `window.NotesCM` API

```js
mount(hostEl, content, language, isDark)  // creates EditorView
destroy()                                 // tears down EditorView
getValue()                                // returns doc string
setValue(content)                         // full-doc replace transaction
setLanguage(lang)                         // Compartment reconfigure
setTheme(isDark)                          // Compartment reconfigure
focusAndHighlight(query)                  // open search panel with query pre-filled
insertAtCursor(text)                      // insert text at current cursor (for image upload)
```

### Extensions on mount

- `lineNumbers()`
- `history()`
- `drawSelection()`
- `rectangularSelection()`
- `EditorView.lineWrapping`
- `search({ top: false })` — find/replace panel docked at bottom
- `_langCompartment.of(langExtension(language))`
- `_themeCompartment.of(isDark ? oneDark : [])`
- `keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, { key: 'Mod-d', run: selectNextOccurrence }])`
- `EditorView.domEventHandlers({ paste: handleImagePaste, drop: handleImageDrop })`
- `EditorView.updateListener` → debounced (300ms) → `window._notesCMDocChange(content)`

### Image paste/drop handler

Only activates when `note.language === 'markdown'`. For other languages, default CM6 paste applies (text only).

```js
function handleImagePaste(event, view) {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find(i => i.type.startsWith('image/'));
  if (!imageItem) return false;
  event.preventDefault();
  const file = imageItem.getAsFile();
  if (file) window._notesUploadImage(file, view);
  return true;
}
// Same shape for handleImageDrop using event.dataTransfer.files[0]
```

### `langExtension(lang)` helper

```js
function langExtension(lang) {
  switch (lang) {
    case 'markdown':   return markdown();
    case 'json':       return json();
    case 'xml':        return xml();
    case 'html':       return html();
    case 'javascript': return javascript();
    default:           return [];
  }
}
```

---

## `js/notes.js` — panel logic (classic script)

### State variables (module-level, not in state.js)

```js
let _notesSplitInstance = null;    // split.js instance
let _notesPreviewEl = null;        // .notes-preview DOM element ref
```

### `renderNotesPanel(container)`

Builds full panel DOM, then mounts CM6 (with `notescmready` guard).

Panel structure:
```
.notes-panel
  .notes-panel-header
    .notes-panel-title          (📝 Notes)
    .notes-panel-header-actions
      button.notes-add-btn      (+  add note)
      button.notes-info-btn     (ℹ  hover tooltip)
      button.notes-fullscreen-btn  (⤢/⛶)
  .notes-tabs-bar
    [one .notes-tab per note, sorted by order]
  .notes-toolbar
    [lang buttons: .txt .md .json .xml .js .html]
    button.notes-img-btn        (📎  opens hidden file input)
    input[type=file,accept=image/*,hidden]
  .notes-split-host
    .notes-cm-host
    [.notes-preview — markdown language only; hidden otherwise]
```

If `language === 'markdown'`: after CM6 mounts, call `_initMarkdownSplit()`.

### Note tabs — `|Note name [x]|`

Each `.notes-tab` element:
- `draggable="true"`
- Contains `.notes-tab-name` span + `.notes-tab-close` button (`×`)
- Click → `openNoteTab(id)` (saves current editor content first)
- **Double-click on `.notes-tab-name`** → `startNoteTabRename(id)` (inline input)
- Click `×` → `deleteNote(id)` (blocked if only 1 note remains; uses `showToastUndo`)

### Tab drag-to-reorder

HTML5 drag on the horizontal tab bar (same pattern as todo list reorder, adapted for horizontal):
- `dragstart` → store `_notesDragId`
- `dragover` → left/right drop indicator on target tab
- `drop` → recompute `order` values sequentially, `saveData()`, re-render tabs bar only (not full panel)

**Known limitation:** no auto-scroll near overflow edge. Acceptable for initial implementation.

### Key functions

```js
findNote(id)                     // data.notes.find(n => n.id === id)
openNoteTab(noteId)              // save current, set activeNoteId, re-render panel
addNote()                        // create note, set active, save, re-render, trigger rename
deleteNote(noteId)               // blocked if last note; showToastUndo; re-render
renameNote(noteId, newName)      // save, re-render tabs bar only
startNoteTabRename(noteId)       // replace .notes-tab-name span with inline <input>
setNoteLanguage(lang)            // save language, full re-render (split appears/disappears)
toggleNotesFullScreen()          // toggles notesFullScreen + body.notes-fullscreen;
                                 // exits todo fullscreen first if active (mutual exclusion)
_renderNotesTabs(container)      // partial re-render of tabs bar only (used after rename/reorder)
_initMarkdownSplit()             // initialise split.js on .notes-split-host children;
                                 // render initial marked.js preview
_isAppDark()                     // !document.body.dataset.theme?.startsWith('light')
```

### `_initMarkdownSplit()`

Let split.js create and own the gutter element (simpler and more reliable):
```js
function _initMarkdownSplit() {
  const cmHost = document.querySelector('.notes-cm-host');
  const preview = document.querySelector('.notes-preview');
  if (!cmHost || !preview || typeof Split === 'undefined') return;
  _notesPreviewEl = preview;
  const note = findNote(activeNoteId);
  if (note) preview.innerHTML = marked.parse(note.content || '');
  _notesSplitInstance = Split([cmHost, preview], {
    sizes: [50, 50],
    minSize: [120, 120],
    gutterSize: 5,
    direction: 'horizontal',
  });
}
```

### Window callbacks (set by notes.js, called by notes-cm.js)

```js
// Called by NotesCM on debounced doc change
window._notesCMDocChange = function(content) {
  const note = findNote(activeNoteId);
  if (!note) return;
  note.content = content;
  note.updatedAt = new Date().toISOString();
  saveData();
  if (note.language === 'markdown' && _notesPreviewEl) {
    _notesPreviewEl.innerHTML = marked.parse(content);
  }
};

// Called by NotesCM image paste/drop handler and by toolbar 📎 button
window._notesUploadImage = async function(file, view) {
  const ext = file.name.split('.').pop() || 'jpg';
  const id = uid() + '.' + ext;
  await uploadDialImage(id, file);          // no resize — original format preserved
  const md = `![image](/uploads/${id})`;
  NotesCM.insertAtCursor(md);
  const note = findNote(activeNoteId);
  if (note) { note.content = NotesCM.getValue(); note.updatedAt = new Date().toISOString(); saveData(); }
};
```

### `startNoteTabRename(noteId)` — inline rename

```js
function startNoteTabRename(noteId) {
  const tab = document.querySelector(`.notes-tab[data-note-id="${noteId}"]`);
  const nameSpan = tab?.querySelector('.notes-tab-name');
  if (!nameSpan) return;
  const input = document.createElement('input');
  input.className = 'notes-tab-rename-input';
  input.value = nameSpan.textContent;
  nameSpan.replaceWith(input);
  input.focus(); input.select();
  const commit = () => renameNote(noteId, input.value || nameSpan.textContent);
  input.addEventListener('blur', commit, { once: true });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = nameSpan.textContent; input.blur(); }
    e.stopPropagation();
  });
}
```

### Info tooltip content

```
Ctrl/Cmd+F        Find in note
Ctrl/Cmd+H        Find & Replace
Ctrl/Cmd+D        Select next occurrence
Alt+Click         Add cursor
Alt+↑ / Alt+↓     Add cursor above / below
Double-click tab  Rename note
```

Shown on `mouseenter` of `.notes-info-btn`, hidden on `mouseleave`.

---

## State variables to add

In `js/state.js`, after existing todo state vars:

```js
let activeNoteId = null;
let notesFullScreen = false;
let _notesSearchHighlight = null;   // { noteId, query } — consumed once by NotesCM.mount()
```

In `ICONS` object:
```js
defaultNote: '📝',
info:        'ℹ️',
```

---

## `js/init.js` — Escape handler extension

Priority chain (highest to lowest):
1. Notes fullscreen → `toggleNotesFullScreen()`
2. Todo fullscreen → `exitTodoFullScreen()`
3. Todo item editor → `closeItemEditor()`
4. Expanded todo item → collapse
5. Close any open modal

---

## `js/search.js` — note search integration

Add note results after todo results in `renderSearchResults()`:

```js
(data.notes || []).forEach(note => {
  if (note.name.toLowerCase().includes(q) || note.content.toLowerCase().includes(q)) {
    results.push({ type: 'note', note });
  }
});
```

Render note result row: icon `ICONS.defaultNote`, name `note.name`, meta `'Note · ' + snippet`.
Snippet: find line in `note.content` containing query, truncate to 60 chars.

### `jumpToNote(note)`

```js
function jumpToNote(note) {
  clearSearch();
  const homeTab = data.tabs.find(t => t.isHome);
  if (homeTab && activeTabId !== homeTab.id) { activeTabId = homeTab.id; render(); }
  activeNoteId = note.id;
  _notesSearchHighlight = { noteId: note.id, query: currentSearchQuery };
  requestAnimationFrame(() => {
    const container = document.querySelector('.home-col-notes');
    if (container) renderNotesPanel(container);
    // NotesCM.mount() reads _notesSearchHighlight, calls focusAndHighlight(), clears it
  });
}
```

---

## Export / Import

### Export (`exportData()` in `js/pickers.js`)

- Include `data.notes` array in export JSON as-is
- Scan all `note.content` fields for `/uploads/` refs using `extractUploadIds(content)` (shared with todo)
- Fetch those images as base64 and add to `_images` map (same structure as dial + todo images)

Export shape (additions only):
```js
{
  tabs: [...],
  todoLists: [...],
  notes: [{ id, name, language, content, createdAt, updatedAt, order }],  // new
  _config: { theme, logoAnim },
  _images: { [id]: 'base64…' }   // note images added to same map
}
```

### Import (`_doImport()` in `js/pickers.js`)

- Restore `data.notes` from parsed JSON
- Re-upload note images via `uploadDialImage()` (same loop as todo images)
- `saveData()` → `render()`

Old exports without `data.notes` are handled automatically by `loadData()` migration (creates default note).

### Note delete cleanup

```js
extractUploadIds(note.content).forEach(id => deleteDialImage(id));
```

**No resize on note images** — original format and dimensions preserved (same as todo images).

---

## CSS (`css/notes.css`)

Loaded after `todo.css`. All values use CSS vars — never hardcode colours.

### Key rules

```css
/* Override placeholder alignment from todo.css */
.home-col-notes { align-items: stretch; justify-content: flex-start; flex-direction: column; overflow: hidden; }

.notes-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.notes-tabs-bar { display: flex; flex-wrap: nowrap; overflow-x: auto; border-bottom: 1px solid var(--border); flex-shrink: 0; }

/* |Note name [x]| */
.notes-tab { display: flex; align-items: center; gap: 4px; max-width: 140px; flex-shrink: 0; }
.notes-tab-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notes-tab-close { flex-shrink: 0; opacity: 0.5; }
.notes-tab-close:hover { opacity: 1; }

.notes-toolbar { display: flex; gap: 4px; padding: 4px 8px; border-bottom: 1px solid var(--border); flex-shrink: 0; flex-wrap: wrap; }
.notes-lang-btn { font-family: var(--mono-font, monospace); font-size: 11px; }
.notes-lang-btn.active { background: var(--accent); color: var(--accent-text); }

.notes-split-host { flex: 1; display: flex; flex-direction: row; overflow: hidden; min-height: 0; }
.notes-cm-host { flex: 1; overflow: hidden; min-width: 0; }
.notes-cm-host .cm-editor { height: 100%; }
.notes-cm-host .cm-scroller { overflow: auto; }

/* CM6 search panel integration */
.notes-cm-host .cm-search { background: var(--surface2); border-top: 1px solid var(--border); color: var(--text); }
.notes-cm-host .cm-search input { background: var(--surface); color: var(--text); border: 1px solid var(--border); }

.notes-preview { flex: 1; overflow-y: auto; padding: 12px 16px; font-size: 14px; line-height: 1.6; }

/* split.js gutter */
.gutter.gutter-horizontal { width: 5px; background: var(--border); cursor: col-resize; flex-shrink: 0; }

/* Full-screen */
body.notes-fullscreen .home-col-todo,
body.notes-fullscreen .home-dials-strip,
body.notes-fullscreen #headerClock,
body.notes-fullscreen #headerDate,
body.notes-fullscreen #headerDialCount,
body.notes-fullscreen .tabs-bar { display: none; }
body.notes-fullscreen .home-col-notes { flex: 1 1 100%; max-width: 100%; }
```

---

## `index.html` load order changes

**`<head>` — add after existing CM5/marked scripts:**
```html
<script src="https://cdn.jsdelivr.net/npm/split.js/dist/split.min.js"></script>
<link rel="stylesheet" href="css/notes.css">
```

**Body classic scripts — add `notes.js` after `todo.js`:**
```
js/todo.js → js/notes.js → js/drag-drop.js → ...
```

**Module scripts:**
```html
<script type="module" src="js/notes-cm.js"></script>
```
(The existing `todo-cm.js` stub can remain or be removed — it is harmless either way.)

---

## Decisions made — all questions resolved

| # | Question | Decision |
|---|---|---|
| A | Tab delete UX | `\|Note name [x]\|` — × button always visible on tab |
| B | Tab drag-to-reorder | Yes; `order` field in data model |
| C | split.js gutter | Let split.js create its own gutter — simpler and more reliable |
| D | Non-markdown preview | Hide the preview pane; editor fills full width |
| E | Fullscreen mutual exclusion | Yes — entering one exits the other |
| F | Cmd+T shortcut | Removed; only + button to add new note |
| G | Image insertion | Toolbar 📎 button (file picker) + paste/drop onto editor |
| H | CM6 version pinning | Pin exact versions after first working implementation |
| I | Tab rename trigger | Double-click on tab name; documented in info tooltip |
| J | CM6 async race | `notescmready` custom event; panel shell renders immediately, editor mounts on event |
| K | Image paste language scope | Only activates for `language === 'markdown'`; other languages get default CM6 paste |

---

## Known limitation

Tab bar drag-to-reorder does not auto-scroll near the overflow edge. Acceptable for initial implementation.
