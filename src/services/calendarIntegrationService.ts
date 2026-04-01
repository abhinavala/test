// eslint-disable-next-line @typescript-eslint/no-require-imports
const moment = require('moment-timezone') as typeof import('moment-timezone');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cron = require('node-cron') as typeof import('node-cron');
import {
  CalendarProvider,
  CalendarCredentials,
  Meeting,
  MeetingAttendee,
  NormalizedEvent,
  RawAttendee,
  UserRecord,
  AttendeeMatchResult,
  TokenRefreshResult,
  RateLimitConfig,
  CalendarPollingConfig,
} from '../types/calendar';

const DEFAULT_POLLING_CONFIG: CalendarPollingConfig = {
  windowMinutes: 15,
  maxResults: 50,
  cronSchedule: '*/5 * * * *',
};

const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG
): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === config.maxRetries) break;
      const delay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt),
        config.maxDelayMs
      );
      await sleep(delay);
    }
  }
  throw lastError;
}

function normalizeTimezone(dateTime: string, timezone?: string): Date {
  if (timezone) {
    return moment.tz(dateTime, timezone).utc().toDate();
  }
  return moment(dateTime).utc().toDate();
}

function normalizeResponseStatus(
  status: string
): MeetingAttendee['responseStatus'] {
  const map: Record<string, MeetingAttendee['responseStatus']> = {
    accepted: 'accepted',
    declined: 'declined',
    tentative: 'tentative',
    needsAction: 'needsAction',
    none: 'none',
    // Google-specific
    accepted_google: 'accepted',
    // Outlook-specific
    accept: 'accepted',
    decline: 'declined',
    tentativelyAccepted: 'tentative',
    notResponded: 'needsAction',
    organizer: 'accepted',
  };
  return map[status] ?? 'needsAction';
}

// Google Calendar integration
async function fetchGoogleEvents(
  credentials: CalendarCredentials,
  config: CalendarPollingConfig
): Promise<NormalizedEvent[]> {
  const { google } = await import('googleapis');

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });

  oauth2Client.on('tokens', (tokens: { refresh_token?: string; access_token?: string; expiry_date?: number }) => {
    if (tokens.access_token) {
      credentials.accessToken = tokens.access_token;
    }
    if (tokens.refresh_token) {
      credentials.refreshToken = tokens.refresh_token;
    }
    if (tokens.expiry_date) {
      credentials.tokenExpiry = new Date(tokens.expiry_date);
    }
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const timeMin = moment().toISOString();
  const timeMax = moment().add(config.windowMinutes, 'minutes').toISOString();

  const response = await withExponentialBackoff(() =>
    calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: config.maxResults,
    })
  );

  const items = response.data.items ?? [];

  return items
    .filter(
      (event) => event.status !== 'cancelled' && event.start?.dateTime
    )
    .map((event) => {
      const startUtc = normalizeTimezone(
        event.start!.dateTime!,
        event.start!.timeZone ?? undefined
      );
      const endUtc = normalizeTimezone(
        event.end!.dateTime!,
        event.end!.timeZone ?? undefined
      );

      const attendees: RawAttendee[] = (event.attendees ?? []).map((a) => ({
        email: a.email ?? '',
        name: a.displayName ?? undefined,
        responseStatus: a.responseStatus ?? 'needsAction',
        isOrganizer: a.organizer === true,
      }));

      // Add organizer if not already in attendees
      if (event.organizer?.email) {
        const already = attendees.some(
          (a) => a.email === event.organizer!.email
        );
        if (!already) {
          attendees.push({
            email: event.organizer.email,
            name: event.organizer.displayName ?? undefined,
            responseStatus: 'accepted',
            isOrganizer: true,
          });
        }
      }

      return {
        externalId: event.id ?? '',
        provider: 'google' as CalendarProvider,
        title: event.summary ?? '(No title)',
        startTimeUtc: startUtc,
        endTimeUtc: endUtc,
        timezone: event.start!.timeZone ?? 'UTC',
        attendees,
        isRecurring: !!event.recurringEventId,
        isCancelled: event.status === 'cancelled',
        recurringEventId: event.recurringEventId ?? undefined,
        meetingUrl:
          event.hangoutLink ??
          event.conferenceData?.entryPoints?.[0]?.uri ??
          undefined,
        description: event.description ?? undefined,
      } as NormalizedEvent;
    });
}

