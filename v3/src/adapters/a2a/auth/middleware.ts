/**
 * A2A OAuth 2.0 JWT Middleware
 *
 * JWT validation middleware for protecting A2A endpoints.
 * Supports Bearer token authentication, scope validation, and optional auth.
 *
 * @module adapters/a2a/auth/middleware
 * @see https://datatracker.ietf.org/doc/html/rfc6750
 */

import type {
  HttpRequest,
  HttpResponse,
  NextFunction,
  AuthenticatedRequest,
} from '../discovery/routes.js';

import {
  A2A_ERRORS,
  A2A_ERROR_MESSAGES,
  getHttpStatusCode,
} from '../jsonrpc/errors.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Token claims extracted from JWT
 */
export interface TokenClaims {
  /** Subject (user/client ID) */
  readonly sub: string;
  /** Issuer */
  readonly iss?: string;
  /** Audience */
  readonly aud?: string | string[];
  /** Expiration time (Unix timestamp) */
  readonly exp?: number;
  /** Issued at (Unix timestamp) */
  readonly iat?: number;
  /** Not before (Unix timestamp) */
  readonly nbf?: number;
  /** JWT ID */
  readonly jti?: string;
  /** OAuth 2.0 scopes (space-separated or array) */
  readonly scope?: string | string[];
  /** Client ID for client credentials grant */
  readonly client_id?: string;
  /** Additional custom claims */
  readonly [key: string]: unknown;
}

/**
 * JWT verifier interface
 * Allows plugging in different JWT verification implementations
 */
export interface JWTVerifier {
  /**
   * Verify a JWT token and return the claims
   * @throws Error if token is invalid
   */
  verify(token: string): Promise<TokenClaims>;
}

/**
 * Extended request with authentication info
 */
export interface JWTAuthenticatedRequest extends AuthenticatedRequest {
  /** Token claims */
  claims?: TokenClaims;
  /** Parsed scopes from token */
  scopes?: string[];
  /** Raw token (for forwarding) */
  token?: string;
}

/**
 * Middleware options
 */
export interface JWTMiddlewareOptions {
  /** JWT verifier instance */
  readonly verifier: JWTVerifier;
  /** Allow requests without Authorization header (sets user to undefined) */
  readonly optional?: boolean;
  /** Required audience claim */
  readonly audience?: string;
  /** Required issuer claim */
  readonly issuer?: string;
  /** Clock tolerance in seconds for exp/nbf validation */
  readonly clockTolerance?: number;
}

/**
 * Scope requirement options
 */
export interface ScopeOptions {
  /** Require all scopes (AND) vs any scope (OR) */
  readonly requireAll?: boolean;
}

// ============================================================================
// OAuth 2.0 Error Response
// ============================================================================

/**
 * OAuth 2.0 error types as defined in RFC 6749
 */
export type OAuthErrorType =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'invalid_token'
  | 'insufficient_scope';

/**
 * OAuth 2.0 error response
 */
export interface OAuthError {
  readonly error: OAuthErrorType;
  readonly error_description?: string;
  readonly error_uri?: string;
}

/**
 * Create an OAuth 2.0 error response
 */
export function createOAuthError(
  type: OAuthErrorType,
  description?: string,
  uri?: string
): OAuthError {
  const error: OAuthError = { error: type };
  if (description) {
    (error as { error_description?: string }).error_description = description;
  }
  if (uri) {
    (error as { error_uri?: string }).error_uri = uri;
  }
  return error;
}

// ============================================================================
// Token Extraction
// ============================================================================

/**
 * Extract Bearer token from Authorization header
 * @param req HTTP request
 * @returns Token string or null if not present/invalid
 */
export function extractBearerToken(req: HttpRequest): string | null {
  const authHeader = req.header('Authorization');

  if (!authHeader) {
    return null;
  }

  // RFC 6750: Bearer token must be in "Bearer <token>" format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  const token = parts[1];

  // Basic validation: token should not be empty
  if (!token || token.length === 0) {
    return null;
  }

  return token;
}

/**
 * Parse scope string or array into array of scopes
 */
export function parseScopes(scope: string | string[] | undefined): string[] {
  if (!scope) {
    return [];
  }
  if (Array.isArray(scope)) {
    return scope;
  }
  // OAuth 2.0 uses space-separated scopes
  return scope.split(' ').filter((s) => s.length > 0);
}

// ============================================================================
// JWT Middleware
// ============================================================================

