import { describe, it, expect, beforeEach } from "vitest";
import type { Meeting } from "../../types/meeting.js";
import type { PaginatedResponse } from "../../types/common.js";
import { GET, setMeetingsStore } from "../../../app/api/meetings/route.js";

function createMockRequest(query: Record<string, string> = {}) {
  return { query };
}

function createMockResponse() {
  const res = {
    _status: 0,
    _json: undefined as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
  };
  return res;
}

const sampleMeetings: Meeting[] = [
  {
    id: "m1",
    title: "Sprint Planning",
    date: "2026-03-01T10:00:00Z",
    duration: 60,
    participants: [
      { id: "u1", name: "Alice" },
      { id: "u2", name: "Bob" },
    ],
    status: "completed",
    description: "Plan the upcoming sprint tasks",
  },
  {
    id: "m2",
    title: "Design Review",
    date: "2026-03-02T14:00:00Z",
    duration: 30,
    participants: [{ id: "u1", name: "Alice" }],
    status: "completed",
    description: "Review new UI components",
  },
  {
    id: "m3",
    title: "Standup",
    date: "2026-03-03T09:00:00Z",
    duration: 15,
    participants: [
      { id: "u1", name: "Alice" },
      { id: "u3", name: "Charlie" },
    ],
    status: "scheduled",
  },
  {
    id: "m4",
    title: "Retrospective",
    date: "2026-03-04T16:00:00Z",
    duration: 45,
    participants: [
      { id: "u2", name: "Bob" },
      { id: "u3", name: "Charlie" },
    ],
    status: "in_progress",
    description: "Discuss sprint outcomes",
  },
  {
    id: "m5",
    title: "Client Demo",
    date: "2026-03-05T11:00:00Z",
    duration: 90,
    participants: [
      { id: "u1", name: "Alice" },
      { id: "u2", name: "Bob" },
      { id: "u3", name: "Charlie" },
    ],
    status: "cancelled",
    description: "Demo the sprint deliverables to the client",
  },
];

