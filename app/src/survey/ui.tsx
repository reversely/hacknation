import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

// The survey's visual parts, following the onboarding mockup: a warm paper field, white cards, a
// dark green primary action, serif headings and progress dots.
export const theme = {
  field: '#f3f1ea',
  card: '#ffffff',
  ink: '#1d2a23',
  muted: '#6a736d',
  line: '#e2ded4',
  green: '#22432f',
  greenSoft: '#e7eee8',
  danger: '#a3261c',
  serif: Platform.select({ ios: 'Georgia', default: 'serif' }),
} as const;

export function Header({ onBack }: { onBack?: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} disabled={!onBack} accessibilityRole="button" accessibilityLabel="Back" style={styles.headerSide}>
        {onBack ? <Text style={styles.headerIcon}>‹</Text> : null}
      </Pressable>
      <Text style={styles.wordmark} accessibilityRole="header">WREN</Text>
      <View style={styles.headerSide} />
    </View>
  );
}

export function Title({ title, lead }: { title: string; lead?: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text style={styles.title}>{title}</Text>
      {lead ? <Text style={styles.lead}>{lead}</Text> : null}
    </View>
  );
}

export function Card({ children, label, aside }: { children: ReactNode; label?: string; aside?: string }) {
  return (
    <View style={styles.card}>
      {label ? (
        <View style={styles.cardLabelRow}>
          <Text style={styles.cardLabel}>{label}</Text>
          {aside ? <Text style={styles.cardAside}>{aside}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Field({ label, hint, error, ...input }: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  return (
    <View style={styles.fieldBlock}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput placeholderTextColor="#a3a8a4" {...input} style={[styles.input, input.multiline && styles.inputTall, input.style]} accessibilityLabel={label ?? input.placeholder} />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[styles.primary, disabled && styles.disabled]}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.link}>
      <Text style={styles.linkText}>+ {label}</Text>
    </Pressable>
  );
}

export function Dots({ count, current }: { count: number; current: number }) {
  return (
    <View style={styles.dots} accessibilityLabel={`Step ${current + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dot, i === current && styles.dotOn]} />
      ))}
    </View>
  );
}

export const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 48 },
  headerSide: { width: 44, height: 44, justifyContent: 'center' },
  headerIcon: { fontSize: 34, lineHeight: 36, color: theme.ink },
  wordmark: { fontSize: 22, fontWeight: '900', letterSpacing: 2, color: theme.ink },
  titleBlock: { alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 8, marginBottom: 20 },
  title: { fontFamily: theme.serif, fontSize: 30, lineHeight: 36, textAlign: 'center', color: theme.ink },
  lead: { fontSize: 15, lineHeight: 21, textAlign: 'center', color: theme.muted },
  card: { backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.line, padding: 16, gap: 10 },
  cardLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: theme.muted, textTransform: 'uppercase' },
  cardAside: { fontSize: 13, color: theme.muted },
  fieldBlock: { gap: 6 },
  fieldLabel: { fontSize: 15, fontWeight: '600', color: theme.ink },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: theme.line, backgroundColor: '#f7f6f2', paddingHorizontal: 14, fontSize: 16, color: theme.ink },
  inputTall: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
  hint: { fontSize: 13, color: theme.muted },
  error: { fontSize: 13, color: theme.danger },
  primary: { minHeight: 52, borderRadius: 14, backgroundColor: theme.green, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  link: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  linkText: { fontSize: 15, fontWeight: '600', color: theme.green },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#cfd3cf' },
  dotOn: { backgroundColor: theme.green },
});
