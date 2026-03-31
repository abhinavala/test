import Joi from 'joi';
import { SlackConfig, SlackAppManifest } from '../types/slack';

const slackConfigSchema = Joi.object({
  clientId: Joi.string().required(),
  clientSecret: Joi.string().required(),
  signingSecret: Joi.string().required(),
  redirectUri: Joi.string().uri().required(),
  scopes: Joi.array().items(Joi.string()).default([
    'chat:write',
    'commands',
    'users:read',
    'channels:read',
  ]),
});

export function validateSlackConfig(): SlackConfig {
  const config = {
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    redirectUri: process.env.SLACK_OAUTH_REDIRECT_URL,
    scopes: process.env.SLACK_SCOPES
      ? process.env.SLACK_SCOPES.split(',')
      : undefined,
  };

  const { error, value } = slackConfigSchema.validate(config, {
    abortEarly: false,
  });

  if (error) {
    throw new Error(
      `Invalid Slack configuration: ${error.details.map((d) => d.message).join(', ')}`
    );
  }

  return value as SlackConfig;
}

export function getSlackAppManifest(): SlackAppManifest {
  return {
    displayInformation: {
      name: 'Aria',
      description: 'AI Meeting Intelligence',
    },
    features: {
      botUser: {
        displayName: 'Aria',
        alwaysOnline: true,
      },
      slashCommands: [
        {
          command: '/aria',
          description: 'Interact with Aria AI Meeting Intelligence',
          url: `${process.env.SLACK_OAUTH_REDIRECT_URL?.replace('/callback', '/commands')}`,
        },
      ],
    },
    oauthConfig: {
      scopes: {
        bot: ['chat:write', 'commands', 'users:read', 'channels:read'],
      },
      redirectUrls: [process.env.SLACK_OAUTH_REDIRECT_URL || ''],
    },
    settings: {},
  };
}
