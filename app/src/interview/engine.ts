import type { ChatModel } from '../agent/agentLoop';
import { extract, type Extracted, type ServiceType, type Slot } from './extract';
import { BUSINESS, CONFIRM, CONTACT, MAX_SERVICES, MORE_SERVICES, serviceQuestions, type Question } from './questions';

// The interview's state machine (docs/interview.md). The app asks fixed questions in order; the
// model only reads answers. An answer that cannot be read gets one clarifying question, then the
// field stays empty and the read-back shows it. The read-back accepts one correction at a time.

export type ServiceRecord = {
  type?: ServiceType;
  description?: string;
  duration_minutes?: number;
  price_kes?: number;
  capacity?: number;
  availability?: Slot[];
  instructions?: string;
};

export type InterviewRecord = {
  name?: string;
  address?: string;
  services: ServiceRecord[];
  phone?: string;
  email?: string | null;
  wants_photos_now?: boolean;
  confirmed: boolean;
};

export type Step = { question: Question; attempt: number; say: string };
export type AnswerResult = { saved: boolean; extracted: Extracted | null };

export class Interview {
  readonly record: InterviewRecord = { services: [], confirmed: false };
  private queue: Question[] = [...BUSINESS, ...serviceQuestions(1), MORE_SERVICES, ...CONTACT, CONFIRM];
  private attempt = 0;
  private corrections = 0;
  // The first answer to a question, kept while its clarifying question is asked: "Jumamosi asubuhi"
  // gives the day and the clarification "saa tatu asubuhi" the time, so both are read together.
  private earlier: { text: string; transcript: string } | null = null;

  constructor(private readonly model: ChatModel) {}

  // The next thing Wren says, or null when the interview is finished.
  current(): Step | null {
    const question = this.queue[0];
    if (!question) return null;
    return { question, attempt: this.attempt, say: this.attempt === 0 ? question.sw : question.clarify };
  }

  // `text` is the English the model reads; `transcript` is the Kiswahili it came from.
  async answer(latestText: string, latestTranscript = ''): Promise<AnswerResult> {
    const question = this.queue[0];
    const text = this.earlier ? `${this.earlier.text} ${latestText}` : latestText;
    const transcript = this.earlier ? `${this.earlier.transcript} ${latestTranscript}`.trim() : latestTranscript;
    const extracted = verbatim(question, transcript) ?? (await extract(this.model, question, text, this.fieldKeys(), transcript));
    if (!extracted) {
      // One clarifying question, then move on; an optional field is skipped straight away.
      if (this.attempt === 0 && !question.optional) {
        this.attempt = 1;
        this.earlier = { text: latestText, transcript: latestTranscript };
      } else {
        this.advance();
      }
      return { saved: false, extracted: null };
    }
    if (question.kind === 'confirm') {
      const { confirmed, correction } = extracted.value as { confirmed: boolean; correction: string | null };
      if (confirmed && !correction) {
        this.record.confirmed = true;
      } else {
        // The correction is in the same answer ("no, it is five visitors"), so the corrected
        // field is read from it, then the record is read back again.
        const target = this.questionFor(correction);
        const fix = target ? await extract(this.model, target, text, [], transcript) : null;
        if (target && fix) this.store(target, fix);
        if (this.corrections++ < 2) this.queue.splice(1, 0, CONFIRM);
      }
      this.advance();
      return { saved: true, extracted };
    }
    this.store(question, extracted);
    if (question.key === MORE_SERVICES.key && extracted.value === true && this.record.services.length < MAX_SERVICES) {
      // Another service: its questions, then ask again whether there are more.
      this.queue.splice(1, 0, ...serviceQuestions(this.record.services.length + 1), MORE_SERVICES);
    }
    this.advance();
    return { saved: true, extracted };
  }

  private store(question: Question, extracted: Extracted): void {
    const r = this.record;
    const service = /^service_(\d+)\./.exec(question.key);
    if (service) {
      const index = Number(service[1]) - 1;
      const s = (r.services[index] ??= {});
      const field = question.key.split('.')[1];
      if (field === 'type') s.type = extracted.value as ServiceType;
      if (field === 'description') s.description = extracted.value as string;
      if (field === 'duration') s.duration_minutes = extracted.value as number;
      if (field === 'price') s.price_kes = extracted.value as number;
      if (field === 'capacity') s.capacity = extracted.value as number;
      if (field === 'availability') s.availability = extracted.value as Slot[];
      if (field === 'instructions') s.instructions = extracted.value as string;
    } else if (question.key === 'name') r.name = extracted.value as string;
    else if (question.key === 'address') r.address = extracted.value as string;
    else if (question.key === 'contact.phone') r.phone = extracted.value as string;
    else if (question.key === 'contact.email') r.email = extracted.value as string | null;
    else if (question.key === 'photos') r.wants_photos_now = extracted.value as boolean;
  }

  private advance(): void {
    this.queue.shift();
    this.attempt = 0;
    this.earlier = null;
  }

  private fieldKeys(): string[] {
    const services = this.record.services.flatMap((_, i) => serviceQuestions(i + 1).map((q) => q.key));
    return [...BUSINESS.map((q) => q.key), ...services, ...CONTACT.map((q) => q.key)];
  }

  private questionFor(key: string | null): Question | null {
    if (!key) return null;
    const all = [...BUSINESS, ...this.record.services.flatMap((_, i) => serviceQuestions(i + 1)), ...CONTACT];
    return all.find((q) => q.key === key) ?? null;
  }
}

// Some answers are copied, never translated: translation turned "Shamba la Kahawa la Ondera" into
// "The Ondera Coffee Farm" and "ondera.coffee@gmail.com" into "andera.coffee@gmail.com". The business
// name is the answer as said, and an email address is taken from the transcript when one is in it.
export function verbatim(question: Question, transcript: string): Extracted | null {
  const said = transcript.trim();
  if (!said) return null;
  if (question.key === 'name') {
    const name = said.replace(/^(jina (lake|la biashara) ni|biashara (yangu|yetu) inaitwa|tunaitwa)\s+/i, '').replace(/[.!]+$/, '').trim();
    // A long answer is not just the name; the model reads it instead.
    return name && name.split(/\s+/).length <= 6 ? { kind: 'text', value: name } : null;
  }
  if (question.kind === 'email') {
    const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(said)?.[0];
    return email ? { kind: 'email', value: email.toLowerCase() } : null;
  }
  return null;
}
