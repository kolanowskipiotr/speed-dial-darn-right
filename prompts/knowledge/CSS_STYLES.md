# css/style.css — Reference

## Section map (line numbers)
| Line | Section |
|------|---------|
| 1    | Google Fonts import (DM Sans, DM Mono) |
| 3    | `:root` non-color tokens: `--radius`, `--radius-sm`, `--transition` |
| 10   | Default theme (dark-yellow) on `body` — all CSS color vars |
| 30–100 | Theme overrides: dark-blue, dark-purple, dark-teal, light-blue, light-warm via `body[data-theme="..."]` |
| 126  | Header — grid layout (1fr auto 1fr): `.header-left` (logo + tagline), `.header-center` (clock + date), `.header-actions` |
| 226  | Theme selector buttons |
| 267  | Tabs bar — `.tabs-groups-sep` divider + `.group-jump-chip` inline group anchors |
| 337  | Main / groups container |
| 345  | Group blocks |
| 423  | Dials grid — `--dial-size` CSS var set inline per group |
| 438  | `.dial-card` — `width: var(--dial-size, 140px)`, `aspect-ratio: 4/3` |
| 508  | `.dial-card.dial-screenshot` — full-bleed image card with name gradient overlay |
| ~631 | `.dial-card.dial-no-icon` — name-only card (no icon), reduced padding, 9-line clamp |
| 677  | Modal / form styles |
| 784  | Dial size slider |
| ~833 | `.emoji-preview-none` — dashed border, italic `—` placeholder for no-icon state |
| 877  | Image upload zone (`#imgDropZone`, `#imgUploadPreview`) |
| ~909 | Icon source toggle buttons (`.icon-source-btn`, `.icon-source-row`) |

---

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

## Rules
- Never hardcode colours — always use the CSS variables above
- Dial size is controlled via `--dial-size` CSS var set inline on the group element
- Theme is applied via `data-theme` attribute on `body`

---

## No-icon dial card
```css
.dial-card.dial-no-icon {
    padding: 10px;          /* tighter than default 18px 12px 12px */
}
.dial-card.dial-no-icon .dial-name {
    -webkit-line-clamp: 9;  /* more lines since no icon takes space */
    width: 100%;
}
```

## Emoji preview — no-icon state
```css
.emoji-preview.emoji-preview-none {
    color: var(--text-dimmer);
    font-size: 16px;
    font-style: italic;
    border-style: dashed;
}
```
Applied by `setNoIcon(type)` / `openTabModal()` / `openGroupModal()` when emoji is `''`.

---

## Drag & drop visual indicators

### Dial position indicator (`drop-before` / `drop-after`)
Shows a dashed bracket on the left or right edge of the hovered dial card.
```css
body.edit-mode .dial-card.drop-before::after,
body.edit-mode .dial-card.drop-after::after {
    content: '';
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    border: 2px dashed var(--accent);
    border-radius: var(--radius);
    pointer-events: none;
    z-index: 20;
}
body.edit-mode .dial-card.drop-before::after {
    clip-path: inset(0 calc(100% - var(--radius)) 0 0);
}
body.edit-mode .dial-card.drop-after::after {
    clip-path: inset(0 0 0 calc(100% - var(--radius)));
}
```
**Why this works:** Full dashed border drawn, then clipped to only show the left/right vertical bar + corner arcs. `clip-path` width = `var(--radius)` shows exactly the rounded cap with no horizontal extension.

**Rejected approaches (do not revert to these):**
- `border: 2px dotted transparent; border-left-color: var(--accent)` — user dislikes dots (gaps), only shows half the corner arc
- Solid strip with `background` + `repeating-linear-gradient` — user wants dashes not solid
- `border: dashed; border-right: none` (C bracket) — shows top & bottom edges across full width ("too much")

### Tab drag-over indicator (`drag-over-tab`)
Tab reordering uses a simple border+background highlight, not the bracket indicator:
```css
.tab-btn.drag-over-tab {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
}
```

### Dial dragged over a different tab button (`dial-drag-over`)
```css
.tab-btn.dial-drag-over {
    outline: 2px dashed var(--accent);
    outline-offset: 2px;
}
```

### Empty group grid / group highlight
```css
.dials-grid.dial-drag-over { outline: 2px dashed var(--accent); }
.group.drag-over > .dials-grid { outline: 2px dashed var(--accent); }
```

### Cross-tab drop landing animation
```css
.dial-card.dial-just-dropped { animation: dial-drop-land 0.7s ease-out forwards; }
```
`dial-drop-land` keyframes: glow box-shadow expanding then fading + scale+rotate shake.

### Post-drag hover suppression
```css
body.post-drag .dial-overlay-btns { opacity: 0 !important; }
body.post-drag .dial-edit-overlay { background: transparent !important; }
```
Applied for 300ms after any drop via `resetHoverAfterDrag()` to prevent stuck hover overlays (Safari issue).
