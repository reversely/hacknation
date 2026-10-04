"""Build the prompt set for a synthetic Kiswahili training set (docs/interview.md).

Each prompt is one short spoken answer from the interview's domain, with the exact value it states,
so the same set serves speech-to-text fine-tuning and extraction checks. Numbers, counts and clock
times are spelled out by rule, not by hand. Voices exclude Halima, who voices the test personas, so
no test speaker appears in training. Every line is labelled synthetic. The Kiswahili needs review
by a native speaker.

Usage: python3 bench/interview/synth_prompts.py   (writes bench/interview/synth_prompts.json)
"""

import json
import random
import zlib
from pathlib import Path

VOICES = {  # ElevenLabs Voice Library, language sw, excluding Halima (i5oE89JoUCpIgvSOemWx)
    "f07nEXP6Cp3SGtqJtJfh": "Rashidi",
    "85I9qUNaRIEQGWJ91dHe": "Juma (blunt)",
    "77qZTQGw9X7YWOVS6AQQ": "Achieng",
    "yu6Cy4KnJhEbUubM2XJl": "Wanjiru",
    "fcJJxRPg9WEEhH0Uqnwn": "Kelvin",
    "1F0knNkQeIgyHeW4heKC": "Neema",
    "8bTJQunXqF1x0VZwSUMs": "Faiza",
    "90GgjYd3t15Qldd8eZuQ": "Baraka",
    "h65Hy3wCmpuo1Fce3en3": "Juma (narrator)",
}

UNITS = ["sifuri", "moja", "mbili", "tatu", "nne", "tano", "sita", "saba", "nane", "tisa"]
TENS = ["", "kumi", "ishirini", "thelathini", "arobaini", "hamsini", "sitini", "sabini", "themanini", "tisini"]
# People take the wa- class: watu wawili, watatu... Six, seven, nine and ten stay unchanged.
PEOPLE = {1: "mmoja", 2: "wawili", 3: "watatu", 4: "wanne", 5: "watano", 8: "wanane"}
DAYS = [("monday", "Jumatatu"), ("tuesday", "Jumanne"), ("wednesday", "Jumatano"), ("thursday", "Alhamisi"), ("friday", "Ijumaa"), ("saturday", "Jumamosi"), ("sunday", "Jumapili")]
ENGLISH = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 8: "eight", 10: "ten", 12: "twelve", 15: "fifteen", 20: "twenty", 500: "five hundred", 800: "eight hundred", 1000: "one thousand", 1500: "one thousand five hundred", 2000: "two thousand", 2500: "two thousand five hundred", 3000: "three thousand"}


def below_100(n: int, people: bool = False) -> str:
    if n < 10:
        return PEOPLE.get(n, UNITS[n]) if people else UNITS[n]
    tens, unit = divmod(n, 10)
    return TENS[tens] + (f" na {below_100(unit, people)}" if unit else "")


def number(n: int, people: bool = False) -> str:
    """Kiswahili number words: 1500 -> 'elfu moja na mia tano', 25 -> 'ishirini na tano'."""
    if n < 100:
        return below_100(n, people)
    parts = []
    lakhs, rest = divmod(n, 100_000)
    thousands, rest = divmod(rest, 1000)
    hundreds, rest = divmod(rest, 100)
    if lakhs:
        parts.append(f"laki {below_100(lakhs)}")
    if thousands:
        parts.append(f"elfu {number(thousands)}")
    if hundreds:
        parts.append(f"mia {UNITS[hundreds]}")
    if rest:
        parts.append(below_100(rest, people))
    return " na ".join(parts) if len(parts) <= 2 else ", ".join(parts[:-1]) + " na " + parts[-1]


def clock(hour: int, minute: int = 0) -> str:
    """Kiswahili time counts hours from about 6: 09:00 -> 'saa tatu asubuhi'."""
    swahili_hour = (hour - 6) % 12 or 12
    period = "asubuhi" if 6 <= hour < 12 else "mchana" if 12 <= hour < 16 else "jioni" if 16 <= hour < 19 else "usiku"
    words = f"saa {number(swahili_hour)}"
    if minute == 30:
        words += " na nusu"
    elif minute == 15:
        words += " na robo"
    return f"{words} {period}"


def phone_words(digits: str) -> str:
    groups = [digits[0:4], digits[4:7], digits[7:10]]
    return ", ".join(" ".join(UNITS[int(d)] for d in g) for g in groups)


