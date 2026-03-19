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
      items: [
        {
          id: string,       // uid()
          content: string,  // raw markdown text (may contain ![alt](/uploads/id.jpg))
          images: string[], // list of upload IDs referenced in content; for cleanup on delete
          isDone: boolean,
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

**Migration:** `loadData()` adds `if (!data.todoLists) data.todoLists = []` — no destructive change.

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
- **Collapsed list** shows: expand chevron + emoji + name + item count badge (`(N)`).
- **Active list** shows: collapse chevron + emoji + name + edit icon + add-item button.
- **Order** is preserved — lists render in their defined order; the active list expands in place, no reordering on click.

### Done section

- Appears as the last row of each active list: `▶ Done (N)` — collapsed by default.
- Clicking it toggles open, showing done items (dimmed + strike-through on first line) inline below.
- Can be expanded independently from the list accordion (separate state bit per list: `list.doneExpanded`).
- Done items have the same item row actions: mark undone, delete, move.

### Scrolling

The panel is a single `overflow-y: auto` container. Natural document flow means collapsed list headers always sit below the active list's items. As the active list grows, other list headers are pushed down — but they remain visible below the fold after a short scroll. No sticky positioning needed.

### Item row (active list, collapsed item state)

```
[drag] [☐] First line of todo text…          [↑][↓][🗑][⋯]
```

- **Todo lists are self-managing — no dependency on global edit mode.** Drag, reorder, move between lists, and all item actions are always available without toggling edit mode. Global edit mode controls dials only.
- Drag handle: leftmost, always available (no edit-mode gate)
- Checkbox: marks as done (moves to Done section); undone from Done section moves back up
- Text: first line only, truncated with ellipsis; click to open full-screen edit
- Action buttons (right side, visible on row hover): move to top `↑`, move to bottom `↓`, delete `🗑`, more `⋯` (move to another list)

### Adding an item

- **Add to list (top):** clicking the `+` button on the active list header inserts a new blank item at the **top** of the list, auto-focused.
- **Add below a specific item:** hovering a row reveals the action buttons; one of them is `+` (add below). Clicking it inserts a new blank item immediately below that row.
- In both cases: a single-line inline plain text input appears, auto-focused. `Enter` or blur commits the item — auto-saved, no Save button.
- To write multiline content: open full-screen edit from the item row after adding.

### Drag between lists

In edit mode, item rows have a drag handle. Dragging an item and dropping it onto a **collapsed list header** moves it to that list (appended to end). The target list header highlights on drag-over.

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

### CodeMirror benefit

In full-screen mode the CodeMirror editor for expanded items can grow taller — the `.todo-item.expanded` height can use more `vh` in full-screen mode:

```css
body.todo-fullscreen .todo-item.expanded .cm-editor {
    min-height: 300px;
}
```

### Keyboard shortcut

`Escape` exits full-screen mode if `todoFullScreen` is true (checked before the existing modal-close escape handler in `js/init.js`).

---

## New JS module: `js/todo.js`

Load after `js/render.js`, before `js/init.js`.

### Functions

| Function | Purpose |
|----------|---------|
| `renderTodoPanel()` | Builds the entire right column; called from `renderHomeTab()` |
| `renderTodoListChips()` | List selector chips + add button |
| `renderTodoItems(listId)` | Renders items for the active list |
| `makeTodoItemRow(item)` | Returns a single item DOM node |
| `expandTodoItem(id)` | Switches row to expanded/edit state |
| `collapseTodoItem(id)` | Saves changes and collapses back |
| `openTodoListModal(listId?)` | Open add/edit modal for a list |
| `saveTodoList()` | Save list name+emoji from modal |
| `deleteTodoList(id)` | Confirm then delete list + cleanup images |
| `addTodoItem(listId)` | Append a new blank item, immediately expand it |
| `saveTodoItem(id)` | Persist content edits; update `updatedAt` |
| `toggleTodoDone(id)` | Flip `isDone`; set/clear `doneAt` |
| `deleteTodoItem(id)` | showConfirm → delete item + call `deleteUploadedImages(item.images)` |
| `moveTodoItem(id, targetListId)` | Move item to another list |
| `deleteUploadedImages(ids)` | `ids.forEach(id => deleteDialImage(id))` — reuses existing util |
| `initTodoDragDrop()` | Item drag-to-reorder within list |
| `toggleTodoFullScreen()` | Toggles `todoFullScreen` bool + `body.todo-fullscreen` class |
| `activeTodoListId` | Module-level state variable (which list chip is selected) |
| `todoFullScreen` | Module-level boolean; `false` by default |

### Image paste in item editor

When the user pastes or drops an image into the textarea / contenteditable:
1. Intercept paste event
2. `resizeImage(file)` (reuse existing util)
3. POST to `/api/upload/<uid>` (reuse `uploadDialImage`)
4. Insert `![image](/uploads/<uid>.jpg)` at cursor position in markdown
5. Push `<uid>` into `item.images[]`

On item delete: call `deleteDialImage(id)` for each entry in `item.images`.

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
.todo-item-drag-handle     leftmost; same style as dial drag handle; edit-mode only
.todo-item-check           checkbox/circle, clicking marks done/undone
.todo-item-text            first line truncated with ellipsis; click → full-screen edit
.todo-item-actions         right side: ↑ ↓ 🗑 ⋯ ; visible on hover or in edit-mode
.todo-item-add             "+ Add item" inline input row at bottom of active items

.todo-done-section         collapsible "Done (N)" row + its items
.todo-done-header          "▶ Done (N)" toggle row
.todo-done-items           done item rows; hidden when collapsed
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
| `js/state.js` | Add `currentTodoListEmoji`, `activeTodoListId`, `editingTodoListId` state vars; add `ICONS.defaultTodoList`, `ICONS.check`, `ICONS.uncheck` |
| `js/persistence.js` | `loadData()` — add `if (!data.todoLists) data.todoLists = []` migration line |
| `js/render.js` | `renderHomeTab()` — full rewrite; builds `.home-layout-a` with dials strip + content row; calls `renderTodoPanel()` for todo col; renders an empty `.home-col-notes` placeholder for notes col |
| `js/pickers.js` | `initEmojiPickers()` — add `buildEmojiPicker('todoListEmojiPicker', 'todoList')`; `selectEmoji()` — add `'todoList'` branch |
| `index.html` | Add `<script src="js/todo.js">` after `render.js`; add `<link rel="stylesheet" href="css/todo.css">`; add todo modals |
| `css/dials.css` | Remove full-width assumption from `.home-section` if needed |

---

## Drag-to-reorder items

Items within a list are reorderable via drag handle (same UX as dial cards).

- `item.order` is an integer; items rendered sorted ascending
- On drop: recalculate order values for affected items, `saveData()`, `renderTodoItems()`
- Drag only within the same list (no cross-list drag-drop — use the Move button for that)
- Implementation in `js/todo.js` `initTodoDragDrop()` — follows same pattern as `js/drag-drop.js`

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

For the export/import flow (`exportData()` / `_doImport()`): todo item images should be included in `_images` export map, same as dial images. This is a phase-2 concern; document it but don't block the initial implementation.

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
- Image paste → intercept EditorView paste event → upload → insert `![](/uploads/id.jpg)` at cursor
- Cleanup uploaded images on item delete

### Phase 3 — Polish
- Drag-to-reorder items
- Move item between lists
- Done section (collapsible archived view)
- Include todo images in export/import

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
3. **Done section:** Confirmed — collapsed by default, toggled per-list, rendered inline below active items.
4. **Multi-list navigation:** Confirmed — accordion; no chip bar needed, all lists visible as collapsed headers.
5. **Auto-save:** Confirmed — no Save button anywhere. Item text saves on blur (or debounced ~500ms while typing). List name/emoji saves immediately on change in modal. `saveData()` is cheap (JSON stringify to localStorage).
