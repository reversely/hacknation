// The scripted demonstration inputs, shared by the cache warmer and the page's walk-through, so a
// replay of these exact inputs is answered from the cache (docs/space.md, Caching).

export const DEMO_SURVEY = {
  language: 'sw' as 'sw' | 'en',
  business: {
    name: 'Shamba la Ondera',
    phone: '+254712345678',
    location: 'Karibu na soko la Ondera',
    description: 'Tunalima kahawa na kuwakaribisha wageni shambani.',
  },
  photos: [] as string[],
  services: [
    {
      type: 'guided_tour' as const,
      description: 'Matembezi ya kahawa kuanzia kuchuma hadi kikombe.',
      duration_minutes: 120,
      price: { amount: 1500, currency: 'KES' },
      capacity: 6,
    },
  ],
  availability: { days: ['saturday', 'sunday'] as ('saturday' | 'sunday')[], slots: [{ start: '09:00', end: '10:30' }] },
};

export const DEMO_QUESTION = 'Is the coffee walk suitable for children?';
export const DEMO_REVIEW = 'We loved the coffee walk and the fresh coffee at the end!';

// What the walkthrough's "Show me" enters on the visitor's side, per site language. A question the
// site's facts cannot answer shows the hand-over to the operator.
export const DEMO_VISITOR = {
  sw: { name: 'Amina', people: 3, review: 'Tulifurahia sana matembezi ya kahawa na kahawa safi mwishoni!', reviewName: 'Juma', unknown: 'Je, kuna maegesho ya magari?' },
  en: { name: 'Amina', people: 3, review: DEMO_REVIEW, reviewName: 'Tom', unknown: 'Is there parking for cars?' },
} as const;
