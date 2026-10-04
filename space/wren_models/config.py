"""Reads models.json, the one list of every model the Space serves (docs/space.md, Models)."""

import json
import os
from pathlib import Path

MODELS = json.loads((Path(__file__).parent.parent / "models.json").read_text())
# The storage bucket is mounted at /data on the Space; WREN_DATA points elsewhere for local runs.
DATA = Path(os.environ.get("WREN_DATA", "/data"))
WEIGHTS = DATA / "hf"
CACHE = DATA / "cache"
