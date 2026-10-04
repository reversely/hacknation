// The screens' one link to inference (docs/space.md, Inference). `translate` and `generate` are the
// survey pipeline's dependencies (app/src/survey/pipeline.ts); `answerQuestion` and `reviewSentiment`
// serve the created site's visitors. All are backed by the Space's model calls and both caches.
import type { JsonGenerator } from '../../../app/src/agent/websiteCreator';
import type { Translate } from '../../../app/src/inference/translator';
import type { SiteContent } from '../../../app/src/survey/pipeline';
import type { Language } from '../../../app/src/survey/survey';
import type { OtherLanguage } from './universal';
import { FIXED, replyProblems, route, sanitise } from './chat-policy';
import { parseSentiment, QUESTION_TOKENS, questionMessages, SENTIMENT_MESSAGES, SENTIMENT_TOKENS, insightLines, SUMMARY_TOKENS, summaryMessages, UNKNOWN, VISITOR_TOKENS, visitorFacts, visitorMessages, type ActivityLine } from './prompts';
import { chatCall, jsonCall, visitorCall, translate as translateTexts, type ModelEvent, type TranslationEvent } from './models';

export type Reporters = { translation(event: TranslationEvent): void; model(event: ModelEvent): void; problem(text: string): void; note?(text: string): void };

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

// The visitor's chat, under the guidelines in chat-policy.ts. The question is cleaned and crosses
// into English; the input rules decide whether it gets a fixed reply, goes straight to the owner, or
// reaches the 0.5B model; the model answers from the English facts alone; the output checks send
// any unsupported answer to the owner; and the answer crosses back into the visitor's language.
export async function askSite(site: SiteContent, english: SiteContent, reviews: string[], question: string, report: Reporters, other: OtherLanguage | null = null): Promise<{ text: string; unknown: boolean; english: string }> {
  const deps = pipelineDeps(report);
  const clean = sanitise(question);
  const language = other?.code ?? site.language;
  const toVisitor = async (text: string) => (language === 'en' ? text : (await translateTexts([text], 'en', language, report.translation))[0]);
  const toEnglish = language === 'en' ? clean : (await translateTexts([clean], language, 'en', report.translation))[0];
  const facts = visitorFacts(english, reviews);
  const decided = route(toEnglish, clean, facts);
  if (decided.kind === 'fixed') {
    report.note?.(`Chat policy: fixed reply, ${decided.reason}`);
    const text = !other && (site.language === 'en' || site.language === 'sw') ? FIXED[decided.reply][site.language] : await toVisitor(FIXED[decided.reply].en);
    return { text, unknown: false, english: toEnglish };
  }
  if (decided.kind === 'owner') {
    report.note?.(`Chat policy: sent to the owner, ${decided.reason}`);
    return { text: '', unknown: true, english: toEnglish };
  }
  const reply = await visitorCall(visitorMessages(facts, toEnglish), VISITOR_TOKENS, report.model);
  const saysUnknown = reply.toLowerCase().includes(UNKNOWN.toLowerCase()) || !reply.trim();
  const problems = saysUnknown ? [] : replyProblems(toEnglish, reply, facts);
  if (saysUnknown || problems.length) {
    report.note?.(`Chat policy: sent to the owner, ${saysUnknown ? 'the facts do not answer it' : problems[0]}`);
    return { text: reply, unknown: true, english: toEnglish };
  }
  return { text: await toVisitor(reply), unknown: false, english: toEnglish };
}

// Wren's insights on the operator's phone: the on-device agent (Gemma 4 E2B) writes up to three lines
// in English; a Kiswahili phone shows NLLB's translation of each and the English twin the original.
export async function summarise(business: string, lines: ActivityLine[], language: Language, report: Reporters): Promise<{ en: string[]; local: string[] }> {
  const en = insightLines(await chatCall(summaryMessages(business, lines), SUMMARY_TOKENS, report.model, "Wren's insights"));
  const translate = pipelineDeps(report).translate;
  const local = language === 'en' ? en : await Promise.all(en.map((line) => translate(line, 'en', language)));
  return { en, local };
}

// A visitor's text in another language, for the operator: into English, then into the operator's
// language, both by NLLB.
export async function forOperator(text: string, other: OtherLanguage, language: Language, report: Reporters): Promise<{ from: string; en: string; local: string }> {
  const en = (await translateTexts([text], other.code, 'en', report.translation))[0];
  const local = language === 'en' ? en : await pipelineDeps(report).translate(en, 'en', language);
  return { from: other.label, en, local };
}
