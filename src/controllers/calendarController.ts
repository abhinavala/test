import { calendarIntegrationService } from '../services/calendarIntegrationService';
import {
  CalendarCredentials,
  CalendarPollingConfig,
  CalendarMeeting,
} from '../types/calendar';

/**
 * Route manifest — consumed by the HTTP adapter layer.
 *
 * GET /api/calendar/upcoming -> CalendarMeeting[]
 * POST /api/calendar/refresh -> CalendarCredentials
 */
export const CALENDAR_ROUTES = {
  GET_UPCOMING: 'GET /api/calendar/upcoming',
  POST_REFRESH: 'POST /api/calendar/refresh',
} as const;

export interface GetUpcomingMeetingsRequest {
  credentials: CalendarCredentials;
  config?: Partial<CalendarPollingConfig>;
}

export interface GetUpcomingMeetingsResponse {
  meetings: CalendarMeeting[];
  fetchedAt: string;
}

export interface RefreshCredentialsRequest {
  credentials: CalendarCredentials;
}

export interface RefreshCredentialsResponse {
  credentials: CalendarCredentials;
  refreshedAt: string;
}

export const calendarController = {
  async getUpcomingMeetings(
    req: GetUpcomingMeetingsRequest
  ): Promise<GetUpcomingMeetingsResponse> {
    const pollingConfig: CalendarPollingConfig = {
      windowMinutes: req.config?.windowMinutes ?? 15,
      maxResults: req.config?.maxResults ?? 50,
      cronSchedule: req.config?.cronSchedule ?? '*/5 * * * *',
    };

    const meetings = await calendarIntegrationService.getUpcomingMeetings(
      req.credentials,
      pollingConfig
    );

    return {
      meetings,
      fetchedAt: new Date().toISOString(),
    };
  },

  async refreshCredentials(
    req: RefreshCredentialsRequest
  ): Promise<RefreshCredentialsResponse> {
    const refreshed = await calendarIntegrationService.refreshCredentials(
      req.credentials
    );

    return {
      credentials: refreshed,
      refreshedAt: new Date().toISOString(),
    };
  },
};
