import type { FC } from 'react';
import type { Meeting, MeetingStatus } from '../../src/types/meeting.js';

export interface MeetingCardProps {
  meeting: Meeting;
  onClick: (meetingId: string) => void;
  className?: string;
}

const STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_CLASS: Record<MeetingStatus, string> = {
  scheduled: 'meeting-card__status--scheduled',
  in_progress: 'meeting-card__status--in-progress',
  completed: 'meeting-card__status--completed',
  cancelled: 'meeting-card__status--cancelled',
};

export function formatDuration(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

export function formatMeetingDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const MeetingCard: FC<MeetingCardProps> = ({ meeting, onClick, className }) => {
  const classes = ['meeting-card', className].filter(Boolean).join(' ');

  return (
    <article
      className={classes}
      onClick={() => onClick(meeting.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(meeting.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Meeting: ${meeting.title}`}
    >
      <div className="meeting-card__header">
        <h3 className="meeting-card__title">{meeting.title}</h3>
        <span className={`meeting-card__status ${STATUS_CLASS[meeting.status]}`}>
          {STATUS_LABELS[meeting.status]}
        </span>
      </div>

      <div className="meeting-card__meta">
        <span className="meeting-card__date">{formatMeetingDate(meeting.date)}</span>
        <span className="meeting-card__duration">{formatDuration(meeting.duration)}</span>
      </div>

      <div className="meeting-card__footer">
        <span className="meeting-card__participants">
          {meeting.participants.length} participant{meeting.participants.length !== 1 ? 's' : ''}
        </span>
        {meeting.tags && meeting.tags.length > 0 && (
          <div className="meeting-card__tags">
            {meeting.tags.map((tag) => (
              <span key={tag} className="meeting-card__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {meeting.description && (
        <p className="meeting-card__description">{meeting.description}</p>
      )}
    </article>
  );
};

export default MeetingCard;
