import type { AgentName } from './harness';

// The coordinator delegates by fixed rules rather than by model choice, so a message cannot
// talk its way to a different agent and that agent's tools (docs/architecture.md section 3).
export type CoordinatorEvent =
  | { kind: 'setup_step'; step: 'website' | 'listings' }
  | { kind: 'inbound_message'; channel: 'WHATSAPP' | 'EMAIL' }
  | { kind: 'weekly_review' }
  | { kind: 'operator_chat' };

export function routeEvent(event: CoordinatorEvent): AgentName {
  switch (event.kind) {
    case 'setup_step':
      return event.step === 'website' ? 'website_creator' : 'search_social';
    case 'inbound_message':
    case 'weekly_review':
      return 'customer_management';
    case 'operator_chat':
      return 'coordinator';
  }
}
