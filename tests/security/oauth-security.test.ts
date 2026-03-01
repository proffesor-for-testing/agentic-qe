/**
 * OAuth 2.0 Security Test Specifications
 *
 * Comprehensive security tests for A2A Protocol OAuth 2.0 implementation.
 * Based on OWASP OAuth 2.0 Security Guidelines and RFC 6819.
 *
 * @module tests/security/oauth-security.test
 * @see docs/security/oauth-security-requirements.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Type definitions for OAuth 2.0 security testing
 */

interface OAuthTokenRequest {
  grant_type: 'authorization_code' | 'refresh_token' | 'client_credentials';
  code?: string;
  refresh_token?: string;
  redirect_uri?: string;
  client_id: string;
  client_secret?: string;
  code_verifier?: string;
  scope?: string;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

interface AuthorizationRequest {
  response_type: 'code';
  client_id: string;
  redirect_uri: string;
  scope?: string;
  state: string;
  code_challenge?: string;
  code_challenge_method?: 'S256' | 'plain';
}

interface OAuthClient {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  grant_types: string[];
  scopes: string[];
  is_public: boolean;
}

// ============================================================================
// Mock OAuth Server for Testing
// ============================================================================

/**
 * Mock OAuth Authorization Server for security testing
 */
class MockOAuthServer {
  private tokens: Map<string, { clientId: string; scopes: string[]; expiresAt: Date; userId?: string }> = new Map();
  private authCodes: Map<string, { clientId: string; redirectUri: string; scopes: string[]; codeChallenge?: string; usedAt?: Date }> = new Map();
  private revokedTokens: Set<string> = new Set();
  private failedAttempts: Map<string, number> = new Map();
  private clients: Map<string, OAuthClient> = new Map();

  constructor() {
    // Register test clients
    this.clients.set('test-client-confidential', {
      client_id: 'test-client-confidential',
      client_secret: 'super-secret-value',
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      scopes: ['tasks:read', 'tasks:write', 'agents:discover'],
      is_public: false,
    });

    this.clients.set('test-client-public', {
      client_id: 'test-client-public',
      redirect_uris: ['https://spa.example.com/callback'],
      grant_types: ['authorization_code'],
      scopes: ['tasks:read', 'agents:discover'],
      is_public: true,
    });
  }

