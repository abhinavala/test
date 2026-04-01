import cron from 'node-cron';
import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import {
  BriefingJobData,
  BriefingType,
  CalendarSyncResult,
  DEFAULT_BRIEFING_LEAD_TIME_MINUTES,
  JobStatus,
  MeetingData,
  MeetingScheduleResult,
  SCHEDULER_NAMESPACE_UUID,
  ScheduledJobInfo,
  UserSchedulerPreferences,
} from '../types/scheduler';
import {
  addBriefingJob,
  getBriefingJobStatus,
  getDelayedJobs,
  removeBriefingJob,
} from '../queues/briefingQueue';

const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);

let redisClient: RedisClientType | null = null;
let calendarSyncTask: cron.ScheduledTask | null = null;
let cleanupTask: cron.ScheduledTask | null = null;

async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({
      socket: { host: REDIS_HOST, port: REDIS_PORT },
    }) as RedisClientType;
    redisClient.on('error', (err: Error) => {
      console.error('[MeetingSchedulerService] Redis error:', err.message);
    });
    await redisClient.connect();
  }
  return redisClient;
}

function getBriefingType(meeting: MeetingData): BriefingType {
  const externalAttendees = meeting.attendees.filter((a) => a.isExternal);
  const totalAttendees = meeting.attendees.length;

  if (externalAttendees.length > 0) return 'external';
  if (meeting.isRecurring) return 'recurring';
  if (totalAttendees > 10) return 'large-group';
  if (totalAttendees <= 3) return 'small-group';
  return 'one-time';
}

function buildJobId(meetingId: string, userId: string): string {
  return `briefing-${meetingId}-${userId}`;
}

function buildMeetingKey(meetingId: string): string {
  return `meeting:${meetingId}`;
}

function buildUserPrefsKey(userId: string): string {
  return `user:${userId}:scheduler:prefs`;
}

function buildLockKey(meetingId: string, userId: string): string {
  return `lock:briefing:${meetingId}:${userId}`;
}

async function acquireLock(
  client: RedisClientType,
  key: string,
  ttlSeconds: number
): Promise<boolean> {
  const result = await client.set(key, '1', { EX: ttlSeconds, NX: true });
  return result === 'OK';
}

async function releaseLock(client: RedisClientType, key: string): Promise<void> {
  await client.del(key);
}

