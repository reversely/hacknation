import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { chat, findModelFile, loadModel, type LoadedModel } from '../inference/localModel';
import { REMOTE_MODEL_URL, REMOTE_WEBSITE_MODEL_URL, remoteChatModel, remoteJsonCompletion } from '../inference/remoteModel';
import { remoteTranslator, TRANSLATOR_URL } from '../inference/translator';
import type { LocalStore } from '../store/localStore';
import { newId } from '../store/ids';
import { runTurn, type ChatMessage, type ModelTurn, type ToolSpec } from './agentLoop';
import { readDraft, registerCoordinatorTools } from './coordinatorTools';
import { editPublication, preparePublication, type Publication, type PublicationDeps, type PublishResult } from './publication';
import type { GoogleApi } from '../store/google';
import { syncOnce } from '../store/outbox';
import { Harness, memoryActivityStore, type PendingApproval } from './harness';
import { LANGUAGE_NAMES, readLanguage, saveLanguage, TEXT, type Language } from './language';
import { coordinatorPrompt } from './prompts';

// The operator's conversation with the coordinator agent (#8). Tool calls run through the harness;
// the ones that need approval wait here as cards until the operator answers.

// Lets a scripted check run without a tap: start Metro with EXPO_PUBLIC_AUTORUN=agent.
const SCRIPTED_MESSAGE: Record<Language, string> = {
  sw: 'Tunaendesha matembezi ya shamba la kahawa ya saa mbili kwa KES 1500 kwa kila mtu, wageni wasiozidi 8. Tunakutana kwenye lango la soko la Ondera.',
  en: 'We run a two-hour coffee farm walk for 1500 KES per person, at most 8 visitors. We meet at the Ondera market gate. Please save that.',
};

type Line =
  | { kind: 'operator' | 'agent'; text: string; website?: PublishResult; canPublish?: boolean }
  | { kind: 'tool'; text: string }
  | { kind: 'approval'; approval: PendingApproval; answer: 'approved' | 'declined' | null };

// The phone's own model, or in development a llama.cpp server (EXPO_PUBLIC_MODEL_URL).
type AgentModel = {
  label: string;
  chat: (messages: ChatMessage[], tools: ToolSpec[], onText: (textSoFar: string) => void) => Promise<ModelTurn>;
};

const SHARED_TRANSLATOR = TRANSLATOR_URL ? remoteTranslator(TRANSLATOR_URL) : null;
// The website copy model, on a server in development (EXPO_PUBLIC_WEBSITE_MODEL_URL).
const WEBSITE_COPY = REMOTE_WEBSITE_MODEL_URL ? remoteJsonCompletion(REMOTE_WEBSITE_MODEL_URL) : null;
const PUBLICATION: PublicationDeps = { translate: SHARED_TRANSLATOR, generateCopy: WEBSITE_COPY, newId, now: () => new Date().toISOString() };

// Development only: EXPO_PUBLIC_AUTORUN=chat-to-website sends these messages, then approves the
// profile and opens the website, so the whole workflow can be recorded without a tap.
const SCRIPTED_CONVERSATION = [
  'Tunaendesha matembezi ya shamba la kahawa ya saa mbili kwa KES 1500 kwa kila mtu, wageni wasiozidi 8. Tunakutana kwenye lango la soko la Ondera.',
  'Ziara zinafanyika Jumamosi na Jumapili saa tatu asubuhi.',
];
const SCRIPTED_APPROVAL = __DEV__ && process.env.EXPO_PUBLIC_AUTORUN === 'chat-to-website';

type ModelState = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; model: AgentModel } | { status: 'error'; message: string };

