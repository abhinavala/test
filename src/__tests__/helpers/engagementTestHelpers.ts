import { vi } from "vitest";
import type { ParticipantEngagementScore } from "../../types/engagement.js";
import type { TranscriptSegment } from "../../types/transcript.js";

/**
 * Engagement level presets mapping to approximate score ranges.
 */
const ENGAGEMENT_PRESETS: Record<string, {
  talkTimeRatio: number;
  questionCount: number;
  responseRate: number;
  sentimentScore: number;
}> = {
  high: { talkTimeRatio: 0.35, questionCount: 8, responseRate: 0.9, sentimentScore: 0.8 },
  medium: { talkTimeRatio: 0.2, questionCount: 4, responseRate: 0.6, sentimentScore: 0.5 },
  low: { talkTimeRatio: 0.08, questionCount: 1, responseRate: 0.3, sentimentScore: 0.3 },
  silent: { talkTimeRatio: 0, questionCount: 0, responseRate: 0, sentimentScore: 0 },
  "question-heavy": { talkTimeRatio: 0.15, questionCount: 12, responseRate: 0.7, sentimentScore: 0.6 },
};

/**
 * Mock references for engagement-related modules.
 * Exposed so integration tests can configure mock behavior per-test.
 */
export const mockEngagementPrisma = {
  findMany: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  deleteMany: vi.fn(),
  findUnique: vi.fn(),
  disconnect: vi.fn(),
};

export const mockEngagementService = {
  calculateEngagementScores: vi.fn(),
};

export const mockEngagementModel = {
  saveEngagementScores: vi.fn(),
  getEngagementScores: vi.fn(),
};

/**
 * Reset all engagement mock state between tests.
 */
export function resetEngagementMocks(): void {
  vi.resetAllMocks();
  mockEngagementPrisma.findMany.mockResolvedValue([]);
  mockEngagementPrisma.createMany.mockResolvedValue({ count: 0 });
  mockEngagementPrisma.deleteMany.mockResolvedValue({ count: 0 });
  mockEngagementPrisma.disconnect.mockResolvedValue(undefined);
}

/**
 * Calculate a synthetic engagement score from component metrics
 * (mirrors the expected scoring formula).
 */
function computeScore(metrics: {
  talkTimeRatio: number;
  questionCount: number;
  responseRate: number;
  sentimentScore: number;
}): number {
  const talkComponent = Math.min(metrics.talkTimeRatio / 0.4, 1) * 30;
  const questionComponent = Math.min(metrics.questionCount / 10, 1) * 20;
  const responseComponent = metrics.responseRate * 25;
  const sentimentComponent = metrics.sentimentScore * 25;
  return Math.round(
    Math.min(100, Math.max(0, talkComponent + questionComponent + responseComponent + sentimentComponent)),
  );
}

/**
 * Create a single ParticipantEngagementScore record for testing.
 */
export function createEngagementScore(
  sessionId: string,
  participantId: string,
  level: string = "medium",
  overrides: Partial<ParticipantEngagementScore> = {},
): ParticipantEngagementScore {
  const preset = ENGAGEMENT_PRESETS[level] ?? ENGAGEMENT_PRESETS["medium"]!;
  const score = computeScore(preset);

  return {
    id: `score-${sessionId}-${participantId}`,
    sessionId,
    participantId,
    score,
    talkTimeRatio: preset.talkTimeRatio,
    questionCount: preset.questionCount,
    responseRate: preset.responseRate,
    sentimentScore: preset.sentimentScore,
    calculatedAt: new Date("2026-04-04T10:00:00Z"),
    ...overrides,
  };
}

/**
 * Create an array of engagement scores for a session with multiple participants.
 */
export function createEngagementScores(
  sessionId: string,
  participantCount: number,
  engagementLevels: string[] = [],
): ParticipantEngagementScore[] {
  return Array.from({ length: participantCount }, (_, i) => {
    const level = engagementLevels[i] ?? "medium";
    return createEngagementScore(sessionId, `participant-${i + 1}`, level);
  });
}

