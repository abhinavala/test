export interface AppConfig {
  apiBaseUrl: string;
  environment: "development" | "production" | "test";
  version: string;
}
