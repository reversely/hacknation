"""The translate call: NLLB-200 600M, beam search, one sentence at a time (docs/space.md, Model
calls). Cached texts never reach the GPU function, so they cost the visitor no ZeroGPU quota."""

import re
import time

import spaces
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from . import cache
from .config import MODELS
from .weights import local_path

SPEC = MODELS["translation"]
LANGUAGES = SPEC["languages"]
_path = local_path("translation")
_tokenizer = AutoTokenizer.from_pretrained(_path)
# Placed on the GPU when the module loads, as ZeroGPU requires.
_model = AutoModelForSeq2SeqLM.from_pretrained(_path, torch_dtype=getattr(torch, SPEC["dtype"])).to("cuda").eval()


def _sentences(text: str) -> list[str]:
    # NLLB dropped every sentence after the first in a longer input, so each sentence goes alone;
    # splitting only at punctuation followed by a space keeps addresses like wren.site whole.
    return [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]


@spaces.GPU(duration=SPEC["gpu_seconds"])
def _generate(sentences: list[str], source: str, target: str) -> list[str]:
    _tokenizer.src_lang = LANGUAGES[source]
    batch = _tokenizer(sentences, return_tensors="pt", padding=True).to("cuda")
    with torch.inference_mode():
        out = _model.generate(**batch, forced_bos_token_id=_tokenizer.convert_tokens_to_ids(LANGUAGES[target]), **SPEC["generation"])
    return _tokenizer.batch_decode(out, skip_special_tokens=True)


def translate(texts: list[str], source: str, target: str) -> dict:
    if source not in LANGUAGES or target not in LANGUAGES:
        raise ValueError(f"Unsupported language pair {source}->{target}")
    started = time.time()
    if source == target:
        return {"texts": texts, "model": SPEC["repo"], "revision": SPEC["revision"], "ms": 0, "cached": len(texts), "generated": 0}
    keys = [cache.key("translate", SPEC["revision"], SPEC["generation"], {"text": t, "source": source, "target": target}) for t in texts]
    results: list[str | None] = [cache.get(k) for k in keys]
    misses = [i for i, r in enumerate(results) if r is None]
    if misses:
        pieces = [(i, s) for i in misses for s in _sentences(texts[i])]
        translated = _generate([s for _, s in pieces], source, target) if pieces else []
        joined: dict[int, list[str]] = {}
        for (i, _), out in zip(pieces, translated):
            joined.setdefault(i, []).append(out)
        for i in misses:
            results[i] = " ".join(joined.get(i, [""]))
            cache.put(keys[i], results[i])
    return {"texts": results, "model": SPEC["repo"], "revision": SPEC["revision"], "ms": int((time.time() - started) * 1000), "cached": len(texts) - len(misses), "generated": len(misses)}
