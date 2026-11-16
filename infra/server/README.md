# Linux production deployment

The web app runs as `grokbot` behind Caddy HTTPS. Keep `/etc/grokbot.env`
(root:grokbot, mode 0640), `/var/lib/grokbot` (mode 0700), and the Docker
volume outside code releases. Set `DEV_LOGIN=0`, `ALLOWED_EMAILS` to the owner,
`APP_URL` and `SERVER_URL` to the HTTPS origin, and generate a fresh session secret.

Build `desktop.Dockerfile` as `grokbot-desktop:local`. The fixed desktop container
must publish only 127.0.0.1:16080–16083 to 6080–6083, use the persistent
`grokbot-desktop` volume at `/root/grokbot`, and have no host directory or
Docker socket mounted. Set `DESKTOP_TRANSPORT=container`,
`DESKTOP_WS_BIND=0.0.0.0`, and `DESKTOP_VNC_BASE_PORT=16080` for the app.
The desktop wrapper must be root-owned and writable only by root. Grant the
service user sudo access only to that wrapper with no arguments; do not grant
Docker group membership.

Install the included systemd services. Authenticate the official model CLIs
as the service user using `runuser -u grokbot -- codex login --device-auth`
and `runuser -u grokbot -- claude auth login`. Their executable paths must match
`CODEX_BIN` and `CLAUDE_BIN`. Complete consent in the owner's browser.

## Updates

Clone the public fork to `/opt/grokbot/repository` owned by `grokbot`, create
`/opt/grokbot/releases` owned by that user, and install `grokbot-update` to
`/usr/local/sbin/grokbot-update` as root. Enable `grokbot-update.timer`.
The timer checks `main` every two minutes. Each new revision is built and
checked before switching `/opt/grokbot/current`. It backs up SQLite before
activation and restores the previous code symlink if HTTP health fails.
GitHub Actions independently checks pull requests and pushes.

Database backups are stored under `/var/backups/grokbot`, readable only by root.
Keep separate off-server backups for disaster recovery. A code rollback does
not undo database migrations; restore a compatible database backup when needed.

Run `node --env-file=/etc/grokbot.env tests/server-smoke.mjs` from the current
release as root to verify HTTPS, authentication, public PWA assets, Gmail
integration configuration, and the authenticated desktop relay. It creates and
removes a short-lived owner session without displaying its token.

The web manifest supports browser installation as an app. API responses and
account pages are never stored by the service worker. Changing GitHub `main`
updates both the website and the installed web app after deployment/reload.
