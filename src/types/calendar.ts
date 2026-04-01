export type CalendarProvider = 'google' | 'outlook';

export interface CalendarCredentials {
  provider: CalendarProvider;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date;
  userId: string;
}

export interface MeetingAttendee {
  email: string;
  name?: string;
  responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction' | 'none';
  isOrganizer: boolean;
  internalUserId?: string;
}

export interface Meeting {
  id: string;
  externalId: string;
  provider: CalendarProvider;
  title: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  timezone: string;
  attendees: MeetingAttendee[];
  organizer: MeetingAttendee;
  isRecurring: boolean;
  isCancelled: boolean;
  recurringEventId?: string;
  meetingUrl?: string;
  description?: string;
}

export interface CalendarPollingConfig {
  windowMinutes: number;
  maxResults: number;
  cronSchedule: string;
}

export interface NormalizedEvent {
  externalId: string;
  provider: CalendarProvider;
  title: string;
  startTimeUtc: Date;
  endTimeUtc: Date;
  timezone: string;
  attendees: RawAttendee[];
  isRecurring: boolean;
  isCancelled: boolean;
  recurringEventId?: string;
  meetingUrl?: string;
  description?: string;
}

export interface RawAttendee {
  email: string;
  name?: string;
  responseStatus: string;
  isOrganizer: boolean;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  timezone?: string;
}

export interface AttendeeMatchResult {
  attendee: RawAttendee;
  internalUser?: UserRecord;
  matched: boolean;
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface RateLimitConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

// Canonical aliases used by route contracts
export type CalendarMeeting = Meeting;
export type CalendarAttendee = MeetingAttendee;
