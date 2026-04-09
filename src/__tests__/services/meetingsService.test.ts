import { describe, it, expect, beforeEach } from "vitest";
import {
  getMeetings,
  getMeetingById,
  searchMeetings,
  validateFilters,
  setMeetingsStore,
} from "../../services/meetingsService.js";
import { MeetingFilterValidationError, MeetingNotFoundError } from "../../types/errors.js";
import type { Meeting } from "../../types/meeting.js";

const sampleMeetings: Meeting[] = [
  {
    id: "m1",
    title: "Sprint Planning",
    date: "2026-01-15T10:00:00Z",
    duration: 60,
    participants: ["alice", "bob", "charlie"],
    status: "completed",
    transcript: "We discussed the upcoming sprint goals and priorities.",
    summary: "Sprint goals set for Q1.",
  },
  {
    id: "m2",
    title: "Design Review",
    date: "2026-01-20T14:00:00Z",
    duration: 30,
    participants: ["alice", "diana"],
    status: "completed",
    transcript: "Reviewed the new UI mockups for the dashboard.",
  },
  {
    id: "m3",
    title: "Standup Meeting",
    date: "2026-02-01T09:00:00Z",
    duration: 15,
    participants: ["bob", "charlie"],
    status: "in-progress",
  },
  {
    id: "m4",
    title: "Quarterly Review",
    date: "2026-03-01T11:00:00Z",
    duration: 90,
    participants: ["alice", "bob", "charlie", "diana"],
    status: "scheduled",
    transcript: "Quarterly performance review and roadmap planning discussion.",
  },
  {
    id: "m5",
    title: "Bug Triage",
    date: "2026-01-25T15:00:00Z",
    duration: 45,
    participants: ["bob", "diana"],
    status: "completed",
    transcript: "Triaged critical bugs for the release.",
  },
];

