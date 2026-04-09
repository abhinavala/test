/** Represents an authenticated Slack user. */
export interface User {
  id: string;
  slackUserId: string;
  teamId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
}

/** Authentication state managed by the AuthProvider. */
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

/** Context value exposed by the AuthProvider. */
export interface AuthContextType extends AuthState {
  login: () => void;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

/** Error thrown during authentication flows. */
export class AuthenticationError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
  }
}
