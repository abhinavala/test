import { Request, Response, NextFunction } from 'express';
import { meetingSchedulerService } from '../services/meetingSchedulerService';
import { MeetingData, UserSchedulerPreferences } from '../types/scheduler';

export const SCHEDULER_ROUTES = {
  SCHEDULE_MEETING: '/api/scheduler/meetings/:meetingId',
  CANCEL_MEETING: '/api/scheduler/meetings/:meetingId/cancel',
  RESCHEDULE_MEETING: '/api/scheduler/meetings/:meetingId/reschedule',
  JOB_STATUS: '/api/scheduler/meetings/:meetingId/status',
  USER_PREFERENCES: '/api/scheduler/preferences',
  SYNC: '/api/scheduler/sync',
  JOBS_COUNT: '/api/scheduler/jobs/count',
};

export async function scheduleMeeting(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { meetingId } = req.params;
    const userId: string = (req as Request & { userId?: string }).userId ?? req.body.userId;
    const meetingData: MeetingData = { ...req.body, id: meetingId };

    if (!userId) {
      res.status(400).json({ error: 'MISSING_USER_ID', message: 'userId is required' });
      return;
    }

    const result = await meetingSchedulerService.scheduleMeetingBriefing(meetingData, userId);
    res.status(result.scheduled ? 201 : 200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function cancelMeeting(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { meetingId } = req.params;
    const userId: string = (req as Request & { userId?: string }).userId ?? req.body.userId;

    if (!userId) {
      res.status(400).json({ error: 'MISSING_USER_ID', message: 'userId is required' });
      return;
    }

    const cancelled = await meetingSchedulerService.cancelMeetingBriefing(meetingId, userId);
    res.status(200).json({ meetingId, cancelled });
  } catch (error) {
    next(error);
  }
}

export async function rescheduleMeeting(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { meetingId } = req.params;
    const userId: string = (req as Request & { userId?: string }).userId ?? req.body.userId;
    const meetingData: MeetingData = { ...req.body, id: meetingId };

    if (!userId) {
      res.status(400).json({ error: 'MISSING_USER_ID', message: 'userId is required' });
      return;
    }

    const result = await meetingSchedulerService.rescheduleMeetingBriefing(meetingData, userId);
    res.status(result.scheduled ? 200 : 200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getJobStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { meetingId } = req.params;
    const userId: string = (req as Request & { userId?: string }).userId ?? (req.query.userId as string);

    if (!userId) {
      res.status(400).json({ error: 'MISSING_USER_ID', message: 'userId is required' });
      return;
    }

    const status = await meetingSchedulerService.getJobStatus(meetingId, userId);

    if (!status) {
      res.status(404).json({ error: 'JOB_NOT_FOUND', message: 'No scheduled job found for this meeting' });
      return;
    }

    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
}

export async function getUserPreferences(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId: string = (req as Request & { userId?: string }).userId ?? (req.query.userId as string);

    if (!userId) {
      res.status(400).json({ error: 'MISSING_USER_ID', message: 'userId is required' });
      return;
    }

    const prefs = await meetingSchedulerService.getUserPreferences(userId);
    res.status(200).json(prefs);
  } catch (error) {
    next(error);
  }
}

export async function updateUserPreferences(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId: string = (req as Request & { userId?: string }).userId ?? req.body.userId;

    if (!userId) {
      res.status(400).json({ error: 'MISSING_USER_ID', message: 'userId is required' });
      return;
    }

    const prefs: UserSchedulerPreferences = { ...req.body, userId };
    await meetingSchedulerService.setUserPreferences(prefs);
    res.status(200).json({ updated: true, preferences: prefs });
  } catch (error) {
    next(error);
  }
}

export async function syncMeetings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId: string = (req as Request & { userId?: string }).userId ?? req.body.userId;
    const meetings: MeetingData[] = req.body.meetings ?? [];

    if (!userId) {
      res.status(400).json({ error: 'MISSING_USER_ID', message: 'userId is required' });
      return;
    }

    const result = await meetingSchedulerService.processMeetingUpdates(meetings, userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getScheduledJobsCount(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const count = await meetingSchedulerService.getScheduledJobsCount();
    res.status(200).json({ count });
  } catch (error) {
    next(error);
  }
}
