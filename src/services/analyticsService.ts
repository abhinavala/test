import prisma from '../db/client';
import type {
  AnalyticsQueryParams,
  AggregationPeriod,
  HealthScoreResponse,
  CompletionRateResponse,
  EngagementResponse,
  TimeSeriesPoint,
  CompletionRatePoint,
  EngagementPoint,
} from '../types/analytics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PERIOD_TO_MS: Record<AggregationPeriod, number> = {
  daily: 86_400_000,
  weekly: 7 * 86_400_000,
  monthly: 30 * 86_400_000,
};

/**
 * Bucket a UTC timestamp into the start of its period window.
 */
function bucketTimestamp(ts: Date, period: AggregationPeriod): Date {
  const d = new Date(ts);
  if (period === 'daily') {
    d.setUTCHours(0, 0, 0, 0);
  } else if (period === 'weekly') {
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - day);
    d.setUTCHours(0, 0, 0, 0);
  } else {
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
  }
  return d;
}

function parseDate(dateStr: string): Date {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return d;
}

function validateParams(params: AnalyticsQueryParams): void {
  const start = parseDate(params.startDate);
  const end = parseDate(params.endDate);
  if (end < start) {
    throw new Error('endDate must be after startDate');
  }
  const maxDays = 365;
  if ((end.getTime() - start.getTime()) / 86_400_000 > maxDays) {
    throw new Error(`Date range cannot exceed ${maxDays} days`);
  }
  const period = params.period ?? 'daily';
  if (!['daily', 'weekly', 'monthly'].includes(period)) {
    throw new Error('period must be one of: daily, weekly, monthly');
  }
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

export const analyticsService = {
  /**
   * Retrieve health score trends for meetings in the given date range.
   */
  async getHealthScoreTrends(
    params: AnalyticsQueryParams,
  ): Promise<HealthScoreResponse> {
    validateParams(params);

    const period: AggregationPeriod = params.period ?? 'daily';
    const startDate = parseDate(params.startDate);
    const endDate = parseDate(params.endDate);
    // Include entire end day
    endDate.setUTCHours(23, 59, 59, 999);

    const meetings = await prisma.meeting.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        ...(params.meetingIds?.length
          ? { id: { in: params.meetingIds } }
          : {}),
      },
      select: { id: true, createdAt: true, healthScore: true },
      orderBy: { createdAt: 'asc' },
    });

    if (meetings.length === 0) {
      return { data: [], totalRecords: 0, averageScore: 0, cacheHit: false };
    }

    // Aggregate into buckets
    const buckets = new Map<string, { sum: number; count: number }>();
    let totalScore = 0;

    for (const m of meetings) {
      const bucket = bucketTimestamp(m.createdAt, period);
      const key = bucket.toISOString();
      const entry = buckets.get(key) ?? { sum: 0, count: 0 };
      const score = m.healthScore ?? 0;
      entry.sum += score;
      entry.count += 1;
      buckets.set(key, entry);
      totalScore += score;
    }

    const data: TimeSeriesPoint[] = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, { sum, count }]) => ({
        timestamp,
        value: Math.round((sum / count) * 100) / 100,
        count,
      }));

    return {
      data,
      totalRecords: meetings.length,
      averageScore: Math.round((totalScore / meetings.length) * 100) / 100,
      cacheHit: false,
    };
  },

  /**
   * Retrieve action item completion rates grouped by period.
   */
  async getCompletionRates(
    params: AnalyticsQueryParams,
  ): Promise<CompletionRateResponse> {
    validateParams(params);

    const period: AggregationPeriod = params.period ?? 'daily';
    const startDate = parseDate(params.startDate);
    const endDate = parseDate(params.endDate);
    endDate.setUTCHours(23, 59, 59, 999);

    const actionItems = await prisma.actionItem.findMany({
      where: {
        meeting: {
          createdAt: { gte: startDate, lte: endDate },
          ...(params.meetingIds?.length
            ? { id: { in: params.meetingIds } }
            : {}),
        },
      },
      select: {
        id: true,
        completedAt: true,
        meeting: { select: { createdAt: true } },
      },
      orderBy: { meeting: { createdAt: 'asc' } },
    });

    if (actionItems.length === 0) {
      return {
        data: [],
        totalRecords: 0,
        overallCompletionRate: 0,
        cacheHit: false,
      };
    }

    const buckets = new Map<
      string,
      { total: number; completed: number }
    >();

    let totalCompleted = 0;

    for (const item of actionItems) {
      const bucket = bucketTimestamp(item.meeting.createdAt, period);
      const key = bucket.toISOString();
      const entry = buckets.get(key) ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (item.completedAt !== null) {
        entry.completed += 1;
        totalCompleted += 1;
      }
      buckets.set(key, entry);
    }

    const data: CompletionRatePoint[] = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, { total, completed }]) => ({
        timestamp,
        completionRate: total > 0 ? Math.round((completed / total) * 10_000) / 100 : 0,
        totalItems: total,
        completedItems: completed,
      }));

    const overallCompletionRate =
      Math.round((totalCompleted / actionItems.length) * 10_000) / 100;

    return {
      data,
      totalRecords: actionItems.length,
      overallCompletionRate,
      cacheHit: false,
    };
  },

  /**
   * Retrieve participant engagement metrics grouped by period.
   *
   * Engagement score is a normalised value (0–100) derived from participant
   * counts relative to the global mean for the queried period.
   */
  async getEngagementMetrics(
    params: AnalyticsQueryParams,
  ): Promise<EngagementResponse> {
    validateParams(params);

    const period: AggregationPeriod = params.period ?? 'daily';
    const startDate = parseDate(params.startDate);
    const endDate = parseDate(params.endDate);
    endDate.setUTCHours(23, 59, 59, 999);

    const meetings = await prisma.meeting.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        ...(params.meetingIds?.length
          ? { id: { in: params.meetingIds } }
          : {}),
      },
      select: { id: true, createdAt: true, participantCount: true },
      orderBy: { createdAt: 'asc' },
    });

    if (meetings.length === 0) {
      return {
        data: [],
        totalRecords: 0,
        averageEngagement: 0,
        cacheHit: false,
      };
    }

    const counts = meetings.map((m) => m.participantCount ?? 0);
    const globalMean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance =
      counts.reduce((sum, c) => sum + (c - globalMean) ** 2, 0) / counts.length;
    const globalStd = Math.sqrt(variance);

    const normalise = (count: number): number => {
      if (globalStd === 0) return 50;
      return Math.min(100, Math.max(0, ((count - globalMean) / globalStd) * 10 + 50));
    };

    const buckets = new Map<
      string,
      { scoreSum: number; participantSum: number; count: number }
    >();

    for (const m of meetings) {
      const bucket = bucketTimestamp(m.createdAt, period);
      const key = bucket.toISOString();
      const entry = buckets.get(key) ?? { scoreSum: 0, participantSum: 0, count: 0 };
      const participantCount = m.participantCount ?? 0;
      entry.scoreSum += normalise(participantCount);
      entry.participantSum += participantCount;
      entry.count += 1;
      buckets.set(key, entry);
    }

    const data: EngagementPoint[] = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, { scoreSum, participantSum, count }]) => ({
        timestamp,
        engagementScore: Math.round((scoreSum / count) * 100) / 100,
        avgParticipants: Math.round((participantSum / count) * 100) / 100,
        meetingCount: count,
      }));

    const allScores = meetings.map((m) => normalise(m.participantCount ?? 0));
    const averageEngagement =
      Math.round(
        (allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100,
      ) / 100;

    return {
      data,
      totalRecords: meetings.length,
      averageEngagement,
      cacheHit: false,
    };
  },
};
