import { describe, it, expect } from "vitest";
import {
  MeetingSessionSummary,
  KeyDecision,
  OpenQuestion,
  NextStep,
  NextStepPriority,
} from "../../types/meeting-summary";
import {
  SummaryGenerationError,
  SummaryGenerationErrorCode,
} from "../../types/errors";

describe("meetingSummary", () => {
  describe("MeetingSessionSummary model validation", () => {
    it("accepts valid summary data with all required fields", () => {
      const keyDecisions: KeyDecision[] = [
        {
          id: "kd-1",
          description: "Adopt new testing framework",
          participants: ["alice", "bob"],
          madeAt: "2026-04-03T10:30:00Z",
          context: "Team agreed during sprint planning",
        },
      ];

      const openQuestions: OpenQuestion[] = [
        {
          id: "oq-1",
          question: "What is the migration timeline?",
          ownerId: "user-1",
          raisedBy: "charlie",
          context: "Needs answer before next sprint",
        },
      ];

      const nextSteps: NextStep[] = [
        {
          id: "ns-1",
          description: "Create migration plan document",
          assigneeId: "user-2",
          assigneeName: "Alice",
          priority: NextStepPriority.HIGH,
          dueDate: "2026-04-10",
        },
      ];

      const summary: MeetingSessionSummary = {
        id: "summary-1",
        meetingSessionId: "session-abc",
        keyDecisions,
        openQuestions,
        nextSteps,
        generatedAt: new Date("2026-04-03T11:00:00Z"),
        generatedBy: "ai-service-v1",
      };

      expect(typeof summary.id).toBe("string");
      expect(summary.meetingSessionId).toBe("session-abc");
      expect(summary.keyDecisions).toHaveLength(1);
      expect(summary.keyDecisions[0]).toEqual(keyDecisions[0]);
      expect(summary.openQuestions).toHaveLength(1);
      expect(summary.openQuestions[0]).toEqual(openQuestions[0]);
      expect(summary.nextSteps).toHaveLength(1);
      expect(summary.nextSteps[0]).toEqual(nextSteps[0]);
      expect(summary.generatedAt).toBeInstanceOf(Date);
      expect(typeof summary.generatedBy).toBe("string");
    });

    it("accepts summary with empty arrays for decisions, questions, and steps", () => {
      const summary: MeetingSessionSummary = {
        id: "summary-2",
        meetingSessionId: "session-empty",
        keyDecisions: [],
        openQuestions: [],
        nextSteps: [],
        generatedAt: new Date(),
        generatedBy: "ai-service-v1",
      };

      expect(summary.keyDecisions).toEqual([]);
      expect(summary.openQuestions).toEqual([]);
      expect(summary.nextSteps).toEqual([]);
    });

    it("accepts KeyDecision with only required fields", () => {
      const decision: KeyDecision = {
        id: "kd-minimal",
        description: "Use SQLite for dev",
        participants: ["alice"],
      };

      expect(decision.madeAt).toBeUndefined();
      expect(decision.context).toBeUndefined();
    });

    it("accepts OpenQuestion with only required fields", () => {
      const question: OpenQuestion = {
        id: "oq-minimal",
        question: "When is the deadline?",
      };

      expect(question.ownerId).toBeUndefined();
      expect(question.raisedBy).toBeUndefined();
      expect(question.context).toBeUndefined();
    });

    it("accepts NextStep with only required fields", () => {
      const step: NextStep = {
        id: "ns-minimal",
        description: "Review PR",
        priority: NextStepPriority.LOW,
      };

      expect(step.assigneeId).toBeUndefined();
      expect(step.assigneeName).toBeUndefined();
      expect(step.dueDate).toBeUndefined();
    });
  });

  describe("NextStepPriority enum", () => {
    it("has all expected priority values", () => {
      expect(NextStepPriority.LOW).toBe("LOW");
      expect(NextStepPriority.MEDIUM).toBe("MEDIUM");
      expect(NextStepPriority.HIGH).toBe("HIGH");
      expect(NextStepPriority.URGENT).toBe("URGENT");
    });

    it("rejects invalid priority values", () => {
      const validValues = Object.values(NextStepPriority);
      expect(validValues).toContain("LOW");
      expect(validValues).toContain("MEDIUM");
      expect(validValues).toContain("HIGH");
      expect(validValues).toContain("URGENT");
      expect(validValues).not.toContain("CRITICAL");
      expect(validValues).not.toContain("NONE");
      expect(validValues).toHaveLength(4);
    });

    it("can be used as a NextStep priority field", () => {
      const step: NextStep = {
        id: "ns-enum",
        description: "Test enum",
        priority: NextStepPriority.URGENT,
      };

      expect(step.priority).toBe("URGENT");
    });
  });

  describe("SummaryGenerationError", () => {
    it("includes meetingSessionId and error code in error details", () => {
      const error = new SummaryGenerationError(
        "Meeting session not found",
        "SESSION_NOT_FOUND",
        "session-404"
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.meetingSessionId).toBe("session-404");
      expect(error.code).toBe("SESSION_NOT_FOUND");
      expect(error.message).toBe("Meeting session not found");
      expect(error.name).toBe("SummaryGenerationError");
    });

    it("supports INSUFFICIENT_DATA error code", () => {
      const error = new SummaryGenerationError(
        "Not enough transcript data to generate summary",
        "INSUFFICIENT_DATA",
        "session-empty"
      );

      expect(error.code).toBe("INSUFFICIENT_DATA");
      expect(error.meetingSessionId).toBe("session-empty");
      expect(error.message).toBe(
        "Not enough transcript data to generate summary"
      );
    });

    it("supports AI_SERVICE_FAILURE error code", () => {
      const error = new SummaryGenerationError(
        "AI service timed out",
        "AI_SERVICE_FAILURE",
        "session-timeout"
      );

      expect(error.code).toBe("AI_SERVICE_FAILURE");
      expect(error.meetingSessionId).toBe("session-timeout");
    });

    it("supports all defined error codes", () => {
      const codes: SummaryGenerationErrorCode[] = [
        "SESSION_NOT_FOUND",
        "INSUFFICIENT_DATA",
        "AI_SERVICE_FAILURE",
        "GENERATION_TIMEOUT",
        "INVALID_SESSION_STATE",
      ];

      for (const code of codes) {
        const error = new SummaryGenerationError(
          `Error: ${code}`,
          code,
          "session-test"
        );
        expect(error.code).toBe(code);
        expect(typeof error.code).toBe("string");
      }
    });

    it("is catchable as a standard Error", () => {
      const error = new SummaryGenerationError(
        "Test error",
        "AI_SERVICE_FAILURE",
        "session-x"
      );

      try {
        throw error;
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(SummaryGenerationError);
      }
    });
  });
});
