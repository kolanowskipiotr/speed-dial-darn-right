# Speed Dial Darn Right — Codebase Reference

## What it is
A self-hosted browser speed-dial / new-tab page. Pure frontend — no backend, no framework. Single HTML file + one CSS file + one JS file served by nginx in Docker.

## File map
```
speed-dial.html     — all HTML: header, modals, main container (186 lines)
css/style.css       — all styles, CSS vars, themes (1164 lines)
js/app.js           — all logic (1147 lines)
nginx.conf          — static serving + /data/ and /uploads/ aliases
docker-compose.yml  — single service: speed-dial (nginx)
Dockerfile          — nginx:1.27-alpine, serves html/css/js, volumes /data /uploads
```

---

## Data model (localStorage key: `speedDial_v2`)
```js
{
  tabs: [
    {
      id: string,         // uid()
      name: string,
      emoji: string,
      groups: [
        {
          id: string,
          name: string,
          emoji: string,
          dialSize: number,   // px, 60–400, default 140, controls --dial-size CSS var
          dials: [
            {
              id: string,
              name: string,
              url: string,
              emoji: string,
              iconType: 'favicon' | 'emoji' | 'custom',
              icon: string,   // favicon URL, custom icon URL, or empty
            }
          ]
        }
      ]
    }
  ]
}
```
- Saved via `saveData()` → `localStorage.setItem('speedDial_v2', JSON.stringify(data))`
- Loaded via `loadData()` — migrates old `{ groups }` format automatically
- `getActiveTab()` returns current tab object

---

