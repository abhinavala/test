/** Token storage and refresh utilities for API authentication. */

let accessToken: string | null = null;
let refreshToken: string | null = null;
let tokenRefreshPromise: Promise<string> | null = null;

/** Sets the current authentication tokens. */
export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshToken = refresh;
}

/** Returns the current access token, or null if not authenticated. */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Clears all stored tokens (logout). */
export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  tokenRefreshPromise = null;
}

/**
 * Refreshes the access token using the stored refresh token.
 * Deduplicates concurrent refresh calls so only one network request is made.
 */
export async function refreshAccessToken(baseUrl: string): Promise<string> {
  if (tokenRefreshPromise) {
    return tokenRefreshPromise;
  }

  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  tokenRefreshPromise = (async () => {
    try {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        clearTokens();
        throw new Error("Token refresh failed");
      }

      const data = (await response.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      accessToken = data.accessToken;
      refreshToken = data.refreshToken;
      return data.accessToken;
    } finally {
      tokenRefreshPromise = null;
    }
  })();

  return tokenRefreshPromise;
}
