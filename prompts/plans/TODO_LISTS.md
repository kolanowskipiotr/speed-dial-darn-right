# Plan: To-Do Lists on Home Tab

**Status:** Draft
**Date:** 2026-03-19

---

## Overview

Add a persistent, multi-list to-do system as the right half of the Home (Start) tab.
The left half stays as the existing "Frequently Used" dials widget.
No other tabs are affected.

---

## Feature summary

| Capability | Detail |
|-----------|--------|
| Multiple lists | Each list has a name + emoji (like groups of dials) |
| Items | Multiline text, pasted/dropped images, optional markdown |
| Markdown rendering | Inline/live — see §Markdown Library below |
| Images | Uploaded to `/uploads/` via the uploader sidecar; deleted when item is deleted |
| Timestamps | `createdAt`, `updatedAt`, `doneAt` stored as ISO strings |
| Lifecycle | Active → Done (archived) → Deleted |
| Drag to reorder | Items within a list, drag-handle same style as dial drag |
| Move between lists | `⋯` menu → pick list, or drag item onto collapsed list header |
| Collapsed view | Only first line of content visible; click to expand |
| Expand view | Full content rendered inline (no modal, inline expansion) |
| Full-screen mode | Todo panel expands to fill the entire tab interior; dials column + header elements hide |

---

## Markdown library recommendation

