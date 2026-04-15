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
- `domain/ui/header.css` — Header layout, clock, search, and edit mode bar, including visibility toggles via `body.hide-status-indicators`, `body.hide-header-search`, and `body.hide-header-clock`.
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

### weather
- `domain/weather/styles.css` — `.header-date-row` (clickable date+weather row), `#headerWeatherInline` (inline weather text), `.header-weather-col.weather-col-hidden` (hide weather column when disabled), `.weather-popup` (fixed-positioned popup), `.weather-days-strip` (horizontal scroll of day cards), `.weather-day-card` / `.weather-day-now` (individual day cards), config form elements (`.weather-cfg-row`, `.weather-cfg-coords`, `.weather-cfg-input`, `.weather-unit-btn`).

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

### Header M365 Compact Row
In `domain/ui/header.css`, `.m365-compact-row` uses `overflow: visible` so the `Join` CTA (including the `m365-join-btn--soon` flash effect) is not visually clipped.
The `m365-join-soon-blink` keyframes use a sharper LED-like glow (crisp outer ring + subtle inset core) and blink between the base/off CTA state and the filled/on state. The glow/blink is active when the meeting is within 5 minutes or already in progress. On `:hover` / `:focus-visible`, `.m365-join-btn--soon` stops the animation and stays pinned in the filled "on" state.

### Google Keep Sync UI

- **Sync Dot** (`.notes-tab-sync-dot`): Small indicator on note tabs. Uses status colors: `--text-muted` (off), `--accent` (in sync), `--warning` (pending/syncing), `--danger` (conflict).
- **Cloud Toggle** (`.notes-tab-keep-btn`): Icon button on note tabs. Active state (`.keep-active`) uses `--accent`.
- **Syncing Animation** (`.notes-keep-spinning`): 1.5s linear rotation applied to the Keep icon during active sync operations.
- **Conflict Modal** (`#notes-conflict-modal`): A 3-pane side-by-side grid layout (`.conflict-panes`) for merging Local, Merge result, and Keep versions.

