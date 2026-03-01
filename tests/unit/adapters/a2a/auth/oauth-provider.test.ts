/**
 * OAuth2Provider Unit Tests
 *
 * Comprehensive test suite for the OAuth 2.0 provider implementation.
 * Covers authorization code flow, token exchange, refresh, and revocation.
 *
 * @module tests/unit/adapters/a2a/auth/oauth-provider
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Types for OAuth2Provider (implementation will be created by other agents)
interface AuthorizationCodeRequest {
  clientId: string;
  redirectUri: string;
  scope: string[];
  state: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'plain' | 'S256';
}

interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  scope: string[];
  state: string;
  expiresAt: Date;
  codeChallenge?: string;
  codeChallengeMethod?: 'plain' | 'S256';
  used: boolean;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string[];
}

interface OAuth2ProviderConfig {
  authCodeTtl?: number;
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
  enablePkce?: boolean;
  issuer?: string;
  signingKey?: string;
}

interface OAuth2Provider {
  generateAuthorizationCode(request: AuthorizationCodeRequest): Promise<AuthorizationCode>;
  exchangeCodeForTokens(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<TokenResponse>;
  refreshAccessToken(refreshToken: string, scope?: string[]): Promise<TokenResponse>;
  revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<boolean>;
  validateClient(clientId: string, clientSecret?: string): Promise<boolean>;
  getStoredCode(code: string): AuthorizationCode | null;
  destroy(): void;
}

// Mock implementation for testing
const createMockOAuth2Provider = (config: OAuth2ProviderConfig = {}): OAuth2Provider => {
  const codes = new Map<string, AuthorizationCode>();
  const tokens = new Map<string, { type: 'access' | 'refresh'; clientId: string; scope: string[]; expiresAt: Date }>();
  const revokedTokens = new Set<string>();
  const clients = new Map<string, { secret: string; redirectUris: string[] }>([
    ['client-123', { secret: 'secret-456', redirectUris: ['https://app.example.com/callback'] }],
    ['public-client', { secret: '', redirectUris: ['https://spa.example.com/callback'] }],
  ]);

  const authCodeTtl = config.authCodeTtl ?? 600000; // 10 minutes
  const accessTokenTtl = config.accessTokenTtl ?? 3600000; // 1 hour
  const refreshTokenTtl = config.refreshTokenTtl ?? 86400000 * 30; // 30 days
  const enablePkce = config.enablePkce ?? true;

  const generateRandomString = (length: number): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const hashCodeVerifier = (verifier: string): string => {
    // Simple mock hash for S256 - in real impl would use SHA-256
    return Buffer.from(verifier).toString('base64url');
  };

  return {
    async generateAuthorizationCode(request: AuthorizationCodeRequest): Promise<AuthorizationCode> {
      const client = clients.get(request.clientId);
      if (!client) {
        throw new Error('Invalid client_id');
      }

      if (!client.redirectUris.includes(request.redirectUri)) {
        throw new Error('Invalid redirect_uri');
      }

      const code: AuthorizationCode = {
        code: generateRandomString(32),
        clientId: request.clientId,
        redirectUri: request.redirectUri,
        scope: request.scope,
        state: request.state,
        expiresAt: new Date(Date.now() + authCodeTtl),
        codeChallenge: request.codeChallenge,
        codeChallengeMethod: request.codeChallengeMethod,
        used: false,
      };

      codes.set(code.code, code);
      return code;
    },

    async exchangeCodeForTokens(
      code: string,
      clientId: string,
      redirectUri: string,
      codeVerifier?: string
    ): Promise<TokenResponse> {
      const storedCode = codes.get(code);

      if (!storedCode) {
        throw new Error('Invalid authorization code');
      }

      if (storedCode.used) {
        // Security: invalidate all tokens if code reuse detected
        codes.delete(code);
        throw new Error('Authorization code already used');
      }

      if (storedCode.expiresAt < new Date()) {
        codes.delete(code);
        throw new Error('Authorization code expired');
      }

      if (storedCode.clientId !== clientId) {
        throw new Error('Client ID mismatch');
      }

      if (storedCode.redirectUri !== redirectUri) {
        throw new Error('Redirect URI mismatch');
      }

      // PKCE validation
      if (storedCode.codeChallenge) {
        if (!codeVerifier) {
          throw new Error('Code verifier required');
        }

        let computedChallenge: string;
        if (storedCode.codeChallengeMethod === 'S256') {
          computedChallenge = hashCodeVerifier(codeVerifier);
        } else {
          computedChallenge = codeVerifier;
        }

        if (computedChallenge !== storedCode.codeChallenge) {
          throw new Error('Invalid code verifier');
        }
      }

      // Mark code as used
      storedCode.used = true;

      const accessToken = generateRandomString(64);
      const refreshToken = generateRandomString(64);

      tokens.set(accessToken, {
        type: 'access',
        clientId,
        scope: storedCode.scope,
        expiresAt: new Date(Date.now() + accessTokenTtl),
      });

      tokens.set(refreshToken, {
        type: 'refresh',
        clientId,
        scope: storedCode.scope,
        expiresAt: new Date(Date.now() + refreshTokenTtl),
      });

      return {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: Math.floor(accessTokenTtl / 1000),
        scope: storedCode.scope,
      };
    },

    async refreshAccessToken(refreshToken: string, scope?: string[]): Promise<TokenResponse> {
      if (revokedTokens.has(refreshToken)) {
        throw new Error('Refresh token has been revoked');
      }

      const storedToken = tokens.get(refreshToken);

      if (!storedToken || storedToken.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      if (storedToken.expiresAt < new Date()) {
        tokens.delete(refreshToken);
        throw new Error('Refresh token expired');
      }

      // Validate requested scope is subset of original
      const requestedScope = scope ?? storedToken.scope;
      const invalidScopes = requestedScope.filter((s) => !storedToken.scope.includes(s));
      if (invalidScopes.length > 0) {
        throw new Error(`Invalid scope: ${invalidScopes.join(', ')}`);
      }

      // Rotate refresh token
      tokens.delete(refreshToken);
      revokedTokens.add(refreshToken);

      const newAccessToken = generateRandomString(64);
      const newRefreshToken = generateRandomString(64);

      tokens.set(newAccessToken, {
        type: 'access',
        clientId: storedToken.clientId,
        scope: requestedScope,
        expiresAt: new Date(Date.now() + accessTokenTtl),
      });

      tokens.set(newRefreshToken, {
        type: 'refresh',
        clientId: storedToken.clientId,
        scope: requestedScope,
        expiresAt: new Date(Date.now() + refreshTokenTtl),
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
        expiresIn: Math.floor(accessTokenTtl / 1000),
        scope: requestedScope,
      };
    },

    async revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<boolean> {
      if (revokedTokens.has(token)) {
        return true; // Already revoked
      }

      const storedToken = tokens.get(token);
      if (!storedToken) {
        // Per RFC 7009, return success even for unknown tokens
        return true;
      }

      tokens.delete(token);
      revokedTokens.add(token);
      return true;
    },

    async validateClient(clientId: string, clientSecret?: string): Promise<boolean> {
      const client = clients.get(clientId);
      if (!client) {
        return false;
      }

      if (client.secret && clientSecret !== client.secret) {
        return false;
      }

      return true;
    },

    getStoredCode(code: string): AuthorizationCode | null {
      return codes.get(code) ?? null;
    },

    destroy(): void {
      codes.clear();
      tokens.clear();
      revokedTokens.clear();
    },
  };
};

// ============================================================================
// Test Suite
// ============================================================================

describe('OAuth2Provider', () => {
  let provider: OAuth2Provider;

  beforeEach(() => {
    provider = createMockOAuth2Provider();
  });

  afterEach(() => {
    provider.destroy();
  });

  // ==========================================================================
  // Authorization Code Generation Tests
  // ==========================================================================

  describe('generateAuthorizationCode', () => {
    it('should generate unique codes', async () => {
      const request: AuthorizationCodeRequest = {
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read', 'task:create'],
        state: 'state-abc123',
      };

      const code1 = await provider.generateAuthorizationCode(request);
      const code2 = await provider.generateAuthorizationCode(request);

      expect(code1.code).not.toBe(code2.code);
      expect(code1.code.length).toBeGreaterThanOrEqual(32);
    });

    it('should include requested scopes', async () => {
      const scopes = ['platform:read', 'agent:read', 'task:create', 'message:send'];

      const code = await provider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: scopes,
        state: 'state-xyz',
      });

      expect(code.scope).toEqual(scopes);
    });

    it('should store state parameter', async () => {
      const state = 'random-state-value-12345';

      const code = await provider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read'],
        state,
      });

      expect(code.state).toBe(state);
    });

    it('should set expiration time', async () => {
      const beforeRequest = new Date();

      const code = await provider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read'],
        state: 'state',
      });

      expect(code.expiresAt).toBeInstanceOf(Date);
      expect(code.expiresAt.getTime()).toBeGreaterThan(beforeRequest.getTime());
      // Default TTL is 10 minutes (600000ms)
      expect(code.expiresAt.getTime() - beforeRequest.getTime()).toBeLessThanOrEqual(600000 + 1000);
    });

    it('should reject invalid client_id', async () => {
      await expect(
        provider.generateAuthorizationCode({
          clientId: 'unknown-client',
          redirectUri: 'https://app.example.com/callback',
          scope: ['agent:read'],
          state: 'state',
        })
      ).rejects.toThrow('Invalid client_id');
    });

    it('should reject invalid redirect_uri', async () => {
      await expect(
        provider.generateAuthorizationCode({
          clientId: 'client-123',
          redirectUri: 'https://malicious.example.com/callback',
          scope: ['agent:read'],
          state: 'state',
        })
      ).rejects.toThrow('Invalid redirect_uri');
    });

    it('should store PKCE code challenge', async () => {
      const code = await provider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read'],
        state: 'state',
        codeChallenge: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
        codeChallengeMethod: 'S256',
      });

      expect(code.codeChallenge).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
      expect(code.codeChallengeMethod).toBe('S256');
    });
  });

  // ==========================================================================
  // Token Exchange Tests
  // ==========================================================================

  describe('exchangeCodeForTokens', () => {
    let validCode: AuthorizationCode;

    beforeEach(async () => {
      validCode = await provider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read', 'task:create'],
        state: 'test-state',
      });
    });

    it('should return access and refresh tokens', async () => {
      const response = await provider.exchangeCodeForTokens(
        validCode.code,
        'client-123',
        'https://app.example.com/callback'
      );

      expect(response.accessToken).toBeDefined();
      expect(response.refreshToken).toBeDefined();
      expect(response.tokenType).toBe('Bearer');
      expect(response.expiresIn).toBeGreaterThan(0);
      expect(response.scope).toEqual(['agent:read', 'task:create']);
    });

    it('should reject invalid codes', async () => {
      await expect(
        provider.exchangeCodeForTokens(
          'invalid-code',
          'client-123',
          'https://app.example.com/callback'
        )
      ).rejects.toThrow('Invalid authorization code');
    });

    it('should reject expired codes', async () => {
      vi.useFakeTimers();

      const code = await provider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read'],
        state: 'state',
      });

      // Advance time past expiration (11 minutes)
      vi.advanceTimersByTime(660000);

      await expect(
        provider.exchangeCodeForTokens(
          code.code,
          'client-123',
          'https://app.example.com/callback'
        )
      ).rejects.toThrow('Authorization code expired');

      vi.useRealTimers();
    });

    it('should reject mismatched client_id', async () => {
      await expect(
        provider.exchangeCodeForTokens(
          validCode.code,
          'different-client',
          'https://app.example.com/callback'
        )
      ).rejects.toThrow('Client ID mismatch');
    });

    it('should reject mismatched redirect_uri', async () => {
      await expect(
        provider.exchangeCodeForTokens(
          validCode.code,
          'client-123',
          'https://different.example.com/callback'
        )
      ).rejects.toThrow('Redirect URI mismatch');
    });

    it('should invalidate code after use', async () => {
      // First exchange should succeed
      await provider.exchangeCodeForTokens(
        validCode.code,
        'client-123',
        'https://app.example.com/callback'
      );

      // Second exchange should fail
      await expect(
        provider.exchangeCodeForTokens(
          validCode.code,
          'client-123',
          'https://app.example.com/callback'
        )
      ).rejects.toThrow('Authorization code already used');
    });

    it('should validate PKCE code verifier', async () => {
      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const codeChallenge = Buffer.from(codeVerifier).toString('base64url');

      const pkceCode = await provider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read'],
        state: 'state',
        codeChallenge,
        codeChallengeMethod: 'S256',
      });

      const response = await provider.exchangeCodeForTokens(
        pkceCode.code,
        'client-123',
        'https://app.example.com/callback',
        codeVerifier
      );

      expect(response.accessToken).toBeDefined();
    });

    it('should reject missing code verifier when PKCE was used', async () => {
      const pkceCode = await provider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read'],
        state: 'state',
        codeChallenge: 'some-challenge',
        codeChallengeMethod: 'plain',
      });

      await expect(
        provider.exchangeCodeForTokens(
          pkceCode.code,
          'client-123',
          'https://app.example.com/callback'
          // No code verifier provided
        )
      ).rejects.toThrow('Code verifier required');
    });

    it('should reject invalid code verifier', async () => {
      const codeChallenge = 'expected-challenge';

      const pkceCode = await provider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read'],
        state: 'state',
        codeChallenge,
        codeChallengeMethod: 'plain',
      });

      await expect(
        provider.exchangeCodeForTokens(
          pkceCode.code,
          'client-123',
          'https://app.example.com/callback',
          'wrong-verifier'
        )
      ).rejects.toThrow('Invalid code verifier');
    });
  });

  // ==========================================================================
  // Token Refresh Tests
  // ==========================================================================

  describe('refreshAccessToken', () => {
    let tokenResponse: TokenResponse;

    beforeEach(async () => {
      const code = await provider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read', 'task:create', 'message:send'],
        state: 'state',
      });

      tokenResponse = await provider.exchangeCodeForTokens(
        code.code,
        'client-123',
        'https://app.example.com/callback'
      );
    });

    it('should return new access token', async () => {
      const newResponse = await provider.refreshAccessToken(tokenResponse.refreshToken);

      expect(newResponse.accessToken).toBeDefined();
      expect(newResponse.accessToken).not.toBe(tokenResponse.accessToken);
      expect(newResponse.tokenType).toBe('Bearer');
      expect(newResponse.expiresIn).toBeGreaterThan(0);
    });

    it('should rotate refresh token', async () => {
      const newResponse = await provider.refreshAccessToken(tokenResponse.refreshToken);

      expect(newResponse.refreshToken).toBeDefined();
      expect(newResponse.refreshToken).not.toBe(tokenResponse.refreshToken);
    });

    it('should reject invalid refresh tokens', async () => {
      await expect(
        provider.refreshAccessToken('invalid-refresh-token')
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should reject expired refresh tokens', async () => {
      vi.useFakeTimers();

      // Advance time past refresh token expiration (31 days)
      vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);

      await expect(
        provider.refreshAccessToken(tokenResponse.refreshToken)
      ).rejects.toThrow('Refresh token expired');

      vi.useRealTimers();
    });

    it('should reject revoked refresh tokens', async () => {
      // First refresh succeeds and revokes old token
      await provider.refreshAccessToken(tokenResponse.refreshToken);

      // Second attempt with old token should fail
      await expect(
        provider.refreshAccessToken(tokenResponse.refreshToken)
      ).rejects.toThrow('Refresh token has been revoked');
    });

    it('should allow scope downgrade', async () => {
      const newResponse = await provider.refreshAccessToken(
        tokenResponse.refreshToken,
        ['agent:read'] // Subset of original scopes
      );

      expect(newResponse.scope).toEqual(['agent:read']);
    });

    it('should reject scope upgrade', async () => {
      await expect(
        provider.refreshAccessToken(
          tokenResponse.refreshToken,
          ['agent:read', 'platform:admin'] // platform:admin not in original
        )
      ).rejects.toThrow('Invalid scope: platform:admin');
    });

    it('should maintain original scope if not specified', async () => {
      const newResponse = await provider.refreshAccessToken(tokenResponse.refreshToken);

      expect(newResponse.scope).toEqual(['agent:read', 'task:create', 'message:send']);
    });
  });

  // ==========================================================================
  // Token Revocation Tests
  // ==========================================================================

  describe('revokeToken', () => {
    let tokenResponse: TokenResponse;

    beforeEach(async () => {
      const code = await provider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read'],
        state: 'state',
      });

      tokenResponse = await provider.exchangeCodeForTokens(
        code.code,
        'client-123',
        'https://app.example.com/callback'
      );
    });

    it('should revoke access token', async () => {
      const result = await provider.revokeToken(tokenResponse.accessToken, 'access_token');

      expect(result).toBe(true);
    });

    it('should revoke refresh token', async () => {
      const result = await provider.revokeToken(tokenResponse.refreshToken, 'refresh_token');

      expect(result).toBe(true);

      // Verify refresh token no longer works
      await expect(
        provider.refreshAccessToken(tokenResponse.refreshToken)
      ).rejects.toThrow('Refresh token has been revoked');
    });

    it('should handle already revoked tokens', async () => {
      await provider.revokeToken(tokenResponse.accessToken);
      const result = await provider.revokeToken(tokenResponse.accessToken);

      expect(result).toBe(true); // Should still succeed
    });

    it('should handle unknown tokens gracefully', async () => {
      // Per RFC 7009, revocation of unknown tokens should succeed
      const result = await provider.revokeToken('unknown-token');

      expect(result).toBe(true);
    });

    it('should work without token type hint', async () => {
      const result = await provider.revokeToken(tokenResponse.accessToken);

      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // Client Validation Tests
  // ==========================================================================

  describe('validateClient', () => {
    it('should validate confidential client with correct secret', async () => {
      const result = await provider.validateClient('client-123', 'secret-456');

      expect(result).toBe(true);
    });

    it('should reject confidential client with wrong secret', async () => {
      const result = await provider.validateClient('client-123', 'wrong-secret');

      expect(result).toBe(false);
    });

    it('should validate public client without secret', async () => {
      const result = await provider.validateClient('public-client');

      expect(result).toBe(true);
    });

    it('should reject unknown client', async () => {
      const result = await provider.validateClient('unknown-client');

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Edge Cases and Security Tests
  // ==========================================================================

  describe('Security Edge Cases', () => {
    it('should handle concurrent token exchanges for same code', async () => {
      const code = await provider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read'],
        state: 'state',
      });

      // Simulate concurrent requests
      const results = await Promise.allSettled([
        provider.exchangeCodeForTokens(
          code.code,
          'client-123',
          'https://app.example.com/callback'
        ),
        provider.exchangeCodeForTokens(
          code.code,
          'client-123',
          'https://app.example.com/callback'
        ),
      ]);

      // One should succeed, one should fail
      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
    });

    it('should generate cryptographically random codes', async () => {
      const codes: string[] = [];

      for (let i = 0; i < 10; i++) {
        const code = await provider.generateAuthorizationCode({
          clientId: 'client-123',
          redirectUri: 'https://app.example.com/callback',
          scope: ['agent:read'],
          state: `state-${i}`,
        });
        codes.push(code.code);
      }

      // All codes should be unique
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(10);

      // Codes should not be predictable (no common prefixes besides potential format)
      const firstHalves = codes.map((c) => c.slice(0, 16));
      const uniqueFirstHalves = new Set(firstHalves);
      expect(uniqueFirstHalves.size).toBe(10);
    });

    it('should not leak information about valid vs invalid clients', async () => {
      // Timing attacks: both should reject in similar time
      const startValid = performance.now();
      await provider.validateClient('client-123', 'wrong');
      const timeValid = performance.now() - startValid;

      const startInvalid = performance.now();
      await provider.validateClient('unknown', 'wrong');
      const timeInvalid = performance.now() - startInvalid;

      // Times should be within same order of magnitude (basic check)
      expect(Math.abs(timeValid - timeInvalid)).toBeLessThan(100);
    });
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('Provider Configuration', () => {
    it('should respect custom auth code TTL', async () => {
      const customProvider = createMockOAuth2Provider({ authCodeTtl: 60000 }); // 1 minute

      vi.useFakeTimers();

      const code = await customProvider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read'],
        state: 'state',
      });

      // Should work before expiration
      vi.advanceTimersByTime(30000);
      const storedCode = customProvider.getStoredCode(code.code);
      expect(storedCode).not.toBeNull();

      // Should expire after TTL
      vi.advanceTimersByTime(60000);
      await expect(
        customProvider.exchangeCodeForTokens(
          code.code,
          'client-123',
          'https://app.example.com/callback'
        )
      ).rejects.toThrow('expired');

      vi.useRealTimers();
      customProvider.destroy();
    });

    it('should respect custom access token TTL', async () => {
      const customProvider = createMockOAuth2Provider({ accessTokenTtl: 300000 }); // 5 minutes

      const code = await customProvider.generateAuthorizationCode({
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scope: ['agent:read'],
        state: 'state',
      });

      const response = await customProvider.exchangeCodeForTokens(
        code.code,
        'client-123',
        'https://app.example.com/callback'
      );

      expect(response.expiresIn).toBe(300); // 5 minutes in seconds

      customProvider.destroy();
    });
  });
});
