/**
 * A2A OAuth 2.0 Endpoint Routes
 *
 * Implements OAuth 2.0 authorization server endpoints for A2A authentication.
 * Supports authorization_code, client_credentials, and refresh_token grants.
 *
 * Endpoints:
 * - POST /oauth/token - Token exchange
 * - GET /oauth/authorize - Authorization redirect (for authorization_code flow)
 * - POST /oauth/revoke - Token revocation
 * - GET /oauth/.well-known/openid-configuration - OpenID Connect discovery
 *
 * @module adapters/a2a/auth/routes
 * @see https://datatracker.ietf.org/doc/html/rfc6749
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html
 */

import type { HttpRequest, HttpResponse, NextFunction } from '../discovery/routes.js';
import { createOAuthError, type OAuthError, type OAuthErrorType } from './middleware.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported OAuth 2.0 grant types
 */
export type GrantType = 'authorization_code' | 'refresh_token' | 'client_credentials';

/**
 * Token request body
 */
export interface TokenRequest {
  /** OAuth 2.0 grant type */
  readonly grant_type: GrantType;
  /** Authorization code (for authorization_code grant) */
  readonly code?: string;
  /** Refresh token (for refresh_token grant) */
  readonly refresh_token?: string;
  /** Client ID */
  readonly client_id: string;
  /** Client secret (optional for public clients) */
  readonly client_secret?: string;
  /** Requested scope (space-separated) */
  readonly scope?: string;
  /** Redirect URI (for authorization_code grant) */
  readonly redirect_uri?: string;
  /** PKCE code verifier */
  readonly code_verifier?: string;
}

/**
 * Token response
 */
export interface TokenResponse {
  /** Access token */
  readonly access_token: string;
  /** Token type (always "Bearer") */
  readonly token_type: 'Bearer';
  /** Token expiration in seconds */
  readonly expires_in: number;
  /** Refresh token (if issued) */
  readonly refresh_token?: string;
  /** Granted scope (space-separated) */
  readonly scope?: string;
  /** ID token (if OpenID Connect) */
  readonly id_token?: string;
}

/**
 * Authorization request query parameters
 */
export interface AuthorizationRequest {
  /** Response type (code, token, or id_token) */
  readonly response_type: 'code' | 'token' | 'id_token' | 'code id_token' | 'code token' | 'token id_token' | 'code token id_token';
  /** Client ID */
  readonly client_id: string;
  /** Redirect URI */
  readonly redirect_uri: string;
  /** Requested scope (space-separated) */
  readonly scope?: string;
  /** State parameter (CSRF protection) */
  readonly state?: string;
  /** Nonce (for OpenID Connect) */
  readonly nonce?: string;
  /** PKCE code challenge */
  readonly code_challenge?: string;
  /** PKCE code challenge method */
  readonly code_challenge_method?: 'plain' | 'S256';
  /** Login hint */
  readonly login_hint?: string;
  /** Prompt behavior */
  readonly prompt?: 'none' | 'login' | 'consent' | 'select_account';
}

/**
 * Token revocation request
 */
export interface RevokeRequest {
  /** Token to revoke */
  readonly token: string;
  /** Token type hint (access_token or refresh_token) */
  readonly token_type_hint?: 'access_token' | 'refresh_token';
  /** Client ID */
  readonly client_id?: string;
  /** Client secret */
  readonly client_secret?: string;
}

/**
 * OpenID Connect discovery document
 */
export interface OpenIDConfiguration {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly revocation_endpoint: string;
  readonly jwks_uri: string;
  readonly response_types_supported: string[];
  readonly grant_types_supported: string[];
  readonly subject_types_supported: string[];
  readonly id_token_signing_alg_values_supported: string[];
  readonly scopes_supported: string[];
  readonly token_endpoint_auth_methods_supported: string[];
  readonly claims_supported: string[];
  readonly code_challenge_methods_supported: string[];
}

/**
 * OAuth 2.0 provider interface
 * Implement this to integrate with your authentication system
 */
export interface OAuth2Provider {
  /** Validate client credentials */
  validateClient(clientId: string, clientSecret?: string): Promise<boolean>;

