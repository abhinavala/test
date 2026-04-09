import { useState, useCallback } from 'react';
import type {
  SettingsFormData,
  ValidationError,
  NotificationSettings,
  SlackIntegrationSettings,
  PrivacySettings,
} from '../types/settings.js';
import type { ThemeMode } from '../types/theme.js';
import { DEFAULT_SETTINGS } from '../types/settings.js';

export interface UseUserSettingsReturn {
  settings: SettingsFormData;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  updateSettings: (updates: Partial<SettingsFormData>) => Promise<void>;
  updateNotifications: (updates: Partial<NotificationSettings>) => void;
  updateSlackIntegration: (updates: Partial<SlackIntegrationSettings>) => void;
  updatePrivacy: (updates: Partial<PrivacySettings>) => void;
  updateTheme: (theme: ThemeMode) => void;
  resetSettings: () => void;
  connectSlack: () => Promise<void>;
  disconnectSlack: () => Promise<void>;
}

function validateSettings(data: Partial<SettingsFormData>): ValidationError | null {
  if (data.privacy) {
    if (
      data.privacy.dataRetentionDays !== undefined &&
      (data.privacy.dataRetentionDays < 1 || data.privacy.dataRetentionDays > 365)
    ) {
      return {
        field: 'privacy.dataRetentionDays',
        message: 'Data retention must be between 1 and 365 days',
      };
    }
  }

  if (data.theme !== undefined) {
    const validThemes: ThemeMode[] = ['dark', 'light', 'system'];
    if (!validThemes.includes(data.theme)) {
      return {
        field: 'theme',
        message: 'Invalid theme selection',
      };
    }
  }

  return null;
}

export function useUserSettings(): UseUserSettingsReturn {
  const [settings, setSettings] = useState<SettingsFormData>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSettings = useCallback(
    async (updates: Partial<SettingsFormData>): Promise<void> => {
      const validationError = validateSettings(updates);
      if (validationError) {
        throw new Error(`ValidationError:${validationError.field}:${validationError.message}`);
      }

      setIsSaving(true);
      setError(null);
      try {
        setSettings((prev) => ({ ...prev, ...updates }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update settings';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  const updateNotifications = useCallback(
    (updates: Partial<NotificationSettings>) => {
      setSettings((prev) => ({
        ...prev,
        notifications: { ...prev.notifications, ...updates },
      }));
    },
    [],
  );

  const updateSlackIntegration = useCallback(
    (updates: Partial<SlackIntegrationSettings>) => {
      setSettings((prev) => ({
        ...prev,
        slackIntegration: { ...prev.slackIntegration, ...updates },
      }));
    },
    [],
  );

  const updatePrivacy = useCallback(
    (updates: Partial<PrivacySettings>) => {
      setSettings((prev) => ({
        ...prev,
        privacy: { ...prev.privacy, ...updates },
      }));
    },
    [],
  );

  const updateTheme = useCallback((theme: ThemeMode) => {
    setSettings((prev) => ({ ...prev, theme }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    setError(null);
  }, []);

  const connectSlack = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const slackOAuthUrl = '/api/auth/slack/connect';
      window.location.href = slackOAuthUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect Slack';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnectSlack = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSettings((prev) => ({
        ...prev,
        slackIntegration: {
          ...DEFAULT_SETTINGS.slackIntegration,
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect Slack';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    settings,
    isLoading,
    isSaving,
    error,
    updateSettings,
    updateNotifications,
    updateSlackIntegration,
    updatePrivacy,
    updateTheme,
    resetSettings,
    connectSlack,
    disconnectSlack,
  };
}

export default useUserSettings;
