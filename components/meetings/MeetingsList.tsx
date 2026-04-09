import type { Meeting } from '../../src/types/meeting.js';
import { MeetingCard } from './MeetingCard.js';

export interface MeetingsListProps {
  meetings: Meeting[];
  loading?: boolean;
  error?: string;
  onMeetingClick: (meetingId: string) => void;
}

export function MeetingsList({ meetings, loading, error, onMeetingClick }: MeetingsListProps): JSX.Element {
  if (loading) {
    return <div className="meetings-list meetings-list--loading" role="status">Loading meetings...</div>;
  }

  if (error) {
    return <div className="meetings-list meetings-list--error" role="alert">{error}</div>;
  }

  if (meetings.length === 0) {
    return <div className="meetings-list meetings-list--empty">No meetings found.</div>;
  }

  return (
    <div className="meetings-list">
      {meetings.map((meeting) => (
        <MeetingCard key={meeting.id} meeting={meeting} onClick={onMeetingClick} />
      ))}
    </div>
  );
}

export default MeetingsList;