  /** Exchange authorization code for tokens */
  exchangeAuthorizationCode(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<TokenResponse>;

  /** Exchange client credentials for tokens */
  exchangeClientCredentials(
    clientId: string,
    clientSecret: string,
    scope?: string
  ): Promise<TokenResponse>;

  /** Refresh an access token */
  refreshToken(refreshToken: string, clientId: string): Promise<TokenResponse>;

  /** Revoke a token */
  revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<void>;

  /** Generate authorization code (for authorization endpoint) */
  generateAuthorizationCode?(
    clientId: string,
    redirectUri: string,
    scope: string,
    state?: string,
    codeChallenge?: string,
    codeChallengeMethod?: 'plain' | 'S256'
  ): Promise<{ code: string; expiresIn: number }>;

  /** Get OpenID configuration */
  getOpenIDConfiguration(): OpenIDConfiguration;
}

/**
 * Route definition for router setup
 */
export interface OAuthRouteDefinition {
  readonly method: 'get' | 'post' | 'options';
  readonly path: string;
  readonly handler: (req: HttpRequest, res: HttpResponse, next?: NextFunction) => Promise<void>;
}

/**
 * OAuth routes configuration
 */
export interface OAuthRoutesConfig {
  /** OAuth 2.0 provider implementation */
  readonly provider: OAuth2Provider;
  /** Base path for routes (default: /oauth) */
  readonly basePath?: string;
  /** Enable CORS headers */
  readonly enableCors?: boolean;
  /** Login page URL for authorization redirect */
  readonly loginPageUrl?: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default OAuth routes configuration
 */
export const DEFAULT_OAUTH_ROUTES_CONFIG = {
  basePath: '/oauth',
  enableCors: true,
  loginPageUrl: '/login',
} as const;

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Send OAuth error response
 */
function sendOAuthError(
  res: HttpResponse,
  status: number,
  error: OAuthErrorType,
  description?: string
): void {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.status(status).json(createOAuthError(error, description));
}

/**
 * Parse form-urlencoded body
 */
function parseFormBody(body: string | Record<string, unknown>): Record<string, string> {
  if (typeof body === 'object') {
    // Already parsed as JSON
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        result[key] = value;
      } else if (value !== undefined && value !== null) {
        result[key] = String(value);
      }
    }
    return result;
  }

