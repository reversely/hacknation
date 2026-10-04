import { expect, test } from 'bun:test';
import { unsupported } from './prompts';

const facts = 'Business: Shamba la Ondera.\nExperience: Guided tour. Lasts 2 hours. Costs KES 1500 per person.\nOpen days: Saturday and Sunday.\nLocation: Near the Ondera market.';

test('an answer about something the facts never mention is unsupported', () => {
  expect(unsupported('Is there parking for cars?', "No, we don't have parking facilities.", facts)).toBe(true);
});

test('answers drawn from the facts pass', () => {
  expect(unsupported('How long is the tour?', 'The tour lasts for 2 hours.', facts)).toBe(false);
  expect(unsupported('How much does it cost?', 'It costs KES 1500 per person.', facts)).toBe(false);
  expect(unsupported('Which days are you open?', 'We are open on Saturdays and Sundays.', facts)).toBe(false);
  expect(unsupported('Where are you?', 'We are located near the Ondera market.', facts)).toBe(false);
});
