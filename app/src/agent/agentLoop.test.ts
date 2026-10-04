/// <reference types="bun" />
import { beforeEach, expect, test } from 'bun:test';
import { z } from 'zod';

import { runTurn, type ChatMessage, type ChatModel, type ModelTurn } from './agentLoop';
import { defineTool, Harness, memoryActivityStore } from './harness';
import { TEXT } from './language';

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
  const { added } = await runTurn({ model, harness, agent: 'coordinator', history: user, text: TEXT.en });
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
  const { added, outcomes } = await runTurn({ model, harness, agent: 'coordinator', history: user, text: TEXT.en });
  expect(outcomes[0].status).toBe('AWAITING_APPROVAL');
  expect(harness.pendingApprovals()).toHaveLength(1);
  expect(model.seen).toHaveLength(1);
  expect(added.at(-1)).toEqual({ role: 'assistant', content: TEXT.en.awaitingApproval });
});

test('a tool the agent does not have is rejected and reported to the model', async () => {
  const model = scripted([
    { content: '', toolCalls: [call('send_whatsapp', { to: '+254700000000' })] },
    { content: 'I cannot send messages.', toolCalls: [] },
  ]);
  const { outcomes } = await runTurn({ model, harness, agent: 'coordinator', history: user, text: TEXT.en });
  expect(outcomes[0]).toMatchObject({ status: 'REJECTED', reason: 'coordinator has no tool named send_whatsapp' });
});

test('a model that keeps calling tools is stopped', async () => {
  const loop = { content: '', toolCalls: [call('save_profile_draft', { description: 'again' })] };
  const model = scripted([loop, loop, loop, loop, loop]);
  const { added } = await runTurn({ model, harness, agent: 'coordinator', history: user, text: TEXT.en });
  expect(model.seen).toHaveLength(4);
  expect(added.at(-1)?.role).toBe('assistant');
});

test('a placeholder or a copied field description is dropped, and the stated fields are kept', async () => {
  const { keepStated } = await import('./coordinatorTools');
  const { kept, dropped } = keepStated({
    price: '1500 KES',
    availability: 'Days and times tours run',
    policies: 'not specified',
    meeting_instructions: 'TBD',
  });
  expect(kept).toEqual({ price: '1500 KES' });
  expect(dropped).toEqual(['availability', 'policies', 'meeting_instructions']);
  // Kiswahili run: the meeting place copied into fields the operator never mentioned.
  const copied = keepStated({
    meeting_instructions: 'Tunakutana kwenye lango la soko la Ondera',
    availability: 'Tunakutana kwenye lango la soko la Ondera',
  });
  expect(copied.dropped).toEqual(['availability']);
});

test('a repeated call that is already waiting for approval is not shown twice', async () => {
  const model = scripted([{ content: '', toolCalls: [call('approve_profile_draft', {}), call('approve_profile_draft', {})] }]);
  const { outcomes } = await runTurn({ model, harness, agent: 'coordinator', history: user, text: TEXT.en });
  expect(outcomes.map((o) => o.status)).toEqual(['AWAITING_APPROVAL', 'REJECTED']);
  expect(harness.pendingApprovals()).toHaveLength(1);
});

test('a failed precondition rejects the call before the operator is asked', async () => {
  harness.register(
    defineTool({
      name: 'publish_profile',
      description: 'Publish.',
      args: z.object({}),
      approval: 'operator',
      precondition: () => 'The draft is missing: availability.',
      run: async () => ({}),
    }),
    ['coordinator'],
  );
  const model = scripted([
    { content: '', toolCalls: [call('publish_profile', {})] },
    { content: 'What days do tours run?', toolCalls: [] },
  ]);
  const { outcomes } = await runTurn({ model, harness, agent: 'coordinator', history: user, text: TEXT.en });
  expect(outcomes[0]).toMatchObject({ status: 'REJECTED', reason: 'The draft is missing: availability.' });
  expect(harness.pendingApprovals()).toHaveLength(0);
});

