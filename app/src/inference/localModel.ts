import { Directory, File, Paths } from 'expo-file-system';
import { initLlama, type LlamaContext } from 'llama.rn';

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
};

export type CompletionMetrics = {
  promptTokens: number;
  promptTokensPerSecond: number;
  generatedTokens: number;
  generatedTokensPerSecond: number;
};

export function findModelFile(): File | null {
  if (!modelsDirectory.exists) return null;
  const gguf = modelsDirectory
    .list()
    .find((entry): entry is File => entry instanceof File && entry.name.endsWith('.gguf'));
  return gguf ?? null;
}

export async function loadModel(file: File): Promise<LoadedModel> {
  const started = Date.now();
  const context = await initLlama({
    model: file.uri,
    n_ctx: 2048,
    // Metal is unavailable in the iOS Simulator; llama.rn falls back to CPU and reports why.
    n_gpu_layers: 99,
  });
  return {
    context,
    fileName: file.name,
    loadMs: Date.now() - started,
    gpu: context.gpu,
    reasonNoGPU: context.reasonNoGPU,
  };
}

export async function complete(
  model: LoadedModel,
  prompt: string,
  onToken: (token: string) => void,
): Promise<{ text: string; metrics: CompletionMetrics }> {
  const result = await model.context.completion(
    {
      messages: [{ role: 'user', content: prompt }],
      n_predict: 128,
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
