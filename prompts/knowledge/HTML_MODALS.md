# HTML Structure — Reference

## File layout (after split)
`index.html` is a shell that uses **nginx SSI** (`ssi on` in `nginx.conf`) to include partials:

```
index.html
  <!--#include virtual="/partials/header.html" -->
  <!--#include virtual="/partials/main.html" -->
  <!--#include virtual="/partials/modal-dial.html" -->
  <!--#include virtual="/partials/modal-tab.html" -->
  <!--#include virtual="/partials/modal-group.html" -->
  <!--#include virtual="/partials/modal-confirm.html" -->
  <!--#include virtual="/partials/modal-import.html" -->
  <script> tags
```

All partials live in `partials/`. Because nginx processes SSI at request time, file changes are live immediately (no build step).

---

## Header structure (`partials/header.html`)
```
<header>
  .header-top  — CSS grid: 1fr auto 1fr; always visible
    .header-left
      #logoText             — "⚡ Speed Dial Darn Right"; split into .logo-char spans by initLogoAnimation()
      #headerDialCount      — "N groups · N dials" for active tab (updated by updateDialCount())
    .header-center
      #headerClock          — live HH:MM:SS (updated every 1s by updateClock())
      #headerDate           — formatted date e.g. "SUN, MAR 15, 2026"
    .header-actions         — justify-self: end; always visible
      #headerSearchWrap     — search input + dropdown
      #editToggle           — Edit/Editing toggle

  .header-edit-bar  — second row; display:none normally, display:flex in edit mode
    #themeSelector          — theme swatches
    .theme-sep × 3          — vertical dividers
    .btn-export × 2         — Export JSON, Import
    #tabSizeControl         — Dial Size slider (hidden on Home tab / no groups); flex:1 to fill space
    #animToggle             — ⚡ Anim on/off toggle; calls toggleLogoAnim()

  .tabs-bar  — tab buttons + group jump chips
```

## Tabs bar structure
```
<div #tabsBar>
  [.tab-btn × N]            — one per tab, active tab has .active class
  .add-tab-btn              — "+ Tab" (edit mode only via CSS)
  .tabs-groups-sep          — vertical divider (only if active tab has groups)
  [.group-jump-chip × N]    — one per group in active tab; click scrolls to group
```

## Main structure (`partials/main.html`)
```
<main>
  #groupsContainer          — rebuilt by render()
  #addGroupBtn              — "Add Group" (edit mode only)
  #emptyState               — shown when no dials exist
</main>
<div #toast>                — fixed bottom-center toast notification
```

---

## Modal list
| Partial file | id | Purpose |
|---|---|---|
| `partials/modal-dial.html` | `dialModal` | Add / Edit dial |
| `partials/modal-group.html` | `groupModal` | Add / Edit group |
| `partials/modal-tab.html` | `tabModal` | Add / Edit tab |
| `partials/modal-confirm.html` | `confirmModal` | Delete confirmation |
| `partials/modal-import.html` | `importModal` | File-pick or paste JSON to import |

## Open / close
- `openModal(id)` / `closeModal(id)` — toggle `.open` class
- Backdrop click auto-closes
- Escape key closes all open modals

---

## Dial modal — key input IDs
```
dialName, dialUrl
dialEmojiPreview, dialEmojiPicker
titleFetchStatus               — status text shown next to name label during title fetch

-- Favicon panel --
faviconPickerGroup             — wrapper div (shown/hidden by setIconSrc)
faviconPicker                  — tile container
faviconHint                    — hint span shown before URL is entered

-- Emoji panel --
emojiPickerGroup               — wrapper div
dialEmojiPicker

-- Custom icon panel --
customIconGroup                — wrapper div
dialCustomIcon                 — URL text input
customIconPreview              — preview shown when URL is typed
imgDropZone                    — contenteditable div; accepts paste/drop of image files
imgFileInput                   — hidden <input type="file"> triggered by click on drop zone
imgUploadPreview               — shows resized image preview before save
imgUploadStatus                — status text (⏳ Resizing… / ⏳ Uploading… / errors)

-- Color picker panel --
colorPickerGroup               — wrapper div
colorTL, colorTR, colorBL, colorBR, colorCenter  — color inputs
colorPreview                   — live gradient preview div

-- Icon source toggle buttons --
iconSrcFavicon, iconSrcEmoji, iconSrcCustom, iconSrcColor, iconSrcNone
```

---

## Tab modal — key input IDs
```
tabName
tabEmojiPreview                — shows current emoji; click opens picker; shows '—' when no-icon
tabEmojiPicker
tabNoIconBtn                   — toggles no-icon mode (adds .active when active)
tabDeleteBtn                   — shown only in edit mode
```

---

## Group modal — key input IDs
```
groupName
groupSizeSlider, groupSizeValue
groupEmojiPreview              — shows current emoji; shows '—' when no-icon
groupEmojiPicker
groupNoIconBtn                 — toggles no-icon mode (adds .active when active)
```

---

## No-icon behaviour (tabs, groups, dials)
- **Tabs / Groups**: clicking "No icon" calls `setNoIcon(type)` → sets `currentTabEmoji` / `currentGroupEmoji` to `''`, preview shows `—` with `.emoji-preview-none` class, button gets `.active`. Saved as `emoji: ''`. Picking any emoji or hitting Random clears no-icon state.
- **Dials**: fourth icon source button `iconSrcNone` / `setIconSrc('none')` — hides all icon panels, saves `iconType: 'none', icon: ''`.
- Rendering skips the icon element entirely when no-icon; dial gets `.dial-no-icon` class.
