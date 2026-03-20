# Speed Dial Darn Right — AI Session Start

A self-hosted browser speed-dial / new-tab page.
Pure frontend (HTML + CSS + JS) served by nginx in Docker. No framework, no build step.

## File map
```
index.html          — all HTML: header, modals, main container
css/style.css            — all styles, CSS vars, themes

js/emoji-synonyms.js     — EMOJI_SYNONYMS map (emoji → synonym array) for enhanced search
js/state.js              — ICONS const, EMOJI_CATEGORIES, EMOJI_LIST, GROUP_EMOJIS,
                           EMOJI_KEYWORDS, then STATE variables (all mutable globals)
js/themes.js             — THEMES array, applyTheme(), loadTheme(), renderThemeSelector()
js/persistence.js        — loadData(), saveData(), getActiveTab()
js/utils.js              — uid(), resizeImage(), uploadDialImage(), deleteDialImage(),
                           handleDropZonePaste(), handleImageFile(), pickRandomEmoji(),
                           getDomain(), getFaviconCandidates(), attachFavicon(),
                           showToast(), showToastUndo(), undoDelete(), showConfirm()
js/render.js             — render(), renderTabs(), makeDialCard(), updateClock(),
                           updateDialCount(), escHtml(), renderHomeTab() (two-zone layout)
js/todo.js               — todo panel: renderTodoPanel(), list CRUD, item CRUD, item editor,
                           full-screen toggle; module-level state: todoFullScreen, expandedItemId
js/todo-cm.js            — ES module; imports CodeMirror 6 from esm.sh; exposes window.TodoCM
js/drag-drop.js          — all drag & drop handlers
js/crud.js               — toggleEditMode(), all Tab/Group/Dial CRUD, setIconSrc(),
                           previewCustomIcon(), fetchPageTitle(), saveDial()
js/pickers.js            — initEmojiPickers(), buildEmojiPicker(), toggleEmojiPicker(),
                           selectEmoji(), randomEmoji(), loadFaviconOptions(),
                           emojiName(), emojiMatchesFilter(), exportData(), importData()
js/logo-animation.js     — initLogoAnimation(), runLogoAnimation(), spawnSparks(),
                           toggleLogoAnim(), updateAnimToggleUI()
js/init.js               — DOMContentLoaded bootstrap: loads theme, data, inits pickers,
                           renders, starts clock

nginx.conf                      — static serving + /data/, /uploads/, /api/upload/ proxy
docker-compose.yml              — production base: two services (speed-dial nginx + uploader Node sidecar), no dev mounts
docker-compose.override.yml     — dev-only: source file mounts; auto-merged by `docker compose up`, ignored in prod
Dockerfile                      — nginx:1.27-alpine, serves html/css/js + favicon/icons, volumes /data /uploads
uploader/server.js              — tiny Node.js HTTP server (port 3001): POST/DELETE /upload/<id>
uploader/Dockerfile             — node:20-alpine, runs server.js
Formula/speed-dial-darn-right.rb — Homebrew formula; brew services manages launchd (macOS) / systemd (Linux)
```

---

> Rules, ground rules, and the knowledge map are in `CLAUDE.md` (auto-loaded).
