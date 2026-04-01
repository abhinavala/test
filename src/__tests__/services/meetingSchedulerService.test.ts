import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { v5 as uuidv5 } from 'uuid';
import {
  BriefingType,
  MeetingData,
  SCHEDULER_NAMESPACE_UUID,
  UserSchedulerPreferences,
} from '../../types/scheduler';

// Mock redis client
const mockRedisHSet = vi.fn().mockResolvedValue(1);
const mockRedisHGetAll = vi.fn().mockResolvedValue({});
const mockRedisDel = vi.fn().mockResolvedValue(1);
const mockRedisSet = vi.fn().mockResolvedValue('OK');
const mockRedisConnect = vi.fn().mockResolvedValue(undefined);
const mockRedisDisconnect = vi.fn().mockResolvedValue(undefined);

vi.mock('redis', () => ({
  createClient: () => ({
    hSet: mockRedisHSet,
    hGetAll: mockRedisHGetAll,
    del: mockRedisDel,
    set: mockRedisSet,
    connect: mockRedisConnect,
    disconnect: mockRedisDisconnect,
    on: vi.fn(),
  }),
}));

// Mock bull queue
const mockAddJob = vi.fn().mockResolvedValue({ id: 'job-123' });
const mockRemoveJob = vi.fn().mockResolvedValue(true);
const mockGetJobStatus = vi.fn().mockResolvedValue('delayed');
const mockGetDelayedJobs = vi.fn().mockResolvedValue([]);

vi.mock('../../queues/briefingQueue', () => ({
  addBriefingJob: (...args: unknown[]) => mockAddJob(...args),
  removeBriefingJob: (...args: unknown[]) => mockRemoveJob(...args),
  getBriefingJobStatus: (...args: unknown[]) => mockGetJobStatus(...args),
  getDelayedJobs: () => mockGetDelayedJobs(),
  cleanupQueue: vi.fn().mockResolvedValue(undefined),
}));

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn().mockReturnValue({ stop: vi.fn() }),
  },
}));

// Import after mocking
import { meetingSchedulerService } from '../../services/meetingSchedulerService';

function makeMeeting(overrides: Partial<MeetingData> = {}): MeetingData {
  const startTime = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
  return {
    id: 'test-meeting-1',
    title: 'Team Sync',
    startTime,
    endTime: new Date(startTime.getTime() + 60 * 60 * 1000),
    attendees: [
      { email: 'alice@company.com', name: 'Alice', isExternal: false },
      { email: 'bob@company.com', name: 'Bob', isExternal: false },
    ],
    organizerEmail: 'alice@company.com',
    isRecurring: false,
    ...overrides,
  };
}

