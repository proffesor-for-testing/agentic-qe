/**
 * A2A OAuth 2.0 Provider
 *
 * Implements OAuth 2.0 authorization server functionality including:
 * - Authorization Code Flow (with PKCE support)
 * - Client Credentials Flow
 * - Token refresh
 * - Token revocation
 *
 * @module adapters/a2a/auth/oauth-provider
 * @see https://datatracker.ietf.org/doc/html/rfc6749
 * @see https://datatracker.ietf.org/doc/html/rfc7636 (PKCE)
 */

import { createHash, timingSafeEqual } from 'crypto';
import { TokenStore, createTokenStore, type TokenStoreConfig } from './token-store.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyJWT,
  decodeJWT,
  JWTError,
  type JWTPayload,
} from './jwt-utils.js';
import {
  validateScopes,
  expandScopes,
  normalizeScopes,
  DEFAULT_CLIENT_SCOPES,
  type A2AScope,
} from './scopes.js';

// ============================================================================
// OAuth 2.0 Types
// ============================================================================

/**
 * Client credentials for OAuth 2.0 clients
 */
export interface ClientCredentials {
  /** Client secret (hashed) */
  readonly clientSecret: string;

  /** Whether secret is hashed */
  readonly secretHashed?: boolean;

  /** Client name for display */
  readonly name?: string;

  /** Allowed scopes for this client */
  readonly allowedScopes: string[];

  /** Redirect URIs for authorization code flow */
  readonly redirectUris?: string[];

  /** Whether this client is a confidential client */
  readonly confidential?: boolean;

  /** Whether this client is active */
  readonly active?: boolean;

  /** Client metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * OAuth 2.0 provider configuration
 */
export interface OAuth2Config {
  /** Issuer identifier (used in JWT 'iss' claim) */
  readonly issuer: string;

  /** Token endpoint URL */
  readonly tokenEndpoint: string;

  /** Authorization endpoint URL */
  readonly authorizationEndpoint: string;

  /** Registered client credentials */
  readonly clientCredentials: Map<string, ClientCredentials>;

  /** Access token TTL in seconds (default: 3600 = 1 hour) */
  readonly tokenTTL?: number;

  /** Refresh token TTL in seconds (default: 2592000 = 30 days) */
  readonly refreshTokenTTL?: number;

  /** Authorization code TTL in seconds (default: 600 = 10 minutes) */
  readonly authorizationCodeTTL?: number;

  /** JWT signing secret */
  readonly signingSecret: string;

  /** Token store configuration */
  readonly tokenStoreConfig?: TokenStoreConfig;

  /** Require PKCE for authorization code flow */
  readonly requirePKCE?: boolean;

  /** Allow refresh tokens */
  readonly allowRefreshTokens?: boolean;
}

/**
 * Default OAuth 2.0 configuration values
 */
export const DEFAULT_OAUTH2_CONFIG = {
  tokenTTL: 3600,
  refreshTokenTTL: 2592000,
  authorizationCodeTTL: 600,
  requirePKCE: false,
  allowRefreshTokens: true,
} as const;

/**
 * Authorization code with metadata
 */
export interface AuthorizationCode {
  /** The authorization code */
  readonly code: string;

  /** Client ID */
  readonly clientId: string;

  /** Redirect URI */
  readonly redirectUri: string;

  /** Requested scopes */
  readonly scopes: string[];

  /** State parameter */
  readonly state?: string;

  /** When the code expires */
  readonly expiresAt: Date;

  /** Code challenge for PKCE */
  readonly codeChallenge?: string;

  /** Code challenge method */
  readonly codeChallengeMethod?: 'S256' | 'plain';
}

/**
 * Token pair (access + refresh)
 */
export interface TokenPair {
  /** Access token (JWT) */
  readonly accessToken: string;

  /** Refresh token (opaque) */
  readonly refreshToken?: string;

  /** Token type (always 'Bearer') */
  readonly tokenType: 'Bearer';

  /** Access token expires in (seconds) */
  readonly expiresIn: number;

  /** Refresh token expires in (seconds) */
  readonly refreshExpiresIn?: number;

  /** Granted scopes */
  readonly scope: string;
}

/**
 * OAuth 2.0 error response
 */
export interface OAuth2Error {
  /** Error code */
  readonly error: OAuth2ErrorCode;

  /** Human-readable description */
  readonly error_description?: string;

