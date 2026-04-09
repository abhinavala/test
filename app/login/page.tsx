"use client";

import React from "react";
import { AuthProvider } from "../../src/components/auth/AuthProvider.js";
import { LoginButton } from "../../src/components/auth/LoginButton.js";

/**
 * Login page that presents the Slack OAuth sign-in option.
 * Wrapped in AuthProvider to supply auth context to the LoginButton.
 */
export default function LoginPage(): JSX.Element {
  return (
    <AuthProvider>
      <div className="login-page">
        <div className="login-card">
          <h1>Aria AI Meeting Assistant</h1>
          <p>Sign in with your Slack workspace to get started.</p>
          <LoginButton />
        </div>
      </div>
    </AuthProvider>
  );
}
