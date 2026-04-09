import type { FC } from 'react';
import type { Meeting } from '../../src/types/meeting.js';
import { MeetingCard } from './MeetingCard.js';

export interface MeetingsListProps {
  meetings: Meeting[];
  loading?: boolean;
  error?: string;
  onMeetingClick: (meetingId: string) => void;
}

export const MeetingsList: FC<MeetingsListProps> = ({
  meetings,
  loading = false,
  error,
  onMeetingClick,
}) => {
  if (error) {
    return (
      <div className="meetings-list meetings-list--error" role="alert">
        <div className="meetings-list__error-icon" aria-hidden="true">!</div>
        <p className="meetings-list__error-message">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="meetings-list meetings-list--loading" aria-busy="true" aria-label="Loading meetings">
        <div className="meetings-list__skeleton" />
        <div className="meetings-list__skeleton" />
        <div className="meetings-list__skeleton" />
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="meetings-list meetings-list--empty">
        <p className="meetings-list__empty-message">No meetings found</p>
      </div>
    );
  }

  return (
    <div className="meetings-list" role="list" aria-label="Meetings">
      {meetings.map((meeting) => (
        <div key={meeting.id} role="listitem">
          <MeetingCard meeting={meeting} onClick={onMeetingClick} />
        </div>
      ))}
    </div>
  );
};

export default MeetingsList;
