import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { REMOTE_WEBSITE_MODEL_URL, remoteJsonCompletion } from '../inference/remoteModel';
import { remoteTranslator, TRANSLATOR_URL } from '../inference/translator';
import { buildSite } from './pipeline';
import { formatDuration } from './render';
import { DAY_LETTERS, LANGUAGE_CHOICES, STRINGS, type Strings } from './strings';
import { DAYS, SERVICE_TYPES, Survey, type Day, type Language, type ServiceType } from './survey';
import { Card, Dots, Field, Header, LinkButton, PrimaryButton, Title, theme } from './ui';

// The onboarding survey (the mockup: language, sign-in, business, services, availability, review).
// Every screen and the site use only the language picked on the first screen. Every answer is a
// structured field; the review step builds the site with the translation model and Qwen Coder
// (pipeline.ts) and shows the preview.

type ServiceDraft = { type: ServiceType | null; customName: string; about: string; hours: string; minutes: string; price: string; capacity: string };
type Draft = {
  language: Language;
  name: string;
  phone: string;
  location: string;
  about: string;
  services: ServiceDraft[];
  days: Day[];
  slots: { start: string; end: string }[];
};

const STEPS = ['language', 'signIn', 'business', 'services', 'availability', 'review'] as const;
type Step = (typeof STEPS)[number];
const DAY_ORDER = Object.keys(DAYS) as Day[];
const emptyService = (): ServiceDraft => ({ type: null, customName: '', about: '', hours: '1', minutes: '00', price: '', capacity: '1' });
const START: Draft = { language: 'en', name: '', phone: '', location: '', about: '', services: [emptyService()], days: [], slots: [{ start: '09:00', end: '10:30' }] };

// Development only: EXPO_PUBLIC_AUTORUN=survey fills a sample business and steps through every screen.
const SAMPLE: Draft = {
  language: 'sw',
  name: 'Ondera Coffee Farm',
  phone: '+254712345678',
  location: 'Ondera, kaunti ya Nyeri',
  about: 'Shamba la kahawa la familia linalolima Arabika chini ya miti ya kivuli.',
  services: [{ type: 'guided_tour', customName: '', about: 'Tembea kwenye mistari ya kahawa na uonje kahawa safi.', hours: '2', minutes: '00', price: '1500', capacity: '8' }],
  days: ['saturday', 'sunday'],
  slots: [{ start: '09:00', end: '11:00' }, { start: '14:00', end: '15:30' }],
};
const SCRIPTED = __DEV__ && process.env.EXPO_PUBLIC_AUTORUN === 'survey';

// Kenyan local numbers become +254; any other number must already carry its country code.
export function toE164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  return /^\+[1-9]\d{6,14}$/.test(digits) ? digits : null;
}

export function toSurvey(d: Draft): Survey | null {
  const parsed = Survey.safeParse({
    language: d.language,
    business: { name: d.name.trim(), phone: toE164(d.phone) ?? '', location: d.location.trim() || undefined, description: d.about.trim() || undefined },
    services: d.services.map((s) => ({
      type: s.type ?? undefined,
      custom_name: s.type === 'custom' ? s.customName.trim() || undefined : undefined,
      description: s.about.trim() || undefined,
      duration_minutes: Number(s.hours || 0) * 60 + Number(s.minutes || 0),
      price: { amount: Number(s.price), currency: 'KES' },
      capacity: Number(s.capacity),
    })),
    availability: { days: DAY_ORDER.filter((day) => d.days.includes(day)), slots: d.slots },
  });
  return parsed.success ? parsed.data : null;
}

