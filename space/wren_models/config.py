"""Reads models.json, the one list of every model the Space serves (docs/space.md, Models)."""

import json
import os
from pathlib import Path

MODELS = json.loads((Path(__file__).parent.parent / "models.json").read_text())
# The storage bucket is mounted at /data on the Space; WREN_DATA points elsewhere for local runs. It
# holds the result cache, which must outlive restarts. Weights go to the Space's local disk instead:
# reading Gemma 4's 10 GB from the bucket mount took over 12 minutes a start, while a fresh download
# from the Hub at a pinned revision runs at about 700 MB/s.
DATA = Path(os.environ.get("WREN_DATA", "/data"))
WEIGHTS = Path(os.environ.get("WREN_WEIGHTS", Path.home() / ".cache" / "wren-weights"))
CACHE = DATA / "cache"
