import { Directory, File, Paths } from 'expo-file-system';
import { initLlama, type LlamaContext, type RNLlamaOAICompatibleMessage } from 'llama.rn';

import type { ChatMessage, ModelTurn, ToolSpec } from '../agent/agentLoop';

// GGUF files are side-loaded into this folder (docs/setup.md, "Loading a model").
// They are never bundled with the app, so the app binary stays small.
export const modelsDirectory = new Directory(Paths.document, 'models');

// Chat templates differ per model family; these cover Qwen, Llama and Gemma.
const STOP_WORDS = ['<|im_end|>', '<|endoftext|>', '<|eot_id|>', '<end_of_turn>', '</s>'];

export type LoadedModel = {
  context: LlamaContext;
  fileName: string;
  loadMs: number;
  gpu: boolean;
  reasonNoGPU: string;
  contextTokens: number;
};

export type CompletionMetrics = {
  promptTokens: number;
  promptTokensPerSecond: number;
  generatedTokens: number;
  generatedTokensPerSecond: number;
};

// The chosen general model (docs/architecture.md section 2); any other GGUF is a fallback.
export const GENERAL_MODEL_FILE = 'Qwen3-1.7B-Q4_K_M.gguf';

export function findModelFile(): File | null {
  if (!modelsDirectory.exists) return null;
  const ggufs = modelsDirectory
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.gguf'));
  return ggufs.find((file) => file.name === GENERAL_MODEL_FILE) ?? ggufs[0] ?? null;
}

export async function loadModel(file: File, options: { contextTokens?: number } = {}): Promise<LoadedModel> {
  const started = Date.now();
  const contextTokens = options.contextTokens ?? 2048;
  const context = await initLlama({
    model: file.uri,
    n_ctx: contextTokens,
    // Offload every layer when a GPU is available; llama.rn falls back to the CPU and reports why.
    // EXPO_PUBLIC_CPU_ONLY=1 keeps the model on the CPU: the Simulator's emulated GPU runs a 1.7B
    // model at well under one token per second.
    n_gpu_layers: process.env.EXPO_PUBLIC_CPU_ONLY === '1' ? 0 : 99,
  });
  return {
    context,
    fileName: file.name,
    loadMs: Date.now() - started,
    gpu: context.gpu,
    reasonNoGPU: context.reasonNoGPU,
    contextTokens,
  };
}

export async function complete(
  model: LoadedModel,
  prompt: string,
  onToken: (token: string) => void,
  options: { maxTokens?: number } = {},
): Promise<{ text: string; metrics: CompletionMetrics }> {
  const result = await model.context.completion(
    {
      messages: [{ role: 'user', content: prompt }],
      n_predict: options.maxTokens ?? 128,
      stop: STOP_WORDS,
    },
    (data) => onToken(data.token),
  );
  const t = result.timings;
  return {
    text: result.text,
    metrics: {
      promptTokens: t.prompt_n,
      promptTokensPerSecond: t.prompt_per_second,
      generatedTokens: t.predicted_n,
      generatedTokensPerSecond: t.predicted_per_second,
    },
  };
}

// One chat step with tools. The model's own chat template (jinja) formats the tool list and
// llama.rn parses tool calls out of the reply. Qwen3's thinking mode is off: it would spend
// hundreds of tokens before each answer at phone speed.
export async function chat(
  model: LoadedModel,
  messages: ChatMessage[],
  tools: ToolSpec[],
  onText: (textSoFar: string) => void,
): Promise<ModelTurn & { metrics: CompletionMetrics }> {
  let tokens = 0;
  if (__DEV__) console.log(`[agent] round start: ${messages.length} messages, ${tools.length} tools`);
  const result = await model.context.completion(
    {
      messages: messages as RNLlamaOAICompatibleMessage[],
      jinja: true,
      tools,
      tool_choice: 'auto',
      enable_thinking: false,
      // Moves the empty <think></think> block Qwen3 still writes out of the reply text.
      reasoning_format: 'auto',
      n_predict: 384,
      temperature: 0.3,
      stop: STOP_WORDS,
    },
    // Each partial result carries the whole reply parsed so far, not just the new token.
    (data) => {
      if (__DEV__ && ++tokens % 32 === 0) console.log(`[agent] ${tokens} tokens: ${JSON.stringify(data.accumulated_text ?? data.token).slice(-200)}`);
      if (data.content !== undefined) onText(withoutThinking(data.content));
    },
  );
  const t = result.timings;
  if (__DEV__) {
    console.log(
      `[agent] prompt ${t.prompt_n} tokens at ${t.prompt_per_second.toFixed(1)}/s, output ${t.predicted_n} at ${t.predicted_per_second.toFixed(1)}/s`,
      JSON.stringify({ text: result.text, tool_calls: result.tool_calls }),
    );
  }
  return {
    content: withoutThinking(result.content ?? result.text),
    toolCalls: (result.tool_calls ?? []).map((call) => ({
      id: call.id,
      type: 'function' as const,
      function: { name: call.function.name, arguments: call.function.arguments },
    })),
    metrics: {
      promptTokens: t.prompt_n,
      promptTokensPerSecond: t.prompt_per_second,
      generatedTokens: t.predicted_n,
      generatedTokensPerSecond: t.predicted_per_second,
    },
  };
}

function withoutThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
}