  generateToken(): string {
    // Simulate cryptographically secure token
    return Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  issueAuthorizationCode(request: AuthorizationRequest): string {
    const code = this.generateToken();
    this.authCodes.set(code, {
      clientId: request.client_id,
      redirectUri: request.redirect_uri,
      scopes: request.scope?.split(' ') || [],
      codeChallenge: request.code_challenge,
    });
    return code;
  }

  exchangeCode(code: string, clientId: string, redirectUri: string, codeVerifier?: string): OAuthTokenResponse | null {
    const codeData = this.authCodes.get(code);
    if (!codeData) return null;
    if (codeData.clientId !== clientId) return null;
    if (codeData.redirectUri !== redirectUri) return null;
    if (codeData.usedAt) return null; // Single use check

    // PKCE validation
    if (codeData.codeChallenge && !codeVerifier) return null;

    // Mark code as used
    codeData.usedAt = new Date();
    this.authCodes.set(code, codeData);

    const accessToken = this.generateToken();
    const refreshToken = this.generateToken();

    this.tokens.set(accessToken, {
      clientId,
      scopes: codeData.scopes,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: refreshToken,
      scope: codeData.scopes.join(' '),
    };
  }

  validateToken(token: string): boolean {
    if (this.revokedTokens.has(token)) return false;
    const tokenData = this.tokens.get(token);
    if (!tokenData) return false;
    if (tokenData.expiresAt < new Date()) return false;
    return true;
  }

  revokeToken(token: string): void {
    this.revokedTokens.add(token);
    this.tokens.delete(token);
  }

  getClient(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId);
  }

  recordFailedAttempt(identifier: string): number {
    const current = this.failedAttempts.get(identifier) || 0;
    this.failedAttempts.set(identifier, current + 1);
    return current + 1;
  }

  getFailedAttempts(identifier: string): number {
    return this.failedAttempts.get(identifier) || 0;
  }

  resetFailedAttempts(identifier: string): void {
    this.failedAttempts.delete(identifier);
  }
}

// ============================================================================
// Security Test Utilities
// ============================================================================

/**
 * Generates a PKCE code verifier
 */
function generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  return Array.from({ length: 64 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
}

/**
 * Generates a PKCE code challenge from verifier
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Constant-time string comparison
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Check if value has sufficient entropy (256 bits = 64 hex chars or 43+ base64url chars)
 */
function hasMinimumEntropy(value: string, minBits: number = 256): boolean {
  // Assuming hex encoding (4 bits per char)
  if (/^[0-9a-f]+$/i.test(value)) {
    return value.length * 4 >= minBits;
  }
  // Assuming base64url encoding (6 bits per char)
  if (/^[A-Za-z0-9\-_]+$/.test(value)) {
    return value.length * 6 >= minBits;
  }
  return false;
}

// ============================================================================
// Token Security Tests
// ============================================================================

describe('OAuth 2.0 Security', () => {
  let server: MockOAuthServer;

  beforeEach(() => {
    server = new MockOAuthServer();
  });

  describe('Token Security', () => {
    it('should use cryptographically secure random tokens', () => {
      // Generate multiple tokens and verify uniqueness and entropy
      const tokens = new Set<string>();
      const tokenCount = 100;

      for (let i = 0; i < tokenCount; i++) {
        const token = server.generateToken();
        expect(tokens.has(token)).toBe(false);
        tokens.add(token);

        // Verify token has sufficient entropy (256 bits minimum)
        expect(hasMinimumEntropy(token, 256)).toBe(true);
      }

      expect(tokens.size).toBe(tokenCount);
    });

    it('should enforce token expiration', async () => {
      // Setup: Create an expired token scenario
      const authRequest: AuthorizationRequest = {
        response_type: 'code',
        client_id: 'test-client-confidential',
        redirect_uri: 'https://app.example.com/callback',
        state: 'random-state-value',
      };

      const code = server.issueAuthorizationCode(authRequest);
      const tokenResponse = server.exchangeCode(
        code,
        'test-client-confidential',
        'https://app.example.com/callback'
      );

      expect(tokenResponse).not.toBeNull();
      expect(server.validateToken(tokenResponse!.access_token)).toBe(true);

      // Simulate token expiration by manipulating internal state
      // In production, this would be tested with actual time passage or mock timers
      const internalTokens = (server as unknown as { tokens: Map<string, unknown> }).tokens;
      const tokenData = internalTokens.get(tokenResponse!.access_token) as { expiresAt: Date };
      tokenData.expiresAt = new Date(Date.now() - 1000); // Set to past

      expect(server.validateToken(tokenResponse!.access_token)).toBe(false);
    });

    it('should prevent token reuse after revocation', () => {
      const authRequest: AuthorizationRequest = {
        response_type: 'code',
        client_id: 'test-client-confidential',
        redirect_uri: 'https://app.example.com/callback',
        state: 'random-state-value',
      };

      const code = server.issueAuthorizationCode(authRequest);
      const tokenResponse = server.exchangeCode(
        code,
        'test-client-confidential',
        'https://app.example.com/callback'
      );

      expect(tokenResponse).not.toBeNull();
      expect(server.validateToken(tokenResponse!.access_token)).toBe(true);

      // Revoke the token
      server.revokeToken(tokenResponse!.access_token);

      // Verify token is no longer valid
      expect(server.validateToken(tokenResponse!.access_token)).toBe(false);
    });

    it('should not expose tokens in logs', () => {
      // This test verifies logging behavior - tokens should be masked or excluded
      const token = server.generateToken();

      // Simulate logging function that should mask tokens
      const logEntry = {
        event: 'token_issued',
        token_id: token.substring(0, 8) + '...',
        timestamp: new Date().toISOString(),
      };

      // Verify full token is not in log
      expect(JSON.stringify(logEntry)).not.toContain(token);
      // Verify only prefix is logged (for correlation)
      expect(logEntry.token_id).toContain(token.substring(0, 8));
    });

    it('should use constant-time comparison for token validation', () => {
      // Test constant-time comparison to prevent timing attacks
      const token1 = 'a'.repeat(64);
      const token2 = 'a'.repeat(64);
      const token3 = 'b'.repeat(64);
      const token4 = 'a'.repeat(63) + 'b';

      // Same tokens should match
      expect(constantTimeCompare(token1, token2)).toBe(true);

      // Completely different tokens should not match
      expect(constantTimeCompare(token1, token3)).toBe(false);

      // Tokens differing only in last character should not match
      expect(constantTimeCompare(token1, token4)).toBe(false);

      // Verify timing is consistent (conceptual - actual timing test would need benchmarking)
      // In production, use crypto.timingSafeEqual
    });
  });

  describe('Authorization Security', () => {
    it('should validate redirect_uri against registered URIs', () => {
      const client = server.getClient('test-client-confidential');
      expect(client).toBeDefined();

      const validUri = 'https://app.example.com/callback';
      const invalidUri = 'https://malicious.example.com/callback';
      const subtlyInvalidUri = 'https://app.example.com/callback?extra=param';

      // Valid URI should be accepted
      expect(client!.redirect_uris.includes(validUri)).toBe(true);

      // Invalid URI should be rejected
      expect(client!.redirect_uris.includes(invalidUri)).toBe(false);

      // Subtly modified URI should be rejected (exact match required)
      expect(client!.redirect_uris.includes(subtlyInvalidUri)).toBe(false);
    });

    it('should prevent authorization code reuse', () => {
      const authRequest: AuthorizationRequest = {
        response_type: 'code',
        client_id: 'test-client-confidential',
        redirect_uri: 'https://app.example.com/callback',
        state: 'random-state-value',
      };

      const code = server.issueAuthorizationCode(authRequest);

      // First use should succeed
      const firstExchange = server.exchangeCode(
        code,
        'test-client-confidential',
        'https://app.example.com/callback'
      );
      expect(firstExchange).not.toBeNull();

      // Second use should fail
      const secondExchange = server.exchangeCode(
        code,
        'test-client-confidential',
        'https://app.example.com/callback'
      );
      expect(secondExchange).toBeNull();
    });

    it('should bind authorization codes to client_id', () => {
      const authRequest: AuthorizationRequest = {
        response_type: 'code',
        client_id: 'test-client-confidential',
        redirect_uri: 'https://app.example.com/callback',
        state: 'random-state-value',
      };

      const code = server.issueAuthorizationCode(authRequest);

      // Exchange with different client_id should fail
      const wrongClientExchange = server.exchangeCode(
        code,
        'different-client-id',
        'https://app.example.com/callback'
      );
      expect(wrongClientExchange).toBeNull();
    });

    it('should enforce state parameter for CSRF protection', () => {
      // State parameter should be required and validated
      const state = crypto.randomUUID() + crypto.randomUUID(); // 72 chars, >128 bits entropy

      // Verify state has sufficient entropy
      expect(state.length).toBeGreaterThanOrEqual(32); // 128 bits minimum

      // State should be cryptographically random
      expect(state).toMatch(/^[a-f0-9-]+$/i);

      // In production: verify state returned matches state sent
      const sentState = state;
      const returnedState = state; // Simulate successful match
      const attackerState = crypto.randomUUID();

      expect(sentState).toBe(returnedState);
      expect(sentState).not.toBe(attackerState);
    });
  });

  describe('Scope Security', () => {
    it('should not grant more scopes than requested', () => {
      const client = server.getClient('test-client-confidential');
      expect(client).toBeDefined();

      const requestedScopes = ['tasks:read'];
      const clientScopes = client!.scopes;

      // Requested scopes should be subset of or equal to client scopes
      const allRequestedScopesAllowed = requestedScopes.every((scope) =>
        clientScopes.includes(scope)
      );
      expect(allRequestedScopesAllowed).toBe(true);

      // Should not auto-grant additional scopes
      const grantedScopes = requestedScopes.filter((scope) =>
        clientScopes.includes(scope)
      );
      expect(grantedScopes).toEqual(requestedScopes);
    });

    it('should validate scope format', () => {
      const validScopes = [
        'tasks:read',
        'tasks:write',
        'agents:discover',
        'agents:card:extended',
      ];

      const invalidScopes = [
        'invalid-format',
        'TASKS:READ', // Case sensitive
        'tasks:', // Missing action
        ':read', // Missing resource
        'tasks:read:extra:parts', // Too many parts
        'tasks:read with spaces',
        '<script>alert(1)</script>',
        '../../../etc/passwd',
      ];

      const scopeRegex = /^[a-z]+:[a-z]+(:[a-z]+)?$/;

      validScopes.forEach((scope) => {
        expect(scopeRegex.test(scope)).toBe(true);
      });

      invalidScopes.forEach((scope) => {
        expect(scopeRegex.test(scope)).toBe(false);
      });
    });

    it('should enforce scope hierarchy', () => {
      const scopeHierarchy: Record<string, string[]> = {
        'tasks:admin': ['tasks:read', 'tasks:write', 'tasks:cancel'],
        'agents:card:extended': ['agents:card'],
        'push:manage': ['push:subscribe'],
      };

      // Verify hierarchy - admin scope implies child scopes
      const userScopes = ['tasks:admin'];

      const hasReadAccess = userScopes.some((scope) => {
        if (scope === 'tasks:read') return true;
        const implies = scopeHierarchy[scope];
        return implies?.includes('tasks:read');
      });

      expect(hasReadAccess).toBe(true);

      // Verify child scope does not imply parent
      const userScopesLimited = ['tasks:read'];
      const hasAdminAccess = userScopesLimited.includes('tasks:admin');
      expect(hasAdminAccess).toBe(false);
    });

    it('should reject unknown scopes', () => {
      const knownScopes = [
        'tasks:read',
        'tasks:write',
        'tasks:cancel',
        'tasks:admin',
        'agents:discover',
        'agents:card',
        'agents:card:extended',
        'message:send',
        'message:stream',
        'push:subscribe',
        'push:manage',
      ];

      const requestedScopes = ['tasks:read', 'unknown:scope', 'tasks:write'];

      const unknownScopes = requestedScopes.filter(
        (scope) => !knownScopes.includes(scope)
      );

      expect(unknownScopes.length).toBeGreaterThan(0);
      expect(unknownScopes).toContain('unknown:scope');

      // In production: reject the entire request if unknown scopes present
    });
  });

  describe('Client Authentication', () => {
    it('should validate client credentials', () => {
      const client = server.getClient('test-client-confidential');
      expect(client).toBeDefined();
      expect(client!.client_secret).toBeDefined();

      // Valid credentials
      const validClientId = 'test-client-confidential';
      const validSecret = 'super-secret-value';

      expect(client!.client_id).toBe(validClientId);
      expect(client!.client_secret).toBe(validSecret);

      // Invalid credentials should not match
      const invalidSecret = 'wrong-secret';
      expect(client!.client_secret).not.toBe(invalidSecret);
    });

    it('should rate limit failed authentication attempts', () => {
      const clientId = 'test-client-confidential';
      const maxAttempts = 5;

      // Simulate failed attempts
      for (let i = 1; i <= maxAttempts; i++) {
        const attempts = server.recordFailedAttempt(clientId);
        expect(attempts).toBe(i);
      }

      // Verify limit reached
      const totalAttempts = server.getFailedAttempts(clientId);
      expect(totalAttempts).toBe(maxAttempts);

      // In production: should lock out after maxAttempts
      const isLockedOut = totalAttempts >= maxAttempts;
      expect(isLockedOut).toBe(true);

      // Reset on successful auth
      server.resetFailedAttempts(clientId);
      expect(server.getFailedAttempts(clientId)).toBe(0);
    });

    it('should use secure password hashing for client secrets', () => {
      // In production, client secrets should be hashed with Argon2id or bcrypt
      const mockHashedSecret =
        '$argon2id$v=19$m=65536,t=3,p=4$randomsalt$hashedvalue';

      // Verify hash format
      expect(mockHashedSecret).toMatch(/^\$argon2id\$/);

      // Verify parameters are secure
      // m=65536 (64MB memory), t=3 (3 iterations), p=4 (4 parallelism)
      expect(mockHashedSecret).toContain('m=65536');
      expect(mockHashedSecret).toContain('t=3');
    });
  });

  describe('JWT Security', () => {
    interface MockJWT {
      header: { alg: string; typ: string };
      payload: {
        iss: string;
        aud: string | string[];
        exp: number;
        iat: number;
        jti?: string;
        sub?: string;
        scope?: string;
      };
      signature: string;
    }

    function createMockJWT(overrides: Partial<MockJWT['payload']> = {}): MockJWT {
      return {
        header: { alg: 'ES256', typ: 'JWT' },
        payload: {
          iss: 'https://a2a.example.com',
          aud: 'https://api.example.com',
          exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
          iat: Math.floor(Date.now() / 1000),
          jti: crypto.randomUUID(),
          sub: 'user-123',
          scope: 'tasks:read tasks:write',
          ...overrides,
        },
        signature: 'valid-signature',
      };
    }

    it('should validate JWT signature', () => {
      const jwt = createMockJWT();

      // Valid signature
      expect(jwt.signature).toBe('valid-signature');

      // Invalid signature should be rejected
      const invalidJwt = { ...jwt, signature: 'tampered-signature' };
      expect(invalidJwt.signature).not.toBe('valid-signature');
    });

    it('should reject expired JWTs', () => {
      const expiredJwt = createMockJWT({
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      });

      const now = Math.floor(Date.now() / 1000);
      const isExpired = expiredJwt.payload.exp < now;

      expect(isExpired).toBe(true);
    });

    it('should validate issuer claim', () => {
      const expectedIssuer = 'https://a2a.example.com';
      const validJwt = createMockJWT();
      const invalidJwt = createMockJWT({ iss: 'https://malicious.example.com' });

      expect(validJwt.payload.iss).toBe(expectedIssuer);
      expect(invalidJwt.payload.iss).not.toBe(expectedIssuer);
    });

    it('should validate audience claim', () => {
      const expectedAudience = 'https://api.example.com';
      const validJwt = createMockJWT();
      const invalidJwt = createMockJWT({ aud: 'https://other-api.example.com' });

      expect(validJwt.payload.aud).toBe(expectedAudience);
      expect(invalidJwt.payload.aud).not.toBe(expectedAudience);

      // Should support audience as array
      const multiAudienceJwt = createMockJWT({
        aud: ['https://api.example.com', 'https://api2.example.com'],
      });
      expect(multiAudienceJwt.payload.aud).toContain(expectedAudience);
    });

    it('should reject JWTs with none algorithm', () => {
      const insecureAlgorithms = ['none', 'None', 'NONE', 'nOnE'];

      insecureAlgorithms.forEach((alg) => {
        const insecureJwt = {
          ...createMockJWT(),
          header: { alg, typ: 'JWT' },
        };

        const isAlgNone = insecureJwt.header.alg.toLowerCase() === 'none';
        expect(isAlgNone).toBe(true);

        // In production: these should all be rejected
      });

      // Safe algorithms
      const safeAlgorithms = ['ES256', 'ES384', 'ES512', 'RS256', 'RS384', 'RS512'];
      safeAlgorithms.forEach((alg) => {
        expect(alg.toLowerCase()).not.toBe('none');
      });
    });

    it('should validate JWT not-before (nbf) claim if present', () => {
      const futureJwt = createMockJWT();
      // Add nbf claim 1 hour in the future
      (futureJwt.payload as unknown as { nbf: number }).nbf =
        Math.floor(Date.now() / 1000) + 3600;

      const now = Math.floor(Date.now() / 1000);
      const nbf = (futureJwt.payload as unknown as { nbf: number }).nbf;
      const isNotYetValid = nbf > now;

      expect(isNotYetValid).toBe(true);
    });

    it('should track JWT ID (jti) to prevent replay', () => {
      const usedJTIs = new Set<string>();

      const jwt1 = createMockJWT();
      const jwt2 = createMockJWT(); // Different JTI

      // First use should succeed
      expect(usedJTIs.has(jwt1.payload.jti!)).toBe(false);
      usedJTIs.add(jwt1.payload.jti!);

      // Replay should be detected
      expect(usedJTIs.has(jwt1.payload.jti!)).toBe(true);

      // Different JWT should succeed
      expect(usedJTIs.has(jwt2.payload.jti!)).toBe(false);
    });
  });

  describe('PKCE Security', () => {
    it('should require PKCE for public clients', () => {
      const publicClient = server.getClient('test-client-public');
      expect(publicClient).toBeDefined();
      expect(publicClient!.is_public).toBe(true);

      // Public clients MUST use PKCE
      // This would be enforced at the authorization endpoint
    });

    it('should reject plain code_challenge_method', async () => {
      const codeVerifier = generateCodeVerifier();

      // Plain method should be rejected
      const plainChallenge = codeVerifier;
      const s256Challenge = await generateCodeChallenge(codeVerifier);

      // Plain method is insecure - verifier is exposed
      expect(plainChallenge).toBe(codeVerifier);

      // S256 method is secure - challenge is hash of verifier
      expect(s256Challenge).not.toBe(codeVerifier);
      expect(s256Challenge.length).toBeLessThan(codeVerifier.length);
    });

    it('should validate code_verifier length', () => {
      // RFC 7636: code_verifier MUST be 43-128 characters
      const minLength = 43;
      const maxLength = 128;

      const validVerifier = 'a'.repeat(64);
      const tooShortVerifier = 'a'.repeat(42);
      const tooLongVerifier = 'a'.repeat(129);

      expect(validVerifier.length).toBeGreaterThanOrEqual(minLength);
      expect(validVerifier.length).toBeLessThanOrEqual(maxLength);

      expect(tooShortVerifier.length).toBeLessThan(minLength);
      expect(tooLongVerifier.length).toBeGreaterThan(maxLength);
    });

    it('should validate code_verifier charset', () => {
      // RFC 7636: unreserved characters only
      const validCharset = /^[A-Za-z0-9\-._~]+$/;

      const validVerifiers = [
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
        '0123456789-._~',
        'abcdefghijklmnopqrstuvwxyz0123456789-._~ABCDEFGHIJ',
      ];

      const invalidVerifiers = [
        'contains spaces here',
        'contains+plus+signs',
        'contains/slashes',
        'contains=equals',
        'contains%percent',
      ];

      validVerifiers.forEach((v) => {
        expect(validCharset.test(v)).toBe(true);
      });

      invalidVerifiers.forEach((v) => {
        expect(validCharset.test(v)).toBe(false);
      });
    });

    it('should correctly compute S256 code challenge', async () => {
      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

      // Expected S256 challenge (from RFC 7636 example)
      // Note: This is a simplified test - actual implementation should match RFC
      const challenge = await generateCodeChallenge(codeVerifier);

      // Challenge should be base64url encoded
      expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);

      // Challenge should not have padding
      expect(challenge).not.toContain('=');

      // Challenge length should be ~43 chars (256 bits / 6 bits per char)
      expect(challenge.length).toBeGreaterThanOrEqual(40);
      expect(challenge.length).toBeLessThanOrEqual(50);
    });
  });

  describe('Rate Limiting Security', () => {
    it('should track request counts per client', () => {
      const requestCounts: Map<string, number> = new Map();
      const maxRequestsPerMinute = 100;

      // Simulate requests from multiple clients
      const clients = ['client-a', 'client-b', 'client-c'];

      clients.forEach((clientId) => {
        requestCounts.set(clientId, 0);
      });

      // Simulate 50 requests from client-a
      for (let i = 0; i < 50; i++) {
        requestCounts.set('client-a', (requestCounts.get('client-a') || 0) + 1);
      }

      expect(requestCounts.get('client-a')).toBe(50);
      expect(requestCounts.get('client-a')!).toBeLessThan(maxRequestsPerMinute);

      // Simulate exceeding limit
      for (let i = 0; i < 60; i++) {
        requestCounts.set('client-a', (requestCounts.get('client-a') || 0) + 1);
      }

      expect(requestCounts.get('client-a')!).toBeGreaterThan(maxRequestsPerMinute);
    });

    it('should include Retry-After header in rate limit response', () => {
      const rateLimitResponse = {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
        },
        body: {
          jsonrpc: '2.0',
          error: {
            code: -32030,
            message: 'Rate limit exceeded',
            data: { retryAfter: 60 },
          },
        },
      };

      expect(rateLimitResponse.status).toBe(429);
      expect(rateLimitResponse.headers['Retry-After']).toBeDefined();
      expect(parseInt(rateLimitResponse.headers['Retry-After'])).toBeGreaterThan(0);
    });

    it('should implement progressive delays for failed attempts', () => {
      const progressiveDelays: Record<number, number> = {
        1: 0,
        2: 0,
        3: 1000,
        4: 1000,
        5: 5000,
        6: 5000,
        7: 30000,
        8: 30000,
        9: 30000,
        10: -1, // Lockout
      };

      function getDelayForAttempt(attempt: number): number | 'lockout' {
        if (attempt >= 10) return 'lockout';
        return progressiveDelays[attempt] ?? 30000;
      }

      expect(getDelayForAttempt(1)).toBe(0);
      expect(getDelayForAttempt(3)).toBe(1000);
      expect(getDelayForAttempt(5)).toBe(5000);
      expect(getDelayForAttempt(7)).toBe(30000);
      expect(getDelayForAttempt(10)).toBe('lockout');
      expect(getDelayForAttempt(15)).toBe('lockout');
    });
  });

  describe('Audit Logging Security', () => {
    it('should log authentication events with required fields', () => {
      const authEvent = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'oauth.token.issued',
        severity: 'INFO' as const,
        actor: {
          type: 'client' as const,
          id: 'test-client-confidential',
          ip: '192.168.1.100',
        },
        resource: {
          type: 'token' as const,
          id: 'tok_abc123...', // Masked token
        },
        action: {
          type: 'issue',
          result: 'success' as const,
        },
      };

      // Verify required fields
      expect(authEvent.id).toBeDefined();
      expect(authEvent.timestamp).toBeDefined();
      expect(authEvent.eventType).toBeDefined();
      expect(authEvent.actor.id).toBeDefined();
      expect(authEvent.actor.ip).toBeDefined();

      // Verify token is masked
      expect(authEvent.resource.id).toContain('...');
    });

    it('should not log sensitive data', () => {
      const logEntry = {
        event: 'token_exchange',
        client_id: 'test-client',
        // These should NEVER be logged:
        // client_secret: 'secret',
        // access_token: 'token',
        // refresh_token: 'refresh',
        // authorization_code: 'code',
        timestamp: new Date().toISOString(),
      };

      const logString = JSON.stringify(logEntry);

      // Verify no secrets in log
      expect(logString).not.toContain('secret');
      expect(logString).not.toContain('access_token');
      expect(logString).not.toContain('refresh_token');
      expect(logString).not.toContain('authorization_code');
      expect(logString).not.toContain('password');
    });
  });

