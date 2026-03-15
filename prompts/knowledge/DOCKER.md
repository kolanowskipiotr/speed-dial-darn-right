# Docker / Deployment

## Services
| Service | Image | Port | Role |
|---------|-------|------|------|
| `speed-dial` | nginx:1.27-alpine | `${PORT:-8998}:80` | Frontend + static file server |
| `uploader` | node:20-alpine | internal :3001 | Upload sidecar (no external port) |

---

## Dev vs Prod
- **Dev**: `docker compose up` — automatically merges `docker-compose.yml` + `docker-compose.override.yml`; source files are volume-mounted `:ro` so edits are live
- **Prod (manual)**: `docker compose -f docker-compose.yml up -d` — skips the override, uses baked-in files from image
- **Prod (Homebrew)**: `brew services start speed-dial-darn-right` — see Homebrew section below

## Compose file split
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Production base — no dev mounts |
| `docker-compose.override.yml` | Dev-only source mounts (auto-merged by Docker Compose in dev) |

## Volumes
- `speed_dial_data` → `/data` (nginx-served static JSON, future use)
- `speed_dial_uploads` → `/uploads` (shared between `speed-dial` and `uploader`)

## Environment
- `PORT=${PORT:-8998}` — override external port
- `TZ=${TZ:-Europe/Warsaw}` — timezone on `speed-dial` container

---

## nginx routes (nginx.conf)
| Location | Behaviour |
|----------|-----------|
| `/` | serves static files, fallback to index.html |
| `/data/` | alias to `/data/` volume, CORS headers |
| `^~ /uploads/` | alias to `/uploads/` volume, no-cache; `^~` prevents jpg regex from taking priority |
| `^~ /api/upload/` | proxy to `http://uploader:3001/upload/`, max body 10m |
| `~* \.(ico|png|jpg…)$` | 7-day cache for static assets |

---

## Uploader sidecar (`uploader/server.js`)
- Bare Node.js `http` module — no npm dependencies
- Listens on port 3001 (internal Docker network only, not exposed externally)
- `POST /upload/<id>` → writes `<id>.jpg` to `/uploads/`
- `DELETE /upload/<id>` → removes `<id>.jpg` from `/uploads/`
- ID must match `[a-z0-9]+` (same format as `uid()` output)
- Called from browser via `POST /api/upload/<id>` — nginx strips the `/api` prefix when proxying

## Homebrew distribution (`Formula/speed-dial-darn-right.rb`)
- Requires repo on GitHub; replace `GITHUB_USER` placeholder in formula before publishing
- Install: `brew install --HEAD GITHUB_USER/speed-dial-darn-right/speed-dial-darn-right`
- Or via tap (repo must be named `homebrew-speed-dial-darn-right`): `brew tap GITHUB_USER/speed-dial-darn-right && brew install speed-dial-darn-right`
- `brew services start` → runs `docker compose up` in foreground managed by launchd (macOS) or systemd --user (Linux); auto-starts at login
- `post_install` hook builds Docker images automatically after `brew install`
- `speed-dial` wrapper script installed to `$(brew --prefix)/bin/` — proxies all args to `docker compose -f …/docker-compose.yml`
- For stable releases: uncomment the `url`/`sha256`/`version` lines in the formula and fill in after `brew fetch --build-from-source`

## Dockerfile static assets
- Copies `favicon.ico`, `icon.png`, `icon.svg` in addition to `speed-dial.html`, `css/`, `js/`

## Healthcheck (Dockerfile)
- `wget -qO- http://localhost/index.html | grep -q "Speed Dial Darn Right"`
- Interval: 30s, timeout: 5s, start period: 5s, retries: 3