  /** Error URI */
  readonly error_uri?: string;
}

/**
 * OAuth 2.0 error codes
 */
export type OAuth2ErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'server_error';

/**
 * OAuth 2.0 grant types
 */
export type GrantType = 'authorization_code' | 'client_credentials' | 'refresh_token';

// ============================================================================
// OAuth 2.0 Error Class
// ============================================================================

/**
 * OAuth 2.0 error
 */
export class OAuth2ProviderError extends Error {
  public readonly error: OAuth2ErrorCode;
  public readonly errorDescription?: string;
  public readonly httpStatus: number;

  constructor(error: OAuth2ErrorCode, description?: string) {
    super(description || error);
    this.name = 'OAuth2ProviderError';
    this.error = error;
    this.errorDescription = description;
    this.httpStatus = this.getHttpStatus(error);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OAuth2ProviderError);
    }
  }

  private getHttpStatus(error: OAuth2ErrorCode): number {
    switch (error) {
      case 'invalid_client':
      case 'access_denied':
        return 401;
      case 'unauthorized_client':
        return 403;
      case 'server_error':
        return 500;
      default:
        return 400;
    }
  }

  /**
   * Convert to OAuth 2.0 error response format
   */
  toResponse(): OAuth2Error {
    const response: OAuth2Error = {
      error: this.error,
    };

    if (this.errorDescription) {
      return { ...response, error_description: this.errorDescription };
    }

    return response;
  }
}

// ============================================================================
// OAuth 2.0 Provider Implementation
// ============================================================================

/**
 * Resolved OAuth2 configuration with all optional fields filled
 */
type ResolvedOAuth2Config = OAuth2Config & Required<Pick<OAuth2Config, 'tokenTTL' | 'refreshTokenTTL' | 'authorizationCodeTTL' | 'requirePKCE' | 'allowRefreshTokens'>>;

/**
 * OAuth 2.0 Authorization Server Provider
 *
 * Implements OAuth 2.0 token issuance and validation for the A2A protocol.
 */
export class OAuth2Provider {
  private readonly config: ResolvedOAuth2Config;
  private readonly tokenStore: TokenStore;

  constructor(config: OAuth2Config) {
    this.config = {
      ...DEFAULT_OAUTH2_CONFIG,
      ...config,
    } as ResolvedOAuth2Config;
    this.tokenStore = createTokenStore(config.tokenStoreConfig);
  }

  // ============================================================================
  // Client Management
  // ============================================================================

  /**
   * Register a new client
   *
   * @param clientId - The client ID
   * @param credentials - The client credentials
   */
  registerClient(clientId: string, credentials: ClientCredentials): void {
    this.config.clientCredentials.set(clientId, credentials);
  }

  /**
   * Remove a client
   *
   * @param clientId - The client ID
   * @returns True if the client was removed
   */
  removeClient(clientId: string): boolean {
    // Revoke all tokens for this client
    this.tokenStore.revokeTokensByClient(clientId);

    return this.config.clientCredentials.delete(clientId);
  }

  /**
   * Validate client credentials
   *
   * @param clientId - The client ID
   * @param clientSecret - The client secret (optional for public clients)
   * @returns True if the credentials are valid
   */
  validateClient(clientId: string, clientSecret?: string): boolean {
    const credentials = this.config.clientCredentials.get(clientId);

    if (!credentials) {
      return false;
    }

    if (credentials.active === false) {
      return false;
    }

    // Public clients don't need a secret
    if (!credentials.confidential && !clientSecret) {
      return true;
    }

    // Confidential clients need a valid secret
    if (credentials.confidential && !clientSecret) {
      return false;
    }

    // Use timing-safe comparison to prevent timing attacks.
    // Supports both hashed and plaintext secrets for backward compatibility.
    const storedSecret = credentials.secretHashed
      ? credentials.clientSecret
      : this.hashSecret(credentials.clientSecret);
    const providedHash = this.hashSecret(clientSecret);
    return this.timingSafeCompare(providedHash, storedSecret);
  }

  /**
   * Get client credentials
   *
   * @param clientId - The client ID
   * @returns The client credentials or undefined
   */
  getClient(clientId: string): ClientCredentials | undefined {
    return this.config.clientCredentials.get(clientId);
  }

  // ============================================================================
  // Authorization Code Flow
  // ============================================================================

