# Private voice transcription

The chat microphone records up to 60 seconds using MediaRecorder (Opus/WebM on Chrome, MP4 on Safari). Stop/Done uploads audio to the authenticated `/api/voice/transcribe` endpoint. The result is appended to the current draft, never sent automatically. No app language selector is needed: faster-whisper runs `task=transcribe`, preserving detected speech rather than translating it to English. Language is detected anew for each recording. On the VPS a multilingual base model performs only language detection; the small model still writes the transcript. Detection confidence below 0.8, or a detector error, falls back to the small model's own automatic detection. The detector is optional (`STT_DETECTOR_PATH`); no language is forced from browser settings or saved from a previous recording.

The worker uses the multilingual **small** model on CPU with int8 precision. It runs separately from Fino, binds only to `127.0.0.1:8841`, processes one recording at a time and never logs or stores audio/transcripts. The app caps uploads at 8 MB and the worker rejects decoded clips longer than 90 seconds. Browser clips stop at 60 seconds. Transcription is not a live call or streaming dictation. A cancelled browser request may already have started server processing; its result is discarded.

Provision as root on Ubuntu:

```sh
useradd --system --home-dir /var/lib/fino-stt --create-home --shell /usr/sbin/nologin fino-stt
python3 -m venv /opt/fino-stt/venv
/opt/fino-stt/venv/bin/pip install -r infra/stt/requirements.txt
install -d -o fino-stt -g fino-stt /var/lib/fino-stt/model
runuser -u fino-stt -- /opt/fino-stt/venv/bin/python -c 'from huggingface_hub import snapshot_download; snapshot_download("Systran/faster-whisper-small", local_dir="/var/lib/fino-stt/model", allow_patterns=["model.bin","config.json","tokenizer.json","vocabulary.*","preprocessor_config.json"])'
# Lightweight language detector; the service expects this path.
runuser -u fino-stt -- /opt/fino-stt/venv/bin/python -c 'from huggingface_hub import snapshot_download; snapshot_download("Systran/faster-whisper-base", local_dir="/var/lib/fino-stt/model-base", allow_patterns=["model.bin","config.json","tokenizer.json","vocabulary.*","preprocessor_config.json"])'
install -m 644 infra/stt/transcribe.py /opt/fino-stt/transcribe.py
install -m 644 infra/stt/fino-stt.service /etc/systemd/system/fino-stt.service
systemctl daemon-reload
systemctl enable --now fino-stt
curl http://127.0.0.1:8841/health
```

The service limits CPU to 175%, memory to 1800 MB, and has low scheduling priority. It uses two threads and deterministic beam-3 decoding; `STT_CPU_THREADS` and `STT_BEAM_SIZE` can override those settings. Model downloads happen during setup, never during a voice request. No paid transcription API/key is used. Accuracy depends on microphone quality, accent and background noise; test on the user's actual phone before promising word-perfect Arabic. Updating this worker requires installing the versioned Python script/service separately from the normal web release.

## Local Mac preview

Run `bash infra/stt/install-macos.sh` from the checkout. It installs a Python 3.12 environment and the same multilingual small model, reuses the Hugging Face cache where possible, and registers the user LaunchAgent `dev.fino.transcription`. Model downloads happen during setup; transcription runs offline, on loopback port 8841, with two CPU threads and low priority. No model API key is required. The worker starts again when the user logs into macOS.

Check `curl http://127.0.0.1:8841/health`. The web backend uses this address by default. The browser still needs microphone permission; a successful sample-file transcription does not verify the physical microphone. macOS logs are in `~/.local/fino-stt/service-error.log`; recordings and transcripts are not logged. Stop the worker with `launchctl bootout gui/$(id -u)/dev.fino.transcription`.

## Latency check (2026-11-20)

On the deployed two-vCPU VPS, a synthetic 12.05-second Arabic WAV took 17.17 seconds with the original worker (small doing detection and transcription, CPU quota 125%). A separate benchmark using base only for detection and the same small/beam-3 transcription took 10.66 seconds and produced exactly the same transcript. This is one synthetic sample, not an accuracy guarantee for real accents or background noise. A base-only transcription trial was rejected because it introduced additional Arabic word errors. The larger small model is retained for transcription. The web health endpoint remained responsive during the initial load test (median 3.2 ms, maximum 57.2 ms over eight local requests).
