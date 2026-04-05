import { vi } from "vitest";
import type { ParticipantEngagementScore } from "../../types/engagement.js";
import type { TranscriptSegment } from "../../types/transcript.js";

/**
 * Mock Prisma operations for engagement score persistence.
 */
export const mockEngagementPrisma = {
  findMany: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  deleteMany: vi.fn(),
  disconnect: vi.fn(),
};

/**
 * Mock engagement calculation service.
 */
export const mockCalculateEngagement = vi.fn();

/**
 * Reset all engagement mock state between tests.
 */
export function resetEngagementMocks(): void {
  vi.resetAllMocks();
}

/**
 * Create realistic transcript segments for engagement scoring tests.
 * Generates segments with varied speakers, question patterns, and durations.
 */
export function createEngagementTranscriptSegments(
  sessionId: string,
  participantCount = 3,
  segmentsPerParticipant = 4,
): TranscriptSegment[] {
  const participants = Array.from({ length: participantCount }, (_, i) => `participant-${i + 1}`);

  const questionTexts = [
    "What do you think about this approach?",
    "Can we revisit the timeline for this deliverable?",
    "Has anyone considered the security implications?",
    "Should we schedule a follow-up meeting to discuss?",
  ];

  const statementTexts = [
    "I think the current implementation is solid and ready for review.",
    "We should prioritize the database migration before the API changes.",
    "The metrics from last sprint show a 20% improvement in response times.",
    "I agree with the proposed architecture changes.",
    "Let me share the results from the load testing we ran yesterday.",
    "The client feedback has been overwhelmingly positive so far.",
  ];

  const segments: TranscriptSegment[] = [];
  let segIndex = 0;

  for (let round = 0; round < segmentsPerParticipant; round++) {
    for (let p = 0; p < participants.length; p++) {
      const isQuestion = round === 0 && p === 0 || round === 2 && p === 1;
      const text = isQuestion
        ? questionTexts[segIndex % questionTexts.length]!
        : statementTexts[segIndex % statementTexts.length]!;

      segments.push({
        id: `seg-${sessionId}-${segIndex}`,
        sessionId,
        speakerId: participants[p]!,
        startTime: segIndex * 15_000,
        endTime: (segIndex + 1) * 15_000,
        text,
      });
      segIndex++;
    }
  }

  return segments;
}

/**
 * Create mock engagement score data for a session with multiple participants.
 */
export function createMockEngagementScores(
  sessionId: string,
  participantCount = 3,
): ParticipantEngagementScore[] {
  const scores: ParticipantEngagementScore[] = [];

  const profiles = [
    { score: 85, talkTimeRatio: 0.45, questionCount: 5, responseRate: 0.92, sentimentScore: 0.78 },
    { score: 62, talkTimeRatio: 0.30, questionCount: 2, responseRate: 0.75, sentimentScore: 0.65 },
    { score: 48, talkTimeRatio: 0.15, questionCount: 1, responseRate: 0.50, sentimentScore: 0.55 },
    { score: 71, talkTimeRatio: 0.35, questionCount: 3, responseRate: 0.80, sentimentScore: 0.70 },
  ];

  for (let i = 0; i < participantCount; i++) {
    const profile = profiles[i % profiles.length]!;
    scores.push({
      id: `score-${sessionId}-${i}`,
      sessionId,
      participantId: `participant-${i + 1}`,
      score: profile.score,
      talkTimeRatio: profile.talkTimeRatio,
      questionCount: profile.questionCount,
      responseRate: profile.responseRate,
      sentimentScore: profile.sentimentScore,
      calculatedAt: new Date("2026-04-04T10:00:00Z"),
    });
  }

  return scores;
}

/**
 * Create mock engagement scores for edge-case scenarios.
 */