export function SurveyScreen() {
  const [draft, setDraft] = useState<Draft>(SCRIPTED ? SAMPLE : START);
  const [step, setStep] = useState<Step>('language');
  const t = STRINGS[draft.language];
  const index = STEPS.indexOf(step);
  const back = index > 0 ? () => setStep(STEPS[index - 1]) : undefined;
  const next = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)]);
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    if (!SCRIPTED || step === 'review') return;
    const timer = setTimeout(next, 3500);
    return () => clearTimeout(timer);
  }, [step]);

  return (
    <KeyboardAvoidingView style={screen.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header onBack={back} />
      <ScrollView contentContainerStyle={screen.content} keyboardShouldPersistTaps="handled">
        {step === 'language' && <LanguageStep draft={draft} update={update} t={t} />}
        {step === 'signIn' && <SignInStep t={t} onDone={next} />}
        {step === 'business' && <BusinessStep draft={draft} update={update} t={t} />}
        {step === 'services' && <ServicesStep draft={draft} update={update} t={t} />}
        {step === 'availability' && <AvailabilityStep draft={draft} update={update} t={t} />}
        {step === 'review' && <ReviewStep draft={draft} t={t} />}
      </ScrollView>
      {step !== 'signIn' && step !== 'review' && (
        <View style={screen.footer}>
          <PrimaryButton label={step === 'language' ? t.continue : t.next} onPress={next} disabled={!stepReady(step, draft)} />
          <Dots count={STEPS.length} current={index} />
        </View>
      )}
      {step === 'review' && <Dots count={STEPS.length} current={index} />}
    </KeyboardAvoidingView>
  );
}

function stepReady(step: Step, d: Draft): boolean {
  if (step === 'business') return Boolean(d.name.trim()) && toE164(d.phone) !== null;
  if (step === 'services') return d.services.every((s) => s.type && (s.type !== 'custom' || s.customName.trim()) && Number(s.price) >= 0 && s.price !== '' && Number(s.capacity) >= 1 && Number(s.hours || 0) * 60 + Number(s.minutes || 0) >= 10);
  if (step === 'availability') return d.days.length > 0 && d.slots.length > 0 && d.slots.every((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.end) && s.start < s.end);
  return true;
}

type StepProps = { draft: Draft; update: (patch: Partial<Draft>) => void; t: Strings };

