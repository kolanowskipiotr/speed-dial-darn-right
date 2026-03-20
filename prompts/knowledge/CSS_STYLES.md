# css/ — Reference

## File map (bounded context)
| File | Bounded context |
|------|----------------|
| `css/tokens.css` | Google Fonts `@import`, `:root` non-color tokens, ALL theme color variables (`body` default + `body[data-theme="…"]` overrides) |
| `css/base.css` | CSS reset (`* {}`), body base styles, `body::before` accent texture |
| `css/header.css` | `header`, `.header-top/left/center/actions`, logo, clock, edit toggle, edit-bar, `.btn-export`, `.tab-size-control`, theme selector (`.theme-btn`), tabs bar (`.tab-btn`, `.group-jump-chip`), search input + dropdown |
| `css/layout.css` | `main`, `.groups-container`, `.group`, group header elements, `.btn-icon`, group drag handle, `.add-group-btn`, empty state, toast, scrollbar |
| `css/dials.css` | `.dials-grid`, `.dial-card` and all variants (screenshot, color, no-icon), edit overlays, drag indicators, `@keyframes dial-drop-land`, add-dial-btn, home tab (`.home-section`, `.dial-meta`, `.dial-usage`) |
| `css/modals.css` | `.modal-backdrop`, `.modal`, form controls (`.form-group`, `.form-input`, `.emoji-preview`), size slider, icon source buttons, image upload zone, modal actions (`.btn-primary`, `.btn-secondary`), import modal styles |
| `css/pickers.css` | Color picker grid, favicon picker + tiles, emoji picker + search + grid, spinner |
| `css/animations.css` | Logo crash `@keyframes` + animation classes, `.logo-spark`, `.anim-toggle` |

> `css/style.css` is now empty (kept as a stub with a comment). All styles are in the files above.

---

## Key CSS variables (declared in `tokens.css` on `body`)
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

## URL tooltip on dial hover

`#dial-url-tooltip` — `position: fixed`, `z-index: 1000`, `transform: translateX(-50%)`. Positioned by JS below the hovered card (`rect.bottom + 6px`, centered on `rect.left + width/2`). Opacity transitions via `.visible` class. Hidden in edit mode. Only shown when `dial.url` exists.

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

---

## Logo crash animation classes

| Class | Description |
|-------|-------------|
| `.logo-char` | `display: inline-block` — applied to every character span split by JS |
| `.logo-driving` | `logo-drive-in` keyframe — translateX(110vw → var(--stop-x)); 0.4s |
| `.logo-driving-finish` | `logo-drive-finish` keyframe — translateX(var(--stop-x) → 0); 0.22s ease-in |
| `.logo-char-bow` | `logo-char-bow` keyframe — translateY + scale pop with spring overshoot; 0.36s |
| `.logo-char-impact` | `logo-char-impact` keyframe — per-letter bounce using `--bi` intensity (0–1); 0.34s |
| `.logo-char-vanish` | `logo-char-vanish` keyframe — scale(0.4) + opacity 0; 0.16s ease-in |
| `.logo-char-assemble` | `logo-char-assemble` keyframe — translate(--dx,--dy) rotate(--dr) → origin; 0.6s spring |
| `.logo-spark` | Fixed-position particle; accent colour with glow; `logo-spark-burst` 0.5s; auto-removed by JS |

`--stop-x` CSS custom property is set inline on `.logo` by JS before the animation starts (right edge of last tab minus logo left).

### Anim toggle
`.anim-toggle` — same structure as `.edit-toggle` (reuses `.toggle-track` / `.toggle-thumb`); `display: none` by default, `display: flex` when `body.edit-mode`. Active state styles scoped to `.anim-toggle.active`.

---

## Edit mode — action strip

In edit mode each dial card shows no overlay over its content. Instead, a frosted-glass action strip slides up from the card bottom on hover:

```css
.dial-edit-overlay {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    border-radius: 0 0 var(--radius) var(--radius);
    flex-direction: row;
    padding: 6px 4px;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(8px);
    transform: translateY(100%);        /* hidden below card edge */
    transition: transform var(--transition);
    pointer-events: none;
}
body.edit-mode .dial-edit-overlay { display: flex; }
body.edit-mode .dial-card:not(.dragging):hover .dial-edit-overlay { transform: translateY(0); }
```

Card has `overflow: hidden` so the strip is clipped until it slides in.

Hover in edit mode also highlights the border and adds a shadow (to signal the card is hovered):
```css
body.edit-mode .dial-card:not(.add-dial-btn):not(.dragging):hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-hover);
}
```

### Post-drag hover suppression
```css
body.edit-mode .dial-card.dragging .dial-edit-overlay { transform: translateY(100%) !important; }
body.post-drag .dial-edit-overlay { transform: translateY(100%) !important; }
```
Applied for 300ms after any drop via `resetHoverAfterDrag()` to prevent stuck hover overlays (Safari issue).
