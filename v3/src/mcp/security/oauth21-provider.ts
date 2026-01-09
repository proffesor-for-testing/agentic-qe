/**
 * Agentic QE v3 - MCP Security: OAuth 2.1 Provider
 * OAuth 2.1 + PKCE implementation for enterprise authentication (ADR-012)
 *
 * Features:
 * - OAuth 2.1 compliant (requires PKCE for all clients)
 * - Authorization Code Flow with PKCE
 * - Token management with refresh tokens
 * - Scope-based authorization
 * - Token introspection and revocation
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * OAuth 2.1 Grant Types (subset of OAuth 2.0)
 */
export type OAuth21GrantType =
  | 'authorization_code'
  | 'refresh_token'
  | 'client_credentials';

/**
 * Token types
 */
export type TokenType = 'access_token' | 'refresh_token';

/**
 * PKCE code challenge method
 */
export type PKCEMethod = 'S256' | 'plain';

/**
 * OAuth client configuration
 */
export interface OAuth21Client {
  clientId: string;
  clientSecret?: string;
  redirectUris: string[];
  allowedScopes: string[];
  allowedGrantTypes: OAuth21GrantType[];
  confidential: boolean;
  requirePKCE: boolean;
  accessTokenTTL: number;
  refreshTokenTTL: number;
  metadata?: Record<string, unknown>;
}

/**
 * Authorization request parameters
 */
export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  responseType: 'code';
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: PKCEMethod;
  nonce?: string;
}

/**
 * Authorization code stored data
 */
export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  userId: string;
  codeChallenge: string;
  codeChallengeMethod: PKCEMethod;
  expiresAt: number;
  nonce?: string;
}

/**
 * Token request parameters
 */
export interface TokenRequest {
  grantType: OAuth21GrantType;
  clientId: string;
  clientSecret?: string;
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
  refreshToken?: string;
  scope?: string;
}

/**
 * Token response
 */
export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken?: string;
  scope: string;
}

/**
 * Token data stored
 */
export interface TokenData {
  token: string;
  tokenHash: string;
  type: TokenType;
  clientId: string;
  userId?: string;
  scope: string;
  expiresAt: number;
  issuedAt: number;
  refreshTokenHash?: string;
}

/**
 * Token introspection response
 */
export interface TokenIntrospection {
  active: boolean;
  scope?: string;
  clientId?: string;
  username?: string;
  tokenType?: string;
  exp?: number;
  iat?: number;
  sub?: string;
}

/**
 * OAuth error response
 */
export interface OAuthError {
  error: OAuthErrorCode;
  errorDescription?: string;
  errorUri?: string;
}

/**
 * OAuth error codes
 */
export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'server_error'
  | 'access_denied';

/**
 * Provider configuration
 */
export interface OAuth21ProviderConfig {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  introspectionEndpoint?: string;
  revocationEndpoint?: string;
  defaultAccessTokenTTL: number;
  defaultRefreshTokenTTL: number;
  requirePKCE: boolean;
  allowedScopes: string[];
}

// ============================================================================
// OAuth 2.1 Provider Implementation
// ============================================================================

/**
 * OAuth 2.1 Provider with PKCE support
 */
