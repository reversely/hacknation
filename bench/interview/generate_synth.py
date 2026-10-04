"""Generate the synthetic Kiswahili training set from synth_prompts.json (docs/interview.md).

Each prompt is spoken by one voice, the one synth_prompts.json assigns (rotating through the nine
non-test voices), and saved as a
16 kHz mono WAV under ~/wren-bench/synth/<split>/<prompt id>-<voice>.wav with a manifest.jsonl
beside it. A clip that already exists is skipped. The API key comes from .env and is never printed.

Usage: python3 bench/interview/generate_synth.py [--dry-run]
"""

import json
import sys
from pathlib import Path

from generate_audio import api_key, synthesize, write_wav

OUT = Path.home() / "wren-bench" / "synth"


def main() -> None:
    data = json.loads((Path(__file__).parent / "synth_prompts.json").read_text())
    jobs = [(p, p["voice_id"], OUT / p["split"] / f"{p['id']}-{p['voice_id']}.wav") for p in data["prompts"]]
    todo = [job for job in jobs if not job[2].exists()]
    print(f"{len(todo)} of {len(jobs)} clips to generate, {sum(len(p['text']) for p, _, _ in todo)} characters")
    if "--dry-run" in sys.argv:
        return

    key = api_key()
    model = {"voice_id": None, "model": "eleven_v3"}
    for number, (prompt, voice, path) in enumerate(todo, 1):
        write_wav(path, synthesize(prompt["text"], {**model, "voice_id": voice}, key))
        if number % 25 == 0:
            print(f"[{number}/{len(todo)}]", flush=True)

    with (OUT / "manifest.jsonl").open("w") as manifest:
        for prompt, voice, path in jobs:
            if path.exists():
                manifest.write(json.dumps({"audio": str(path.relative_to(OUT)), "text": prompt["text"], "value": prompt["value"], "category": prompt["category"], "voice_id": voice, "split": prompt["split"], "synthetic": True}, ensure_ascii=False) + "\n")
    print("SYNTH_DONE")


if __name__ == "__main__":
    main()