**Chosen: [CodeMirror 6](https://codemirror.net/) with `@codemirror/lang-markdown`**

This is the exact UX described: markdown syntax stays visible and editable as plain text, but is visually decorated in-place as you type:
- `# Heading` — `#` stays, whole line is large + bold
- `**bold**` — asterisks stay, text between is bold
- `_italic_` — underscores stay, text is italic
- `- item` — dash stays, line gets list indentation

Copy-pasting the editor content gives clean plain markdown — no hidden HTML.

**Why not Typora / Vditor IR mode:**
Those *hide* the syntax markers when the cursor moves away. The user explicitly wants the markers visible at all times.

**CDN loading (no build step):**
```html
<script type="module">
  import { EditorView, basicSetup } from 'https://esm.sh/codemirror@6'
  import { markdown } from 'https://esm.sh/@codemirror/lang-markdown@6'

  const view = new EditorView({
    extensions: [basicSetup, markdown()],
    parent: document.getElementById('todo-editor')
  })
</script>
```

The rest of `index.html` can remain classic scripts — only the editor init needs `type="module"`.

**Image paste** is handled by intercepting the `paste` event on the EditorView DOM, not by a markdown plugin — see Image section below.

**Getting value:** `view.state.doc.toString()` returns the raw markdown string for `saveData()`.

---

## Data model changes

Extend `data` with a top-level `todoLists` array (alongside `tabs`).

```js
// data in localStorage key: speedDial_v2
{
  tabs: [ ... ],            // unchanged
  todoLists: [
    {
      id: string,           // uid()
      name: string,
      emoji: string,        // '' = no icon
      createdAt: string,    // ISO 8601
      order: number,        // integer; lists sorted ascending; reordered via drag
      items: [
        {
          id: string,       // uid()
          content: string,  // raw markdown; inline images as ![alt](/uploads/id.ext)
          isDone: boolean,  // no separate images[] — upload IDs extracted from content on delete
          createdAt: string,
          updatedAt: string,
          doneAt: string | null,
          order: number     // integer; items sorted ascending by default; done items sort by doneAt desc
        }
      ]
    }
  ]
}
```

**Migration:** `loadData()` adds `if (!data.todoLists) data.todoLists = [{ id: uid(), name: 'TODO', emoji: '✅', createdAt: now, order: 0, items: [] }]` — creates the default list if none exist. No destructive change.

---

## Layout: Home tab

**Option A confirmed.** The home tab is a two-zone layout:

```
┌──────────────────────────────────────────┐
│  ★ Most Used · · · · 🕐 Recently Used    │  ← dials strip (top)
├─────────────────┬────────────────────────┤
│   To-Do Lists   │        Notes           │  ← content row (bottom)
│   ~30% width    │      ~70% width        │
└─────────────────┴────────────────────────┘
```

### Dials strip (top zone)
- Two sub-sections side by side: "Most Used" and "Recently Used"
- Hard cap on number of icons shown (e.g. 8–12 each, TBD)
- Existing `renderHomeTab()` logic provides the data — just rendered in a strip layout instead of the current full-width grid
- Height is fixed/compact — enough for one or two rows of dial cards

### Content row (bottom zone)
- **Left ~30%:** To-Do Lists panel (accordion, see below)
- **Right ~70%:** Notes panel (future feature — reserved space, renders a placeholder for now)
- Both panels can go full-screen independently (hide everything else, fill the tab interior)

### Responsive

**Wide screen (default):**
```
┌──────────────────────────────────────────┐
│  ★ Most Used · · · · 🕐 Recently Used    │
├─────────────────┬────────────────────────┤
│   To-Do Lists   │        Notes           │
└─────────────────┴────────────────────────┘
```

**Narrow screen (below ~900px):**
```
┌──────────────────┬───────────────────────┐
│  Commonly Used   │     To-Do Lists       │
│     Dials        │                       │
├──────────────────┴───────────────────────┤
│              Notes                       │
└──────────────────────────────────────────┘
```

Dials strip collapses into the top-left, Todo moves top-right (both ~50%), Notes spans full width below.
Breakpoint: `~900px` — single CSS media query on `.home-layout-a`.

### CSS structure
```
.home-layout-a            top-level flex column
.home-dials-strip         top zone: flex row, two sub-sections
.home-dials-most-used     left sub-section
.home-dials-recent        right sub-section
.home-content-row         bottom zone: flex row
.home-col-todo            left 30%
.home-col-notes           right 70% (placeholder until Notes feature built)
```

- A `+` button in the todo panel header adds a new list

---

## Todo panel: accordion navigation

Lists are stacked vertically as an accordion. One list is **active** (expanded); all others are **collapsed** (header only). The panel scrolls as a single unit — no nested scroll containers.

```
┌──────────────────────────────┐
│ 📋 List 1              [+][⤢]│  ← panel header: add list, full-screen
├──────────────────────────────┤
│ ▼ 📝 Work              [✏️][⋯]│  ← active list header (expanded)
│    ☐ Write the report        │  ← todo item (single line, first line only)
│    ☐ Review PR               │
│    ☐ Schedule meeting        │
│    ▶ Done (2)                │  ← done section, collapsed by default
├──────────────────────────────┤
│ ▶ 🏠 Home                    │  ← collapsed list (header only)
├──────────────────────────────┤
│ ▶ 🛒 Shopping                │  ← collapsed list (header only)
└──────────────────────────────┘
```

### Accordion rules

- **One list expanded at a time.** Clicking a collapsed list header expands it and collapses the current one.
- **Collapsed list** shows: drag handle + expand chevron + emoji + name + active item count badge `(N)` (done items not counted).
- **Active list** shows: drag handle + collapse chevron + emoji + name + `✏️` (edit name/emoji) + `⤒+` + `⤓+` add buttons.
- **Order** preserved — lists render in their defined `order` field; reordered via drag.
- **On page load / refresh:** always expand the first list (`data.todoLists[0]`). Active list state is not persisted — no need to store it.

### Done section

- Appears as the last row of each active list: `▶ Done (N)` — collapsed by default.
- Clicking it toggles open, showing done items (dimmed + strike-through on first line) inline below.
- Toggle state is **JS-only** (`doneExpandedListId` variable) — resets to collapsed on every page load. No persistence needed.
- Done items have the same item row actions: mark undone, delete, move.

### Scrolling

The panel is a single `overflow-y: auto` container. Natural document flow means collapsed list headers always sit below the active list's items. As the active list grows, other list headers are pushed down — but they remain visible below the fold after a short scroll. No sticky positioning needed.

### Item row (active list, collapsed item state)

```
[drag] [☐] First line of todo text…   🖼  [↑—][↓—][✏️][🗑][⋯]
```

- **Todo lists are fully self-managing — global edit mode has zero interaction with todo lists.** All actions always available.
- **Drag handle:** leftmost, always visible, always active — no edit-mode gate.
- **Checkbox:** marks as done → item moves to Done section. Clicking again in Done section → moves back to active.
- **Text (first line):** single click → expands inline to show full content as **rendered markdown** (read-only). Click again or press `Escape` to collapse.
- **`✏️` button** (hover): opens full-screen CodeMirror editor. This is the **only** way to edit — no double-click.
- **`🖼` badge:** shown if content contains inline images. Hidden otherwise.
- **Action buttons** (visible on row hover): `↑—` move to top, `↓—` move to bottom, `🗑` delete (undo toast — no confirm modal), `⋯` move to another list.
- Add icon constants to `ICONS`: `ICONS.moveTop`, `ICONS.moveBottom` — use arrow-with-line emoji (e.g. `⬆` / `⬇` or similar; pick from emoji set during implementation).

### Adding an item

Active list header shows two add buttons:
- **`⤒+` Add to top** — inserts new blank item at the top of the list
- **`⤓+` Add to bottom** — inserts new blank item at the bottom of the list

Both open an inline single-line plain text input, auto-focused.

**Keyboard behaviour of the inline add input:**
- `Enter` — commit the item, close the input, auto-save. Empty content not allowed — if blank, commit is blocked (visual shake or highlight).
- `Shift+Enter` — no action (reserved, does nothing).
- `Escape` — cancel; if any text was typed show a small confirm popup ("Discard new item?"); if input was empty cancel silently.

After committing, the item appears in the list as a collapsed row. To write multiline content or paste images, open full-screen edit from the new row.

**Empty items not allowed.** An item with no text and no images cannot be saved. If an existing item's content is deleted entirely during full-screen edit, on close show confirm: "Item is empty — delete it or keep editing?"

### Drag — items and lists

**Item reorder (within list):** drag handle on every item row, always active. Drop between items reorders in place. No edit-mode dependency.

**Item move (between lists):** drag an item and drop onto a **collapsed list header** → moves item to the **top** of that list. Target list header highlights on drag-over. On drop: target list expands, source list collapses (since it is no longer the active list).

**List reorder:** list headers are themselves draggable. Drag a list header to reposition the list in the accordion order. Drop indicator (dashed line) appears between lists during drag.

---

## Full-screen mode

A toggle button on the todo panel header expands the todo section to fill the entire tab interior.
Everything else — the dials column, header clock, tab bar, dial count — stays mounted in the DOM but is hidden with CSS.

### Trigger

A small **expand icon button** (`⤢` or `⛶`) in the top-right corner of the todo panel header.
Clicking it again (or pressing `Escape`) exits full-screen mode.

### State

One boolean: `todoFullScreen` (module-level in `js/todo.js`).

```js
function toggleTodoFullScreen() {
    todoFullScreen = !todoFullScreen;
    document.body.classList.toggle('todo-fullscreen', todoFullScreen);
    // update button icon
}
```

### CSS

`body.todo-fullscreen` class drives everything via CSS — no JS style manipulation:

```css
/* Hide everything except the todo column */
body.todo-fullscreen .home-col-dials,
body.todo-fullscreen #headerClock,
body.todo-fullscreen #headerDate,
body.todo-fullscreen #headerDialCount,
body.todo-fullscreen .tabs-bar {
    display: none;
}

/* Todo column goes full width */
body.todo-fullscreen .home-col-todo {
    flex: 1 1 100%;
    max-width: 100%;
}

/* Give the item list more vertical room */
body.todo-fullscreen .todo-items {
    max-height: calc(100vh - 160px); /* adjust for header + list chips */
    overflow-y: auto;
}
```

The header itself (logo, edit toggle, settings) stays visible — only the data-display elements are hidden. This keeps the user oriented and lets them exit edit mode or navigate to another tab.

### CodeMirror only lives in full-screen editor

CodeMirror is instantiated only when `openItemEditor()` is called and destroyed when `closeItemEditor()` is called. It never appears in the list view. In full-screen panel mode the editor simply has more vertical space available via CSS — no extra JS needed.

### Keyboard shortcut

`Escape` exits full-screen mode if `todoFullScreen` is true (checked before the existing modal-close escape handler in `js/init.js`).

---

## New JS module: `js/todo.js`

Load after `js/render.js`, before `js/init.js`.

### Functions

| Function | Purpose |
|----------|---------|
| `renderTodoPanel()` | Builds the entire right column; called from `renderHomeTab()` |
| `renderTodoAccordion()` | Renders all list headers + active list items; replaces old chip-based navigation |
| `renderTodoItems(listId)` | Renders items for the active list |
| `makeTodoItemRow(item)` | Returns a single item DOM node |
| `inlineExpandItem(id)` | Renders full content as read-only markdown HTML below first line; collapses any previously expanded item |
| `inlineCollapseItem(id)` | Collapses back to first-line view |
| `openItemEditor(id)` | Opens full-screen CodeMirror editor for the item; only entry point to editing |
| `closeItemEditor()` | Closes full-screen editor; validates non-empty; auto-saves; returns to list view |
| `openTodoListModal(listId?)` | Open add/edit modal for a list |
| `saveTodoList()` | Save list name+emoji from modal |
| `deleteTodoList(id)` | `showConfirm` with message "Delete list and its N items?" → delete list, scan all item content for `/uploads/` refs, call `deleteDialImage()` for each |
| `addTodoItem(listId, position)` | `position`: `'top'` or `'bottom'`; inserts inline single-line input at the correct position |
| `saveTodoItem(id)` | Persist content edits; update `updatedAt` |
| `toggleTodoDone(id)` | Flip `isDone`; set/clear `doneAt` |
| `deleteTodoItem(id)` | `showToastUndo()` (no confirm modal) → scan `extractUploadIds(item.content)` → `deleteDialImage()` for each |
| `moveTodoItem(id, targetListId)` | Move item to top of target list; expand target list; collapse source list |
| `initTodoDragDrop()` | Item drag-to-reorder within list |
| `toggleTodoFullScreen()` | Toggles `todoFullScreen` bool + `body.todo-fullscreen` class |
| `activeTodoListId` | Module-level state variable (which list chip is selected) |
| `todoFullScreen` | Module-level boolean; `false` by default |

### Item images (inline)

Images are pasted/dropped directly into the CodeMirror editor and rendered **inline in the text** using CodeMirror widget decorations. The markdown source contains a standard `![alt](/uploads/id.png)` reference; CodeMirror replaces it visually with the actual `<img>` element while the cursor is elsewhere on the line.

#### Two distinct item views

**Inline expanded (read-only)** — triggered by single click on item text:
```
[drag] [☐] First line of todo text             [✏️][🗑][⋯]
         Full rendered markdown content
         (using marked.js, same as collapsed first-line preview)

         [    rendered image here    ]

         createdAt / updatedAt shown here? → No, timestamps only in full-screen editor
```
Grows freely in height — no max-height cap. Click again or `Escape` to collapse.

**Full-screen editor** — triggered by `✏️` button only:
```
┌─────────────────────────────────────────┐
│  [←] back                    createdAt  │  ← timestamps shown here
│       updatedAt                         │
├─────────────────────────────────────────┤
│                                         │
│   CodeMirror editor (full height)       │
│   with markdown decoration + image      │
│   widget rendering inline               │
│                                         │
└─────────────────────────────────────────┘
```
`[←]` back button or `Escape` closes editor, validates non-empty, auto-saves.

When the cursor is on the `![...]()` line the raw markdown syntax is shown; when cursor moves away CodeMirror renders the image widget.

#### Paste / drop flow

1. Intercept `paste` or `drop` event on the CodeMirror EditorView DOM
2. Extract `File` from `e.clipboardData` or `e.dataTransfer`
3. POST raw blob to `/api/upload/<uid>.<ext>` — **no resize**, original format preserved
4. Insert `![image](/uploads/<uid>.<ext>)` at the current cursor position via a CodeMirror transaction
5. `saveData()` — auto-save

#### Storage — no resizing

Unlike dial custom icons, todo images are **not resized**. `resizeImage()` is **not called**. Original format and dimensions are preserved.

The upload ID includes the file extension: `uid() + '.' + ext` (e.g. `lx3k9z2a.png`) so the sidecar stores the correct format.

> **Uploader change required:** `server.js` currently appends `.jpg` unconditionally. It must use the filename from the request instead. See Changes to existing files.

#### No `images[]` array on item

There is no separate `images[]` field. Images are referenced only via the markdown content. For cleanup on item delete, scan `item.content` for `/uploads/` references:

```js
function extractUploadIds(content) {
    const re = /\/uploads\/([\w.\-]+)/g;
    const ids = [];
    let m;
    while ((m = re.exec(content)) !== null) ids.push(m[1]);
    return ids;
}

// on delete:
extractUploadIds(item.content).forEach(id => deleteDialImage(id));
```

#### CodeMirror image widget

A small ViewPlugin scans the document for `![...](.*)` nodes from the markdown syntax tree and replaces each with a `Decoration.widget` containing an `<img>` element. When the cursor enters the line, the decoration is removed so the raw syntax is editable.

```js
// sketch — actual implementation in js/todo.js or a shared js/cm-image-widget.js
const imageWidget = ViewPlugin.fromClass(class {
    update(update) { this.decorations = buildImageDecorations(update.view); }
}, { decorations: v => v.decorations });
```

#### Collapsed item row (list view)

If `item.content` contains at least one `/uploads/` reference, show a small `🖼` indicator next to the first-line text. No inline images in the collapsed view.

---

## Empty states

| Situation | What to show |
|-----------|-------------|
| No lists (fresh install) | Never happens — migration always creates a default "TODO ✅" list |
| List exists, no active items | "No items yet — add one with ⤒+ or ⤓+" dimmed placeholder inside `.todo-items` |
| List exists, all items done | Same placeholder + Done section visible with its items |
| Item content empty + no images | Not allowed — blocked on save (inline add) or prompt on exit (full-screen edit) |
| Item content is only image(s) | Collapsed row shows `(image)` as first-line text fallback, plus `🖼` badge |

---

## `⋯` menus

### Item `⋯` (move to another list)
Opens a small inline popover listing all other lists with their emoji + name. Clicking one moves the item there (appended to end of target). No modal needed — a simple absolutely-positioned list dismissed by click-outside or `Escape`.

### List `✏️` button (edit list)
Opens the todo list modal (name + emoji). No `⋯` on the list header — edit is the only non-drag action. Delete is inside the edit modal (same pattern as groups of dials).

---

## New HTML fragments (add to `index.html`)

### 1. Todo list modal (add / edit list)

Same structure as the existing group modal:

```html
<div id="todoListModal" class="modal-backdrop" style="display:none">
  <div class="modal">
    <h2 id="todoListModalTitle">New List</h2>
    <div class="form-group">
      <label>Name</label>
      <input id="todoListName" class="form-input" type="text" placeholder="List name…">
    </div>
    <div class="form-group">
      <label>Icon</label>
      <button class="emoji-preview" id="todoListEmojiPreview" onclick="toggleEmojiPicker('todoList')">📋</button>
      <!-- emoji picker for todoList type injected here by initEmojiPickers() -->
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeTodoListModal()">Cancel</button>
      <button id="btnDeleteTodoList" class="btn-secondary btn-danger" onclick="deleteTodoListFromModal()" style="display:none">Delete</button>
      <button class="btn-primary" onclick="saveTodoList()">Save</button>
    </div>
  </div>
</div>
```

### 2. Todo move-item picker (small popover or a simple modal)

```html
<div id="todoMoveModal" class="modal-backdrop" style="display:none">
  <div class="modal" style="max-width:320px">
    <h2>Move to list</h2>
    <div id="todoMoveListOptions"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeTodoMoveModal()">Cancel</button>
    </div>
  </div>
</div>
```

---

## New CSS file: `css/todo.css`

Add to the CSS section map in `CSS_STYLES.md` knowledge file.

Key selectors / blocks:

```
.home-layout               flex row, gap, splits home tab into two columns
.home-col-dials            left column, existing dials content
.home-col-todo             right column, todo panel

.todo-panel                right column; overflow-y: auto; single scroll container
.todo-panel-header         "To-Do" label + add-list btn + full-screen btn

.todo-list                 one accordion section
.todo-list-header          always-visible row: chevron + emoji + name + count/actions
.todo-list-header.active   expanded state styling (accent left border or similar)
.todo-list-header.collapsed  clickable, cursor pointer, chevron points right

.todo-items                item rows container; display: none when list collapsed
.todo-item                 single row; flex; border-bottom; cursor pointer
.todo-item.done            opacity 0.45; first-line text has line-through
.todo-item.inline-expanded shows rendered markdown content below first line; grows freely
.todo-item-drag-handle     leftmost; always visible; no edit-mode dependency
.todo-item-check           checkbox/circle, clicking marks done/undone
.todo-item-first-line      truncated with ellipsis; click → inline expand/collapse
.todo-item-inline-content  rendered markdown HTML; hidden by default; shown when .inline-expanded
.todo-item-actions         right side: ↑— ↓— ✏️ 🗑 ⋯ ; visible on hover; no edit-mode dependency
.todo-item-add-input       inline single-line input for new item; inserted at top or bottom of list

.todo-done-section         collapsible "Done (N)" row + its items
.todo-done-header          "▶ Done (N)" toggle row
.todo-done-items           done item rows; hidden when collapsed

/* Full-screen edit view */
.todo-edit-view            full-screen item editor container
.todo-edit-back            back/close button top-left
.todo-edit-cm              CodeMirror editor area, fills available height

/* CodeMirror inline image widget */
.cm-todo-image             <img> rendered by widget decoration; max-width 100%; cursor pointer
.todo-image-badge          🖼 indicator on collapsed item rows when content has images
```

Use only CSS vars — no hardcoded colours.

---

## Emoji picker extension

`initEmojiPickers()` (in `js/pickers.js`) needs to build a picker for `'todoList'` type.
- `currentTodoListEmoji` state var in `js/state.js`
- `ICONS` needs a `defaultTodoList` key (e.g. `'📋'`)
- `selectEmoji('todoList', emoji)` branch in `selectEmoji()`

---

## Changes to existing files

| File | Change |
|------|--------|
| `js/state.js` | Add `currentTodoListEmoji`, `activeTodoListId`, `editingTodoListId`, `editingItemId` state vars; add `ICONS.defaultTodoList`, `ICONS.check`, `ICONS.uncheck`, `ICONS.moveTop`, `ICONS.moveBottom` — pick arrow-with-line emoji during implementation |
| `js/persistence.js` | `loadData()` — add `if (!data.todoLists) data.todoLists = []` migration line |
| `js/render.js` | `renderHomeTab()` — full rewrite; builds `.home-layout-a` with dials strip + content row; calls `renderTodoPanel()` for todo col; renders an empty `.home-col-notes` placeholder for notes col |
| `js/pickers.js` | `initEmojiPickers()` — add `buildEmojiPicker('todoListEmojiPicker', 'todoList')`; `selectEmoji()` — add `'todoList'` branch |
| `index.html` | Add `<script src="js/todo.js">` after `render.js`; add `<link rel="stylesheet" href="css/todo.css">`; add todo modals |
| `css/dials.css` | Remove full-width assumption from `.home-section` if needed |
| `uploader/server.js` | Use filename from request instead of hardcoding `.jpg` extension, so original image formats (PNG, GIF, WebP, etc.) are preserved |

---

## Drag behaviour (consolidated)

- `item.order` is an integer; items rendered sorted ascending
- **Within-list drop:** recalculate order values, `saveData()`, re-render items
- **Cross-list drop** (onto a list header): move item to `order = 0` (top) of target list, shift other items' order up; expand target list, collapse source list; `saveData()`, re-render
- **List header drop:** recalculate list `order` values, `saveData()`, re-render accordion
- Implementation in `js/todo.js` — three drag contexts handled separately, follows same pattern as `js/drag-drop.js`

---

## Done / Archived items

- Done items remain in `items[]` but with `isDone: true` and `doneAt` set
- In the default view: show active items only; at bottom show a collapsible "Done (N)" section
- Done items appear dimmed + struck through
- Can be un-done (click checkbox again), moved, or deleted

---

## Image storage decision

**Use the uploader sidecar** (same as dial custom icons) rather than base64 in localStorage:
- Avoids localStorage bloat (images can be large)
- Reuses `uploadDialImage()` / `deleteDialImage()` from `js/utils.js`
- Tradeoff: images are lost if the Docker volume is wiped without an export — same as dial images today

## Export / Import

Todo lists are included in the existing `exportData()` / `_doImport()` flow in `js/pickers.js`.

### Content encoding

No special encoding needed. `JSON.stringify()` already escapes all text correctly — quotes, curly braces, backslashes, newlines, code blocks, whatever the content contains. Plain text fields are stored as regular JSON string values. The export file stays human-readable.

Base64 is only used for **binary data** (images fetched as raw bytes from `/uploads/`) — same as today for dial custom icons.

### Images

There is no separate `images[]` field. All image references live inside `item.content` as `![alt](/uploads/id.ext)` markdown syntax.

On export: scan every item's `content` for `/uploads/` references using `extractUploadIds(content)`, fetch each from `/uploads/<id>` as base64, add to the `_images` map. Same mechanism as dial custom icons — no new infrastructure.

On import: `_doImport()` re-uploads each entry from `_images` via `uploadDialImage()`. The markdown content already has the correct `/uploads/` paths so no rewriting needed as long as IDs are preserved (which they are — export/import round-trips the same IDs).

### Export shape (additions only)

```js
{
    tabs: [...],               // unchanged
    todoLists: [               // new — no images[] field; image refs live in content
        {
            id, name, emoji, createdAt,
            items: [{ id, content, isDone, createdAt, updatedAt, doneAt, order }]
        }
    ],
    _config: { theme, logoAnim },
    _images: {
        [dialId]: "base64…",   // existing dial images
        [uploadId]: "base64…"  // todo item images (same map, different IDs)
    }
}
```

---

## Implementation phases

### Phase 1 — Core (ship this first)
- Data model extension + migration
- Home tab layout split (two columns)
- Full-screen toggle button + `body.todo-fullscreen` CSS class (pure CSS, trivial to add early)
- List CRUD (add, edit name/emoji, delete with confirmation)
- Items: add, plain text (no markdown yet), collapse/expand, done toggle, delete
- Timestamps stored, shown on expand
- `Escape` exits full-screen (before modal-close handler)

### Phase 2 — Markdown + Images
- Add CodeMirror 6 + markdown extension via `esm.sh` CDN
- Each expanded item mounts a CodeMirror instance; destroyed on collapse
- Collapsed view renders content with `marked.min.js` (CDN), shows only first line
- Image paste → intercept EditorView paste event → upload → insert `![](/uploads/id.ext)` at cursor (original format preserved)
- Cleanup uploaded images on item delete

### Phase 3 — Polish
- Drag-to-reorder items
- Move item between lists
- Done section (collapsible archived view)
- Export/import: `todoLists` included in JSON export; content as plain JSON strings; item images scanned from content and included in `_images` map as base64

---

## Out of scope

- Reminders / due dates (not requested)
- Sub-tasks (not requested)
- Collaboration / sync (this is a self-hosted single-user app)
- Search within todo items (future)
- Markdown toolbar buttons (future; type-it-yourself for now)

---

## Open questions

1. **Markdown library:** Confirmed — CodeMirror 6 with `@codemirror/lang-markdown` via `esm.sh` CDN.
2. **Home tab layout:** Confirmed — Option A: dials strip on top, Todo (30%) + Notes placeholder (70%) below.
3. **Done section toggle state:** Confirmed — JS-only (`doneExpandedListId`), resets to collapsed on every page load. No persistence.
4. **Multi-list navigation:** Confirmed — accordion; no chip bar needed, all lists visible as collapsed headers.
5. **Auto-save:** Confirmed — no Save button anywhere. Item text saves on blur (or debounced ~500ms while typing). List name/emoji saves immediately on change in modal.
6. **Edit mode interaction:** Confirmed — none. Todo lists fully self-managing. Drag always active. Actions always visible on hover.
   **Delete:** undo toast (`showToastUndo`), no confirm modal.
7. **Item interaction:** Confirmed — single click = inline expand (read-only rendered markdown, grows freely); ✏️ button = full-screen CodeMirror editor. No double-click. These are two distinct states with separate functions (`inlineExpandItem` / `openItemEditor`).
8. **↑↓ buttons:** Confirmed — move to top / move to bottom. Drag handles one-step reordering.
9. **Add item:** Confirmed — two buttons with arrow emoji (add to top / add to bottom). Enter commits, Escape with text → confirm discard popup, Escape with no text → silent cancel.
10. **List reordering:** Confirmed — lists are draggable by their header.
11. **Collapsed count badge:** Confirmed — active (non-done) items only.
12. **Delete list confirmation:** Confirmed — "Delete list and its N items?" + clean up all uploaded images from all items in the list.
13. **Default empty state:** Confirmed — migration always creates one "TODO ✅" list. Panel is never truly empty.
14. **Active list on refresh:** Confirmed — always expand `data.todoLists[0]`. Not persisted.
15. **Empty items:** Confirmed — not allowed. Inline add blocks on empty. Full-screen edit prompts on exit if empty.
16. **Image-only items collapsed view:** Confirmed — show `(image)` as first-line text fallback.