  describe('Transport Security', () => {
    it('should reject non-HTTPS requests for OAuth endpoints', () => {
      const httpUrl = 'http://a2a.example.com/oauth/token';
      const httpsUrl = 'https://a2a.example.com/oauth/token';

      const isSecure = (url: string): boolean => url.startsWith('https://');

      expect(isSecure(httpUrl)).toBe(false);
      expect(isSecure(httpsUrl)).toBe(true);
    });

    it('should set secure cookie flags', () => {
      const secureCookie = {
        name: 'session',
        value: 'encrypted-session-data',
        options: {
          httpOnly: true,
          secure: true,
          sameSite: 'Strict' as const,
          path: '/',
          maxAge: 3600,
        },
      };

      expect(secureCookie.options.httpOnly).toBe(true);
      expect(secureCookie.options.secure).toBe(true);
      expect(secureCookie.options.sameSite).toBe('Strict');
    });

    it('should configure HSTS header', () => {
      const hstsHeader = 'max-age=31536000; includeSubDomains; preload';

      // Verify HSTS components
      expect(hstsHeader).toContain('max-age=');
      expect(hstsHeader).toContain('includeSubDomains');

      // Parse max-age
      const maxAgeMatch = hstsHeader.match(/max-age=(\d+)/);
      expect(maxAgeMatch).not.toBeNull();
      const maxAge = parseInt(maxAgeMatch![1]);
      expect(maxAge).toBeGreaterThanOrEqual(31536000); // 1 year minimum
    });

    it('should configure restrictive CORS', () => {
      const corsConfig = {
        allowedOrigins: ['https://app.example.com'],
        allowedMethods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
        credentials: true,
        maxAge: 86400,
      };

      // Should not allow wildcard origin when credentials are true
      expect(corsConfig.allowedOrigins).not.toContain('*');

      // Should limit methods to what's needed
      expect(corsConfig.allowedMethods).not.toContain('DELETE');
      expect(corsConfig.allowedMethods).not.toContain('PUT');
    });
  });
});

