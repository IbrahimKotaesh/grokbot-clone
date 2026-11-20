#!/bin/bash
# Install the same private transcription worker used on Linux, as a user service.
set -euo pipefail
stt_root="${FINO_STT_HOME:-$HOME/.local/fino-stt}"
source_dir="$(cd "$(dirname "$0")" && pwd)"
stt_uv="$(command -v uv || true)"
if [ -z "$stt_uv" ] && [ -x "$stt_root/bin/uv" ]; then stt_uv="$stt_root/bin/uv"; fi
if [ -z "$stt_uv" ]; then
  python3 -m venv "$stt_root/tools"
  "$stt_root/tools/bin/pip" install uv
  stt_uv="$stt_root/tools/bin/uv"
fi
"$stt_uv" python install 3.12
if [ ! -x "$stt_root/venv/bin/python" ]; then "$stt_uv" venv --python 3.12 "$stt_root/venv"; fi
"$stt_uv" pip install --python "$stt_root/venv/bin/python" -r "$source_dir/requirements.txt"
cp "$source_dir/transcribe.py" "$stt_root/transcribe.py"
"$stt_root/venv/bin/python" - "$stt_root" <<'PY'
import os, pathlib, plistlib, sys
from huggingface_hub import snapshot_download
root = pathlib.Path(sys.argv[1])
model = snapshot_download('Systran/faster-whisper-small', allow_patterns=['model.bin','config.json','tokenizer.json','vocabulary.*','preprocessor_config.json'])
agent = pathlib.Path.home() / 'Library/LaunchAgents/dev.fino.transcription.plist'
agent.parent.mkdir(parents=True, exist_ok=True)
config = {'Label':'dev.fino.transcription','ProgramArguments':[str(root/'venv/bin/python'),str(root/'transcribe.py')],
 'EnvironmentVariables':{'STT_MODEL_PATH':model,'HF_HUB_OFFLINE':'1','OMP_NUM_THREADS':'2','OPENBLAS_NUM_THREADS':'2'},
 'RunAtLoad':True,'KeepAlive':True,'Nice':10,'ThrottleInterval':10,
 'StandardOutPath':str(root/'service.log'),'StandardErrorPath':str(root/'service-error.log')}
agent.write_bytes(plistlib.dumps(config)); agent.chmod(0o600)
PY
launchctl bootout "gui/$(id -u)/dev.fino.transcription" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/dev.fino.transcription.plist"
printf '%s\n' 'Fino local transcription installed. Health: http://127.0.0.1:8841/health'
