// Fixes applied to a Kiswahili transcript before translation (docs/interview.md). In the
// benchmark, CTC speech models wrote "Jumamosi" as "juma mosi", which NLLB rendered as "every week
// one", and spoke phone numbers as digit words that the agent could not rebuild from the English.

const DIGITS: Record<string, string> = { sifuri: '0', moja: '1', mbili: '2', tatu: '3', nne: '4', tano: '5', sita: '6', saba: '7', nane: '8', tisa: '9' };
const DIGIT_WORD = Object.keys(DIGITS).join('|');
// Seven or more digit words in a row, separated by spaces or commas: a phone number, never a price
// or a clock time, which use one or two number words at a time.
const DIGIT_RUN = new RegExp(`\\b(?:(?:${DIGIT_WORD})[\\s,]+){6,}(?:${DIGIT_WORD})\\b`, 'gi');

export function normalizeTranscript(text: string): string {
  return text
    .replace(/\bjuma\s+(mosi|pili|tatu|nne|tano)\b/gi, (_, day: string) => `Juma${day.toLowerCase()}`)
    .replace(DIGIT_RUN, (run) =>
      run
        .split(/[\s,]+/)
        .map((word) => DIGITS[word.toLowerCase()])
        .join(''),
    );
}
