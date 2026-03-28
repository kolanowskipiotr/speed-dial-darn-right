# CSS Domains & Styles — Reference

Styles are organized into domains following the DDD structure.

## File Map

### core
- `domain/core/tokens.css` — Theme variables, font imports, and global tokens.
- `domain/core/base.css` — CSS reset and base body styles.
- `domain/core/layout.css` — Main layout grid and shared containers.
- `domain/core/animations.css` — Shared animations and transitions.

### ui
- `domain/ui/header.css` — Header layout, clock, search, and edit mode bar.
- `domain/ui/modals.css` — Modal backdrops, containers, and form elements.
- `domain/ui/pickers.css` — Emoji, color, and favicon picker styles.

### dials
- `domain/dial/styles.css` — Dial cards, grids, and dial-specific animations.

### todo
- `domain/todo/styles.css` — Todo lists, accordion items, and the item editor.

### notes
- `domain/note/styles.css` — Note tabs bar, CodeMirror integration, and Trash panel.

---

## Key CSS Variables (in tokens.css)
```css
--bg, --surface, --surface2, --surface3   /* backgrounds */
--border, --border-hover                  /* borders */
--accent, --accent2, --accent-text        /* brand colors */
--text, --text-dim, --text-dimmer         /* typography */
--danger, --success                       /* status */
--radius (14px), --radius-sm (8px)
--transition (0.2s cubic-bezier)
```

## DDD Implementation Details

### Notes Tabs Bar (Fixed)
The notes tabs bar now uses a flex layout with a separate scroll area to keep the Trash button anchored to the right:
```css
.notes-tabs-bar {
    display: flex;
    align-items: center;
    width: 100%;
    overflow: hidden;
}
.notes-tabs-scroll-area {
    display: flex;
    overflow-x: auto;
    flex: 1;
    scrollbar-width: none;
}
.notes-trash-btn {
    flex-shrink: 0;
    position: relative;
    z-index: 10;
}
```

### Fullscreen Modes
Fullscreen modes for Todo and Notes are toggled via classes on `body` (`.todo-fullscreen`, `.notes-fullscreen`). These classes override the grid layout in `layout.css` to give the active domain 100% of the viewport.
