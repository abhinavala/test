import Queue from 'bull';
import { BriefingJobData, BriefingJobResult } from '../types/scheduler';

const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const QUEUE_NAME = 'briefing-generation';

export const briefingQueue = new Queue<BriefingJobData>(QUEUE_NAME, {
  redis: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

briefingQueue.on('error', (error: Error) => {
  console.error(`[BriefingQueue] Queue error:`, error.message);
});

briefingQueue.on('failed', (job, error: Error) => {
  console.error(`[BriefingQueue] Job ${job.id} failed for meeting ${job.data.meetingId}:`, error.message);
});

briefingQueue.on('completed', (job, result: BriefingJobResult) => {
  console.log(`[BriefingQueue] Job ${job.id} completed for meeting ${result.meetingId}`);
});

briefingQueue.on('stalled', (job) => {
  console.warn(`[BriefingQueue] Job ${job.id} stalled for meeting ${job.data.meetingId}`);
});

export async function addBriefingJob(
  jobId: string,
  data: BriefingJobData,
  delayMs: number
): Promise<Queue.Job<BriefingJobData>> {
  return briefingQueue.add('generate-briefing', data, {
    delay: Math.max(0, delayMs),
    jobId,
  });
}

export async function removeBriefingJob(jobId: string): Promise<boolean> {
  const job = await briefingQueue.getJob(jobId);
  if (!job) return false;

  await job.remove();
  return true;
}

export async function getBriefingJobStatus(jobId: string): Promise<string | null> {
  const job = await briefingQueue.getJob(jobId);
  if (!job) return null;

  return job.getState();
}

export async function getDelayedJobs(): Promise<Queue.Job<BriefingJobData>[]> {
  return briefingQueue.getDelayed();
}

export async function cleanupQueue(): Promise<void> {
  await briefingQueue.clean(24 * 60 * 60 * 1000, 'completed');
  await briefingQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed');
}

export function registerBriefingProcessor(
  processor: (job: Queue.Job<BriefingJobData>) => Promise<BriefingJobResult>
): void {
  briefingQueue.process('generate-briefing', 5, processor);
}

export async function closeBriefingQueue(): Promise<void> {
  await briefingQueue.close();
}
