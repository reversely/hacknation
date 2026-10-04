import { normalizeSwahiliTimes } from '../agent/swahiliTime';

// Development only: a dedicated translation model (not a chat model) on a server, for the
// English-core agent (docs/language.md). Set EXPO_PUBLIC_TRANSLATOR_URL to a service that answers
// POST /translate {text, source, target} with {text}.
export const TRANSLATOR_URL = process.env.EXPO_PUBLIC_TRANSLATOR_URL ?? null;

export type Translate = (text: string, source: 'sw' | 'en', target: 'sw' | 'en') => Promise<string>;

export function remoteTranslator(baseUrl: string): Translate {
  return async (text, source, target) => {
    // Swahili clock times become digits first: every translation model tested misread them.
    const input = source === 'sw' ? normalizeSwahiliTimes(text) : text;
    const response = await fetch(`${baseUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input, source, target }),
    });
    if (!response.ok) throw new Error(`The translator answered with error ${response.status}`);
    return ((await response.json()) as { text: string }).text;
  };
}
