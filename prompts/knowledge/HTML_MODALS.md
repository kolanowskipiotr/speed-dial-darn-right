# HTML Structure & Domains — Reference

The application uses **nginx SSI** (`ssi on` in `nginx.conf`) to include domain-specific partials into `index.html`. File changes in the mounted Docker volume are live immediately.

## Domain Partial Map

### UI Domain (`domain/ui/`)
- `header.html` — Logo, clock, search, edit bar, and tab navigation.
- `main.html` — The core content area (`#groupsContainer`) and global toast.
- `modal-confirm.html` — Shared delete confirmation dialog.

### Dials Domain (`domain/dial/`)
- `modal-dial.html` — Add/Edit dial form including favicon, emoji, custom URL, and color pickers.
- `modal-tab.html` — Add/Edit tab form.
- `modal-group.html` — Add/Edit group form.

### Todo Domain (`domain/todo/`)
- `modal-list.html` — Add/Edit todo list.
- `modal-move.html` — Move todo item to another list.

### Notes Domain (`domain/note/`)
- `modal-conflict.html` — 3-pane side-by-side merge UI for Google Keep sync conflicts.
- `modal-import-keep.html` — List and import notes from Google Keep.

### Persistence Domain (`domain/persistence/`)
- `modal-data.html` — Unified Data Management modal (`#dataModal`). Two-column layout: left panel for Google Drive Sync (auth, folder select, auto-backup toggle, manage-on-disconnect toggle, backup list), right column stacked with Local File (export/import) and Google Keep Sync (sync-all button).

---

## Load Pattern (index.html)
```html
...
<!-- FEATURE DOMAIN PARTIALS -->
...
<!--#include virtual="/domain/todo/modal-move.html" -->
<!--#include virtual="/domain/note/modal-conflict.html" -->
<!--#include virtual="/domain/note/modal-import-keep.html" -->
<!--#include virtual="/domain/persistence/modal-data.html" -->
```

---

## Global UI IDs

- `#groupsContainer` — The main container where all tabs and dials are rendered.
- `#toast` — Fixed bottom-center notification popup.
- `#dial-url-tooltip` — Tooltip shown on dial hover (non-edit mode).

## Modal Logic
- `openModal(id)` / `closeModal(id)` toggle the `.open` class on the backdrop.
- All modals share a `.modal-backdrop` and `.modal` structure.
- Escape key closes all open modals.