// Outlook/Microsoft Graph integration
async function fetchOutlookEvents(
  credentials: CalendarCredentials,
  config: CalendarPollingConfig
): Promise<NormalizedEvent[]> {
  const { Client } = await import('@microsoft/microsoft-graph-client');

  const graphClient = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => credentials.accessToken,
    },
  });

  const startTime = moment().toISOString();
  const endTime = moment().add(config.windowMinutes, 'minutes').toISOString();

  const response = await withExponentialBackoff(() =>
    graphClient
      .api('/me/events')
      .filter(
        `start/dateTime ge '${startTime}' and start/dateTime le '${endTime}'`
      )
      .select('id,subject,start,end,attendees,organizer,isCancelled,type,onlineMeeting,bodyPreview,seriesMasterId')
      .top(config.maxResults)
      .get()
  );

  const items: OutlookEvent[] = response.value ?? [];

  return items
    .filter(
      (event) =>
        !event.isCancelled && event.type !== 'seriesMaster'
    )
    .map((event) => {
      const startUtc = normalizeTimezone(
        event.start.dateTime,
        event.start.timeZone
      );
      const endUtc = normalizeTimezone(
        event.end.dateTime,
        event.end.timeZone
      );

      const attendees: RawAttendee[] = (event.attendees ?? []).map((a) => ({
        email: a.emailAddress.address,
        name: a.emailAddress.name ?? undefined,
        responseStatus: a.status?.response ?? 'none',
        isOrganizer:
          a.emailAddress.address === event.organizer?.emailAddress?.address,
      }));

      if (
        event.organizer?.emailAddress?.address &&
        !attendees.some(
          (a) => a.email === event.organizer!.emailAddress!.address
        )
      ) {
        attendees.push({
          email: event.organizer.emailAddress.address,
          name: event.organizer.emailAddress.name ?? undefined,
          responseStatus: 'accepted',
          isOrganizer: true,
        });
      }

      return {
        externalId: event.id,
        provider: 'outlook' as CalendarProvider,
        title: event.subject ?? '(No title)',
        startTimeUtc: startUtc,
        endTimeUtc: endUtc,
        timezone: event.start.timeZone ?? 'UTC',
        attendees,
        isRecurring: event.type === 'occurrence' || event.type === 'exception',
        isCancelled: event.isCancelled ?? false,
        recurringEventId: event.seriesMasterId ?? undefined,
        meetingUrl: event.onlineMeeting?.joinUrl ?? undefined,
        description: event.bodyPreview ?? undefined,
      } as NormalizedEvent;
    });
}

interface OutlookEvent {
  id: string;
  subject?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: Array<{
    emailAddress: { address: string; name?: string };
    status?: { response?: string };
  }>;
  organizer?: { emailAddress?: { address: string; name?: string } };
  isCancelled?: boolean;
  type?: string;
  onlineMeeting?: { joinUrl?: string };
  bodyPreview?: string;
  seriesMasterId?: string;
}

function normalizedEventToMeeting(
  event: NormalizedEvent,
  attendeeMatches: AttendeeMatchResult[]
): Meeting {
  const durationMinutes = Math.round(
    (event.endTimeUtc.getTime() - event.startTimeUtc.getTime()) / 60000
  );

  const organizerRaw = event.attendees.find((a) => a.isOrganizer);
  const organizer: MeetingAttendee = organizerRaw
    ? {
        email: organizerRaw.email,
        name: organizerRaw.name,
        responseStatus: normalizeResponseStatus(organizerRaw.responseStatus),
        isOrganizer: true,
        internalUserId: attendeeMatches.find(
          (m) => m.attendee.email === organizerRaw.email
        )?.internalUser?.id,
      }
    : {
        email: '',
        responseStatus: 'none',
        isOrganizer: true,
      };

  const attendees: MeetingAttendee[] = attendeeMatches.map((match) => ({
    email: match.attendee.email,
    name: match.attendee.name,
    responseStatus: normalizeResponseStatus(match.attendee.responseStatus),
    isOrganizer: match.attendee.isOrganizer,
    internalUserId: match.internalUser?.id,
  }));

  return {
    id: `${event.provider}:${event.externalId}`,
    externalId: event.externalId,
    provider: event.provider,
    title: event.title,
    startTime: event.startTimeUtc,
    endTime: event.endTimeUtc,
    durationMinutes,
    timezone: event.timezone,
    attendees,
    organizer,
    isRecurring: event.isRecurring,
    isCancelled: event.isCancelled,
    recurringEventId: event.recurringEventId,
    meetingUrl: event.meetingUrl,
    description: event.description,
  };
}

