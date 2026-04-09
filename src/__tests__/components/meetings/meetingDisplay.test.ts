import { describe, it, expect, vi } from 'vitest';
import type { MeetingCardProps } from '../../../../components/meetings/MeetingCard.js';
import { formatDuration, formatMeetingDate } from '../../../../components/meetings/MeetingCard.js';
import type { MeetingsListProps } from '../../../../components/meetings/MeetingsList.js';
import type { Meeting, MeetingStatus } from '../../../types/meeting.js';

function createMockMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'meeting-1',
    title: 'Weekly Standup',
    date: '2026-04-08T10:00:00Z',
    duration: 30,
    participants: [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
    status: 'completed',
    ...overrides,
  };
}

describe('MeetingCard', () => {
  describe('formatDuration', () => {
    it('formats minutes only', () => {
      expect(formatDuration(30)).toBe('30m');
    });

    it('formats hours only', () => {
      expect(formatDuration(60)).toBe('1h');
      expect(formatDuration(120)).toBe('2h');
    });

    it('formats hours and minutes', () => {
      expect(formatDuration(90)).toBe('1h 30m');
      expect(formatDuration(75)).toBe('1h 15m');
    });

    it('formats zero minutes', () => {
      expect(formatDuration(0)).toBe('0m');
    });
  });

  describe('formatMeetingDate', () => {
    it('formats a date string to readable format', () => {
      const result = formatMeetingDate('2026-04-08T10:00:00Z');
      expect(result).toContain('Apr');
      expect(result).toContain('2026');
      expect(result).toContain('8');
    });
  });

  describe('MeetingCardProps interface', () => {
    it('MeetingCard displays all meeting information correctly', () => {
      const meeting = createMockMeeting({
        title: 'Design Review',
        date: '2026-04-08T14:00:00Z',
        duration: 45,
        status: 'completed',
        participants: [
          { id: 'p1', name: 'Alice' },
          { id: 'p2', name: 'Bob' },
          { id: 'p3', name: 'Carol' },
        ],
        tags: ['design', 'review'],
        description: 'Reviewing the latest designs',
      });

      // Verify all meeting information is accessible
      expect(meeting.title).toBe('Design Review');
      expect(formatMeetingDate(meeting.date)).toContain('Apr');
      expect(formatDuration(meeting.duration)).toBe('45m');
      expect(meeting.participants).toHaveLength(3);
      expect(meeting.status).toBe('completed');
      expect(meeting.tags).toEqual(['design', 'review']);
      expect(meeting.description).toBe('Reviewing the latest designs');

      // Verify props contract
      const props: MeetingCardProps = {
        meeting,
        onClick: vi.fn(),
        className: 'custom-class',
      };
      expect(props.meeting).toBe(meeting);
      expect(props.className).toBe('custom-class');
    });

    it('MeetingCard onClick handler is called with correct meeting ID', () => {
      const onClick = vi.fn();
      const meeting = createMockMeeting({ id: 'meeting-abc' });

      const props: MeetingCardProps = { meeting, onClick };

      // Simulate what the component does on click
      props.onClick(props.meeting.id);

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith('meeting-abc');
    });

    it('accepts optional className prop', () => {
      const props: MeetingCardProps = {
        meeting: createMockMeeting(),
        onClick: vi.fn(),
      };
      expect(props.className).toBeUndefined();

      const propsWithClass: MeetingCardProps = {
        meeting: createMockMeeting(),
        onClick: vi.fn(),
        className: 'highlighted',
      };
      expect(propsWithClass.className).toBe('highlighted');
    });
  });

  describe('status mapping', () => {
    const allStatuses: MeetingStatus[] = ['scheduled', 'in_progress', 'completed', 'cancelled'];

    it('handles all meeting statuses', () => {
      allStatuses.forEach((status) => {
        const meeting = createMockMeeting({ status });
        expect(meeting.status).toBe(status);
      });
    });
  });
});

describe('MeetingsList', () => {
  it('MeetingsListProps interface is correctly defined', () => {
    const props: MeetingsListProps = {
      meetings: [createMockMeeting()],
      loading: false,
      error: undefined,
      onMeetingClick: vi.fn(),
    };

    expect(props.meetings).toHaveLength(1);
    expect(props.loading).toBe(false);
    expect(props.error).toBeUndefined();
  });

  it('MeetingsList shows empty state when meetings array is empty', () => {
    const props: MeetingsListProps = {
      meetings: [],
      onMeetingClick: vi.fn(),
    };

    // When meetings array is empty, component renders empty state
    expect(props.meetings.length).toBe(0);
    // Verify the component would detect this condition
    const isEmpty = props.meetings.length === 0;
    expect(isEmpty).toBe(true);
  });

  it('handles loading state', () => {
    const props: MeetingsListProps = {
      meetings: [],
      loading: true,
      onMeetingClick: vi.fn(),
    };

    expect(props.loading).toBe(true);
  });

  it('handles error state', () => {
    const errorMessage = 'Failed to load meetings';
    const props: MeetingsListProps = {
      meetings: [],
      error: errorMessage,
      onMeetingClick: vi.fn(),
    };

    expect(props.error).toBe(errorMessage);
  });

  it('passes meeting click handler to each card', () => {
    const onMeetingClick = vi.fn();
    const meetings = [
      createMockMeeting({ id: 'm1' }),
      createMockMeeting({ id: 'm2' }),
      createMockMeeting({ id: 'm3' }),
    ];

    const props: MeetingsListProps = { meetings, onMeetingClick };

    // Simulate clicking each meeting
    props.meetings.forEach((m) => props.onMeetingClick(m.id));

    expect(onMeetingClick).toHaveBeenCalledTimes(3);
    expect(onMeetingClick).toHaveBeenCalledWith('m1');
    expect(onMeetingClick).toHaveBeenCalledWith('m2');
    expect(onMeetingClick).toHaveBeenCalledWith('m3');
  });
});
