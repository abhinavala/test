import { FC } from 'react';
import type { NotificationSettings as NotificationSettingsType } from '../../types/settings.js';
import Toggle from '../ui/Toggle.js';

export interface NotificationSettingsProps {
  settings: NotificationSettingsType;
  onUpdate: (updates: Partial<NotificationSettingsType>) => void;
}

export const NotificationSettings: FC<NotificationSettingsProps> = ({
  settings,
  onUpdate,
}) => {
  return (
    <section className="settings-section" aria-labelledby="notifications-heading">
      <h2 id="notifications-heading" className="settings-section__title">
        Notifications
      </h2>

      <div className="settings-section__content">
        <Toggle
          id="email-notifications"
          label="Email Notifications"
          description="Receive email updates about meetings and action items"
          checked={settings.emailNotifications}
          onChange={(checked) => onUpdate({ emailNotifications: checked })}
        />
        <Toggle
          id="slack-notifications"
          label="Slack Notifications"
          description="Receive notifications in Slack"
          checked={settings.slackNotifications}
          onChange={(checked) => onUpdate({ slackNotifications: checked })}
        />
        <Toggle
          id="meeting-summary-alerts"
          label="Meeting Summary Alerts"
          description="Get notified when meeting summaries are ready"
          checked={settings.meetingSummaryAlerts}
          onChange={(checked) => onUpdate({ meetingSummaryAlerts: checked })}
        />
        <Toggle
          id="action-item-reminders"
          label="Action Item Reminders"
          description="Receive reminders for pending action items"
          checked={settings.actionItemReminders}
          onChange={(checked) => onUpdate({ actionItemReminders: checked })}
        />
        <Toggle
          id="weekly-digest"
          label="Weekly Digest"
          description="Receive a weekly summary of meetings and action items"
          checked={settings.weeklyDigest}
          onChange={(checked) => onUpdate({ weeklyDigest: checked })}
        />
      </div>
    </section>
  );
};

export default NotificationSettings;
