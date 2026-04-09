export interface DashboardStats {
  totalMeetings: number;
  totalHours: number;
  averageDuration: number;
  activeParticipants: number;
  actionItemCount: number;
}

export interface RecentMeeting {
  id: string;
  title: string;
  date: string;
  duration: number;
  status: 'completed' | 'in-progress' | 'scheduled';
  participantCount: number;
  participants: string[];
  actionItemCount: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recentMeetings: RecentMeeting[];
}
