import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AgentScreen } from './src/agent/AgentScreen';
import { ModelCheckScreen } from './src/inference/ModelCheckScreen';
import { secureVault } from './src/setup/secrets';
import { SetupScreen } from './src/setup/SetupScreen';
import { readConfig } from './src/setup/setupStore';
import { openExpoDatabase } from './src/store/expoDatabase';
import { LocalStore } from './src/store/localStore';
import { httpTransport, startSyncLoop, type SyncResult } from './src/store/sync';

const store = new LocalStore(openExpoDatabase());
type Tab = 'agent' | 'setup' | 'model';
const TAB_LABELS: Record<Tab, string> = { agent: 'Agent', setup: 'Setup', model: 'Model' };

export default function App() {
  // A scripted check (EXPO_PUBLIC_AUTORUN) opens on the tab where its run starts by itself.
  const autorun = process.env.EXPO_PUBLIC_AUTORUN;
  const [tab, setTab] = useState<Tab>(autorun === 'agent' ? 'agent' : autorun ? 'model' : 'agent');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  // The backend is the operator's own Vercel project; its address exists once the website deploy
  // (#18) has saved it, and the sync loop reports "not connected" until then.
  const [apiUrl] = useState(() => readConfig(store).apiUrl);
  const transport = useMemo(() => httpTransport(apiUrl ?? '', () => secureVault.get('device_token')), [apiUrl]);
  useEffect(() => startSyncLoop(store, transport, setSyncResult), [transport]);

  return (
    <View style={styles.screen}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['agent', 'setup', 'model'] as const).map((id) => (
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
