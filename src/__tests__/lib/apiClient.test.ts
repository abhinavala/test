import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClient, handleApiError, createApiClient } from "../../lib/apiClient.js";
import { ApiError } from "../../types/api.js";
import * as auth from "../../lib/auth.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  auth.clearTokens();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ApiClient", () => {
  const client = new ApiClient({
    baseUrl: "http://localhost:3000",
    timeout: 5000,
    retryAttempts: 2,
  });

  describe("get", () => {
    it("returns successful response with valid data", async () => {
      const payload = { id: "1", name: "Test Meeting" };
      mockFetch.mockResolvedValueOnce(jsonResponse(payload));

      const response = await client.get<typeof payload>("/meetings/1");

      expect(response.success).toBe(true);
      expect(response.data).toEqual(payload);
      expect(response.status).toBe(200);
    });

    it("sends Authorization header when token is set", async () => {
      auth.setTokens("test-access-token", "test-refresh-token");
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await client.get("/test");

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer test-access-token",
      );
    });
  });

  describe("post", () => {
    it("sends JSON body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ created: true }, 201));
      const body = { title: "New Meeting" };

      const response = await client.post("/meetings", body);

      expect(response.success).toBe(true);
      expect(response.status).toBe(201);
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.body).toBe(JSON.stringify(body));
    });
  });

  describe("put", () => {
    it("sends PUT request with data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ updated: true }));

      await client.put("/meetings/1", { title: "Updated" });

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.method).toBe("PUT");
    });
  });

  describe("delete", () => {
    it("sends DELETE request", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ deleted: true }));

      await client.delete("/meetings/1");

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.method).toBe("DELETE");
    });
  });

  describe("error handling", () => {
    it("throws ApiError on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: "Not found" }, 404),
      );

      await expect(client.get("/missing")).rejects.toThrow(ApiError);
    });

    it("classifies 404 as VALIDATION_ERROR", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: "Not found" }, 404),
      );

      await expect(client.get("/missing")).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        status: 404,
      });
    });

    it("classifies 500 as SERVER_ERROR", async () => {
      // exhaust retries (retryAttempts=2 means 2 total tries)
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "Internal" }, 500),
      );

      await expect(client.get("/fail")).rejects.toMatchObject({
        code: "SERVER_ERROR",
        status: 500,
      });
    });
  });

  describe("automatic token refresh on 401", () => {
    it("retries request after refreshing token", async () => {
      auth.setTokens("expired-token", "valid-refresh");

      // First call returns 401
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401));
      // Refresh call succeeds
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ accessToken: "new-token", refreshToken: "new-refresh" }),
      );
      // Retry succeeds
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      const response = await client.get<{ data: string }>("/protected");

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ data: "ok" });
      // 3 fetch calls: original 401, refresh, retry
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("throws AUTH_ERROR when refresh fails", async () => {
      auth.setTokens("expired-token", "bad-refresh");

      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

      await expect(client.get("/protected")).rejects.toMatchObject({
        code: "AUTH_ERROR",
      });
    });
  });
});

describe("handleApiError", () => {
  it("returns same ApiError if already ApiError", () => {
    const original = new ApiError("test", "SERVER_ERROR", 500);
    expect(handleApiError(original)).toBe(original);
  });

  it("converts network error to ApiError with NETWORK_ERROR code", () => {
    const networkError = new TypeError("Failed to fetch");
    const result = handleApiError(networkError);

    expect(result).toBeInstanceOf(ApiError);
    expect(result.code).toBe("NETWORK_ERROR");
    expect(result.status).toBe(0);
    expect(result.message).toBe("Network connection failed");
  });

  it("converts AbortError to TIMEOUT_ERROR", () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    const result = handleApiError(abortError);

    expect(result).toBeInstanceOf(ApiError);
    expect(result.code).toBe("TIMEOUT_ERROR");
    expect(result.status).toBe(0);
  });

  it("converts unknown error to UNKNOWN_ERROR", () => {
    const result = handleApiError("something weird");

    expect(result).toBeInstanceOf(ApiError);
    expect(result.code).toBe("UNKNOWN_ERROR");
  });
});

describe("createApiClient", () => {
  it("creates client with default config", async () => {
    const client = await createApiClient();
    expect(client).toBeInstanceOf(ApiClient);
  });
});