  /**
   * Generate an authorization code
   *
   * @param clientId - The client ID
   * @param redirectUri - The redirect URI
   * @param scope - Requested scopes
   * @param state - Optional state parameter
   * @param codeChallenge - PKCE code challenge
   * @param codeChallengeMethod - PKCE method (S256 or plain)
   * @returns The authorization code
   */
  generateAuthorizationCode(
    clientId: string,
    redirectUri: string,
    scope: string[],
    state?: string,
    codeChallenge?: string,
    codeChallengeMethod?: 'S256' | 'plain'
  ): AuthorizationCode {
    const credentials = this.config.clientCredentials.get(clientId);

    if (!credentials) {
      throw new OAuth2ProviderError('invalid_client', 'Client not found');
    }

    if (credentials.active === false) {
      throw new OAuth2ProviderError('invalid_client', 'Client is not active');
    }

    // Validate redirect URI
    if (credentials.redirectUris && !credentials.redirectUris.includes(redirectUri)) {
      throw new OAuth2ProviderError('invalid_request', 'Invalid redirect URI');
    }

    // Validate PKCE if required
    if (this.config.requirePKCE && !codeChallenge) {
      throw new OAuth2ProviderError('invalid_request', 'PKCE code challenge required');
    }

    // Validate scopes
    const requestedScopes = normalizeScopes(scope);
    const validScopes = requestedScopes.filter((s) =>
      credentials.allowedScopes.includes(s) || validateScopes([s], credentials.allowedScopes)
    );

    if (validScopes.length === 0) {
      throw new OAuth2ProviderError('invalid_scope', 'No valid scopes requested');
    }

    // Generate authorization code
    const code = this.generateSecureCode();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + this.config.authorizationCodeTTL;

    // Store the authorization code
    this.tokenStore.storeAuthorizationCode(code, {
      clientId,
      scopes: validScopes,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
      issuedAt: now,
      expiresAt,
    });

    return {
      code,
      clientId,
      redirectUri,
      scopes: validScopes,
      state,
      expiresAt: new Date(expiresAt * 1000),
      codeChallenge,
      codeChallengeMethod,
    };
  }

  /**
   * Exchange an authorization code for tokens
   *
   * @param code - The authorization code
   * @param clientId - The client ID
   * @param clientSecret - The client secret
   * @param redirectUri - The redirect URI (must match original)
   * @param codeVerifier - PKCE code verifier
   * @returns Token pair
   */
  async exchangeCodeForTokens(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<TokenPair> {
    // Validate client
    if (!this.validateClient(clientId, clientSecret)) {
      throw new OAuth2ProviderError('invalid_client', 'Invalid client credentials');
    }

    // Get and consume authorization code
    const authCode = this.tokenStore.consumeAuthorizationCode(code);

    if (!authCode) {
      throw new OAuth2ProviderError('invalid_grant', 'Invalid or expired authorization code');
    }

    // Validate client ID matches
    if (authCode.clientId !== clientId) {
      throw new OAuth2ProviderError('invalid_grant', 'Authorization code was not issued to this client');
    }

    // Validate redirect URI
    if (authCode.redirectUri !== redirectUri) {
      throw new OAuth2ProviderError('invalid_grant', 'Redirect URI does not match');
    }

    // Validate PKCE
    if (authCode.codeChallenge) {
      if (!codeVerifier) {
        throw new OAuth2ProviderError('invalid_grant', 'Code verifier required');
      }

      const isValid = await this.verifyCodeChallenge(
        codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod || 'S256'
      );

      if (!isValid) {
        throw new OAuth2ProviderError('invalid_grant', 'Code verifier is invalid');
      }
    }

    // Generate tokens
    return this.generateTokenPair(clientId, authCode.scopes);
  }

  // ============================================================================
  // Client Credentials Flow
  // ============================================================================

  /**
   * Issue tokens using client credentials grant
   *
   * @param clientId - The client ID
   * @param clientSecret - The client secret
   * @param scope - Requested scopes
   * @returns Token pair
   */
  async clientCredentialsGrant(
    clientId: string,
    clientSecret: string,
    scope?: string[]
  ): Promise<TokenPair> {
    // Validate client
    if (!this.validateClient(clientId, clientSecret)) {
      throw new OAuth2ProviderError('invalid_client', 'Invalid client credentials');
    }

    const credentials = this.config.clientCredentials.get(clientId)!;

    // Determine scopes
    let grantedScopes = credentials.allowedScopes;

    if (scope && scope.length > 0) {
      // Validate requested scopes
      const requestedScopes = normalizeScopes(scope);
      const invalidScopes = requestedScopes.filter(
        (s) => !credentials.allowedScopes.includes(s) && !validateScopes([s], credentials.allowedScopes)
      );

      if (invalidScopes.length > 0) {
        throw new OAuth2ProviderError(
          'invalid_scope',
          `Invalid scopes: ${invalidScopes.join(', ')}`
        );
      }

      grantedScopes = requestedScopes;
    }

    // Generate tokens
    return this.generateTokenPair(clientId, grantedScopes);
  }

  // ============================================================================
  // Token Refresh
  // ============================================================================

  /**
   * Refresh an access token
   *
   * @param refreshToken - The refresh token
   * @param scope - Optional new scope (must be subset of original)
   * @returns New token pair
   */
  async refreshAccessToken(refreshToken: string, scope?: string[]): Promise<TokenPair> {
    if (!this.config.allowRefreshTokens) {
      throw new OAuth2ProviderError('unsupported_grant_type', 'Refresh tokens are not supported');
    }

    // Get refresh token claims
    const claims = this.tokenStore.getRefreshTokenClaims(refreshToken);

    if (!claims) {
      throw new OAuth2ProviderError('invalid_grant', 'Invalid or expired refresh token');
    }

    // Determine new scopes
    let grantedScopes = claims.scopes;

    if (scope && scope.length > 0) {
      // New scopes must be a subset of original scopes
      const requestedScopes = normalizeScopes(scope);
      const invalidScopes = requestedScopes.filter((s) => !claims.scopes.includes(s));

      if (invalidScopes.length > 0) {
        throw new OAuth2ProviderError(
          'invalid_scope',
          'Cannot request scopes beyond original grant'
        );
      }

      grantedScopes = requestedScopes;
    }

    // Increment refresh token use count
    this.tokenStore.incrementRefreshTokenUseCount(refreshToken);

    // Revoke old refresh token and issue new tokens (rotation)
    this.tokenStore.revokeToken(refreshToken);

    return this.generateTokenPair(claims.clientId, grantedScopes);
  }

  // ============================================================================
  // Token Revocation
  // ============================================================================

  /**
   * Revoke a token
   *
   * @param token - The token to revoke
   * @param tokenTypeHint - Optional hint about token type
   */
  revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): void {
    this.tokenStore.revokeToken(token);
  }

