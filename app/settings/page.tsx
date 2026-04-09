'use client';

import { FC } from 'react';
import SlackIntegrationSection from '../../src/components/settings/SlackIntegrationSection.js';
import NotificationSettings from '../../src/components/settings/NotificationSettings.js';
import PrivacySettings from '../../src/components/settings/PrivacySettings.js';
import ThemeSelector from '../../src/components/settings/ThemeSelector.js';
import { useUserSettings } from '../../src/hooks/useUserSettings.js';

const SettingsPage: FC = () => {
  const {
    settings,
    isLoading,
    isSaving,
    error,
    updateNotifications,
    updateSlackIntegration,
    updatePrivacy,
    updateTheme,
    updateSettings,
    resetSettings,
    connectSlack,
    disconnectSlack,
  } = useUserSettings();

  const handleSave = async () => {
    try {
      await updateSettings(settings);
    } catch {
      // Error state is managed by the hook
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <h1 className="settings-page__title">Settings</h1>
        <p className="settings-page__subtitle">
          Manage your account preferences, integrations, and privacy settings.
        </p>
      </div>

      {error && (
        <div className="settings-page__error" role="alert">
          {error}
        </div>
      )}

      <div className="settings-page__sections">
        <ThemeSelector
          currentTheme={settings.theme}
          onThemeChange={updateTheme}
        />

        <SlackIntegrationSection
          settings={settings.slackIntegration}
          onUpdate={updateSlackIntegration}
          onConnect={connectSlack}
          onDisconnect={disconnectSlack}
          isLoading={isLoading}
        />

        <NotificationSettings
          settings={settings.notifications}
          onUpdate={updateNotifications}
        />

        <PrivacySettings
          settings={settings.privacy}
          onUpdate={updatePrivacy}
        />
      </div>

      <div className="settings-page__actions">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={resetSettings}
          disabled={isSaving}
        >
          Reset to Defaults
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
