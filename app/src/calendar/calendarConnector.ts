export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export type CalendarAuth = {
  hasPreviousSignIn(): boolean;
  signIn(): Promise<unknown>;
  getCurrentUser(): { scopes: string[] } | null;
  addScopes(params: { scopes: string[] }): Promise<unknown>;
  getTokens(): Promise<{ accessToken: string | null }>;
};
export type CalendarFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type CreatedCalendar = { id: string; summary: string; timeZone: string };

/** Requests the least-privilege Calendar scope and creates Wren's secondary booking calendar. */
export class CalendarConnector {
  constructor(private readonly auth: CalendarAuth, private readonly fetcher: CalendarFetch = fetch) {}

  async createWrenCalendar(timeZone: string): Promise<CreatedCalendar> {
    if (!timeZone.trim()) throw new Error('A time zone is required to create the booking calendar.');
    try {
      if (!this.auth.hasPreviousSignIn()) await this.auth.signIn();
      if (!this.auth.getCurrentUser()?.scopes.includes(GOOGLE_CALENDAR_SCOPE)) {
        await this.auth.addScopes({ scopes: [GOOGLE_CALENDAR_SCOPE] });
      }
      const { accessToken } = await this.auth.getTokens();
      if (!accessToken) throw new Error('Google authorization expired. Reconnect the Google account.');

      const response = await this.fetcher(`${CALENDAR_API}/calendars`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: 'Wren tours', timeZone }),
      });
      if (!response.ok) throw new Error(`Google Calendar could not create the booking calendar (HTTP ${response.status}).`);
      const calendar = await response.json() as CreatedCalendar;
      if (!calendar.id) throw new Error('Google Calendar created a calendar without returning its ID.');
      return calendar;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Google Calendar could not')) throw error;
      if (error instanceof Error && error.message.startsWith('Google authorization expired')) throw error;
      throw new Error('Could not connect to Google Calendar. Check authorization and network access.');
    }
  }
}