  /**
   * Revoke all tokens for a client
   *
   * @param clientId - The client ID
   * @returns Number of tokens revoked
   */
  revokeClientTokens(clientId: string): number {
    return this.tokenStore.revokeTokensByClient(clientId);
  }

  // ============================================================================
  // Token Validation
  // ============================================================================

  /**
   * Validate an access token
   *
   * @param token - The access token
   * @param requiredScopes - Required scopes (optional)
   * @returns The token payload if valid
   */
  async validateAccessToken(
    token: string,
    requiredScopes?: string[]
  ): Promise<JWTPayload> {
    // Check if revoked
    if (this.tokenStore.isRevoked(token)) {
      throw new OAuth2ProviderError('invalid_grant', 'Token has been revoked');
    }

    try {
      // Verify JWT signature and claims
      const payload = await verifyJWT(token, this.config.signingSecret, {
        issuer: this.config.issuer,
      });

      // Check token type
      if (payload.token_type !== 'access') {
        throw new OAuth2ProviderError('invalid_grant', 'Invalid token type');
      }

      // Check required scopes
      if (requiredScopes && requiredScopes.length > 0) {
        const tokenScopes = payload.scope?.split(' ') || [];
        if (!validateScopes(requiredScopes, tokenScopes)) {
          throw new OAuth2ProviderError('access_denied', 'Insufficient scope');
        }
      }

      return payload;
    } catch (error) {
      if (error instanceof JWTError) {
        if (error.code === 'TOKEN_EXPIRED') {
          throw new OAuth2ProviderError('invalid_grant', 'Token has expired');
        }
        throw new OAuth2ProviderError('invalid_grant', 'Invalid token');
      }
      if (error instanceof OAuth2ProviderError) {
        throw error;
      }
      throw new OAuth2ProviderError('server_error', 'Token validation failed');
    }
  }

  /**
   * Introspect a token
   *
   * @param token - The token to introspect
   * @returns Token introspection response
   */
  async introspectToken(token: string): Promise<{
    active: boolean;
    scope?: string;
    client_id?: string;
    exp?: number;
    iat?: number;
    sub?: string;
    token_type?: string;
  }> {
    try {
      const payload = await this.validateAccessToken(token);

      return {
        active: true,
        scope: payload.scope,
        client_id: payload.client_id,
        exp: payload.exp,
        iat: payload.iat,
        sub: payload.sub,
        token_type: 'Bearer',
      };
    } catch {
      return { active: false };
    }
  }

  // ============================================================================
  // Token Generation (Private)
  // ============================================================================

  /**
   * Generate a token pair
   */
  private async generateTokenPair(clientId: string, scopes: string[]): Promise<TokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const accessTokenJti = crypto.randomUUID();

