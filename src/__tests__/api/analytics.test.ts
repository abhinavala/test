import { describe, it, expect, beforeEach, vi, type MockedObject } from 'vitest';
import { analyticsService } from '../../services/analyticsService';
import type { AnalyticsQueryParams } from '../../types/analytics';

// ---------------------------------------------------------------------------
// Mock Prisma client
// ---------------------------------------------------------------------------

vi.mock('../../db/client', () => {
  const meeting = {
    findMany: vi.fn(),
  };
  const actionItem = {
    findMany: vi.fn(),
  };
  return {
    default: { meeting, actionItem },
  };
});

import prisma from '../../db/client';
const mockPrisma = prisma as unknown as {
  meeting: MockedObject<typeof prisma.meeting>;
  actionItem: MockedObject<typeof prisma.actionItem>;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEETING_ROWS = [
  {
    id: 1,
    createdAt: new Date('2024-01-01T10:00:00Z'),
    healthScore: 80,
    participantCount: 5,
  },
  {
    id: 2,
    createdAt: new Date('2024-01-02T10:00:00Z'),
    healthScore: 60,
    participantCount: 3,
  },
  {
    id: 3,
    createdAt: new Date('2024-01-03T10:00:00Z'),
    healthScore: 90,
    participantCount: 8,
  },
];

const ACTION_ITEM_ROWS = [
  {
    id: 1,
    completedAt: new Date('2024-01-05T12:00:00Z'),
    meeting: { createdAt: new Date('2024-01-01T10:00:00Z') },
  },
  {
    id: 2,
    completedAt: null,
    meeting: { createdAt: new Date('2024-01-01T10:00:00Z') },
  },
  {
    id: 3,
    completedAt: new Date('2024-01-06T12:00:00Z'),
    meeting: { createdAt: new Date('2024-01-02T10:00:00Z') },
  },
];

const BASE_PARAMS: AnalyticsQueryParams = {
  startDate: '2024-01-01',
  endDate: '2024-01-07',
  period: 'daily',
};

// ---------------------------------------------------------------------------
// Health score trends
// ---------------------------------------------------------------------------

describe('analyticsService.getHealthScoreTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregated daily health score data', async () => {
    mockPrisma.meeting.findMany.mockResolvedValue(MEETING_ROWS as any);

    const result = await analyticsService.getHealthScoreTrends(BASE_PARAMS);

    expect(result.totalRecords).toBe(3);
    expect(result.data).toHaveLength(3);
    expect(result.cacheHit).toBe(false);

    const first = result.data[0];
    expect(first.value).toBe(80);
    expect(first.count).toBe(1);
  });

  it('returns empty result set when no meetings exist', async () => {
    mockPrisma.meeting.findMany.mockResolvedValue([]);

    const result = await analyticsService.getHealthScoreTrends(BASE_PARAMS);

    expect(result.data).toEqual([]);
    expect(result.totalRecords).toBe(0);
    expect(result.averageScore).toBe(0);
  });

  it('computes correct average score across all meetings', async () => {
    mockPrisma.meeting.findMany.mockResolvedValue(MEETING_ROWS as any);

    const result = await analyticsService.getHealthScoreTrends(BASE_PARAMS);

    const expected = Math.round(((80 + 60 + 90) / 3) * 100) / 100;
    expect(result.averageScore).toBe(expected);
  });

  it('aggregates multiple meetings in the same daily bucket', async () => {
    const sameDayMeetings = [
      { id: 1, createdAt: new Date('2024-01-01T09:00:00Z'), healthScore: 70, participantCount: 4 },
      { id: 2, createdAt: new Date('2024-01-01T15:00:00Z'), healthScore: 90, participantCount: 6 },
    ];
    mockPrisma.meeting.findMany.mockResolvedValue(sameDayMeetings as any);

    const result = await analyticsService.getHealthScoreTrends(BASE_PARAMS);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].count).toBe(2);
    expect(result.data[0].value).toBe(80); // (70+90)/2
  });

  it('throws on invalid date range (end before start)', async () => {
    await expect(
      analyticsService.getHealthScoreTrends({
        startDate: '2024-01-10',
        endDate: '2024-01-01',
      }),
    ).rejects.toThrow('endDate must be after startDate');
  });

  it('throws on invalid period value', async () => {
    await expect(
      analyticsService.getHealthScoreTrends({
        ...BASE_PARAMS,
        period: 'hourly' as any,
      }),
    ).rejects.toThrow('period must be one of');
  });

  it('throws when date range exceeds 365 days', async () => {
    await expect(
      analyticsService.getHealthScoreTrends({
        startDate: '2023-01-01',
        endDate: '2024-12-31',
      }),
    ).rejects.toThrow('Date range cannot exceed 365 days');
  });

  it('applies weekly aggregation correctly', async () => {
    mockPrisma.meeting.findMany.mockResolvedValue(MEETING_ROWS as any);

    const result = await analyticsService.getHealthScoreTrends({
      ...BASE_PARAMS,
      period: 'weekly',
    });

    // All three meetings fall in the same week (week starting 2023-12-31)
    expect(result.data).toHaveLength(1);
    expect(result.data[0].count).toBe(3);
  });

  it('filters by meetingIds when provided', async () => {
    mockPrisma.meeting.findMany.mockResolvedValue([MEETING_ROWS[0]] as any);

    await analyticsService.getHealthScoreTrends({
      ...BASE_PARAMS,
      meetingIds: [1],
    });

    expect(mockPrisma.meeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [1] },
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Completion rates
// ---------------------------------------------------------------------------

describe('analyticsService.getCompletionRates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns completion rates aggregated by period', async () => {
    mockPrisma.actionItem.findMany.mockResolvedValue(ACTION_ITEM_ROWS as any);

    const result = await analyticsService.getCompletionRates(BASE_PARAMS);

    expect(result.totalRecords).toBe(3);
    expect(result.cacheHit).toBe(false);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('calculates overall completion rate correctly', async () => {
    mockPrisma.actionItem.findMany.mockResolvedValue(ACTION_ITEM_ROWS as any);

    const result = await analyticsService.getCompletionRates(BASE_PARAMS);

    // 2 of 3 action items are completed → 66.67 %
    expect(result.overallCompletionRate).toBeCloseTo(66.67, 1);
  });

  it('returns 0% completion when no items are completed', async () => {
    const noneCompleted = ACTION_ITEM_ROWS.map((r) => ({ ...r, completedAt: null }));
    mockPrisma.actionItem.findMany.mockResolvedValue(noneCompleted as any);

    const result = await analyticsService.getCompletionRates(BASE_PARAMS);

    expect(result.overallCompletionRate).toBe(0);
    result.data.forEach((point) => expect(point.completionRate).toBe(0));
  });

  it('returns 100% completion when all items are completed', async () => {
    const allCompleted = ACTION_ITEM_ROWS.map((r) => ({
      ...r,
      completedAt: new Date('2024-01-05T12:00:00Z'),
    }));
    mockPrisma.actionItem.findMany.mockResolvedValue(allCompleted as any);

    const result = await analyticsService.getCompletionRates(BASE_PARAMS);

    expect(result.overallCompletionRate).toBe(100);
  });

  it('returns empty result when no action items exist', async () => {
    mockPrisma.actionItem.findMany.mockResolvedValue([]);

    const result = await analyticsService.getCompletionRates(BASE_PARAMS);

    expect(result.data).toEqual([]);
    expect(result.totalRecords).toBe(0);
    expect(result.overallCompletionRate).toBe(0);
  });

  it('throws on invalid date range', async () => {
    await expect(
      analyticsService.getCompletionRates({
        startDate: '2024-06-01',
        endDate: '2024-01-01',
      }),
    ).rejects.toThrow('endDate must be after startDate');
  });
});

// ---------------------------------------------------------------------------
// Engagement metrics
// ---------------------------------------------------------------------------

describe('analyticsService.getEngagementMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns engagement metrics with normalised scores', async () => {
    mockPrisma.meeting.findMany.mockResolvedValue(MEETING_ROWS as any);

    const result = await analyticsService.getEngagementMetrics(BASE_PARAMS);

    expect(result.totalRecords).toBe(3);
    expect(result.cacheHit).toBe(false);
    result.data.forEach((point) => {
      expect(point.engagementScore).toBeGreaterThanOrEqual(0);
      expect(point.engagementScore).toBeLessThanOrEqual(100);
    });
  });

  it('returns 50 as engagement score when all meetings have identical participant counts', async () => {
    const uniform = MEETING_ROWS.map((m) => ({ ...m, participantCount: 5 }));
    mockPrisma.meeting.findMany.mockResolvedValue(uniform as any);

    const result = await analyticsService.getEngagementMetrics(BASE_PARAMS);

    result.data.forEach((point) => {
      expect(point.engagementScore).toBe(50);
    });
    expect(result.averageEngagement).toBe(50);
  });

  it('returns empty result when no meetings exist', async () => {
    mockPrisma.meeting.findMany.mockResolvedValue([]);

    const result = await analyticsService.getEngagementMetrics(BASE_PARAMS);

    expect(result.data).toEqual([]);
    expect(result.totalRecords).toBe(0);
    expect(result.averageEngagement).toBe(0);
  });

  it('includes avg_participants and meeting_count in each data point', async () => {
    mockPrisma.meeting.findMany.mockResolvedValue(MEETING_ROWS as any);

    const result = await analyticsService.getEngagementMetrics(BASE_PARAMS);

    result.data.forEach((point) => {
      expect(typeof point.avgParticipants).toBe('number');
      expect(typeof point.meetingCount).toBe('number');
      expect(point.meetingCount).toBeGreaterThan(0);
    });
  });

  it('throws on invalid date range', async () => {
    await expect(
      analyticsService.getEngagementMetrics({
        startDate: '2024-06-01',
        endDate: '2024-01-01',
      }),
    ).rejects.toThrow('endDate must be after startDate');
  });

  it('applies monthly aggregation', async () => {
    mockPrisma.meeting.findMany.mockResolvedValue(MEETING_ROWS as any);

    const result = await analyticsService.getEngagementMetrics({
      ...BASE_PARAMS,
      period: 'monthly',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].meetingCount).toBe(3);
  });
});
