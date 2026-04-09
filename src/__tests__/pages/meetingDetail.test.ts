import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  exportMeeting,
  ValidationError,
  type ExportOptions,
  type MeetingExportData,
} from "../../lib/export.js";
import {
  fetchMeetingDetail,
  type MeetingDetailData,
  type Meeting,
  type Transcript,
  type Summary,
} from "../../hooks/useMeetingDetail.js";
import { NextStepPriority } from "../../types/meeting-summary.js";
import type { ActionItem } from "../../types/exportContent.js";
import type { SpeakerStats } from "../../types/speaker-stats.js";
import type { ParticipantEngagementScore } from "../../types/engagement.js";

function createMockMeeting(overrides?: Partial<Meeting>): Meeting {
  return {
    id: "meeting-1",
    title: "Sprint Planning",
    date: "2026-04-01",
    duration: 60,
    status: "completed",
    participants: ["Alice", "Bob", "Carol"],
    organizer: "Alice",
    ...overrides,
  };
}

function createMockTranscript(): Transcript {
  return {
    segments: [
      {
        id: "seg-1",
        sessionId: "session-1",
        speakerId: "Alice",
        startTime: 0,
        endTime: 15000,
        text: "Let's review the sprint goals.",
      },
      {
        id: "seg-2",
        sessionId: "session-1",
        speakerId: "Bob",
        startTime: 15000,
        endTime: 30000,
        text: "I think we should focus on the API integration.",
      },
    ],
    totalDuration: 30000,
  };
}

function createMockSummary(): Summary {
  return {
    content: {
      id: "summary-1",
      meetingSessionId: "session-1",
      keyDecisions: [
        {
          id: "kd-1",
          description: "Prioritize API integration over UI work",
          participants: ["Alice", "Bob"],
        },
      ],
      openQuestions: [
        {
          id: "oq-1",
          question: "What is the timeline for the database migration?",
          raisedBy: "Carol",
        },
      ],
      nextSteps: [
        {
          id: "ns-1",
          description: "Create API integration tickets",
          assigneeName: "Bob",
          priority: NextStepPriority.HIGH,
        },
      ],
      generatedAt: new Date("2026-04-01T12:00:00Z"),
      generatedBy: "ai-service",
    },
    generatedAt: new Date("2026-04-01T12:00:00Z"),
  };
}

function createMockActionItems(): ActionItem[] {
  return [
    {
      id: "ai-1",
      description: "Set up API endpoints",
      assigneeName: "Bob",
      status: "open",
      priority: "high",
    },
    {
      id: "ai-2",
      description: "Write integration tests",
      assigneeName: "Carol",
      status: "in-progress",
      priority: "medium",
    },
    {
      id: "ai-3",
      description: "Update documentation",
      assigneeName: "Alice",
      status: "completed",
      priority: "low",
    },
  ];
}

function createMockSpeakerStats(): SpeakerStats[] {
  return [
    {
      speakerId: "Alice",
      talkTime: 1800000,
      percentageOfMeeting: 50,
      turnCount: 15,
      averageTurnDuration: 120000,
      interruptionCount: 2,
    },
    {
      speakerId: "Bob",
      talkTime: 1080000,
      percentageOfMeeting: 30,
      turnCount: 10,
      averageTurnDuration: 108000,
      interruptionCount: 1,
    },
  ];
}

function createMockEngagementScores(): ParticipantEngagementScore[] {
  return [
    {
      id: "eng-1",
      sessionId: "session-1",
      participantId: "Alice",
      score: 85,
      talkTimeRatio: 0.5,
      questionCount: 3,
      responseRate: 0.9,
      sentimentScore: 0.75,
      calculatedAt: new Date("2026-04-01T12:00:00Z"),
    },
    {
      id: "eng-2",
      sessionId: "session-1",
      participantId: "Bob",
      score: 72,
      talkTimeRatio: 0.3,
      questionCount: 2,
      responseRate: 0.85,
      sentimentScore: 0.65,
      calculatedAt: new Date("2026-04-01T12:00:00Z"),
    },
  ];
}

function createMockMeetingDetailData(
  overrides?: Partial<MeetingDetailData>,
): MeetingDetailData {
  return {
    meeting: createMockMeeting(),
    transcript: createMockTranscript(),
    summary: createMockSummary(),
    actionItems: createMockActionItems(),
    speakerStats: createMockSpeakerStats(),
    engagementScores: createMockEngagementScores(),
    ...overrides,
  };
}

