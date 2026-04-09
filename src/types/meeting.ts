export type MeetingStatus = 'scheduled' | 'in-progress' | 'completed' | 'cancelled';

export interface DateRange {
  start: string;
  end: string;
}

export interface DurationRange {
  min: number;
  max: number;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: number;
  status: MeetingStatus;
  participants: string[];
  tags: string[];
  organizer: string;
  description?: string;
}

export interface MeetingFilters {
  search?: string;
  status?: MeetingStatus[];
  dateRange?: DateRange;
  durationRange?: DurationRange;
  participants?: string[];
  tags?: string[];
}