// In-memory user lookup stub (replace with real DB lookup in production)
async function lookupInternalUsers(
  emails: string[]
): Promise<Map<string, UserRecord>> {
  // This should query an actual user database/service
  const result = new Map<string, UserRecord>();
  for (const email of emails) {
    // Stub: mark as matched if email has an identifiable domain structure
    // Real implementation would query prisma or user service
    result.set(email, {
      id: `user:${email}`,
      email,
      name: email.split('@')[0],
    });
  }
  return result;
}

async function matchAttendees(
  attendees: RawAttendee[]
): Promise<AttendeeMatchResult[]> {
  const emails = attendees.map((a) => a.email).filter(Boolean);
  const userMap = await lookupInternalUsers(emails);

  return attendees.map((attendee) => {
    const internalUser = userMap.get(attendee.email);
    return {
      attendee,
      internalUser,
      matched: !!internalUser,
    };
  });
}

async function refreshGoogleToken(
  credentials: CalendarCredentials
): Promise<TokenRefreshResult> {
  const { google } = await import('googleapis');
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ refresh_token: credentials.refreshToken });

  const { credentials: newCreds } = await oauth2Client.refreshAccessToken();

  return {
    accessToken: newCreds.access_token ?? credentials.accessToken,
    refreshToken: newCreds.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(newCreds.expiry_date ?? Date.now() + 3600 * 1000),
  };
}

async function refreshOutlookToken(
  credentials: CalendarCredentials
): Promise<TokenRefreshResult> {
  const { ConfidentialClientApplication } = await import('@azure/msal-node');
  const clientId = process.env.AZURE_CLIENT_ID ?? '';
  const clientSecret = process.env.AZURE_CLIENT_SECRET ?? '';
  const tenantId = process.env.AZURE_TENANT_ID ?? 'common';

  const msalApp = new ConfidentialClientApplication({
    auth: { clientId, clientSecret, authority: `https://login.microsoftonline.com/${tenantId}` },
  });

  const result = await msalApp.acquireTokenByRefreshToken({
    refreshToken: credentials.refreshToken,
    scopes: ['https://graph.microsoft.com/Calendars.Read'],
  });

  if (!result) {
    throw new Error('Failed to refresh Outlook token');
  }

  return {
    accessToken: result.accessToken,
    expiresAt: result.expiresOn ?? new Date(Date.now() + 3600 * 1000),
  };
}

async function ensureFreshToken(
  credentials: CalendarCredentials
): Promise<CalendarCredentials> {
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer
  if (credentials.tokenExpiry.getTime() - Date.now() > bufferMs) {
    return credentials;
  }

  let refreshed: TokenRefreshResult;
  if (credentials.provider === 'google') {
    refreshed = await refreshGoogleToken(credentials);
  } else {
    refreshed = await refreshOutlookToken(credentials);
  }

  return {
    ...credentials,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? credentials.refreshToken,
    tokenExpiry: refreshed.expiresAt,
  };
}

export const calendarIntegrationService = {
  async getUpcomingMeetings(
    credentials: CalendarCredentials,
    config: CalendarPollingConfig = DEFAULT_POLLING_CONFIG
  ): Promise<Meeting[]> {
    const freshCreds = await ensureFreshToken(credentials);

    let events: NormalizedEvent[];
    if (freshCreds.provider === 'google') {
      events = await fetchGoogleEvents(freshCreds, config);
    } else if (freshCreds.provider === 'outlook') {
      events = await fetchOutlookEvents(freshCreds, config);
    } else {
      throw new Error(`Unsupported calendar provider: ${freshCreds.provider}`);
    }

    const meetings = await Promise.all(
      events.map(async (event) => {
        const attendeeMatches = await matchAttendees(event.attendees);
        return normalizedEventToMeeting(event, attendeeMatches);
      })
    );

    return meetings;
  },

  async refreshCredentials(
    credentials: CalendarCredentials
  ): Promise<CalendarCredentials> {
    return ensureFreshToken(credentials);
  },

  normalizeTimezone,

  matchAttendees,

  startPolling(
    credentialsProvider: () => Promise<CalendarCredentials[]>,
    onMeetingsFound: (meetings: Meeting[]) => Promise<void>,
    config: CalendarPollingConfig = DEFAULT_POLLING_CONFIG
  ): cron.ScheduledTask {
    const task = cron.schedule(config.cronSchedule, async () => {
      try {
        const allCredentials = await credentialsProvider();
        for (const creds of allCredentials) {
          const meetings = await calendarIntegrationService.getUpcomingMeetings(
            creds,
            config
          );
          if (meetings.length > 0) {
            await onMeetingsFound(meetings);
          }
        }
      } catch (err) {
        console.error('Calendar polling error:', err);
      }
    });
    return task;
  },
};
