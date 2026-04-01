import { calendarIntegrationService } from '../services/calendarIntegrationService';
import {
  CalendarCredentials,
  CalendarPollingConfig,
  Meeting,
} from '../types/calendar';

export interface GetUpcomingMeetingsRequest {
  credentials: CalendarCredentials;
  config?: Partial<CalendarPollingConfig>;
}

export interface GetUpcomingMeetingsResponse {
  meetings: Meeting[];
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
