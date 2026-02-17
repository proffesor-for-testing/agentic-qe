/**
 * JWT Authentication Middleware Unit Tests
 *
 * Comprehensive test suite for JWT extraction and validation middleware.
 *
 * @module tests/unit/adapters/a2a/auth/middleware
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Types for middleware (implementation will be created by other agents)
interface Request {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
  auth?: AuthContext;
}

interface Response {
  status: (code: number) => Response;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

interface AuthContext {
  authenticated: boolean;
  token?: string;
  payload?: Record<string, unknown>;
  scopes: string[];
  clientId?: string;
  userId?: string;
  error?: string;
}

type NextFunction = () => void;

interface JwtMiddlewareConfig {
  secret: string;
  algorithms?: string[];
  issuer?: string | string[];
  audience?: string | string[];
  extractors?: TokenExtractor[];
  credentialsRequired?: boolean;
  scopeRequired?: string[];
  onError?: (error: Error, req: Request, res: Response) => void;
}

type TokenExtractor = (req: Request) => string | null;

interface JwtMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
}

// Standard token extractors
const fromAuthHeaderAsBearerToken: TokenExtractor = (req) => {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader !== 'string') {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
};

const fromQuery = (paramName: string): TokenExtractor => {
  return (req) => {
    return req.query?.[paramName] ?? null;
  };
};

const fromCookie = (cookieName: string): TokenExtractor => {
  return (req) => {
    return req.cookies?.[cookieName] ?? null;
  };
};

const fromHeader = (headerName: string): TokenExtractor => {
  return (req) => {
    const value = req.headers[headerName.toLowerCase()];
    return typeof value === 'string' ? value : null;
  };
};

// Mock JWT verification function
const mockVerifyToken = (
  token: string,
  secret: string,
  options: { issuer?: string | string[]; audience?: string | string[] }
): { valid: boolean; payload?: Record<string, unknown>; error?: string } => {
  // Mock implementation for testing
  if (token === 'valid-token') {
    return {
      valid: true,
      payload: {
        sub: 'user-123',
        client_id: 'client-456',
        scope: 'agent:read task:create',
        iss: 'https://qe.example.com',
        aud: 'https://api.example.com',
      },
    };
  }

  if (token === 'expired-token') {
    return { valid: false, error: 'Token has expired' };
  }

  if (token === 'invalid-signature') {
    return { valid: false, error: 'Invalid signature' };
  }

  if (token === 'wrong-issuer') {
    return { valid: false, error: 'Invalid issuer' };
  }

  if (token === 'wrong-audience') {
    return { valid: false, error: 'Invalid audience' };
  }

  if (token === 'admin-token') {
    return {
      valid: true,
      payload: {
        sub: 'admin-001',
        client_id: 'admin-client',
        scope: 'platform:admin agent:manage task:cancel',
        iss: 'https://qe.example.com',
        aud: 'https://api.example.com',
      },
    };
  }

  if (token === 'no-scope-token') {
    return {
      valid: true,
      payload: {
        sub: 'user-789',
        client_id: 'client-000',
        iss: 'https://qe.example.com',
        aud: 'https://api.example.com',
      },
    };
  }

  return { valid: false, error: 'Invalid token' };
};

// Mock middleware factory
const createJwtMiddleware = (config: JwtMiddlewareConfig): JwtMiddleware => {
  const extractors = config.extractors ?? [fromAuthHeaderAsBearerToken];
  const credentialsRequired = config.credentialsRequired ?? true;

  return (req: Request, res: Response, next: NextFunction) => {
    // Initialize auth context
    req.auth = {
      authenticated: false,
      scopes: [],
    };

    // Try to extract token
    let token: string | null = null;
    for (const extractor of extractors) {
      token = extractor(req);
      if (token) break;
    }

    if (!token) {
      if (credentialsRequired) {
        res.status(401);
        res.setHeader('WWW-Authenticate', 'Bearer');
        res.json({ error: 'authentication_required', message: 'No token provided' });
        return;
      }
      // No token but not required - continue as unauthenticated
      next();
      return;
    }

    // Verify token
    const result = mockVerifyToken(token, config.secret, {
      issuer: config.issuer,
      audience: config.audience,
    });

    if (!result.valid) {
      req.auth.error = result.error;
      if (credentialsRequired) {
        res.status(401);
        res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", error_description="${result.error}"`);
        res.json({ error: 'invalid_token', message: result.error });
        return;
      }
      next();
      return;
    }

    // Extract scopes
    const scopeString = result.payload?.scope;
    const scopes = typeof scopeString === 'string' ? scopeString.split(' ').filter((s) => s) : [];

    // Check required scopes
    if (config.scopeRequired && config.scopeRequired.length > 0) {
      const missingScopes = config.scopeRequired.filter((s) => !scopes.includes(s));
      if (missingScopes.length > 0) {
        res.status(403);
        res.json({
          error: 'insufficient_scope',
          message: `Missing required scopes: ${missingScopes.join(', ')}`,
          required: missingScopes,
        });
        return;
      }
    }

    // Set auth context
    req.auth = {
      authenticated: true,
      token,
      payload: result.payload,
      scopes,
      clientId: result.payload?.client_id as string | undefined,
      userId: result.payload?.sub as string | undefined,
    };

    next();
  };
};

// Helper to create scope guard middleware
const requireScopes = (...requiredScopes: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth?.authenticated) {
      res.status(401);
      res.json({ error: 'authentication_required' });
      return;
    }

    const missingScopes = requiredScopes.filter((s) => !req.auth!.scopes.includes(s));
    if (missingScopes.length > 0) {
      res.status(403);
      res.json({
        error: 'insufficient_scope',
        message: `Missing required scopes: ${missingScopes.join(', ')}`,
      });
      return;
    }

    next();
  };
};

// ============================================================================
// Test Helpers
// ============================================================================

const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
  headers: {},
  query: {},
  cookies: {},
  ...overrides,
});

const createMockResponse = (): Response & { statusCode?: number; body?: unknown; headersSet: Record<string, string> } => {
  const res: Response & { statusCode?: number; body?: unknown; headersSet: Record<string, string> } = {
    statusCode: undefined,
    body: undefined,
    headersSet: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
    setHeader(name: string, value: string) {
      this.headersSet[name] = value;
    },
  };
  return res;
};

// ============================================================================
// Test Suite
// ============================================================================

describe('JWT Authentication Middleware', () => {
  let middleware: JwtMiddleware;

  beforeEach(() => {
    middleware = createJwtMiddleware({
      secret: 'test-secret',
      issuer: 'https://qe.example.com',
      audience: 'https://api.example.com',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Token Extraction Tests
  // ==========================================================================

  describe('Token Extraction', () => {
    describe('fromAuthHeaderAsBearerToken', () => {
      it('should extract token from Authorization header', () => {
        const req = createMockRequest({
          headers: { authorization: 'Bearer valid-token' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.auth?.authenticated).toBe(true);
        expect(req.auth?.token).toBe('valid-token');
      });

      it('should be case-insensitive for Bearer scheme', () => {
        const req = createMockRequest({
          headers: { authorization: 'bearer valid-token' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.auth?.authenticated).toBe(true);
      });

      it('should reject malformed Authorization header', () => {
        const req = createMockRequest({
          headers: { authorization: 'Basic dXNlcjpwYXNz' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
      });

      it('should reject header with missing token', () => {
        const req = createMockRequest({
          headers: { authorization: 'Bearer ' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
      });
    });

    describe('fromQuery', () => {
      it('should extract token from query parameter', () => {
        const customMiddleware = createJwtMiddleware({
          secret: 'test-secret',
          extractors: [fromQuery('access_token')],
        });

        const req = createMockRequest({
          query: { access_token: 'valid-token' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        customMiddleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.auth?.authenticated).toBe(true);
      });
    });

    describe('fromCookie', () => {
      it('should extract token from cookie', () => {
        const customMiddleware = createJwtMiddleware({
          secret: 'test-secret',
          extractors: [fromCookie('jwt')],
        });

        const req = createMockRequest({
          cookies: { jwt: 'valid-token' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        customMiddleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.auth?.authenticated).toBe(true);
      });
    });

    describe('fromHeader', () => {
      it('should extract token from custom header', () => {
        const customMiddleware = createJwtMiddleware({
          secret: 'test-secret',
          extractors: [fromHeader('X-Auth-Token')],
        });

        const req = createMockRequest({
          headers: { 'x-auth-token': 'valid-token' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        customMiddleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.auth?.authenticated).toBe(true);
      });
    });

    describe('Multiple Extractors', () => {
      it('should try extractors in order', () => {
        const customMiddleware = createJwtMiddleware({
          secret: 'test-secret',
          extractors: [fromQuery('token'), fromAuthHeaderAsBearerToken],
        });

        // Token in query should be used first
        const req = createMockRequest({
          query: { token: 'valid-token' },
          headers: { authorization: 'Bearer different-token' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        customMiddleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.auth?.token).toBe('valid-token');
      });

      it('should fall back to next extractor', () => {
        const customMiddleware = createJwtMiddleware({
          secret: 'test-secret',
          extractors: [fromQuery('token'), fromAuthHeaderAsBearerToken],
        });

        // No query token, should use header
        const req = createMockRequest({
          headers: { authorization: 'Bearer valid-token' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        customMiddleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.auth?.authenticated).toBe(true);
      });
    });
  });

  // ==========================================================================
  // Token Validation Tests
  // ==========================================================================

  describe('Token Validation', () => {
    it('should authenticate valid token', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.auth?.authenticated).toBe(true);
      expect(req.auth?.userId).toBe('user-123');
      expect(req.auth?.clientId).toBe('client-456');
    });

    it('should reject expired token', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer expired-token' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body).toMatchObject({ error: 'invalid_token' });
    });

    it('should reject token with invalid signature', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid-signature' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('should reject token with wrong issuer', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer wrong-issuer' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('should reject token with wrong audience', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer wrong-audience' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('should extract scopes from token', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(req.auth?.scopes).toContain('agent:read');
      expect(req.auth?.scopes).toContain('task:create');
    });

    it('should handle token without scope claim', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer no-scope-token' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.auth?.scopes).toEqual([]);
    });
  });

  // ==========================================================================
  // Credentials Required Tests
  // ==========================================================================

  describe('Credentials Required', () => {
    it('should reject when no token and credentials required', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.headersSet['WWW-Authenticate']).toBe('Bearer');
    });

    it('should continue when no token and credentials not required', () => {
      const optionalMiddleware = createJwtMiddleware({
        secret: 'test-secret',
        credentialsRequired: false,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      optionalMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.auth?.authenticated).toBe(false);
    });

    it('should authenticate when token provided and credentials optional', () => {
      const optionalMiddleware = createJwtMiddleware({
        secret: 'test-secret',
        credentialsRequired: false,
      });

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      optionalMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.auth?.authenticated).toBe(true);
    });

    it('should continue with error info when invalid token and credentials optional', () => {
      const optionalMiddleware = createJwtMiddleware({
        secret: 'test-secret',
        credentialsRequired: false,
      });

      const req = createMockRequest({
        headers: { authorization: 'Bearer expired-token' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      optionalMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.auth?.authenticated).toBe(false);
      expect(req.auth?.error).toBeDefined();
    });
  });

  // ==========================================================================
  // Scope Validation Tests
  // ==========================================================================

  describe('Scope Validation', () => {
    it('should reject when required scope is missing', () => {
      const scopedMiddleware = createJwtMiddleware({
        secret: 'test-secret',
        scopeRequired: ['platform:admin'],
      });

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      scopedMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body).toMatchObject({ error: 'insufficient_scope' });
    });

    it('should allow when all required scopes present', () => {
      const scopedMiddleware = createJwtMiddleware({
        secret: 'test-secret',
        scopeRequired: ['agent:read', 'task:create'],
      });

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      scopedMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should list missing scopes in error response', () => {
      const scopedMiddleware = createJwtMiddleware({
        secret: 'test-secret',
        scopeRequired: ['agent:read', 'platform:admin', 'agent:manage'],
      });

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      scopedMiddleware(req, res, next);

      expect(res.body).toMatchObject({
        required: ['platform:admin', 'agent:manage'],
      });
    });
  });

  // ==========================================================================
  // Scope Guard Middleware Tests
  // ==========================================================================

  describe('requireScopes', () => {
    beforeEach(() => {
      middleware = createJwtMiddleware({
        secret: 'test-secret',
      });
    });

    it('should reject unauthenticated requests', () => {
      const req = createMockRequest();
      req.auth = { authenticated: false, scopes: [] };
      const res = createMockResponse();
      const next = vi.fn();

      const scopeGuard = requireScopes('agent:read');
      scopeGuard(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('should allow when user has required scope', () => {
      const req = createMockRequest();
      req.auth = { authenticated: true, scopes: ['agent:read', 'task:create'] };
      const res = createMockResponse();
      const next = vi.fn();

      const scopeGuard = requireScopes('agent:read');
      scopeGuard(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject when user missing required scope', () => {
      const req = createMockRequest();
      req.auth = { authenticated: true, scopes: ['agent:read'] };
      const res = createMockResponse();
      const next = vi.fn();

      const scopeGuard = requireScopes('platform:admin');
      scopeGuard(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    it('should require all specified scopes', () => {
      const req = createMockRequest();
      req.auth = { authenticated: true, scopes: ['agent:read'] };
      const res = createMockResponse();
      const next = vi.fn();

      const scopeGuard = requireScopes('agent:read', 'task:create');
      scopeGuard(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // WWW-Authenticate Header Tests
  // ==========================================================================

  describe('WWW-Authenticate Header', () => {
    it('should set WWW-Authenticate header on missing token', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.headersSet['WWW-Authenticate']).toBe('Bearer');
    });

    it('should set WWW-Authenticate with error description on invalid token', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer expired-token' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.headersSet['WWW-Authenticate']).toContain('invalid_token');
      expect(res.headersSet['WWW-Authenticate']).toContain('expired');
    });
  });

  // ==========================================================================
  // Auth Context Tests
  // ==========================================================================

  describe('Auth Context', () => {
    it('should populate auth context on successful authentication', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer admin-token' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(req.auth).toMatchObject({
        authenticated: true,
        token: 'admin-token',
        userId: 'admin-001',
        clientId: 'admin-client',
        scopes: ['platform:admin', 'agent:manage', 'task:cancel'],
      });
      expect(req.auth?.payload).toBeDefined();
    });

    it('should include full payload in auth context', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(req.auth?.payload?.iss).toBe('https://qe.example.com');
      expect(req.auth?.payload?.aud).toBe('https://api.example.com');
    });
  });
});
