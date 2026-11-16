# Private voice transcription

The chat microphone records up to 60 seconds using MediaRecorder (Opus/WebM on Chrome, MP4 on Safari). Stop/Done uploads audio to the authenticated `/api/voice/transcribe` endpoint. The result is appended to the current draft, never sent automatically. No app language selector is needed: faster-whisper runs `task=transcribe, language=None`, preserving detected speech rather than translating it to English.

The worker uses the multilingual **small** model on CPU with int8 precision. It runs separately from Fino, binds only to `127.0.0.1:8841`, processes one recording at a time and never logs or stores audio/transcripts. The app caps uploads at 8 MB and the worker rejects decoded clips longer than 90 seconds. Browser clips stop at 60 seconds. Transcription is not a live call or streaming dictation. A cancelled browser request may already have started server processing; its result is discarded.

Provision as root on Ubuntu:

```sh
useradd --system --home-dir /var/lib/fino-stt --create-home --shell /usr/sbin/nologin fino-stt
python3 -m venv /opt/fino-stt/venv
/opt/fino-stt/venv/bin/pip install -r infra/stt/requirements.txt
install -d -o fino-stt -g fino-stt /var/lib/fino-stt/model
runuser -u fino-stt -- /opt/fino-stt/venv/bin/python -c 'from huggingface_hub import snapshot_download; snapshot_download("Systran/faster-whisper-small", local_dir="/var/lib/fino-stt/model", allow_patterns=["model.bin","config.json","tokenizer.json","vocabulary.*","preprocessor_config.json"])'
install -m 644 infra/stt/transcribe.py /opt/fino-stt/transcribe.py
install -m 644 infra/stt/fino-stt.service /etc/systemd/system/fino-stt.service
systemctl daemon-reload
systemctl enable --now fino-stt
curl http://127.0.0.1:8841/health
```

The service limits CPU to 125%, memory to 1800 MB, and has low scheduling priority. No paid transcription API/key is used. Accuracy depends on microphone quality, accent and background noise; test on the user's actual phone before promising word-perfect Arabic. Updating this worker requires installing the versioned Python script/service separately from the normal web release.
