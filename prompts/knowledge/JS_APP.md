# JS Modules — Reference

The app logic is split into focused modules loaded in this order by `index.html`:

```
js/emoji-synonyms.js  → js/state.js  → js/themes.js  → js/persistence.js
→ js/utils.js  → js/render.js  → js/todo.js  → js/drag-drop.js  → js/crud.js
→ js/pickers.js  → js/logo-animation.js  → js/search.js  → js/init.js
```
`js/todo-cm.js` is loaded as `type="module"` (ES module) alongside the classic scripts. It imports CodeMirror 6 from `esm.sh` CDN and exposes `window.TodoCM`.

No module system — all files share the global scope. Load order matters.

---

## js/emoji-synonyms.js

`const EMOJI_SYNONYMS` — maps emoji → `string[]` of search synonyms.
Checked first by `emojiMatchesFilter()` before falling back to `EMOJI_KEYWORDS`.
Covers: missing emojis (🫡, 🫥), color associations, scene clusters (grass, water, fire), theme clusters (tool, music, sport, space), number keycaps (0️⃣–9️⃣, 🔟) with word/digit synonyms, richer face/emotion slang (lol, rofl, cringe, swag…), clothing & accessories, professions/roles, zodiac signs (♈–♓), communication/messaging, common symbols (❌✅💯…), abstract concepts, more animals, more food/drink, and places/architecture.

---

## js/state.js

Single file for all emoji/icon data **and** mutable globals. Structure (in order):

### 1. EMOJI & ICON DATA
```js
const ICONS = {
    defaultDial, defaultGroup, defaultTab,   // default emojis for entities
    faviconFallback,                          // '🌐' — favicon load failure
    edit, delete, search,                     // UI affordances
    ok, warn, error, undo, loading,           // status/toast indicators
    defaultTodoList,                          // '📋'
    moveTop, moveBottom,                      // '⬆️' / '⬇️' — todo item reorder buttons
};

const EMOJI_CATEGORIES = [ ... ];   // categorized full emoji set
const EMOJI_LIST = ...;             // flat list (no flags), for random picking
const GROUP_EMOJIS = [ ... ];       // curated emoji list for groups
const EMOJI_KEYWORDS = { ... };     // emoji → primary keyword string (search fallback)
```

### 2. STATE variables
```js
let data = { tabs: [] }          // full data tree
let activeTabId = null
let editMode = false
let editingTabId/GroupId/DialId/DialGroupId = null
let currentIconSrc = 'favicon'   // 'favicon' | 'emoji' | 'custom' | 'none'
let currentDialEmoji = ICONS.defaultDial
let currentGroupEmoji = ICONS.defaultGroup
let currentTabEmoji = ICONS.defaultTab
let currentGroupSize = 140       // px — bound to group size slider
let selectedFaviconUrl = ''
let dragSrcGroupId/DialId/TabId = null
let dragSrcType = null           // 'dial' | 'group'
let pendingImageBlob = null      // image blob waiting to be uploaded on dial save
let logoAnimEnabled = true

// Todo state vars (also in js/state.js)
let currentTodoListEmoji         // emoji for the todo list modal
let activeTodoListId             // which list is expanded in the accordion
let editingTodoListId            // id of list being edited in modal
let editingTodoItemId            // id of item currently in full-screen editor
```

> **Rule**: STATE comes after emoji/icon data so `currentDialEmoji = ICONS.defaultDial` is valid.

---

## js/themes.js

- `const THEMES = [...]` — array of theme objects `{ name, dataTheme, colors... }`
- `applyTheme(name)` — sets `body[data-theme]`
- `loadTheme()` — reads `localStorage.speedDialTheme`, calls `applyTheme()`
- `renderThemeSelector()` — builds the theme picker UI

---

## js/persistence.js

- `loadData()` — reads `localStorage.speedDial_v2`, migrates old `{groups}` format (no tabs wrapper)
- `saveData()` — `localStorage.setItem('speedDial_v2', JSON.stringify(data))`
- `getActiveTab()` — returns `data.tabs.find(t => t.id === activeTabId)`

---

## js/utils.js

