# Speed Dial Darn Right

Self-hosted browser speed-dial page. Pure HTML/CSS/JS served by nginx in Docker. No framework, no build step.

## Key rules

- No build step — file changes in the mounted Docker volume are live immediately.
- All CRUD follows: mutate `data` → `saveData()` → `render()`.
- Use existing CSS variables, never hardcode colours.
- Never hardcode emoji strings outside of data definitions — always use `ICONS.*` from `js/state.js`.

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