/**
 * Create JWT authentication middleware
 *
 * @param options Middleware options
 * @returns Express-compatible middleware function
 *
 * @example
 * ```typescript
 * const authMiddleware = createJWTMiddleware({
 *   verifier: myJWTVerifier,
 *   issuer: 'https://auth.example.com',
 *   audience: 'api://my-api',
 * });
 *
 * app.use('/api', authMiddleware);
 * ```
 */
export function createJWTMiddleware(
  options: JWTMiddlewareOptions
): (req: HttpRequest, res: HttpResponse, next?: NextFunction) => Promise<void> {
  const { verifier, optional = false, audience, issuer, clockTolerance = 0 } = options;

  return async (
    req: HttpRequest,
    res: HttpResponse,
    next?: NextFunction
  ): Promise<void> => {
    const authReq = req as JWTAuthenticatedRequest;

    try {
      // Extract token
      const token = extractBearerToken(req);

      if (!token) {
        if (optional) {
          // Allow request without auth
          authReq.user = undefined;
          authReq.claims = undefined;
          authReq.scopes = [];
          if (next) next();
          return;
        }

        // Return 401 with WWW-Authenticate header (RFC 6750)
        res.setHeader('WWW-Authenticate', 'Bearer realm="a2a"');
        res
          .status(getHttpStatusCode(A2A_ERRORS.AUTHENTICATION_REQUIRED))
          .json(createOAuthError('invalid_request', 'Missing Authorization header'));
        return;
      }

      // Verify token
      let claims: TokenClaims;
      try {
        claims = await verifier.verify(token);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Token verification failed';
        res.setHeader('WWW-Authenticate', `Bearer realm="a2a", error="invalid_token", error_description="${message}"`);
        res
          .status(getHttpStatusCode(A2A_ERRORS.AUTHENTICATION_REQUIRED))
          .json(createOAuthError('invalid_token', message));
        return;
      }

      // Validate expiration
      const now = Math.floor(Date.now() / 1000);
      if (claims.exp !== undefined && claims.exp + clockTolerance < now) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="a2a", error="invalid_token", error_description="Token expired"');
        res
          .status(getHttpStatusCode(A2A_ERRORS.AUTHENTICATION_REQUIRED))
          .json(createOAuthError('invalid_token', 'Token expired'));
        return;
      }

      // Validate not-before
      if (claims.nbf !== undefined && claims.nbf - clockTolerance > now) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="a2a", error="invalid_token", error_description="Token not yet valid"');
        res
          .status(getHttpStatusCode(A2A_ERRORS.AUTHENTICATION_REQUIRED))
          .json(createOAuthError('invalid_token', 'Token not yet valid'));
        return;
      }

      // Validate issuer
      if (issuer && claims.iss !== issuer) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="a2a", error="invalid_token", error_description="Invalid issuer"');
        res
          .status(getHttpStatusCode(A2A_ERRORS.AUTHENTICATION_REQUIRED))
          .json(createOAuthError('invalid_token', 'Invalid issuer'));
        return;
      }

      // Validate audience
      if (audience) {
        const tokenAudience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        if (!tokenAudience.includes(audience)) {
          res.setHeader('WWW-Authenticate', 'Bearer realm="a2a", error="invalid_token", error_description="Invalid audience"');
          res
            .status(getHttpStatusCode(A2A_ERRORS.AUTHENTICATION_REQUIRED))
            .json(createOAuthError('invalid_token', 'Invalid audience'));
          return;
        }
      }

      // Parse scopes
      const scopes = parseScopes(claims.scope);

      // Attach to request
      authReq.token = token;
      authReq.claims = claims;
      authReq.scopes = scopes;
      authReq.user = {
        id: claims.sub,
        scopes,
      };

      if (next) next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication error';
      res
        .status(500)
        .json({
          error: {
            code: A2A_ERRORS.AUTHENTICATION_REQUIRED,
            message: A2A_ERROR_MESSAGES[A2A_ERRORS.AUTHENTICATION_REQUIRED],
            data: { details: message },
          },
        });
    }
  };
}

/**
 * Shorthand factory for JWT auth middleware
 */
export function jwtAuthMiddleware(
  options: JWTMiddlewareOptions
): (req: HttpRequest, res: HttpResponse, next?: NextFunction) => Promise<void> {
  return createJWTMiddleware(options);
}

// ============================================================================
// Scope Validation Middleware
// ============================================================================

