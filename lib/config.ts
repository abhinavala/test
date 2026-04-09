import type { AppConfig } from "@/types/config";

export function getAppConfig(): AppConfig {
  return {
    apiBaseUrl:
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api",
    environment:
      (process.env.NODE_ENV as AppConfig["environment"]) ?? "development",
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
  };
}
