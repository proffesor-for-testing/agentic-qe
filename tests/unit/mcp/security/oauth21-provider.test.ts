/**
 * Agentic QE v3 - OAuth 2.1 Provider Tests
 * Tests for OAuth 2.1 + PKCE authentication
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  OAuth21Provider,
  createOAuth21Provider,
  type OAuth21Client,
  type AuthorizationRequest,
  type TokenRequest,
} from '../../../../src/mcp/security/oauth21-provider';

describe('OAuth21Provider', () => {
  let provider: OAuth21Provider;

  const testClient: OAuth21Client = {
    clientId: 'test-client',
    clientSecret: 'test-secret',
    redirectUris: ['https://example.com/callback'],
    allowedScopes: ['read', 'write', 'test:generate'],
    allowedGrantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
    confidential: true,
    requirePKCE: true,
    accessTokenTTL: 3600,
    refreshTokenTTL: 86400,
  };

  const publicClient: OAuth21Client = {
    clientId: 'public-client',
    redirectUris: ['https://example.com/callback'],
    allowedScopes: ['read'],
    allowedGrantTypes: ['authorization_code', 'refresh_token'],
    confidential: false,
    requirePKCE: true,
    accessTokenTTL: 1800,
    refreshTokenTTL: 43200,
  };

  beforeEach(() => {
    provider = createOAuth21Provider({
      requirePKCE: true,
      allowedScopes: ['read', 'write', 'admin', 'test:generate', 'test:execute'],
    });
    provider.registerClient(testClient);
    provider.registerClient(publicClient);
  });

  afterEach(() => {
    provider.dispose();
  });

  describe('client management', () => {
    it('should register a client', () => {
      const newClient: OAuth21Client = {
        clientId: 'new-client',
        redirectUris: ['https://new.example.com/callback'],
        allowedScopes: ['read'],
        allowedGrantTypes: ['authorization_code'],
        confidential: false,
        requirePKCE: true,
        accessTokenTTL: 3600,
        refreshTokenTTL: 86400,
      };

      provider.registerClient(newClient);

      const retrieved = provider.getClient('new-client');
      expect(retrieved).toBeDefined();
      expect(retrieved?.clientId).toBe('new-client');
    });

    it('should reject duplicate client registration', () => {
      expect(() => provider.registerClient(testClient)).toThrow(/already registered/);
    });

    it('should remove a client', () => {
      const removed = provider.removeClient('test-client');
      expect(removed).toBe(true);

      const client = provider.getClient('test-client');
      expect(client).toBeUndefined();
    });

    it('should return false when removing unknown client', () => {
      const removed = provider.removeClient('unknown-client');
      expect(removed).toBe(false);
    });
  });

  describe('PKCE utilities', () => {
    it('should generate code verifier', () => {
      const verifier = provider.generateCodeVerifier();

      expect(verifier).toBeDefined();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
    });

    it('should generate code challenge from verifier', () => {
      const verifier = provider.generateCodeVerifier();
      const challenge = provider.generateCodeChallenge(verifier, 'S256');

      expect(challenge).toBeDefined();
      expect(challenge).not.toBe(verifier);
    });

    it('should generate consistent challenges', () => {
      const verifier = 'test-verifier-12345';
      const challenge1 = provider.generateCodeChallenge(verifier, 'S256');
      const challenge2 = provider.generateCodeChallenge(verifier, 'S256');

      expect(challenge1).toBe(challenge2);
    });
  });

  describe('authorization flow', () => {
    it('should generate authorization code with valid request', () => {
      const codeVerifier = provider.generateCodeVerifier();
      const codeChallenge = provider.generateCodeChallenge(codeVerifier, 'S256');

      const request: AuthorizationRequest = {
        clientId: 'test-client',
        redirectUri: 'https://example.com/callback',
        responseType: 'code',
        scope: 'read write',
        state: 'random-state',
        codeChallenge,
        codeChallengeMethod: 'S256',
      };

      const result = provider.authorize(request, 'user-123');

      expect(result.code).toBeDefined();
      expect(result.state).toBe('random-state');
    });

    it('should reject unknown client', () => {
      const request: AuthorizationRequest = {
        clientId: 'unknown-client',
        redirectUri: 'https://example.com/callback',
        responseType: 'code',
        scope: 'read',
        state: 'state',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
      };

      expect(() => provider.authorize(request, 'user-123')).toThrow(/Unknown client/);
    });

    it('should reject invalid redirect URI', () => {
      const codeVerifier = provider.generateCodeVerifier();
      const codeChallenge = provider.generateCodeChallenge(codeVerifier, 'S256');

      const request: AuthorizationRequest = {
        clientId: 'test-client',
        redirectUri: 'https://evil.com/callback',
        responseType: 'code',
        scope: 'read',
        state: 'state',
        codeChallenge,
        codeChallengeMethod: 'S256',
      };

      expect(() => provider.authorize(request, 'user-123')).toThrow(/Invalid redirect URI/);
    });

    it('should reject missing PKCE for clients requiring it', () => {
      const request: AuthorizationRequest = {
        clientId: 'test-client',
        redirectUri: 'https://example.com/callback',
        responseType: 'code',
        scope: 'read',
        state: 'state',
        codeChallenge: '',
        codeChallengeMethod: 'S256',
      };

      expect(() => provider.authorize(request, 'user-123')).toThrow(/code_challenge required/);
    });

    it('should reject unsupported PKCE method', () => {
      const request: AuthorizationRequest = {
        clientId: 'test-client',
        redirectUri: 'https://example.com/callback',
        responseType: 'code',
        scope: 'read',
        state: 'state',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'plain',
      };

      expect(() => provider.authorize(request, 'user-123')).toThrow(/Only S256/);
    });

    it('should reject invalid scopes', () => {
      const codeVerifier = provider.generateCodeVerifier();
      const codeChallenge = provider.generateCodeChallenge(codeVerifier, 'S256');

      const request: AuthorizationRequest = {
        clientId: 'test-client',
        redirectUri: 'https://example.com/callback',
        responseType: 'code',
        scope: 'read invalid-scope',
        state: 'state',
        codeChallenge,
        codeChallengeMethod: 'S256',
      };

      expect(() => provider.authorize(request, 'user-123')).toThrow(/Invalid scopes/);
    });
  });

  describe('token exchange - authorization_code', () => {
    let authCode: string;
    let codeVerifier: string;

    beforeEach(() => {
      codeVerifier = provider.generateCodeVerifier();
      const codeChallenge = provider.generateCodeChallenge(codeVerifier, 'S256');

      const authResult = provider.authorize(
        {
          clientId: 'test-client',
          redirectUri: 'https://example.com/callback',
          responseType: 'code',
          scope: 'read write',
          state: 'state',
          codeChallenge,
          codeChallengeMethod: 'S256',
        },
        'user-123'
      );

      authCode = authResult.code;
    });

    it('should exchange authorization code for tokens', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'authorization_code',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        code: authCode,
        redirectUri: 'https://example.com/callback',
        codeVerifier,
      };

      const tokens = provider.token(tokenRequest);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe(3600);
      expect(tokens.scope).toBe('read write');
    });

    it('should reject invalid code', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'authorization_code',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        code: 'invalid-code',
        redirectUri: 'https://example.com/callback',
        codeVerifier,
      };

      expect(() => provider.token(tokenRequest)).toThrow(/Invalid authorization code/);
    });

    it('should reject code reuse', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'authorization_code',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        code: authCode,
        redirectUri: 'https://example.com/callback',
        codeVerifier,
      };

      // First use succeeds
      provider.token(tokenRequest);

      // Second use fails
      expect(() => provider.token(tokenRequest)).toThrow(/Invalid authorization code/);
    });

    it('should reject invalid code verifier', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'authorization_code',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        code: authCode,
        redirectUri: 'https://example.com/callback',
        codeVerifier: 'wrong-verifier',
      };

      expect(() => provider.token(tokenRequest)).toThrow(/Invalid code verifier/);
    });

    it('should reject redirect URI mismatch', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'authorization_code',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        code: authCode,
        redirectUri: 'https://different.com/callback',
        codeVerifier,
      };

      expect(() => provider.token(tokenRequest)).toThrow(/Redirect URI mismatch/);
    });

    it('should reject missing client secret for confidential client', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'authorization_code',
        clientId: 'test-client',
        code: authCode,
        redirectUri: 'https://example.com/callback',
        codeVerifier,
      };

      expect(() => provider.token(tokenRequest)).toThrow(/Client secret required/);
    });

    it('should reject wrong client secret', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'authorization_code',
        clientId: 'test-client',
        clientSecret: 'wrong-secret',
        code: authCode,
        redirectUri: 'https://example.com/callback',
        codeVerifier,
      };

      expect(() => provider.token(tokenRequest)).toThrow(/Invalid client credentials/);
    });
  });

  describe('token exchange - refresh_token', () => {
    let refreshToken: string;

    beforeEach(() => {
      const codeVerifier = provider.generateCodeVerifier();
      const codeChallenge = provider.generateCodeChallenge(codeVerifier, 'S256');

      const authResult = provider.authorize(
        {
          clientId: 'test-client',
          redirectUri: 'https://example.com/callback',
          responseType: 'code',
          scope: 'read write',
          state: 'state',
          codeChallenge,
          codeChallengeMethod: 'S256',
        },
        'user-123'
      );

      const tokens = provider.token({
        grantType: 'authorization_code',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        code: authResult.code,
        redirectUri: 'https://example.com/callback',
        codeVerifier,
      });

      refreshToken = tokens.refreshToken!;
    });

    it('should refresh tokens', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'refresh_token',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        refreshToken,
      };

      const tokens = provider.token(tokenRequest);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      // New refresh token (rotation)
      expect(tokens.refreshToken).not.toBe(refreshToken);
    });

    it('should reject invalid refresh token', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'refresh_token',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        refreshToken: 'invalid-token',
      };

      expect(() => provider.token(tokenRequest)).toThrow(/Invalid refresh token/);
    });

    it('should reject reused refresh token (rotation)', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'refresh_token',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        refreshToken,
      };

      // First refresh succeeds
      provider.token(tokenRequest);

      // Second use of same token fails (it was rotated)
      expect(() => provider.token(tokenRequest)).toThrow(/Invalid refresh token/);
    });

    it('should allow scope reduction on refresh', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'refresh_token',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        refreshToken,
        scope: 'read', // Reduced from 'read write'
      };

      const tokens = provider.token(tokenRequest);
      expect(tokens.scope).toBe('read');
    });

    it('should reject scope expansion on refresh', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'refresh_token',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        refreshToken,
        scope: 'read write test:generate', // Trying to add scope
      };

      expect(() => provider.token(tokenRequest)).toThrow(/exceeds original grant/);
    });
  });

  describe('token exchange - client_credentials', () => {
    it('should issue token for confidential client', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scope: 'read write',
      };

      const tokens = provider.token(tokenRequest);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeUndefined(); // No refresh token for client_credentials
      expect(tokens.tokenType).toBe('Bearer');
    });

    it('should reject public client', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'client_credentials',
        clientId: 'public-client',
        scope: 'read',
      };

      expect(() => provider.token(tokenRequest)).toThrow(/not confidential/);
    });

    it('should reject invalid credentials', () => {
      const tokenRequest: TokenRequest = {
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'wrong-secret',
      };

      expect(() => provider.token(tokenRequest)).toThrow(/Invalid client credentials/);
    });
  });

  describe('token introspection', () => {
    let accessToken: string;

    beforeEach(() => {
      const tokens = provider.token({
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scope: 'read',
      });
      accessToken = tokens.accessToken;
    });

    it('should introspect valid token', () => {
      const introspection = provider.introspect(accessToken);

      expect(introspection.active).toBe(true);
      expect(introspection.scope).toBe('read');
      expect(introspection.clientId).toBe('test-client');
      expect(introspection.tokenType).toBe('Bearer');
    });

    it('should return inactive for invalid token', () => {
      const introspection = provider.introspect('invalid-token');

      expect(introspection.active).toBe(false);
      expect(introspection.scope).toBeUndefined();
    });
  });

  describe('token validation', () => {
    let accessToken: string;

    beforeEach(() => {
      const tokens = provider.token({
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scope: 'read',
      });
      accessToken = tokens.accessToken;
    });

    it('should validate valid access token', () => {
      const result = provider.validateAccessToken(accessToken);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.clientId).toBe('test-client');
        expect(result.data.scope).toBe('read');
      }
    });

    it('should reject invalid token', () => {
      const result = provider.validateAccessToken('invalid-token');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe('Token not found');
      }
    });
  });

  describe('token revocation', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(() => {
      const codeVerifier = provider.generateCodeVerifier();
      const codeChallenge = provider.generateCodeChallenge(codeVerifier, 'S256');

      const authResult = provider.authorize(
        {
          clientId: 'test-client',
          redirectUri: 'https://example.com/callback',
          responseType: 'code',
          scope: 'read',
          state: 'state',
          codeChallenge,
          codeChallengeMethod: 'S256',
        },
        'user-123'
      );

      const tokens = provider.token({
        grantType: 'authorization_code',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        code: authResult.code,
        redirectUri: 'https://example.com/callback',
        codeVerifier,
      });

      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken!;
    });

    it('should revoke access token', () => {
      expect(provider.validateAccessToken(accessToken).valid).toBe(true);

      const revoked = provider.revoke(accessToken);
      expect(revoked).toBe(true);

      expect(provider.validateAccessToken(accessToken).valid).toBe(false);
    });

    it('should revoke refresh token', () => {
      const revoked = provider.revoke(refreshToken);
      expect(revoked).toBe(true);

      // Try to use refresh token
      expect(() =>
        provider.token({
          grantType: 'refresh_token',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          refreshToken,
        })
      ).toThrow(/Invalid refresh token/);
    });

    it('should return false for unknown token', () => {
      const revoked = provider.revoke('unknown-token');
      expect(revoked).toBe(false);
    });

    it('should revoke all user tokens', () => {
      expect(provider.validateAccessToken(accessToken).valid).toBe(true);

      const count = provider.revokeAllUserTokens('user-123');
      expect(count).toBeGreaterThan(0);

      expect(provider.validateAccessToken(accessToken).valid).toBe(false);
    });
  });

  describe('unsupported grant types', () => {
    it('should reject unsupported grant type', () => {
      expect(() =>
        provider.token({
          grantType: 'password' as any,
          clientId: 'test-client',
          clientSecret: 'test-secret',
        })
      ).toThrow(/Grant type not supported/);
    });
  });
});