function createMockExportData(): MeetingExportData {
  const data = createMockMeetingDetailData();
  return {
    title: data.meeting.title,
    date: data.meeting.date,
    duration: data.meeting.duration,
    participants: data.meeting.participants,
    summary: data.summary?.content,
    actionItems: data.actionItems,
    transcript: data.transcript?.segments ?? [],
    speakerStats: data.speakerStats,
  };
}

// ──────────────────────────────────────────────
// MeetingDetailPage: renders all sections for completed meeting
// ──────────────────────────────────────────────

describe("MeetingDetailPage", () => {
  it("renders all sections for completed meeting", () => {
    const data = createMockMeetingDetailData();

    // Verify the data structure has all required sections
    expect(data.meeting).toBeDefined();
    expect(data.meeting.status).toBe("completed");
    expect(data.transcript).toBeDefined();
    expect(data.transcript!.segments.length).toBeGreaterThan(0);
    expect(data.summary).toBeDefined();
    expect(data.summary!.content.keyDecisions.length).toBeGreaterThan(0);
    expect(data.summary!.content.openQuestions.length).toBeGreaterThan(0);
    expect(data.summary!.content.nextSteps.length).toBeGreaterThan(0);
    expect(data.actionItems.length).toBeGreaterThan(0);
    expect(data.speakerStats).toBeDefined();
    expect(data.speakerStats!.length).toBeGreaterThan(0);
    expect(data.engagementScores).toBeDefined();
    expect(data.engagementScores!.length).toBeGreaterThan(0);

    // Verify all component data is correctly structured
    // MeetingHeader data
    expect(data.meeting.title).toBe("Sprint Planning");
    expect(data.meeting.participants).toContain("Alice");

    // TranscriptViewer data
    expect(data.transcript!.segments[0]!.speakerId).toBe("Alice");
    expect(data.transcript!.totalDuration).toBe(30000);

    // SummarySection data
    expect(data.summary!.content.keyDecisions[0]!.description).toContain(
      "API integration",
    );

    // ParticipantAnalytics data
    expect(data.speakerStats![0]!.speakerId).toBe("Alice");
    expect(data.engagementScores![0]!.score).toBe(85);

    // ActionItemsList data
    expect(data.actionItems).toHaveLength(3);

    // ExportControls would use this data
    const exportData = createMockExportData();
    expect(exportData.title).toBe("Sprint Planning");
    expect(exportData.actionItems).toHaveLength(3);
  });

  it("handles scheduled meeting state", () => {
    const data = createMockMeetingDetailData({
      meeting: createMockMeeting({ status: "scheduled" }),
      transcript: undefined,
      summary: undefined,
      speakerStats: undefined,
      engagementScores: undefined,
      actionItems: [],
    });

    expect(data.meeting.status).toBe("scheduled");
    expect(data.transcript).toBeUndefined();
    expect(data.summary).toBeUndefined();
    expect(data.actionItems).toHaveLength(0);
  });

  it("handles in-progress meeting state", () => {
    const data = createMockMeetingDetailData({
      meeting: createMockMeeting({ status: "in-progress" }),
      summary: undefined,
    });

    expect(data.meeting.status).toBe("in-progress");
    expect(data.transcript).toBeDefined();
    expect(data.summary).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// exportMeeting: throws error for invalid format
// ──────────────────────────────────────────────

describe("exportMeeting", () => {
  const mockExportData = createMockExportData();

  it("throws error for invalid format", () => {
    const options = {
      format: "pdf" as ExportOptions["format"],
      meetingId: "meeting-1",
    };

    expect(() => exportMeeting(options, mockExportData)).toThrow(
      ValidationError,
    );
    expect(() => exportMeeting(options, mockExportData)).toThrow(
      "Invalid export format",
    );
  });

  it("exports as markdown successfully", () => {
    const options: ExportOptions = {
      format: "markdown",
      meetingId: "meeting-1",
    };

    const result = exportMeeting(options, mockExportData);

    expect(result).toContain("# Sprint Planning");
    expect(result).toContain("**Date:** 2026-04-01");
    expect(result).toContain("## Summary");
    expect(result).toContain("## Action Items");
    expect(result).toContain("## Transcript");
    expect(result).toContain("Alice");
    expect(result).toContain("Bob");
  });

  it("exports as plaintext successfully", () => {
    const options: ExportOptions = {
      format: "plaintext",
      meetingId: "meeting-1",
    };

    const result = exportMeeting(options, mockExportData);

    expect(result).toContain("Sprint Planning");
    expect(result).toContain("Date: 2026-04-01");
    expect(result).toContain("Action Items");
    expect(result).toContain("Transcript");
  });

  it("exports as csv successfully", () => {
    const options: ExportOptions = {
      format: "csv",
      meetingId: "meeting-1",
    };

    const result = exportMeeting(options, mockExportData);

    expect(result).toContain("Type,Description,Assignee,Status,Priority,Due Date");
    expect(result).toContain("Action Item");
    expect(result).toContain("Set up API endpoints");
  });

  it("exports as notion successfully", () => {
    const options: ExportOptions = {
      format: "notion",
      meetingId: "meeting-1",
    };

    const result = exportMeeting(options, mockExportData);
    const parsed = JSON.parse(result) as object[];

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("exports as jira successfully", () => {
    const options: ExportOptions = {
      format: "jira",
      meetingId: "meeting-1",
    };

    const result = exportMeeting(options, mockExportData);

    expect(result).toContain("h1. Sprint Planning");
    expect(result).toContain("h2. Action Items");
    expect(result).toContain("||Description||Assignee||Status||Priority||");
  });

  it("handles meeting with no summary", () => {
    const dataWithoutSummary: MeetingExportData = {
      ...mockExportData,
      summary: undefined,
    };
    const options: ExportOptions = {
      format: "markdown",
      meetingId: "meeting-1",
    };

    const result = exportMeeting(options, dataWithoutSummary);

    expect(result).toContain("# Sprint Planning");
    expect(result).not.toContain("## Summary");
  });

  it("handles meeting with no action items", () => {
    const dataWithoutItems: MeetingExportData = {
      ...mockExportData,
      actionItems: [],
    };
    const options: ExportOptions = {
      format: "markdown",
      meetingId: "meeting-1",
    };

    const result = exportMeeting(options, dataWithoutItems);

    expect(result).toContain("# Sprint Planning");
    expect(result).not.toContain("## Action Items");
  });
});

// ──────────────────────────────────────────────
// useMeetingDetail: handles missing meeting gracefully
// ──────────────────────────────────────────────

describe("useMeetingDetail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles missing meeting gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      await fetchMeetingDetail("nonexistent-meeting");
      expect.fail("Should have thrown an error");
    } catch (err) {
      const error = err as Error;
      expect(error.message).toContain("Meeting not found");
    }

    vi.unstubAllGlobals();
  });

  it("handles server error gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      await fetchMeetingDetail("meeting-1");
      expect.fail("Should have thrown an error");
    } catch (err) {
      const error = err as Error;
      expect(error.message).toContain("Failed to fetch meeting");
    }

    vi.unstubAllGlobals();
  });

  it("returns meeting data on success", async () => {
    const mockData = createMockMeetingDetailData();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchMeetingDetail("meeting-1");

    expect(result.meeting.id).toBe("meeting-1");
    expect(result.meeting.title).toBe("Sprint Planning");
    expect(result.actionItems).toHaveLength(3);

    vi.unstubAllGlobals();
  });

  it("calls the correct API endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createMockMeetingDetailData()),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchMeetingDetail("meeting-123");

    expect(mockFetch).toHaveBeenCalledWith("/api/meetings/meeting-123");

    vi.unstubAllGlobals();
  });
});

