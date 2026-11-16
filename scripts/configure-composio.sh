#!/bin/bash
# Run locally; the key is entered silently and never sent to the chat.
set -euo pipefail
cd "$(dirname "$0")/.."
read -r -s -p 'Composio project API key (input hidden): ' grokbot_key
printf '\n'
if [ -z "$grokbot_key" ]; then echo 'No key entered.' >&2; exit 1; fi
GROKBOT_COMPOSIO_KEY="$grokbot_key" python3 - <<'PY'
import os,pathlib,re
key=os.environ['GROKBOT_COMPOSIO_KEY']
if not re.fullmatch(r'[A-Za-z0-9_-]+',key): raise SystemExit('Unexpected key format; copy the project API key from Composio.')
paths=[pathlib.Path('.env'),pathlib.Path.home()/'.local/grokbot-runtime/app/.env']
for p in paths:
    if not p.exists(): continue
    text=p.read_text()
    line='COMPOSIO_API_KEY='+key
    text=re.sub(r'^COMPOSIO_API_KEY=.*$',line,text,flags=re.M) if re.search(r'^COMPOSIO_API_KEY=',text,re.M) else text.rstrip()+'\n'+line+'\n'
    p.write_text(text);p.chmod(0o600)
print('Connection setup saved. No provider accounts have been authorized yet.')
PY
unset grokbot_key
launchctl kickstart -k "gui/$(id -u)/com.ibrahim.grokbot.local"
echo 'Open http://localhost:8787, choose Connect apps, then connect Gmail, GitHub or Slack.'
