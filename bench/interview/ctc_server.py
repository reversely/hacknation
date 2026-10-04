"""Speech-to-text service for Kiswahili CTC fine-tunes (wav2vec2 and w2v-BERT), on the Veriton.

POST /stt/<model id>   body: 16 kHz mono WAV -> {"text": "...", "ms": n}
GET  /                 -> {"status": "ok", "models": [...]}

Listens on 127.0.0.1 only; requests run one at a time. Part of the voice interview benchmark
(docs/interview.md).
"""

import io
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import soundfile as sf
import torch
from transformers import AutoModelForCTC, AutoProcessor

MODELS = {
    "xlsr-sw-eddiegulay": "eddiegulay/wav2vec2-large-xlsr-mvc-swahili",
    "xls-r-300m-sw-bookbot": "bookbot/wav2vec2-xls-r-300m-swahili-cv-fleurs-alffa",
    "w2v-bert-sw-badrex": "badrex/w2v-bert-2.0-swahili-asr",
}
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8105
torch.set_num_threads(8)
LOADED = {key: (AutoProcessor.from_pretrained(repo), AutoModelForCTC.from_pretrained(repo).eval()) for key, repo in MODELS.items()}
LOCK = threading.Lock()


def transcribe(key: str, wav: bytes) -> str:
    processor, model = LOADED[key]
    audio, rate = sf.read(io.BytesIO(wav), dtype="float32")
    if rate != 16000:
        positions = np.linspace(0, len(audio) - 1, int(len(audio) * 16000 / rate))
        audio = np.interp(positions, np.arange(len(audio)), audio).astype(np.float32)
    inputs = processor(audio, sampling_rate=16000, return_tensors="pt")
    with torch.inference_mode():
        ids = torch.argmax(model(**inputs).logits, dim=-1)[0]
    return processor.decode(ids)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        key = self.path.removeprefix("/stt/")
        if key not in LOADED:
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers["Content-Length"]))
        started = time.time()
        with LOCK:
            text = transcribe(key, body)
        payload = json.dumps({"text": text, "ms": int((time.time() - started) * 1000)}, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        payload = json.dumps({"status": "ok", "models": list(LOADED)}).encode()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
