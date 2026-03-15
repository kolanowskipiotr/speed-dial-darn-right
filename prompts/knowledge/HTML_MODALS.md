# HTML Modals — Reference (index.html)

## Header structure
```
<header>  — CSS grid: 1fr auto 1fr
  .header-left
    #logoText               — "⚡ Speed Dial Darn Right"; split into .logo-char spans by initLogoAnimation()
    #headerDialCount        — "N groups · N dials" for active tab (updated by updateDialCount())
  .header-center
    #headerClock            — live HH:MM:SS (updated every 1s by updateClock())
    #headerDate             — formatted date e.g. "SUN, MAR 15, 2026"
  .header-actions           — justify-self: end
    #themeSelector          — theme swatches (edit mode only)
    .theme-sep              — vertical divider (edit mode only)
    .btn-export × 2         — Export JSON, Import (edit mode only)
    #animToggle             — ⚡ Anim on/off toggle (edit mode only); calls toggleLogoAnim()
    .theme-sep.anim-sep     — vertical divider (edit mode only)
    #editToggle             — Edit/Editing toggle
```

## Tabs bar structure
```
<div #tabsBar>
  [.tab-btn × N]            — one per tab, active tab has .active class
  .add-tab-btn              — "+ Tab" (edit mode only via CSS)
  .tabs-groups-sep          — vertical divider (only if active tab has groups)
  [.group-jump-chip × N]    — one per group in active tab; click scrolls to group
```

---

## Modal list
| id | Purpose |
|----|---------|
| `dialModal` | Add / Edit dial |
| `groupModal` | Add / Edit group |
| `tabModal` | Add / Edit tab |
| `confirmModal` | Delete confirmation |
| `importModal` | Paste JSON to import |

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

-- Icon source toggle buttons --
iconSrcFavicon, iconSrcEmoji, iconSrcCustom, iconSrcNone
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
Label changed from "Emoji" → "Icon".

---

## Group modal — key input IDs
```
groupName
groupSizeSlider, groupSizeValue
groupEmojiPreview              — shows current emoji; shows '—' when no-icon
groupEmojiPicker
groupNoIconBtn                 — toggles no-icon mode (adds .active when active)
```
Label changed from "Emoji" → "Icon".

---

## No-icon behaviour (tabs, groups, dials)
- **Tabs / Groups**: clicking "No icon" calls `setNoIcon(type)` → sets `currentTabEmoji` / `currentGroupEmoji` to `''`, preview shows `—` with `.emoji-preview-none` class, button gets `.active`. Saved as `emoji: ''`. Picking any emoji or hitting Random clears no-icon state.
- **Dials**: fourth icon source button `iconSrcNone` / `setIconSrc('none')` — hides all icon panels, saves `iconType: 'none', icon: ''`.
- Rendering skips the icon element entirely when no-icon; dial gets `.dial-no-icon` class.
