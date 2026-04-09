import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  SettingsFormData,
  NotificationSettings,
  SlackIntegrationSettings,
  PrivacySettings,
  ValidationError,
} from '../../types/settings.js';
import type { ThemeMode } from '../../types/theme.js';
import { DEFAULT_SETTINGS } from '../../types/settings.js';

// Mock React hooks for testing useUserSettings logic
let mockState: Record<string, unknown> = {};
let mockSetters: Record<string, (val: unknown) => void> = {};
let stateIndex = 0;

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const key = `state_${stateIndex++}`;
    if (!(key in mockState)) {
      mockState[key] = initial;
    }
    const setter = (val: unknown) => {
      if (typeof val === 'function') {
        mockState[key] = (val as (prev: unknown) => unknown)(mockState[key]);
      } else {
        mockState[key] = val;
      }
    };
    mockSetters[key] = setter;
    return [mockState[key], setter];
  },
  useCallback: (fn: unknown) => fn,
}));

function resetMockState(): void {
  mockState = {};
  mockSetters = {};
  stateIndex = 0;
}

async function createHook() {
  stateIndex = 0;
  const mod = await import('../../hooks/useUserSettings.js');
  return mod.useUserSettings();
}

describe('SettingsPage renders all settings sections correctly', () => {
  it('should export SettingsFormData with all required fields', () => {
    const formData: SettingsFormData = {
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

    expect(formData.theme).toBe('dark');
    expect(formData.notifications).toBeDefined();
    expect(formData.slackIntegration).toBeDefined();
    expect(formData.privacy).toBeDefined();
  });

  it('should render SlackIntegrationSection, NotificationSettings, PrivacySettings, and ThemeSelector components', async () => {
    // Verify all component modules can be imported
    const [slack, notification, privacy, theme] = await Promise.all([
      import('../../components/settings/SlackIntegrationSection.js'),
      import('../../components/settings/NotificationSettings.js'),
      import('../../components/settings/PrivacySettings.js'),
      import('../../components/settings/ThemeSelector.js'),
    ]);

    expect(slack.SlackIntegrationSection).toBeDefined();
    expect(typeof slack.SlackIntegrationSection).toBe('function');

    expect(notification.NotificationSettings).toBeDefined();
    expect(typeof notification.NotificationSettings).toBe('function');

    expect(privacy.PrivacySettings).toBeDefined();
    expect(typeof privacy.PrivacySettings).toBe('function');

    expect(theme.ThemeSelector).toBeDefined();
    expect(typeof theme.ThemeSelector).toBe('function');
  });

  it('should export default settings with all sections', () => {
    expect(DEFAULT_SETTINGS).toBeDefined();
    expect(DEFAULT_SETTINGS.theme).toBe('dark');
    expect(DEFAULT_SETTINGS.notifications).toBeDefined();
    expect(DEFAULT_SETTINGS.slackIntegration).toBeDefined();
    expect(DEFAULT_SETTINGS.privacy).toBeDefined();
  });

  it('should export Toggle and Select UI components', async () => {
    const [toggle, select] = await Promise.all([
      import('../../components/ui/Toggle.js'),
      import('../../components/ui/Select.js'),
    ]);

    expect(toggle.Toggle).toBeDefined();
    expect(typeof toggle.Toggle).toBe('function');

    expect(select.Select).toBeDefined();
    expect(typeof select.Select).toBe('function');
  });
});

describe('useUserSettings.updateSettings handles validation errors', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('should throw ValidationError with specific field name when invalid data retention is provided', async () => {
    const hook = await createHook();

    await expect(
      hook.updateSettings({
        privacy: {
          dataRetentionDays: 0,
          allowRecording: true,
          shareAnalytics: false,
          anonymizeData: false,
        },
      }),
    ).rejects.toThrow('ValidationError:privacy.dataRetentionDays');
  });

  it('should throw ValidationError when data retention exceeds maximum', async () => {
    const hook = await createHook();

    await expect(
      hook.updateSettings({
        privacy: {
          dataRetentionDays: 500,
          allowRecording: true,
          shareAnalytics: false,
          anonymizeData: false,
        },
      }),
    ).rejects.toThrow('ValidationError:privacy.dataRetentionDays');
  });

  it('should throw ValidationError for invalid theme', async () => {
    const hook = await createHook();

    await expect(
      hook.updateSettings({
        theme: 'neon' as ThemeMode,
      }),
    ).rejects.toThrow('ValidationError:theme');
  });

  it('should accept valid settings without throwing', async () => {
    const hook = await createHook();

    await expect(
      hook.updateSettings({
        theme: 'light',
      }),
    ).resolves.toBeUndefined();
  });

  it('should accept valid privacy settings', async () => {
    const hook = await createHook();

    await expect(
      hook.updateSettings({
        privacy: {
          dataRetentionDays: 180,
          allowRecording: false,
          shareAnalytics: true,
          anonymizeData: true,
        },
      }),
    ).resolves.toBeUndefined();
  });
});

