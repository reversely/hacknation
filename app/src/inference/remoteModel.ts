import type { ChatModel, ModelTurn } from '../agent/agentLoop';

// Development only: runs the agent's model on a llama.cpp server (llama-server --jinja) instead
// of the phone, for machines that cannot hold the model in memory. Set EXPO_PUBLIC_MODEL_URL to
// the server address. The server is built from the llama.cpp commit llama.rn bundles, so prompt
// formatting and tool-call parsing match the phone.
export const REMOTE_MODEL_URL = process.env.EXPO_PUBLIC_MODEL_URL ?? null;

type ChatCompletion = {
  choices: { message: { content: string | null; tool_calls?: ModelTurn['toolCalls'] } }[];
  timings?: { prompt_n: number; prompt_per_second: number; predicted_n: number; predicted_per_second: number };
};

// Development only: the website model on a llama.cpp server (EXPO_PUBLIC_WEBSITE_MODEL_URL).
export const REMOTE_WEBSITE_MODEL_URL = process.env.EXPO_PUBLIC_WEBSITE_MODEL_URL ?? null;

export function remoteJsonCompletion(baseUrl: string) {
  return async (prompt: string, schema: object, maxTokens: number): Promise<string> => {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
        response_format: { type: 'json_schema', json_schema: { schema } },
      }),
    });
    if (!response.ok) throw new Error(`The model server answered with error ${response.status}`);
    return ((await response.json()) as { choices: { message: { content: string } }[] }).choices[0].message.content;
  };
}

export function remoteChatModel(baseUrl: string): ChatModel {
  return async (messages, tools) => {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        tools,
        tool_choice: 'required',
        temperature: 0.3,
        max_tokens: 384,
        // Same settings as the phone (localModel.chat): no thinking, reasoning split from the reply.
        chat_template_kwargs: { enable_thinking: false },
        reasoning_format: 'auto',
      }),
    });
    if (!response.ok) throw new Error(`The model server answered with error ${response.status}`);
    const body = (await response.json()) as ChatCompletion;
    const message = body.choices[0].message;
    if (__DEV__ && body.timings) {
      const t = body.timings;
      console.log(`[agent] remote: prompt ${t.prompt_n} at ${t.prompt_per_second.toFixed(0)}/s, output ${t.predicted_n} at ${t.predicted_per_second.toFixed(0)}/s`);
    }
    return { content: (message.content ?? '').trim(), toolCalls: message.tool_calls ?? [] };
  };
}
