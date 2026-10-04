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
