/// <reference types="bun" />
import { beforeEach, expect, test } from 'bun:test';
import { z } from 'zod';

import { AWAITING_APPROVAL_REPLY, runTurn, type ChatMessage, type ChatModel, type ModelTurn } from './agentLoop';
import { defineTool, Harness, memoryActivityStore } from './harness';

let harness: Harness;
let saved: string[];
let ids = 0;

beforeEach(() => {
  saved = [];
  harness = new Harness({ log: memoryActivityStore(), newId: () => `a${++ids}`, now: () => '2026-10-03T12:00:00Z' });
  harness.register(
    defineTool({
      name: 'save_profile_draft',
      description: 'Save details to the draft.',
      args: z.object({ description: z.string() }),
      approval: 'none',
      run: async ({ description }) => (saved.push(description), { saved: ['description'] }),
    }),
    ['coordinator'],
  );
  harness.register(
    defineTool({ name: 'approve_profile_draft', description: 'Approve.', args: z.object({}), approval: 'operator', run: async () => ({}) }),
    ['coordinator'],
  );
});

// Plays back fixed turns and records what the model was shown each time.
function scripted(turns: ModelTurn[]): ChatModel & { seen: ChatMessage[][] } {
  const seen: ChatMessage[][] = [];
  const model: ChatModel = async (messages) => (seen.push(messages), turns.shift()!);
  return Object.assign(model, { seen });
}

const call = (name: string, args: object) => ({ type: 'function' as const, id: name, function: { name, arguments: JSON.stringify(args) } });
const user: ChatMessage[] = [{ role: 'user', content: 'We offer a two-hour coffee walk.' }];

test('a tool result goes back to the model, which then answers', async () => {
  const model = scripted([
    { content: '', toolCalls: [call('save_profile_draft', { description: 'Two-hour coffee walk' })] },
    { content: 'Saved your tour description.', toolCalls: [] },
  ]);
  const { added } = await runTurn({ model, harness, agent: 'coordinator', history: user });
  expect(saved).toEqual(['Two-hour coffee walk']);
  expect(model.seen[1].at(-1)).toMatchObject({ role: 'tool', name: 'save_profile_draft' });
  expect(JSON.parse((model.seen[1].at(-1) as { content: string }).content)).toMatchObject({ status: 'done' });
  expect(added.at(-1)).toEqual({ role: 'assistant', content: 'Saved your tour description.' });
});

test('an operator-approval tool is held, and the app, not the model, says so', async () => {
  const model = scripted([
    { content: '', toolCalls: [call('approve_profile_draft', {})] },
    { content: 'Your profile has been approved.', toolCalls: [] },
  ]);
  const { added, outcomes } = await runTurn({ model, harness, agent: 'coordinator', history: user });
  expect(outcomes[0].status).toBe('AWAITING_APPROVAL');
  expect(harness.pendingApprovals()).toHaveLength(1);
  expect(model.seen).toHaveLength(1);
  expect(added.at(-1)).toEqual({ role: 'assistant', content: AWAITING_APPROVAL_REPLY });
});

test('a tool the agent does not have is rejected and reported to the model', async () => {
  const model = scripted([
    { content: '', toolCalls: [call('send_whatsapp', { to: '+254700000000' })] },
    { content: 'I cannot send messages.', toolCalls: [] },
  ]);
  const { outcomes } = await runTurn({ model, harness, agent: 'coordinator', history: user });
  expect(outcomes[0]).toMatchObject({ status: 'REJECTED', reason: 'coordinator has no tool named send_whatsapp' });
});

test('a model that keeps calling tools is stopped', async () => {
  const loop = { content: '', toolCalls: [call('save_profile_draft', { description: 'again' })] };
  const model = scripted([loop, loop, loop, loop, loop]);
  const { added } = await runTurn({ model, harness, agent: 'coordinator', history: user });
  expect(model.seen).toHaveLength(4);
  expect(added.at(-1)?.role).toBe('assistant');
});

test('a placeholder the model invents is rejected, so the field stays missing', async () => {
  const { ProfileDraft } = await import('./coordinatorTools');
  expect(ProfileDraft.safeParse({ availability: 'TBD' }).success).toBe(false);
  expect(ProfileDraft.safeParse({ availability: 'Saturdays at 9' }).success).toBe(true);
});
