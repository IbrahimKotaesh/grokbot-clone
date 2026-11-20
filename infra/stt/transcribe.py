"""Private, CPU-only transcription. Loopback only; no audio files or transcript logging."""
import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio

model = WhisperModel(os.environ.get('STT_MODEL_PATH', '/var/lib/fino-stt/model'), device='cpu', compute_type='int8', cpu_threads=int(os.environ.get('STT_CPU_THREADS', '2')), num_workers=1, local_files_only=True)
# A small detector avoids running the expensive transcription encoder twice.
# Detection still happens for every recording, never from a saved language guess.
detector_path = os.environ.get('STT_DETECTOR_PATH')
detector = WhisperModel(detector_path, device='cpu', compute_type='int8', cpu_threads=2, num_workers=1, local_files_only=True) if detector_path else None
lock = threading.Lock()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        self.reply(200 if self.path == '/health' else 404, {'ready': self.path == '/health'})

    def do_POST(self):
        if self.path != '/transcribe':
            return self.reply(404, {'error': 'Not found.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            size = 0
        if not 200 <= size <= 8 * 1024 * 1024:
            return self.reply(413, {'error': 'Record a shorter voice message (up to 60 seconds).'})
        if not lock.acquire(blocking=False):
            return self.reply(429, {'error': 'Another recording is being transcribed. Try again shortly.'})
        try:
            self.connection.settimeout(15)
            audio = decode_audio(io.BytesIO(self.rfile.read(size)), sampling_rate=16000)
            if len(audio) > 90 * 16000:
                return self.reply(413, {'error': 'Record up to 60 seconds at a time.'})
            language = None
            if detector is not None:
                try:
                    detected, probability, _ = detector.detect_language(audio=audio, vad_filter=True)
                    if probability >= 0.8:
                        language = detected
                except Exception:
                    pass  # Keep the original full-model auto-detection as a fallback.
            segments, info = model.transcribe(audio, task='transcribe', language=language, beam_size=int(os.environ.get('STT_BEAM_SIZE', '3')), best_of=1, temperature=0.0, vad_filter=True, condition_on_previous_text=False)
            text = ' '.join(segment.text.strip() for segment in segments).strip()
            self.reply(200, {'text': text, 'language': info.language})
        except Exception:
            self.reply(422, {'error': 'Could not read this recording. Please record again.'})
        finally:
            lock.release()

ThreadingHTTPServer(('127.0.0.1', 8841), Handler).serve_forever()