function LanguageStep({ draft, update, t }: StepProps) {
  return (
    <>
      <Title title={t.languageTitle} lead={t.languageLead} />
      <View style={screen.list} accessibilityRole="radiogroup">
        {LANGUAGE_CHOICES.map((choice, i) => {
          const on = draft.language === choice.id;
          return (
            <Pressable
              key={choice.id}
              onPress={() => update({ language: choice.id })}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[screen.listRow, i > 0 && screen.listDivider, on && screen.listRowOn]}
            >
              <Text style={screen.code}>{choice.code}</Text>
              <View style={screen.listText}>
                <Text style={screen.listLabel}>{choice.label}</Text>
              </View>
              {on && <Text style={screen.check}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function SignInStep({ t, onDone }: { t: Strings; onDone: () => void }) {
  const [failed, setFailed] = useState(false);
  const signIn = async () => {
    setFailed(false);
    try {
      await GoogleSignin.signIn();
      onDone();
    } catch {
      setFailed(true);
    }
  };
  return (
    <View style={screen.signIn}>
      <Card>
        <Text style={screen.signInTitle}>{t.signInTitle}</Text>
        <Text style={screen.center}>{t.signInLead}</Text>
      </Card>
      <View style={screen.signInActions}>
        <Pressable onPress={signIn} accessibilityRole="button" style={screen.google}>
          <Text style={screen.googleG}>G</Text>
          <Text style={screen.googleText}>{t.google}</Text>
        </Pressable>
        {failed && <Text style={screen.error}>{t.signInFailed}</Text>}
      </View>
    </View>
  );
}

function BusinessStep({ draft, update, t }: StepProps) {
  const phoneError = draft.phone && toE164(draft.phone) === null ? t.phoneHint : null;
  return (
    <>
      <Title title={t.businessTitle} lead={t.businessLead} />
      <View style={screen.stack}>
        <Card>
          <Field label={t.name} value={draft.name} onChangeText={(name) => update({ name })} placeholder="Ondera Coffee Farm" />
          <Field label={t.phone} value={draft.phone} onChangeText={(phone) => update({ phone })} placeholder="+254 712 345 678" keyboardType="phone-pad" error={phoneError} />
          <Field label={`${t.location} (${t.optional})`} value={draft.location} onChangeText={(location) => update({ location })} />
          <Field label={`${t.about} (${t.optional})`} value={draft.about} onChangeText={(about) => update({ about })} multiline />
        </Card>
        <Card>
          <Text style={screen.cardHeading}>{t.photos}</Text>
          <Text style={screen.centerMuted}>{t.optional}</Text>
          <View style={screen.photoBox} accessibilityLabel={t.photosLater}>
            <Text style={screen.photoIcon}>＋</Text>
            <Text style={screen.photoLabel}>{t.addPhoto}</Text>
            <Text style={screen.centerMuted}>{t.photosLater}</Text>
          </View>
        </Card>
      </View>
    </>
  );
}

function ServicesStep({ draft, update, t }: StepProps) {
  const setService = (i: number, patch: Partial<ServiceDraft>) =>
    update({ services: draft.services.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <>
      <Title title={t.servicesTitle} lead={t.servicesLead} />
      <View style={screen.stack}>
        {draft.services.map((service, i) => (
          <ServiceCard
            key={i}
            service={service}
            t={t}
            language={draft.language}
            onChange={(patch) => setService(i, patch)}
            onRemove={draft.services.length > 1 ? () => update({ services: draft.services.filter((_, j) => j !== i) }) : undefined}
          />
        ))}
        {draft.services.length < 5 && <LinkButton label={t.addService} onPress={() => update({ services: [...draft.services, emptyService()] })} />}
      </View>
    </>
  );
}

function ServiceCard({ service, t, language, onChange, onRemove }: { service: ServiceDraft; t: Strings; language: Language; onChange: (patch: Partial<ServiceDraft>) => void; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  const label = service.type === 'custom' ? t.addCustom : service.type ? SERVICE_TYPES[service.type][language] : t.selectOption;
  return (
    <View style={screen.stackTight}>
      <Card label={t.serviceType} aside={onRemove ? undefined : undefined}>
        <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={[screen.select, open && screen.selectOpen]}>
          <Text style={[screen.selectText, !service.type && screen.placeholder]}>{label}</Text>
          <Text style={screen.chevron}>{open ? '⌃' : '⌄'}</Text>
        </Pressable>
        {open && (
          <View style={screen.menu}>
            {[...(Object.keys(SERVICE_TYPES) as (keyof typeof SERVICE_TYPES)[]), 'custom' as const].map((type, i) => {
              const on = service.type === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => {
                    onChange({ type });
                    setOpen(false);
                  }}
                  accessibilityRole="menuitem"
                  style={[screen.menuRow, i > 0 && screen.listDivider, on && screen.menuRowOn]}
                >
                  <Text style={[screen.menuText, type === 'custom' && screen.menuCustom]}>{type === 'custom' ? `${t.addCustom} +` : SERVICE_TYPES[type][language]}</Text>
                  {on && <Text style={screen.check}>✓</Text>}
                </Pressable>
              );
            })}
          </View>
        )}
        {service.type === 'custom' && <Field label={t.customName} value={service.customName} onChangeText={(customName) => onChange({ customName })} />}
        <Field label={`${t.serviceAbout} (${t.optional})`} value={service.about} onChangeText={(about) => onChange({ about })} multiline />
      </Card>
      <Card label={t.duration} aside={formatDuration(Number(service.hours || 0) * 60 + Number(service.minutes || 0), language)}>
        <View style={screen.split}>
          <Field value={service.hours} onChangeText={(hours) => onChange({ hours: hours.replace(/\D/g, '') })} keyboardType="number-pad" style={screen.centered} placeholder={t.hr} />
          <Field value={service.minutes} onChangeText={(minutes) => onChange({ minutes: minutes.replace(/\D/g, '') })} keyboardType="number-pad" style={screen.centered} placeholder={t.min} />
        </View>
      </Card>
      <Card>
        <View style={screen.split}>
          <View style={screen.half}>
            <Text style={screen.miniLabel}>{t.price}</Text>
            <Field value={service.price} onChangeText={(price) => onChange({ price: price.replace(/[^\d]/g, '') })} keyboardType="number-pad" placeholder="KES 1500" />
          </View>
          <View style={screen.half}>
            <Text style={screen.miniLabel}>{t.capacity}</Text>
            <Field value={service.capacity} onChangeText={(capacity) => onChange({ capacity: capacity.replace(/\D/g, '') })} keyboardType="number-pad" placeholder={t.clients} />
          </View>
        </View>
        {onRemove && (
          <Pressable onPress={onRemove} accessibilityRole="button" style={screen.remove}>
            <Text style={screen.removeText}>{t.removeService}</Text>
          </Pressable>
        )}
      </Card>
    </View>
  );
}

function AvailabilityStep({ draft, update, t }: StepProps) {
  const toggle = (day: Day) => update({ days: draft.days.includes(day) ? draft.days.filter((d) => d !== day) : [...draft.days, day] });
  const setSlot = (i: number, patch: Partial<{ start: string; end: string }>) =>
    update({ slots: draft.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <>
      <Title title={t.availabilityTitle} lead={t.availabilityLead} />
      <View style={screen.stack}>
        <Card>
          <Text style={screen.cardHeading}>{t.days}</Text>
          <Text style={screen.hint}>{t.daysHint}</Text>
          <View style={screen.days}>
            {DAY_ORDER.map((day, i) => {
              const on = draft.days.includes(day);
              return (
                <Pressable key={day} onPress={() => toggle(day)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={DAYS[day][draft.language]} style={[screen.day, on && screen.dayOn]}>
                  <Text style={[screen.dayText, on && screen.dayTextOn]}>{DAY_LETTERS[draft.language][i]}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
        <Card label={t.slots} aside={t.regularHours}>
          {draft.slots.map((slot, i) => (
            <View key={i} style={screen.slotRow}>
              <Field value={slot.start} onChangeText={(start) => setSlot(i, { start })} placeholder="09:00" style={screen.centered} maxLength={5} />
              <Text style={screen.dash}>–</Text>
              <Field value={slot.end} onChangeText={(end) => setSlot(i, { end })} placeholder="10:30" style={screen.centered} maxLength={5} />
              <Pressable onPress={() => update({ slots: draft.slots.filter((_, j) => j !== i) })} accessibilityRole="button" accessibilityLabel="Remove" style={screen.slotRemove}>
                <Text style={screen.slotRemoveText}>×</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={() => update({ slots: [...draft.slots, { start: '', end: '' }] })} accessibilityRole="button" style={screen.addSlot}>
            <Text style={screen.addSlotText}>+ {t.addSlot}</Text>
          </Pressable>
          <Text style={screen.hint}>{t.slotHint}</Text>
        </Card>
      </View>
    </>
  );
}

// The review step builds the site in the development setup's model services (EXPO_PUBLIC_TRANSLATOR_URL
// and EXPO_PUBLIC_WEBSITE_MODEL_URL) and shows the preview.
function ReviewStep({ draft, t }: { draft: Draft; t: Strings }) {
  const [state, setState] = useState<{ status: 'ready' } | { status: 'building' } | { status: 'built'; html: string } | { status: 'failed' }>({ status: 'ready' });
  const survey = toSurvey(draft);
  const create = async () => {
    if (!survey || !TRANSLATOR_URL || !REMOTE_WEBSITE_MODEL_URL) return setState({ status: 'failed' });
    setState({ status: 'building' });
    try {
      const result = await buildSite(survey, { translate: remoteTranslator(TRANSLATOR_URL), generate: remoteJsonCompletion(REMOTE_WEBSITE_MODEL_URL) });
      setState({ status: 'built', html: result.html });
    } catch {
      setState({ status: 'failed' });
    }
  };
  useEffect(() => {
    if (SCRIPTED) {
      const timer = setTimeout(create, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (state.status === 'built') {
    return (
      <>
        <Title title={t.created} />
        <View style={screen.preview}>
          <WebView source={{ html: state.html }} originWhitelist={['*']} javaScriptEnabled={false} accessibilityLabel={t.created} />
        </View>
      </>
    );
  }
  return (
    <>
      <Title title={t.reviewTitle} lead={t.reviewLead} />
      <View style={screen.stack}>
        <Card>
          <Text style={screen.businessName}>{draft.name}</Text>
          <Text style={screen.hint}>{toE164(draft.phone) ?? draft.phone}</Text>
        </Card>
        <Card>
          {[t.servicesDone, t.scheduleDone, t.contactDone].map((line) => (
            <View key={line} style={screen.checkRow}>
              <Text style={screen.check}>✓</Text>
              <Text style={screen.checkText}>{line}</Text>
            </View>
          ))}
        </Card>
        {state.status === 'building' ? (
          <View style={screen.building}>
            <ActivityIndicator color={theme.green} />
            <Text style={screen.hint}>{t.creating}</Text>
          </View>
        ) : (
          <>
            <PrimaryButton label={state.status === 'failed' ? t.tryAgain : t.create} onPress={create} disabled={!survey} />
            {state.status === 'failed' && <Text style={screen.error}>{t.createFailed}</Text>}
          </>
        )}
      </View>
    </>
  );
}

const screen = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.field },
  content: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  footer: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: theme.field },
  stack: { gap: 14 },
  stackTight: { gap: 10 },
  list: { backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.line, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 64 },
  listRowOn: { backgroundColor: '#f7f6f2' },
  listDivider: { borderTopWidth: 1, borderTopColor: theme.line },
  code: { width: 36, fontSize: 13, fontWeight: '700', color: theme.muted, borderWidth: 1, borderColor: theme.line, borderRadius: 4, textAlign: 'center', paddingVertical: 2 },
  listText: { flex: 1 },
  listLabel: { fontSize: 17, fontWeight: '600', color: theme.ink },
  check: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.green, color: '#fff', textAlign: 'center', lineHeight: 24, fontSize: 14, fontWeight: '700' },
  signIn: { flex: 1, justifyContent: 'space-between', gap: 24, paddingTop: 120 },
  signInTitle: { fontFamily: theme.serif, fontSize: 26, textAlign: 'center', color: theme.ink },
  signInActions: { gap: 10, paddingBottom: 24 },
  center: { fontSize: 15, lineHeight: 21, textAlign: 'center', color: theme.muted },
  centerMuted: { fontSize: 13, textAlign: 'center', color: theme.muted },
  google: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  googleG: { fontSize: 18, fontWeight: '800', color: '#4285F4' },
  googleText: { fontSize: 16, fontWeight: '600', color: theme.ink },
  cardHeading: { fontSize: 16, fontWeight: '600', textAlign: 'center', color: theme.ink },
  photoBox: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#c9c4b8', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 6 },
  photoIcon: { fontSize: 24, color: theme.muted },
  photoLabel: { fontSize: 15, fontWeight: '600', color: theme.ink },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 14, backgroundColor: theme.card },
  selectOpen: { borderColor: theme.green, borderWidth: 1.5 },
  selectText: { fontSize: 16, color: theme.ink },
  placeholder: { color: '#8b918d' },
  chevron: { fontSize: 18, color: theme.muted },
  menu: { borderWidth: 1, borderColor: theme.line, borderRadius: 10, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 14 },
  menuRowOn: { backgroundColor: theme.greenSoft },
  menuText: { fontSize: 15, color: theme.ink },
  menuCustom: { color: theme.green, fontWeight: '600' },
  split: { flexDirection: 'row', gap: 10 },
  half: { flex: 1, gap: 6 },
  miniLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: theme.muted, textTransform: 'uppercase' },
  centered: { textAlign: 'center', flex: 1 },
  remove: { alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center' },
  removeText: { fontSize: 14, color: theme.danger },
  hint: { fontSize: 13, color: theme.muted },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  day: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: theme.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f6f2' },
  dayOn: { backgroundColor: theme.green, borderColor: theme.green },
  dayText: { fontSize: 12, fontWeight: '700', color: theme.muted },
  dayTextOn: { color: '#fff' },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dash: { fontSize: 16, color: theme.muted },
  slotRemove: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  slotRemoveText: { fontSize: 22, color: theme.muted },
  addSlot: { minHeight: 48, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#c9c4b8', alignItems: 'center', justifyContent: 'center' },
  addSlotText: { fontSize: 15, fontWeight: '600', color: theme.green },
  businessName: { fontSize: 18, fontWeight: '600', color: theme.ink },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  checkText: { fontSize: 15, color: theme.ink },
  building: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  error: { fontSize: 14, color: theme.danger, textAlign: 'center' },
  preview: { height: 620, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: theme.line },
});
