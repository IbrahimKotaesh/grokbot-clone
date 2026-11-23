#!/bin/bash
# (Re)create the bots' desktop container with the settings the app expects.
#
#   desktop-container.sh [image]      # default image: grokbot-desktop:local
#
# --init is essential: it makes a tiny init (tini) process 1, which reaps every finished process.
# Without it, Chromium, PDF tools and background commands leave "zombie" processes that pile up until
# the container hits its process limit and every bot freezes (seen 2026-11-23: 694 of 1024).
set -euo pipefail
name=grokbot-desktop
image=${1:-grokbot-desktop:local}
docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" --init --restart unless-stopped \
  --pids-limit 1024 --memory 1536m --shm-size 256m --security-opt no-new-privileges \
  -p 127.0.0.1:16080:6080 -p 127.0.0.1:16081:6081 -p 127.0.0.1:16082:6082 -p 127.0.0.1:16083:6083 \
  -v grokbot-desktop:/root/grokbot \
  "$image" sleep infinity
# Screens start fresh; the app restarts each bot's display and browser on first use.
docker exec "$name" sh -c 'rm -f /tmp/grokbot-screen-*.started /tmp/grokbot-relay-*' || true
docker exec "$name" ps -o pid,comm -p 1
