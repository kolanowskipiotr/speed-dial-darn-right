# Speed Dial Darn Right

Self-hosted browser speed-dial page. Pure HTML/CSS/JS served by nginx in Docker. No framework, no build step.

## Collaboration

If the user proposes a solution and a better alternative exists, say so before implementing. Explain why briefly, then ask which to proceed with or make a recommendation. Do not silently implement a suboptimal approach.

## Key rules

- No build step for app code — file changes in the mounted Docker volume are live immediately.
- External dependencies are vendored — They are downloaded and bundled during the Docker build process (into the `/vendor/` directory) to enable offline usage. This is managed by `scripts/bundle.mjs` and an Import Map in `index.html`.
- Domain-Driven Design (DDD) — All features are organized in `domain/`.
- All CRUD follows: mutate `data` → `saveData()` → `render()`.
- `saveData()` automatically triggers an async background sync to Google Drive via the `uploader` service.
- Use existing CSS variables, never hardcode colours.
- Never hardcode emoji strings outside of data definitions — always use `ICONS.*` from `domain/core/state.js`.

## Domain Structure

- `domain/core/` — Shared state, themes, tokens, base layout, and utility functions.
- `domain/persistence/` — Data loading, saving, migration, and unified export/sync logic.
- `domain/dial/` — Management of tabs, groups, and dials.
- `domain/todo/` — Todo lists and items, including CodeMirror 6 integration.
- `domain/note/` — Note-taking logic, trash management, and CodeMirror 6 integration.
- `domain/ui/` — Global UI components like the header, search, pickers, and animations.

## Compose file split

- `docker-compose.yml` — production base (no dev mounts); used by Homebrew formula and manual prod deploys.
- `docker-compose.override.yml` — dev-only source mounts; automatically merged by `docker compose up` during development.
- Never add dev mounts back to `docker-compose.yml`.

## Distribution

- `Formula/speed-dial-darn-right.rb` — Homebrew formula; supports macOS (launchd) and Linux (systemd --user) via `brew services`.
- Replace `GITHUB_USER` placeholder before publishing.
- See README for the release checklist (tag → sha256 → fill formula).

## After every confirmed task

**Always update `prompts/knowledge/` to reflect any changes made.**
The user confirms when a task is done — that is the trigger to update the relevant knowledge file(s).
If no existing file fits, create a new one and add it to the table in `prompts/START.md`.

## Knowledge files

| File | Read when… |
|------|-----------|
| `prompts/knowledge/DATA_MODEL.md` | Touching data persistence, localStorage schema, tab/group/dial structure |
| `prompts/knowledge/JS_APP.md` | Any JS logic work — module map, global state, render pipeline |
| `prompts/knowledge/CSS_STYLES.md` | Any styling work — section map, CSS variables reference |
| `prompts/knowledge/HTML_MODALS.md` | Modifying modals or form inputs |
| `prompts/knowledge/DOCKER.md` | Deployment, nginx config, uploader sidecar, volumes |
| `prompts/knowledge/PATTERNS.md` | Before implementing any new feature — conventions and checklist |
