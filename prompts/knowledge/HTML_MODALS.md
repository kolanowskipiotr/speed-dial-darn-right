# HTML Modals — Reference (speed-dial.html)

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
iconSrcFavicon, iconSrcEmoji, iconSrcCustom
```
