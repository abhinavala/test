export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  slackUserId?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  login: () => void;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}