/**
 * Create scope validation middleware
 *
 * Must be used after JWT authentication middleware
 *
 * @param requiredScopes Scopes to require
 * @param options Scope options
 * @returns Express-compatible middleware function
 *
 * @example
 * ```typescript
 * // Require all scopes
 * app.post('/tasks', authMiddleware, requireScopes('tasks:write', 'tasks:read'));
 *
 * // Require any scope
 * app.get('/tasks', authMiddleware, requireScopes('tasks:read', 'tasks:admin', { requireAll: false }));
 * ```
 */
export function requireScopes(
  ...args: [...string[], ScopeOptions] | string[]
): (req: HttpRequest, res: HttpResponse, next?: NextFunction) => void {
  // Parse arguments
  let requiredScopes: string[];
  let options: ScopeOptions = { requireAll: true };

  const lastArg = args[args.length - 1];
  if (typeof lastArg === 'object' && lastArg !== null) {
    options = lastArg as ScopeOptions;
    requiredScopes = args.slice(0, -1) as string[];
  } else {
    requiredScopes = args as string[];
  }

  return (req: HttpRequest, res: HttpResponse, next?: NextFunction): void => {
    const authReq = req as JWTAuthenticatedRequest;

    // Check if authenticated
    if (!authReq.user || !authReq.scopes) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="a2a"');
      res
        .status(getHttpStatusCode(A2A_ERRORS.AUTHENTICATION_REQUIRED))
        .json(createOAuthError('invalid_request', 'Authentication required'));
      return;
    }

    const userScopes = new Set(authReq.scopes);

    // Check scopes
    const hasScopes = options.requireAll
      ? requiredScopes.every((scope) => userScopes.has(scope))
      : requiredScopes.some((scope) => userScopes.has(scope));

    if (!hasScopes) {
      const scopeList = requiredScopes.join(' ');
      res.setHeader('WWW-Authenticate', `Bearer realm="a2a", scope="${scopeList}", error="insufficient_scope"`);
      res
        .status(getHttpStatusCode(A2A_ERRORS.AUTHORIZATION_FAILED))
        .json(createOAuthError('insufficient_scope', `Required scope(s): ${scopeList}`));
      return;
    }

    if (next) next();
  };
}

/**
 * Check if request has a specific scope
 * Utility function for conditional logic in handlers
 */
export function hasScope(req: HttpRequest, scope: string): boolean {
  const authReq = req as JWTAuthenticatedRequest;
  return authReq.scopes?.includes(scope) ?? false;
}

/**
 * Check if request has any of the specified scopes
 */
export function hasAnyScope(req: HttpRequest, scopes: string[]): boolean {
  const authReq = req as JWTAuthenticatedRequest;
  const userScopes = new Set(authReq.scopes ?? []);
  return scopes.some((scope) => userScopes.has(scope));
}

/**
 * Check if request has all of the specified scopes
 */
export function hasAllScopes(req: HttpRequest, scopes: string[]): boolean {
  const authReq = req as JWTAuthenticatedRequest;
  const userScopes = new Set(authReq.scopes ?? []);
  return scopes.every((scope) => userScopes.has(scope));
}

// ============================================================================
// Utility Middleware
// ============================================================================

/**
 * Create optional authentication middleware
 * Same as jwtAuthMiddleware with optional: true
 */
export function optionalAuth(
  options: Omit<JWTMiddlewareOptions, 'optional'>
): (req: HttpRequest, res: HttpResponse, next?: NextFunction) => Promise<void> {
  return createJWTMiddleware({ ...options, optional: true });
}

/**
 * No-op authentication middleware for testing/development
 * Sets a mock user on the request
 */
export function mockAuthMiddleware(
  mockUser?: { id: string; scopes?: string[] }
): (req: HttpRequest, res: HttpResponse, next?: NextFunction) => void {
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
    throw new Error(
      `mockAuthMiddleware is only available in test/development environments (current: ${process.env.NODE_ENV ?? 'undefined'})`
    );
  }

  const user = mockUser ?? { id: 'mock-user', scopes: ['*'] };

  return (req: HttpRequest, _res: HttpResponse, next?: NextFunction): void => {
    const authReq = req as JWTAuthenticatedRequest;
    authReq.user = user;
    authReq.scopes = user.scopes ?? [];
    authReq.claims = {
      sub: user.id,
      scope: user.scopes?.join(' '),
    };
    if (next) next();
  };
}