- `uid()` — `Date.now().toString(36) + random` → `[a-z0-9]+`
- `resizeImage(file)` → Promise&lt;Blob&gt; — resizes to 400×300 cover crop, JPEG 0.85
- `uploadDialImage(id, blob)` — POST `/api/upload/<id>`
- `deleteDialImage(id)` — DELETE `/api/upload/<id>`
- `handleDropZonePaste(e)` / `handleImageFile(file)` — image paste/drop into custom icon zone
- `pickRandomEmoji(list)` — random item from array
- `getDomain(url)` / `getFaviconCandidates(url)` — favicon URL candidates
- `attachFavicon(imgEl, dialUrl, fallbackEmoji)` — tries candidates via `onerror` chain
- `showToast(msg)` / `showToastUndo(msg, backup)` / `undoDelete(encodedBackup)`
- `showConfirm(title, message, onConfirm, opts?)` — confirm dialog; `opts.btnLabel` sets button text (default `'Delete'`), `opts.danger: false` removes danger styling

---

## js/render.js

- `render()` — calls `renderTabs()`, `updateDialCount()`, `updateTabSizeSlider()`, rebuilds `#groupsContainer`; if active tab has `isHome`, delegates to `renderHomeTab()` and returns early
- `updateTabSizeSlider()` — syncs the header `#tabSizeSlider` / `#tabSizeValue` to the first group's `dialSize`; hides the control when the active tab is Home or has no groups
- `renderHomeTab()` — builds `.home-layout-a` (CSS grid) with three children: `.home-dials-strip` (most-used + recently-used sub-sections), `.home-col-todo` (calls `renderTodoPanel()`), `.home-col-notes` (placeholder). Dials sorted by `visitCount` (most used) and `lastVisited` (recently used), capped at 12 each.
- `trackDialVisit(dialId)` — increments `visitCount` and sets `lastVisited` (ISO string) on the clicked dial
- `renderTabs()` — renders tab buttons + inline group jump chips; supports dial drag-onto-tab
- `makeDialCard(dial, groupId, gi, di, opts = {})` — builds one dial card:
  - `iconType === 'custom' && dial.icon` → `.dial-screenshot` full-bleed
  - `iconType === 'none'` → `.dial-no-icon`
  - `iconType === 'emoji'` → emoji span
  - otherwise → favicon via `attachFavicon()`
  - `opts.showMeta` — appends a `.dial-meta` label (`tabName · groupName`); also skips edit overlay, drag handle, and drag events (home tab view)
  - mouseenter/mouseleave on cards with `dial.url` position and show `#dial-url-tooltip` (fixed, centered below card); hidden in edit mode
  - click handler always calls `trackDialVisit(dial.id)` before `window.open`
- `trackDialVisit(dialId)` — finds dial by id across all tabs, increments `visitCount`, calls `saveData()`
- `updateClock()` — writes to `#headerClock` / `#headerDate`
- `updateDialCount()` — writes `N groups · N dials` to `#headerDialCount`; on home tab writes `N frequently used dials`
- `escHtml(str)` — HTML-escapes `& < > " '`

---

## js/todo.js

All todo panel logic. Functions:

| Function | Purpose |
|----------|---------|
| `renderTodoPanel(container)` | Builds the full todo column into `container`; shows item editor if `editingTodoItemId` is set |
| `openTodoListModal(listId?)` | Open add/edit list modal |
| `saveTodoList()` | Save list name+emoji from modal |
| `deleteTodoListFromModal()` | Confirm → delete list + clean up image uploads |
| `closeTodoListModal()` | Close todo list modal |
| `addTodoItem(listId, position)` | Insert inline input at `'top'` or `'bottom'`; Enter commits, Escape cancels, blur auto-commits |
| `saveTodoItem(id, content)` | Persist content + `updatedAt` |
| `toggleTodoDone(id)` | Flip `isDone`; set/clear `doneAt` |
| `deleteTodoItem(id)` | `showToastUndo()` — no confirm; cleans up image uploads |
| `moveTodoItemToPosition(id, listId, pos)` | Move item to `'top'` or `'bottom'` of its list |
| `openTodoMoveModal(itemId)` | Open move-to-list picker modal |
| `closeTodoMoveModal()` | Close move modal |
| `moveTodoItem(id, targetListId)` | Move item to top of target list; expand target |
| `openItemEditor(id)` | Show full-screen CodeMirror editor for item (inside todo column) |
| `closeItemEditor()` | Validate non-empty, auto-save, return to list |
| `toggleTodoFullScreen()` | Toggle `todoFullScreen` bool + `body.todo-fullscreen` class |
| `exitTodoFullScreen()` | Always-exit variant (for Escape handler) |
| `extractUploadIds(content)` | Extract `/uploads/<id>` refs from markdown content |
| `_reorderTodoItem(dragId, listId, targetId, before)` | Reorder item within same list by drag |
| `_reorderTodoList(dragListId, targetListId, before)` | Reorder lists by drag |
| `_clearTodoDragIndicators()` | Remove all drag CSS classes (called on global `dragend`) |

