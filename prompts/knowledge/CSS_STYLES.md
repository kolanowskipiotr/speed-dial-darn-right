# CSS Domains & Styles — Reference

Styles are organized into domains following the DDD structure.

## File Map

### core
- `domain/core/tokens.css` — Theme variables, font imports, and global tokens.
- `domain/core/base.css` — CSS reset and base body styles.
- `domain/core/layout.css` — Main layout grid and shared containers.
- `domain/core/animations.css` — Shared animations and transitions.
- `domain/core/style.css` — **Deprecated stub only** (5-line comment pointing to the split files above). Do not add styles here.

### ui
- `domain/ui/header.css` — Header layout, clock, search, and edit mode bar.
- `domain/ui/modals.css` — Modal backdrops, containers, and form elements.
- `domain/ui/pickers.css` — Emoji, color, and favicon picker styles.

### dials
- `domain/dial/styles.css` — Dial cards, grids, and dial-specific animations.

### todo
- `domain/todo/styles.css` — Home layout grid, todo panel/header, accordion lists, items, inline content, done section, and add-input row.
- `domain/todo/editor.css` — Item editor split view, draggable divider, CM6 host, preview pane, move-list modal, drag-and-drop indicators, fullscreen mode, and responsive overrides.

### notes
- `domain/note/styles.css` — Note tabs bar, header controls, CM6 host, markdown preview, Mermaid, split.js gutter, trash panel, and fullscreen mode.
- `domain/note/keep-sync.css` — Keep sync dot, cloud toggle button, spinning animation, conflict modal 3-pane layout, and import modal list.

### persistence
- `domain/persistence/styles.css` — Data management modal layout (`.data-cols`, `.data-panel`, `.data-sep`), Google Drive sync section (`.gdrive-user-row`, `.gdrive-config-section`, `.gdrive-folder-row`, `.gdrive-backup-list`), backup type badges, and sync status row.

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

### Google Keep Sync UI

- **Sync Dot** (`.notes-tab-sync-dot`): Small indicator on note tabs. Uses status colors: `--text-muted` (off), `--accent` (in sync), `--warning` (pending/syncing), `--danger` (conflict).
- **Cloud Toggle** (`.notes-tab-keep-btn`): Icon button on note tabs. Active state (`.keep-active`) uses `--accent`.
- **Syncing Animation** (`.notes-keep-spinning`): 1.5s linear rotation applied to the Keep icon during active sync operations.
- **Conflict Modal** (`#notes-conflict-modal`): A 3-pane side-by-side grid layout (`.conflict-panes`) for merging Local, Merge result, and Keep versions.