def prompts() -> list[dict]:
    rng = random.Random(7)
    out: list[dict] = []

    def add(category: str, text: str, value):
        out.append({"category": category, "text": text, "value": value})

    for amount in [300, 500, 750, 800, 1000, 1200, 1500, 1800, 2000, 2500, 3000, 3500, 4500, 5000, 7500, 10000, 12500, 15000]:
        words = number(amount)
        for template in ["Bei ni shilingi {w} kwa mtu mmoja.", "Ni {w} kwa kila mtu.", "Tunachukua shilingi {w}.", "Shilingi {w}, chakula kimejumuishwa."]:
            add("price", template.format(w=words), {"kes": amount})
        if amount in ENGLISH:
            add("price", f"{ENGLISH[amount].capitalize()} shillings per person.", {"kes": amount})
    for minutes, words in [(30, "nusu saa"), (45, "dakika arobaini na tano"), (60, "saa moja"), (90, "saa moja na nusu"), (120, "saa mbili"), (150, "saa mbili na nusu"), (180, "saa tatu"), (240, "saa nne"), (300, "saa tano")]:
        for template in ["Inachukua {w}.", "Kama {w} hivi.", "Ni {w} kwa kawaida."]:
            add("duration", template.format(w=words), {"minutes": minutes})
    for count in [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]:
        for template in ["Watu {w}.", "Wageni {w} kwa ziara moja.", "Tunaweza kuchukua hadi watu {w}."]:
            add("count", template.format(w=number(count, people=True)), {"count": count})
        if count in ENGLISH:
            add("count", f"{ENGLISH[count].capitalize()} people.", {"count": count})
    for hour, minute in [(7, 0), (8, 0), (8, 30), (9, 0), (10, 0), (10, 30), (11, 0), (12, 0), (14, 0), (15, 30), (16, 0), (17, 0)]:
        day_key, day = rng.choice(DAYS)
        second_key, second = rng.choice([d for d in DAYS if d[0] != day_key])
        time = f"{hour:02d}:{minute:02d}"
        add("schedule", f"Kila {day}, {clock(hour, minute)}.", [{"day": day_key, "time": time}])
        add("schedule", f"{day} na {second}, {clock(hour, minute)}.", [{"day": day_key, "time": time}, {"day": second_key, "time": time}])
        add("schedule", f"Tunaanza {clock(hour, minute)} siku ya {day}.", [{"day": day_key, "time": time}])
    for _ in range(12):
        digits = rng.choice(["07", "01"]) + "".join(str(rng.randrange(10)) for _ in range(8))
        add("phone", f"Namba yangu ni {phone_words(digits)}.", {"phone": "+254" + digits[1:]})
    for text, value in [("Ndiyo.", True), ("Ndiyo, sawa.", True), ("Ehe, ni hivyo.", True), ("Yes.", True), ("Hapana.", False), ("Hapana, ni hiyo tu.", False), ("Sina.", False), ("No, hiyo tu.", False)]:
        add("yes_no", text, {"answer": value})
    for text, value in [("Ni ziara ya shamba.", "tour"), ("Matembezi ya shamba.", "tour"), ("Ni warsha.", "workshop"), ("Warsha ya kupika.", "workshop"), ("Huduma binafsi.", "personal_service"), ("Ni personal service.", "personal_service"), ("Kitu kingine.", "other")]:
        add("service_type", text, {"type": value})
    for wrong, right in [(1500, 2000), (6, 5), (800, 1000), (10, 12)]:
        if wrong > 100:
            add("correction", f"Shilingi {number(wrong)}... hapana, samahani, ni {number(right)}.", {"kes": right})
        else:
            add("correction", f"Watu {number(wrong, people=True)}, hapana, ni {number(right, people=True)}.", {"count": right})

    for index, prompt in enumerate(out):
        prompt["id"] = f"s{index:04d}"
        prompt["voice_id"] = list(VOICES)[index % len(VOICES)]
        prompt["split"] = "dev" if zlib.crc32(prompt["text"].encode()) % 10 == 0 else "train"
        prompt["synthetic"] = True
    return out


if __name__ == "__main__":
    items = prompts()
    path = Path(__file__).parent / "synth_prompts.json"
    path.write_text(json.dumps({"about": __doc__.strip().splitlines()[0], "voices": VOICES, "prompts": items}, ensure_ascii=False, indent=1) + "\n")
    chars = sum(len(p["text"]) for p in items)
    by_category: dict[str, int] = {}
    for p in items:
        by_category[p["category"]] = by_category.get(p["category"], 0) + 1
    print(f"{len(items)} prompts, {chars} characters, {sum(p['split'] == 'dev' for p in items)} held out")
    print(by_category)
