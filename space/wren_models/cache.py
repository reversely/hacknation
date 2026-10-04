"""Result cache for deterministic model calls: memory over files in the bucket, keyed by the call,
the model revision, its settings and the input (docs/space.md, Caching)."""

import hashlib
import json
from pathlib import Path

from .config import CACHE

_memory: dict[str, object] = {}


def key(call: str, revision: str, settings: dict, payload: dict) -> str:
    blob = json.dumps({"call": call, "revision": revision, "settings": settings, "payload": payload}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode()).hexdigest()


def _file(k: str) -> Path:
    return CACHE / k[:2] / f"{k}.json"


def get(k: str):
    if k in _memory:
        return _memory[k]
    path = _file(k)
    if path.exists():
        _memory[k] = json.loads(path.read_text())
        return _memory[k]
    return None


def put(k: str, value) -> None:
    _memory[k] = value
    path = _file(k)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False))
