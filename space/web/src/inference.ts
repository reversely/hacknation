// The screens' one link to inference (docs/space.md, Inference). `translate` and `generate` are the
// survey pipeline's dependencies (app/src/survey/pipeline.ts); `answerQuestion` and `reviewSentiment`
// serve the created site's visitors. All are backed by the Space's model calls and both caches.
import type { JsonGenerator } from '../../../app/src/agent/websiteCreator';
import type { Translate } from '../../../app/src/inference/translator';
import type { SiteContent } from '../../../app/src/survey/pipeline';
import { parseSentiment, QUESTION_TOKENS, questionMessages, SENTIMENT_MESSAGES, SENTIMENT_TOKENS, UNKNOWN, VISITOR_TOKENS, visitorFacts, visitorMessages } from './prompts';
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
// facts, and the answer crosses back into the site's language. An answer the facts do not support
// goes to the operator instead.
export async function askSite(site: SiteContent, english: SiteContent, reviews: string[], question: string, report: Reporters): Promise<{ text: string; unknown: boolean }> {
  const deps = pipelineDeps(report);
  const toEnglish = site.language === 'en' ? question : await deps.translate(question, site.language, 'en');
  const reply = await visitorCall(visitorMessages(visitorFacts(english, reviews), toEnglish), VISITOR_TOKENS, report.model);
  const unknown = reply.toLowerCase().includes(UNKNOWN.toLowerCase()) || !reply.trim();
  return { text: unknown || site.language === 'en' ? reply : await deps.translate(reply, 'en', site.language), unknown };
}
