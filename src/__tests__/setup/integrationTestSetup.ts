import { vi } from "vitest";
import { NextStepPriority } from "../../types/meeting-summary.js";
import type { SummaryExtractionResult } from "../../types/ai-summary.js";

/**
 * Mock function references for integration test control.
 * These are exposed so integration tests can configure mock behavior per-test.
 */
export const mockPrisma = {
  findUnique: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
  disconnect: vi.fn(),
};

export const mockAIExtract = vi.fn();

export const mockLocking = {
  acquireLock: vi.fn().mockReturnValue(true),
  releaseLock: vi.fn(),
  isLocked: vi.fn().mockReturnValue(false),
  clearAllLocks: vi.fn(),
};

/**
 * Reset all mock state between tests.
 */
export function resetAllMocks(): void {
  vi.resetAllMocks();
  mockLocking.acquireLock.mockReturnValue(true);
  mockLocking.isLocked.mockReturnValue(false);
}

/**
 * Configure the AI mock to return a successful extraction result.
 */
export function setupSuccessfulAIExtraction(
  overrides: Partial<SummaryExtractionResult> = {},
): void {
  const result: SummaryExtractionResult = {
    keyDecisions: [
      {
        id: "kd-1",
        description: "Adopt TypeScript for all new services",
        participants: ["alice", "bob"],
        madeAt: "2026-04-03T10:30:00Z",
        context: "Architecture review",
      },
    ],
    openQuestions: [
      {
        id: "oq-1",
        question: "What is the deployment timeline?",
        raisedBy: "bob",
        context: "Timeline discussion",
      },
    ],
    nextSteps: [
      {
        id: "ns-1",
        description: "Draft migration plan",
        assigneeName: "Alice",
        priority: NextStepPriority.HIGH,
        dueDate: "2026-04-10T00:00:00Z",
      },
    ],
    confidence: 0.85,
    processingTime: 1200,
    ...overrides,
  };
  mockAIExtract.mockResolvedValue(result);
}

/**
 * Configure the AI mock to simulate a failure.
 */
export function setupFailingAIExtraction(error: Error): void {
  mockAIExtract.mockRejectedValue(error);
}

/**
 * Configure the Prisma mock to return an existing summary record.
 */
export function setupExistingSummary(meetingSessionId: string): void {
  mockPrisma.findUnique.mockResolvedValue({
    id: `summary-${meetingSessionId}`,
    meetingSessionId,
    generatedAt: new Date("2026-04-03T10:00:00Z"),
    generatedBy: "ai-summary-service",
    createdAt: new Date("2026-04-03T10:00:00Z"),
    updatedAt: new Date("2026-04-03T10:00:00Z"),
    keyDecisions: [
      {
        id: "kd-existing",
        summaryId: `summary-${meetingSessionId}`,
        description: "Existing decision",
        participants: JSON.stringify(["alice"]),
        madeAt: null,
        context: null,
      },
    ],
    openQuestions: [],
    nextSteps: [],
  });
}

/**
 * Configure the Prisma mock to indicate no existing summary.
 */
export function setupNoExistingSummary(): void {
  mockPrisma.findUnique.mockResolvedValue(null);
}

/**
 * Configure the Prisma mock to successfully create a summary record.
 */
export function setupSuccessfulCreate(meetingSessionId: string): void {
  mockPrisma.create.mockResolvedValue({
    id: `summary-${meetingSessionId}`,
    meetingSessionId,
    generatedAt: new Date("2026-04-03T10:00:00Z"),
    generatedBy: "ai-summary-service",
    createdAt: new Date("2026-04-03T10:00:00Z"),
    updatedAt: new Date("2026-04-03T10:00:00Z"),
    keyDecisions: [
      {
        id: "kd-created",
        summaryId: `summary-${meetingSessionId}`,
        description: "Adopt TypeScript for all new services",
        participants: JSON.stringify(["alice", "bob"]),
        madeAt: new Date("2026-04-03T10:30:00Z"),
        context: "Architecture review",
      },
    ],
    openQuestions: [
      {
        id: "oq-created",
        summaryId: `summary-${meetingSessionId}`,
        question: "What is the deployment timeline?",
        ownerId: null,
        raisedBy: "bob",
        context: "Timeline discussion",
      },
    ],
    nextSteps: [
      {
        id: "ns-created",
        summaryId: `summary-${meetingSessionId}`,
        description: "Draft migration plan",
        assigneeId: null,
        assigneeName: "Alice",
        priority: NextStepPriority.HIGH,
        dueDate: new Date("2026-04-10T00:00:00Z"),
      },
    ],
  });
}
