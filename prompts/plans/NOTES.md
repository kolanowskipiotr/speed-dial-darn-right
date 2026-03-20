# Plan: Notes

**Status:** Early draft — many open questions
**Date:** 2026-03-19

---

## Overview

A Sublime-style multi-tab text/code/markdown editor embedded in the home tab.
Occupies the right 70% of the bottom content row (or full-width on narrow screens).
Can go full-screen (same mechanism as Todo lists — `body.notes-fullscreen` CSS class).

---

## Feature summary (confirmed)

| Capability | Detail |
|-----------|--------|
| Editor engine | CodeMirror 6 — same library as Todo markdown editor, loaded once |
| Syntax highlighting | Per-tab language: Markdown, JS, TS, Python, HTML, CSS, JSON, plain text, more |
| Find | `Ctrl+F` — `@codemirror/search` |
| Find & replace | `Ctrl+H` — same extension |
| Regex search | Toggle in the search panel |
| Multi-cursor | `Alt+Click`, `Ctrl+D` (select next occurrence) — Sublime-style |
| Auto-closing brackets | `closeBrackets()` from `@codemirror/autocomplete` |
| Tabs | Multiple notes open as tabs, same visual style as existing app tabs |
| Full-screen | `body.notes-fullscreen` hides everything else; `Escape` or button to exit |
| Auto-save | No save button — content saved on change (debounced ~500ms) |
| Theming | CodeMirror theme matches app CSS variables |
| Images | Pasted/dropped images upload and insert as `![alt](/uploads/id.ext)` inline at cursor; CodeMirror widget decoration renders them as actual `<img>` elements in the editor |

---

## CodeMirror 6 setup (shared with Todo)

```html
<script type="module">
  import { EditorView, basicSetup } from 'https://esm.sh/codemirror@6'
  import { markdown } from 'https://esm.sh/@codemirror/lang-markdown@6'
  import { javascript } from 'https://esm.sh/@codemirror/lang-javascript@6'
  import { closeBrackets } from 'https://esm.sh/@codemirror/autocomplete@6'
  // ... other language packages as needed

  // shared factory used by both Notes and Todo
  window.createEditor = (parent, lang, doc) => new EditorView({
    doc,
    extensions: [basicSetup, lang(), closeBrackets()],
    parent
  })
</script>
```

Load order: this module script runs after the classic scripts. `window.createEditor` is available to `js/notes.js` and `js/todo.js`.

---

## Data model (draft)

Notes are stored in `data.notes` alongside `data.tabs` and `data.todoLists`.

```js
{
  tabs: [...],
  todoLists: [...],
  notes: [
    {
      id: string,           // uid()
      name: string,         // tab label
      language: string,     // 'markdown' | 'javascript' | 'python' | 'html' | 'css' | 'json' | 'text' | ...
      content: string,      // raw text
      createdAt: string,    // ISO 8601
      updatedAt: string,
      order: number,        // tab order
      // no images[] field — inline image refs live in content as ![alt](/uploads/id.ext)
    }
  ],
  activeNoteId: string | null  // ? or keep in JS state only — see open questions
}
```

Migration: `loadData()` adds `if (!data.notes) data.notes = []`.

---

## Layout in home tab

```
wide screen:
┌──────────────────────────────────────────┐
│  ★ Most Used · · · · 🕐 Recently Used    │
├─────────────────┬────────────────────────┤
│   To-Do Lists   │        Notes           │
│   ~30% width    │      ~70% width        │
└─────────────────┴────────────────────────┘

narrow screen (<900px):
┌──────────────────┬───────────────────────┐
│  Commonly Used   │     To-Do Lists       │
│     Dials        │                       │
├──────────────────┴───────────────────────┤
│              Notes                       │
└──────────────────────────────────────────┘
```

Notes panel structure:
```
┌──────────────────────────────────────────┐
│ [note1.md ×] [script.js ×] [+]    [⤢]   │  ← tab bar + new-note btn + full-screen btn
├──────────────────────────────────────────┤
│                                          │
│   Some text                              │
│                                          │
│   [    rendered image inline    ]        │  ← CodeMirror widget decoration
│                                          │
│   More text                              │
│                                          │
└──────────────────────────────────────────┘
```

- Paste/drop image anywhere in editor → uploads → inserts `![image](/uploads/id.ext)` at cursor
- CodeMirror widget decoration renders `![...](...)` as actual `<img>` when cursor is off the line
- **No resizing** — original format and dimensions preserved
- Shared `extractUploadIds()` utility and `cm-image-widget` ViewPlugin with Todo

---

## Full-screen mode

Same mechanism as Todo:

```css
body.notes-fullscreen .home-col-todo,
body.notes-fullscreen .home-dials-strip,
body.notes-fullscreen #headerClock,
body.notes-fullscreen #headerDate,
body.notes-fullscreen #headerDialCount,
body.notes-fullscreen .tabs-bar {
    display: none;
}
body.notes-fullscreen .home-col-notes {
    flex: 1 1 100%;
    max-width: 100%;
}
```

`Escape` exits (checked before modal-close handler in `js/init.js`).

---

## New JS module: `js/notes.js`

| Function | Purpose |
|----------|---------|
| `renderNotesPanel()` | Builds tab bar + editor mount; called from `renderHomeTab()` |
| `openNote(id)` | Switch active note; destroy current CM instance, mount new one |
| `addNote(lang?)` | Insert new note, auto-focus tab name for rename |
| `deleteNote(id)` | `showConfirm` → delete + switch to adjacent note |
| `renameNote(id, name)` | Inline rename via double-click on tab label |
| `saveNoteContent(id)` | Debounced — reads `view.state.doc.toString()`, `saveData()` |
| `setNoteLanguage(id, lang)` | Change syntax highlighting; recreate CM instance with new lang |
| `toggleNotesFullScreen()` | Toggles `body.notes-fullscreen` |
| `activeNoteId` | Module-level state |
| `cmView` | Current CodeMirror `EditorView` instance |

---

## New CSS file: `css/notes.css`

```
.notes-panel              flex column, fills .home-col-notes
.notes-tab-bar            flex row, tab buttons + add btn + full-screen btn
.notes-tab                single tab button; same base style as .tab-btn
.notes-tab.active         highlighted
.notes-tab-close          × button on each tab
.notes-editor-wrap        fills remaining height; CodeMirror mounts here
.cm-editor                CodeMirror root — height 100%, themed to CSS vars
```

---

## Open questions

1. **Note naming:** Does a new note get a default name ("Untitled", "note-1") or immediately prompt for a name? Inline rename on tab double-click seems right — but should the name be required or optional?

2. **Language detection:** Auto-detect language from file-extension-style name (e.g. `script.js` → JavaScript)? Or always manual via a dropdown?

3. **Note ordering:** Drag-to-reorder tabs (like browser tabs)? Or fixed order with reorder arrows?

4. **Storage limit:** Notes stored in `localStorage` alongside everything else. A single large note could hit the ~5MB localStorage limit. Should large notes warn the user? Should notes eventually move to the uploader volume (flat files)?

5. **Export/import:** Confirmed — Notes are included in the existing `exportData()` / `_doImport()` flow. Content is stored as a plain JSON string value — no base64 needed. `JSON.stringify()` correctly escapes all text including JSON code, curly braces, backslashes, and newlines. The export file stays human-readable.

6. **Markdown preview:** For Markdown notes, should there be an optional rendered preview mode (split or toggle)? Or is the CodeMirror inline decoration (same as Todo) sufficient?

7. **Note tabs vs app tabs:** The Notes tab bar lives inside the home tab. Visually it will look like a second tier of tabs. Is that acceptable, or should Notes notes be integrated into the main app tab bar somehow?

8. **Find/replace scope:** Does `Ctrl+F` search within the current note only, or across all notes? (Across all is complex — current-note-only is the obvious first implementation.)

9. **Syntax highlighting theme:** CodeMirror ships with `oneDark` and a few others. Should it use one of those, or should we build a custom theme that reads the app's CSS variables so it changes with the app theme?

10. **Line numbers:** Show by default (included in `basicSetup`), or hide to keep it feeling less "IDE-like"?

---

## Export / Import

Notes are included in the existing `exportData()` / `_doImport()` flow in `js/pickers.js`.

### Content encoding

No special encoding needed. `JSON.stringify()` handles all text correctly — quotes, braces, backslashes, newlines, embedded JSON — everything. Plain string values in JSON. The export file remains human-readable and you can open it in any text editor and read your notes.

Base64 is only used for **binary image data** (fetched as raw bytes from `/uploads/`), same as dial icons today.

### Export shape (additions only)

```js
{
    tabs: [...],               // unchanged
    todoLists: [...],          // from Todo feature
    notes: [                   // new — content is a plain JSON string
        { id, name, language, content, createdAt, updatedAt, order }
    ],
    _config: { theme, logoAnim },
    _images: { ... }           // unchanged
}
```

Images live inline in `note.content` as `![alt](/uploads/id.ext)` markdown. No separate `images[]` field.

On export: scan `content` for `/uploads/` references via `extractUploadIds(content)` (shared utility with Todo), fetch each as base64, add to `_images` map.

On import: re-upload from `_images`; content paths are preserved so no rewriting needed.

On note delete: `extractUploadIds(note.content).forEach(id => deleteDialImage(id))`.

Images are stored at **original size and format — no resizing**. Same uploader change as Todo (preserve file extension).
