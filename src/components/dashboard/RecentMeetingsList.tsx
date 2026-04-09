import { FC } from 'react';
import type { RecentMeeting } from '../../hooks/useDashboardData.js';

interface RecentMeetingsListProps {
  meetings: RecentMeeting[];
  loading?: boolean;
  onMeetingClick?: (meetingId: string) => void;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

function getStatusClass(status: RecentMeeting['status']): string {
  switch (status) {
    case 'completed':
      return 'meeting-status--completed';
    case 'in-progress':
      return 'meeting-status--in-progress';
    case 'scheduled':
      return 'meeting-status--scheduled';
  }
}

export const RecentMeetingsList: FC<RecentMeetingsListProps> = ({ meetings, loading, onMeetingClick }) => {
  if (loading) {
    return (
      <div className="recent-meetings recent-meetings--loading" role="status" aria-label="Loading meetings">
        <span>Loading recent meetings...</span>
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="recent-meetings recent-meetings--empty" role="region" aria-label="Recent meetings">
        <p className="recent-meetings__empty-message">No recent meetings found.</p>
      </div>
    );
  }

  return (
    <div className="recent-meetings" role="region" aria-label="Recent meetings">
      <h2 className="recent-meetings__title">Recent Meetings</h2>
      <ul className="recent-meetings__list" role="list">
        {meetings.map((meeting) => (
          <li key={meeting.id} className="recent-meetings__item">
            <button
              className="recent-meetings__button"
              onClick={() => onMeetingClick?.(meeting.id)}
              type="button"
              aria-label={`View details for ${meeting.title}`}
            >
              <div className="recent-meetings__header">
                <span className="recent-meetings__meeting-title">{meeting.title}</span>
                <span className={`recent-meetings__status ${getStatusClass(meeting.status)}`}>
                  {meeting.status}
                </span>
              </div>
              <div className="recent-meetings__details">
                <span className="recent-meetings__date">{formatDate(meeting.date)}</span>
                <span className="recent-meetings__duration" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  {formatDurationMinutes(meeting.duration)}
                </span>
                <span className="recent-meetings__participants" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  {meeting.participantCount} participants
                </span>
                <span className="recent-meetings__actions" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  {meeting.actionItemCount} action items
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RecentMeetingsList;
