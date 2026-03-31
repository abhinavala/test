import jwt from 'jsonwebtoken';
import { WebClient } from '@slack/web-api';
import prisma from '../db/client';
import { encryptToken, decryptToken } from '../models/SlackWorkspace';
import { OAuthAccessResult, OAuthStatePayload, SlackConfig } from '../types/slack';
import { validateSlackConfig } from '../config/slack';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

function getSlackConfig(): SlackConfig {
  return validateSlackConfig();
}

export const slackOAuthService = {
  /**
   * Generate the Slack OAuth authorization URL with CSRF state token.
   */
  generateAuthorizationUrl(userId: string): { url: string; state: string } {
    const config = getSlackConfig();
    const state = jwt.sign(
      { userId, timestamp: Date.now() } satisfies OAuthStatePayload,
      getJwtSecret(),
      { expiresIn: '10m' }
    );

    const params = new URLSearchParams({
      client_id: config.clientId,
      scope: config.scopes.join(','),
      redirect_uri: config.redirectUri,
      state,
    });

    return {
      url: `https://slack.com/oauth/v2/authorize?${params.toString()}`,
      state,
    };
  },

  /**
   * Verify the OAuth state parameter to prevent CSRF attacks.
   */
  verifyState(state: string): OAuthStatePayload {
    try {
      const decoded = jwt.verify(state, getJwtSecret()) as OAuthStatePayload;

      if (!decoded.userId || !decoded.timestamp) {
        throw new Error('Invalid state payload');
      }

      const ageMs = Date.now() - decoded.timestamp;
      if (ageMs > 10 * 60 * 1000) {
        throw new Error('State token has expired');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('OAuth state has expired. Please try connecting again.');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid OAuth state. Please try connecting again.');
      }
      throw error;
    }
  },

  /**
   * Exchange the authorization code for access tokens via Slack API.
   */
  async exchangeCodeForToken(code: string): Promise<OAuthAccessResult> {
    const config = getSlackConfig();

    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack API returned HTTP ${response.status}`);
    }

    const result: OAuthAccessResult = await response.json();

    if (!result.ok) {
      throw new Error(`Slack OAuth error: ${result.error || 'unknown_error'}`);
    }

    return result;
  },

  /**
   * Handle the full OAuth callback: verify state, exchange code, store workspace.
   */
  async handleCallback(
    code: string,
    state: string
  ): Promise<{ teamId: string; teamName: string }> {
    const statePayload = this.verifyState(state);
    const tokenResult = await this.exchangeCodeForToken(code);

    if (!tokenResult.team?.id || !tokenResult.team?.name) {
      throw new Error('Missing team information in OAuth response');
    }

    if (!tokenResult.access_token) {
      throw new Error('Missing bot access token in OAuth response');
    }

    const encryptedBotToken = encryptToken(tokenResult.access_token);
    const encryptedAccessToken = tokenResult.authed_user?.access_token
      ? encryptToken(tokenResult.authed_user.access_token)
      : null;
    const encryptedRefreshToken = tokenResult.refresh_token
      ? encryptToken(tokenResult.refresh_token)
      : null;

    const tokenExpiresAt = tokenResult.expires_in
      ? new Date(Date.now() + tokenResult.expires_in * 1000)
      : null;

    await prisma.slackWorkspace.upsert({
      where: {
        userId_teamId: {
          userId: statePayload.userId,
          teamId: tokenResult.team.id,
        },
      },
      update: {
        teamName: tokenResult.team.name,
        botToken: encryptedBotToken,
        botUserId: tokenResult.bot_user_id || '',
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        scopes: tokenResult.scope || '',
        userScopes: tokenResult.authed_user?.scope || null,
        webhookUrl: tokenResult.incoming_webhook?.url || null,
        webhookChannel: tokenResult.incoming_webhook?.channel || null,
        webhookConfigurationUrl:
          tokenResult.incoming_webhook?.configuration_url || null,
        isActive: true,
        disconnectedAt: null,
        lastTokenRefreshAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        userId: statePayload.userId,
        teamId: tokenResult.team.id,
        teamName: tokenResult.team.name,
        botToken: encryptedBotToken,
        botUserId: tokenResult.bot_user_id || '',
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        scopes: tokenResult.scope || '',
        userScopes: tokenResult.authed_user?.scope || null,
        webhookUrl: tokenResult.incoming_webhook?.url || null,
        webhookChannel: tokenResult.incoming_webhook?.channel || null,
        webhookConfigurationUrl:
          tokenResult.incoming_webhook?.configuration_url || null,
        isActive: true,
        connectedAt: new Date(),
        lastTokenRefreshAt: new Date(),
      },
    });

    return {
      teamId: tokenResult.team.id,
      teamName: tokenResult.team.name,
    };
  },

  /**
   * Refresh an expired bot token using the refresh token.
   */
  async refreshToken(
    workspaceId: string
  ): Promise<{ success: boolean; error?: string }> {
    const workspace = await prisma.slackWorkspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return { success: false, error: 'Workspace not found' };
    }

    if (!workspace.refreshToken) {
      return { success: false, error: 'No refresh token available' };
    }

    const config = getSlackConfig();
    const decryptedRefreshToken = decryptToken(workspace.refreshToken);

    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: decryptedRefreshToken,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Slack API returned HTTP ${response.status}`,
      };
    }

    const result: OAuthAccessResult = await response.json();

    if (!result.ok) {
      if (result.error === 'invalid_refresh_token' || result.error === 'token_revoked') {
        await prisma.slackWorkspace.update({
          where: { id: workspaceId },
          data: { isActive: false, disconnectedAt: new Date() },
        });
        return {
          success: false,
          error: 'Token has been revoked. Please reconnect.',
        };
      }
      return { success: false, error: `Slack error: ${result.error}` };
    }

    const encryptedBotToken = result.access_token
      ? encryptToken(result.access_token)
      : workspace.botToken;
    const encryptedRefreshToken = result.refresh_token
      ? encryptToken(result.refresh_token)
      : workspace.refreshToken;
    const tokenExpiresAt = result.expires_in
      ? new Date(Date.now() + result.expires_in * 1000)
      : workspace.tokenExpiresAt;

    await prisma.slackWorkspace.update({
      where: { id: workspaceId },
      data: {
        botToken: encryptedBotToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        lastTokenRefreshAt: new Date(),
      },
    });

    return { success: true };
  },

  /**
   * Get a WebClient instance for a workspace, refreshing the token if needed.
   */
  async getClient(workspaceId: string): Promise<WebClient> {
    const workspace = await prisma.slackWorkspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace || !workspace.isActive) {
      throw new Error('Workspace not found or disconnected');
    }

    // Check if token needs refresh
    if (
      workspace.tokenExpiresAt &&
      workspace.refreshToken &&
      workspace.tokenExpiresAt <= new Date(Date.now() + 5 * 60 * 1000)
    ) {
      const refreshResult = await this.refreshToken(workspaceId);
      if (!refreshResult.success) {
        throw new Error(
          `Token refresh failed: ${refreshResult.error}`
        );
      }
      // Re-fetch after refresh
      const updated = await prisma.slackWorkspace.findUnique({
        where: { id: workspaceId },
      });
      if (!updated) {
        throw new Error('Workspace not found after token refresh');
      }
      return new WebClient(decryptToken(updated.botToken), {
        retryConfig: { retries: 3, factor: 2, randomize: true },
      });
    }

    return new WebClient(decryptToken(workspace.botToken), {
      retryConfig: { retries: 3, factor: 2, randomize: true },
    });
  },

  /**
   * Get all active workspaces for a user.
   */
  async getWorkspaces(userId: string) {
    return prisma.slackWorkspace.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        teamId: true,
        teamName: true,
        scopes: true,
        isActive: true,
        connectedAt: true,
        lastTokenRefreshAt: true,
      },
    });
  },

  /**
   * Get a single workspace connection status.
   */
  async getWorkspaceStatus(userId: string, workspaceId: string) {
    const workspace = await prisma.slackWorkspace.findFirst({
      where: { id: workspaceId, userId },
      select: {
        id: true,
        teamId: true,
        teamName: true,
        scopes: true,
        isActive: true,
        connectedAt: true,
        disconnectedAt: true,
        lastTokenRefreshAt: true,
        tokenExpiresAt: true,
      },
    });

    if (!workspace) {
      return null;
    }

    return {
      ...workspace,
      tokenStatus: workspace.tokenExpiresAt
        ? workspace.tokenExpiresAt > new Date()
          ? 'valid'
          : 'expired'
        : 'no_expiry',
    };
  },

  /**
   * Disconnect a workspace (soft delete).
   */
  async disconnectWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<{ success: boolean; error?: string }> {
    const workspace = await prisma.slackWorkspace.findFirst({
      where: { id: workspaceId, userId },
    });

    if (!workspace) {
      return { success: false, error: 'Workspace not found' };
    }

    if (!workspace.isActive) {
      return { success: false, error: 'Workspace is already disconnected' };
    }

    // Attempt to revoke the token with Slack
    try {
      const botToken = decryptToken(workspace.botToken);
      const client = new WebClient(botToken);
      await client.auth.revoke();
    } catch {
      // Token revocation is best-effort; continue with local disconnect
    }

    await prisma.slackWorkspace.update({
      where: { id: workspaceId },
      data: {
        isActive: false,
        disconnectedAt: new Date(),
      },
    });

    return { success: true };
  },
};
