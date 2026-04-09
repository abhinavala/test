import type { User } from "../types/auth.js";
import { AuthenticationError } from "../types/auth.js";

const SLACK_OAUTH_BASE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const STATE_STORAGE_KEY = "slack_oauth_state";
const TOKEN_STORAGE_KEY = "auth_token";
const REFRESH_TOKEN_STORAGE_KEY = "auth_refresh_token";

function generateRandomState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Initiates the Slack OAuth flow by generating an authorization URL.
 * Stores the state parameter in sessionStorage for CSRF verification.
 */
export async function initiateSlackOAuth(): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID ?? "";
  const redirectUri = process.env.NEXT_PUBLIC_SLACK_REDIRECT_URI ?? `${window.location.origin}/auth/callback`;
  const scope = "users:read,users:read.email,channels:read,channels:history";

  const state = generateRandomState();
  sessionStorage.setItem(STATE_STORAGE_KEY, state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    response_type: "code",
  });

  return `${SLACK_OAUTH_BASE_URL}?${params.toString()}`;
}

/**
 * Handles the OAuth callback by exchanging the authorization code for tokens
 * and fetching the user profile. Validates the state parameter against the
 * stored value to prevent CSRF attacks.
 */
export async function handleOAuthCallback(code: string, state: string): Promise<User> {
  const storedState = sessionStorage.getItem(STATE_STORAGE_KEY);
  sessionStorage.removeItem(STATE_STORAGE_KEY);

  if (!storedState || storedState !== state) {
    throw new AuthenticationError(
      "OAuth state parameter mismatch — possible CSRF attack",
      "INVALID_STATE"
    );
  }

  if (!code) {
    throw new AuthenticationError("Missing authorization code", "MISSING_CODE");
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const response = await fetch(`${baseUrl}/api/auth/slack/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new AuthenticationError(
      (body.message as string) ?? "OAuth callback failed",
      "CALLBACK_FAILED"
    );
  }

  const data = (await response.json()) as { user: User; accessToken: string; refreshToken: string | null };

  localStorage.setItem(TOKEN_STORAGE_KEY, data.accessToken);
  if (data.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, data.refreshToken);
  }

  return data.user;
}

/** Fetches the current authenticated user using the stored access token. */
export async function fetchCurrentUser(): Promise<User | null> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return null;

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return null;
  const data = (await response.json()) as { user: User };
  return data.user;
}

/** Refreshes the access token using the stored refresh token. */
export async function refreshAccessToken(): Promise<User> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  if (!refreshToken) {
    throw new AuthenticationError("No refresh token available", "NO_REFRESH_TOKEN");
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const response = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    clearStoredTokens();
    throw new AuthenticationError("Token refresh failed", "REFRESH_FAILED");
  }

  const data = (await response.json()) as { user: User; accessToken: string; refreshToken: string | null };
  localStorage.setItem(TOKEN_STORAGE_KEY, data.accessToken);
  if (data.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, data.refreshToken);
  }

  return data.user;
}

/** Clears all stored authentication tokens and performs server-side logout. */
export async function performLogout(): Promise<void> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

  if (token) {
    await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  clearStoredTokens();
}

function clearStoredTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}
