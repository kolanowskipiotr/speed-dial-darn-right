# Speed Dial Darn Right — AI Session Start

A self-hosted browser speed-dial / new-tab page.
Pure frontend (HTML + CSS + JS) served by nginx in Docker. No framework, no build step.

## File map
```
speed-dial.html          — all HTML: header, modals, main container
css/style.css            — all styles, CSS vars, themes
js/app.js                — all logic
nginx.conf               — static serving + /data/, /uploads/, /api/upload/ proxy
docker-compose.yml       — two services: speed-dial (nginx) + uploader (Node sidecar)
Dockerfile               — nginx:1.27-alpine, serves html/css/js, volumes /data /uploads
uploader/server.js       — tiny Node.js HTTP server (port 3001): POST/DELETE /upload/<id>
uploader/Dockerfile      — node:20-alpine, runs server.js
```

---

## Knowledge map — read on demand

| File | Read when… |
|------|-----------|
| `prompts/knowledge/DATA_MODEL.md` | Touching data persistence, localStorage schema, tab/group/dial structure |
| `prompts/knowledge/JS_APP.md` | Any JS logic work — section map, global state, render pipeline |
| `prompts/knowledge/CSS_STYLES.md` | Any styling work — section map, CSS variables reference |
| `prompts/knowledge/HTML_MODALS.md` | Modifying modals or form inputs |
| `prompts/knowledge/DOCKER.md` | Deployment, nginx config, uploader sidecar, volumes, env vars |
| `prompts/knowledge/PATTERNS.md` | Before implementing any new feature — conventions and checklist |

---

## Ground rules
- No build step — file changes in the mounted volume are live immediately in the dev Docker setup.
- All CRUD follows: mutate `data` → `saveData()` → `render()`.
- Use existing CSS variables, never hardcode colours.
- After learning anything new about this codebase, update the relevant file in `prompts/knowledge/`.
- If no existing file fits, create a new one and add it to the table above.
