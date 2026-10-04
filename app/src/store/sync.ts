import { ActionsResponse, SyncResponse, type Action } from '@wren/contracts';

import type { LocalStore } from './localStore';

// Moves approved actions from the outbox to the backend and pulls changed records back.
// The backend runs each action ID at most once, so a resend after a lost response is safe.

export type Transport = {
  postActions(actions: Action[]): Promise<unknown>;
  getChanges(since: string | null): Promise<unknown>;
};

export function httpTransport(baseUrl: string, deviceToken: () => Promise<string | null>): Transport {
  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const token = await deviceToken();
    if (!token) throw new Error('This phone is not connected to the backend yet.');
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
    });
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    return response.json();
  }
  return {
    postActions: (actions) => request('/api/actions', { method: 'POST', body: JSON.stringify({ actions }) }),
    getChanges: (since) => request(since ? `/api/sync?since=${encodeURIComponent(since)}` : '/api/sync'),
  };
}

export const LAST_SYNC_KEY = 'last_sync_at';
const BATCH_SIZE = 50;

export type SyncResult = { sent: number; pulled: number; error: string | null };

export async function syncOnce(store: LocalStore, transport: Transport): Promise<SyncResult> {
  let sent = 0;
  try {
    for (let batch = store.queued(BATCH_SIZE); batch.length > 0; batch = store.queued(BATCH_SIZE)) {
      const ids = batch.map((entry) => entry.id);
      let receipts;
      try {
        receipts = ActionsResponse.parse(await transport.postActions(batch.map((entry) => entry.action))).receipts;
      } catch (error) {
        store.recordAttemptFailed(ids, message(error));
        throw error;
      }
      receipts.forEach((receipt) => store.recordReceipt(receipt));
      // A batch the backend answered without a receipt for every entry would loop forever.
      const answered = new Set(receipts.map((receipt) => receipt.id));
      const unanswered = ids.filter((id) => !answered.has(id));
      if (unanswered.length > 0) {
        store.recordAttemptFailed(unanswered, 'The backend returned no receipt for this action.');
        throw new Error(`${unanswered.length} actions got no receipt`);
      }
      sent += batch.length;
    }

    const changes = SyncResponse.parse(await transport.getChanges(store.getMeta(LAST_SYNC_KEY)));
    changes.messages.forEach((record) => store.upsert('Messages', record));
    changes.enquiries.forEach((record) => store.upsert('Enquiries', record));
    changes.bookings.forEach((record) => store.upsert('Bookings', record));
    if (changes.profile) store.upsert('Farm', changes.profile);
    store.setMeta(LAST_SYNC_KEY, changes.server_time);
    const pulled = changes.messages.length + changes.enquiries.length + changes.bookings.length + (changes.profile ? 1 : 0);
    return { sent, pulled, error: null };
  } catch (error) {
    return { sent, pulled: 0, error: message(error) };
  }
}

// Retries on a timer instead of watching network state: a failed attempt costs one request,
// and the queue drains within one interval of the phone getting a signal.
export function startSyncLoop(
  store: LocalStore,
  transport: Transport,
  onResult: (result: SyncResult) => void,
  intervalMs = 30_000,
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      onResult(await syncOnce(store, transport));
    } finally {
      running = false;
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
