import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AgentScreen } from './src/agent/AgentScreen';
import { SurveyScreen } from './src/survey/SurveyScreen';
import { WebsiteCreatorScreen } from './src/agent/WebsiteCreatorScreen';
import { ModelCheckScreen } from './src/inference/ModelCheckScreen';
import { SetupScreen } from './src/setup/SetupScreen';
import { openExpoDatabase } from './src/store/expoDatabase';
import { googleApi } from './src/store/google';
import { LocalStore } from './src/store/localStore';
import { startSyncLoop, type SyncResult } from './src/store/outbox';

const store = new LocalStore(openExpoDatabase());
// The Google Sign-In SDK refreshes the access token as needed (docs/google-access.md). Before
// Noor signs in, each call fails and the outbox keeps its actions queued.
const google = googleApi(async () => (await GoogleSignin.getTokens()).accessToken);
type Tab = 'survey' | 'agent' | 'website' | 'setup' | 'model';
const TAB_LABELS: Record<Tab, string> = { survey: 'Survey', agent: 'Agent', website: 'Website', setup: 'Setup', model: 'Model' };

export default function App() {
  // A scripted check (EXPO_PUBLIC_AUTORUN) opens on the tab where its run starts by itself.
  const autorun = process.env.EXPO_PUBLIC_AUTORUN;
  const [tab, setTab] = useState<Tab>(autorun === 'website' ? 'website' : autorun === 'agent' || autorun === 'chat-to-website' ? 'agent' : autorun === 'survey' || !autorun ? 'survey' : 'model');
  // The scripted survey run shows the screens full size, as the onboarding mockup does.
  const showTabs = autorun !== 'survey';
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  useEffect(() => startSyncLoop(store, google, setSyncResult), []);

  return (
    <View style={styles.screen}>
      {showTabs && (
        <View style={styles.tabs} accessibilityRole="tablist">
        {(['survey', 'agent', 'website', 'setup', 'model'] as const).map((id) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            style={[styles.tab, tab === id && styles.tabSelected]}
            onPress={() => setTab(id)}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextSelected]}>{TAB_LABELS[id]}</Text>
          </Pressable>
        ))}
      </View>
      )}
      {/* Starts the web view engine at launch, so the first page preview does not wait for it. */}
      <WebView source={{ html: '<p></p>' }} containerStyle={styles.warmup} style={styles.warmup} />
      {tab === 'survey' && <SurveyScreen />}
      {tab === 'agent' && <AgentScreen store={store} google={google} onOpenWebsite={() => setTab('website')} />}
      {tab === 'website' && <WebsiteCreatorScreen store={store} google={google} />}
      {tab === 'setup' && <SetupScreen store={store} />}
      {tab === 'model' && <ModelCheckScreen store={store} syncResult={syncResult} />}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  warmup: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  // Clears the status bar and notch without a safe-area dependency.
  screen: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 8, backgroundColor: '#eef1f4', padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6, minHeight: 44, justifyContent: 'center' },
  tabSelected: { backgroundColor: '#fff' },
  tabText: { fontSize: 15, color: '#555' },
  tabTextSelected: { color: '#111', fontWeight: '600' },
});