    // Generate access token
    const accessToken = await signAccessToken(clientId, scopes, this.config.signingSecret, {
      issuer: this.config.issuer,
      expiresIn: this.config.tokenTTL,
      jti: accessTokenJti,
    });

    // Store access token
    this.tokenStore.storeAccessToken(accessToken, {
      clientId,
      scopes,
      issuedAt: now,
      expiresAt: now + this.config.tokenTTL,
      jti: accessTokenJti,
    });

    const result: TokenPair = {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.tokenTTL,
      scope: scopes.join(' '),
    };

    // Generate refresh token if allowed
    if (this.config.allowRefreshTokens) {
      const refreshToken = this.generateSecureCode();

      this.tokenStore.storeRefreshToken(refreshToken, {
        clientId,
        scopes,
        tokenId: crypto.randomUUID(),
        accessTokenJti,
        useCount: 0,
        issuedAt: now,
        expiresAt: now + this.config.refreshTokenTTL,
      });

      return {
        ...result,
        refreshToken,
        refreshExpiresIn: this.config.refreshTokenTTL,
      };
    }

    return result;
  }

  /**
   * Hash a secret using SHA-256
   */
  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   */
  private timingSafeCompare(a: string, b: string): boolean {
    const maxLen = Math.max(a.length, b.length);
    const paddedA = a.padEnd(maxLen, '\0');
    const paddedB = b.padEnd(maxLen, '\0');
    try {
      return timingSafeEqual(Buffer.from(paddedA), Buffer.from(paddedB));
    } catch {
      return false;
    }
  }

  /**
   * Generate a secure random code
   */
  private generateSecureCode(): string {
    // Generate 32 random bytes and encode as base64url
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Verify PKCE code challenge
   */
  private async verifyCodeChallenge(
    codeVerifier: string,
    codeChallenge: string,
    method: 'S256' | 'plain'
  ): Promise<boolean> {
    if (method === 'plain') {
      return this.timingSafeCompare(codeVerifier, codeChallenge);
    }

    // S256: SHA-256 hash of verifier
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hash);
    const computed = btoa(String.fromCharCode(...hashArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return this.timingSafeCompare(computed, codeChallenge);
  }

  // ============================================================================
  // Discovery Metadata
  // ============================================================================

  /**
   * Get OAuth 2.0 authorization server metadata
   *
   * @returns OpenID Connect Discovery metadata
   */
  getMetadata(): Record<string, unknown> {
    return {
      issuer: this.config.issuer,
      authorization_endpoint: this.config.authorizationEndpoint,
      token_endpoint: this.config.tokenEndpoint,
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      grant_types_supported: [
        'authorization_code',
        'client_credentials',
        ...(this.config.allowRefreshTokens ? ['refresh_token'] : []),
      ],
      response_types_supported: ['code'],
      scopes_supported: Object.keys(DEFAULT_CLIENT_SCOPES),
      code_challenge_methods_supported: ['S256', 'plain'],
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Get provider statistics
   */
  getStats(): {
    tokenStats: ReturnType<TokenStore['getStats']>;
    clientCount: number;
  } {
    return {
      tokenStats: this.tokenStore.getStats(),
      clientCount: this.config.clientCredentials.size,
    };
  }

  /**
   * Clean up expired tokens
   */
  cleanup(): number {
    return this.tokenStore.cleanup();
  }

  /**
   * Destroy the provider
   */
  destroy(): void {
    this.tokenStore.destroy();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new OAuth2Provider instance
 *
 * @param config - Provider configuration
 * @returns A new OAuth2Provider
 */
export function createOAuth2Provider(config: OAuth2Config): OAuth2Provider {
  return new OAuth2Provider(config);
}

/**
 * Create a simple OAuth2Provider for testing
 *
 * @param signingSecret - The JWT signing secret
 * @returns A configured OAuth2Provider
 */
export function createTestOAuth2Provider(signingSecret: string = 'test-secret'): OAuth2Provider {
  return new OAuth2Provider({
    issuer: 'http://localhost:3000',
    tokenEndpoint: 'http://localhost:3000/oauth/token',
    authorizationEndpoint: 'http://localhost:3000/oauth/authorize',
    clientCredentials: new Map([
      [
        'test-client',
        {
          clientSecret: 'test-secret',
          name: 'Test Client',
          allowedScopes: ['platform:read', 'agent:read', 'task:read', 'task:create'],
          confidential: true,
          active: true,
        },
      ],
    ]),
    signingSecret,
  });
}
