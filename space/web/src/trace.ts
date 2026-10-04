// The agent trace beside the phone while the site is built: every translation, the coding model's
// call and its JSON, the copy check, and the files written, recorded from the real calls and
// revealed a line at a time (docs/space.md, Agent trace).

import type { JsonGenerator } from '../../../app/src/agent/websiteCreator';
import type { Translate } from '../../../app/src/inference/translator';
import type { BuildResult } from '../../../app/src/survey/pipeline';
import { h } from './ui';

export type TraceLine = { kind: 'head' | 'cmd' | 'out' | 'code' | 'ok' | 'warn'; text: string };

const MAX_CODE_LINES = 40;
const clip = (text: string, n = 120) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

export class Trace {
  lines: TraceLine[] = [];
  shown = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private redraw: () => void) {}

  redrawNow(): void {
    this.redraw();
  }

  reset(): void {
    this.lines = [];
    this.shown = 0;
  }

  push(kind: TraceLine['kind'], text: string): void {
    this.lines.push({ kind, text });
    this.play();
  }

  code(text: string): void {
    const lines = text.split('\n');
    for (const line of lines.slice(0, MAX_CODE_LINES)) this.lines.push({ kind: 'code', text: clip(line) });
    if (lines.length > MAX_CODE_LINES) this.lines.push({ kind: 'code', text: `… ${lines.length - MAX_CODE_LINES} more lines` });
    this.play();
  }

  get done(): boolean {
    return this.shown >= this.lines.length;
  }

  // Lines appear at reading pace; code lines faster, as a stream of output.
  private play(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.shown >= this.lines.length) {
        clearInterval(this.timer!);
        this.timer = null;
        this.redraw();
        return;
      }
      const step = this.lines[this.shown].kind === 'code' ? 3 : 1;
      this.shown = Math.min(this.lines.length, this.shown + step);
      this.redraw();
    }, 90);
  }

  // The pipeline's dependencies, wrapped so each call writes its lines.
  wrap(deps: { translate: Translate; generate: JsonGenerator }): { translate: Translate; generate: JsonGenerator } {
    return {
      translate: async (text, source, target) => {
        this.push('cmd', `nllb-200-600m translate ${source}→${target}`);
        this.push('out', `"${clip(text, 90)}"`);
        const result = await deps.translate(text, source, target);
        this.push('ok', `→ "${clip(result, 90)}"`);
        return result;
      },
      generate: async (prompt, schema, maxTokens) => {
        this.push('cmd', `qwen2.5-coder-1.5b generate --format json --max-tokens ${maxTokens}`);
        const facts = prompt.match(/\{[\s\S]*\}/)?.[0];
        if (facts) {
          this.push('out', 'facts given to the model:');
          this.code(pretty(facts));
        }
        const reply = await deps.generate(prompt, schema, maxTokens);
        this.push('out', 'model output:');
        this.code(pretty(reply));
        return reply;
      },
    };
  }

  result(result: BuildResult, slug: string): void {
    if (result.fellBack) this.push('warn', `copy check failed ${result.attempts} times (${clip(result.problems.join('; '), 90)}); the site uses the operator's own words`);
    else this.push('ok', `copy check passed: every name and number is in the survey (${result.attempts} attempt${result.attempts > 1 ? 's' : ''})`);
    this.push('cmd', `write site.json`);
    this.code(JSON.stringify({ headline: result.site.headline, introduction: result.site.introduction, services: result.site.services.map((s) => ({ name: s.name, blurb: s.blurb })) }, null, 2));
    this.push('cmd', `render index.html`);
    this.code(result.html.replace(/></g, '>\n<'));
    this.push('ok', `wrote index.html, ${(new Blob([result.html]).size / 1024).toFixed(1)} kB, ready at wren.site/${slug} (${result.ms.total} ms in all)`);
  }
}

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function tracePanel(trace: Trace): HTMLElement {
  const body = h(
    'div',
    { class: 'trace-body' },
    ...trace.lines.slice(0, trace.shown).map((line) => h('div', { class: `trace-line ${line.kind}` }, line.kind === 'cmd' ? h('span', { class: 'prompt' }, '$ ') : null, line.text)),
    trace.done ? null : h('div', { class: 'trace-line cursor', 'aria-hidden': 'true' }, '▍'),
  );
  queueMicrotask(() => (body.scrollTop = body.scrollHeight));
  return h('div', { class: 'trace', role: 'log', 'aria-label': 'Agent trace' }, h('div', { class: 'trace-bar' }, h('span', { class: 'lights', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', {}, 'wren agent: website creator, local models')), body);
}
