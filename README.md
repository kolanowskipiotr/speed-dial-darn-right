# ⚡ Speed Dial

A self-hosted browser speed dial page — served by nginx in Docker.

## Quick start

```bash
# 1. Put all files in the same folder:
#    Dockerfile  docker-compose.yml  nginx.conf  speed-dial.html

# 2. Build and start
docker compose up -d

# 3. Open in browser
open http://localhost:8080
```

Set it as your browser homepage: `http://localhost:8080`

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `8080`  | Host port   |
| `TZ`     | `Europe/Warsaw` | Timezone |

Override at startup:
```bash
PORT=9090 docker compose up -d
```

Or create a `.env` file:
```
PORT=9090
TZ=Europe/London
```

---

## Persistent storage

Two named Docker volumes are created automatically:

| Volume | Mount | Future use |
|--------|-------|------------|
| `speed_dial_data` | `/data` | JSON dial config, server-side backups |
| `speed_dial_uploads` | `/uploads` | User icon images served as `/uploads/<file>` |

### Backup volumes
```bash
docker run --rm \
  -v speed_dial_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/speed-dial-backup.tar.gz /data
```

### Restore
```bash
docker run --rm \
  -v speed_dial_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/speed-dial-backup.tar.gz -C /
```

---

## Development (live reload)

Uncomment this line in `docker-compose.yml`:
```yaml
- ./speed-dial.html:/usr/share/nginx/html/index.html:ro
```

Then edit `speed-dial.html` and refresh the browser — no rebuild needed.

---

## Rebuild after changes

```bash
docker compose up -d --build
```

## Stop

```bash
docker compose down
```
