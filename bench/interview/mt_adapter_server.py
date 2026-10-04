"""Translation service for NLLB with a community Kiswahili adapter, for the voice interview benchmark.

Same interface as the existing translator: POST /translate {"text", "source", "target"} -> {"text", "ms"}.
Usage: mt_adapter_server.py <base model> <adapter repo> <port>. Beam 4, no sampling, one request at a time.
"""

import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from peft import PeftModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

BASE, ADAPTER, PORT = sys.argv[1], sys.argv[2], int(sys.argv[3])
CODES = {"sw": "swh_Latn", "en": "eng_Latn"}
torch.set_num_threads(8)
tok = AutoTokenizer.from_pretrained(BASE)
mdl = PeftModel.from_pretrained(AutoModelForSeq2SeqLM.from_pretrained(BASE), ADAPTER).merge_and_unload().eval()
LOCK = threading.Lock()


def translate(text, source, target):
    with LOCK:
        tok.src_lang = CODES[source]
        with torch.inference_mode():
            out = mdl.generate(**tok(text, return_tensors="pt"), forced_bos_token_id=tok.convert_tokens_to_ids(CODES[target]), num_beams=4, do_sample=False, max_new_tokens=200)
        return tok.batch_decode(out, skip_special_tokens=True)[0]


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        started = time.time()
        text = translate(body["text"], body["source"], body["target"])
        data = json.dumps({"text": text, "ms": int((time.time() - started) * 1000)}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("100.97.186.57", PORT), Handler).serve_forever()
