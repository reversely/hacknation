/// <reference types="bun" />
import { expect, mock, test } from 'bun:test';

// The screen module imports native modules and reads React Native's __DEV__; the test needs only
// its pure helpers.
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
mock.module('@react-native-google-signin/google-signin', () => ({ GoogleSignin: {} }));
mock.module('react-native-webview', () => ({ WebView: () => null }));
mock.module('react-native', () => ({ StyleSheet: { create: (s: object) => s }, Platform: { select: (o: { default: unknown }) => o.default, OS: 'ios' }, View: null, Text: null, Pressable: null, ScrollView: null, TextInput: null, ActivityIndicator: null, KeyboardAvoidingView: null }));
const { toE164, toSurvey } = await import('./SurveyScreen');

const draft = {
  language: 'sw' as const,
  name: 'Ondera Coffee Farm',
  phone: '0712 345 678',
  location: '',
  about: '',
  services: [{ type: 'guided_tour' as const, customName: '', about: '', hours: '1', minutes: '30', price: '1500', capacity: '8' }],
  days: ['sunday' as const, 'saturday' as const],
  slots: [{ start: '09:00', end: '11:00' }],
};

test('screen answers become a valid survey', () => {
  expect(toE164('0712 345 678')).toBe('+254712345678');
  expect(toE164('+44 20 7946 0958')).toBe('+442079460958');
  expect(toE164('12345')).toBeNull();
  const survey = toSurvey(draft)!;
  expect(survey.business.phone).toBe('+254712345678');
  expect(survey.services[0]).toMatchObject({ duration_minutes: 90, price: { amount: 1500, currency: 'KES' }, capacity: 8 });
  // Days are kept in week order whatever order they were tapped in.
  expect(survey.availability.days).toEqual(['saturday', 'sunday']);
});

test('an unfinished service does not make a survey', () => {
  expect(toSurvey({ ...draft, services: [{ ...draft.services[0], type: null as never }] })).toBeNull();
  expect(toSurvey({ ...draft, services: [{ ...draft.services[0], type: 'custom', customName: '' }] })).toBeNull();
});
