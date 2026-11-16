#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/grokbot-runtime/bin:$PATH"
LIMA_BIN="${LIMA_BIN:-$HOME/.local/grokbot-runtime/bin/limactl}"
if ! command -v node >/dev/null; then echo 'Install Node.js 22.22+ first.' >&2; exit 1; fi
if [ ! -f .env ]; then echo 'Create .env from .env.example and set SESSION_SECRET first.' >&2; exit 1; fi
"$LIMA_BIN" start --tty=false "${LIMA_INSTANCE:-grokbot}"
runtime="$HOME/.local/grokbot-runtime/app"
mkdir -p "$runtime/server" "$runtime/web" "$runtime/data" "$HOME/Library/LaunchAgents"
# launchd cannot use Documents as its working directory on some macOS setups.
# Deploy the built app outside protected folders; persistent state stays here.
cp -R server/dist "$runtime/server/"
cp server/package.json "$runtime/server/package.json"
cp -R web/dist "$runtime/web/"
cp -R node_modules "$runtime/"
cp .env "$runtime/.env"
chmod 600 "$runtime/.env"
if [ ! -f "$runtime/data/grokbot.db" ] && [ -f data/grokbot.db ]; then
  GROKBOT_SOURCE="$PWD/data/grokbot.db" GROKBOT_DEST="$runtime/data/grokbot.db" python3 - <<'PYDB'
import os,sqlite3
source=sqlite3.connect(os.environ['GROKBOT_SOURCE'])
dest=sqlite3.connect(os.environ['GROKBOT_DEST'])
source.backup(dest)
dest.close(); source.close()
PYDB
fi
GROKBOT_ROOT="$runtime" GROKBOT_NODE="$(command -v node)" python3 - <<'PYPLIST'
import os, pathlib, plistlib
root=os.environ['GROKBOT_ROOT']
p=pathlib.Path.home()/'Library/LaunchAgents/com.ibrahim.grokbot.local.plist'
p.write_bytes(plistlib.dumps({
 'Label':'com.ibrahim.grokbot.local',
 'ProgramArguments':[os.environ['GROKBOT_NODE'],'--env-file=.env','server/dist/index.js'],
 'WorkingDirectory':root,'RunAtLoad':True,'KeepAlive':True,
 'StandardOutPath':root+'/data/server.log','StandardErrorPath':root+'/data/server.log',
 'EnvironmentVariables':{'PATH':os.environ['PATH']}
}))
PYPLIST
service="gui/$(id -u)/com.ibrahim.grokbot.local"
if launchctl print "$service" >/dev/null 2>&1; then
  launchctl kickstart -k "$service"
else
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.ibrahim.grokbot.local.plist"
fi
for attempt in {1..50}; do
  if curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1; then echo 'Ready: http://localhost:8787'; exit 0; fi
  sleep 0.2
done
echo 'Server did not start; check ~/.local/grokbot-runtime/app/data/server.log' >&2
exit 1
