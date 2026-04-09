import { FC } from 'react';
import type { SlackIntegrationSettings } from '../../types/settings.js';
import Toggle from '../ui/Toggle.js';

export interface SlackIntegrationSectionProps {
  settings: SlackIntegrationSettings;
  onUpdate: (updates: Partial<SlackIntegrationSettings>) => void;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  isLoading: boolean;
}

export const SlackIntegrationSection: FC<SlackIntegrationSectionProps> = ({
  settings,
  onUpdate,
  onConnect,
  onDisconnect,
  isLoading,
}) => {
  return (
    <section className="settings-section" aria-labelledby="slack-integration-heading">
      <h2 id="slack-integration-heading" className="settings-section__title">
        Slack Integration
      </h2>

      <div className="settings-section__content">
        <div className="slack-connection-status">
          <div className="slack-connection-status__info">
            <span
              className={`slack-connection-status__indicator ${
                settings.isConnected
                  ? 'slack-connection-status__indicator--connected'
                  : 'slack-connection-status__indicator--disconnected'
              }`}
            />
            <span className="slack-connection-status__text">
              {settings.isConnected ? 'Connected' : 'Not connected'}
            </span>
          </div>

          {settings.isConnected && settings.workspaceName && (
            <p className="slack-connection-status__workspace">
              Workspace: <strong>{settings.workspaceName}</strong>
            </p>
          )}

          <button
            type="button"
            className={`btn ${settings.isConnected ? 'btn--danger' : 'btn--primary'}`}
            onClick={settings.isConnected ? onDisconnect : onConnect}
            disabled={isLoading}
          >
            {isLoading
              ? 'Processing...'
              : settings.isConnected
                ? 'Disconnect Slack'
                : 'Connect Slack'}
          </button>
        </div>

        {settings.isConnected && (
          <div className="slack-sync-options">
            <Toggle
              id="sync-action-items"
              label="Sync Action Items"
              description="Automatically send action items to Slack channels"
              checked={settings.syncActionItems}
              onChange={(checked) => onUpdate({ syncActionItems: checked })}
            />
            <Toggle
              id="sync-channel-data"
              label="Sync Channel Data"
              description="Import channel information for meeting context"
              checked={settings.syncChannelData}
              onChange={(checked) => onUpdate({ syncChannelData: checked })}
            />
          </div>
        )}
      </div>
    </section>
  );
};

export default SlackIntegrationSection;
