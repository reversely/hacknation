import { z } from 'zod';

import { FarmProfile, Timestamp } from './records';

// The two shapes still read by the setup wizard's connection checks (app/src/setup/steps.ts) and
// the Website Creator (app/src/agent/websiteCreator.ts, website/). The Vercel routes that served
// them leave with #19.

// GET /api/health: the setup wizard's connection check for each hosted service.
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