describe('meetingSchedulerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisSet.mockResolvedValue('OK'); // Lock acquisition succeeds by default
    mockRedisHGetAll.mockResolvedValue({});
  });

  afterEach(() => {
    meetingSchedulerService.stopSchedulers();
  });

  describe('getUserPreferences', () => {
    it('returns default preferences when none are stored', async () => {
      mockRedisHGetAll.mockResolvedValueOnce({});
      const prefs = await meetingSchedulerService.getUserPreferences('user-1');

      expect(prefs.userId).toBe('user-1');
      expect(prefs.briefingLeadTimeMinutes).toBe(5);
      expect(prefs.timezone).toBe('UTC');
      expect(prefs.notificationChannels).toContain('slack');
    });

    it('returns stored preferences when they exist', async () => {
      mockRedisHGetAll.mockResolvedValueOnce({
        briefingLeadTimeMinutes: '8',
        enabledBriefingTypes: '["internal","external"]',
        notificationChannels: '["slack","email"]',
        timezone: 'America/New_York',
      });

      const prefs = await meetingSchedulerService.getUserPreferences('user-1');

      expect(prefs.briefingLeadTimeMinutes).toBe(8);
      expect(prefs.enabledBriefingTypes).toEqual(['internal', 'external']);
      expect(prefs.timezone).toBe('America/New_York');
    });
  });

  describe('setUserPreferences', () => {
    it('persists preferences to redis', async () => {
      const prefs: UserSchedulerPreferences = {
        userId: 'user-1',
        briefingLeadTimeMinutes: 7,
        enabledBriefingTypes: ['external'],
        notificationChannels: ['slack'],
        timezone: 'Europe/London',
      };

      await meetingSchedulerService.setUserPreferences(prefs);

      expect(mockRedisHSet).toHaveBeenCalledWith(
        expect.stringContaining('user-1'),
        expect.objectContaining({ briefingLeadTimeMinutes: '7', timezone: 'Europe/London' })
      );
    });
  });

  describe('scheduleMeetingBriefing', () => {
    it('schedules a briefing job for a future meeting', async () => {
      const meeting = makeMeeting();
      const result = await meetingSchedulerService.scheduleMeetingBriefing(meeting, 'user-1');

      expect(result.scheduled).toBe(true);
      expect(result.meetingId).toBeDefined();
      expect(result.jobId).toBeDefined();
      expect(mockAddJob).toHaveBeenCalled();
    });

    it('does not schedule a briefing for a past meeting', async () => {
      const meeting = makeMeeting({
        startTime: new Date(Date.now() - 10 * 60 * 1000),
      });

      const result = await meetingSchedulerService.scheduleMeetingBriefing(meeting, 'user-1');

      expect(result.scheduled).toBe(false);
      expect(result.reason).toContain('past');
      expect(mockAddJob).not.toHaveBeenCalled();
    });

    it('prevents duplicate scheduling via redis lock', async () => {
      mockRedisSet.mockResolvedValueOnce(null); // Lock not acquired

      const meeting = makeMeeting();
      const result = await meetingSchedulerService.scheduleMeetingBriefing(meeting, 'user-1');

      expect(result.scheduled).toBe(false);
      expect(result.reason).toContain('Duplicate');
      expect(mockAddJob).not.toHaveBeenCalled();
    });

    it('uses deterministic ID for meetings with externalId', async () => {
      const meeting = makeMeeting({ externalId: 'ext-meeting-abc' });
      const result = await meetingSchedulerService.scheduleMeetingBriefing(meeting, 'user-1');

      const expectedId = uuidv5('ext-meeting-abc', SCHEDULER_NAMESPACE_UUID);
      expect(result.meetingId).toBe(expectedId);
    });

    it('uses user lead time preference for job delay', async () => {
      mockRedisHGetAll
        .mockResolvedValueOnce({}) // lock check returns empty
        .mockResolvedValueOnce({
          briefingLeadTimeMinutes: '10',
          enabledBriefingTypes: JSON.stringify(['internal', 'external', 'recurring', 'one-time', 'large-group', 'small-group']),
          notificationChannels: '["slack"]',
          timezone: 'UTC',
        });

      const meeting = makeMeeting({ startTime: new Date(Date.now() + 60 * 60 * 1000) }); // 1 hr from now
      await meetingSchedulerService.scheduleMeetingBriefing(meeting, 'user-pref');

      expect(mockAddJob).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ userId: 'user-pref' }),
        expect.any(Number)
      );
    });

    it('correctly identifies external meetings', async () => {
      const meeting = makeMeeting({
        attendees: [
          { email: 'alice@company.com', isExternal: false },
          { email: 'vendor@external.com', isExternal: true },
        ],
      });

      await meetingSchedulerService.scheduleMeetingBriefing(meeting, 'user-1');

      expect(mockAddJob).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ briefingType: 'external' as BriefingType }),
        expect.any(Number)
      );
    });

    it('correctly identifies recurring meetings', async () => {
      const meeting = makeMeeting({ isRecurring: true });
      await meetingSchedulerService.scheduleMeetingBriefing(meeting, 'user-1');

      expect(mockAddJob).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ briefingType: 'recurring' as BriefingType }),
        expect.any(Number)
      );
    });

    it('skips scheduling if briefing type not enabled for user', async () => {
      // getUserPreferences calls hGetAll once; lock uses set (NX), not hGetAll
      mockRedisHGetAll.mockResolvedValueOnce({
        briefingLeadTimeMinutes: '5',
        enabledBriefingTypes: JSON.stringify(['external']), // only external
        notificationChannels: '["slack"]',
        timezone: 'UTC',
      });

      const meeting = makeMeeting({ isRecurring: false }); // will be 'small-group' or 'one-time'
      const result = await meetingSchedulerService.scheduleMeetingBriefing(meeting, 'user-1');

      expect(result.scheduled).toBe(false);
      expect(result.reason).toContain('not enabled');
    });
  });

  describe('cancelMeetingBriefing', () => {
    it('cancels a scheduled briefing job', async () => {
      mockRemoveJob.mockResolvedValueOnce(true);
      const cancelled = await meetingSchedulerService.cancelMeetingBriefing('meeting-1', 'user-1');

      expect(cancelled).toBe(true);
      expect(mockRemoveJob).toHaveBeenCalledWith(expect.stringContaining('meeting-1'));
      expect(mockRedisHSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'cancelled' })
      );
    });

    it('returns false when no job exists to cancel', async () => {
      mockRemoveJob.mockResolvedValueOnce(false);
      const cancelled = await meetingSchedulerService.cancelMeetingBriefing('no-meeting', 'user-1');

      expect(cancelled).toBe(false);
    });
  });

  describe('rescheduleMeetingBriefing', () => {
    it('cancels old job and creates new one', async () => {
      const meeting = makeMeeting({ startTime: new Date(Date.now() + 2 * 60 * 60 * 1000) });

      const result = await meetingSchedulerService.rescheduleMeetingBriefing(meeting, 'user-1');

      expect(mockRemoveJob).toHaveBeenCalled();
      expect(result.scheduled).toBe(true);
    });
  });

  describe('getJobStatus', () => {
    it('returns null when no job exists', async () => {
      mockRedisHGetAll.mockResolvedValueOnce({});
      const status = await meetingSchedulerService.getJobStatus('meeting-1', 'user-1');

      expect(status).toBeNull();
    });

    it('returns job info when it exists', async () => {
      const now = Date.now();
      mockRedisHGetAll.mockResolvedValueOnce({
        briefingScheduled: String(now),
        jobId: 'briefing-meeting-1-user-1',
        status: 'scheduled',
        briefingType: 'internal',
        fireAt: String(now + 5 * 60 * 1000),
      });
      mockGetJobStatus.mockResolvedValueOnce('delayed');

      const info = await meetingSchedulerService.getJobStatus('meeting-1', 'user-1');

      expect(info).not.toBeNull();
      expect(info?.meetingId).toBe('meeting-1');
      expect(info?.status).toBe('delayed');
      expect(info?.briefingType).toBe('internal');
    });
  });

  describe('processMeetingUpdates', () => {
    it('schedules new meetings and tracks results', async () => {
      const meetings = [makeMeeting({ id: 'meeting-a' }), makeMeeting({ id: 'meeting-b' })];

      const result = await meetingSchedulerService.processMeetingUpdates(meetings, 'user-1');

      expect(result.newMeetings).toBe(2);
      expect(result.scheduledJobs).toBe(2);
    });

    it('detects rescheduled meetings by comparing fire times', async () => {
      const futureTime = Date.now() + 3 * 60 * 60 * 1000;
      // processMeetingUpdates: hGetAll(meetingKey) must return existing record
      // then hGetAll(userPrefsKey) for fire-time comparison uses default ({} → 5min lead)
      mockRedisHGetAll.mockResolvedValueOnce({
        briefingScheduled: String(Date.now() - 10000),
        jobId: 'old-job',
        status: 'scheduled',
        briefingType: 'one-time',
        fireAt: String(futureTime - 60 * 60 * 1000), // old fire time: 1hr before meeting
      });

      const meetings = [makeMeeting({ id: 'meeting-a', startTime: new Date(futureTime) })];
      const result = await meetingSchedulerService.processMeetingUpdates(meetings, 'user-1');

      expect(result.updatedMeetings).toBe(1);
    });
  });

  describe('generateDeterministicId', () => {
    it('generates consistent IDs for the same input', () => {
      const id1 = meetingSchedulerService.generateDeterministicId('ext-id-123');
      const id2 = meetingSchedulerService.generateDeterministicId('ext-id-123');

      expect(id1).toBe(id2);
    });

    it('generates different IDs for different inputs', () => {
      const id1 = meetingSchedulerService.generateDeterministicId('ext-id-123');
      const id2 = meetingSchedulerService.generateDeterministicId('ext-id-456');

      expect(id1).not.toBe(id2);
    });
  });

  describe('generateRandomId', () => {
    it('generates unique IDs each call', () => {
      const id1 = meetingSchedulerService.generateRandomId();
      const id2 = meetingSchedulerService.generateRandomId();

      expect(id1).not.toBe(id2);
    });

    it('generates valid UUID format', () => {
      const id = meetingSchedulerService.generateRandomId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('getScheduledJobsCount', () => {
    it('returns count of delayed jobs', async () => {
      mockGetDelayedJobs.mockResolvedValueOnce([{}, {}, {}]);
      const count = await meetingSchedulerService.getScheduledJobsCount();

      expect(count).toBe(3);
    });
  });

  describe('scheduling latency', () => {
    it('schedules a briefing job in under 100ms', async () => {
      const meeting = makeMeeting();
      const start = Date.now();
      await meetingSchedulerService.scheduleMeetingBriefing(meeting, 'user-perf');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });
});
