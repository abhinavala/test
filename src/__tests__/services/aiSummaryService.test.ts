import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ExtractionContext } from "../../types/ai-summary.js";
import { SummaryGenerationError } from "../../types/errors.js";

// Mock openai module
vi.mock("openai", () => {
  const mockCreate = vi.fn();
  class MockOpenAI {
    chat = { completions: { create: mockCreate } };
    constructor() {}
    static APIError = class APIError extends Error {
      status: number;
      constructor(status: number, message: string) {
        super(message);
        this.status = status;
      }
    };
    static APIConnectionTimeoutError = class extends Error {};
  }
  return { default: MockOpenAI, __mockCreate: mockCreate };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __mockCreate: mockCreate } = await import("openai") as any;

const { extractSummaryComponents, analyzeDecisionPoints, identifyOpenQuestions, extractNextSteps } = await import(
  "../../services/aiSummaryService.js"
);

function makeSegments(count: number, textOverride?: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: `seg-${i}`,
    sessionId: "session-1",
    speakerId: `speaker-${i % 3}`,
    startTime: i * 10000,
    endTime: (i + 1) * 10000,
    text:
      textOverride ??
      `This is a meeting transcript segment number ${i} with enough content to process.`,
  }));
}

const validContext: ExtractionContext = {
  meetingSessionId: "session-1",
  transcriptSegments: makeSegments(5),
  actionItems: [
    {
      id: "action-1",
      description: "Follow up on budget proposal",
      assigneeName: "Alice",
      status: "open",
    },
  ],
  participantNames: ["Alice", "Bob", "Charlie"],
};

const aiResponse = {
  keyDecisions: [
    {
      decision: "Approved the Q3 budget allocation",
      participants: ["Alice", "Bob"],
      timestamp: "2026-04-01T10:30:00Z",
      context: "After reviewing projections",
    },
  ],
  openQuestions: [
    {
      question: "What is the timeline for the new hire?",
      raisedBy: "Charlie",
      context: "Depends on headcount approval",
    },
  ],
  nextSteps: [
    {
      description: "Submit revised budget to finance",
      assignee: "Alice",
      priority: "HIGH",
      dueDate: "2026-04-10",
    },
  ],
};

