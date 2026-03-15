# Speed Dial Darn Right

A self-hosted browser speed-dial page — served by nginx in Docker.

---

## Install (macOS & Linux)

### Option A — Homebrew (recommended)

Requires [Docker Desktop](https://www.docker.com/get-docker/) (macOS) or [Docker Engine](https://docs.docker.com/engine/install/) (Linux).

```bash
# 1. Add the tap (repo must be named homebrew-speed-dial-darn-right on GitHub)
brew tap GITHUB_USER/speed-dial-darn-right

# 2. Install (builds Docker images automatically)
brew install speed-dial-darn-right

# 3. Start + register as a login item (auto-starts at every login)
brew services start speed-dial-darn-right
```

Open: **http://localhost:8998**

```bash
brew services stop speed-dial-darn-right     # stop
brew services restart speed-dial-darn-right  # restart after config change
speed-dial logs                              # tail container logs
speed-dial ps                                # container status
```

### Option B — Docker Compose (manual)

```bash
# 1. Clone the repo
git clone https://github.com/GITHUB_USER/speed-dial-darn-right.git
cd speed-dial-darn-right

# 2. Build and start (production mode — no dev mounts)
docker compose -f docker-compose.yml up -d --build

# 3. Open in browser
open http://localhost:8998
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `8998`  | Host port   |
| `TZ`     | `Europe/Warsaw` | Container timezone |

Override at startup:
```bash
PORT=9090 docker compose -f docker-compose.yml up -d
```

Or create a `.env` file in the project root:
```
PORT=9090
TZ=Europe/London
```

---

## Persistent storage

Two named Docker volumes are created automatically and survive container restarts and upgrades:

| Volume | Mount | Contents |
|--------|-------|---------|
| `speed_dial_data` | `/data` | JSON config, server-side backups |
| `speed_dial_uploads` | `/uploads` | User-uploaded dial icons |

### Backup
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

```bash
# Uses docker-compose.yml + docker-compose.override.yml automatically.
# Source files are mounted into the container — edit & refresh, no rebuild needed.
docker compose up
```

Rebuild after structural changes:
```bash
docker compose up --build
```

Stop:
```bash
docker compose down
```

---

## Homebrew release checklist

When publishing a new GitHub release:

1. Tag the commit: `git tag v1.0.0 && git push --tags`
2. Create a GitHub release from the tag (produces a tarball automatically)
3. Compute the sha256: `brew fetch --build-from-source Formula/speed-dial-darn-right.rb`
4. In `Formula/speed-dial-darn-right.rb`, uncomment the `url`/`sha256`/`version` lines and fill them in
5. Comment out or remove the `head` line
6. Commit and push the updated formula
