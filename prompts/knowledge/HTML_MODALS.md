# HTML Structure & Domains — Reference

The application uses **nginx SSI** (`ssi on` in `nginx.conf`) to include domain-specific partials into `index.html`. File changes in the mounted Docker volume are live immediately.

## Domain Partial Map

### UI Domain (`domain/ui/`)
- `header.html` — Logo, clock, search, edit bar, and tab navigation.
- `main.html` — The core content area (`#groupsContainer`) and global toast.
- `modal-confirm.html` — Shared delete confirmation dialog.
- `modal-import.html` — Configuration import UI (file pick or paste).

### Dials Domain (`domain/dial/`)
- `modal-dial.html` — Add/Edit dial form including favicon, emoji, custom URL, and color pickers.
- `modal-tab.html` — Add/Edit tab form.
- `modal-group.html` — Add/Edit group form.

### Todo Domain (`domain/todo/`)
- `modal-list.html` — Add/Edit todo list.
- `modal-move.html` — Move todo item to another list.

---

## Load Pattern (index.html)
```html
<!--#include virtual="/domain/ui/header.html" -->
<!--#include virtual="/domain/ui/main.html" -->
<!--#include virtual="/domain/ui/modal-confirm.html" -->
<!--#include virtual="/domain/ui/modal-import.html" -->

<!-- FEATURE DOMAIN PARTIALS -->
<!--#include virtual="/domain/dial/modal-dial.html" -->
<!--#include virtual="/domain/dial/modal-tab.html" -->
<!--#include virtual="/domain/dial/modal-group.html" -->
<!--#include virtual="/domain/todo/modal-list.html" -->
<!--#include virtual="/domain/todo/modal-move.html" -->
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
