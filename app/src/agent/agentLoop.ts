import { z } from 'zod';

import { fromModelToolCall, type AgentName, type CallOutcome, type Harness } from './harness';

// One operator turn (#30): the model answers or proposes tool calls; the harness decides what runs,
// and each outcome goes back to the model until it answers in plain text.

export type ToolCallMessage = { id?: string; type: 'function'; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCallMessage[] }
  | { role: 'tool'; content: string; tool_call_id?: string; name: string };

export type ModelTurn = { content: string; toolCalls: ToolCallMessage[] };

// The OpenAI-style tool list the chat template renders into the prompt.
export type ToolSpec = { type: 'function'; function: { name: string; description: string; parameters: object } };

export type ChatModel = (messages: ChatMessage[], tools: ToolSpec[]) => Promise<ModelTurn>;

// Each tool round costs a full generation on the phone, so a turn stops after a few rounds.
const MAX_ROUNDS = 4;

export function toolSpecs(harness: Harness, agent: AgentName): ToolSpec[] {
  return harness.toolsFor(agent).map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: compactSchema(z.toJSONSchema(tool.args)) },
  }));
}

// Every round re-reads the tool list, so keys the model does not need are dropped.
function compactSchema(schema: object): object {
  const { $schema: _schema, additionalProperties: _extra, ...rest } = schema as Record<string, unknown>;
  return rest;
}

// What the model reads back: the outcome without the activity ID, which means nothing to it.
export function outcomeForModel(outcome: CallOutcome): string {
  switch (outcome.status) {
    case 'COMPLETED':
      return JSON.stringify({ status: 'done', result: outcome.result ?? null });
    case 'AWAITING_APPROVAL':
      return JSON.stringify({ status: 'waiting_for_operator_approval', reason: outcome.approval.reason });
    case 'REJECTED':
      return JSON.stringify({ status: 'rejected', reason: outcome.reason });
    case 'FAILED':
      return JSON.stringify({ status: 'failed', error: outcome.error });
  }
}

// A completed tool can hand the turn its closing line: `reply` from the reply tool, or a
// `follow_up` question from a save that left fields missing.
function resultField(outcomes: CallOutcome[], field: 'reply' | 'follow_up'): string | null {
  for (const outcome of [...outcomes].reverse()) {
    if (outcome.status !== 'COMPLETED') continue;
    const value = (outcome.result as Record<string, unknown> | null)?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function lastFollowUp(outcomes: CallOutcome[]): string | null {
  return resultField(outcomes.slice(-1), 'follow_up');
}

// The operator's closing line for the turn, and whether the app (not the model) wrote it. App
// lines are already in the operator's language; model lines may need translating.
export type TurnResult = { added: ChatMessage[]; outcomes: CallOutcome[]; reply: { text: string; fromApp: boolean } | null };

// Gemma 4 E2B sometimes writes a tool call as text instead of a call, for example
// `reply_to_operator{text:<|"|>Which item first?<|"|>}<tool_call|>`, which llama.cpp passes through as
// content. The call is recovered; any other leftover chat markup is cut off, so it never reaches
// the translator or the operator.
const BROKEN_CALL = /([a-z_]+)\{(\w+):<\|"\|>([\s\S]*?)<\|"\|>\}/;
const MARKUP = /<\|"\|>|<tool_call\|>|<\/?\|?\/?turn\|?>|<\|tool/;

// It also writes a whole reply that is only a call in function syntax: `approve_profile_draft()` or
// `save_profile_draft({"price": "2000 KES"})`.
const CALL_AS_TEXT = /^\s*`?([a-z][a-z0-9_]*)\((\{[\s\S]*\})?\)`?\s*$/;

export function repairTurn(turn: ModelTurn): ModelTurn {
  if (turn.toolCalls.length) return turn;
  const broken = BROKEN_CALL.exec(turn.content);
  if (broken) {
    const [, name, field, value] = broken;
    return { content: '', toolCalls: [{ type: 'function', function: { name, arguments: JSON.stringify({ [field]: value }) } }] };
  }
  const asText = CALL_AS_TEXT.exec(turn.content);
  if (asText) return { content: '', toolCalls: [{ type: 'function', function: { name: asText[1], arguments: asText[2] ?? '{}' } }] };
  return MARKUP.test(turn.content) ? { content: turn.content.split(MARKUP)[0].trim(), toolCalls: [] } : turn;
}

export async function runTurn(params: {
  model: ChatModel;
  harness: Harness;
  agent: AgentName;
  history: ChatMessage[];
  // The app's own lines, in the operator's language.
  text: { awaitingApproval: string; stopped: string };
}): Promise<TurnResult> {
  const { model, harness, agent } = params;
  const tools = toolSpecs(harness, agent);
  const added: ChatMessage[] = [];
  const outcomes: CallOutcome[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const turn = repairTurn(await model([...params.history, ...added], tools));
    added.push({ role: 'assistant', content: turn.content, ...(turn.toolCalls.length ? { tool_calls: turn.toolCalls } : {}) });
    if (turn.toolCalls.length === 0) {
      // A tool can name the question the operator should be asked next. When the model's reply asks
      // nothing, the app asks it, so the conversation never stalls on a small model's reply.
      const followUp = lastFollowUp(outcomes);
      if (followUp && !turn.content.includes('?')) {
        added.push({ role: 'assistant', content: followUp });
        return { added, outcomes, reply: { text: followUp, fromApp: true } };
      }
      return { added, outcomes, reply: turn.content ? { text: turn.content, fromApp: false } : null };
    }

    const roundOutcomes: CallOutcome[] = [];
    for (const call of turn.toolCalls) {
      const outcome = await harness.propose(agent, fromModelToolCall(call));
      roundOutcomes.push(outcome);
      added.push({ role: 'tool', name: call.function.name, tool_call_id: call.id, content: outcomeForModel(outcome) });
    }
    outcomes.push(...roundOutcomes);
    // The turn ends after an action instead of asking the model to describe it: a small model asked
    // to describe a held call has claimed it was done, and Gemma 4 E2B's text after a tool call
    // loops. What the operator reads next comes from the app or from the reply tool.
    const end = (text: string, fromApp: boolean): TurnResult => {
      added.push({ role: 'assistant', content: text });
      return { added, outcomes, reply: { text, fromApp } };
    };
    // A repeat of a call that is already waiting ends the turn too, instead of looping until the
    // round limit.
    if (roundOutcomes.some((o) => o.status === 'AWAITING_APPROVAL' || (o.status === 'REJECTED' && o.waiting))) {
      return end(params.text.awaitingApproval, true);
    }
    // A failed precondition carries an operator-facing reason, such as which profile fields are missing.
    const unmet = roundOutcomes.find((outcome) => outcome.status === 'REJECTED' && outcome.precondition);
    if (unmet?.status === 'REJECTED') return end(unmet.reason, true);
    // The reply tool's text comes from the model; summaries and follow-up questions come from the app.
    const said = resultField(roundOutcomes, 'reply');
    if (said) return end(said, !roundOutcomes.some((o) => o.status === 'COMPLETED' && (o.result as { said_by_model?: boolean } | null)?.said_by_model));
    const followUp = resultField(roundOutcomes, 'follow_up');
    if (followUp) return end(followUp, true);
  }
  added.push({ role: 'assistant', content: params.text.stopped });
  return { added, outcomes, reply: { text: params.text.stopped, fromApp: true } };
}
