import { NextStepPriority } from "../../types/meeting-summary.js";
import type { MeetingSessionSummary } from "../../types/meeting-summary.js";
import type { TranscriptSegment } from "../../types/transcript.js";
import type { ActionItem } from "../../types/exportContent.js";
import type { MeetingSession } from "../../types/meeting-config.js";
import type { SummaryExtractionResult } from "../../types/ai-summary.js";

/**
 * Alias: Create mock transcript data for testing.
 */
export function createMockTranscriptData(
  sessionId: string,
  count = 5,
): TranscriptSegment[] {
  return createTranscriptSegments(sessionId, count);
}

/**
 * Alias: Create mock action items for testing.
 */
export function createMockActionItems(count = 2): ActionItem[] {
  return createActionItems(count);
}

/**
 * Create transcript segments for testing.
 * Generates realistic meeting transcript data with configurable count and content.
 */
export function createTranscriptSegments(
  sessionId: string,
  count = 5,
  textOverride?: string,
): TranscriptSegment[] {
  const speakers = ["speaker-alice", "speaker-bob", "speaker-charlie"];
  const sampleTexts = [
    "I think we should move forward with the TypeScript migration for all services.",
    "That sounds good. What about the timeline? Can we have it done by end of quarter?",
    "We need to consider the testing strategy. Should we use integration tests or unit tests primarily?",
    "Let me follow up on the budget approval. I'll send the proposal by Friday.",
    "The deployment pipeline needs updating. Alice, can you take ownership of that?",
    "I agree with the microservices approach. Let's document the decision.",
    "What about backward compatibility? We should discuss that in the next meeting.",
    "The performance benchmarks look promising. We exceeded the target by 15%.",
    "Can someone clarify the requirements for the API versioning strategy?",
    "I'll draft the migration plan and share it with the team by Monday.",
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: `seg-${sessionId}-${i}`,
    sessionId,
    speakerId: speakers[i % speakers.length]!,
    startTime: i * 10_000,
    endTime: (i + 1) * 10_000,
    text: textOverride ?? sampleTexts[i % sampleTexts.length]!,
  }));
}

/**
 * Create action items for testing.
 */
export function createActionItems(count = 2): ActionItem[] {
  const items: ActionItem[] = [
    {
      id: "action-1",
      description: "Draft migration plan for TypeScript services",
      assigneeName: "Alice",
      assigneeId: "user-alice",
      status: "open",
      priority: "high",
      dueDate: "2026-04-10T00:00:00Z",
    },
    {
      id: "action-2",
      description: "Review deployment pipeline configuration",
      assigneeName: "Bob",
      assigneeId: "user-bob",
      status: "in-progress",
      priority: "medium",
    },
    {
      id: "action-3",
      description: "Update API documentation",
      assigneeName: "Charlie",
      status: "open",
      priority: "low",
    },
  ];
  return items.slice(0, count);
}

/**
 * Create a mock AI extraction result.
 */
export function createExtractionResult(
  overrides: Partial<SummaryExtractionResult> = {},
): SummaryExtractionResult {
  return {
    keyDecisions: [
      {
        id: "kd-1",
        description: "Adopt TypeScript for all new services",
        participants: ["alice", "bob"],
        madeAt: "2026-04-03T10:30:00Z",
        context: "Architecture review discussion",
      },
      {
        id: "kd-2",
        description: "Use microservices architecture for the new platform",
        participants: ["alice", "charlie"],
        context: "Platform design session",
      },
    ],
    openQuestions: [
      {
        id: "oq-1",
        question: "What is the deployment timeline for Q2?",
        raisedBy: "bob",
        context: "Timeline discussion",
      },
    ],
    nextSteps: [
      {
        id: "ns-1",
        description: "Draft migration plan",
        assigneeName: "Alice",
        assigneeId: "user-alice",
        priority: NextStepPriority.HIGH,
        dueDate: "2026-04-10T00:00:00Z",
      },
      {
        id: "ns-2",
        description: "Set up CI/CD pipeline",
        assigneeName: "Bob",
        priority: NextStepPriority.MEDIUM,
      },
    ],
    confidence: 0.85,
    processingTime: 1500,
    ...overrides,
  };
}

