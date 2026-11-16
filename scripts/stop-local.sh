#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
launchctl bootout "gui/$(id -u)/com.ibrahim.grokbot.local" >/dev/null 2>&1 || true
"${LIMA_BIN:-$HOME/.local/grokbot-runtime/bin/limactl}" stop "${LIMA_INSTANCE:-grokbot}"
