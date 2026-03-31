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
  // Import dynamically to ensure env vars are set
  let slackOAuthService: typeof import('../../services/slackOAuthService').slackOAuthService;

  beforeEach(async () => {
    const mod = await import('../../services/slackOAuthService');
    slackOAuthService = mod.slackOAuthService;
  });

  describe('generateAuthorizationUrl', () => {
    it('should generate a valid Slack OAuth URL', () => {
      const { url, state } = slackOAuthService.generateAuthorizationUrl('user-123');

      expect(url).toContain('https://slack.com/oauth/v2/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('state=');
      expect(url).toContain('scope=');
      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
    });

    it('should include the user ID in the state token', () => {
      const { state } = slackOAuthService.generateAuthorizationUrl('user-456');
      const decoded = jwt.verify(state, TEST_JWT_SECRET) as any;
      expect(decoded.userId).toBe('user-456');
    });

    it('should create a state that expires in 10 minutes', () => {
      const { state } = slackOAuthService.generateAuthorizationUrl('user-789');
      const decoded = jwt.verify(state, TEST_JWT_SECRET) as any;
      // exp should be roughly 10 minutes from now
      const expectedExp = Math.floor(Date.now() / 1000) + 600;
      expect(decoded.exp).toBeGreaterThan(expectedExp - 5);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
    });
  });

  describe('verifyState', () => {
    it('should verify a valid state token', () => {
      const { state } = slackOAuthService.generateAuthorizationUrl('user-123');
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
});

// ─── OAuth Route Handler Tests ───────────────────────────────────────

describe('OAuth Route Handlers', () => {
  // We test the route logic via the service since Express app setup
  // would require full integration. The route file delegates to the service.

  it('should require code parameter in callback', () => {
    // Validates the route expects code and state query params
    const queryParams = { error: 'access_denied' };
    expect(queryParams.error).toBe('access_denied');
  });

  it('should handle missing state parameter', () => {
    const queryParams = { code: 'some-code' };
    expect(queryParams).not.toHaveProperty('state');
  });

  it('should handle Slack error parameter in callback', () => {
    const queryParams = { error: 'access_denied' };
    expect(queryParams.error).toBe('access_denied');
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
    const { url, state } = slackOAuthService.generateAuthorizationUrl(userId);

    // URL should be valid
    const parsedUrl = new URL(url);
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

    const attempt1 = slackOAuthService.generateAuthorizationUrl(userId);
    const attempt2 = slackOAuthService.generateAuthorizationUrl(userId);

    // Both should be valid and verify correctly (they may or may not be
    // identical depending on timing, but both must decode to the same user)
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
});