export function AgentScreen({ store, google, onOpenWebsite }: { store: LocalStore; google?: GoogleApi; onOpenWebsite?: () => void }) {
  const [language, setLanguage] = useState<Language>(() => readLanguage(store));
  const languageRef = useRef(language);
  languageRef.current = language;
  const harness = useRef<Harness | null>(null);
  if (!harness.current) {
    harness.current = new Harness({ log: memoryActivityStore(), newId, now: () => new Date().toISOString() });
    const now = () => new Date().toISOString();
    // Publishing syncs at once, so an approved page reaches the Apps Script site straight away.
    const sync = google ? () => syncOnce(store, google, now) : undefined;
    registerCoordinatorTools(harness.current, store, now, () => languageRef.current, SHARED_TRANSLATOR, WEBSITE_COPY, sync);
  }
  // With a translator, the agent works in English and only the operator reads Kiswahili
  // (docs/language.md). Without one, the agent is told to reply in the operator's language.
  const translate = SHARED_TRANSLATOR;
  const agentLanguage = (operator: Language): Language => (translate ? 'en' : operator);
  const history = useRef<ChatMessage[]>([{ role: 'system', content: coordinatorPrompt(agentLanguage(language)) }]);
  const text = TEXT[language];

  function chooseLanguage(next: Language) {
    saveLanguage(store, next);
    setLanguage(next);
    history.current[0] = { role: 'system', content: coordinatorPrompt(agentLanguage(next)) };
  }
  const [modelState, setModelState] = useState<ModelState>({ status: 'loading' });
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (REMOTE_MODEL_URL) {
      const remote = remoteChatModel(REMOTE_MODEL_URL);
      setModelState({ status: 'ready', model: { label: `Model server ${REMOTE_MODEL_URL}`, chat: (messages, tools) => remote(messages, tools) } });
      return;
    }
    let loaded: LoadedModel | null = null;
    const file = findModelFile();
    if (!file) {
      setModelState({ status: 'missing' });
      return;
    }
    loadModel(file)
      .then((model) => {
        loaded = model;
        setModelState({
          status: 'ready',
          model: { label: `${model.fileName} ready on the ${model.gpu ? 'GPU' : 'CPU'}`, chat: (messages, tools, onText) => chat(model, messages, tools, onText) },
        });
      })
      .catch((error) => setModelState({ status: 'error', message: String(error) }));
    return () => {
      loaded?.context.release();
    };
  }, []);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_AUTORUN === 'agent' && modelState.status === 'ready') send(SCRIPTED_MESSAGE[languageRef.current]);
    if (SCRIPTED_APPROVAL && modelState.status === 'ready') {
      (async () => {
        for (const message of SCRIPTED_CONVERSATION) await send(message);
      })();
    }
  }, [modelState.status]);

  async function send(text: string) {
    if (modelState.status !== 'ready' || !text.trim() || busy) return;
    const model = modelState.model;
    setBusy(true);
    setDraft('');
    setLines((current) => [...current, { kind: 'operator', text }]);
    const operatorLanguage = languageRef.current;
    const translating = translate !== null && operatorLanguage === 'sw';
    try {
      const forAgent = translating ? await translate(text, 'sw', 'en') : text;
      if (translating) setLines((current) => [...current, { kind: 'tool', text: `English: ${forAgent}` }]);
      history.current.push({ role: 'user', content: forAgent });
      const { added, outcomes, reply } = await runTurn({
        model: async (messages, tools) => {
          setStreaming('');
          const turn = await model.chat(messages, tools, setStreaming);
          setStreaming(null);
          return turn;
        },
        harness: harness.current!,
        agent: 'coordinator',
        history: history.current,
        text: TEXT[operatorLanguage],
      });
      history.current.push(...added);
      const shown: Line[] = [];
      for (const message of added) {
        if (message.role === 'tool') shown.push({ kind: 'tool', text: toolLine(message.name, message.content) });
      }
      // Only the turn's closing line reaches the operator. App lines are already in their language;
      // the model's English replies go through the translator.
      if (reply) {
        const forOperator = translating && !reply.fromApp ? await translate(reply.text, 'en', 'sw') : reply.text;
        shown.push({ kind: 'agent', text: forOperator });
      }
      for (const outcome of outcomes) {
        if (outcome.status === 'AWAITING_APPROVAL') shown.push({ kind: 'approval', approval: outcome.approval, answer: null });
      }
      setLines((current) => [...current, ...shown]);
    } catch (error) {
      if (__DEV__) console.log('[agent] turn failed', error);
      setLines((current) => [...current, { kind: 'tool', text: `The agent stopped: ${String(error)}` }]);
    } finally {
      setStreaming(null);
      setBusy(false);
    }
  }

  async function answer(approval: PendingApproval, approved: boolean) {
    const h = harness.current!;
    let note: string;
    let reply: string | null = null;
    let website: PublishResult | undefined;
    let canPublish = false;
    if (approved) {
      const outcome = await h.approve(approval.activityId);
      note = outcome.status === 'COMPLETED' ? `${approval.tool} done` : `${approval.tool} ${outcome.status.toLowerCase()}: ${'error' in outcome ? outcome.error : ''}`;
      // A tool's own operator-facing line, such as "the profile is approved", is shown as the reply.
      const said = outcome.status === 'COMPLETED' ? (outcome.result as { reply?: unknown } | null)?.reply : null;
      if (typeof said === 'string') reply = said;
      website = outcome.status === 'COMPLETED' ? ((outcome.result as { website?: PublishResult } | null)?.website ?? undefined) : undefined;
      canPublish = outcome.status === 'COMPLETED' && Boolean((outcome.result as { can_publish?: boolean } | null)?.can_publish);
    } else {
      h.decline(approval.activityId, 'The operator declined');
      note = `${approval.tool} declined`;
    }
    // The model learns the answer on its next turn.
    history.current.push({ role: 'user', content: `(App note: ${note}.)` });
    const answered = approved ? ('approved' as const) : ('declined' as const);
    setLines((current): Line[] => [
      ...current.map((line): Line =>
        line.kind === 'approval' && line.approval.activityId === approval.activityId ? { ...line, answer: answered } : line,
      ),
      { kind: 'tool', text: note },
      ...(reply ? [{ kind: 'agent' as const, text: reply, website, canPublish }] : []),
    ]);
  }

  // Publishing is a separate step with its own approval card (docs/website-creator.md).
  async function requestPublish() {
    const outcome = await harness.current!.propose('coordinator', { name: 'publish_website', arguments: {} }, true);
    setLines((current): Line[] => [
      ...current,
      outcome.status === 'AWAITING_APPROVAL'
        ? { kind: 'approval', approval: outcome.approval, answer: null }
        : { kind: 'agent', text: outcome.status === 'REJECTED' ? outcome.reason : TEXT[languageRef.current].nothingToPublish },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={styles.content} onContentSizeChange={() => scroll.current?.scrollToEnd()}>
        <View style={styles.languages} accessibilityRole="radiogroup">
          {(['sw', 'en'] as const).map((id) => (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ selected: language === id }}
              style={[styles.language, language === id && styles.languageSelected]}
              onPress={() => chooseLanguage(id)}
            >
              <Text style={[styles.languageText, language === id && styles.languageTextSelected]}>{LANGUAGE_NAMES[id]}</Text>
            </Pressable>
          ))}
        </View>
        <ModelLine state={modelState} />
        {lines.map((line, index) => (
          <LineView key={index} line={line} onAnswer={answer} text={text} store={store} onOpenWebsite={onOpenWebsite} onPublish={requestPublish} />
        ))}
        {streaming !== null && <Text style={[styles.bubble, styles.agent]}>{streaming || '…'}</Text>}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={text.placeholder}
          multiline
          accessibilityLabel="Message"
        />
        <Pressable
          style={[styles.send, (busy || modelState.status !== 'ready') && styles.disabled]}
          onPress={() => send(draft)}
          disabled={busy || modelState.status !== 'ready'}
          accessibilityRole="button"
        >
          <Text style={styles.sendText}>{busy ? '…' : text.send}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function toolLine(name: string, content: string): string {
  try {
    const parsed = JSON.parse(content) as { status: string; reason?: string; error?: string };
    const detail = parsed.reason ?? parsed.error;
    return `${name}: ${parsed.status.replaceAll('_', ' ')}${detail ? ` (${detail})` : ''}`;
  } catch {
    return name;
  }
}

function ModelLine({ state }: { state: ModelState }) {
  if (state.status === 'loading') return <Text style={styles.status}>Loading the model…</Text>;
  if (state.status === 'missing') return <Text style={styles.error}>No model found. Please copy a .gguf file into the app (docs/setup.md).</Text>;
  if (state.status === 'error') return <Text style={styles.error}>The model failed to load: {state.message}</Text>;
  return <Text style={styles.status}>{state.model.label}</Text>;
}

type LineProps = {
  line: Line;
  onAnswer: (approval: PendingApproval, approved: boolean) => void;
  text: (typeof TEXT)[Language];
  store: LocalStore;
  onOpenWebsite?: () => void;
  onPublish: () => void;
};

function LineView({ line, onAnswer, text, store, onOpenWebsite, onPublish }: LineProps) {
  if (line.kind === 'tool') return <Text style={styles.tool}>{line.text}</Text>;
  if (line.kind !== 'approval') {
    const bubble = <Text style={[styles.bubble, line.kind === 'operator' ? styles.operator : styles.agent]}>{line.text}</Text>;
    if (line.kind === 'agent' && line.canPublish) {
      return (
        <View style={styles.published}>
          {bubble}
          <ScriptedButton label={text.publishWebsite} onPress={onPublish} />
        </View>
      );
    }
    if (line.kind !== 'agent' || !line.website) return bubble;
    // A live page opens the public Apps Script address; otherwise the Website tab shows the phone's copy.
    const website = line.website;
    const open = website.state === 'LIVE' ? () => void Linking.openURL(website.url) : onOpenWebsite;
    return (
      <View style={styles.published}>
        {bubble}
        {website.state === 'LIVE' && <Text style={styles.status}>{website.url}</Text>}
        {open && <OpenWebsite label={text.openWebsite} onPress={open} />}
      </View>
    );
  }
  const { approval, answer } = line;
  const previewing = approval.tool === 'approve_profile_draft';
  // Development only: the scripted run approves once the preview (or a publish card) is showing.
  const scriptedApprove = () => SCRIPTED_APPROVAL && setTimeout(() => onAnswer(approval, true), 6000);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{text.approvalNeeded}: {approval.tool}</Text>
      <Text style={styles.status}>{approval.reason}</Text>
      {previewing && !answer && <PublicationPreview store={store} text={text} onReady={scriptedApprove} />}
      {approval.tool === 'publish_website' && !answer && <ScriptedTrigger run={scriptedApprove} />}
      {answer ? (
        <Text style={styles.status}>{answer === 'approved' ? text.youApproved : text.youDeclined}</Text>
      ) : (
        <View style={styles.row}>
          <Pressable style={[styles.button, styles.decline]} onPress={() => onAnswer(approval, false)} accessibilityRole="button">
            <Text style={styles.declineText}>{text.decline}</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={() => onAnswer(approval, true)} accessibilityRole="button">
            <Text style={styles.sendText}>{text.approve}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// The page this draft produces, rendered on the phone in the approval card: Noor sees and can edit
// exactly what approving saves (docs/website-creator.md). Publishing it is a separate step.
function PublicationPreview({ store, text, onReady }: { store: LocalStore; text: (typeof TEXT)[Language]; onReady: () => void }) {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  // The edit fields stay folded so the page and the approve buttons fit on screen together.
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    preparePublication(store, readDraft(store).fields, PUBLICATION)
      .then(setPublication)
      .catch(() => setFailed(true));
  }, []);
  const apply = async (edits: Parameters<typeof editPublication>[3]) => {
    setDrawn(false);
    setPublication(await editPublication(store, readDraft(store).fields, PUBLICATION, edits));
  };
  if (failed) return <Text style={styles.error}>{text.previewFailed}</Text>;
  if (!publication) return <Loading label={text.previewLoading} />;
  const { headline, introduction } = publication.page;
  return (
    <View style={styles.previewBlock}>
      <View style={styles.previewFrame}>
        <WebView
          source={{ html: publication.html }}
          originWhitelist={['*']}
          javaScriptEnabled={false}
          domStorageEnabled={false}
          onLoadEnd={() => {
            setDrawn(true);
            onReady();
          }}
          accessibilityLabel="Website preview"
        />
        {!drawn && (
          <View style={styles.previewCover}>
            <Loading label={text.previewLoading} />
          </View>
        )}
      </View>
      <Pressable style={styles.editToggle} onPress={() => setEditing((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: editing }}>
        <Text style={styles.editToggleText}>{editing ? text.doneEditing : text.editText}</Text>
      </Pressable>
      {editing && (
        <>
          <EditField label={`${text.editHeadline} (English)`} value={headline.en} onDone={(en) => apply({ headline: { ...headline, en } })} />
          <EditField label={`${text.editHeadline} (Kiswahili)`} value={headline.sw} onDone={(sw) => apply({ headline: { ...headline, sw } })} />
          <EditField label={`${text.editIntroduction} (English)`} value={introduction.en} multiline onDone={(en) => apply({ introduction: { ...introduction, en } })} />
          <EditField label={`${text.editIntroduction} (Kiswahili)`} value={introduction.sw} multiline onDone={(sw) => apply({ introduction: { ...introduction, sw } })} />
        </>
      )}
    </View>
  );
}

function EditField({ label, value, multiline, onDone }: { label: string; value: string; multiline?: boolean; onDone: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <View style={styles.editField}>
      <Text style={styles.status}>{label}</Text>
      <TextInput
        style={[styles.editInput, multiline && styles.editInputTall]}
        value={draft}
        onChangeText={setDraft}
        onEndEditing={() => draft.trim() && draft !== value && onDone(draft.trim())}
        multiline={multiline}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.previewLoading}>
      <ActivityIndicator />
      <Text style={styles.status}>{label}</Text>
    </View>
  );
}

// Development only: lets the scripted run press a button or approve a card without a tap.
function ScriptedTrigger({ run }: { run: () => void }) {
  useEffect(() => {
    run();
  }, []);
  return null;
}

function ScriptedButton({ label, onPress }: { label: string; onPress: () => void }) {
  useEffect(() => {
    if (SCRIPTED_APPROVAL) {
      const timer = setTimeout(onPress, 4000);
      return () => clearTimeout(timer);
    }
  }, []);
  return (
    <Pressable style={[styles.button, styles.openWebsite]} onPress={onPress} accessibilityRole="button">
      <Text style={styles.sendText}>{label}</Text>
    </Pressable>
  );
}

function OpenWebsite({ label, onPress }: { label: string; onPress: () => void }) {
  useEffect(() => {
    if (SCRIPTED_APPROVAL) {
      const timer = setTimeout(onPress, 5000);
      return () => clearTimeout(timer);
    }
  }, []);
  return (
    <Pressable style={[styles.button, styles.openWebsite]} onPress={onPress} accessibilityRole="button">
      <Text style={styles.sendText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  published: { gap: 8, alignItems: 'flex-start' },
  openWebsite: { flex: 0, paddingHorizontal: 16, alignSelf: 'flex-start' },
  previewLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  previewBlock: { gap: 8 },
  previewFrame: { height: 420, overflow: 'hidden', borderWidth: 1, borderColor: '#d6dbe0', borderRadius: 10 },
  previewCover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  editField: { gap: 4 },
  editToggle: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: '#1f4e79' },
  editToggleText: { color: '#1f4e79', fontSize: 14, fontWeight: '600' },
  editInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  editInputTall: { minHeight: 64, textAlignVertical: 'top' },
  content: { padding: 16, gap: 10 },
  status: { fontSize: 13, color: '#555' },
  error: { fontSize: 14, color: '#b00020' },
  bubble: { fontSize: 16, lineHeight: 22, padding: 12, borderRadius: 12, maxWidth: '88%', overflow: 'hidden' },
  operator: { alignSelf: 'flex-end', backgroundColor: '#1f4e79', color: '#fff' },
  agent: { alignSelf: 'flex-start', backgroundColor: '#eef1f4', color: '#111' },
  tool: { fontSize: 12, color: '#666', alignSelf: 'flex-start', fontFamily: 'Menlo' },
  card: { borderWidth: 1, borderColor: '#d6dbe0', borderRadius: 12, padding: 12, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, backgroundColor: '#1f4e79', borderRadius: 8, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  decline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#1f4e79' },
  declineText: { color: '#1f4e79', fontSize: 16, fontWeight: '600' },
  composer: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#e3e6ea', alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  send: { backgroundColor: '#1f4e79', borderRadius: 8, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  languages: { flexDirection: 'row', gap: 8 },
  language: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: '#d6dbe0', justifyContent: 'center' },
  languageSelected: { backgroundColor: '#1f4e79', borderColor: '#1f4e79' },
  languageText: { fontSize: 14, color: '#333' },
  languageTextSelected: { color: '#fff', fontWeight: '600' },
});
