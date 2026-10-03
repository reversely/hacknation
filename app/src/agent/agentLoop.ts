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

export const AWAITING_APPROVAL_REPLY = 'This needs your approval. Please approve or decline it below.';

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

export type TurnResult = { added: ChatMessage[]; outcomes: CallOutcome[] };

export async function runTurn(params: {
  model: ChatModel;
  harness: Harness;
  agent: AgentName;
  history: ChatMessage[];
}): Promise<TurnResult> {
  const { model, harness, agent } = params;
  const tools = toolSpecs(harness, agent);
  const added: ChatMessage[] = [];
  const outcomes: CallOutcome[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const turn = await model([...params.history, ...added], tools);
    added.push({ role: 'assistant', content: turn.content, ...(turn.toolCalls.length ? { tool_calls: turn.toolCalls } : {}) });
    if (turn.toolCalls.length === 0) return { added, outcomes };

    for (const call of turn.toolCalls) {
      const outcome = await harness.propose(agent, fromModelToolCall(call));
      outcomes.push(outcome);
      added.push({ role: 'tool', name: call.function.name, tool_call_id: call.id, content: outcomeForModel(outcome) });
    }
    // A small model asked to describe a held call has claimed it was done. The app says what is
    // waiting instead, which also saves a model round.
    if (outcomes.some((outcome) => outcome.status === 'AWAITING_APPROVAL')) {
      added.push({ role: 'assistant', content: AWAITING_APPROVAL_REPLY });
      return { added, outcomes };
    }
  }
  added.push({ role: 'assistant', content: 'I stopped after several steps. Please tell me how to continue.' });
  return { added, outcomes };
}