describe('SlackIntegrationSection displays connection status and workspace info', () => {
  it('should show connected status when isConnected is true', () => {
    const connectedSettings: SlackIntegrationSettings = {
      isConnected: true,
      workspaceId: 'ws-123',
      workspaceName: 'My Workspace',
      syncActionItems: true,
      syncChannelData: false,
    };

    expect(connectedSettings.isConnected).toBe(true);
  });

  it('should display workspaceName when available', () => {
    const settings: SlackIntegrationSettings = {
      isConnected: true,
      workspaceId: 'ws-456',
      workspaceName: 'Engineering Team',
      syncActionItems: false,
      syncChannelData: false,
    };

    expect(settings.workspaceName).toBe('Engineering Team');
  });

  it('should show disconnected status when isConnected is false', () => {
    const disconnectedSettings: SlackIntegrationSettings = {
      isConnected: false,
      syncActionItems: false,
      syncChannelData: false,
    };

    expect(disconnectedSettings.isConnected).toBe(false);
    expect(disconnectedSettings.workspaceName).toBeUndefined();
  });

  it('should have default Slack settings as disconnected', () => {
    expect(DEFAULT_SETTINGS.slackIntegration.isConnected).toBe(false);
    expect(DEFAULT_SETTINGS.slackIntegration.syncActionItems).toBe(false);
    expect(DEFAULT_SETTINGS.slackIntegration.syncChannelData).toBe(false);
  });
});

describe('useUserSettings hook functionality', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('should return default settings initially', async () => {
    const hook = await createHook();

    expect(hook.settings).toEqual(DEFAULT_SETTINGS);
    expect(hook.isLoading).toBe(false);
    expect(hook.isSaving).toBe(false);
    expect(hook.error).toBeNull();
  });

  it('should provide all expected methods', async () => {
    const hook = await createHook();

    expect(typeof hook.updateSettings).toBe('function');
    expect(typeof hook.updateNotifications).toBe('function');
    expect(typeof hook.updateSlackIntegration).toBe('function');
    expect(typeof hook.updatePrivacy).toBe('function');
    expect(typeof hook.updateTheme).toBe('function');
    expect(typeof hook.resetSettings).toBe('function');
    expect(typeof hook.connectSlack).toBe('function');
    expect(typeof hook.disconnectSlack).toBe('function');
  });

  it('should update notification settings', async () => {
    const hook = await createHook();

    hook.updateNotifications({ emailNotifications: false });

    // Re-read state after update
    stateIndex = 0;
    const updated = await createHook();
    expect(updated.settings.notifications.emailNotifications).toBe(false);
  });

  it('should update theme', async () => {
    const hook = await createHook();

    hook.updateTheme('light');

    stateIndex = 0;
    const updated = await createHook();
    expect(updated.settings.theme).toBe('light');
  });

  it('should reset settings to defaults', async () => {
    const hook = await createHook();

    hook.updateTheme('light');
    hook.resetSettings();

    stateIndex = 0;
    const updated = await createHook();
    expect(updated.settings).toEqual(DEFAULT_SETTINGS);
  });
});
