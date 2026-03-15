# JS Modules — Reference

The app logic is split into focused modules loaded in this order by `index.html`:

```
js/emoji-synonyms.js  → js/state.js  → js/themes.js  → js/persistence.js
→ js/utils.js  → js/render.js  → js/drag-drop.js  → js/crud.js
→ js/pickers.js  → js/logo-animation.js  → js/init.js
```

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
- `showConfirm(title, message, onConfirm)` — confirm dialog

---

## js/render.js

- `render()` — calls `renderTabs()`, `updateDialCount()`, rebuilds `#groupsContainer`
- `renderTabs()` — renders tab buttons + inline group jump chips; supports dial drag-onto-tab
- `makeDialCard(dial, groupId, gi, di)` — builds one dial card:
  - `iconType === 'custom' && dial.icon` → `.dial-screenshot` full-bleed
  - `iconType === 'none'` → `.dial-no-icon`
  - `iconType === 'emoji'` → emoji span
  - otherwise → favicon via `attachFavicon()`
- `updateClock()` — writes to `#headerClock` / `#headerDate`
- `updateDialCount()` — writes `N groups · N dials` to `#headerDialCount`
- `escHtml(str)` — HTML-escapes `& < > " '`

---

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
- **Tab CRUD**: `openTabModal()`, `saveTab()`, `deleteTab()`
- **Group CRUD**: `openGroupModal()`, `saveGroup()`, `deleteGroup()`, `moveGroup()`, `setGroupSize()`
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
- `exportData()` / `openImportModal()` / `importData()` — JSON import/export

---

## js/logo-animation.js

Multi-phase entrance animation on every page load (if enabled).

**Phases**: Drive in → Bow wave → Continue → Impact shockwave → Vanish + sparks → Assemble

- `initLogoAnimation()` — reads `localStorage.logoAnim`, splits logo into `<span class="logo-char">`, schedules run
- `runLogoAnimation()` — orchestrates phases via nested `setTimeout`s
- `spawnSparks(x, y)` — 7 `.logo-spark` divs burst from letter centers, auto-remove after 550ms
- `toggleLogoAnim()` — flips `logoAnimEnabled`, persists to `localStorage`

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
