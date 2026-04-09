import React, { createContext, useCallback, useEffect, useState } from "react";
import type { AuthContextType, AuthState, User } from "../../types/auth.js";
import {
  fetchCurrentUser,
  initiateSlackOAuth,
  performLogout,
  refreshAccessToken,
} from "../../lib/auth.js";

export const AuthContext = createContext<AuthContextType | null>(null);

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

/**
 * Provides authentication context to the component tree.
 * Handles session restoration, login, logout, and token refresh.
 */
export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((user: User | null) => {
        if (cancelled) return;
        if (user) {
          setState({ user, isAuthenticated: true, isLoading: false, error: null });
        } else {
          setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    initiateSlackOAuth()
      .then((url: string) => {
        window.location.href = url;
      })
      .catch((err: unknown) => {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Failed to initiate login",
        }));
      });
  }, []);

  const logout = useCallback(async () => {
    try {
      await performLogout();
      setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Logout failed",
      }));
    }
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const user = await refreshAccessToken();
      setState({ user, isAuthenticated: true, isLoading: false, error: null });
    } catch (err) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: err instanceof Error ? err.message : "Token refresh failed",
      });
    }
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