## js/app.js — section map (line numbers)
| Line | Section |
|------|---------|
| 1    | THEMES — array + `applyTheme()`, `loadTheme()`, `renderThemeSelector()` |
| 41   | STATE — all mutable globals (see below) |
| 59   | EMOJI DATA — `EMOJI_CATEGORIES[]`, `EMOJI_LIST`, `GROUP_EMOJIS` |
| 76   | DATA PERSISTENCE — `loadData()`, `saveData()`, `getActiveTab()` |
| 104  | UTILS — `uid()`, `pickRandomEmoji()`, `getDomain()`, `getFaviconCandidates()`, `attachFavicon()`, `showToast()`, `showToastUndo()`, `showConfirm()` |
| 179  | RENDER — `render()`, `renderTabs()`, `renderGroups()`, `makeDialCard()` |
| 436  | DRAG & DROP: DIALS |
| 479  | DRAG & DROP: GROUPS |
| 510  | EDIT MODE — `toggleEditMode()` |
| 525  | TAB CRUD — `openTabModal()`, `saveTab()`, `deleteTab()` |
| 570  | GROUP CRUD — `openGroupModal()`, `saveGroup()`, `deleteGroup()`, `moveGroup()`, `setGroupSize()` |
| 645  | DIAL CRUD — `openDialModal()`, `saveDial()`, `_doSaveDial()`, `deleteDial()`, `moveDial()` |
| 691  | CUSTOM ICON PREVIEW — `previewCustomIcon()` |
| 715  | TITLE FETCH — `onUrlInput()`, `fetchPageTitle()` |
| 833  | ICON SOURCE — `setIconSrc()` toggles favicon/emoji/custom panels |
| 854  | FAVICON PICKER — `loadFaviconOptions()`, `renderFaviconTiles()` |
| 937  | EMOJI PICKER — `buildEmojiPicker()`, `toggleEmojiPicker()`, `selectEmoji()`, `randomEmoji()` |
| 1086 | MODAL HELPERS — `openModal()`, `closeModal()`, backdrop click-to-close |
| 1100 | IMPORT / EXPORT — `exportData()`, `openImportModal()`, `importData()` |
| 1135 | KEYBOARD SHORTCUTS — Escape closes modals |
| 1142 | INIT — `loadTheme()`, `renderThemeSelector()`, `loadData()`, `initEmojiPickers()`, `render()` |

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
let dragSrcGroupId / dragSrcDialId / dragSrcType  // drag state
```

---

## Render pipeline
`render()` calls `renderTabs()` + `renderGroups()`. Both always do full DOM rebuild (no diffing).
- `makeDialCard(dial, groupId, gi, di)` — builds one dial card DOM element
  - `dial.iconType === 'custom' && dial.icon` → `.dial-card.dial-screenshot` full-bleed image card
  - `dial.iconType === 'emoji'` → emoji icon
  - otherwise → favicon with `attachFavicon()` fallback chain
- After any data change: `saveData(); render();`

---

## css/style.css — section map (line numbers)
| Line | Section |
|------|---------|
| 1    | Google Fonts import (DM Sans, DM Mono) |
| 3    | `:root` non-color tokens: `--radius`, `--radius-sm`, `--transition` |
| 10   | Default theme (dark-yellow) on `body` — all CSS color vars |
| 30–100 | Theme overrides: dark-blue, dark-purple, dark-teal, light-blue, light-warm via `body[data-theme="..."]` |
| 126  | Header |
| 226  | Theme selector buttons |
| 267  | Tabs bar |
| 337  | Main / groups container |
| 345  | Group blocks |
| 423  | Dials grid — `--dial-size` CSS var set inline per group |
| 438  | `.dial-card` — `width: var(--dial-size, 140px)`, `aspect-ratio: 4/3` |
| 508  | `.dial-card.dial-screenshot` — full-bleed image card with name gradient overlay |
| 677  | Modal / form styles |
| 784  | Dial size slider |

## Key CSS variables (all on `body`)
```
--bg, --surface, --surface2, --surface3   backgrounds
--border, --border-hover                  borders
--accent, --accent2, --accent-text        brand colour
--text, --text-dim, --text-dimmer         text
--danger, --success                       status colours
--radius (14px), --radius-sm (8px)
--transition (0.2s cubic-bezier)
--shadow, --shadow-hover
```

---

## HTML modals (speed-dial.html)
| id | Purpose |
|----|---------|
| `dialModal` | Add / Edit dial |
| `groupModal` | Add / Edit group |
| `tabModal` | Add / Edit tab |
| `confirmModal` | Delete confirmation |
| `importModal` | Paste JSON to import |

Modal open/close: `openModal(id)` / `closeModal(id)` toggle `.open` class.
Backdrop click auto-closes. Escape key closes all open modals.

### Dial modal — key input ids
`dialName`, `dialUrl`, `dialEmojiPreview`, `dialEmojiPicker`, `dialCustomIcon`,
`faviconPicker`, `faviconPickerGroup`, `emojiPickerGroup`, `customIconGroup`,
`iconSrcFavicon`, `iconSrcEmoji`, `iconSrcCustom`, `titleFetchStatus`

---

## Adding a new feature — checklist
1. **Data**: add field to dial/group/tab object in `_doSaveDial` / `saveGroup` / `saveTab`, load it in the corresponding `open*Modal()`
2. **Render**: update `makeDialCard()` or `renderGroups()` to use the new field
3. **HTML**: add UI to the relevant modal in `speed-dial.html`
4. **CSS**: add styles in `style.css` — use existing CSS vars, don't hardcode colours
5. No build step — changes to mounted files are live immediately in Docker dev setup

---

## Docker / deployment
- Dev: all source files volume-mounted as `:ro` — edits reflect instantly (no rebuild)
- Prod: `docker compose build && docker compose up -d`
- Volumes: `speed_dial_data` → `/data`, `speed_dial_uploads` → `/uploads` (both nginx-served)
- nginx `^~ /uploads/` has higher priority than the `~* \.jpg$` regex — required to serve uploads correctly

---

## Patterns / conventions
- IDs generated by `uid()` — `Date.now().toString(36) + random`
- All CRUD functions follow: mutate `data` → `saveData()` → `render()`
- Undo toasts use `showToastUndo(msg, backup)` where backup is `JSON.stringify(data)` before mutation
- Favicon loading: try ordered candidates via `img.onerror` chain (`attachFavicon()`), falls back to emoji
- Page title auto-fetch: `fetchPageTitle()` on URL field blur, uses `fetch()` + regex on raw HTML
- Emoji picker built once in `initEmojiPickers()`, reused; search is client-side filter over `EMOJI_CATEGORIES`
