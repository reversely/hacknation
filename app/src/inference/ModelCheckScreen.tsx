import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  complete,
  findModelFile,
  loadModel,
  modelsDirectory,
  type CompletionMetrics,
  type LoadedModel,
} from './localModel';
import type { LocalStore } from '../store/localStore';
import { LAST_SYNC_KEY, type SyncResult } from '../store/sync';

// Smoke test for #6: load a side-loaded GGUF and stream one completion on the device.
type ModelState =
  | { status: 'missing' }
  | { status: 'loading'; fileName: string }
  | { status: 'ready'; model: LoadedModel }
  | { status: 'error'; message: string };

export function ModelCheckScreen({ store, syncResult }: { store: LocalStore; syncResult: SyncResult | null }) {
  const [modelState, setModelState] = useState<ModelState>({ status: 'missing' });
  const [prompt, setPrompt] = useState('Write one sentence welcoming a visitor to a coffee farm.');
  const [output, setOutput] = useState('');
  const [metrics, setMetrics] = useState<CompletionMetrics | null>(null);
  const [running, setRunning] = useState(false);
  const loaded = useRef<LoadedModel | null>(null);

  async function load() {
    const file = findModelFile();
    if (!file) {
      setModelState({ status: 'missing' });
      return;
    }
    setModelState({ status: 'loading', fileName: file.name });
    try {
      loaded.current = await loadModel(file);
      setModelState({ status: 'ready', model: loaded.current });
    } catch (error) {
      setModelState({ status: 'error', message: String(error) });
    }
  }

  useEffect(() => {
    load();
    return () => {
      loaded.current?.context.release();
    };
  }, []);

  // Lets a scripted check run the prompt without a tap: start Metro with EXPO_PUBLIC_AUTORUN=1.
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_AUTORUN === '1' && modelState.status === 'ready') run();
  }, [modelState.status]);

  async function run() {
    if (modelState.status !== 'ready') return;
    setRunning(true);
    setOutput('');
    setMetrics(null);
    try {
      const result = await complete(modelState.model, prompt, (token) =>
        setOutput((text) => text + token),
      );
      setMetrics(result.metrics);
    } catch (error) {
      setOutput(`Completion failed: ${String(error)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Model check</Text>
        <ModelStatus state={modelState} onRetry={load} />
        <SyncStatus store={store} result={syncResult} />

        <TextInput
          style={styles.input}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          accessibilityLabel="Prompt"
        />
        <Pressable
          style={[styles.button, (running || modelState.status !== 'ready') && styles.buttonDisabled]}
          onPress={run}
          disabled={running || modelState.status !== 'ready'}
        >
          <Text style={styles.buttonText}>{running ? 'Generating…' : 'Run'}</Text>
        </Pressable>

        {output !== '' && <Text style={styles.output}>{output}</Text>}
        {metrics && (
          <View>
            <Text style={styles.detail}>
              Prompt {metrics.promptTokens} tokens at {metrics.promptTokensPerSecond.toFixed(1)} tokens/s
            </Text>
            <Text style={styles.detail}>
              Output {metrics.generatedTokens} tokens at {metrics.generatedTokensPerSecond.toFixed(1)} tokens/s
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SyncStatus({ store, result }: { store: LocalStore; result: SyncResult | null }) {
  const lastSync = store.getMeta(LAST_SYNC_KEY);
  const waiting = store.outbox().filter((entry) => entry.status === 'QUEUED').length;
  return (
    <View>
      <Text style={styles.detail}>{lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}` : 'Not synced yet'}</Text>
      <Text style={styles.detail}>{waiting} waiting to send</Text>
      {result?.error ? <Text style={styles.error}>{result.error}</Text> : null}
    </View>
  );
}

function ModelStatus({ state, onRetry }: { state: ModelState; onRetry: () => void }) {
  switch (state.status) {
    case 'missing':
      return (
        <View>
          <Text style={styles.detail}>
            Please copy a .gguf file into {modelsDirectory.uri}
          </Text>
          <Pressable style={styles.button} onPress={onRetry}>
            <Text style={styles.buttonText}>Check again</Text>
          </Pressable>
        </View>
      );
    case 'loading':
      return <Text style={styles.detail}>Loading {state.fileName}…</Text>;
    case 'error':
      return <Text style={styles.error}>Model failed to load: {state.message}</Text>;
    case 'ready': {
      const { fileName, loadMs, gpu, reasonNoGPU } = state.model;
      return (
        <Text style={styles.detail}>
          {fileName} loaded in {(loadMs / 1000).toFixed(1)} s on the {gpu ? 'GPU' : `CPU (${reasonNoGPU || 'no GPU reported'})`}
        </Text>
      );
    }
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '600' },
  detail: { fontSize: 14, color: '#444' },
  error: { fontSize: 14, color: '#b00020' },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#1f4e79',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  output: { fontSize: 16, lineHeight: 22 },
});
