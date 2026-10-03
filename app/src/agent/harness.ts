import { z } from 'zod';

// Agent harness (docs/architecture.md sections 3 and 8). The model only proposes tool calls;
// this code decides whether a call runs. Each agent sees a fixed tool list, so nothing in a
// prompt or an inbound message can grant a tool the agent was not given.

export type AgentName = 'coordinator' | 'website_creator' | 'search_social' | 'customer_management';

// none: reads, or local drafts with no outside effect.
// policy: allowed without asking when the tool's own policy check passes.
// operator: always waits for the operator's approval in the app.
export type Approval = 'none' | 'policy' | 'operator';

export type ToolDefinition<Args extends z.ZodType = z.ZodType, Result = unknown> = {
  name: string;
  description: string;
  args: Args;
  approval: Approval;
  // Required when approval is 'policy': returns null to allow, or the reason to ask the operator.
  policy?: (args: z.infer<Args>) => string | null;
  // Returns null when the call can go ahead, or why it cannot. Runs before any approval is
  // requested, so the operator is never asked to approve a call that would fail.
  precondition?: (args: z.infer<Args>) => string | null;
  run: (args: z.infer<Args>) => Promise<Result>;
};

// Keeps each tool's argument type while it is written, then stores it with the others.
export function defineTool<Args extends z.ZodType, Result>(tool: ToolDefinition<Args, Result>): ToolDefinition {
  return tool as unknown as ToolDefinition;
}

export type ProposedCall = { name: string; arguments: unknown };

// llama.rn returns arguments as a JSON string. Text that is not JSON becomes a value the
// argument schema rejects, so the harness logs the call as REJECTED instead of throwing.
export function fromModelToolCall(call: { function: { name: string; arguments: string } }): ProposedCall {
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch {
    parsed = { unparseable_arguments: call.function.arguments };
  }
  return { name: call.function.name, arguments: parsed };
}

export type ActivityEntry = {
  id: string;
  at: string;
  agent: AgentName;
  tool: string;
  args: unknown;
  outcome: 'REJECTED' | 'AWAITING_APPROVAL' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  detail: string | null;
  result: unknown;
};

export type PendingApproval = {
  activityId: string;
  agent: AgentName;
  tool: string;
  args: unknown;
  reason: string;
};

// Storage is injected so the SQLite store (#10) can replace the in-memory one.
export type ActivityStore = {
  append(entry: ActivityEntry): void;
  update(id: string, patch: Partial<ActivityEntry>): void;
};

export type HarnessDeps = {
  log: ActivityStore;
  newId: () => string;
  now: () => string;
};

export type CallOutcome =
  | { status: 'REJECTED'; activityId: string; reason: string }
  | { status: 'AWAITING_APPROVAL'; activityId: string; approval: PendingApproval }
  | { status: 'COMPLETED'; activityId: string; result: unknown }
  | { status: 'FAILED'; activityId: string; error: string };

export class Harness {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly allowed = new Map<AgentName, Set<string>>();
  private readonly pending = new Map<string, { tool: ToolDefinition; args: unknown; agent: AgentName; reason: string }>();

  constructor(private readonly deps: HarnessDeps) {}