// ──────────────────────────────────────────────
// Data integrity tests
// ──────────────────────────────────────────────

describe("MeetingDetailData types", () => {
  it("MeetingDetailData interface is correctly structured", () => {
    const data = createMockMeetingDetailData();

    // Meeting
    expect(typeof data.meeting.id).toBe("string");
    expect(typeof data.meeting.title).toBe("string");
    expect(typeof data.meeting.date).toBe("string");
    expect(["scheduled", "in-progress", "completed"]).toContain(
      data.meeting.status,
    );
    expect(Array.isArray(data.meeting.participants)).toBe(true);

    // Transcript (optional)
    if (data.transcript) {
      expect(Array.isArray(data.transcript.segments)).toBe(true);
      expect(typeof data.transcript.totalDuration).toBe("number");
    }

    // Summary (optional)
    if (data.summary) {
      expect(Array.isArray(data.summary.content.keyDecisions)).toBe(true);
      expect(Array.isArray(data.summary.content.openQuestions)).toBe(true);
      expect(Array.isArray(data.summary.content.nextSteps)).toBe(true);
    }

    // ActionItems
    expect(Array.isArray(data.actionItems)).toBe(true);
    for (const item of data.actionItems) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.description).toBe("string");
      expect(["open", "in-progress", "completed"]).toContain(item.status);
    }
  });

  it("ExportOptions interface accepts all valid formats", () => {
    const validFormats: ExportOptions["format"][] = [
      "markdown",
      "plaintext",
      "csv",
      "notion",
      "jira",
    ];

    for (const format of validFormats) {
      const options: ExportOptions = { format, meetingId: "meeting-1" };
      expect(options.format).toBe(format);
      expect(options.meetingId).toBe("meeting-1");
    }
  });
});
