import type { ThemeMode } from './theme.js';

export interface NotificationSettings {
  emailNotifications: boolean;
  slackNotifications: boolean;
  meetingSummaryAlerts: boolean;
  actionItemReminders: boolean;
  weeklyDigest: boolean;
}

export interface SlackIntegrationSettings {
  isConnected: boolean;
  workspaceId?: string;
  workspaceName?: string;
  syncActionItems: boolean;
  syncChannelData: boolean;
  defaultChannel?: string;
}

export interface PrivacySettings {
  dataRetentionDays: number;
  allowRecording: boolean;
  shareAnalytics: boolean;
  anonymizeData: boolean;
}

export interface SettingsFormData {
  theme: ThemeMode;
  notifications: NotificationSettings;
  slackIntegration: SlackIntegrationSettings;
  privacy: PrivacySettings;
}

export interface ValidationError {
  field: string;
  message: string;
}

export const DEFAULT_SETTINGS: SettingsFormData = {
  theme: 'dark',
  notifications: {
    emailNotifications: true,
    slackNotifications: true,
    meetingSummaryAlerts: true,
    actionItemReminders: true,
    weeklyDigest: false,
  },
  slackIntegration: {
    isConnected: false,
    syncActionItems: false,
    syncChannelData: false,
  },
  privacy: {
    dataRetentionDays: 90,
    allowRecording: true,
    shareAnalytics: false,
    anonymizeData: false,
  },
};
