/**
 * Configuration for speaker analytics calculations.
 */
export interface SpeakerAnalyticsConfig {
  /** Overlap threshold in milliseconds for interruption detection. Default: 500 */
  interruptionThresholdMs?: number;
}

export interface AppConfig {
  apiBaseUrl: string;
  environment: 'development' | 'production' | 'test';
  version: string;
}
