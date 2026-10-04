// Runs the demonstration's scripted survey through the Space's model calls with the repository's
// HF_TOKEN: the site build in Kiswahili and English, one visitor question and one review. It checks
// the live pipeline end to end and fills the server cache, so visitors who replay the same inputs
// spend no ZeroGPU quota (docs/space.md, Caching).
//   bun --env-file=../../.env run scripts/warm-cache.ts
import { Client } from '@gradio/client';

import { buildSite } from '../../../app/src/survey/pipeline';
import { englishSurvey } from '../src/state';
import { DEMO_QUESTION, DEMO_REVIEW, DEMO_SURVEY } from '../src/demo-inputs';
import { parseSentiment, QUESTION_TOKENS, questionMessages, SENTIMENT_MESSAGES, SENTIMENT_TOKENS, UNKNOWN, VISITOR_TOKENS, visitorFacts, visitorMessages } from '../src/prompts';
import { SUGGESTED } from '../src/site';
import type { SiteContent } from '../../../app/src/survey/pipeline';

const token = process.env.HF_TOKEN as `hf_${string}` | undefined;
const client = await Client.connect(process.env.WREN_SPACE ?? 'reversely/wren', token ? { token } : {});
const call = async <T>(name: string, payload: Record<string, unknown>): Promise<T> => ((await client.predict(`/${name}`, payload)).data as [T])[0];

const deps = {
  translate: async (text: string, source: string, target: string) => (await call<{ texts: string[] }>('translate', { texts: [text], source, target })).texts[0],
  generate: async (prompt: string, schema: object, maxTokens: number) => (await call<{ text: string }>('json', { prompt, schema, max_tokens: maxTokens })).text,
};

// The operator's Kiswahili site, then the twin's English site, exactly as the page builds them.
const surveys = [DEMO_SURVEY, await englishSurvey(DEMO_SURVEY, (text) => deps.translate(text, 'sw', 'en'))];
let operatorSite: SiteContent | null = null;
const built: SiteContent[] = [];
for (const survey of surveys) {
  const language = survey.language;
  const started = Date.now();
  const result = await buildSite(survey, deps);
  operatorSite ??= result.site;
  built.push(result.site);
  console.log(`${language}: ${Date.now() - started} ms, coder attempts ${result.attempts}, fell back ${result.fellBack}${result.problems.length ? `, last problems: ${result.problems.join('; ')}` : ''}`);
  console.log(`  headline: ${result.site.headline}`);
  console.log(`  introduction: ${result.site.introduction}`);
}

const answer = await call<{ text: string; cached: boolean; ms: number }>('chat', { messages: questionMessages(operatorSite!, DEMO_QUESTION), max_tokens: QUESTION_TOKENS });
console.log(`question: ${answer.text} (${answer.cached ? 'cached' : `${answer.ms} ms`})`);
// The English twin shows the operator Wren's Kiswahili draft in English.
console.log(`draft in English: ${await deps.translate(answer.text, 'sw', 'en')}`);
const sentiment = await call<{ text: string }>('chat', { messages: SENTIMENT_MESSAGES(DEMO_REVIEW), max_tokens: SENTIMENT_TOKENS });
console.log(`review sentiment: ${parseSentiment(sentiment.text)} (raw: ${sentiment.text})`);

// The chat's suggested questions on both versions of the site, as askSite (src/inference.ts) runs them.
const english = built[1];
for (const site of built) {
  for (const question of SUGGESTED[site.language]) {
    const asked = site.language === 'en' ? question : await deps.translate(question, site.language, 'en');
    const reply = await call<{ text: string }>('visitor', { messages: visitorMessages(visitorFacts(english, []), asked), max_tokens: VISITOR_TOKENS });
    const unknown = reply.text.toLowerCase().includes(UNKNOWN.toLowerCase());
    const shown = unknown || site.language === 'en' ? reply.text : await deps.translate(reply.text, 'en', site.language);
    console.log(`chat ${site.language}: ${question} -> ${shown}`);
  }
}
