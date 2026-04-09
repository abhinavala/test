import type { ApiClientConfig, ApiResponse, ApiErrorCode, RequestConfig } from "../types/api.js";
import { ApiError } from "../types/api.js";
import { getAccessToken, refreshAccessToken } from "./auth.js";

/** Classifies an HTTP status code into an ApiErrorCode. */
function classifyStatus(status: number): ApiErrorCode {
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 408) return "TIMEOUT_ERROR";
  if (status >= 400 && status < 500) return "VALIDATION_ERROR";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN_ERROR";
}

/**
 * Converts an unknown error into a structured ApiError.
 */
export function handleApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return new ApiError("Network connection failed", "NETWORK_ERROR", 0);
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiError("Request timed out", "TIMEOUT_ERROR", 0);
  }

  const message = error instanceof Error ? error.message : "An unknown error occurred";
  return new ApiError(message, "UNKNOWN_ERROR", 0);
}

/**
 * Type-safe HTTP client with authentication, retry, and error handling.
 */
export class ApiClient {
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = config;
  }

  async get<T>(url: string): Promise<ApiResponse<T>> {
    return this.request<T>({ method: "GET", url });
  }

  async post<T>(url: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>({ method: "POST", url, data });
  }

  async put<T>(url: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>({ method: "PUT", url, data });
  }

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    return this.request<T>({ method: "DELETE", url });
  }

  private async request<T>(
    reqConfig: RequestConfig,
    attempt = 0,
    isRetryAfterRefresh = false,
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...reqConfig.headers,
      };

      const token = getAccessToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const fetchOptions: RequestInit = {
        method: reqConfig.method,
        headers,
        signal: controller.signal,
      };

      if (reqConfig.data !== undefined && reqConfig.method !== "GET") {
        fetchOptions.body = JSON.stringify(reqConfig.data);
      }

      const fullUrl = `${this.config.baseUrl}${reqConfig.url}`;
      const response = await fetch(fullUrl, fetchOptions);

      if (response.status === 401 && !isRetryAfterRefresh) {
        try {
          await refreshAccessToken(this.config.baseUrl);
          return this.request<T>(reqConfig, attempt, true);
        } catch {
          throw new ApiError("Authentication failed", "AUTH_ERROR", 401);
        }
      }

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          // no parseable body
        }
        const code = classifyStatus(response.status);
        const msg =
          (errorBody as any)?.message ??
          (errorBody as any)?.error ??
          `Request failed with status ${response.status}`;
        throw new ApiError(msg, code, response.status, errorBody);
      }

      const data = (await response.json()) as T;
      return { success: true, data, status: response.status };
    } catch (error) {
      const apiErr = handleApiError(error);
      const isRetryable =
        apiErr.code === "NETWORK_ERROR" ||
        apiErr.code === "TIMEOUT_ERROR" ||
        apiErr.code === "SERVER_ERROR";

      if (isRetryable && attempt < this.config.retryAttempts - 1) {
        return this.request<T>(reqConfig, attempt + 1, isRetryAfterRefresh);
      }

      throw handleApiError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/** Creates an ApiClient with default configuration. */
export async function createApiClient(): Promise<ApiClient> {
  const baseUrl = process.env["API_BASE_URL"] ?? "http://localhost:3000";
  const timeout = Number(process.env["API_TIMEOUT"] ?? "30000");
  const retryAttempts = Number(process.env["API_RETRY_ATTEMPTS"] ?? "3");

  return new ApiClient({ baseUrl, timeout, retryAttempts });
}