describe("GET /api/meetings", () => {
  beforeEach(() => {
    setMeetingsStore([...sampleMeetings]);
  });

  describe("default parameters", () => {
    it("returns paginated meetings with default parameters", async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(200);
      const body = res._json as PaginatedResponse<Meeting>;
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination.total).toBeGreaterThanOrEqual(0);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(20);
    });

    it("returns all sample meetings when no filters applied", async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(5);
      expect(body.pagination.total).toBe(5);
    });

    it("sorts by date descending by default", async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data[0]!.id).toBe("m5");
      expect(body.data[4]!.id).toBe("m1");
    });
  });

  describe("search parameter", () => {
    it("filters results by title match", async () => {
      const req = createMockRequest({ search: "sprint" });
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(200);
      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data.length).toBeGreaterThan(0);
      for (const meeting of body.data) {
        const matchesTitle = meeting.title.toLowerCase().includes("sprint");
        const matchesDesc = meeting.description?.toLowerCase().includes("sprint");
        expect(matchesTitle || matchesDesc).toBe(true);
      }
    });

    it("filters results by description match", async () => {
      const req = createMockRequest({ search: "UI components" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.id).toBe("m2");
    });

    it("returns empty when search matches nothing", async () => {
      const req = createMockRequest({ search: "nonexistent" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    it("search is case-insensitive", async () => {
      const req = createMockRequest({ search: "STANDUP" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.id).toBe("m3");
    });
  });

  describe("status filter", () => {
    it("filters by single status", async () => {
      const req = createMockRequest({ status: "completed" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(2);
      for (const m of body.data) {
        expect(m.status).toBe("completed");
      }
    });

    it("filters by multiple statuses", async () => {
      const req = createMockRequest({ status: "completed,scheduled" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(3);
    });

    it("returns 400 for invalid status", async () => {
      const req = createMockRequest({ status: "invalid_status" });
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(400);
      const body = res._json as { error: string };
      expect(body.error).toContain("Invalid filter");
    });
  });

  describe("date range filter", () => {
    it("filters by dateFrom", async () => {
      const req = createMockRequest({ dateFrom: "2026-03-03T00:00:00Z" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(3);
    });

    it("filters by dateTo", async () => {
      const req = createMockRequest({ dateTo: "2026-03-02T23:59:59Z" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(2);
    });

    it("returns 400 when dateFrom is after dateTo", async () => {
      const req = createMockRequest({
        dateFrom: "2026-03-05",
        dateTo: "2026-03-01",
      });
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(400);
      const body = res._json as { error: string };
      expect(body.error).toContain("Invalid filter");
    });

    it("returns 400 for invalid date format", async () => {
      const req = createMockRequest({ dateFrom: "not-a-date" });
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(400);
    });
  });

  describe("participants filter", () => {
    it("filters by participant id", async () => {
      const req = createMockRequest({ participants: "u3" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(3);
      for (const m of body.data) {
        expect(m.participants.some((p) => p.id === "u3")).toBe(true);
      }
    });

    it("filters by participant name", async () => {
      const req = createMockRequest({ participants: "Bob" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(3);
    });
  });

  describe("duration filter", () => {
    it("filters by minimum duration", async () => {
      const req = createMockRequest({ durationMin: "45" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      for (const m of body.data) {
        expect(m.duration).toBeGreaterThanOrEqual(45);
      }
    });

    it("filters by maximum duration", async () => {
      const req = createMockRequest({ durationMax: "30" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      for (const m of body.data) {
        expect(m.duration).toBeLessThanOrEqual(30);
      }
    });

    it("returns 400 when durationMin is greater than durationMax", async () => {
      const req = createMockRequest({ durationMin: "60", durationMax: "30" });
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(400);
    });

    it("returns 400 for negative duration", async () => {
      const req = createMockRequest({ durationMin: "-10" });
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(400);
    });
  });

  describe("sorting", () => {
    it("sorts by title ascending", async () => {
      const req = createMockRequest({ sortField: "title", sortDirection: "asc" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      const titles = body.data.map((m) => m.title);
      const sorted = [...titles].sort((a, b) => a.localeCompare(b));
      expect(titles).toEqual(sorted);
    });

    it("sorts by duration descending", async () => {
      const req = createMockRequest({ sortField: "duration", sortDirection: "desc" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      for (let i = 1; i < body.data.length; i++) {
        expect(body.data[i - 1]!.duration).toBeGreaterThanOrEqual(body.data[i]!.duration);
      }
    });

    it("returns 400 for invalid sort field", async () => {
      const req = createMockRequest({ sortField: "invalid" });
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(400);
      const body = res._json as { error: string };
      expect(body.error).toContain("Invalid filter");
    });
  });

  describe("pagination", () => {
    it("respects page and pageSize", async () => {
      const req = createMockRequest({ page: "1", pageSize: "2" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(2);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(2);
      expect(body.pagination.totalPages).toBe(3);
      expect(body.pagination.hasNextPage).toBe(true);
      expect(body.pagination.hasPreviousPage).toBe(false);
    });

    it("returns correct page 2", async () => {
      const req = createMockRequest({ page: "2", pageSize: "2" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(2);
      expect(body.pagination.page).toBe(2);
      expect(body.pagination.hasNextPage).toBe(true);
      expect(body.pagination.hasPreviousPage).toBe(true);
    });

    it("returns empty data for page beyond total", async () => {
      const req = createMockRequest({ page: "100", pageSize: "20" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(0);
    });

    it("returns 400 for invalid page parameter", async () => {
      const req = createMockRequest({ page: "0" });
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(400);
      const body = res._json as { error: string };
      expect(body.error).toContain("Invalid filter");
    });

    it("returns 400 for non-integer page", async () => {
      const req = createMockRequest({ page: "abc" });
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(400);
    });

    it("returns 400 for negative page", async () => {
      const req = createMockRequest({ page: "-1" });
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(400);
    });

    it("returns 400 for pageSize exceeding max", async () => {
      const req = createMockRequest({ pageSize: "200" });
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(400);
    });
  });

  describe("combined filters", () => {
    it("applies search and status together", async () => {
      const req = createMockRequest({ search: "sprint", status: "completed" });
      const res = createMockResponse();

      await GET(req, res);

      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.id).toBe("m1");
    });
  });

  describe("empty store", () => {
    it("returns empty response when no meetings exist", async () => {
      setMeetingsStore([]);
      const req = createMockRequest();
      const res = createMockResponse();

      await GET(req, res);

      expect(res._status).toBe(200);
      const body = res._json as PaginatedResponse<Meeting>;
      expect(body.data).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
      expect(body.pagination.totalPages).toBe(0);
    });
  });
});
