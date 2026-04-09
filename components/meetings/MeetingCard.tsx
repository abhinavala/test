import type { Meeting } from '../../src/types/meeting.js';

export interface MeetingCardProps {
  meeting: Meeting;
  onClick: (meetingId: string) => void;
  className?: string;
}

export function MeetingCard({ meeting, onClick, className }: MeetingCardProps): JSX.Element {
  return (
    <div
      className={`meeting-card ${className ?? ''}`}
      onClick={() => onClick(meeting.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(meeting.id);
      }}
    >
      <h3 className="meeting-card__title">{meeting.title}</h3>
      <span className="meeting-card__date">{meeting.date}</span>
      <span className="meeting-card__status" data-status={meeting.status}>
        {meeting.status}
      </span>
      <span className="meeting-card__duration">{meeting.duration}m</span>
    </div>
  );
}

export default MeetingCard;
