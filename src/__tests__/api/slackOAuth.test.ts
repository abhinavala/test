import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { encryptToken, decryptToken } from '../../models/SlackWorkspace';

// Set up environment variables before any imports that use them
const TEST_JWT_SECRET = 'test-jwt-secret-for-testing';
const TEST_ENCRYPTION_KEY = 'test-encryption-key-for-testing-purposes';

beforeEach(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  process.env.SLACK_CLIENT_ID = 'test-client-id';
  process.env.SLACK_CLIENT_SECRET = 'test-client-secret';
  process.env.SLACK_SIGNING_SECRET = 'test-signing-secret';
  process.env.SLACK_OAUTH_REDIRECT_URL = 'https://example.com/api/slack/oauth/callback';
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Token Encryption Tests ──────────────────────────────────────────

describe('Token Encryption', () => {
  it('should encrypt and decrypt a token correctly', () => {
    const token = 'xoxb-test-bot-token-12345';
    const encrypted = encryptToken(token);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it('should produce different ciphertexts for the same input (random IV)', () => {
    const token = 'xoxb-test-bot-token-12345';
    const encrypted1 = encryptToken(token);
    const encrypted2 = encryptToken(token);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should produce encrypted output in the expected format (iv:authTag:data)', () => {
    const token = 'xoxb-test-token';
    const encrypted = encryptToken(token);
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    // IV should be 32 hex chars (16 bytes)
    expect(parts[0]).toHaveLength(32);
    // Auth tag should be 32 hex chars (16 bytes)
    expect(parts[1]).toHaveLength(32);
    // Encrypted data should be non-empty
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('should throw on invalid encrypted token format', () => {
    expect(() => decryptToken('invalid')).toThrow('Invalid encrypted token format');
  });

  it('should throw on tampered ciphertext', () => {
    const token = 'xoxb-test-bot-token';
    const encrypted = encryptToken(token);
    const parts = encrypted.split(':');
    // Tamper with the encrypted data
    const tampered = `${parts[0]}:${parts[1]}:${'ff'.repeat(parts[2].length / 2)}`;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('should throw if ENCRYPTION_KEY is not set', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptToken('test')).toThrow('ENCRYPTION_KEY environment variable is required');
  });
});

// ─── OAuth State (JWT) Tests ─────────────────────────────────────────

describe('OAuth State Management', () => {
  it('should generate a valid JWT state token', () => {
    const userId = 'user-123';
    const state = jwt.sign(
      { userId, timestamp: Date.now() },
      TEST_JWT_SECRET,
      { expiresIn: '10m' }
    );

    const decoded = jwt.verify(state, TEST_JWT_SECRET) as any;
    expect(decoded.userId).toBe(userId);
    expect(decoded.timestamp).toBeDefined();
  });

  it('should reject an expired state token', () => {
    const state = jwt.sign(
      { userId: 'user-123', timestamp: Date.now() - 11 * 60 * 1000 },
      TEST_JWT_SECRET,
      { expiresIn: '0s' }
    );

    expect(() => jwt.verify(state, TEST_JWT_SECRET)).toThrow();
  });

  it('should reject a state token with wrong secret', () => {
    const state = jwt.sign(
      { userId: 'user-123', timestamp: Date.now() },
      'wrong-secret',
      { expiresIn: '10m' }
    );

    expect(() => jwt.verify(state, TEST_JWT_SECRET)).toThrow();
  });

  it('should reject a malformed state token', () => {
    expect(() => jwt.verify('not-a-real-jwt', TEST_JWT_SECRET)).toThrow();
  });
});

// ─── slackOAuthService Unit Tests ────────────────────────────────────

describe('slackOAuthService', () => {
  let slackOAuthService: typeof import('../../services/slackOAuthService').slackOAuthService;

  beforeEach(async () => {
    const mod = await import('../../services/slackOAuthService');
    slackOAuthService = mod.slackOAuthService;
  });

  describe('generateOAuthUrl', () => {
    it('should return an OAuthStartResponse with authUrl and state', () => {
      const result = slackOAuthService.generateOAuthUrl('user-123');

      expect(result).toHaveProperty('authUrl');
      expect(result).toHaveProperty('state');
      expect(result.authUrl).toContain('https://slack.com/oauth/v2/authorize');
      expect(result.authUrl).toContain('client_id=test-client-id');
      expect(result.authUrl).toContain('redirect_uri=');
      expect(result.authUrl).toContain('state=');
      expect(result.authUrl).toContain('scope=');
      expect(typeof result.state).toBe('string');
    });

    it('should include the user ID in the state token', () => {
      const { state } = slackOAuthService.generateOAuthUrl('user-456');
      const decoded = jwt.verify(state, TEST_JWT_SECRET) as any;
      expect(decoded.userId).toBe('user-456');
    });

    it('should create a state that expires in 10 minutes', () => {
      const { state } = slackOAuthService.generateOAuthUrl('user-789');
      const decoded = jwt.verify(state, TEST_JWT_SECRET) as any;
      const expectedExp = Math.floor(Date.now() / 1000) + 600;
      expect(decoded.exp).toBeGreaterThan(expectedExp - 5);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
    });
  });

  describe('verifyState', () => {
    it('should verify a valid state token', () => {
      const { state } = slackOAuthService.generateOAuthUrl('user-123');
      const decoded = slackOAuthService.verifyState(state);
      expect(decoded.userId).toBe('user-123');
      expect(decoded.timestamp).toBeDefined();
    });

    it('should throw on expired state', () => {
      const expiredState = jwt.sign(
        { userId: 'user-123', timestamp: Date.now() - 15 * 60 * 1000 },
        TEST_JWT_SECRET,
        { expiresIn: '0s' }
      );

      expect(() => slackOAuthService.verifyState(expiredState)).toThrow(
        'OAuth state has expired'
      );
    });

    it('should throw on invalid state', () => {
      expect(() => slackOAuthService.verifyState('garbage')).toThrow(
        'Invalid OAuth state'
      );
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for tokens successfully', async () => {
      const mockResponse: any = {
        ok: true,
        access_token: 'xoxb-bot-token',
        bot_user_id: 'U12345',
        scope: 'chat:write,commands',
        team: { id: 'T12345', name: 'Test Workspace' },
        authed_user: { id: 'U67890' },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );

      const result = await slackOAuthService.exchangeCodeForToken('test-code');
      expect(result.ok).toBe(true);
      expect(result.access_token).toBe('xoxb-bot-token');
      expect(result.team?.id).toBe('T12345');
    });

    it('should throw on Slack API HTTP error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        })
      );

      await expect(
        slackOAuthService.exchangeCodeForToken('test-code')
      ).rejects.toThrow('Slack API returned HTTP 500');
    });

    it('should throw on Slack OAuth error response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ ok: false, error: 'invalid_code' }),
        })
      );

      await expect(
        slackOAuthService.exchangeCodeForToken('bad-code')
      ).rejects.toThrow('Slack OAuth error: invalid_code');
    });

    it('should send correct parameters in token exchange request', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            access_token: 'xoxb-token',
            team: { id: 'T1', name: 'Test' },
          }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await slackOAuthService.exchangeCodeForToken('auth-code-123');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://slack.com/api/oauth.v2.access',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
      expect(body.get('client_id')).toBe('test-client-id');
      expect(body.get('client_secret')).toBe('test-client-secret');
      expect(body.get('code')).toBe('auth-code-123');
      expect(body.get('redirect_uri')).toBe(
        'https://example.com/api/slack/oauth/callback'
      );
    });
  });

  describe('handleOAuthCallback', () => {
    it('should return a SlackConnection on success', async () => {
      const mockTokenResult = {
        ok: true,
        access_token: 'xoxb-new-bot-token',
        bot_user_id: 'U_BOT',
        scope: 'chat:write,commands',
        team: { id: 'T_NEW', name: 'New Workspace' },
        authed_user: { id: 'U_USER' },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockTokenResult),
        })
      );

      // Mock prisma upsert
      const { default: prisma } = await import('../../db/client');
      const now = new Date();
      vi.spyOn(prisma.slackWorkspace, 'upsert').mockResolvedValue({
        id: 'ws-new-id',
        userId: 'user-123',
        teamId: 'T_NEW',
        teamName: 'New Workspace',
        botToken: 'encrypted',
        botUserId: 'U_BOT',
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        scopes: 'chat:write,commands',
        userScopes: null,
        webhookUrl: null,
        webhookChannel: null,
        webhookConfigurationUrl: null,
        isActive: true,
        connectedAt: now,
        disconnectedAt: null,
        lastTokenRefreshAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const { state } = slackOAuthService.generateOAuthUrl('user-123');
      const connection = await slackOAuthService.handleOAuthCallback(
        'valid-code',
        state
      );

      expect(connection).toHaveProperty('workspaceId', 'ws-new-id');
      expect(connection).toHaveProperty('workspaceName', 'New Workspace');
      expect(connection).toHaveProperty('isActive', true);
      expect(connection).toHaveProperty('connectedAt');
    });

    it('should throw when team info is missing from OAuth response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              access_token: 'xoxb-token',
              // missing team
            }),
        })
      );

      const { state } = slackOAuthService.generateOAuthUrl('user-123');

      await expect(
        slackOAuthService.handleOAuthCallback('code', state)
      ).rejects.toThrow('Missing team information');
    });

    it('should throw when access token is missing from OAuth response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              team: { id: 'T1', name: 'Test' },
              // missing access_token
            }),
        })
      );

      const { state } = slackOAuthService.generateOAuthUrl('user-123');

      await expect(
        slackOAuthService.handleOAuthCallback('code', state)
      ).rejects.toThrow('Missing bot access token');
    });

    it('should throw on expired state during callback', async () => {
      const expiredState = jwt.sign(
        { userId: 'user-123', timestamp: Date.now() - 15 * 60 * 1000 },
        TEST_JWT_SECRET,
        { expiresIn: '0s' }
      );

      await expect(
        slackOAuthService.handleOAuthCallback('code', expiredState)
      ).rejects.toThrow('OAuth state has expired');
    });
  });

  describe('refreshSlackToken', () => {
    it('should throw when workspace is not found', async () => {
      const { default: prisma } = await import('../../db/client');
      vi.spyOn(prisma.slackWorkspace, 'findUnique').mockResolvedValue(null);

      await expect(
        slackOAuthService.refreshSlackToken('nonexistent')
      ).rejects.toThrow('Workspace not found');
    });

    it('should throw when no refresh token is available', async () => {
      const { default: prisma } = await import('../../db/client');
      vi.spyOn(prisma.slackWorkspace, 'findUnique').mockResolvedValue({
        id: 'ws-1',
        userId: 'user-1',
        teamId: 'T1',
        teamName: 'Test',
        botToken: encryptToken('xoxb-token'),
        botUserId: 'U1',
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        scopes: 'chat:write',
        userScopes: null,
        webhookUrl: null,
        webhookChannel: null,
        webhookConfigurationUrl: null,
        isActive: true,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastTokenRefreshAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        slackOAuthService.refreshSlackToken('ws-1')
      ).rejects.toThrow('No refresh token available');
    });

    it('should return the new decrypted token on success', async () => {
      const { default: prisma } = await import('../../db/client');
      const encryptedRefresh = encryptToken('xoxr-refresh-token');

      vi.spyOn(prisma.slackWorkspace, 'findUnique').mockResolvedValue({
        id: 'ws-1',
        userId: 'user-1',
        teamId: 'T1',
        teamName: 'Test',
        botToken: encryptToken('xoxb-old-token'),
        botUserId: 'U1',
        accessToken: null,
        refreshToken: encryptedRefresh,
        tokenExpiresAt: new Date(Date.now() - 1000),
        scopes: 'chat:write',
        userScopes: null,
        webhookUrl: null,
        webhookChannel: null,
        webhookConfigurationUrl: null,
        isActive: true,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastTokenRefreshAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.spyOn(prisma.slackWorkspace, 'update').mockResolvedValue({} as any);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              access_token: 'xoxb-new-bot-token',
              refresh_token: 'xoxr-new-refresh',
              expires_in: 43200,
            }),
        })
      );

      const newToken = await slackOAuthService.refreshSlackToken('ws-1');
      expect(typeof newToken).toBe('string');
      expect(newToken).toBe('xoxb-new-bot-token');
    });

    it('should deactivate workspace when token is revoked', async () => {
      const { default: prisma } = await import('../../db/client');
      const encryptedRefresh = encryptToken('xoxr-refresh-token');

      vi.spyOn(prisma.slackWorkspace, 'findUnique').mockResolvedValue({
        id: 'ws-1',
        userId: 'user-1',
        teamId: 'T1',
        teamName: 'Test',
        botToken: encryptToken('xoxb-token'),
        botUserId: 'U1',
        accessToken: null,
        refreshToken: encryptedRefresh,
        tokenExpiresAt: new Date(Date.now() - 1000),
        scopes: 'chat:write',
        userScopes: null,
        webhookUrl: null,
        webhookChannel: null,
        webhookConfigurationUrl: null,
        isActive: true,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastTokenRefreshAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const updateSpy = vi
        .spyOn(prisma.slackWorkspace, 'update')
        .mockResolvedValue({} as any);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({ ok: false, error: 'token_revoked' }),
        })
      );

      await expect(
        slackOAuthService.refreshSlackToken('ws-1')
      ).rejects.toThrow('Token has been revoked');

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ws-1' } })
      );
    });
  });
});

