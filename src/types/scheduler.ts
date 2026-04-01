export type BriefingType = 'internal' | 'external' | 'recurring' | 'one-time' | 'large-group' | 'small-group';

export type JobStatus = 'scheduled' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface MeetingAttendee {
  email: string;
  name?: string;
  isExternal?: boolean;
}

export interface MeetingData {
  id: string;
  externalId?: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendees: MeetingAttendee[];
  organizerEmail: string;
  isRecurring: boolean;
  location?: string;
  description?: string;
  calendarProvider?: 'google' | 'outlook';
}

export interface BriefingJobData {
  meetingId: string;
  meetingData: MeetingData;
  briefingType: BriefingType;
  userId: string;
  scheduledAt: number;
}

export interface BriefingJobResult {
  meetingId: string;
  briefingGenerated: boolean;
  briefingId?: string;
  error?: string;
}

export interface UserSchedulerPreferences {
  userId: string;
  briefingLeadTimeMinutes: number;
  enabledBriefingTypes: BriefingType[];
  notificationChannels: ('slack' | 'email')[];
  timezone: string;
}

export interface ScheduledJobInfo {
  jobId: string;
  meetingId: string;
  userId: string;
  scheduledFireTime: Date;
  status: JobStatus;
  briefingType: BriefingType;
  createdAt: Date;
}

export interface MeetingScheduleResult {
  meetingId: string;
  jobId: string | null;
  scheduled: boolean;
  reason?: string;
}

export interface CalendarSyncResult {
  newMeetings: number;
  updatedMeetings: number;
  cancelledMeetings: number;
  scheduledJobs: number;
}

export const DEFAULT_BRIEFING_LEAD_TIME_MINUTES = 5;
export const MAX_BRIEFING_LEAD_TIME_MINUTES = 10;
export const MIN_BRIEFING_LEAD_TIME_MINUTES = 1;

export const SCHEDULER_NAMESPACE_UUID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