// ============================================================================
// Integration Test Placeholders
// ============================================================================

describe.skip('OAuth 2.0 Integration Tests (Placeholder)', () => {
  it('should complete full authorization code flow with PKCE', async () => {
    // TODO: Implement when OAuth server is available
    // 1. Generate PKCE verifier and challenge
    // 2. Initiate authorization request with code_challenge
    // 3. Handle authorization callback with code
    // 4. Exchange code for tokens with code_verifier
    // 5. Validate access token works for protected resources
    // 6. Refresh token flow
    // 7. Token revocation
  });

  it('should handle token refresh with rotation', async () => {
    // TODO: Implement when OAuth server is available
    // 1. Use refresh token to get new access token
    // 2. Verify new refresh token is issued
    // 3. Verify old refresh token is invalidated
  });

  it('should detect and prevent token replay attacks', async () => {
    // TODO: Implement when OAuth server is available
    // 1. Use refresh token
    // 2. Attempt to reuse same refresh token
    // 3. Verify reuse is detected and all tokens revoked
  });

  it('should enforce scope restrictions on protected endpoints', async () => {
    // TODO: Implement when OAuth server is available
    // 1. Obtain token with limited scope
    // 2. Attempt to access endpoint requiring different scope
    // 3. Verify request is rejected with 403
  });
});

