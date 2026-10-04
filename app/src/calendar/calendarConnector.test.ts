/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { CalendarConnector, GOOGLE_CALENDAR_SCOPE } from './calendarConnector';

describe('CalendarConnector', () => {
  test('requests the app-created-calendar scope and creates Wren tours in the requested time zone', async () => {
    const calls: unknown[] = [];
    const connector = new CalendarConnector(
      {
        hasPreviousSignIn: () => true,
        signIn: async () => null,
        getCurrentUser: () => null,
        addScopes: async (params) => { calls.push(['scope', params]); },
        getTokens: async () => ({ accessToken: 'test-token' }),
      },
      async (url, init) => {
        calls.push([url, init]);
        return Response.json({ id: 'calendar-123', summary: 'Wren tours', timeZone: 'Africa/Nairobi' });
      },
    );

    await expect(connector.createWrenCalendar('Africa/Nairobi')).resolves.toEqual({
      id: 'calendar-123', summary: 'Wren tours', timeZone: 'Africa/Nairobi',
    });
    expect(calls[0]).toEqual(['scope', { scopes: [GOOGLE_CALENDAR_SCOPE] }]);
    expect(calls[1]).toMatchObject([
      'https://www.googleapis.com/calendar/v3/calendars',
      { method: 'POST', body: JSON.stringify({ summary: 'Wren tours', timeZone: 'Africa/Nairobi' }) },
    ]);
  });

  test('does not call Google without a time zone', async () => {
    let requested = false;
    const connector = new CalendarConnector(
      { hasPreviousSignIn: () => true, signIn: async () => null, getCurrentUser: () => null, addScopes: async () => null, getTokens: async () => ({ accessToken: 'test-token' }) },
      async () => { requested = true; return Response.json({}); },
    );

    await expect(connector.createWrenCalendar(' ')).rejects.toThrow('A time zone is required');
    expect(requested).toBe(false);
  });
});
