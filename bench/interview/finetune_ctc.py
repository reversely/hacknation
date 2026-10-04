"""Fine-tune badrex's w2v-BERT 2.0 Kiswahili model on the synthetic domain set (docs/interview.md).

Trains on the synthetic set's train split (196 clips, nine ElevenLabs voices: prices, counts, times,
phone numbers), keeps the checkpoint with the lowest dev-split word error rate, and scores it on the
persona clips, which no training step sees (a different voice and different sentences). Word error
rate uses the screening's normalisation (screen_stt.ts), so the numbers compare with its report.

Runs on the Veriton's GPU, in /root/wren-bench/train-venv:
    train-venv/bin/python finetune_ctc.py [output dir]
"""

import json
import random
import re
import sys
import time
import unicodedata
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from transformers import AutoProcessor, Wav2Vec2BertForCTC

BASE = "badrex/w2v-bert-2.0-swahili-asr"
AUDIO = Path("/root/wren-bench/audio")
SYNTH = Path("/root/wren-bench/synth")
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/root/wren-bench/ft/w2v-bert-sw-wren")
EPOCHS, BATCH, LR, SEED = 15, 8, 1e-5, 0

random.seed(SEED)
torch.manual_seed(SEED)


def words(text: str) -> list[str]:
    text = unicodedata.normalize("NFKD", text.lower())
    return [w for w in re.sub(r"[^a-z0-9' ]", " ", text).split() if w]


def wer(reference: str, hypothesis: str) -> float:
    r, h = words(reference), words(hypothesis)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
    return d[len(h)] / len(r) if r else 0.0


def synthetic(split: str) -> list[tuple[Path, str]]:
    rows = [json.loads(line) for line in (SYNTH / "manifest.jsonl").read_text().splitlines() if line]
    return [(SYNTH / r["audio"], r["text"]) for r in rows if r["split"] == split]


def personas() -> list[tuple[Path, str]]:
    data = json.loads((AUDIO / "personas.json").read_text())["personas"]
    by_id = {p["id"]: p for p in data}
    clips = []
    for p in data:
        answers = p.get("answers") or by_id.get(p.get("same_as", ""), {}).get("answers", {})
        clips += [(AUDIO / p["id"] / f"{key.replace('#', '__')}.wav", text) for key, text in answers.items()]
    return [(path, text) for path, text in clips if path.exists()]


processor = AutoProcessor.from_pretrained(BASE)
model = Wav2Vec2BertForCTC.from_pretrained(BASE).to("cuda")
vocab = set(processor.tokenizer.get_vocab())


def load(path: Path) -> np.ndarray:
    audio, rate = sf.read(path, dtype="float32")
    assert rate == 16000, f"{path} is {rate} Hz"
    return audio if audio.ndim == 1 else audio.mean(axis=1)


def label(text: str) -> list[int]:
    # The tokenizer's vocabulary is lowercase letters; characters outside it are dropped.
    clean = " ".join(words(text))
    clean = "".join(c for c in clean if c == " " or c in vocab)
    return processor.tokenizer(clean).input_ids


@torch.inference_mode()
def score(clips: list[tuple[Path, str]]) -> tuple[float, list[str]]:
    model.eval()
    errors, outputs = [], []
    for path, text in clips:
        inputs = processor(load(path), sampling_rate=16000, return_tensors="pt").to("cuda")
        ids = model(**inputs).logits.argmax(-1)[0]
        hypothesis = processor.decode(ids)
        errors.append(wer(text, hypothesis))
        outputs.append(hypothesis)
    return float(np.mean(errors)), outputs


train, dev, held_out = synthetic("train"), synthetic("dev"), personas()
print(f"train {len(train)}, dev {len(dev)}, persona clips {len(held_out)}", flush=True)
report = {"base": BASE, "epochs": EPOCHS, "batch": BATCH, "lr": LR, "train": len(train), "dev": len(dev), "personas": len(held_out)}
report["before"] = {"dev": score(dev)[0], "personas": score(held_out)[0]}
print(f"before: dev {report['before']['dev']:.3f}, personas {report['before']['personas']:.3f}", flush=True)

data = [(load(path), label(text)) for path, text in train]
optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
best, history = report["before"]["dev"], []
OUT.mkdir(parents=True, exist_ok=True)
started = time.time()
for epoch in range(1, EPOCHS + 1):
    model.train()
    random.shuffle(data)
    losses = []
    for i in range(0, len(data), BATCH):
        batch = data[i : i + BATCH]
        # Light noise so the model does not learn the synthetic voices' clean studio sound.
        audio = [a + np.random.normal(0, 0.003, a.shape).astype(np.float32) for a, _ in batch]
        inputs = processor(audio, sampling_rate=16000, return_tensors="pt", padding=True).to("cuda")
        labels = processor.tokenizer.pad({"input_ids": [l for _, l in batch]}, return_tensors="pt")
        targets = labels.input_ids.masked_fill(labels.attention_mask.ne(1), -100).to("cuda")
        with torch.autocast("cuda", dtype=torch.bfloat16):
            loss = model(**inputs, labels=targets).loss
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        optimizer.zero_grad()
        losses.append(loss.item())
    dev_wer = score(dev)[0]
    history.append({"epoch": epoch, "loss": float(np.mean(losses)), "dev": dev_wer})
    print(f"epoch {epoch}: loss {np.mean(losses):.3f}, dev {dev_wer:.3f}, {time.time() - started:.0f} s", flush=True)
    if dev_wer < best:
        best = dev_wer
        model.save_pretrained(OUT)
        processor.save_pretrained(OUT)

report["history"] = history
if (OUT / "config.json").exists():
    model = Wav2Vec2BertForCTC.from_pretrained(OUT).to("cuda")
    persona_wer, samples = score(held_out)
    report["after"] = {"dev": best, "personas": persona_wer}
    report["samples"] = [{"reference": t, "hypothesis": h} for (_, t), h in list(zip(held_out, samples))[:12]]
else:
    report["after"] = None  # no epoch beat the base model on dev; nothing saved
print(json.dumps({"before": report["before"], "after": report["after"]}), flush=True)
(OUT / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
