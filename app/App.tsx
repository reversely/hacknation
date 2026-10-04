import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AgentScreen } from './src/agent/AgentScreen';
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
type Tab = 'agent' | 'website' | 'setup' | 'model';
const TAB_LABELS: Record<Tab, string> = { agent: 'Agent', website: 'Website', setup: 'Setup', model: 'Model' };

export default function App() {
  // A scripted check (EXPO_PUBLIC_AUTORUN) opens on the tab where its run starts by itself.
  const autorun = process.env.EXPO_PUBLIC_AUTORUN;
  const [tab, setTab] = useState<Tab>(autorun === 'agent' ? 'agent' : autorun ? 'model' : 'agent');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  useEffect(() => startSyncLoop(store, google, setSyncResult), []);

  return (
    <View style={styles.screen}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['agent', 'website', 'setup', 'model'] as const).map((id) => (
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
      {tab === 'agent' && <AgentScreen store={store} />}
      {tab === 'website' && <WebsiteCreatorScreen store={store} google={google} />}
      {tab === 'setup' && <SetupScreen store={store} />}
      {tab === 'model' && <ModelCheckScreen store={store} syncResult={syncResult} />}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  // Clears the status bar and notch without a safe-area dependency.
  screen: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 8, backgroundColor: '#eef1f4', padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6, minHeight: 44, justifyContent: 'center' },
  tabSelected: { backgroundColor: '#fff' },
  tabText: { fontSize: 15, color: '#555' },
  tabTextSelected: { color: '#111', fontWeight: '600' },
});
