"""Generate the synthetic interviewee audio for the voice interview benchmark (docs/interview.md).

Reads personas.json, asks ElevenLabs Eleven v3 for each Kiswahili answer, and writes 16 kHz mono
WAV files to ~/wren-bench/audio/<persona>/<answer key>.wav, outside git. A clip that already
exists is skipped, so a rerun costs no credits. The API key comes from ELEVENLABS_API_KEY in the
repository's .env and is never printed.

Usage: python3 bench/interview/generate_audio.py [--dry-run]
"""

import json
import random
import struct
import sys
import urllib.request
import wave
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path.home() / "wren-bench" / "audio"
RATE = 16000


def api_key() -> str:
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("ELEVENLABS_API_KEY="):
            return line.split("=", 1)[1].strip().strip("'\"")
    sys.exit("ELEVENLABS_API_KEY is not set in .env")


def synthesize(text: str, voice: dict, key: str) -> bytes:
    request = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice['voice_id']}?output_format=pcm_16000",
        data=json.dumps({"text": text, "model_id": voice["model"], "language_code": "sw"}).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def write_wav(path: Path, pcm: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(pcm)


def add_noise(pcm: bytes, noise_db: float, seed: int) -> bytes:
    """Mixes white noise at noise_db relative to full scale into 16-bit PCM."""
    rng = random.Random(seed)
    amplitude = 32767 * 10 ** (noise_db / 20)
    samples = struct.unpack(f"<{len(pcm) // 2}h", pcm)
    noisy = [max(-32768, min(32767, int(s + rng.gauss(0, amplitude)))) for s in samples]
    return struct.pack(f"<{len(noisy)}h", *noisy)


def filename(key: str) -> str:
    return key.replace("#", "__") + ".wav"


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    config = json.loads((Path(__file__).parent / "personas.json").read_text())
    voice = config["voice"]
    personas = {p["id"]: p for p in config["personas"]}

    todo = [
        (persona["id"], key, text)
        for persona in config["personas"]
        if "answers" in persona
        for key, text in persona["answers"].items()
        if not (OUT / persona["id"] / filename(key)).exists()
    ]
    chars = sum(len(text) for _, _, text in todo)
    print(f"{len(todo)} clips to generate, {chars} characters (about {chars} credits)")
    if dry_run:
        return

    key = api_key() if todo else ""
    for number, (persona_id, answer_key, text) in enumerate(todo, 1):
        write_wav(OUT / persona_id / filename(answer_key), synthesize(text, voice, key))
        print(f"[{number}/{len(todo)}] {persona_id}/{answer_key}")

    # Noisy personas reuse another persona's clips with noise mixed in.
    for persona in config["personas"]:
        if "same_as" not in persona:
            continue
        source = OUT / persona["same_as"]
        for clip in sorted(source.glob("*.wav")):
            target = OUT / persona["id"] / clip.name
            if target.exists():
                continue
            with wave.open(str(clip)) as src:
                pcm = src.readframes(src.getnframes())
            write_wav(target, add_noise(pcm, persona["noise_db"], seed=zlib.crc32(clip.name.encode())))
        print(f"{persona['id']}: noisy copies of {persona['same_as']}")

    # The ground truth travels with the audio so the runner on the Veriton needs only this folder.
    (OUT / "personas.json").write_text(json.dumps(config, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
