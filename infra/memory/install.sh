#!/usr/bin/env bash
set -euo pipefail
# Run as root on the x86_64 Linux VPS. Does not enable Fino's integration until
# the synthetic quality test passes and FINO_MEMORY_URL/KEY are configured.
test "$(uname -m)" = x86_64
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
install -d /opt/fino-memory /var/lib/fino-memory/models/e5
python3 -m venv /opt/fino-memory/venv
/opt/fino-memory/venv/bin/pip install --no-cache-dir -r "$script_dir/requirements.txt"
download() {
 local url=$1 target=$2 digest=$3
 if ! test -f "$target" || ! echo "$digest  $target" | sha256sum --check --status; then
  curl --fail --location --retry 3 "$url" --output "$target.tmp"
  echo "$digest  $target.tmp" | sha256sum --check --status
  mv "$target.tmp" "$target"
 fi
}
download https://huggingface.co/intfloat/multilingual-e5-small/resolve/main/onnx/model_qint8_avx512_vnni.onnx /var/lib/fino-memory/models/e5/model.onnx dd476dd0c2514e9b9be83aeb3853fac0763e0bdf4a71645407587d77c48a2d88
curl --fail --location --retry 3 https://huggingface.co/intfloat/multilingual-e5-small/resolve/main/onnx/tokenizer.json --output /var/lib/fino-memory/models/e5/tokenizer.json
install -m 644 "$script_dir/service.py" /opt/fino-memory/service.py
install -m 644 "$script_dir/"*.service /etc/systemd/system/
if ! test -f /etc/fino-memory.env; then
 python3 - <<'PY'
import secrets, os
with open('/etc/fino-memory.env','w') as f:
    f.write('FINO_MEMORY_KEY='+secrets.token_urlsafe(36)+'\nFINO_MEMORY_DATA=/var/lib/fino-memory\n')
os.chmod('/etc/fino-memory.env',0o640)
PY
fi
chown root:grokbot /etc/fino-memory.env
chown -R grokbot:grokbot /var/lib/fino-memory
systemctl daemon-reload
systemctl enable --now fino-memory
