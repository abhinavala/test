import React from "react";
import { useAuth } from "../../hooks/useAuth.js";

/**
 * A button that initiates the Slack OAuth login flow.
 * Shows loading state while authentication is in progress.
 */
export function LoginButton(): JSX.Element {
  const { login, isLoading, isAuthenticated, user, logout } = useAuth();

  if (isLoading) {
    return (
      <button disabled className="auth-button auth-button--loading">
        Loading…
      </button>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="auth-user-info">
        <span className="auth-user-name">{user.name}</span>
        <button onClick={() => void logout()} className="auth-button auth-button--logout">
          Logout
        </button>
      </div>
    );
  }

  return (
    <button onClick={login} className="auth-button auth-button--login">
      Sign in with Slack
    </button>
  );
}