/**
 * Create a mock Prisma summary database record.
 */
export function createSummaryRecord(meetingSessionId: string) {
  return {
    id: `summary-${meetingSessionId}`,
    meetingSessionId,
    generatedAt: new Date("2026-04-03T10:00:00Z"),
    generatedBy: "ai-summary-service",
    createdAt: new Date("2026-04-03T10:00:00Z"),
    updatedAt: new Date("2026-04-03T10:00:00Z"),
    keyDecisions: [
      {
        id: "kd-rec-1",
        summaryId: `summary-${meetingSessionId}`,
        description: "Adopt TypeScript for all new services",
        participants: JSON.stringify(["alice", "bob"]),
        madeAt: new Date("2026-04-03T10:30:00Z"),
        context: "Architecture review discussion",
      },
    ],
    openQuestions: [
      {
        id: "oq-rec-1",
        summaryId: `summary-${meetingSessionId}`,
        question: "What is the deployment timeline for Q2?",
        ownerId: null,
        raisedBy: "bob",
        context: "Timeline discussion",
      },
    ],
    nextSteps: [
      {
        id: "ns-rec-1",
        summaryId: `summary-${meetingSessionId}`,
        description: "Draft migration plan",
        assigneeId: "user-alice",
        assigneeName: "Alice",
        priority: NextStepPriority.HIGH,
        dueDate: new Date("2026-04-10T00:00:00Z"),
      },
    ],
  };
}

/**
 * Create a domain-level MeetingSessionSummary object.
 */
export function createMeetingSummary(
  meetingSessionId: string,
  overrides: Partial<MeetingSessionSummary> = {},
): MeetingSessionSummary {
  return {
    id: `summary-${meetingSessionId}`,
    meetingSessionId,
    keyDecisions: [
      {
        id: "kd-1",
        description: "Adopt TypeScript for all new services",
        participants: ["alice", "bob"],
        madeAt: "2026-04-03T10:30:00Z",
        context: "Architecture review discussion",
      },
    ],
    openQuestions: [
      {
        id: "oq-1",
        question: "What is the deployment timeline for Q2?",
        raisedBy: "bob",
        context: "Timeline discussion",
      },
    ],
    nextSteps: [
      {
        id: "ns-1",
        description: "Draft migration plan",
        assigneeId: "user-alice",
        assigneeName: "Alice",
        priority: NextStepPriority.HIGH,
        dueDate: "2026-04-10T00:00:00Z",
      },
    ],
    generatedAt: new Date("2026-04-03T10:00:00Z"),
    generatedBy: "ai-summary-service",
    ...overrides,
  };
}

/**
 * Create a MeetingSession for meeting end handler testing.
 */
export function createMeetingSession(
  overrides: Partial<MeetingSession> = {},
): MeetingSession {
  const now = Date.now();
  return {
    sessionId: "test-session-1",
    startTime: now - 120_000, // 2 minutes ago
    endTime: now,
    ...overrides,
  };
}

/**
 * Create a short meeting session (below min duration threshold).
 */
export function createShortMeetingSession(): MeetingSession {
  const now = Date.now();
  return {
    sessionId: "short-session",
    startTime: now - 30_000, // 30 seconds — below 60s threshold
    endTime: now,
  };
}

/**
 * Create a meeting with minimal transcript data (only action items).
 */
export function createMinimalMeetingData(sessionId: string) {
  return {
    transcriptSegments: [] as TranscriptSegment[],
    actionItems: createActionItems(1),
    sessionId,
  };
}

/**
 * Create a meeting with rich transcript content.
 */
export function createRichMeetingData(sessionId: string) {
  return {
    transcriptSegments: createTranscriptSegments(sessionId, 10),
    actionItems: createActionItems(3),
    sessionId,
  };
}
