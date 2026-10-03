import { GoogleSignin } from '@react-native-google-signin/google-signin';

export const GOOGLE_IOS_CLIENT_ID = '849769214373-ueq44o1a0qv8lrr0eghoihtln5cskbru.apps.googleusercontent.com';
export const GOOGLE_WEB_CLIENT_ID = '849769214373-iral58qsu8cjkk37bb7ccfp8lj65k7rd.apps.googleusercontent.com';
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
] as const;

GoogleSignin.configure({ iosClientId: GOOGLE_IOS_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID, scopes: [...GMAIL_SCOPES] });

type Tokens = { accessToken: string };
type Message = {
  id: string; threadId: string; internalDate?: string; snippet?: string;
  payload?: { mimeType?: string; headers?: Array<{ name: string; value: string }>;
    body?: { data?: string }; parts?: Message['payload'][] };
};
export type GmailEnquiry = { id: string; threadId: string; from: string; subject: string; receivedAt: string | null; text: string };
type Auth = Pick<typeof GoogleSignin, 'hasPreviousSignIn' | 'signInSilently' | 'signIn' | 'getTokens'>;
const apiRoot = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Tokens are used only to authorize fetch calls and never appear in connector results/errors. */
export class GmailConnector {
  constructor(private readonly auth: Auth = GoogleSignin, private readonly fetcher: typeof fetch = fetch) {}

  async connect(): Promise<void> {
    await this.auth.signIn();
    await this.accessToken();
  }

  async checkConnection(): Promise<{ connected: boolean; email: string | null }> {
    try {
      if (!this.auth.hasPreviousSignIn()) return { connected: false, email: null };
      await this.auth.signInSilently();
      const response = await this.api('/profile');
      const profile = await response.json() as { emailAddress?: string };
      return { connected: true, email: profile.emailAddress ?? null };
    } catch { return { connected: false, email: null }; }
  }

  async syncEnquiries(maxResults = 25): Promise<GmailEnquiry[]> {
    const limit = Math.max(1, Math.min(Math.floor(maxResults), 100));
    const response = await this.api(`/messages?q=${encodeURIComponent('is:unread -from:me')}&maxResults=${limit}`);
    const list = await response.json() as { messages?: Array<{ id: string }> };
    return Promise.all((list.messages ?? []).map(async ({ id }) => {
      const item = await this.api(`/messages/${encodeURIComponent(id)}?format=full`);
      return toEnquiry(await item.json() as Message);
    }));
  }

  async sendReply(input: { to: string; subject: string; text: string; threadId?: string }): Promise<{ id: string; threadId: string | null }> {
    if (!input.to.trim() || !input.subject.trim() || !input.text.trim()) throw new Error('Recipient, subject and reply text are required.');
    const raw = encode64url(`To: ${cleanHeader(input.to)}\r\nSubject: ${cleanHeader(input.subject)}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${input.text}`);
    const response = await this.api('/messages/send', { method: 'POST', body: JSON.stringify({ raw, ...(input.threadId ? { threadId: input.threadId } : {}) }) });
    const sent = await response.json() as { id: string; threadId?: string };
    return { id: sent.id, threadId: sent.threadId ?? null };
  }

  private async accessToken(): Promise<string> {
    try {
      const { accessToken } = await this.auth.getTokens();
      if (accessToken) return accessToken;
    } catch { /* Replace provider details with a safe, actionable message. */ }
    throw new Error('Google authorization expired. Reconnect the Gmail account.');
  }

  private async api(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    let response: Response;
    try {
      response = await this.fetcher(`${apiRoot}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
    } catch { throw new Error('Gmail request failed. Check the network connection and try again.'); }
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
      ? 'Gmail authorization failed. Reconnect the account and check its permissions.'
      : `Gmail request failed (HTTP ${response.status}).`);
    return response;
  }
}

function toEnquiry(message: Message): GmailEnquiry {
  const headers = message.payload?.headers ?? [];
  const get = (key: string) => headers.find((h) => h.name.toLowerCase() === key)?.value ?? '';
  return { id: message.id, threadId: message.threadId, from: get('from'), subject: get('subject'),
    receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
    text: plainText(message.payload) ?? message.snippet ?? '' };
}
function plainText(part: Message['payload']): string | null {
  if (!part) return null;
  if (part.mimeType === 'text/plain' && part.body?.data) {
    const normalized = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
    return new TextDecoder().decode(Uint8Array.from(globalThis.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')), (c) => c.charCodeAt(0)));
  }
  for (const child of part.parts ?? []) { const text = plainText(child); if (text !== null) return text; }
  return null;
}
function cleanHeader(value: string): string { return value.replace(/[\r\n]/g, ''); }
function encode64url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = ''; bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