describe("meetingsService", () => {
  beforeEach(() => {
    setMeetingsStore(sampleMeetings);
  });

  describe("getMeetings", () => {
    it("returns all meetings with default params", async () => {
      const result = await getMeetings();
      expect(result.data).toHaveLength(5);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it("returns filtered results when valid filters provided", async () => {
      const result = await getMeetings({ status: ["completed"] });
      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.data.every((m) => m.status === "completed")).toBe(true);
    });

    it("filters by date range", async () => {
      const result = await getMeetings({
        dateRange: { start: "2026-01-01", end: "2026-01-31" },
      });
      expect(result.data).toHaveLength(3);
      expect(result.data.every((m) => new Date(m.date) >= new Date("2026-01-01"))).toBe(true);
      expect(result.data.every((m) => new Date(m.date) <= new Date("2026-01-31"))).toBe(true);
    });

    it("filters by participants", async () => {
      const result = await getMeetings({ participants: ["diana"] });
      expect(result.data).toHaveLength(3);
      expect(result.data.every((m) => m.participants.includes("diana"))).toBe(true);
    });

    it("filters by duration range", async () => {
      const result = await getMeetings({ duration: { min: 30, max: 60 } });
      expect(result.data).toHaveLength(3);
      expect(result.data.every((m) => m.duration >= 30 && m.duration <= 60)).toBe(true);
    });

    it("applies multiple filters together", async () => {
      const result = await getMeetings({
        status: ["completed"],
        participants: ["alice"],
      });
      expect(result.data).toHaveLength(2);
      expect(result.data.every((m) => m.status === "completed" && m.participants.includes("alice"))).toBe(true);
    });

    it("sorts by date ascending", async () => {
      const result = await getMeetings({}, { field: "date", direction: "asc" });
      const dates = result.data.map((m) => new Date(m.date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]!).toBeGreaterThanOrEqual(dates[i - 1]!);
      }
    });

    it("sorts by title ascending", async () => {
      const result = await getMeetings({}, { field: "title", direction: "asc" });
      const titles = result.data.map((m) => m.title);
      for (let i = 1; i < titles.length; i++) {
        expect(titles[i]!.localeCompare(titles[i - 1]!)).toBeGreaterThanOrEqual(0);
      }
    });

    it("sorts by duration descending", async () => {
      const result = await getMeetings({}, { field: "duration", direction: "desc" });
      const durations = result.data.map((m) => m.duration);
      for (let i = 1; i < durations.length; i++) {
        expect(durations[i]!).toBeLessThanOrEqual(durations[i - 1]!);
      }
    });

    it("sorts by participants count", async () => {
      const result = await getMeetings({}, { field: "participants", direction: "desc" });
      const counts = result.data.map((m) => m.participants.length);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
      }
    });

    it("paginates results correctly", async () => {
      const result = await getMeetings({}, { field: "date", direction: "asc" }, { page: 1, limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.totalPages).toBe(3);
    });

    it("returns correct second page", async () => {
      const page1 = await getMeetings({}, { field: "date", direction: "asc" }, { page: 1, limit: 2 });
      const page2 = await getMeetings({}, { field: "date", direction: "asc" }, { page: 2, limit: 2 });
      expect(page2.data).toHaveLength(2);
      expect(page2.page).toBe(2);
      // No overlap between pages
      const page1Ids = page1.data.map((m) => m.id);
      const page2Ids = page2.data.map((m) => m.id);
      expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
    });

    it("returns empty data for page beyond range", async () => {
      const result = await getMeetings({}, { field: "date", direction: "asc" }, { page: 100, limit: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(5);
    });

    it("returns empty results when no meetings match filters", async () => {
      const result = await getMeetings({ participants: ["nonexistent"] });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe("validateFilters", () => {
    it("does not throw for valid filters", () => {
      expect(() =>
        validateFilters({
          dateRange: { start: "2026-01-01", end: "2026-12-31" },
          status: ["completed"],
          duration: { min: 0, max: 120 },
        })
      ).not.toThrow();
    });

    it("throws InvalidFilterError for malformed date range", () => {
      expect(() =>
        validateFilters({
          dateRange: { start: "not-a-date", end: "2026-12-31" },
        })
      ).toThrow(MeetingFilterValidationError);

      expect(() =>
        validateFilters({
          dateRange: { start: "not-a-date", end: "2026-12-31" },
        })
      ).toThrow("Invalid date range");
    });

    it("throws for reversed date range", () => {
      expect(() =>
        validateFilters({
          dateRange: { start: "2026-12-31", end: "2026-01-01" },
        })
      ).toThrow(MeetingFilterValidationError);
      expect(() =>
        validateFilters({
          dateRange: { start: "2026-12-31", end: "2026-01-01" },
        })
      ).toThrow("Invalid date range");
    });

    it("throws for negative duration min", () => {
      expect(() => validateFilters({ duration: { min: -10 } })).toThrow(
        MeetingFilterValidationError
      );
    });

    it("throws for duration min greater than max", () => {
      expect(() => validateFilters({ duration: { min: 100, max: 50 } })).toThrow(
        MeetingFilterValidationError
      );
    });

    it("accepts empty filters", () => {
      expect(() => validateFilters({})).not.toThrow();
    });
  });

  describe("searchMeetings", () => {
    it("finds meetings by title and transcript content", async () => {
      const result = await searchMeetings("sprint");
      expect(result.data.length).toBeGreaterThan(0);
      expect(
        result.data.every(
          (m) =>
            m.title.toLowerCase().includes("sprint") ||
            (m.transcript && m.transcript.toLowerCase().includes("sprint"))
        )
      ).toBe(true);
      expect(result.total).toBe(result.data.length);
    });

    it("finds meetings by transcript content", async () => {
      const result = await searchMeetings("dashboard");
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe("m2");
    });

    it("search is case-insensitive", async () => {
      const result = await searchMeetings("SPRINT");
      expect(result.data.length).toBeGreaterThan(0);
    });

    it("returns empty results for non-matching search", async () => {
      const result = await searchMeetings("xyznonexistent");
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("paginates search results", async () => {
      const result = await searchMeetings("review", { page: 1, limit: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.totalPages).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getMeetingById", () => {
    it("returns a meeting by id", async () => {
      const meeting = await getMeetingById("m1");
      expect(meeting.id).toBe("m1");
      expect(meeting.title).toBe("Sprint Planning");
    });

    it("throws MeetingNotFoundError for unknown id", async () => {
      await expect(getMeetingById("nonexistent")).rejects.toThrow(MeetingNotFoundError);
    });
  });
});
