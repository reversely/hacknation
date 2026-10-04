// The bundle's link to the model server: one @gradio/client connection, and a cache in memory and
// IndexedDB keyed like the server's, so a repeated call never reaches the server or the visitor's
// GPU quota (docs/space.md, Caching).
import { Client } from '@gradio/client';

import models from '../../models.json';

export type TranslationEvent = { source: string; target: string; text: string; result: string; ms: number; from: 'browser' | 'server cache' | 'model' };

const memory = new Map<string, string>();
let client: Promise<Client> | null = null;
// The page's own origin on the Space; a local preview names the Space with ?space=<url>.
const server = new URLSearchParams(window.location.search).get('space') ?? window.location.origin;
// Test runs on this machine sign in with the owner's token from local storage, so they do not spend
// the anonymous ZeroGPU allowance; a visitor's browser never has it.
const testToken = (() => {
  try {
    return localStorage.getItem('wren-hf-token') as `hf_${string}` | null;
  } catch {
    return null;
  }
})();
const connect = () => (client ??= Client.connect(server, testToken ? { token: testToken } : {}));

// Calls on their way to the model server right now, so the page can show work in progress.
export const inflight = { count: 0, changed: () => {} };
async function tracked<T>(call: () => Promise<T>): Promise<T> {
  inflight.count++;
  inflight.changed();
  try {
    return await call();
  } finally {
    inflight.count--;
    inflight.changed();
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const db: Promise<IDBDatabase | null> = new Promise((resolve) => {
  try {
    const open = indexedDB.open('wren-model-cache', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('results');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => resolve(null);
  } catch {
    resolve(null);
  }
});

async function stored(key: string): Promise<string | undefined> {
  const handle = await db;
  if (!handle) return undefined;
  return new Promise((resolve) => {
    const request = handle.transaction('results').objectStore('results').get(key);
    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => resolve(undefined);
  });
}

async function store(key: string, value: string): Promise<void> {
  const handle = await db;
  handle?.transaction('results', 'readwrite').objectStore('results').put(value, key);
}

const translationKey = (text: string, source: string, target: string) =>
  sha256(JSON.stringify({ call: 'translate', revision: models.translation.revision, settings: models.translation.generation, payload: { source, target, text } }));

// The cached translation if this browser already has it, without waiting.
export function cachedTranslation(text: string, source: string, target: string): string | undefined {
  return memory.get(`${source}>${target}:${text}`);
}

export async function translate(texts: string[], source: string, target: string, report: (event: TranslationEvent) => void): Promise<string[]> {
  if (source === target) return texts;
  const started = performance.now();
  const keys = await Promise.all(texts.map((text) => translationKey(text, source, target)));
  const results: (string | undefined)[] = await Promise.all(keys.map((key) => stored(key)));
  results.forEach((result, i) => {
    if (result === undefined) return;
    memory.set(`${source}>${target}:${texts[i]}`, result);
    report({ source, target, text: texts[i], result, ms: Math.round(performance.now() - started), from: 'browser' });
  });
  const misses = results.flatMap((result, i) => (result === undefined ? [i] : []));
  if (misses.length) {
    const reply = await tracked(async () => (await connect()).predict('/translate', { texts: misses.map((i) => texts[i]), source, target }));
    const data = (reply.data as [{ texts: string[]; cached: number; generated: number; ms: number }])[0];
    misses.forEach((i, n) => {
      results[i] = data.texts[n];
      memory.set(`${source}>${target}:${texts[i]}`, data.texts[n]);
      void store(keys[i], data.texts[n]);
      report({ source, target, text: texts[i], result: data.texts[n], ms: data.ms, from: data.generated ? 'model' : 'server cache' });
    });
  }
  return results as string[];
}

export type ModelEvent = { call: 'json' | 'chat' | 'visitor'; model: string; ms: number; from: 'browser' | 'server cache' | 'model'; summary: string };

// The json and chat calls, cached in the browser like translate.
async function cachedCall(call: 'json' | 'chat' | 'visitor', revision: string, payload: Record<string, unknown>, report: (event: ModelEvent) => void, summary: string): Promise<string> {
  const key = await sha256(JSON.stringify({ call, revision, payload }));
  const started = performance.now();
  const hit = memory.get(key) ?? (await stored(key));
  if (hit !== undefined) {
    memory.set(key, hit);
    report({ call, model: { json: models.website_copy.repo, chat: models.agent.repo, visitor: models.visitor_chat.repo }[call], ms: Math.round(performance.now() - started), from: 'browser', summary });
    return hit;
  }
  const reply = await tracked(async () => (await connect()).predict(`/${call}`, payload));
  const data = (reply.data as [{ text: string; cached: boolean; ms: number; model: string }])[0];
  memory.set(key, data.text);
  void store(key, data.text);
  report({ call, model: data.model, ms: data.ms, from: data.cached ? 'server cache' : 'model', summary });
  return data.text;
}

export const jsonCall = (prompt: string, schema: object, maxTokens: number, report: (event: ModelEvent) => void) =>
  cachedCall('json', models.website_copy.revision, { prompt, schema, max_tokens: maxTokens }, report, 'Website copy');

export const chatCall = (messages: { role: string; content: string }[], maxTokens: number, report: (event: ModelEvent) => void, summary: string) =>
  cachedCall('chat', models.agent.revision, { messages, max_tokens: maxTokens }, report, summary);

export const visitorCall = (messages: { role: string; content: string }[], maxTokens: number, report: (event: ModelEvent) => void) =>
  cachedCall('visitor', models.visitor_chat.revision, { messages, max_tokens: maxTokens }, report, 'Visitor chat');