  register(tool: ToolDefinition, agents: AgentName[]): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool ${tool.name} is already registered`);
    if (tool.approval === 'policy' && !tool.policy) {
      throw new Error(`Tool ${tool.name} needs a policy check`);
    }
    this.tools.set(tool.name, tool);
    for (const agent of agents) {
      if (!this.allowed.has(agent)) this.allowed.set(agent, new Set());
      this.allowed.get(agent)!.add(tool.name);
    }
  }

  // The tool list an agent's prompt describes; the same list bounds what it may call.
  toolsFor(agent: AgentName): ToolDefinition[] {
    return [...(this.allowed.get(agent) ?? [])].map((name) => this.tools.get(name)!);
  }

  async propose(agent: AgentName, call: ProposedCall): Promise<CallOutcome> {
    const activityId = this.deps.newId();
    const record = (entry: Omit<ActivityEntry, 'id' | 'at' | 'agent'>) =>
      this.deps.log.append({ id: activityId, at: this.deps.now(), agent, ...entry });

    const tool = this.allowed.get(agent)?.has(call.name) ? this.tools.get(call.name) : undefined;
    if (!tool) {
      const reason = `${agent} has no tool named ${call.name}`;
      record({ tool: call.name, args: call.arguments, outcome: 'REJECTED', detail: reason, result: null });
      return { status: 'REJECTED', activityId, reason };
    }

    const parsed = tool.args.safeParse(call.arguments);
    if (!parsed.success) {
      const reason = z.prettifyError(parsed.error);
      record({ tool: tool.name, args: call.arguments, outcome: 'REJECTED', detail: reason, result: null });
      return { status: 'REJECTED', activityId, reason };
    }

    const blocked = tool.precondition?.(parsed.data) ?? this.alreadyWaiting(agent, tool.name, parsed.data);
    if (blocked) {
      record({ tool: tool.name, args: parsed.data, outcome: 'REJECTED', detail: blocked, result: null });
      return { status: 'REJECTED', activityId, reason: blocked };
    }

    const reasonToAsk =
      tool.approval === 'operator'
        ? 'This action needs your approval.'
        : tool.approval === 'policy'
          ? tool.policy!(parsed.data)
          : null;

    if (reasonToAsk !== null) {
      const approval: PendingApproval = { activityId, agent, tool: tool.name, args: parsed.data, reason: reasonToAsk };
      this.pending.set(activityId, { tool, args: parsed.data, agent, reason: reasonToAsk });
      record({ tool: tool.name, args: parsed.data, outcome: 'AWAITING_APPROVAL', detail: reasonToAsk, result: null });
      return { status: 'AWAITING_APPROVAL', activityId, approval };
    }

    record({ tool: tool.name, args: parsed.data, outcome: 'RUNNING', detail: null, result: null });
    return this.execute(activityId, tool, parsed.data);
  }

  // Called from the approval screen only; the model has no tool that reaches this method.
  async approve(activityId: string): Promise<CallOutcome> {
    const entry = this.pending.get(activityId);
    if (!entry) return { status: 'REJECTED', activityId, reason: 'No pending approval with this ID' };
    this.pending.delete(activityId);
    this.deps.log.update(activityId, { outcome: 'RUNNING', detail: 'Approved by the operator' });
    return this.execute(activityId, entry.tool, entry.args);
  }

  decline(activityId: string, reason: string): void {
    if (!this.pending.delete(activityId)) return;
    this.deps.log.update(activityId, { outcome: 'REJECTED', detail: `Declined: ${reason}` });
  }

  // A model that repeats a held call would otherwise put a second approval in front of the operator.
  private alreadyWaiting(agent: AgentName, toolName: string, args: unknown): string | null {
    const key = JSON.stringify(args);
    for (const entry of this.pending.values()) {
      if (entry.agent === agent && entry.tool.name === toolName && JSON.stringify(entry.args) === key) {
        return 'This call is already waiting for the operator\'s approval.';
      }
    }
    return null;
  }

  pendingApprovals(): PendingApproval[] {
    return [...this.pending.entries()].map(([activityId, { tool, args, agent, reason }]) => ({
      activityId,
      agent,
      tool: tool.name,
      args,
      reason,
    }));
  }

  private async execute(activityId: string, tool: ToolDefinition, args: unknown): Promise<CallOutcome> {
    try {
      const result = await tool.run(args);
      this.deps.log.update(activityId, { outcome: 'COMPLETED', result, detail: null });
      return { status: 'COMPLETED', activityId, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.log.update(activityId, { outcome: 'FAILED', detail: message });
      return { status: 'FAILED', activityId, error: message };
    }
  }
}

export function memoryActivityStore(): ActivityStore & { entries: ActivityEntry[] } {
  const entries: ActivityEntry[] = [];
  return {
    entries,
    append: (entry) => entries.push(entry),
    update: (id, patch) => {
      const entry = entries.find((e) => e.id === id);
      if (entry) Object.assign(entry, patch);
    },
  };
}

// Text from visitors, emails and websites enters a prompt only through this wrapper. The prompt
// tells the model that fenced content is data to read, never instructions to follow. Every fence
// marker starts with '<<<', and the loop leaves no '<<<' in the text, so the text cannot close
// the fence or open a new one, however the marker is split up.
export function quoteUntrusted(source: string, text: string): string {
  let cleaned = text;
  while (cleaned.includes('<<<')) cleaned = cleaned.replaceAll('<<<', '<<');
  const label = source.replace(/[^\w.@+:-]/g, '_');
  return `<<<UNTRUSTED source=${label}>>>\n${cleaned}\n<<<END UNTRUSTED>>>`;
}
