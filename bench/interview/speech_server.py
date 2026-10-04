"""Speech service for the voice interview benchmark, run on the Veriton (docs/interview.md).

POST /stt/mms   body: 16 kHz mono WAV         -> {"text": "...", "ms": n}   (facebook/mms-1b-all, Kiswahili adapter)
POST /tts/mms   body: {"text": "..."}         -> 16 kHz WAV                 (facebook/mms-tts-swh)
POST /tts/piper body: {"text": "..."}         -> 16 kHz WAV                 (Piper sw_CD-lanfrica-medium)
GET  /          -> {"status": "ok"}

Listens on 127.0.0.1 only. Requests run one at a time, because the models are not thread-safe.
"""

import io
import json
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import soundfile as sf
import torch
from piper import PiperVoice
from transformers import AutoProcessor, AutoTokenizer, VitsModel, Wav2Vec2ForCTC

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8103
PIPER = "/root/models/piper/sw_CD-lanfrica-medium.onnx"
torch.set_num_threads(8)

asr_processor = AutoProcessor.from_pretrained("facebook/mms-1b-all", target_lang="swh")
asr_model = Wav2Vec2ForCTC.from_pretrained("facebook/mms-1b-all", target_lang="swh", ignore_mismatched_sizes=True).eval()
tts_tokenizer = AutoTokenizer.from_pretrained("facebook/mms-tts-swh")
tts_model = VitsModel.from_pretrained("facebook/mms-tts-swh").eval()
piper_voice = PiperVoice.load(PIPER)
LOCK = threading.Lock()


def resample(audio: np.ndarray, rate: int, target: int = 16000) -> np.ndarray:
    if rate == target:
        return audio
    positions = np.linspace(0, len(audio) - 1, int(len(audio) * target / rate))
    return np.interp(positions, np.arange(len(audio)), audio).astype(np.float32)


def to_wav(audio: np.ndarray, rate: int) -> bytes:
    audio = resample(audio.astype(np.float32), rate)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(16000)
        out.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
    return buffer.getvalue()


def stt_mms(wav: bytes) -> str:
    audio, rate = sf.read(io.BytesIO(wav), dtype="float32")
    inputs = asr_processor(resample(audio, rate), sampling_rate=16000, return_tensors="pt")
    with torch.inference_mode():
        ids = torch.argmax(asr_model(**inputs).logits, dim=-1)[0]
    return asr_processor.decode(ids)


def tts_mms(text: str) -> bytes:
    with torch.inference_mode():
        audio = tts_model(**tts_tokenizer(text, return_tensors="pt")).waveform[0].numpy()
    return to_wav(audio, tts_model.config.sampling_rate)


def tts_piper(text: str) -> bytes:
    chunks = [np.frombuffer(chunk.audio_int16_bytes, dtype="<i2") for chunk in piper_voice.synthesize(text)]
    audio = np.concatenate(chunks).astype(np.float32) / 32768
    return to_wav(audio, piper_voice.config.sample_rate)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        started = time.time()
        with LOCK:
            if self.path == "/stt/mms":
                payload, kind = json.dumps({"text": stt_mms(body), "ms": 0}).encode(), "application/json"
            elif self.path in ("/tts/mms", "/tts/piper"):
                text = json.loads(body)["text"]
                payload, kind = (tts_mms if self.path == "/tts/mms" else tts_piper)(text), "audio/wav"
            else:
                self.send_error(404)
                return
        if kind == "application/json":
            result = json.loads(payload)
            result["ms"] = int((time.time() - started) * 1000)
            payload = json.dumps(result, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("X-Elapsed-Ms", str(int((time.time() - started) * 1000)))
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
