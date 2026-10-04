"""Loads each pinned model revision from the bucket, downloading only a revision it lacks
(docs/space.md, Caching)."""

from huggingface_hub import snapshot_download

from .config import MODELS, WEIGHTS


def local_path(role: str) -> str:
    spec = MODELS[role]
    try:
        return snapshot_download(spec["repo"], revision=spec["revision"], allow_patterns=spec["files"], cache_dir=WEIGHTS, local_files_only=True)
    except Exception:
        # First start on this machine: download the pinned revision to local disk; a restart that keeps
        # the disk skips this.
        print(f"Downloading {spec['repo']}@{spec['revision'][:12]} into {WEIGHTS}", flush=True)
        return snapshot_download(spec["repo"], revision=spec["revision"], allow_patterns=spec["files"], cache_dir=WEIGHTS)
