/**
 * A2A OAuth 2.0 Route Handlers Unit Tests
 *
 * @module tests/unit/adapters/a2a/auth/routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getOAuthRouteDefinitions,
  validateRedirectUri,
  generateCodeChallenge,
  verifyCodeChallenge,
  type OAuth2Provider,
  type OAuthRouteDefinition,
  type TokenResponse,
  type OpenIDConfiguration,
} from '../../../../../src/adapters/a2a/auth/routes.js';
import type { HttpRequest, HttpResponse } from '../../../../../src/adapters/a2a/discovery/routes.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockRequest(overrides: Partial<HttpRequest & { body?: unknown }> = {}): HttpRequest & { body?: unknown } {
  return {
    params: {},
    query: {},
    headers: {},
    header: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } as HttpRequest & { body?: unknown };
}

function createMockResponse(): HttpResponse & {
  _status?: number;
  _json?: unknown;
  _headers: Record<string, string | number>;
} {
  const res: any = {
    _headers: {},
    setHeader(name: string, value: string | number) {
      res._headers[name] = value;
    },
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
    },
    end() {
      res._ended = true;
    },
  };
  return res;
}

const SAMPLE_TOKEN_RESPONSE: TokenResponse = {
  access_token: 'access-token-xyz',
  token_type: 'Bearer',
  expires_in: 3600,
  refresh_token: 'refresh-token-abc',
  scope: 'task:read',
};

const SAMPLE_OIDC_CONFIG: OpenIDConfiguration = {
  issuer: 'https://issuer.example.com',
  authorization_endpoint: 'https://issuer.example.com/oauth/authorize',
  token_endpoint: 'https://issuer.example.com/oauth/token',
  revocation_endpoint: 'https://issuer.example.com/oauth/revoke',
  jwks_uri: 'https://issuer.example.com/.well-known/jwks.json',
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  scopes_supported: ['task:read'],
  token_endpoint_auth_methods_supported: ['client_secret_post'],
  claims_supported: ['sub'],
  code_challenge_methods_supported: ['S256'],
};

function createMockProvider(overrides: Partial<OAuth2Provider> = {}): OAuth2Provider {
  return {
    validateClient: vi.fn().mockResolvedValue(true),
    exchangeAuthorizationCode: vi.fn().mockResolvedValue(SAMPLE_TOKEN_RESPONSE),
    exchangeClientCredentials: vi.fn().mockResolvedValue(SAMPLE_TOKEN_RESPONSE),
    refreshToken: vi.fn().mockResolvedValue(SAMPLE_TOKEN_RESPONSE),
    revokeToken: vi.fn().mockResolvedValue(undefined),
    getOpenIDConfiguration: vi.fn().mockReturnValue(SAMPLE_OIDC_CONFIG),
    ...overrides,
  };
}

function findRoute(routes: OAuthRouteDefinition[], method: OAuthRouteDefinition['method'], path: string): OAuthRouteDefinition {
  const route = routes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`Route not found: ${method} ${path}`);
  return route;
}

// ============================================================================
// getOAuthRouteDefinitions
// ============================================================================

describe('getOAuthRouteDefinitions', () => {
  it('registers token, authorize, revoke, discovery, and OPTIONS routes under default basePath', () => {
    const provider = createMockProvider();
    const routes = getOAuthRouteDefinitions({ provider });

    expect(findRoute(routes, 'post', '/oauth/token')).toBeDefined();
    expect(findRoute(routes, 'get', '/oauth/authorize')).toBeDefined();
    expect(findRoute(routes, 'post', '/oauth/revoke')).toBeDefined();
    expect(findRoute(routes, 'get', '/oauth/.well-known/openid-configuration')).toBeDefined();
    expect(routes.filter((r) => r.method === 'options')).toHaveLength(4);
  });

  it('honors a custom basePath', () => {
    const provider = createMockProvider();
    const routes = getOAuthRouteDefinitions({ provider, basePath: '/auth/v2' });
    expect(findRoute(routes, 'post', '/auth/v2/token')).toBeDefined();
  });
});

// ============================================================================
// POST /oauth/token
// ============================================================================

describe('handleToken', () => {
  let provider: OAuth2Provider;
  let tokenHandler: OAuthRouteDefinition['handler'];

  beforeEach(() => {
    provider = createMockProvider();
    const routes = getOAuthRouteDefinitions({ provider });
    tokenHandler = findRoute(routes, 'post', '/oauth/token').handler;
  });

  it('returns 400 invalid_request when grant_type is missing', async () => {
    const req = createMockRequest({ body: { client_id: 'c1' } });
    const res = createMockResponse();
    await tokenHandler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toBe('invalid_request');
  });

  it('returns 400 invalid_request when client_id is missing', async () => {
    const req = createMockRequest({ body: { grant_type: 'client_credentials' } });
    const res = createMockResponse();
    await tokenHandler(req, res);
    expect(res._status).toBe(400);
  });

  it('returns 401 invalid_client when the client fails validation', async () => {
    provider.validateClient = vi.fn().mockResolvedValue(false);
    const req = createMockRequest({
      body: { grant_type: 'client_credentials', client_id: 'bad', client_secret: 'x' },
    });
    const res = createMockResponse();
    await tokenHandler(req, res);
    expect(res._status).toBe(401);
    expect((res._json as any).error).toBe('invalid_client');
  });

  describe('authorization_code grant', () => {
    it('exchanges a valid code for tokens', async () => {
      const req = createMockRequest({
        body: {
          grant_type: 'authorization_code',
          client_id: 'c1',
          code: 'auth-code-1',
          redirect_uri: 'https://app.example.com/callback',
          code_verifier: 'verifier-1',
        },
      });
      const res = createMockResponse();
      await tokenHandler(req, res);
      expect(provider.exchangeAuthorizationCode).toHaveBeenCalledWith(
        'auth-code-1',
        'c1',
        'https://app.example.com/callback',
        'verifier-1'
      );
      expect(res._status).toBe(200);
      expect(res._json).toEqual(SAMPLE_TOKEN_RESPONSE);
    });

    it('returns 400 when code is missing', async () => {
      const req = createMockRequest({
        body: { grant_type: 'authorization_code', client_id: 'c1', redirect_uri: 'https://app.example.com/cb' },
      });
      const res = createMockResponse();
      await tokenHandler(req, res);
      expect(res._status).toBe(400);
    });

    it('returns 400 when redirect_uri is missing', async () => {
      const req = createMockRequest({
        body: { grant_type: 'authorization_code', client_id: 'c1', code: 'code-1' },
      });
      const res = createMockResponse();
      await tokenHandler(req, res);
      expect(res._status).toBe(400);
    });

    it('maps a provider rejection to 400 invalid_grant', async () => {
      provider.exchangeAuthorizationCode = vi.fn().mockRejectedValue(new Error('code expired'));
      const req = createMockRequest({
        body: {
          grant_type: 'authorization_code',
          client_id: 'c1',
          code: 'expired-code',
          redirect_uri: 'https://app.example.com/cb',
        },
      });
      const res = createMockResponse();
      await tokenHandler(req, res);
      expect(res._status).toBe(400);
      expect((res._json as any).error).toBe('invalid_grant');
      expect((res._json as any).error_description).toBe('code expired');
    });
  });

  describe('client_credentials grant', () => {
    it('exchanges client credentials for tokens', async () => {
      const req = createMockRequest({
        body: { grant_type: 'client_credentials', client_id: 'c1', client_secret: 's1', scope: 'task:read' },
      });
      const res = createMockResponse();
      await tokenHandler(req, res);
      expect(provider.exchangeClientCredentials).toHaveBeenCalledWith('c1', 's1', 'task:read');
      expect(res._status).toBe(200);
    });

    it('returns 400 when client_secret is missing', async () => {
      const req = createMockRequest({ body: { grant_type: 'client_credentials', client_id: 'c1' } });
      const res = createMockResponse();
      await tokenHandler(req, res);
      expect(res._status).toBe(400);
    });
  });

  describe('refresh_token grant', () => {
    it('refreshes an access token', async () => {
      const req = createMockRequest({
        body: { grant_type: 'refresh_token', client_id: 'c1', refresh_token: 'rt-1' },
      });
      const res = createMockResponse();
      await tokenHandler(req, res);
      expect(provider.refreshToken).toHaveBeenCalledWith('rt-1', 'c1');
      expect(res._status).toBe(200);
    });

    it('returns 400 when refresh_token is missing', async () => {
      const req = createMockRequest({ body: { grant_type: 'refresh_token', client_id: 'c1' } });
      const res = createMockResponse();
      await tokenHandler(req, res);
      expect(res._status).toBe(400);
    });

    it('maps an invalid refresh token to 400 invalid_grant', async () => {
      provider.refreshToken = vi.fn().mockRejectedValue(new Error('refresh token revoked'));
      const req = createMockRequest({
        body: { grant_type: 'refresh_token', client_id: 'c1', refresh_token: 'revoked-rt' },
      });
      const res = createMockResponse();
      await tokenHandler(req, res);
      expect(res._status).toBe(400);
    });
  });

  it('returns 400 unsupported_grant_type for unknown grant types', async () => {
    const req = createMockRequest({
      body: { grant_type: 'password', client_id: 'c1' },
    });
    const res = createMockResponse();
    await tokenHandler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toBe('unsupported_grant_type');
  });

  it('parses application/x-www-form-urlencoded string bodies', async () => {
    const req = createMockRequest({
      body: 'grant_type=client_credentials&client_id=c1&client_secret=s1',
    });
    const res = createMockResponse();
    await tokenHandler(req, res);
    expect(res._status).toBe(200);
  });

  it('returns 500 when an unexpected error occurs outside grant handling', async () => {
    provider.validateClient = vi.fn().mockRejectedValue(new Error('db down'));
    const req = createMockRequest({ body: { grant_type: 'client_credentials', client_id: 'c1', client_secret: 's' } });
    const res = createMockResponse();
    await tokenHandler(req, res);
    expect(res._status).toBe(500);
  });
});

// ============================================================================
// GET /oauth/authorize
// ============================================================================

describe('handleAuthorize', () => {
  let provider: OAuth2Provider;
  let authorizeHandler: OAuthRouteDefinition['handler'];

  beforeEach(() => {
    provider = createMockProvider();
    const routes = getOAuthRouteDefinitions({ provider, loginPageUrl: '/login' });
    authorizeHandler = findRoute(routes, 'get', '/oauth/authorize').handler;
  });

  it('redirects to the login page with all params preserved', async () => {
    const req = createMockRequest({
      query: {
        response_type: 'code',
        client_id: 'c1',
        redirect_uri: 'https://app.example.com/cb',
        scope: 'task:read',
        state: 'xyz',
        code_challenge: 'challenge-1',
        code_challenge_method: 'S256',
      } as any,
    });
    const res = createMockResponse();
    await authorizeHandler(req, res);
    expect(res._status).toBe(302);
    const location = res._headers['Location'] as string;
    expect(location).toContain('/login');
    expect(location).toContain('client_id=c1');
    expect(location).toContain('state=xyz');
    expect(location).toContain('code_challenge=challenge-1');
  });

  it.each(['response_type', 'client_id', 'redirect_uri'])(
    'returns 400 invalid_request when %s is missing',
    async (missingField) => {
      const query: any = {
        response_type: 'code',
        client_id: 'c1',
        redirect_uri: 'https://app.example.com/cb',
      };
      delete query[missingField];
      const req = createMockRequest({ query });
      const res = createMockResponse();
      await authorizeHandler(req, res);
      expect(res._status).toBe(400);
    }
  );

  it('returns 400 unauthorized_client for an unknown client_id', async () => {
    provider.validateClient = vi.fn().mockResolvedValue(false);
    const req = createMockRequest({
      query: { response_type: 'code', client_id: 'unknown', redirect_uri: 'https://app.example.com/cb' } as any,
    });
    const res = createMockResponse();
    await authorizeHandler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toBe('unauthorized_client');
  });

  it('rejects response_type values other than "code"', async () => {
    const req = createMockRequest({
      query: { response_type: 'token', client_id: 'c1', redirect_uri: 'https://app.example.com/cb' } as any,
    });
    const res = createMockResponse();
    await authorizeHandler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toBe('unsupported_grant_type');
  });
});

// ============================================================================
// POST /oauth/revoke
// ============================================================================

describe('handleRevoke', () => {
  let provider: OAuth2Provider;
  let revokeHandler: OAuthRouteDefinition['handler'];

  beforeEach(() => {
    provider = createMockProvider();
    const routes = getOAuthRouteDefinitions({ provider });
    revokeHandler = findRoute(routes, 'post', '/oauth/revoke').handler;
  });

  it('revokes a token and returns 200', async () => {
    const req = createMockRequest({ body: { token: 'tok-1', token_type_hint: 'access_token' } });
    const res = createMockResponse();
    await revokeHandler(req, res);
    expect(provider.revokeToken).toHaveBeenCalledWith('tok-1', 'access_token');
    expect(res._status).toBe(200);
  });

  it('returns 400 when token is missing', async () => {
    const req = createMockRequest({ body: {} });
    const res = createMockResponse();
    await revokeHandler(req, res);
    expect(res._status).toBe(400);
  });

  it('returns 401 when client credentials are provided but invalid', async () => {
    provider.validateClient = vi.fn().mockResolvedValue(false);
    const req = createMockRequest({ body: { token: 'tok-1', client_id: 'bad', client_secret: 'x' } });
    const res = createMockResponse();
    await revokeHandler(req, res);
    expect(res._status).toBe(401);
  });

  it('per RFC 7009, still returns 200 when the token is unknown/invalid', async () => {
    provider.revokeToken = vi.fn().mockRejectedValue(new Error('token not found'));
    const req = createMockRequest({ body: { token: 'does-not-exist' } });
    const res = createMockResponse();
    await revokeHandler(req, res);
    expect(res._status).toBe(200);
  });
});

// ============================================================================
// GET /oauth/.well-known/openid-configuration
// ============================================================================

describe('handleOpenIDConfiguration', () => {
  it('returns the provider-supplied discovery document', async () => {
    const provider = createMockProvider();
    const routes = getOAuthRouteDefinitions({ provider });
    const handler = findRoute(routes, 'get', '/oauth/.well-known/openid-configuration').handler;

    const req = createMockRequest();
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual(SAMPLE_OIDC_CONFIG);
  });

  it('returns 500 if the provider throws while building the config', async () => {
    const provider = createMockProvider({
      getOpenIDConfiguration: vi.fn().mockImplementation(() => {
        throw new Error('config unavailable');
      }),
    });
    const routes = getOAuthRouteDefinitions({ provider });
    const handler = findRoute(routes, 'get', '/oauth/.well-known/openid-configuration').handler;

    const req = createMockRequest();
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(500);
  });
});

// ============================================================================
// CORS preflight
// ============================================================================

describe('OPTIONS handler', () => {
  it('sets CORS headers and returns 204 when enableCors is true', async () => {
    const provider = createMockProvider();
    const routes = getOAuthRouteDefinitions({ provider, enableCors: true });
    const handler = findRoute(routes, 'options', '/oauth/token').handler;

    const req = createMockRequest();
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(204);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('omits CORS headers when enableCors is false', async () => {
    const provider = createMockProvider();
    const routes = getOAuthRouteDefinitions({ provider, enableCors: false });
    const handler = findRoute(routes, 'options', '/oauth/token').handler;

    const req = createMockRequest();
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(204);
    expect(res._headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

// ============================================================================
// validateRedirectUri
// ============================================================================

describe('validateRedirectUri', () => {
  it('allows an exact match', () => {
    expect(validateRedirectUri('https://app.example.com/cb', ['https://app.example.com/cb'])).toBe(true);
  });

  it('allows a wildcard subdomain match', () => {
    expect(
      validateRedirectUri('https://tenant1.example.com/cb', ['https://*.example.com/cb'])
    ).toBe(true);
  });

  it('allows a same-origin path-prefix match', () => {
    expect(
      validateRedirectUri('https://app.example.com/cb/extra', ['https://app.example.com/cb'])
    ).toBe(true);
  });

  it('rejects a URI not in the allow-list', () => {
    expect(validateRedirectUri('https://evil.example.com/cb', ['https://app.example.com/cb'])).toBe(false);
  });

  it('rejects a malformed URI without throwing', () => {
    expect(validateRedirectUri('not-a-uri', ['https://app.example.com/cb'])).toBe(false);
  });

  it('skips malformed entries in the allow-list rather than throwing', () => {
    expect(
      validateRedirectUri('https://app.example.com/cb', ['not-a-uri', 'https://app.example.com/cb'])
    ).toBe(true);
  });
});

// ============================================================================
// PKCE code challenge helpers
// ============================================================================

describe('generateCodeChallenge / verifyCodeChallenge', () => {
  it('returns the verifier unchanged for the "plain" method', async () => {
    const challenge = await generateCodeChallenge('verifier-123', 'plain');
    expect(challenge).toBe('verifier-123');
  });

  it('produces a base64url-encoded SHA-256 digest for "S256"', async () => {
    const challenge = await generateCodeChallenge('verifier-123', 'S256');
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');
    expect(challenge).not.toContain('=');
    expect(challenge.length).toBeGreaterThan(0);
  });

  it('defaults to S256 when no method is given', async () => {
    const withDefault = await generateCodeChallenge('verifier-123');
    const explicit = await generateCodeChallenge('verifier-123', 'S256');
    expect(withDefault).toBe(explicit);
  });

  it('verifies a matching verifier/challenge pair', async () => {
    const challenge = await generateCodeChallenge('correct-verifier', 'S256');
    expect(await verifyCodeChallenge('correct-verifier', challenge, 'S256')).toBe(true);
  });

  it('rejects a non-matching verifier', async () => {
    const challenge = await generateCodeChallenge('correct-verifier', 'S256');
    expect(await verifyCodeChallenge('wrong-verifier', challenge, 'S256')).toBe(false);
  });
});