**Module-level state:** `todoFullScreen`, `doneExpandedListId`, `expandedItemId`, `_todoDragItemId`, `_todoDragListId`, `_todoDragListElemId` (all JS-only; reset on page load).

**Item editor (CodeMirror 6 via `window.TodoCM` + marked.js split view):**
- `_renderItemEditor(container)` — creates `.todo-edit-view` with `position:absolute; inset:0`. Inside: `.todo-edit-split` flex column with `.todo-edit-cm-host` (CM6 top) + `.todo-edit-preview` (marked.js bottom; horizontal in fullscreen).
- Calls `TodoCM.mount(cmHost, content, isDark, { onChange, onPaste, onDrop, onScroll, onEsc })`. Falls back to `<textarea class="todo-edit-textarea">` if `window.TodoCM` unavailable.
- `closeItemEditor()` reads `TodoCM.getValue()` then calls `TodoCM.destroy()`; falls back to `.todo-edit-textarea.value`.
- `_uploadTodoImage()` appends image markdown via `TodoCM.appendText()`; textarea fallback.

**CDN dependencies (loaded in `index.html` as classic scripts before body scripts):**
- `marked.min.js` from jsDelivr

**Drag behaviour:**
- Item reorder: drag handle on every item row activates `row.draggable`. Drop between items shows top/bottom border indicator, updates `item.order` values sequentially.
- Cross-list item move: drag item → drop onto collapsed list header → calls `moveTodoItem()`.
- List reorder: list headers are draggable. Drop indicator on list element, reorders `list.order` values.

**State vars in `js/state.js`:** `activeTodoListId`, `editingTodoListId`, `editingTodoItemId`, `currentTodoListEmoji`.

## js/todo-cm.js

ES module (`type="module"`). Imports CM6 from `esm.sh`, exposes `window.TodoCM`, fires `todocmready` event.

**API:**
- `TodoCM.mount(hostEl, content, isDark, callbacks)` — mounts CM6 markdown editor with `oneDark` theme in dark mode. Callbacks: `onChange(text)`, `onPaste(e)`, `onDrop(e)`, `onScroll(ratio)`, `onEsc()`.
- `TodoCM.destroy()` — destroys the view (call before clearing DOM or closing editor).
- `TodoCM.getValue()` — returns current doc string.
- `TodoCM.appendText(text)` — appends text and moves cursor to end.
- `TodoCM.setTheme(isDark)` — switches oneDark on/off dynamically.

## js/drag-drop.js

All drag & drop logic:
- `onDialDragStart/Over/Drop()`, `onDialDropOnGroup()`
- `onGroupDragStart/Over/Drop()`
- `clearDropIndicators()`, `resetHoverAfterDrag()`
- Global `dragend` on `document` clears indicators

### Key patterns
- Dial reorder: `drop-before`/`drop-after` class based on `e.clientX` vs card midpoint
- Cross-tab drop: dial moves to `tgtTab.groups[0].dials.unshift(dial)`, tab switches to target
- `resetHoverAfterDrag()` — adds `body.post-drag` for 300ms to suppress stuck hover overlays (Safari fix)

---

## js/crud.js

- `toggleEditMode()` — flips `editMode`, syncs `body.edit-mode` class + draggable state
- **Tab CRUD**: `openTabModal()`, `saveTab()`, `deleteTab()` — home tab (`isHome: true`) cannot be deleted; modal shows "Edit Start Tab" title and hides Delete button for it
- **Group CRUD**: `openGroupModal()`, `saveGroup()`, `deleteGroup()`, `moveGroup()`, `setGroupSize()`
- `setTabDialSize(px)` — sets `dialSize` on all groups of the active tab, updates CSS vars live on `.dials-grid` elements, saves; no re-render needed
- **Dial CRUD**: `openDialModal()`, `saveDial()`, `_doSaveDial()`, `deleteDial()`, `moveDial()`
- **Icon source**: `setIconSrc(src)` — toggles favicon/emoji/custom/none panels
- `previewCustomIcon()` — debounced preview for custom icon URL input
- `fetchPageTitle()` / `onUrlInput()` — auto-fetch page title on URL blur

