import { PublicProfileResponse } from '@wren/contracts';

export type PublicFarmProfile = PublicProfileResponse;

export const demoProfile: PublicFarmProfile = {
  name: 'Noor Highlands Farm',
  description: {
    en: 'Spend a peaceful day learning about life on a small family farm in the Kenyan highlands.',
    sw: 'Karibu ujifunze kuhusu maisha ya shamba la familia katika nyanda za juu za Kenya.',
  },
  offerings: [
    {
      id: 'f6c8379d-6d5c-46ee-8aa0-b9ae1c496ff0',
      name: { en: 'Farm visit', sw: 'Ziara ya shamba' },
      description: { en: 'Meet the animals, walk the farm and enjoy a fresh seasonal tasting.', sw: 'Kutana na wanyama, tembea shambani na uonje vyakula vya msimu.' },
      duration_minutes: 120,
      price: { amount: 1800, currency: 'KES' },
      capacity: 8,
    },
  ],
  meeting_instructions: { en: 'We will share directions after your request.', sw: 'Tutakutumia maelekezo baada ya ombi lako.' },
  policies: { en: 'Please request a date in advance. Your visit is confirmed by Noor.', sw: 'Tafadhali omba tarehe mapema. Noor atathibitisha ziara yako.' },
  whatsapp_number: process.env.NEXT_PUBLIC_DEMO_WHATSAPP ?? '+254700000000',
  version: 0,
};

export async function getPublicProfile(): Promise<PublicFarmProfile | null> {
  if (process.env.USE_DEMO_PROFILE === 'true') return demoProfile;
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!origin) return null;
  try {
    const response = await fetch(`${origin}/api/profile`, { next: { revalidate: 60 } });
    if (!response.ok) return null;
    const parsed = PublicProfileResponse.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function whatsappLink(number: string, text: string): string {
  const digits = number.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
