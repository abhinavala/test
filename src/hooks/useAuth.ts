import { useContext } from "react";
import type { AuthContextType } from "../types/auth.js";
import { AuthContext } from "../components/auth/AuthProvider.js";

/**
 * Hook that provides access to the authentication context.
 * Must be used within an AuthProvider.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
