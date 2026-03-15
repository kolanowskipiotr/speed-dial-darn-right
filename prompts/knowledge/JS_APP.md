# js/app.js — Reference

## Section map (line numbers)
| Line | Section |
|------|---------|
| 1    | THEMES — array + `applyTheme()`, `loadTheme()`, `renderThemeSelector()` |
| 41   | STATE — all mutable globals (see below) |
| 60   | EMOJI DATA — `EMOJI_CATEGORIES[]`, `EMOJI_LIST`, `GROUP_EMOJIS` |
| 77   | DATA PERSISTENCE — `loadData()`, `saveData()`, `getActiveTab()` |
| 105  | UTILS — `uid()`, `pickRandomEmoji()`, `getDomain()`, `getFaviconCandidates()`, `attachFavicon()`, `showToast()`, `showToastUndo()`, `showConfirm()`, `resizeImage()`, `uploadDialImage()`, `handleImageFile()` |
| 244  | RENDER — `render()`, `renderTabs()`, `renderGroups()`, `makeDialCard()` |
| ~548 | DRAG & DROP: DIALS — `clearDropIndicators()`, `onDialDragStart()`, `onDialDragOver()`, `onDialDrop()`, `onDialDropOnGroup()` |
| ~636 | DRAG & DROP: GROUPS — `onGroupDragStart()`, `onGroupDragOver()`, `onGroupDrop()` |
| ~674 | EDIT MODE — `toggleEditMode()` |
| 590  | TAB CRUD — `openTabModal()`, `saveTab()`, `deleteTab()` |
| 635  | GROUP CRUD — `openGroupModal()`, `saveGroup()`, `deleteGroup()`, `moveGroup()`, `setGroupSize()` |
| 710  | DIAL CRUD — `openDialModal()`, `saveDial()`, `_doSaveDial()`, `deleteDial()`, `moveDial()` |
| 762  | CUSTOM ICON PREVIEW — `previewCustomIcon()`, `onUrlInput()`, `fetchPageTitle()` |
| 928  | ICON SOURCE — `setIconSrc()` toggles favicon/emoji/custom panels |
| 953  | FAVICON PICKER — `loadFaviconOptions()`, `renderFaviconTiles()` |
| 1036 | EMOJI PICKER — `buildEmojiPicker()`, `toggleEmojiPicker()`, `selectEmoji()`, `randomEmoji()` |
| 1185 | MODAL HELPERS — `openModal()`, `closeModal()`, backdrop click-to-close |
| 1199 | IMPORT / EXPORT — `exportData()`, `openImportModal()`, `importData()` |
| 1234 | KEYBOARD SHORTCUTS — Escape closes modals |
| 1241 | INIT — `loadTheme()`, `renderThemeSelector()`, `loadData()`, `initEmojiPickers()`, `render()` |

---

## Global state variables (app.js:41)
```js
let data = { tabs: [] }          // full data tree
let activeTabId = null            // currently visible tab id
let editMode = false              // edit mode toggle
let editingTabId = null           // id of tab being edited in modal
let editingGroupId = null         // id of group being edited in modal
let editingDialId = null          // id of dial being edited in modal
let editingDialGroupId = null     // group id of dial being edited
let currentIconSrc = 'favicon'    // 'favicon' | 'emoji' | 'custom'
let currentDialEmoji = '😀'
let currentGroupEmoji = '📁'
let currentTabEmoji = '🗂'
let currentGroupSize = 140        // px — bound to group size slider
let selectedFaviconUrl = ''       // favicon chosen in picker
let dragSrcGroupId = null         // drag state
let dragSrcDialId = null          // drag state
let dragSrcTabId = null           // source tab id for cross-tab dial moves
let dragSrcType = null            // 'dial' | 'group'
let pendingImageBlob = null       // image blob waiting to be uploaded on dial save
```

---

## Render pipeline
- `render()` calls `renderTabs()` + `renderGroups()` — always full DOM rebuild, no diffing
- `makeDialCard(dial, groupId, gi, di)` — builds one dial card DOM element:
  - `dial.iconType === 'custom' && dial.icon` → `.dial-card.dial-screenshot` full-bleed image
  - `dial.iconType === 'emoji'` → emoji icon
  - otherwise → favicon with `attachFavicon()` fallback chain
- After any data change: `saveData(); render();`

---

## Key patterns
- Undo toasts: `showToastUndo(msg, backup)` — backup is `JSON.stringify(data)` taken before mutation
- Favicon loading: `attachFavicon()` tries ordered candidates via `img.onerror` chain, falls back to emoji
- Page title auto-fetch: `fetchPageTitle()` on URL field blur, uses `fetch()` + regex on raw HTML
- Emoji picker built once in `initEmojiPickers()`, reused; search is client-side filter over `EMOJI_CATEGORIES`

## Drag & drop — key patterns

### Dial reordering within a group
- `onDialDragOver`: adds `drop-before` or `drop-after` class to the hovered card based on `e.clientX` vs card midpoint
- `clearDropIndicators()`: removes `drop-before`/`drop-after` from all `.dial-card` elements (also clears `.dials-grid.dial-drag-over`)
- Global `dragend` on `document`: calls `clearDropIndicators()` only

### Cross-tab dial move
- Drag dial → drop onto a **different tab button** → dial moves to `tgtTab.groups[0].dials` as first element (`unshift`)
- Tab switches to target tab after drop
- `dragSrcTabId` is set in `onDialDragStart` to track source tab
- After drop: `requestAnimationFrame` adds `.dial-just-dropped` to the placed card for glow+shake animation

### Hover overlay stuck after drag (Safari)
- `dragend` on detached elements doesn't bubble in Safari → can't rely on `dragend` to clean up hover state
- Fix: call `resetHoverAfterDrag()` directly from every drop handler
- `resetHoverAfterDrag()` adds `body.post-drag` for 300ms which suppresses `.dial-overlay-btns` and `.dial-edit-overlay`

### Tab dragover must always call `e.preventDefault()` for different tabs
- The `dragSrcType === 'dial'` guard must NOT be placed in `dragover` (breaks drop acceptance)
- `dragover` always calls `e.preventDefault()` for any drag over a different tab; drop handler guards logic

### Unshift vs push
- Drops without a specific position (onto group, onto tab button) always insert as **first** element (`unshift`)
- `onDialDropOnGroup` is a no-op if dial is already first in that group

## Image upload flow (custom icon → file/paste)
1. User pastes or drops image onto `#imgDropZone` (contenteditable), or picks file via `#imgFileInput`
2. `handleImageFile(file)` → `resizeImage(file)` resizes to canvas → stores blob in `pendingImageBlob`
3. On `_doSaveDial()`: if `pendingImageBlob` is set → `uploadDialImage(newId, blob)` POSTs to `/api/upload/<id>`
4. nginx proxies to uploader sidecar → saves as `/uploads/<id>.jpg`
5. Dial saved with `icon: /uploads/<id>.jpg`, `iconType: 'custom'`
6. Typing a URL in the custom icon text field cancels `pendingImageBlob`
