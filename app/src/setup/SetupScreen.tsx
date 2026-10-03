import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { LocalStore } from '../store/localStore';
import { secureVault, type SecretName } from './secrets';
import { readConfig, readProgress, saveBusiness, saveProgress } from './setupStore';
import { currentStep, runCheck, STEP_IDS, type SetupProgress, type StepId } from './steps';

const TITLES: Record<StepId, string> = {
  business: 'Business details',
  gmail: 'Gmail',
  sheets: 'Google Sheets',
  vercel: 'Vercel',
  website: 'Website',
  whatsapp: 'WhatsApp',
  calendar: 'Google Calendar',
  listings: 'Listings',
};

const HINTS: Record<StepId, string> = {
  business: 'Please enter your farm name and WhatsApp number',
  gmail: 'Gmail sign-in is not available in this build',
  sheets: 'Check that your booking service can reach your spreadsheet',
  vercel: 'Add a Vercel access token and project ID for preview and approved production deploys',
  website: 'Publishing creates your website and its booking service in your own Vercel account',
  whatsapp: 'Check that your booking service can reach your WhatsApp number',
  calendar: 'Check that your booking service can reach your tour calendar',
  listings: 'Please create your Google and Facebook listings and then mark this step done',
};

const TAGS = { NOT_STARTED: 'not started', DONE: 'done', FAILED: 'failed' } as const;

type Props = { store: LocalStore };

export function SetupScreen({ store }: Props) {
  const [progress, setProgress] = useState<SetupProgress>(() => readProgress(store));
  const [open, setOpen] = useState<StepId | null>(() => currentStep(readProgress(store)));
  const [checking, setChecking] = useState(false);

  function update(step: StepId, state: SetupProgress[StepId]) {
    const next = { ...progress, [step]: state };
    saveProgress(store, next);
    setProgress(next);
    if (state.status === 'DONE') setOpen(currentStep(next));
  }

  async function check(step: StepId) {
    setChecking(true);
    try {
      const state = await runCheck(step, { vault: secureVault, config: readConfig(store), fetch }, new Date().toISOString());
      update(step, state);
    } finally {
      setChecking(false);
    }
  }

  const done = STEP_IDS.filter((id) => progress[id].status === 'DONE').length;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Setup</Text>
      <Text style={styles.detail}>
        {done} of {STEP_IDS.length} steps done
      </Text>

      {STEP_IDS.map((id) => {
        const state = progress[id];
        const expanded = open === id;
        return (
          <View key={id} style={styles.step}>
            <Pressable
              style={styles.stepHeader}
              onPress={() => setOpen(expanded ? null : id)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
            >
              <Text style={styles.stepTitle}>{TITLES[id]}</Text>
              <Text style={[styles.tag, styles[`tag_${state.status}`]]}>{TAGS[state.status]}</Text>
            </Pressable>

            {expanded && (
              <View style={styles.stepBody}>
                <Text style={styles.detail}>{HINTS[id]}</Text>
                <StepFields step={id} store={store} />
                {state.error && <Text style={styles.error}>{state.error}</Text>}
                {id === 'listings' ? (
                  <Button
                    label="Mark as done"
                    onPress={() => update(id, { status: 'DONE', checkedAt: new Date().toISOString(), error: null })}
                  />
                ) : (
                  <Button label={checking ? 'Checking…' : 'Check connection'} disabled={checking} onPress={() => check(id)} />
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function StepFields({ step, store }: { step: StepId } & Props) {
  const config = readConfig(store);
  if (step === 'business') {
    return <BusinessFields store={store} initial={config.business} />;
  }
  if (step === 'vercel') return <><SecretField name="vercel_token" label="Vercel token" /><SecretField name="vercel_project_id" label="Vercel project ID" /></>;
  return null;
}

function BusinessFields({ store, initial }: { store: LocalStore; initial: ReturnType<typeof readConfig>['business'] }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [whatsappNumber, setWhatsappNumber] = useState(initial?.whatsappNumber ?? '');
  useEffect(() => {
    // The phone's own time zone is the tour time zone unless the operator changes it later.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    saveBusiness(store, { name, whatsappNumber: whatsappNumber.replace(/[\s-]/g, ''), timezone });
  }, [name, whatsappNumber]);
  return (
    <>
      <LabeledInput label="Farm name" value={name} onChangeText={setName} />
      <LabeledInput
        label="WhatsApp number"
        value={whatsappNumber}
        onChangeText={setWhatsappNumber}
        placeholder="+254 712 345 678"
        keyboardType="phone-pad"
      />
    </>
  );
}

// The field never shows a stored value; it only says whether one is saved.
function SecretField({ name, label }: { name: SecretName; label: string }) {
  const [saved, setSaved] = useState(false);
  const [value, setValue] = useState('');
  useEffect(() => {
    secureVault.get(name).then((stored) => setSaved(stored !== null));
  }, [name]);

  async function save() {
    if (!value.trim()) return;
    await secureVault.set(name, value.trim());
    setValue('');
    setSaved(true);
  }

  return (
    <LabeledInput
      label={label}
      value={value}
      onChangeText={setValue}
      onEndEditing={save}
      placeholder={saved ? 'Saved' : 'Paste here'}
      secureTextEntry
    />
  );
}

function LabeledInput({
  label,
  ...input
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor="#888"
        {...input}
      />
    </View>
  );
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '600' },
  detail: { fontSize: 14, color: '#444' },
  error: { fontSize: 14, color: '#b00020' },
  step: { borderWidth: 1, borderColor: '#dde2e7', borderRadius: 8 },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    minHeight: 48,
  },
  stepTitle: { fontSize: 16, fontWeight: '500', flexShrink: 1 },
  stepBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  tag: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  tag_NOT_STARTED: { backgroundColor: '#eef1f4', color: '#555' },
  tag_DONE: { backgroundColor: '#e3f1e6', color: '#1e6b33' },
  tag_FAILED: { backgroundColor: '#fbe7ea', color: '#b00020' },
  field: { gap: 4 },
  label: { fontSize: 13, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, minHeight: 44, fontSize: 16 },
  button: { backgroundColor: '#1f4e79', borderRadius: 8, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