export const meetingSchedulerService = {
  async getUserPreferences(userId: string): Promise<UserSchedulerPreferences> {
    const client = await getRedisClient();
    const raw = await client.hGetAll(buildUserPrefsKey(userId));

    if (!raw || Object.keys(raw).length === 0) {
      return {
        userId,
        briefingLeadTimeMinutes: DEFAULT_BRIEFING_LEAD_TIME_MINUTES,
        enabledBriefingTypes: ['internal', 'external', 'recurring', 'one-time', 'large-group', 'small-group'],
        notificationChannels: ['slack'],
        timezone: 'UTC',
      };
    }

    return {
      userId,
      briefingLeadTimeMinutes: parseInt(raw.briefingLeadTimeMinutes ?? String(DEFAULT_BRIEFING_LEAD_TIME_MINUTES), 10),
      enabledBriefingTypes: JSON.parse(raw.enabledBriefingTypes ?? '[]'),
      notificationChannels: JSON.parse(raw.notificationChannels ?? '["slack"]'),
      timezone: raw.timezone ?? 'UTC',
    };
  },

  async setUserPreferences(prefs: UserSchedulerPreferences): Promise<void> {
    const client = await getRedisClient();
    await client.hSet(buildUserPrefsKey(prefs.userId), {
      briefingLeadTimeMinutes: String(prefs.briefingLeadTimeMinutes),
      enabledBriefingTypes: JSON.stringify(prefs.enabledBriefingTypes),
      notificationChannels: JSON.stringify(prefs.notificationChannels),
      timezone: prefs.timezone,
    });
  },

  async scheduleMeetingBriefing(
    meeting: MeetingData,
    userId: string
  ): Promise<MeetingScheduleResult> {
    const client = await getRedisClient();
    const prefs = await meetingSchedulerService.getUserPreferences(userId);
    const meetingId = meeting.externalId
      ? uuidv5(meeting.externalId, SCHEDULER_NAMESPACE_UUID)
      : meeting.id;

    const jobId = buildJobId(meetingId, userId);
    const lockKey = buildLockKey(meetingId, userId);

    const lockAcquired = await acquireLock(client, lockKey, 60);
    if (!lockAcquired) {
      return { meetingId, jobId, scheduled: false, reason: 'Duplicate: job already scheduled' };
    }

    try {
      const now = Date.now();
      const meetingStartMs = new Date(meeting.startTime).getTime();
      const leadTimeMs = prefs.briefingLeadTimeMinutes * 60 * 1000;
      const fireAtMs = meetingStartMs - leadTimeMs;
      const delayMs = fireAtMs - now;

      if (meetingStartMs <= now) {
        await releaseLock(client, lockKey);
        return { meetingId, jobId: null, scheduled: false, reason: 'Meeting already started or in the past' };
      }

      const briefingType = getBriefingType(meeting);

      if (!prefs.enabledBriefingTypes.includes(briefingType)) {
        await releaseLock(client, lockKey);
        return { meetingId, jobId: null, scheduled: false, reason: `Briefing type '${briefingType}' not enabled for user` };
      }

      const jobData: BriefingJobData = {
        meetingId,
        meetingData: meeting,
        briefingType,
        userId,
        scheduledAt: now,
      };

      await addBriefingJob(jobId, jobData, delayMs);

      await client.hSet(buildMeetingKey(`${meetingId}:${userId}`), {
        briefingScheduled: String(now),
        jobId,
        status: 'scheduled' satisfies JobStatus,
        briefingType,
        fireAt: String(fireAtMs),
      });

      return { meetingId, jobId, scheduled: true };
    } catch (error) {
      await releaseLock(client, lockKey);
      throw error;
    }
  },

  async cancelMeetingBriefing(meetingId: string, userId: string): Promise<boolean> {
    const client = await getRedisClient();
    const jobId = buildJobId(meetingId, userId);

    const removed = await removeBriefingJob(jobId);

    await client.hSet(buildMeetingKey(`${meetingId}:${userId}`), {
      status: 'cancelled' satisfies JobStatus,
      cancelledAt: String(Date.now()),
    });

    await releaseLock(client, buildLockKey(meetingId, userId));

    return removed;
  },

  async rescheduleMeetingBriefing(
    meeting: MeetingData,
    userId: string
  ): Promise<MeetingScheduleResult> {
    const meetingId = meeting.externalId
      ? uuidv5(meeting.externalId, SCHEDULER_NAMESPACE_UUID)
      : meeting.id;

    await meetingSchedulerService.cancelMeetingBriefing(meetingId, userId);
    return meetingSchedulerService.scheduleMeetingBriefing(meeting, userId);
  },

  async getJobStatus(meetingId: string, userId: string): Promise<ScheduledJobInfo | null> {
    const client = await getRedisClient();
    const jobId = buildJobId(meetingId, userId);
    const raw = await client.hGetAll(buildMeetingKey(`${meetingId}:${userId}`));

    if (!raw || Object.keys(raw).length === 0) return null;

    const queueStatus = await getBriefingJobStatus(jobId);

    return {
      jobId,
      meetingId,
      userId,
      scheduledFireTime: new Date(parseInt(raw.fireAt ?? '0', 10)),
      status: (queueStatus as JobStatus) ?? (raw.status as JobStatus) ?? 'scheduled',
      briefingType: raw.briefingType as BriefingType,
      createdAt: new Date(parseInt(raw.briefingScheduled ?? '0', 10)),
    };
  },

  async processMeetingUpdates(meetings: MeetingData[], userId: string): Promise<CalendarSyncResult> {
    const result: CalendarSyncResult = {
      newMeetings: 0,
      updatedMeetings: 0,
      cancelledMeetings: 0,
      scheduledJobs: 0,
    };

    const client = await getRedisClient();

    for (const meeting of meetings) {
      const meetingId = meeting.externalId
        ? uuidv5(meeting.externalId, SCHEDULER_NAMESPACE_UUID)
        : meeting.id;

      const existing = await client.hGetAll(buildMeetingKey(`${meetingId}:${userId}`));

      if (!existing || Object.keys(existing).length === 0) {
        result.newMeetings++;
        const scheduleResult = await meetingSchedulerService.scheduleMeetingBriefing(meeting, userId);
        if (scheduleResult.scheduled) result.scheduledJobs++;
      } else {
        const existingFireAt = parseInt(existing.fireAt ?? '0', 10);
        const prefs = await meetingSchedulerService.getUserPreferences(userId);
        const newFireAt = new Date(meeting.startTime).getTime() - prefs.briefingLeadTimeMinutes * 60 * 1000;

        if (Math.abs(existingFireAt - newFireAt) > 60_000) {
          result.updatedMeetings++;
          const rescheduleResult = await meetingSchedulerService.rescheduleMeetingBriefing(meeting, userId);
          if (rescheduleResult.scheduled) result.scheduledJobs++;
        }
      }
    }

    return result;
  },

  generateDeterministicId(externalId: string): string {
    return uuidv5(externalId, SCHEDULER_NAMESPACE_UUID);
  },

  generateRandomId(): string {
    return uuidv4();
  },

  startCalendarSyncScheduler(
    syncFn: (userId: string) => Promise<MeetingData[]>,
    userId: string,
    intervalCron = '*/5 * * * *'
  ): void {
    if (calendarSyncTask) {
      calendarSyncTask.stop();
    }

    calendarSyncTask = cron.schedule(
      intervalCron,
      async () => {
        try {
          const meetings = await syncFn(userId);
          const result = await meetingSchedulerService.processMeetingUpdates(meetings, userId);
          console.log(
            `[MeetingSchedulerService] Sync complete — new: ${result.newMeetings}, updated: ${result.updatedMeetings}, jobs: ${result.scheduledJobs}`
          );
        } catch (error) {
          console.error('[MeetingSchedulerService] Calendar sync failed:', (error as Error).message);
        }
      },
      { scheduled: true, timezone: 'UTC' }
    );
  },

  startCleanupScheduler(): void {
    if (cleanupTask) {
      cleanupTask.stop();
    }

    cleanupTask = cron.schedule('0 2 * * *', async () => {
      const { cleanupQueue } = await import('../queues/briefingQueue');
      try {
        await cleanupQueue();
        console.log('[MeetingSchedulerService] Queue cleanup completed');
      } catch (error) {
        console.error('[MeetingSchedulerService] Queue cleanup failed:', (error as Error).message);
      }
    });
  },

  stopSchedulers(): void {
    calendarSyncTask?.stop();
    cleanupTask?.stop();
    calendarSyncTask = null;
    cleanupTask = null;
  },

  async disconnect(): Promise<void> {
    meetingSchedulerService.stopSchedulers();
    if (redisClient) {
      await redisClient.disconnect();
      redisClient = null;
    }
  },

  async getScheduledJobsCount(): Promise<number> {
    const jobs = await getDelayedJobs();
    return jobs.length;
  },
};
