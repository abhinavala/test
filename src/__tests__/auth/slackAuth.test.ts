import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initiateSlackOAuth, handleOAuthCallback } from "../../lib/auth.js";
import { AuthenticationError } from "../../types/auth.js";

// Mock browser APIs
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((_index: number) => null),
  };
})();

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((_index: number) => null),
  };
})();

Object.defineProperty(globalThis, "sessionStorage", { value: sessionStorageMock, writable: true });
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

// Mock crypto.getRandomValues
Object.defineProperty(globalThis, "crypto", {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  },
  writable: true,
});

// Mock window.location
Object.defineProperty(globalThis, "window", {
  value: { location: { origin: "http://localhost:3000" } },
  writable: true,
});

// Mock fetch
const fetchMock = vi.fn();
Object.defineProperty(globalThis, "fetch", { value: fetchMock, writable: true });

describe("Slack OAuth Authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.clear();
    localStorageMock.clear();
    process.env.NEXT_PUBLIC_SLACK_CLIENT_ID = "test-client-id";
    process.env.NEXT_PUBLIC_SLACK_REDIRECT_URI = "http://localhost:3000/auth/callback";
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:4000";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SLACK_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_SLACK_REDIRECT_URI;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  describe("initiateSlackOAuth", () => {
    it("generates valid OAuth URL", async () => {
      const url = await initiateSlackOAuth();

      expect(url).toMatch(/^https:\/\/slack\.com\/oauth\/v2\/authorize/);
      expect(url).toContain("client_id=test-client-id");
      expect(url).toContain("redirect_uri=");
      expect(url).toContain("scope=");
      expect(url).toContain("state=");
    });

    it("stores state parameter in sessionStorage", async () => {
      await initiateSlackOAuth();
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        "slack_oauth_state",
        expect.any(String)
      );
    });
  });

  describe("handleOAuthCallback", () => {
    it("throws error for invalid state parameter", async () => {
      sessionStorageMock.setItem("slack_oauth_state", "stored-state-value");

      try {
        await handleOAuthCallback("some-code", "wrong-state");
        expect.fail("Expected AuthenticationError to be thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(AuthenticationError);
        expect((err as AuthenticationError).code).toBe("INVALID_STATE");
      }
    });

    it("throws error when no state is stored", async () => {
      try {
        await handleOAuthCallback("some-code", "any-state");
        expect.fail("Expected AuthenticationError to be thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(AuthenticationError);
        expect((err as AuthenticationError).code).toBe("INVALID_STATE");
      }
    });

    it("exchanges code for user data on valid callback", async () => {
      const storedState = "valid-state-123";
      sessionStorageMock.setItem("slack_oauth_state", storedState);

      const mockUser = {
        id: "u1",
        slackUserId: "U123",
        teamId: "T123",
        name: "Test User",
        email: "test@example.com",
        avatarUrl: null,
        accessToken: "xoxb-token",
        refreshToken: "xoxr-refresh",
        tokenExpiresAt: null,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: mockUser,
          accessToken: "access-token-123",
          refreshToken: "refresh-token-123",
        }),
      });

      const user = await handleOAuthCallback("auth-code", storedState);

      expect(user).toEqual(mockUser);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:4000/api/auth/slack/callback",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
      expect(localStorageMock.setItem).toHaveBeenCalledWith("auth_token", "access-token-123");
      expect(localStorageMock.setItem).toHaveBeenCalledWith("auth_refresh_token", "refresh-token-123");
    });
  });
});

describe("useAuth hook contract", () => {
  it("provides authentication state and methods", async () => {
    // Verify the hook exports exist and have the right shape by importing the types
    const authTypes = await import("../../types/auth.js");

    // Verify AuthContextType extends AuthState with the required methods
    type _VerifyLogin = AuthContextType["login"];
    type _VerifyLogout = AuthContextType["logout"];
    type _VerifyRefresh = AuthContextType["refreshToken"];
    type _VerifyUser = AuthContextType["user"];
    type _VerifyIsAuth = AuthContextType["isAuthenticated"];
    type _VerifyIsLoading = AuthContextType["isLoading"];
    type _VerifyError = AuthContextType["error"];

    // Verify the types are exported
    expect(authTypes.AuthenticationError).toBeDefined();

    // Verify useAuth is exported from the hook module
    const hookModule = await import("../../hooks/useAuth.js");
    expect(typeof hookModule.useAuth).toBe("function");
  });
});

// Type-level import to verify AuthContextType shape
import type { AuthContextType } from "../../types/auth.js";