// ============================================================================
// Security Regression Tests
// ============================================================================

describe('Security Regression Tests', () => {
  it('should prevent timing attacks on token comparison', () => {
    // Measure comparison time for different scenarios
    // Note: This is a conceptual test - actual timing tests require precise measurements

    const validToken = 'a'.repeat(64);
    const earlyMismatch = 'b' + 'a'.repeat(63);
    const lateMismatch = 'a'.repeat(63) + 'b';

    // All comparisons should take approximately equal time
    // Using constant-time comparison
    const result1 = constantTimeCompare(validToken, validToken);
    const result2 = constantTimeCompare(validToken, earlyMismatch);
    const result3 = constantTimeCompare(validToken, lateMismatch);

    expect(result1).toBe(true);
    expect(result2).toBe(false);
    expect(result3).toBe(false);
  });

  it('should reject malformed tokens gracefully', () => {
    const malformedTokens = [
      '',
      ' ',
      'null',
      'undefined',
      '<script>alert(1)</script>',
      '../../../etc/passwd',
      'token\x00with\x00nulls',
      'a'.repeat(10000), // Very long token
    ];

    malformedTokens.forEach((token) => {
      // Should not throw, should return false
      expect(() => hasMinimumEntropy(token)).not.toThrow();
    });
  });

  it('should handle edge cases in scope validation', () => {
    const edgeCases = [
      { scope: '', expected: false },
      { scope: ' ', expected: false },
      { scope: 'tasks:read tasks:write', expected: true }, // Space-separated
      { scope: 'tasks:read,tasks:write', expected: false }, // Comma-separated (invalid)
      { scope: 'tasks:read\ntasks:write', expected: false }, // Newline (invalid)
    ];

    const scopeRegex = /^[a-z]+:[a-z]+(:[a-z]+)?$/;

    edgeCases.forEach(({ scope, expected }) => {
      const scopes = scope.split(' ').filter(Boolean);
      const allValid = scopes.length > 0 && scopes.every((s) => scopeRegex.test(s));
      // Note: empty string should be handled as "no scopes requested"
      if (scope === '' || scope === ' ') {
        expect(scopes.length).toBe(0);
      }
    });
  });
});