export function createDominantSpeakerScores(sessionId: string): ParticipantEngagementScore[] {
  return [
    {
      id: `score-${sessionId}-dominant`,
      sessionId,
      participantId: "participant-dominant",
      score: 95,
      talkTimeRatio: 0.80,
      questionCount: 8,
      responseRate: 0.98,
      sentimentScore: 0.85,
      calculatedAt: new Date("2026-04-04T10:00:00Z"),
    },
    {
      id: `score-${sessionId}-passive`,
      sessionId,
      participantId: "participant-passive",
      score: 15,
      talkTimeRatio: 0.05,
      questionCount: 0,
      responseRate: 0.20,
      sentimentScore: 0.40,
      calculatedAt: new Date("2026-04-04T10:00:00Z"),
    },
  ];
}

/**
 * Create mock engagement scores for a short meeting (minimal data).
 */
export function createShortMeetingScores(sessionId: string): ParticipantEngagementScore[] {
  return [
    {
      id: `score-${sessionId}-0`,
      sessionId,
      participantId: "participant-1",
      score: 30,
      talkTimeRatio: 0.50,
      questionCount: 0,
      responseRate: 0.0,
      sentimentScore: 0.50,
      calculatedAt: new Date("2026-04-04T10:00:00Z"),
    },
  ];
}

/**
 * Create mock engagement scores for a meeting with no questions asked.
 */
export function createNoQuestionScores(sessionId: string): ParticipantEngagementScore[] {
  return [
    {
      id: `score-${sessionId}-0`,
      sessionId,
      participantId: "participant-1",
      score: 55,
      talkTimeRatio: 0.40,
      questionCount: 0,
      responseRate: 0.60,
      sentimentScore: 0.65,
      calculatedAt: new Date("2026-04-04T10:00:00Z"),
    },
    {
      id: `score-${sessionId}-1`,
      sessionId,
      participantId: "participant-2",
      score: 50,
      talkTimeRatio: 0.35,
      questionCount: 0,
      responseRate: 0.55,
      sentimentScore: 0.60,
      calculatedAt: new Date("2026-04-04T10:00:00Z"),
    },
  ];
}

/**
 * Set up mock Prisma to return engagement scores for a session.
 */
export function setupExistingEngagementScores(
  sessionId: string,
  scores?: ParticipantEngagementScore[],
): void {
  const data = scores ?? createMockEngagementScores(sessionId);
  mockEngagementPrisma.findMany.mockResolvedValue(data);
}

/**
 * Set up mock Prisma to return empty engagement scores (no data found).
 */
export function setupNoEngagementScores(): void {
  mockEngagementPrisma.findMany.mockResolvedValue([]);
}

/**
 * Set up mock engagement calculation to return computed scores.
 */
export function setupSuccessfulEngagementCalculation(
  sessionId: string,
  scores?: ParticipantEngagementScore[],
): void {
  const data = scores ?? createMockEngagementScores(sessionId);
  mockCalculateEngagement.mockResolvedValue(data);
}

/**
 * Set up mock engagement calculation to simulate a failure.
 */
export function setupFailingEngagementCalculation(error: Error): void {
  mockCalculateEngagement.mockRejectedValue(error);
}

/**
 * Set up mock Prisma create to successfully persist engagement scores.
 */
export function setupSuccessfulEngagementCreate(sessionId: string): void {
  const scores = createMockEngagementScores(sessionId);
  mockEngagementPrisma.createMany.mockResolvedValue({ count: scores.length });
  mockEngagementPrisma.create.mockImplementation(
    (args: { data: { participantId: string } }) => {
      const match = scores.find((s) => s.participantId === args.data.participantId);
      return Promise.resolve(match ?? scores[0]);
    },
  );
}

/**
 * Set up mock Prisma deleteMany for test cleanup verification.
 */
export function setupSuccessfulEngagementCleanup(): void {
  mockEngagementPrisma.deleteMany.mockResolvedValue({ count: 0 });
}

/**
 * Set up test meeting data for a complete engagement scoring workflow.
 */
export async function setupTestMeetingData(sessionId: string): Promise<void> {
  setupSuccessfulEngagementCalculation(sessionId);
  setupSuccessfulEngagementCreate(sessionId);
  setupSuccessfulEngagementCleanup();
}
