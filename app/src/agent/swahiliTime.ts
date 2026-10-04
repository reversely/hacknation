// Kiswahili counts clock hours from about 6 am and 6 pm: "saa tatu asubuhi" is 9 am and "saa nane
// mchana" is 2 pm. Every translation model tested rendered some of these as the literal number
// ("eight in the afternoon"), so the app rewrites them to digits before translating. Only a time
// followed by a time-of-day word is rewritten: "matembezi ya saa mbili" is a two-hour walk.

const HOURS: Record<string, number> = {
  moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9, kumi: 10,
  'kumi na moja': 11, 'kumi na mbili': 12,
};
const PERIODS = ['asubuhi', 'mchana', 'alasiri', 'jioni', 'usiku'] as const;
type Period = (typeof PERIODS)[number];

// Longest names first, so "kumi na moja" is not read as "kumi".
const HOUR_PATTERN = Object.keys(HOURS).sort((a, b) => b.length - a.length).join('|');
const TIME = new RegExp(`\\bsaa (${HOUR_PATTERN}|\\d{1,2})(?:[:.](\\d{2}))?\\s+(?:za\\s+)?(${PERIODS.join('|')})\\b`, 'gi');

export function swahiliHourTo24(hour: number, period: Period): number {
  const western = ((hour + 6 - 1) % 12) + 1; // saa 1 -> 7, saa 6 -> 12, saa 7 -> 1, saa 12 -> 6
  switch (period) {
    case 'asubuhi': // morning: saa 12 asubuhi is 6 am, saa 6 asubuhi is noon
      return western === 12 ? 12 : western;
    case 'mchana':
    case 'alasiri':
    case 'jioni':
      return western === 12 ? 12 : western + 12;
    case 'usiku': // night: saa 1-6 usiku is 7 pm to midnight, saa 7-12 usiku is 1-6 am
      return hour >= 1 && hour <= 6 ? (western === 12 ? 0 : western + 12) : western;
  }
}

function format24(hour24: number, minutes: string | undefined): string {
  return `${String(hour24).padStart(2, '0')}:${minutes ?? '00'}`;
}

export function normalizeSwahiliTimes(text: string): string {
  return text.replace(TIME, (_match, hourWord: string, minutes: string | undefined, period: string) => {
    const hour = /^\d+$/.test(hourWord) ? Number(hourWord) : HOURS[hourWord.toLowerCase()];
    if (!hour || hour > 12) return _match;
    return format24(swahiliHourTo24(hour, period.toLowerCase() as Period), minutes);
  });
}

const WORDS_BY_HOUR = Object.fromEntries(Object.entries(HOURS).map(([word, hour]) => [hour, word]));

// The reverse for text going to the operator: "09:00" becomes "saa tatu asubuhi". The translator
// writes "saa 9:00", which a Kiswahili reader takes as 3 pm.
export function hour24ToSwahili(hour24: number, minutes: number): string {
  const swahiliHour = ((hour24 + 6) % 12) || 12; // 07:00 -> saa 1, 12:00 -> saa 6, 18:00 -> saa 12
  const period: Period = hour24 >= 4 && hour24 < 12 ? 'asubuhi' : hour24 >= 12 && hour24 < 16 ? 'mchana' : hour24 >= 16 && hour24 < 19 ? 'jioni' : 'usiku';
  const base = `saa ${WORDS_BY_HOUR[swahiliHour]}`;
  const withMinutes = minutes === 0 ? base : minutes === 30 ? `${base} na nusu` : minutes === 15 ? `${base} na robo` : `${base} na dakika ${minutes}`;
  return `${withMinutes} ${period}`;
}

export function formatSwahiliTimes(text: string): string {
  // A time-of-day word already after the time is replaced too, so it is not said twice.
  return text.replace(/\b(?:saa\s+)?([01]?\d|2[0-3]):([0-5]\d)\b(?:\s+(?:asubuhi|mchana|alasiri|jioni|usiku)\b)?/gi, (_match, hour: string, minutes: string) =>
    hour24ToSwahili(Number(hour), Number(minutes)),
  );
}
