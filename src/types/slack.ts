export interface SlackConfig {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface SlackAppManifest {
  displayInformation: {
    name: string;
    description: string;
  };
  features: {
    botUser: {
      displayName: string;
      alwaysOnline: boolean;
    };
    slashCommands: Array<{
      command: string;
      description: string;
      url: string;
    }>;
  };
  oauthConfig: {
    scopes: {
      bot: string[];
    };
    redirectUrls: string[];
  };
  settings: {
    eventSubscriptions?: {
      requestUrl: string;
      botEvents: string[];
    };
  };
}

export type SlackScope =
  | 'chat:write'
  | 'commands'
  | 'users:read'
  | 'channels:read'
  | 'groups:read'
  | 'im:read'
  | 'mpim:read';

export interface OAuthAccessResult {
  ok: boolean;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: {
    id: string;
    name: string;
  };
  authed_user?: {
    id: string;
    scope?: string;
    access_token?: string;
    token_type?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  incoming_webhook?: {
    channel: string;
    channel_id: string;
    configuration_url: string;
    url: string;
  };
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

export interface OAuthStatePayload {
  userId: string;
  timestamp: number;
}

export interface SlashCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}
