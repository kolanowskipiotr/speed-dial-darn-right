# Docker / Deployment

## Services
| Service | Image | Port | Role |
|---------|-------|------|------|
| `speed-dial` | nginx:1.27-alpine | `${PORT:-8998}:80` | Frontend + static file server |
| `uploader` | node:20-alpine | internal :3001 | Upload sidecar (no external port) |

---

## Dev vs Prod
- **Dev**: source files volume-mounted `:ro` into `speed-dial` — edits reflect instantly, no rebuild needed
- **Prod**: `docker compose build && docker compose up -d`

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

## Healthcheck (Dockerfile)
- `wget -qO- http://localhost/index.html | grep -q "Speed Dial Darn Right"`
- Interval: 30s, timeout: 5s, start period: 5s, retries: 3