export class OAuth21Provider {
  private readonly config: OAuth21ProviderConfig;
  private readonly clients: Map<string, OAuth21Client>;
  private readonly authorizationCodes: Map<string, AuthorizationCode>;
  private readonly tokens: Map<string, TokenData>;
  private readonly revokedTokens: Set<string>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: OAuth21ProviderConfig) {
    this.config = config;
    this.clients = new Map();
    this.authorizationCodes = new Map();
    this.tokens = new Map();
    this.revokedTokens = new Set();

    // Start cleanup timer
    this.startCleanup();
  }

  // ============================================================================
  // Client Management
  // ============================================================================

  /**
   * Register a new client
   */
  registerClient(client: OAuth21Client): void {
    if (this.clients.has(client.clientId)) {
      throw this.createError('invalid_client', 'Client already registered');
    }

    // OAuth 2.1 requires PKCE for all clients
    if (this.config.requirePKCE) {
      client.requirePKCE = true;
    }

    this.clients.set(client.clientId, client);
  }

  /**
   * Get client by ID
   */
  getClient(clientId: string): OAuth21Client | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): boolean {
    // Revoke all tokens for this client
    for (const [hash, token] of this.tokens) {
      if (token.clientId === clientId) {
        this.revokedTokens.add(hash);
        this.tokens.delete(hash);
      }
    }

    return this.clients.delete(clientId);
  }

  // ============================================================================
  // Authorization Flow
  // ============================================================================

  /**
   * Validate authorization request and create authorization code
   */
  authorize(request: AuthorizationRequest, userId: string): { code: string; state: string } {
    // Validate client
    const client = this.clients.get(request.clientId);
    if (!client) {
      throw this.createError('invalid_client', 'Unknown client');
    }

    // Validate redirect URI
    if (!client.redirectUris.includes(request.redirectUri)) {
      throw this.createError('invalid_request', 'Invalid redirect URI');
    }

    // Validate response type
    if (request.responseType !== 'code') {
      throw this.createError('unsupported_grant_type', 'Only authorization_code is supported');
    }

    // Validate grant type is allowed
    if (!client.allowedGrantTypes.includes('authorization_code')) {
      throw this.createError('unauthorized_client', 'Grant type not allowed');
    }

    // Validate PKCE (required in OAuth 2.1)
    if (client.requirePKCE || this.config.requirePKCE) {
      if (!request.codeChallenge) {
        throw this.createError('invalid_request', 'PKCE code_challenge required');
      }
      if (request.codeChallengeMethod !== 'S256') {
        throw this.createError('invalid_request', 'Only S256 code_challenge_method is supported');
      }
    }

    // Validate scopes
    const requestedScopes = request.scope.split(' ').filter(Boolean);
    const invalidScopes = requestedScopes.filter(
      s => !client.allowedScopes.includes(s) || !this.config.allowedScopes.includes(s)
    );
    if (invalidScopes.length > 0) {
      throw this.createError('invalid_scope', `Invalid scopes: ${invalidScopes.join(', ')}`);
    }

    // Generate authorization code
    const code = this.generateToken(32);
    const authCode: AuthorizationCode = {
      code,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      scope: request.scope,
      userId,
      codeChallenge: request.codeChallenge,
      codeChallengeMethod: request.codeChallengeMethod,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      nonce: request.nonce,
    };

    this.authorizationCodes.set(code, authCode);

    return { code, state: request.state };
  }

  // ============================================================================
  // Token Exchange
  // ============================================================================

  /**
   * Exchange authorization code or refresh token for tokens
   */
  token(request: TokenRequest): TokenResponse {
    switch (request.grantType) {
      case 'authorization_code':
        return this.handleAuthorizationCodeGrant(request);
      case 'refresh_token':
        return this.handleRefreshTokenGrant(request);
      case 'client_credentials':
        return this.handleClientCredentialsGrant(request);
      default:
        throw this.createError('unsupported_grant_type', 'Grant type not supported');
    }
  }

  private handleAuthorizationCodeGrant(request: TokenRequest): TokenResponse {
    if (!request.code) {
      throw this.createError('invalid_request', 'Authorization code required');
    }

    // Find and validate authorization code
    const authCode = this.authorizationCodes.get(request.code);
    if (!authCode) {
      throw this.createError('invalid_grant', 'Invalid authorization code');
    }

    // Delete code (one-time use)
    this.authorizationCodes.delete(request.code);

    // Check expiration
    if (Date.now() > authCode.expiresAt) {
      throw this.createError('invalid_grant', 'Authorization code expired');
    }

    // Validate client
    if (authCode.clientId !== request.clientId) {
      throw this.createError('invalid_grant', 'Client ID mismatch');
    }

    const client = this.clients.get(request.clientId);
    if (!client) {
      throw this.createError('invalid_client', 'Unknown client');
    }

    // Validate redirect URI
    if (authCode.redirectUri !== request.redirectUri) {
      throw this.createError('invalid_grant', 'Redirect URI mismatch');
    }

    // Validate PKCE
    if (authCode.codeChallenge) {
      if (!request.codeVerifier) {
        throw this.createError('invalid_request', 'Code verifier required');
      }

      const challenge = this.computeCodeChallenge(
        request.codeVerifier,
        authCode.codeChallengeMethod
      );

      if (!this.timingSafeCompare(challenge, authCode.codeChallenge)) {
        throw this.createError('invalid_grant', 'Invalid code verifier');
      }
    }

    // Authenticate confidential client
    if (client.confidential) {
      if (!request.clientSecret) {
        throw this.createError('invalid_client', 'Client secret required');
      }
      if (!client.clientSecret || !this.timingSafeCompare(request.clientSecret, client.clientSecret)) {
        throw this.createError('invalid_client', 'Invalid client credentials');
      }
    }

    // Generate tokens
    return this.generateTokens(client, authCode.scope, authCode.userId);
  }

  private handleRefreshTokenGrant(request: TokenRequest): TokenResponse {
    if (!request.refreshToken) {
      throw this.createError('invalid_request', 'Refresh token required');
    }

    // Find token
    const tokenHash = this.hashToken(request.refreshToken);
    const tokenData = this.tokens.get(tokenHash);

    if (!tokenData || tokenData.type !== 'refresh_token') {
      throw this.createError('invalid_grant', 'Invalid refresh token');
    }

    // Check if revoked
    if (this.revokedTokens.has(tokenHash)) {
      throw this.createError('invalid_grant', 'Token has been revoked');
    }

    // Check expiration
    if (Date.now() > tokenData.expiresAt) {
      throw this.createError('invalid_grant', 'Refresh token expired');
    }

    // Validate client
    if (tokenData.clientId !== request.clientId) {
      throw this.createError('invalid_grant', 'Client ID mismatch');
    }

    const client = this.clients.get(request.clientId);
    if (!client) {
      throw this.createError('invalid_client', 'Unknown client');
    }

    // Authenticate confidential client
    if (client.confidential) {
      if (!request.clientSecret) {
        throw this.createError('invalid_client', 'Client secret required');
      }
      if (!client.clientSecret || !this.timingSafeCompare(request.clientSecret, client.clientSecret)) {
        throw this.createError('invalid_client', 'Invalid client credentials');
      }
    }

    // Validate scope (can only request same or subset of original scopes)
    let scope = tokenData.scope;
    if (request.scope) {
      const originalScopes = new Set(tokenData.scope.split(' '));
      const requestedScopes = request.scope.split(' ');
      const invalidScopes = requestedScopes.filter(s => !originalScopes.has(s));
      if (invalidScopes.length > 0) {
        throw this.createError('invalid_scope', 'Requested scope exceeds original grant');
      }
      scope = request.scope;
    }

    // Revoke old refresh token (rotation)
    this.revokedTokens.add(tokenHash);
    this.tokens.delete(tokenHash);

    // Generate new tokens
    return this.generateTokens(client, scope, tokenData.userId);
  }

  private handleClientCredentialsGrant(request: TokenRequest): TokenResponse {
    const client = this.clients.get(request.clientId);
    if (!client) {
      throw this.createError('invalid_client', 'Unknown client');
    }

    // Only confidential clients can use client_credentials
    if (!client.confidential) {
      throw this.createError('unauthorized_client', 'Client is not confidential');
    }

    // Validate grant type is allowed
    if (!client.allowedGrantTypes.includes('client_credentials')) {
      throw this.createError('unauthorized_client', 'Grant type not allowed');
    }

    // Authenticate client
    if (!request.clientSecret) {
      throw this.createError('invalid_client', 'Client secret required');
    }
    if (!client.clientSecret || !this.timingSafeCompare(request.clientSecret, client.clientSecret)) {
      throw this.createError('invalid_client', 'Invalid client credentials');
    }

    // Validate scope
    let scope = client.allowedScopes.join(' ');
    if (request.scope) {
      const requestedScopes = request.scope.split(' ');
      const invalidScopes = requestedScopes.filter(s => !client.allowedScopes.includes(s));
      if (invalidScopes.length > 0) {
        throw this.createError('invalid_scope', `Invalid scopes: ${invalidScopes.join(', ')}`);
      }
      scope = request.scope;
    }

    // Generate access token only (no refresh token for client_credentials)
    const accessToken = this.generateToken(32);
    const accessTokenHash = this.hashToken(accessToken);
    const now = Date.now();
    const expiresIn = client.accessTokenTTL || this.config.defaultAccessTokenTTL;

    this.tokens.set(accessTokenHash, {
      token: accessToken,
      tokenHash: accessTokenHash,
      type: 'access_token',
      clientId: client.clientId,
      scope,
      expiresAt: now + expiresIn * 1000,
      issuedAt: now,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      scope,
    };
  }

  // ============================================================================
  // Token Operations
  // ============================================================================

  /**
   * Introspect a token
   */
  introspect(token: string): TokenIntrospection {
    const tokenHash = this.hashToken(token);
    const tokenData = this.tokens.get(tokenHash);

    if (!tokenData) {
      return { active: false };
    }

    // Check if revoked
    if (this.revokedTokens.has(tokenHash)) {
      return { active: false };
    }

    // Check expiration
    if (Date.now() > tokenData.expiresAt) {
      return { active: false };
    }

    return {
      active: true,
      scope: tokenData.scope,
      clientId: tokenData.clientId,
      tokenType: tokenData.type === 'access_token' ? 'Bearer' : 'refresh_token',
      exp: Math.floor(tokenData.expiresAt / 1000),
      iat: Math.floor(tokenData.issuedAt / 1000),
      sub: tokenData.userId,
    };
  }

  /**
   * Validate an access token
   */
  validateAccessToken(token: string): { valid: true; data: TokenData } | { valid: false; error: string } {
    const tokenHash = this.hashToken(token);
    const tokenData = this.tokens.get(tokenHash);

    if (!tokenData) {
      return { valid: false, error: 'Token not found' };
    }

    if (tokenData.type !== 'access_token') {
      return { valid: false, error: 'Not an access token' };
    }

    if (this.revokedTokens.has(tokenHash)) {
      return { valid: false, error: 'Token revoked' };
    }

    if (Date.now() > tokenData.expiresAt) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, data: { ...tokenData } };
  }

  /**
   * Revoke a token
   */
  revoke(token: string, tokenType?: TokenType): boolean {
    const tokenHash = this.hashToken(token);
    const tokenData = this.tokens.get(tokenHash);

    if (!tokenData) {
      return false;
    }

    if (tokenType && tokenData.type !== tokenType) {
      return false;
    }

    this.revokedTokens.add(tokenHash);
    this.tokens.delete(tokenHash);

    // If revoking refresh token, also revoke associated access tokens
    if (tokenData.type === 'refresh_token') {
      for (const [hash, data] of this.tokens) {
        if (data.refreshTokenHash === tokenHash) {
          this.revokedTokens.add(hash);
          this.tokens.delete(hash);
        }
      }
    }

    return true;
  }

  /**
   * Revoke all tokens for a user
   */
  revokeAllUserTokens(userId: string): number {
    let count = 0;
    for (const [hash, data] of this.tokens) {
      if (data.userId === userId) {
        this.revokedTokens.add(hash);
        this.tokens.delete(hash);
        count++;
      }
    }
    return count;
  }

  // ============================================================================
  // PKCE Utilities
  // ============================================================================

  /**
   * Generate a PKCE code verifier
   */
  generateCodeVerifier(): string {
    // 43-128 characters, URL-safe base64
    return this.generateToken(64);
  }

  /**
   * Generate a PKCE code challenge from verifier
   */
  generateCodeChallenge(verifier: string, method: PKCEMethod = 'S256'): string {
    return this.computeCodeChallenge(verifier, method);
  }

  private computeCodeChallenge(verifier: string, method: PKCEMethod): string {
    if (method === 'plain') {
      return verifier;
    }

    // S256: BASE64URL(SHA256(code_verifier))
    const hash = createHash('sha256').update(verifier).digest();
    return hash
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // ============================================================================
  // Cleanup and Disposal
  // ============================================================================

  /**
   * Dispose the provider
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.authorizationCodes.clear();
    this.tokens.clear();
    this.revokedTokens.clear();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private generateTokens(client: OAuth21Client, scope: string, userId?: string): TokenResponse {
    const now = Date.now();
    const accessTokenTTL = client.accessTokenTTL || this.config.defaultAccessTokenTTL;
    const refreshTokenTTL = client.refreshTokenTTL || this.config.defaultRefreshTokenTTL;

    // Generate access token
    const accessToken = this.generateToken(32);
    const accessTokenHash = this.hashToken(accessToken);

    // Generate refresh token
    const refreshToken = this.generateToken(32);
    const refreshTokenHash = this.hashToken(refreshToken);

    // Store access token
    this.tokens.set(accessTokenHash, {
      token: accessToken,
      tokenHash: accessTokenHash,
      type: 'access_token',
      clientId: client.clientId,
      userId,
      scope,
      expiresAt: now + accessTokenTTL * 1000,
      issuedAt: now,
      refreshTokenHash,
    });

    // Store refresh token
    this.tokens.set(refreshTokenHash, {
      token: refreshToken,
      tokenHash: refreshTokenHash,
      type: 'refresh_token',
      clientId: client.clientId,
      userId,
      scope,
      expiresAt: now + refreshTokenTTL * 1000,
      issuedAt: now,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: accessTokenTTL,
      refreshToken,
      scope,
    };
  }

  private generateToken(length: number): string {
    return randomBytes(length)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private timingSafeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private createError(error: OAuthErrorCode, description?: string): Error {
    const oauthError: OAuthError = {
      error,
      errorDescription: description,
    };
    const err = new Error(description || error);
    (err as any).oauthError = oauthError;
    return err;
  }

  private startCleanup(): void {
    // Cleanup every 5 minutes
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();

      // Cleanup expired authorization codes
      for (const [code, data] of this.authorizationCodes) {
        if (now > data.expiresAt) {
          this.authorizationCodes.delete(code);
        }
      }

      // Cleanup expired tokens
      for (const [hash, data] of this.tokens) {
        if (now > data.expiresAt) {
          this.tokens.delete(hash);
        }
      }

      // Cleanup old revoked tokens (keep for 24 hours)
      const dayAgo = now - 24 * 60 * 60 * 1000;
      // Note: In production, we'd track revocation time
    }, 5 * 60 * 1000);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new OAuth 2.1 provider
 */
export function createOAuth21Provider(config: Partial<OAuth21ProviderConfig> = {}): OAuth21Provider {
  return new OAuth21Provider({
    issuer: config.issuer || 'https://agentic-qe.local',
    authorizationEndpoint: config.authorizationEndpoint || '/oauth/authorize',
    tokenEndpoint: config.tokenEndpoint || '/oauth/token',
    introspectionEndpoint: config.introspectionEndpoint || '/oauth/introspect',
    revocationEndpoint: config.revocationEndpoint || '/oauth/revoke',
    defaultAccessTokenTTL: config.defaultAccessTokenTTL || 3600, // 1 hour
    defaultRefreshTokenTTL: config.defaultRefreshTokenTTL || 86400 * 30, // 30 days
    requirePKCE: config.requirePKCE ?? true,
    allowedScopes: config.allowedScopes || [
      'read',
      'write',
      'admin',
      'test:generate',
      'test:execute',
      'coverage:analyze',
      'security:scan',
    ],
  });
}

// ============================================================================
// Default Instance
// ============================================================================

let defaultProvider: OAuth21Provider | null = null;

/**
 * Get the default OAuth 2.1 provider instance
 */
export function getOAuth21Provider(): OAuth21Provider {
  if (!defaultProvider) {
    defaultProvider = createOAuth21Provider();
  }
  return defaultProvider;
}
