"use client";

import React, { useEffect, useState } from "react";
import { handleOAuthCallback } from "../../../src/lib/auth.js";
import type { User } from "../../../src/types/auth.js";

/**
 * OAuth callback page that handles the redirect from Slack's authorization server.
 * Extracts the code and state from URL parameters, exchanges them for tokens,
 * and redirects to the dashboard on success.
 */
export default function OAuthCallbackPage(): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");

    if (oauthError) {
      setError(`Slack authorization failed: ${oauthError}`);
      setIsProcessing(false);
      return;
    }

    if (!code || !state) {
      setError("Missing authorization code or state parameter");
      setIsProcessing(false);
      return;
    }

    handleOAuthCallback(code, state)
      .then((_user: User) => {
        window.location.href = "/";
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Authentication failed");
        setIsProcessing(false);
      });
  }, []);

  if (error) {
    return (
      <div className="auth-callback-page">
        <div className="auth-callback-error">
          <h2>Authentication Error</h2>
          <p>{error}</p>
          <a href="/login">Return to Login</a>
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="auth-callback-page">
        <div className="auth-callback-loading">
          <p>Completing sign-in…</p>
        </div>
      </div>
    );
  }

  return <div />;
}
