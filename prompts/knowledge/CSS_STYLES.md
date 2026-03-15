# css/style.css — Reference

## Section map (line numbers)
| Line | Section |
|------|---------|
| 1    | Google Fonts import (DM Sans, DM Mono) |
| 3    | `:root` non-color tokens: `--radius`, `--radius-sm`, `--transition` |
| 10   | Default theme (dark-yellow) on `body` — all CSS color vars |
| 30–100 | Theme overrides: dark-blue, dark-purple, dark-teal, light-blue, light-warm via `body[data-theme="..."]` |
| 126  | Header |
| 226  | Theme selector buttons |
| 267  | Tabs bar |
| 337  | Main / groups container |
| 345  | Group blocks |
| 423  | Dials grid — `--dial-size` CSS var set inline per group |
| 438  | `.dial-card` — `width: var(--dial-size, 140px)`, `aspect-ratio: 4/3` |
| 508  | `.dial-card.dial-screenshot` — full-bleed image card with name gradient overlay |
| 677  | Modal / form styles |
| 784  | Dial size slider |
| 877  | Image upload zone (`#imgDropZone`, `#imgUploadPreview`) |

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
