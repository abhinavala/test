import { FC } from "react";
import type { Meeting } from "../../hooks/useMeetingDetail.js";

interface MeetingHeaderProps {
  meeting: Meeting;
}

function getStatusLabel(status: Meeting["status"]): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "in-progress":
      return "In Progress";
    case "completed":
      return "Completed";
  }
}

function getStatusClass(status: Meeting["status"]): string {
  switch (status) {
    case "scheduled":
      return "meeting-status--scheduled";
    case "in-progress":
      return "meeting-status--in-progress";
    case "completed":
      return "meeting-status--completed";
  }
}

export const MeetingHeader: FC<MeetingHeaderProps> = ({ meeting }) => {
  return (
    <header className="meeting-header" data-testid="meeting-header">
      <div className="meeting-header__top">
        <h1 className="meeting-header__title">{meeting.title}</h1>
        <span
          className={`meeting-status ${getStatusClass(meeting.status)}`}
          data-testid="meeting-status"
        >
          {getStatusLabel(meeting.status)}
        </span>
      </div>
      <div className="meeting-header__meta">
        <span className="meeting-header__date">{meeting.date}</span>
        {meeting.duration != null && (
          <span className="meeting-header__duration mono">
            {meeting.duration} min
          </span>
        )}
        {meeting.organizer && (
          <span className="meeting-header__organizer">
            Organized by {meeting.organizer}
          </span>
        )}
      </div>
      {meeting.participants.length > 0 && (
        <div className="meeting-header__participants">
          <span className="meeting-header__participants-label">
            Participants:
          </span>
          <ul className="meeting-header__participants-list">
            {meeting.participants.map((participant) => (
              <li key={participant} className="meeting-header__participant">
                {participant}
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
};

export default MeetingHeader;
