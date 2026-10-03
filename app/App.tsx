import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ModelCheckScreen } from './src/inference/ModelCheckScreen';
import { secureVault } from './src/setup/secrets';
import { SetupScreen } from './src/setup/SetupScreen';
import { readConfig } from './src/setup/setupStore';
import { openExpoDatabase } from './src/store/expoDatabase';
import { LocalStore } from './src/store/localStore';
import { httpTransport, startSyncLoop, type SyncResult } from './src/store/sync';

const store = new LocalStore(openExpoDatabase());
type Tab = 'setup' | 'model';

export default function App() {
  const [tab, setTab] = useState<Tab>('setup');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [apiUrl, setApiUrl] = useState(() => readConfig(store).apiUrl);

  // The sync loop restarts when setup saves a new backend address.
  const transport = useMemo(() => httpTransport(apiUrl ?? '', () => secureVault.get('device_token')), [apiUrl]);
  useEffect(() => startSyncLoop(store, transport, setSyncResult), [transport]);

  return (
    <View style={styles.screen}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['setup', 'model'] as const).map((id) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            style={[styles.tab, tab === id && styles.tabSelected]}
            onPress={() => setTab(id)}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextSelected]}>{id === 'setup' ? 'Setup' : 'Model'}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'setup' ? (
        <SetupScreen store={store} onApiUrlChange={setApiUrl} />
      ) : (
        <ModelCheckScreen store={store} syncResult={syncResult} />
      )}
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