describe("aiSummaryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractSummaryComponents", () => {
    it("successfully processes valid meeting data and returns structured results", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(aiResponse) } }],
      });

      const result = await extractSummaryComponents(validContext, {
        apiKey: "test-key",
        maxRetries: 0,
      });

      expect(result.keyDecisions).toBeInstanceOf(Array);
      expect(result.keyDecisions.length).toBeGreaterThan(0);
      expect(result.keyDecisions[0]!.description).toBe(
        "Approved the Q3 budget allocation",
      );
      expect(result.keyDecisions[0]!.participants).toEqual(["Alice", "Bob"]);

      expect(result.openQuestions.length).toBeGreaterThan(0);
      expect(result.openQuestions[0]!.question).toBe(
        "What is the timeline for the new hire?",
      );

      expect(result.nextSteps.length).toBeGreaterThan(0);
      expect(result.nextSteps[0]!.description).toBe(
        "Submit revised budget to finance",
      );

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.confidence).toBe("number");

      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.processingTime).toBe("number");
    });

    it("throws SummaryGenerationError with INSUFFICIENT_DATA when transcript segments are too short", async () => {
      const shortContext: ExtractionContext = {
        meetingSessionId: "session-short",
        transcriptSegments: [
          {
            id: "seg-0",
            sessionId: "session-short",
            speakerId: "speaker-0",
            startTime: 0,
            endTime: 1000,
            text: "Hi",
          },
        ],
        actionItems: [],
      };

      await expect(
        extractSummaryComponents(shortContext, { apiKey: "test-key" }),
      ).rejects.toThrow(SummaryGenerationError);

      try {
        await extractSummaryComponents(shortContext, { apiKey: "test-key" });
      } catch (error) {
        expect(error).toBeInstanceOf(SummaryGenerationError);
        const summaryError = error as InstanceType<typeof SummaryGenerationError>;
        expect(summaryError.message).toContain("insufficient content");
        expect(summaryError.code).toBe("INSUFFICIENT_DATA");
        expect(summaryError.meetingSessionId).toBe("session-short");
      }
    });

    it("throws SummaryGenerationError with AI_SERVICE_FAILURE on API error", async () => {
      mockCreate.mockRejectedValue(new Error("API connection failed"));

      await expect(
        extractSummaryComponents(validContext, {
          apiKey: "test-key",
          maxRetries: 0,
        }),
      ).rejects.toThrow(SummaryGenerationError);

      try {
        await extractSummaryComponents(validContext, {
          apiKey: "test-key",
          maxRetries: 0,
        });
      } catch (error) {
        const summaryError = error as InstanceType<typeof SummaryGenerationError>;
        expect(summaryError.code).toBe("AI_SERVICE_FAILURE");
        expect(summaryError.meetingSessionId).toBe("session-1");
      }
    });

    it("retries on rate limit errors with exponential backoff", async () => {
      const rateLimitError = new Error("rate limited");
      Object.assign(rateLimitError, { status: 429 });
      // Simulate openai APIError
      const OpenAIMod = (await import("openai")) as any;
      const apiError = new OpenAIMod.default.APIError(429, "rate limited");

      mockCreate
        .mockRejectedValueOnce(apiError)
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify(aiResponse) } }],
        });

      const result = await extractSummaryComponents(validContext, {
        apiKey: "test-key",
        maxRetries: 2,
        retryBaseDelayMs: 10, // fast for tests
      });

      expect(result.keyDecisions.length).toBeGreaterThan(0);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("handles empty extraction results gracefully", async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                keyDecisions: [],
                openQuestions: [],
                nextSteps: [],
              }),
            },
          },
        ],
      });

      const result = await extractSummaryComponents(validContext, {
        apiKey: "test-key",
        maxRetries: 0,
      });

      expect(result.keyDecisions).toEqual([]);
      expect(result.openQuestions).toEqual([]);
      expect(result.nextSteps).toEqual([]);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("handles malformed JSON response from AI", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "not valid json" } }],
      });

      await expect(
        extractSummaryComponents(validContext, {
          apiKey: "test-key",
          maxRetries: 0,
        }),
      ).rejects.toThrow(SummaryGenerationError);
    });

    it("handles empty AI response content", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      await expect(
        extractSummaryComponents(validContext, {
          apiKey: "test-key",
          maxRetries: 0,
        }),
      ).rejects.toThrow(SummaryGenerationError);
    });
  });

  describe("analyzeDecisionPoints", () => {
    it("correctly identifies decision points from transcript segments with participant attribution", () => {
      const segments = [
        {
          id: "seg-0",
          sessionId: "session-1",
          speakerId: "speaker-alice",
          startTime: 10000,
          endTime: 20000,
          text: "We've decided to go with option A for the new architecture.",
        },
        {
          id: "seg-1",
          sessionId: "session-1",
          speakerId: "speaker-bob",
          startTime: 20000,
          endTime: 30000,
          text: "That sounds good. I also think we need more testing.",
        },
        {
          id: "seg-2",
          sessionId: "session-1",
          speakerId: "speaker-charlie",
          startTime: 30000,
          endTime: 40000,
          text: "Agreed. The team has confirmed the timeline works.",
        },
      ];

      const decisions = analyzeDecisionPoints(segments);

      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions[0]!.decision).toContain("decided");
      expect(decisions[0]!.participants).toContain("speaker-alice");
      expect(decisions[0]!.timestamp).toBe(10000);
    });

    it("returns empty array when no decision keywords are found", () => {
      const segments = [
        {
          id: "seg-0",
          sessionId: "session-1",
          speakerId: "speaker-0",
          startTime: 0,
          endTime: 10000,
          text: "Hello everyone, welcome to the meeting.",
        },
        {
          id: "seg-1",
          sessionId: "session-1",
          speakerId: "speaker-1",
          startTime: 10000,
          endTime: 20000,
          text: "Thanks for joining today.",
        },
      ];

      const decisions = analyzeDecisionPoints(segments);
      expect(decisions).toEqual([]);
    });

    it("identifies multiple decision points", () => {
      const segments = [
        {
          id: "seg-0",
          sessionId: "session-1",
          speakerId: "speaker-0",
          startTime: 0,
          endTime: 10000,
          text: "We agreed to increase the budget by 10%.",
        },
        {
          id: "seg-1",
          sessionId: "session-1",
          speakerId: "speaker-1",
          startTime: 10000,
          endTime: 20000,
          text: "Let's go with the new vendor for Q4.",
        },
      ];

      const decisions = analyzeDecisionPoints(segments);
      expect(decisions).toHaveLength(2);
      expect(decisions[0]!.participants).toContain("speaker-0");
      expect(decisions[1]!.participants).toContain("speaker-1");
    });
  });

  describe("identifyOpenQuestions", () => {
    it("identifies questions from transcript segments", () => {
      const segments = [
        {
          id: "seg-0",
          sessionId: "session-1",
          speakerId: "speaker-alice",
          startTime: 5000,
          endTime: 10000,
          text: "What about the deployment timeline?",
        },
        {
          id: "seg-1",
          sessionId: "session-1",
          speakerId: "speaker-bob",
          startTime: 10000,
          endTime: 20000,
          text: "I think we should proceed as planned.",
        },
      ];

      const questions = identifyOpenQuestions(segments);
      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0]!.question).toContain("deployment timeline");
      expect(questions[0]!.raisedBy).toBe("speaker-alice");
      expect(questions[0]!.timestamp).toBe(5000);
    });

    it("returns empty array when no questions are found", () => {
      const segments = [
        {
          id: "seg-0",
          sessionId: "session-1",
          speakerId: "speaker-0",
          startTime: 0,
          endTime: 10000,
          text: "The release is scheduled for Friday.",
        },
      ];

      const questions = identifyOpenQuestions(segments);
      expect(questions).toEqual([]);
    });
  });

  describe("extractNextSteps", () => {
    it("extracts action items from transcript segments", () => {
      const segments = [
        {
          id: "seg-0",
          sessionId: "session-1",
          speakerId: "speaker-alice",
          startTime: 15000,
          endTime: 25000,
          text: "I will send the updated proposal by end of day.",
        },
        {
          id: "seg-1",
          sessionId: "session-1",
          speakerId: "speaker-bob",
          startTime: 25000,
          endTime: 35000,
          text: "Sounds good, thanks.",
        },
      ];

      const steps = extractNextSteps(segments);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]!.description).toContain("updated proposal");
      expect(steps[0]!.assignee).toBe("speaker-alice");
      expect(steps[0]!.timestamp).toBe(15000);
    });

    it("returns empty array when no action items found", () => {
      const segments = [
        {
          id: "seg-0",
          sessionId: "session-1",
          speakerId: "speaker-0",
          startTime: 0,
          endTime: 10000,
          text: "Hello everyone, welcome to the meeting.",
        },
      ];

      const steps = extractNextSteps(segments);
      expect(steps).toEqual([]);
    });
  });
});
