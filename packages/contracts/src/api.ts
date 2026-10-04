import { z } from 'zod';

import { FarmProfile, Timestamp } from './records';

// Public shapes shared with the Website Creator and Apps Script renderer. The earlier Vercel
// routes have been removed; Google and Apps Script now own website data and serving.
export const HealthResponse = z.object({
  server_time: Timestamp,
  services: z.object({
    sheets: z.enum(['OK', 'NOT_CONFIGURED', 'FAILED']),
    calendar: z.enum(['OK', 'NOT_CONFIGURED', 'FAILED']),
    whatsapp: z.enum(['OK', 'NOT_CONFIGURED', 'FAILED']),
  }),
});

// GET /api/profile: public, unauthenticated. Only approved public fields; never contacts
// of visitors, spreadsheet IDs or credentials.
export const PublicProfileResponse = FarmProfile.pick({
  name: true,
  description: true,
  offerings: true,
  meeting_instructions: true,
  policies: true,
  whatsapp_number: true,
  version: true,
});

export type HealthResponse = z.infer<typeof HealthResponse>;
export type PublicProfileResponse = z.infer<typeof PublicProfileResponse>;
