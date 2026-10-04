// The screens' one link to inference (docs/space.md, Inference). `translate` and `generate` are the
// survey pipeline's dependencies (app/src/survey/pipeline.ts); `answerQuestion` and `reviewSentiment`
// serve the created site's visitors. All are backed by the Space's model calls and both caches.
import type { JsonGenerator } from '../../../app/src/agent/websiteCreator';
import type { Translate } from '../../../app/src/inference/translator';
import type { SiteContent } from '../../../app/src/survey/pipeline';
import type { Language } from '../../../app/src/survey/survey';
import { parseSentiment, QUESTION_TOKENS, questionMessages, SENTIMENT_MESSAGES, SENTIMENT_TOKENS, insightLines, SUMMARY_TOKENS, summaryMessages, UNKNOWN, unsupported, VISITOR_TOKENS, visitorFacts, visitorMessages, type ActivityLine } from './prompts';
import { chatCall, jsonCall, visitorCall, translate as translateTexts, type ModelEvent, type TranslationEvent } from './models';

export type Reporters = { translation(event: TranslationEvent): void; model(event: ModelEvent): void; problem(text: string): void };

export function pipelineDeps(report: Reporters): { translate: Translate; generate: JsonGenerator } {
  return {
    // A failed translation keeps the original text, so the site still builds from the operator's
    // own words; the narration says which text stayed untranslated.
    translate: async (text, source, target) => {
      try {
        return (await translateTexts([text], source, target, report.translation))[0];
      } catch (error) {
        report.problem(`Translation failed, so "${text.slice(0, 40)}" stays as written: ${error instanceof Error ? error.message : String(error)}`);
        return text;
      }
    },
    generate: (prompt, schema, maxTokens) => jsonCall(prompt, schema, maxTokens, report.model),
  };
}

export async function answerQuestion(site: SiteContent, question: string, report: Reporters): Promise<string> {
  return chatCall(questionMessages(site, question), QUESTION_TOKENS, report.model, 'Visitor question');
}

export type Sentiment = ReturnType<typeof parseSentiment>;

export async function reviewSentiment(review: string, report: Reporters): Promise<Sentiment> {
  return parseSentiment(await chatCall(SENTIMENT_MESSAGES(review), SENTIMENT_TOKENS, report.model, 'Review sentiment'));
}

// The visitor's chat: the question crosses into English, the 0.5B model answers from the English
// facts, and the answer crosses back into the site's language. An answer the facts do not support,
// by the model's own word or by the grounding check, goes to the operator instead.
export async function askSite(site: SiteContent, english: SiteContent, reviews: string[], question: string, report: Reporters): Promise<{ text: string; unknown: boolean }> {
  const deps = pipelineDeps(report);
  const toEnglish = site.language === 'en' ? question : await deps.translate(question, site.language, 'en');
  const facts = visitorFacts(english, reviews);
  const reply = await visitorCall(visitorMessages(facts, toEnglish), VISITOR_TOKENS, report.model);
  const unknown = reply.toLowerCase().includes(UNKNOWN.toLowerCase()) || !reply.trim() || unsupported(toEnglish, reply, facts);
  return { text: unknown || site.language === 'en' ? reply : await deps.translate(reply, 'en', site.language), unknown };
}

// Wren's insights on the operator's phone: the on-device agent (Gemma 4 E2B) writes up to three lines
// in English; a Kiswahili phone shows NLLB's translation of each and the English twin the original.
export async function summarise(business: string, lines: ActivityLine[], language: Language, report: Reporters): Promise<{ en: string[]; local: string[] }> {
  const en = insightLines(await chatCall(summaryMessages(business, lines), SUMMARY_TOKENS, report.model, "Wren's insights"));
  const translate = pipelineDeps(report).translate;
  const local = language === 'en' ? en : await Promise.all(en.map((line) => translate(line, 'en', language)));
  return { en, local };
}
