import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CalendarCredentials,
  CalendarPollingConfig,
  NormalizedEvent,
  RawAttendee,
} from '../../types/calendar';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockEventsList = vi.fn();
const mockOAuth2Client = {
  setCredentials: vi.fn(),
  on: vi.fn(),
  refreshAccessToken: vi.fn().mockResolvedValue({
    credentials: {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expiry_date: Date.now() + 3600 * 1000,
    },
  }),
};

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => mockOAuth2Client),
    },
    calendar: vi.fn().mockReturnValue({
      events: { list: mockEventsList },
    }),
  },
}));

const mockGraphGet = vi.fn();
vi.mock('@microsoft/microsoft-graph-client', () => ({
  Client: {
    initWithMiddleware: vi.fn().mockReturnValue({
      api: vi.fn().mockReturnValue({
        filter: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        top: vi.fn().mockReturnThis(),
        get: mockGraphGet,
      }),
    }),
  },
}));

vi.mock('@azure/msal-node', () => ({
  ConfidentialClientApplication: vi.fn().mockImplementation(() => ({
    acquireTokenByRefreshToken: vi.fn().mockResolvedValue({
      accessToken: 'new-outlook-token',
      expiresOn: new Date(Date.now() + 3600 * 1000),
    }),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

// We import internal helpers through the service module
import { calendarIntegrationService } from '../../services/calendarIntegrationService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function freshCredentials(
  provider: 'google' | 'outlook' = 'google'
): CalendarCredentials {
  return {
    provider,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    tokenExpiry: new Date(Date.now() + 3600 * 1000), // 1hr from now
    userId: 'user-1',
  };
}

const pollingConfig: CalendarPollingConfig = {
  windowMinutes: 15,
  maxResults: 10,
  cronSchedule: '*/5 * * * *',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('calendarIntegrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Google Calendar ────────────────────────────────────────────────────────

  describe('getUpcomingMeetings (Google)', () => {
    it('returns empty array when no events exist', async () => {
      mockEventsList.mockResolvedValueOnce({ data: { items: [] } });

      const meetings = await calendarIntegrationService.getUpcomingMeetings(
        freshCredentials('google'),
        pollingConfig
      );

      expect(meetings).toEqual([]);
    });

    it('normalizes a standard Google event into a Meeting', async () => {
      const now = new Date();
      const start = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      const end = new Date(now.getTime() + 35 * 60 * 1000).toISOString();

      mockEventsList.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'goog-event-1',
              summary: 'Weekly Sync',
              status: 'confirmed',
              start: { dateTime: start, timeZone: 'America/Los_Angeles' },
              end: { dateTime: end, timeZone: 'America/Los_Angeles' },
              attendees: [
                {
                  email: 'alice@example.com',
                  displayName: 'Alice',
                  responseStatus: 'accepted',
                  organizer: true,
                },
                {
                  email: 'bob@example.com',
                  displayName: 'Bob',
                  responseStatus: 'needsAction',
                  organizer: false,
                },
              ],
              organizer: { email: 'alice@example.com', displayName: 'Alice' },
            },
          ],
        },
      });

      const meetings = await calendarIntegrationService.getUpcomingMeetings(
        freshCredentials('google'),
        pollingConfig
      );

      expect(meetings).toHaveLength(1);
      const meeting = meetings[0];
      expect(meeting.title).toBe('Weekly Sync');
      expect(meeting.provider).toBe('google');
      expect(meeting.externalId).toBe('goog-event-1');
      expect(meeting.durationMinutes).toBe(30);
      expect(meeting.attendees).toHaveLength(2);
      expect(meeting.organizer.email).toBe('alice@example.com');
      expect(meeting.organizer.isOrganizer).toBe(true);
    });

    it('filters out cancelled Google events', async () => {
      const now = new Date();
      const start = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      const end = new Date(now.getTime() + 35 * 60 * 1000).toISOString();

      mockEventsList.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'cancelled-event',
              summary: 'Cancelled Meeting',
              status: 'cancelled',
              start: { dateTime: start },
              end: { dateTime: end },
              attendees: [],
            },
          ],
        },
      });

      const meetings = await calendarIntegrationService.getUpcomingMeetings(
        freshCredentials('google'),
        pollingConfig
      );

      expect(meetings).toHaveLength(0);
    });

    it('handles recurring Google events correctly', async () => {
      const now = new Date();
      const start = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      const end = new Date(now.getTime() + 65 * 60 * 1000).toISOString();

      mockEventsList.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'recurring-instance-1',
              summary: 'Daily Standup',
              status: 'confirmed',
              recurringEventId: 'recurring-master',
              start: { dateTime: start, timeZone: 'UTC' },
              end: { dateTime: end, timeZone: 'UTC' },
              attendees: [],
            },
          ],
        },
      });

      const meetings = await calendarIntegrationService.getUpcomingMeetings(
        freshCredentials('google'),
        pollingConfig
      );

      expect(meetings).toHaveLength(1);
      expect(meetings[0].isRecurring).toBe(true);
      expect(meetings[0].recurringEventId).toBe('recurring-master');
    });

    it('retries on transient errors with exponential backoff', async () => {
      mockEventsList
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce({ data: { items: [] } });

      const meetings = await calendarIntegrationService.getUpcomingMeetings(
        freshCredentials('google'),
        pollingConfig
      );

      expect(meetings).toEqual([]);
      expect(mockEventsList).toHaveBeenCalledTimes(3);
    }, 15000);

    it('throws after exceeding max retries', async () => {
      mockEventsList.mockRejectedValue(new Error('Persistent error'));

      await expect(
        calendarIntegrationService.getUpcomingMeetings(
          freshCredentials('google'),
          pollingConfig
        )
      ).rejects.toThrow('Persistent error');
    }, 30000);
  });

  // ── Outlook Calendar ───────────────────────────────────────────────────────

  describe('getUpcomingMeetings (Outlook)', () => {
    it('returns empty array when no Outlook events exist', async () => {
      mockGraphGet.mockResolvedValueOnce({ value: [] });

      const meetings = await calendarIntegrationService.getUpcomingMeetings(
        freshCredentials('outlook'),
        pollingConfig
      );

      expect(meetings).toEqual([]);
    });

    it('normalizes a standard Outlook event into a Meeting', async () => {
      const now = new Date();
      const start = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      const end = new Date(now.getTime() + 65 * 60 * 1000).toISOString();

      mockGraphGet.mockResolvedValueOnce({
        value: [
          {
            id: 'outlook-event-1',
            subject: 'Product Review',
            type: 'singleInstance',
            isCancelled: false,
            start: { dateTime: start, timeZone: 'UTC' },
            end: { dateTime: end, timeZone: 'UTC' },
            attendees: [
              {
                emailAddress: { address: 'charlie@example.com', name: 'Charlie' },
                status: { response: 'accepted' },
              },
            ],
            organizer: {
              emailAddress: { address: 'charlie@example.com', name: 'Charlie' },
            },
          },
        ],
      });

      const meetings = await calendarIntegrationService.getUpcomingMeetings(
        freshCredentials('outlook'),
        pollingConfig
      );

      expect(meetings).toHaveLength(1);
      const meeting = meetings[0];
      expect(meeting.title).toBe('Product Review');
      expect(meeting.provider).toBe('outlook');
      expect(meeting.durationMinutes).toBe(60);
      expect(meeting.organizer.email).toBe('charlie@example.com');
    });

    it('filters out cancelled Outlook events', async () => {
      const now = new Date();
      mockGraphGet.mockResolvedValueOnce({
        value: [
          {
            id: 'cancelled-outlook',
            subject: 'Cancelled',
            type: 'singleInstance',
            isCancelled: true,
            start: { dateTime: new Date(now.getTime() + 5 * 60 * 1000).toISOString(), timeZone: 'UTC' },
            end: { dateTime: new Date(now.getTime() + 35 * 60 * 1000).toISOString(), timeZone: 'UTC' },
            attendees: [],
          },
        ],
      });

      const meetings = await calendarIntegrationService.getUpcomingMeetings(
        freshCredentials('outlook'),
        pollingConfig
      );

      expect(meetings).toHaveLength(0);
    });

    it('filters out Outlook seriesMaster events', async () => {
      const now = new Date();
      mockGraphGet.mockResolvedValueOnce({
        value: [
          {
            id: 'series-master',
            subject: 'Weekly Recurring',
            type: 'seriesMaster',
            isCancelled: false,
            start: { dateTime: new Date(now.getTime() + 5 * 60 * 1000).toISOString(), timeZone: 'UTC' },
            end: { dateTime: new Date(now.getTime() + 35 * 60 * 1000).toISOString(), timeZone: 'UTC' },
            attendees: [],
          },
        ],
      });

      const meetings = await calendarIntegrationService.getUpcomingMeetings(
        freshCredentials('outlook'),
        pollingConfig
      );

      expect(meetings).toHaveLength(0);
    });
  });

  // ── Timezone normalization ─────────────────────────────────────────────────

  describe('normalizeTimezone', () => {
    it('converts a datetime with explicit timezone to UTC Date', () => {
      const result = calendarIntegrationService.normalizeTimezone(
        '2026-03-31T14:00:00',
        'America/New_York'
      );
      expect(result).toBeInstanceOf(Date);
      // 14:00 EDT (UTC-4) = 18:00 UTC
      expect(result.getUTCHours()).toBe(18);
    });

    it('handles ISO string without explicit timezone arg', () => {
      const result = calendarIntegrationService.normalizeTimezone(
        '2026-03-31T18:00:00Z'
      );
      expect(result).toBeInstanceOf(Date);
      expect(result.getUTCHours()).toBe(18);
    });

    it('handles UTC timezone', () => {
      const result = calendarIntegrationService.normalizeTimezone(
        '2026-04-01T10:00:00',
        'UTC'
      );
      expect(result.getUTCHours()).toBe(10);
    });
  });

  // ── Attendee matching ──────────────────────────────────────────────────────

  describe('matchAttendees', () => {
    it('matches attendees and returns results with internalUser stubs', async () => {
      const attendees: RawAttendee[] = [
        { email: 'alice@example.com', name: 'Alice', responseStatus: 'accepted', isOrganizer: true },
        { email: 'bob@example.com', name: 'Bob', responseStatus: 'needsAction', isOrganizer: false },
      ];

      const results = await calendarIntegrationService.matchAttendees(attendees);

      expect(results).toHaveLength(2);
      expect(results[0].matched).toBe(true);
      expect(results[0].internalUser?.email).toBe('alice@example.com');
      expect(results[1].matched).toBe(true);
      expect(results[1].internalUser?.email).toBe('bob@example.com');
    });

    it('handles empty attendee list', async () => {
      const results = await calendarIntegrationService.matchAttendees([]);
      expect(results).toEqual([]);
    });
  });

  // ── Token refresh ──────────────────────────────────────────────────────────

  describe('refreshCredentials', () => {
    it('returns same credentials when token is still valid', async () => {
      const creds = freshCredentials('google');
      const result = await calendarIntegrationService.refreshCredentials(creds);
      // Token is not expired, so no refresh should happen
      expect(result.accessToken).toBe(creds.accessToken);
    });

    it('refreshes expired Google credentials', async () => {
      const expiredCreds: CalendarCredentials = {
        ...freshCredentials('google'),
        tokenExpiry: new Date(Date.now() - 1000), // expired
      };

      const result = await calendarIntegrationService.refreshCredentials(expiredCreds);
      expect(result.accessToken).toBe('new-access-token');
      expect(result.tokenExpiry.getTime()).toBeGreaterThan(Date.now());
    });

    it('refreshes expired Outlook credentials', async () => {
      const expiredCreds: CalendarCredentials = {
        ...freshCredentials('outlook'),
        tokenExpiry: new Date(Date.now() - 1000), // expired
      };

      const result = await calendarIntegrationService.refreshCredentials(expiredCreds);
      expect(result.accessToken).toBe('new-outlook-token');
    });
  });

  // ── Unsupported provider ───────────────────────────────────────────────────

  it('throws for unsupported calendar provider', async () => {
    const badCreds = {
      ...freshCredentials(),
      provider: 'yahoo' as 'google',
    };

    await expect(
      calendarIntegrationService.getUpcomingMeetings(badCreds, pollingConfig)
    ).rejects.toThrow('Unsupported calendar provider');
  });
});