---

## js/pickers.js

- `initEmojiPickers()` — builds dial/group/tab pickers once; `buildEmojiPicker(id, type)`
- `toggleEmojiPicker(type)` — open/close with search clear + focus
- `selectEmoji(type, emoji)` — sets currentXxxEmoji, clears no-icon state
- `randomEmoji(type)` — picks from EMOJI_LIST
- `emojiName(e)` — `EMOJI_KEYWORDS[e] || e`
- `emojiMatchesFilter(e, filter)` — checks `EMOJI_SYNONYMS[e]` first, then `EMOJI_KEYWORDS[e]`
- `loadFaviconOptions(url)` / `renderFaviconTiles()` — favicon picker in dial modal
- `exportData()` — async; collects all `/uploads/` custom images as raw base64, exports `{ ...data, _config: { theme, logoAnim }, _images: { [dialId]: b64 } }`
- `openImportModal()` — clears `_pendingImportJSON`, file input, and textarea; opens modal
- `onImportFileSelected(input)` — reads selected JSON file, stores text in `_pendingImportJSON`
- `importData()` — parses `_pendingImportJSON` or textarea; calls `showConfirm` before proceeding
- `_doImport(parsed)` — async; extracts `_images` and `_config`, sets `data`, restores theme via `applyTheme()` and logoAnim via `localStorage`+`updateAnimToggleUI()`, calls `saveData()`/`render()`, then uploads each image via `uploadDialImage()` and calls `render()` again

---

## js/logo-animation.js

Multi-phase entrance animation on every page load (if enabled).

**Phases**: Drive in → Bow wave → Continue → Impact shockwave → Vanish + sparks → Assemble

- `initLogoAnimation()` — reads `localStorage.logoAnim`, splits logo into `<span class="logo-char">`, schedules run
- `runLogoAnimation()` — orchestrates phases via nested `setTimeout`s
- `spawnSparks(x, y)` — 7 `.logo-spark` divs burst from letter centers, auto-remove after 550ms
- `toggleLogoAnim()` — flips `logoAnimEnabled`, persists to `localStorage`

---

## js/search.js

Header search bar — searches dials, todo lists, and todo items.

- `initSearch()` — attaches input/keydown/click-outside listeners to `#searchInput`
- `renderSearchResults()` — on each keystroke, collects matching dials (`dialMatchesSearch`) then matching todo lists/items; renders mixed dropdown
- `dialMatchesSearch(dial, q)` — matches `dial.name` or `dial.url`
- Todo matching: list name substring match → `{ type:'todoList' }`; item `content` substring match → `{ type:'todoItem' }`
- `jumpToDial(dial, tab)` — switches tab if needed, scrolls + shakes card
- `jumpToTodoList(list)` — sets `activeTodoListId`, re-renders todo panel, scrolls list into view
- `jumpToTodoItem(todoItem, list)` — sets `activeTodoListId` + `expandedItemId` (and `doneExpandedListId` if item is done), re-renders, scrolls item into view
- Results order: dial matches first, then todo list/item matches

---

## js/init.js

`DOMContentLoaded` bootstrap — runs `loadTheme()`, `loadData()`, `initEmojiPickers()`, `render()`, `updateClock()`, `setInterval(updateClock, 1000)`, `initLogoAnimation()`. Also sets up keyboard shortcuts (Escape closes modals) and modal backdrop click handlers.

---

## Render pipeline

Always full DOM rebuild — no diffing:
```
render() → renderTabs() + updateDialCount() + rebuild #groupsContainer
```
After any data change: `saveData(); render();`

---

## Image upload flow

1. Paste/drop onto `#imgDropZone` or pick via `#imgFileInput`
2. `handleImageFile(file)` → `resizeImage()` → stores blob in `pendingImageBlob`
3. `_doSaveDial()` — if `pendingImageBlob` set → POST `/api/upload/<id>` → `icon: /uploads/<id>.jpg`
4. Typing a custom icon URL cancels `pendingImageBlob`
