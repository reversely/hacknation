import type { FarmProfile } from '@wren/contracts';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import '../gmail/gmailConnector';
import { completeJson, findWebsiteModelFile } from '../inference/localModel';
import { REMOTE_WEBSITE_MODEL_URL, remoteJsonCompletion } from '../inference/remoteModel';
import { remoteTranslator, TRANSLATOR_URL } from '../inference/translator';
import type { GoogleApi } from '../store/google';
import { newId } from '../store/ids';
import { SPREADSHEET_ID_KEY } from '../store/outbox';
import { syncOnce } from '../store/outbox';
import type { LocalStore } from '../store/localStore';
import { generateWebsitePage, loadWebsiteModel, renderWebsitePreviewHtml, type JsonGenerator, type WebsitePage } from './websiteCreator';

// The Kiswahili copy comes from the translation service (docs/language.md).
const translate = TRANSLATOR_URL ? remoteTranslator(TRANSLATOR_URL) : null;

export function WebsiteCreatorScreen({ store, google }: { store: LocalStore; google: GoogleApi }) {
  const [generate, setGenerate] = useState<JsonGenerator | null>(null);
  const [modelMessage, setModelMessage] = useState('Loading the website model…');
  const [page, setPage] = useState<WebsitePage | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<FarmProfile | null>(() =>
    store.list<FarmProfile>('Farm').find((record) => record.status === 'APPROVED') ?? null,
  );

  useEffect(() => {
    let active = true;
    if (REMOTE_WEBSITE_MODEL_URL) {
      setGenerate(() => remoteJsonCompletion(REMOTE_WEBSITE_MODEL_URL));
      setModelMessage(`Model server ${REMOTE_WEBSITE_MODEL_URL}`);
      return;
    }
    let loaded: Awaited<ReturnType<typeof loadWebsiteModel>> | null = null;
    const file = findWebsiteModelFile();
    if (!file) {
      setModelMessage('Add the Qwen2.5-Coder GGUF file to Documents/models to create a page offline.');
      return;
    }
    loadWebsiteModel(file).then((result) => {
      loaded = result;
      if (active) {
        setGenerate(() => (prompt: string, schema: object, maxTokens: number) => completeJson(result, prompt, schema, maxTokens));
        setModelMessage(`${result.fileName} ready on the ${result.gpu ? 'GPU' : 'CPU'}`);
      } else {
        result.context.release();
      }
    }).catch(() => {
      if (active) setModelMessage('The website model could not be loaded. Check the GGUF file and try again.');
    });
    return () => {
      active = false;
      loaded?.context.release();
    };
  }, []);

  // Lets a scripted check run without a tap: start Metro with EXPO_PUBLIC_AUTORUN=website.
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_AUTORUN === 'website' && generate && profile && !page && !busy) createPreview();
  }, [generate]);

  async function createPreview() {
    if (!generate || !profile) return;
    if (!translate) {
      setMessage('The Kiswahili copy needs the translation service. Set EXPO_PUBLIC_TRANSLATOR_URL.');
      return;
    }
    setBusy(true);
    setMessage(null);
    setConfirming(false);
    try {
      setPage(await generateWebsitePage(generate, translate, profile));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The page could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!profile || !page) return;
    if (!store.getMeta(SPREADSHEET_ID_KEY)) {
      setMessage('Finish setting up the business spreadsheet before publishing.');
      setConfirming(false);
      return;
    }
    setBusy(true);
    setConfirming(false);
    const now = new Date().toISOString();
    const updated = { ...profile, page, version: profile.version + 1, updated_at: now };
    const actionId = newId();
    store.enqueue({ id: actionId, type: 'save_profile', approved_by: 'OPERATOR', approved_at: now, profile: updated }, now);
    await syncOnce(store, google, () => new Date().toISOString());
    const receipt = store.outbox().find((entry) => entry.id === actionId);
    // The general sync can fail on an unrelated calendar pull after the page write completed.
    // Check the specific action receipt so the UI describes the publication result accurately.
    if (receipt?.status === 'COMPLETED') {
      setProfile(updated);
      setMessage('The approved page was saved to the Farm spreadsheet.');
    } else if (receipt?.status === 'FAILED') {
      setMessage('Google rejected this page write. Check the spreadsheet access and try again.');
    } else {
      setMessage('Publication is queued on this phone. It will sync when Google access and internet are available.');
    }
    setBusy(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Website</Text>
      <Text style={styles.detail}>{modelMessage}</Text>
      {!profile ? (
        <Text style={styles.detail}>Save and approve the farm profile first. The website uses only approved profile details.</Text>
      ) : (
        <>
          <Text style={styles.detail}>Create a page in English and Kiswahili, preview it offline, then approve publication.</Text>
          <Button label={busy ? 'Working…' : 'Create page preview'} disabled={busy || !generate} onPress={createPreview} />
        </>
      )}
      {message && <Text accessibilityRole="alert" style={styles.detail}>{message}</Text>}
      {page && profile && (
        <>
          <View style={styles.preview}>
            <WebView
              source={{ html: renderWebsitePreviewHtml(profile, page) }}
              originWhitelist={['*']}
              javaScriptEnabled={false}
              domStorageEnabled={false}
              accessibilityLabel="Offline farm website preview"
            />
          </View>
          {confirming ? (
            <View style={styles.confirm}>
              <Text style={styles.detail}>This saves the page to the Farm spreadsheet. The public Apps Script address must be set up separately.</Text>
              <Button label="Confirm and publish" disabled={busy} onPress={publish} />
              <Button label="Cancel" disabled={busy} onPress={() => setConfirming(false)} secondary />
            </View>
          ) : (
            <Button label="Publish this page" disabled={busy} onPress={() => setConfirming(true)} />
          )}
        </>
      )}
    </ScrollView>
  );
}

function Button({ label, disabled, onPress, secondary = false }: { label: string; disabled?: boolean; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '700', color: '#1d2c20' },
  detail: { fontSize: 14, lineHeight: 20, color: '#425247' },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 16, backgroundColor: '#315c3a' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#315c3a' },
  secondaryText: { color: '#315c3a' },
  disabled: { opacity: 0.5 },
  preview: { height: 560, overflow: 'hidden', borderWidth: 1, borderColor: '#d9dfd5', borderRadius: 14 },
  confirm: { gap: 10, padding: 14, borderWidth: 1, borderColor: '#d9dfd5', borderRadius: 12, backgroundColor: '#f7faf5' },
});