/**
 * Create transcript segments that reflect specific engagement patterns.
 * Distributes utterances across participants based on engagement levels.
 */
export function createEngagementTranscriptSegments(
  sessionId: string,
  participantCount: number,
  engagementLevels: string[] = [],
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const questions = [
    "What do you think about this approach?",
    "Can we discuss the timeline?",
    "Has anyone reviewed the requirements?",
    "Should we consider an alternative?",
  ];
  const statements = [
    "I think we should proceed with this plan.",
    "The data supports our hypothesis.",
    "Let me share the latest metrics.",
    "We need to address this before the deadline.",
    "I agree with that assessment.",
  ];

  let segIndex = 0;
  const baseTime = 0;

  for (let p = 0; p < participantCount; p++) {
    const level = engagementLevels[p] ?? "medium";
    const preset = ENGAGEMENT_PRESETS[level] ?? ENGAGEMENT_PRESETS["medium"]!;

    // Number of segments proportional to talk time ratio
    const segmentCount = level === "silent" ? 0 : Math.max(1, Math.round(preset.talkTimeRatio * 20));

    for (let s = 0; s < segmentCount; s++) {
      const isQuestion = s < preset.questionCount;
      const textPool = isQuestion ? questions : statements;
      segments.push({
        id: `seg-${sessionId}-${segIndex}`,
        sessionId,
        speakerId: `participant-${p + 1}`,
        startTime: baseTime + segIndex * 10_000,
        endTime: baseTime + (segIndex + 1) * 10_000,
        text: textPool[s % textPool.length]!,
      });
      segIndex++;
    }
  }

  return segments;
}

/**
 * Set up a test session with participants at specified engagement levels.
 * Configures mocks for the engagement scoring service and model.
 * Returns the sessionId for use in test assertions.
 */
export async function setupTestSession(
  participantCount: number,
  engagementLevels: string[],
): Promise<string> {
  const sessionId = `eng-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const scores = createEngagementScores(sessionId, participantCount, engagementLevels);
  const segments = createEngagementTranscriptSegments(sessionId, participantCount, engagementLevels);

  // Configure service mock to return calculated scores
  mockEngagementService.calculateEngagementScores.mockResolvedValue(scores);

  // Configure model mock to return saved scores
  mockEngagementModel.saveEngagementScores.mockResolvedValue(scores);
  mockEngagementModel.getEngagementScores.mockResolvedValue(scores);

  // Configure Prisma mock for direct database operations
  mockEngagementPrisma.findMany.mockResolvedValue(
    scores.map((s) => ({
      ...s,
      calculatedAt: s.calculatedAt,
    })),
  );
  mockEngagementPrisma.createMany.mockResolvedValue({ count: scores.length });

  return sessionId;
}

/**
 * Configure mocks for a successful engagement scoring API response.
 */
export function setupEngagementAPISuccess(
  sessionId: string,
  scores: ParticipantEngagementScore[],
): void {
  mockEngagementModel.getEngagementScores.mockResolvedValue(scores);
  mockEngagementPrisma.findMany.mockResolvedValue(scores);
}

/**
 * Configure mocks for an empty engagement scoring result (no scores found).
 */
export function setupNoEngagementScores(): void {
  mockEngagementModel.getEngagementScores.mockResolvedValue([]);
  mockEngagementPrisma.findMany.mockResolvedValue([]);
}

/**
 * Configure mocks for engagement scoring failure.
 */
export function setupEngagementScoringFailure(error: Error): void {
  mockEngagementService.calculateEngagementScores.mockRejectedValue(error);
}

/**
 * Create a meeting end event for engagement scoring tests.
 */
export function createEngagementMeetingEndEvent(
  sessionId: string,
): { sessionId: string; endTime: number } {
  return {
    sessionId,
    endTime: Date.now(),
  };
}
