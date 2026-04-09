import { FC } from 'react';
import type { PrivacySettings as PrivacySettingsType } from '../../types/settings.js';
import Toggle from '../ui/Toggle.js';
import Select from '../ui/Select.js';

export interface PrivacySettingsProps {
  settings: PrivacySettingsType;
  onUpdate: (updates: Partial<PrivacySettingsType>) => void;
}

const RETENTION_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '365', label: '365 days' },
];

export const PrivacySettings: FC<PrivacySettingsProps> = ({
  settings,
  onUpdate,
}) => {
  return (
    <section className="settings-section" aria-labelledby="privacy-heading">
      <h2 id="privacy-heading" className="settings-section__title">
        Privacy
      </h2>

      <div className="settings-section__content">
        <Select
          id="data-retention"
          label="Data Retention Period"
          description="How long to keep meeting data before automatic deletion"
          value={String(settings.dataRetentionDays)}
          options={RETENTION_OPTIONS}
          onChange={(value) => onUpdate({ dataRetentionDays: Number(value) })}
        />
        <Toggle
          id="allow-recording"
          label="Allow Recording"
          description="Permit audio and video recording of meetings"
          checked={settings.allowRecording}
          onChange={(checked) => onUpdate({ allowRecording: checked })}
        />
        <Toggle
          id="share-analytics"
          label="Share Analytics"
          description="Share anonymized usage data to improve the service"
          checked={settings.shareAnalytics}
          onChange={(checked) => onUpdate({ shareAnalytics: checked })}
        />
        <Toggle
          id="anonymize-data"
          label="Anonymize Data"
          description="Remove personally identifiable information from stored data"
          checked={settings.anonymizeData}
          onChange={(checked) => onUpdate({ anonymizeData: checked })}
        />
      </div>
    </section>
  );
};

export default PrivacySettings;