  // Parse x-www-form-urlencoded
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Create OAuth route handlers
 */
function createOAuthHandlers(config: Required<OAuthRoutesConfig>) {
  const { provider, enableCors, loginPageUrl } = config;

  /**
   * Set common response headers
   */
  function setCommonHeaders(res: HttpResponse): void {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    if (enableCors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
  }

  return {
    /**
     * POST /oauth/token - Token endpoint
     *
     * Handles all grant types:
     * - authorization_code: Exchange auth code for tokens
     * - client_credentials: Service-to-service auth
     * - refresh_token: Refresh access token
     */
    async handleToken(
      req: HttpRequest & { body?: string | Record<string, unknown> },
      res: HttpResponse
    ): Promise<void> {
      setCommonHeaders(res);
      res.setHeader('Content-Type', 'application/json');

      try {
        // Parse request body
        const body = parseFormBody(req.body ?? {});
        const {
          grant_type,
          code,
          refresh_token,
          client_id,
          client_secret,
          scope,
          redirect_uri,
          code_verifier,
        } = body as unknown as TokenRequest;

        // Validate required fields
        if (!grant_type) {
          sendOAuthError(res, 400, 'invalid_request', 'Missing grant_type parameter');
          return;
        }

        if (!client_id) {
          sendOAuthError(res, 400, 'invalid_request', 'Missing client_id parameter');
          return;
        }

        // Validate client
        const validClient = await provider.validateClient(client_id, client_secret);
        if (!validClient) {
          sendOAuthError(res, 401, 'invalid_client', 'Client authentication failed');
          return;
        }

        let tokenResponse: TokenResponse;

        switch (grant_type) {
          case 'authorization_code': {
            if (!code) {
              sendOAuthError(res, 400, 'invalid_request', 'Missing code parameter');
              return;
            }
            if (!redirect_uri) {
              sendOAuthError(res, 400, 'invalid_request', 'Missing redirect_uri parameter');
              return;
            }

            try {
              tokenResponse = await provider.exchangeAuthorizationCode(
                code,
                client_id,
                redirect_uri,
                code_verifier
              );
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Invalid authorization code';
              sendOAuthError(res, 400, 'invalid_grant', message);
              return;
            }
            break;
          }

          case 'client_credentials': {
            if (!client_secret) {
              sendOAuthError(res, 400, 'invalid_request', 'Missing client_secret for client_credentials grant');
              return;
            }

            try {
              tokenResponse = await provider.exchangeClientCredentials(
                client_id,
                client_secret,
                scope
              );
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Client credentials exchange failed';
              sendOAuthError(res, 400, 'invalid_grant', message);
              return;
            }
            break;
          }

          case 'refresh_token': {
            if (!refresh_token) {
              sendOAuthError(res, 400, 'invalid_request', 'Missing refresh_token parameter');
              return;
            }

            try {
              tokenResponse = await provider.refreshToken(refresh_token, client_id);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Invalid refresh token';
              sendOAuthError(res, 400, 'invalid_grant', message);
              return;
            }
            break;
          }

          default:
            sendOAuthError(res, 400, 'unsupported_grant_type', `Unsupported grant type: ${grant_type}`);
            return;
        }

        res.status(200).json(tokenResponse);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Token endpoint error';
        sendOAuthError(res, 500, 'invalid_request', message);
      }
    },

    /**
     * GET /oauth/authorize - Authorization endpoint
     *
     * Initiates the authorization code flow.
     * Redirects to login page with parameters.
     */
    async handleAuthorize(req: HttpRequest, res: HttpResponse): Promise<void> {
      setCommonHeaders(res);

      try {
        const {
          response_type,
          client_id,
          redirect_uri,
          scope,
          state,
          code_challenge,
          code_challenge_method,
        } = req.query as unknown as AuthorizationRequest;

        // Validate required parameters
        if (!response_type) {
          sendOAuthError(res, 400, 'invalid_request', 'Missing response_type parameter');
          return;
        }

        if (!client_id) {
          sendOAuthError(res, 400, 'invalid_request', 'Missing client_id parameter');
          return;
        }

        if (!redirect_uri) {
          sendOAuthError(res, 400, 'invalid_request', 'Missing redirect_uri parameter');
          return;
        }

        // Validate client
        const validClient = await provider.validateClient(client_id);
        if (!validClient) {
          sendOAuthError(res, 400, 'unauthorized_client', 'Unknown client_id');
          return;
        }

        // Only support 'code' response type for now
        if (response_type !== 'code') {
          sendOAuthError(res, 400, 'unsupported_grant_type', 'Only response_type=code is supported');
          return;
        }

        // Build login page redirect URL
        const loginUrl = new URL(loginPageUrl, 'http://localhost');
        loginUrl.searchParams.set('client_id', client_id);
        loginUrl.searchParams.set('redirect_uri', redirect_uri);
        if (scope) loginUrl.searchParams.set('scope', scope);
        if (state) loginUrl.searchParams.set('state', state);
        if (code_challenge) loginUrl.searchParams.set('code_challenge', code_challenge);
        if (code_challenge_method) loginUrl.searchParams.set('code_challenge_method', code_challenge_method);

        // Redirect to login page
        res.setHeader('Location', loginUrl.pathname + loginUrl.search);
        res.status(302).end();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Authorization error';
        sendOAuthError(res, 500, 'invalid_request', message);
      }
    },

    /**
     * POST /oauth/revoke - Token revocation endpoint
     *
     * Revokes access tokens or refresh tokens.
     * Always returns 200 OK (even for invalid tokens) per RFC 7009.
     */
    async handleRevoke(
      req: HttpRequest & { body?: string | Record<string, unknown> },
      res: HttpResponse
    ): Promise<void> {
      setCommonHeaders(res);

      try {
        const body = parseFormBody(req.body ?? {});
        const { token, token_type_hint, client_id, client_secret } = body as unknown as RevokeRequest;

        if (!token) {
          sendOAuthError(res, 400, 'invalid_request', 'Missing token parameter');
          return;
        }

        // Validate client if provided
        if (client_id) {
          const validClient = await provider.validateClient(client_id, client_secret);
          if (!validClient) {
            sendOAuthError(res, 401, 'invalid_client', 'Client authentication failed');
            return;
          }
        }

        // Revoke the token
        await provider.revokeToken(token, token_type_hint);

        // RFC 7009: Always return 200 OK
        res.status(200).end();
      } catch (error) {
        // Even on error, return 200 per RFC 7009
        res.status(200).end();
      }
    },

    /**
     * GET /oauth/.well-known/openid-configuration - OpenID Connect discovery
     *
     * Returns the OpenID Connect discovery document.
     */
    async handleOpenIDConfiguration(_req: HttpRequest, res: HttpResponse): Promise<void> {
      setCommonHeaders(res);
      res.setHeader('Content-Type', 'application/json');

      try {
        const config = provider.getOpenIDConfiguration();
        res.status(200).json(config);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Configuration error';
        sendOAuthError(res, 500, 'invalid_request', message);
      }
    },

    /**
     * OPTIONS handler for CORS preflight
     */
    handleOptions(_req: HttpRequest, res: HttpResponse): void {
      if (enableCors) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
      res.status(204).end();
    },
  };
}

// ============================================================================
// Route Factory
// ============================================================================

/**
 * Get OAuth route definitions
 *
 * Returns an array of route definitions that can be used to setup routes
 * in Express or any compatible HTTP framework.
 *
 * @param config OAuth routes configuration
 * @returns Array of route definitions
 *
 * @example
 * ```typescript
 * const routeDefs = getOAuthRouteDefinitions({
 *   provider: myOAuthProvider,
 * });
 *
 * // Setup in custom router
 * for (const route of routeDefs) {
 *   router.add(route.method, route.path, route.handler);
 * }
 * ```
 */
export function getOAuthRouteDefinitions(config: OAuthRoutesConfig): OAuthRouteDefinition[] {
  const fullConfig: Required<OAuthRoutesConfig> = {
    ...DEFAULT_OAUTH_ROUTES_CONFIG,
    ...config,
  };

  const { basePath } = fullConfig;
  const handlers = createOAuthHandlers(fullConfig);

  return [
    // CORS preflight
    {
      method: 'options',
      path: `${basePath}/token`,
      handler: async (req, res) => handlers.handleOptions(req, res),
    },
    {
      method: 'options',
      path: `${basePath}/authorize`,
      handler: async (req, res) => handlers.handleOptions(req, res),
    },
    {
      method: 'options',
      path: `${basePath}/revoke`,
      handler: async (req, res) => handlers.handleOptions(req, res),
    },
    {
      method: 'options',
      path: `${basePath}/.well-known/openid-configuration`,
      handler: async (req, res) => handlers.handleOptions(req, res),
    },

    // Token endpoint
    {
      method: 'post',
      path: `${basePath}/token`,
      handler: handlers.handleToken.bind(handlers),
    },

    // Authorization endpoint
    {
      method: 'get',
      path: `${basePath}/authorize`,
      handler: handlers.handleAuthorize.bind(handlers),
    },

    // Revocation endpoint
    {
      method: 'post',
      path: `${basePath}/revoke`,
      handler: handlers.handleRevoke.bind(handlers),
    },

    // OpenID Connect discovery
    {
      method: 'get',
      path: `${basePath}/.well-known/openid-configuration`,
      handler: handlers.handleOpenIDConfiguration.bind(handlers),
    },
  ];
}

/**
 * Create OAuth routes for Express
 *
 * NOTE: This function requires Express to be installed separately.
 * If Express is not available, use getOAuthRouteDefinitions() instead.
 *
 * @param config OAuth routes configuration
 * @returns Express router
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createOAuthRoutes } from '@agentic-qe/v3';
 *
 * const app = express();
 * const oauthRouter = createOAuthRoutes({
 *   provider: myOAuthProvider,
 * });
 *
 * app.use(oauthRouter);
 * ```
 */
export function createOAuthRoutes(
  config: OAuthRoutesConfig
): { stack: Array<{ route?: { path?: string } }> } & Record<string, unknown> {
  // Dynamically import express
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express');
  const router = express.Router();

  // Add body parsing middleware
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  const routeDefs = getOAuthRouteDefinitions(config);

  for (const route of routeDefs) {
    router[route.method](route.path, route.handler);
  }

  return router;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate redirect URI against allowed URIs
 *
 * @param uri URI to validate
 * @param allowedUris List of allowed URIs (supports wildcards)
 * @returns True if URI is allowed
 */
export function validateRedirectUri(uri: string, allowedUris: string[]): boolean {
  try {
    const parsed = new URL(uri);

    for (const allowed of allowedUris) {
      // Exact match
      if (allowed === uri) {
        return true;
      }

      // Wildcard match (e.g., "https://*.example.com/callback")
      if (allowed.includes('*')) {
        const pattern = allowed
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(uri)) {
          return true;
        }
      }

      // Same origin match
      try {
        const allowedParsed = new URL(allowed);
        if (
          parsed.protocol === allowedParsed.protocol &&
          parsed.host === allowedParsed.host &&
          parsed.pathname.startsWith(allowedParsed.pathname)
        ) {
          return true;
        }
      } catch {
        // Invalid allowed URI, skip
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Generate PKCE code challenge from verifier
 *
 * @param verifier Code verifier string
 * @param method Challenge method (plain or S256)
 * @returns Code challenge
 */
export async function generateCodeChallenge(
  verifier: string,
  method: 'plain' | 'S256' = 'S256'
): Promise<string> {
  if (method === 'plain') {
    return verifier;
  }

  // S256: BASE64URL(SHA256(verifier))
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hash);

  // Base64URL encode - convert Uint8Array to string manually
  let binary = '';
  for (let i = 0; i < hashArray.length; i++) {
    binary += String.fromCharCode(hashArray[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify PKCE code challenge
 *
 * @param verifier Code verifier from token request
 * @param challenge Original code challenge from authorization
 * @param method Challenge method
 * @returns True if verification passes
 */
export async function verifyCodeChallenge(
  verifier: string,
  challenge: string,
  method: 'plain' | 'S256' = 'S256'
): Promise<boolean> {
  const computed = await generateCodeChallenge(verifier, method);
  return computed === challenge;
}