test('when the model asks nothing after a save, the app asks the tool\'s follow-up question', async () => {
  harness.register(
    defineTool({
      name: 'save_detail',
      description: 'Save.',
      args: z.object({}),
      approval: 'none',
      run: async () => ({ saved: [], follow_up: 'On which days do tours run?' }),
    }),
    ['coordinator'],
  );
  const model = scripted([
    { content: '', toolCalls: [call('save_detail', {})] },
    { content: "Saved. Let's approve it.", toolCalls: [] },
  ]);
  const { added } = await runTurn({ model, harness, agent: 'coordinator', history: user, text: TEXT.en });
  expect(added.at(-1)).toEqual({ role: 'assistant', content: 'On which days do tours run?' });
});

test('a reply tool call ends the turn with its text, without another model round', async () => {
  harness.register(
    defineTool({ name: 'reply_to_operator', description: 'Say.', args: z.object({ text: z.string() }), approval: 'none', run: async ({ text }) => ({ reply: text }) }),
    ['coordinator'],
  );
  const model = scripted([{ content: '', toolCalls: [call('reply_to_operator', { text: 'Ziara inachukua muda gani?' })] }]);
  const { added } = await runTurn({ model, harness, agent: 'coordinator', history: user, text: TEXT.sw });
  expect(model.seen).toHaveLength(1);
  expect(added.at(-1)).toEqual({ role: 'assistant', content: 'Ziara inachukua muda gani?' });
});

test('a save that leaves fields missing ends the turn with the app\'s question', async () => {
  harness.register(
    defineTool({ name: 'save_detail', description: 'Save.', args: z.object({}), approval: 'none', run: async () => ({ saved: ['price'], follow_up: 'Ziara zinafanyika siku gani na saa ngapi?' }) }),
    ['coordinator'],
  );
  const model = scripted([{ content: '', toolCalls: [call('save_detail', {})] }]);
  const { added } = await runTurn({ model, harness, agent: 'coordinator', history: user, text: TEXT.sw });
  expect(model.seen).toHaveLength(1);
  expect(added.at(-1)).toEqual({ role: 'assistant', content: 'Ziara zinafanyika siku gani na saa ngapi?' });
});

test('a tool call written as text is recovered as a call', async () => {
  const { repairTurn } = await import('./agentLoop');
  const broken = { content: 'reply_to_operator{text:<|"|>Which item first?<|"|>}<tool_call|>\nWhich item first?', toolCalls: [] };
  expect(repairTurn(broken).toolCalls[0].function).toEqual({ name: 'reply_to_operator', arguments: '{"text":"Which item first?"}' });
  expect(repairTurn({ content: 'Sawa. 🌻</|turn>\n<|turn>user', toolCalls: [] }).content).toBe('Sawa. 🌻');
});

test('a failed precondition ends the turn with its reason, written by the app', async () => {
  harness.register(
    defineTool({ name: 'publish', description: 'Publish.', args: z.object({}), approval: 'operator', precondition: () => 'Bado inahitajika: bei.', run: async () => ({}) }),
    ['coordinator'],
  );
  const model = scripted([{ content: '', toolCalls: [call('publish', {})] }]);
  const { reply } = await runTurn({ model, harness, agent: 'coordinator', history: user, text: TEXT.sw });
  expect(reply).toEqual({ text: 'Bado inahitajika: bei.', fromApp: true });
  expect(model.seen).toHaveLength(1);
});

test('"what have you saved" is answered by the app from the stored draft', async () => {
  const { describeDraft } = await import('./coordinatorTools');
  expect(describeDraft({ price: '2000 KES', capacity: 12 }, ['availability'], 'sw')).toBe(
    'Nimehifadhi: Bei: 2000 KES; Idadi ya wageni: 12. Ziara zinafanyika siku gani na saa ngapi?',
  );
  expect(describeDraft({}, ['description'], 'sw')).toBe('Bado sijahifadhi chochote kuhusu ziara yako. Ungeielezaje ziara yako kwa mgeni?');
});