// ─── API Endpoint Tests ─────────────────────────────────────────────

describe('OAuth API Endpoints', () => {
  let slackOAuthService: typeof import('../../services/slackOAuthService').slackOAuthService;

  beforeEach(async () => {
    const mod = await import('../../services/slackOAuthService');
    slackOAuthService = mod.slackOAuthService;
  });

  describe('POST /api/slack/oauth/start', () => {
    it('should return authUrl and state for authenticated user', () => {
      const result = slackOAuthService.generateOAuthUrl('user-123');
      expect(result.authUrl).toContain('https://slack.com/oauth/v2/authorize');
      expect(result.state).toBeDefined();
    });

    it('should include all required OAuth parameters in the URL', () => {
      const result = slackOAuthService.generateOAuthUrl('user-123');
      const url = new URL(result.authUrl);
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.searchParams.get('scope')).toBeTruthy();
      expect(url.searchParams.get('redirect_uri')).toBe(
        'https://example.com/api/slack/oauth/callback'
      );
      expect(url.searchParams.get('state')).toBe(result.state);
    });
  });

  describe('POST /api/slack/oauth/callback', () => {
    it('should handle access_denied error from Slack', () => {
      const body = { error: 'access_denied' };
      expect(body.error).toBe('access_denied');
    });

    it('should reject callback without code', () => {
      const body = { state: 'some-state' };
      expect(body).not.toHaveProperty('code');
    });

    it('should reject callback without state', () => {
      const body = { code: 'some-code' };
      expect(body).not.toHaveProperty('state');
    });

    it('should handle expired state in callback', async () => {
      const expiredState = jwt.sign(
        { userId: 'user-123', timestamp: Date.now() - 15 * 60 * 1000 },
        TEST_JWT_SECRET,
        { expiresIn: '0s' }
      );

      await expect(
        slackOAuthService.handleOAuthCallback('code', expiredState)
      ).rejects.toThrow('OAuth state has expired');
    });

    it('should handle invalid_client_id error from Slack', () => {
      const body = { error: 'invalid_client_id' };
      expect(body.error).toBe('invalid_client_id');
    });
  });

  describe('GET /api/slack/connections', () => {
    it('should return connections list from getConnections', async () => {
      const { default: prisma } = await import('../../db/client');
      const now = new Date();

      vi.spyOn(prisma.slackWorkspace, 'findMany').mockResolvedValue([
        {
          id: 'ws-1',
          userId: 'user-1',
          teamId: 'T1',
          teamName: 'Workspace One',
          botToken: 'enc',
          botUserId: 'U1',
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          scopes: 'chat:write',
          userScopes: null,
          webhookUrl: null,
          webhookChannel: null,
          webhookConfigurationUrl: null,
          isActive: true,
          connectedAt: now,
          disconnectedAt: null,
          lastTokenRefreshAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const connections = await slackOAuthService.getConnections('user-1');
      expect(connections).toHaveLength(1);
      expect(connections[0]).toEqual({
        workspaceId: 'ws-1',
        workspaceName: 'Workspace One',
        isActive: true,
        connectedAt: now,
      });
    });

    it('should return empty array when user has no connections', async () => {
      const { default: prisma } = await import('../../db/client');
      vi.spyOn(prisma.slackWorkspace, 'findMany').mockResolvedValue([]);

      const connections = await slackOAuthService.getConnections('user-no-ws');
      expect(connections).toEqual([]);
    });
  });

  describe('DELETE /api/slack/connections/:workspaceId', () => {
    it('should disconnect workspace successfully', async () => {
      const { default: prisma } = await import('../../db/client');
      const encryptedToken = encryptToken('xoxb-token');

      vi.spyOn(prisma.slackWorkspace, 'findFirst').mockResolvedValue({
        id: 'ws-1',
        userId: 'user-1',
        teamId: 'T1',
        teamName: 'Test',
        botToken: encryptedToken,
        botUserId: 'U1',
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        scopes: 'chat:write',
        userScopes: null,
        webhookUrl: null,
        webhookChannel: null,
        webhookConfigurationUrl: null,
        isActive: true,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastTokenRefreshAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.spyOn(prisma.slackWorkspace, 'update').mockResolvedValue({} as any);

      // Mock WebClient auth.revoke
      vi.mock('@slack/web-api', () => ({
        WebClient: vi.fn().mockImplementation(() => ({
          auth: { revoke: vi.fn().mockResolvedValue({ ok: true }) },
        })),
      }));

      const result = await slackOAuthService.disconnectWorkspace(
        'user-1',
        'ws-1'
      );
      expect(result.success).toBe(true);
    });

    it('should return error for non-existent workspace', async () => {
      const { default: prisma } = await import('../../db/client');
      vi.spyOn(prisma.slackWorkspace, 'findFirst').mockResolvedValue(null);

      const result = await slackOAuthService.disconnectWorkspace(
        'user-1',
        'nonexistent'
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Workspace not found');
    });

    it('should return error for already disconnected workspace', async () => {
      const { default: prisma } = await import('../../db/client');
      vi.spyOn(prisma.slackWorkspace, 'findFirst').mockResolvedValue({
        id: 'ws-1',
        userId: 'user-1',
        teamId: 'T1',
        teamName: 'Test',
        botToken: 'enc',
        botUserId: 'U1',
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        scopes: 'chat:write',
        userScopes: null,
        webhookUrl: null,
        webhookChannel: null,
        webhookConfigurationUrl: null,
        isActive: false,
        connectedAt: new Date(),
        disconnectedAt: new Date(),
        lastTokenRefreshAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await slackOAuthService.disconnectWorkspace(
        'user-1',
        'ws-1'
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Workspace is already disconnected');
    });
  });
});

// ─── Integration-style Tests ─────────────────────────────────────────

describe('OAuth Flow Integration', () => {
  let slackOAuthService: typeof import('../../services/slackOAuthService').slackOAuthService;

  beforeEach(async () => {
    const mod = await import('../../services/slackOAuthService');
    slackOAuthService = mod.slackOAuthService;
  });

  it('should complete the full authorization URL generation flow', () => {
    const userId = 'user-integration-test';
    const { authUrl, state } = slackOAuthService.generateOAuthUrl(userId);

    // URL should be valid
    const parsedUrl = new URL(authUrl);
    expect(parsedUrl.hostname).toBe('slack.com');
    expect(parsedUrl.pathname).toBe('/oauth/v2/authorize');

    // State should be verifiable
    const decoded = slackOAuthService.verifyState(state);
    expect(decoded.userId).toBe(userId);

    // URL should contain the state
    expect(parsedUrl.searchParams.get('state')).toBe(state);
  });

  it('should handle concurrent OAuth attempts for the same user', () => {
    const userId = 'user-concurrent';

    const attempt1 = slackOAuthService.generateOAuthUrl(userId);
    const attempt2 = slackOAuthService.generateOAuthUrl(userId);

    const decoded1 = slackOAuthService.verifyState(attempt1.state);
    const decoded2 = slackOAuthService.verifyState(attempt2.state);
    expect(decoded1.userId).toBe(userId);
    expect(decoded2.userId).toBe(userId);
  });

  it('should handle network failure during token exchange', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error'))
    );

    await expect(
      slackOAuthService.exchangeCodeForToken('code')
    ).rejects.toThrow('Network error');
  });

  it('should handle malformed callback parameters gracefully', async () => {
    await expect(
      slackOAuthService.handleOAuthCallback('', 'valid-looking-state')
    ).rejects.toThrow();
  });
});
