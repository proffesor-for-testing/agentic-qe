/**
 * A2A Token Store
 *
 * In-memory token storage with TTL support for OAuth 2.0 tokens.
 * Provides storage for access tokens, refresh tokens, and authorization codes.
 *
 * @module adapters/a2a/auth/token-store
 */

// ============================================================================
// Token Types
// ============================================================================

/**
 * Base claims shared by all token types
 */
export interface BaseTokenClaims {
  /** Client ID */
  readonly clientId: string;

  /** Granted scopes */
  readonly scopes: string[];

  /** When the token was issued (Unix timestamp) */
  readonly issuedAt: number;

  /** When the token expires (Unix timestamp) */
  readonly expiresAt: number;
}

/**
 * Access token claims
 */
export interface AccessTokenClaims extends BaseTokenClaims {
  /** Token type */
  readonly tokenType: 'access';

  /** JWT ID (jti claim) */
  readonly jti: string;

  /** Audience (if specified) */
  readonly audience?: string;
}

/**
 * Refresh token claims
 */
export interface RefreshTokenClaims extends BaseTokenClaims {
  /** Token type */
  readonly tokenType: 'refresh';

  /** Token ID */
  readonly tokenId: string;

  /** Associated access token JTI */
  readonly accessTokenJti?: string;

  /** Number of times this refresh token has been used */
  readonly useCount: number;
}

/**
 * Authorization code claims
 */
export interface AuthorizationCodeClaims {
  /** Client ID */
  readonly clientId: string;

  /** Requested scopes */
  readonly scopes: string[];

  /** Redirect URI (must match on exchange) */
  readonly redirectUri: string;

  /** State parameter (if provided) */
  readonly state?: string;

  /** Code challenge for PKCE */
  readonly codeChallenge?: string;

  /** Code challenge method for PKCE */
  readonly codeChallengeMethod?: 'S256' | 'plain';

  /** When the code was issued (Unix timestamp) */
  readonly issuedAt: number;

  /** When the code expires (Unix timestamp) */
  readonly expiresAt: number;

  /** Whether the code has been used */
  used: boolean;
}

/**
 * Union of all token claims types
 */
export type TokenClaims = AccessTokenClaims | RefreshTokenClaims;

// ============================================================================
// Token Store Configuration
// ============================================================================

/**
 * Token store configuration
 */
export interface TokenStoreConfig {
  /** Cleanup interval in milliseconds (default: 60000 = 1 minute) */
  readonly cleanupInterval?: number;

  /** Maximum tokens to store (0 = unlimited) */
  readonly maxTokens?: number;

  /** Whether to enable automatic cleanup (default: true) */
  readonly enableAutoCleanup?: boolean;
}

/**
 * Default token store configuration
 */
export const DEFAULT_TOKEN_STORE_CONFIG: Required<TokenStoreConfig> = {
  cleanupInterval: 60000,
  maxTokens: 100000,
  enableAutoCleanup: true,
};

// ============================================================================
// Token Store Statistics
// ============================================================================

/**
 * Token store statistics
 */
export interface TokenStoreStats {
  /** Number of access tokens */
  readonly accessTokenCount: number;

  /** Number of refresh tokens */
  readonly refreshTokenCount: number;

  /** Number of authorization codes */
  readonly authCodeCount: number;

  /** Number of revoked tokens */
  readonly revokedTokenCount: number;

  /** Last cleanup timestamp */
  readonly lastCleanup: number | null;

  /** Total tokens expired and cleaned up */
  readonly totalExpiredCleaned: number;
}

// ============================================================================
// Token Store Implementation
// ============================================================================

/**
 * In-memory token store with TTL support
 *
 * Provides storage for OAuth 2.0 tokens with automatic cleanup
 * of expired tokens.
 */
export class TokenStore {
  private readonly config: Required<TokenStoreConfig>;
  private readonly accessTokens: Map<string, AccessTokenClaims> = new Map();
  private readonly refreshTokens: Map<string, RefreshTokenClaims> = new Map();
  private readonly authorizationCodes: Map<string, AuthorizationCodeClaims> = new Map();
  private readonly revokedTokens: Set<string> = new Set();
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private lastCleanup: number | null = null;
  private totalExpiredCleaned = 0;

  constructor(config: TokenStoreConfig = {}) {
    this.config = { ...DEFAULT_TOKEN_STORE_CONFIG, ...config };

    if (this.config.enableAutoCleanup && this.config.cleanupInterval > 0) {
      this.startCleanupTimer();
    }
  }

  // ============================================================================
  // Access Token Operations
  // ============================================================================

  /**
   * Store an access token
   *
   * @param token - The token string (JWT)
   * @param claims - The token claims
   */
  storeAccessToken(token: string, claims: Omit<AccessTokenClaims, 'tokenType'>): void {
    this.checkCapacity();

    const fullClaims: AccessTokenClaims = {
      ...claims,
      tokenType: 'access',
    };

    this.accessTokens.set(token, fullClaims);
  }

  /**
   * Get access token claims
   *
   * @param token - The token string
   * @returns The token claims or null if not found/expired/revoked
   */
  getAccessTokenClaims(token: string): AccessTokenClaims | null {
    // Check if revoked
    if (this.isRevoked(token)) {
      return null;
    }

    const claims = this.accessTokens.get(token);
    if (!claims) {
      return null;
    }

    // Check if expired
    if (this.isExpired(claims.expiresAt)) {
      this.accessTokens.delete(token);
      return null;
    }

    return claims;
  }

  /**
   * Check if an access token is valid
   *
   * @param token - The token string
   * @returns True if the token is valid
   */
  isAccessTokenValid(token: string): boolean {
    return this.getAccessTokenClaims(token) !== null;
  }

  // ============================================================================
  // Refresh Token Operations
  // ============================================================================

  /**
   * Store a refresh token
   *
   * @param token - The token string
   * @param claims - The token claims
   */
  storeRefreshToken(token: string, claims: Omit<RefreshTokenClaims, 'tokenType'>): void {
    this.checkCapacity();

    const fullClaims: RefreshTokenClaims = {
      ...claims,
      tokenType: 'refresh',
    };

    this.refreshTokens.set(token, fullClaims);
  }

  /**
   * Get refresh token claims
   *
   * @param token - The token string
   * @returns The token claims or null if not found/expired/revoked
   */
  getRefreshTokenClaims(token: string): RefreshTokenClaims | null {
    if (this.isRevoked(token)) {
      return null;
    }

    const claims = this.refreshTokens.get(token);
    if (!claims) {
      return null;
    }

    if (this.isExpired(claims.expiresAt)) {
      this.refreshTokens.delete(token);
      return null;
    }

    return claims;
  }

  /**
   * Increment the use count for a refresh token
   *
   * @param token - The refresh token
   * @returns The updated claims or null if not found
   */
  incrementRefreshTokenUseCount(token: string): RefreshTokenClaims | null {
    const claims = this.refreshTokens.get(token);
    if (!claims) {
      return null;
    }

    const updatedClaims: RefreshTokenClaims = {
      ...claims,
      useCount: claims.useCount + 1,
    };

    this.refreshTokens.set(token, updatedClaims);
    return updatedClaims;
  }

  // ============================================================================
  // Authorization Code Operations
  // ============================================================================

  /**
   * Store an authorization code
   *
   * @param code - The authorization code
   * @param claims - The code claims
   */
  storeAuthorizationCode(code: string, claims: Omit<AuthorizationCodeClaims, 'used'>): void {
    this.authorizationCodes.set(code, {
      ...claims,
      used: false,
    });
  }

  /**
   * Get authorization code claims
   *
   * @param code - The authorization code
   * @returns The code claims or null if not found/expired/used
   */
  getAuthorizationCodeClaims(code: string): AuthorizationCodeClaims | null {
    const claims = this.authorizationCodes.get(code);
    if (!claims) {
      return null;
    }

    // Check if expired
    if (this.isExpired(claims.expiresAt)) {
      this.authorizationCodes.delete(code);
      return null;
    }

    // Check if already used
    if (claims.used) {
      return null;
    }

    return claims;
  }

  /**
   * Mark an authorization code as used
   *
   * @param code - The authorization code
   * @returns True if the code was marked as used
   */
  markAuthorizationCodeUsed(code: string): boolean {
    const claims = this.authorizationCodes.get(code);
    if (!claims || claims.used) {
      return false;
    }

    claims.used = true;
    return true;
  }

  /**
   * Consume an authorization code (get and mark as used)
   *
   * @param code - The authorization code
   * @returns The code claims or null if not valid
   */
  consumeAuthorizationCode(code: string): AuthorizationCodeClaims | null {
    const claims = this.getAuthorizationCodeClaims(code);
    if (!claims) {
      return null;
    }

    this.markAuthorizationCodeUsed(code);
    return claims;
  }

  // ============================================================================
  // Token Revocation
  // ============================================================================

  /**
   * Revoke a token
   *
   * @param token - The token string
   * @returns True if the token was revoked
   */
  revokeToken(token: string): boolean {
    // Add to revocation list
    this.revokedTokens.add(token);

    // Remove from active stores
    const wasAccessToken = this.accessTokens.delete(token);
    const wasRefreshToken = this.refreshTokens.delete(token);

    return wasAccessToken || wasRefreshToken;
  }

  /**
   * Revoke all tokens for a client
   *
   * @param clientId - The client ID
   * @returns Number of tokens revoked
   */
  revokeTokensByClient(clientId: string): number {
    let count = 0;

    // Revoke access tokens
    for (const [token, claims] of this.accessTokens) {
      if (claims.clientId === clientId) {
        this.revokeToken(token);
        count++;
      }
    }

    // Revoke refresh tokens
    for (const [token, claims] of this.refreshTokens) {
      if (claims.clientId === clientId) {
        this.revokeToken(token);
        count++;
      }
    }

    return count;
  }

  /**
   * Check if a token is revoked
   *
   * @param token - The token string
   * @returns True if the token is revoked
   */
  isRevoked(token: string): boolean {
    return this.revokedTokens.has(token);
  }

  // ============================================================================
  // Generic Token Operations
  // ============================================================================

  /**
   * Get claims for any token type
   *
   * @param token - The token string
   * @returns The token claims or null
   */
  getTokenClaims(token: string): TokenClaims | null {
    const accessClaims = this.getAccessTokenClaims(token);
    if (accessClaims) {
      return accessClaims;
    }

    return this.getRefreshTokenClaims(token);
  }

  /**
   * Check if a token exists and is valid
   *
   * @param token - The token string
   * @returns True if the token is valid
   */
  isTokenValid(token: string): boolean {
    return this.getTokenClaims(token) !== null;
  }

  // ============================================================================
  // Cleanup Operations
  // ============================================================================

  /**
   * Clean up expired tokens
   *
   * @returns Number of tokens cleaned up
   */
  cleanup(): number {
    const now = Math.floor(Date.now() / 1000);
    let cleaned = 0;

    // Clean access tokens
    for (const [token, claims] of this.accessTokens) {
      if (this.isExpired(claims.expiresAt)) {
        this.accessTokens.delete(token);
        cleaned++;
      }
    }

    // Clean refresh tokens
    for (const [token, claims] of this.refreshTokens) {
      if (this.isExpired(claims.expiresAt)) {
        this.refreshTokens.delete(token);
        cleaned++;
      }
    }

    // Clean authorization codes
    for (const [code, claims] of this.authorizationCodes) {
      if (this.isExpired(claims.expiresAt)) {
        this.authorizationCodes.delete(code);
        cleaned++;
      }
    }

    // Clean old revoked tokens (keep for 24 hours)
    const dayAgo = now - 86400;
    for (const token of this.revokedTokens) {
      // We can't know when it was revoked, so we check if there are too many
      if (this.revokedTokens.size > 10000) {
        // Just remove some to prevent unbounded growth
        this.revokedTokens.delete(token);
        cleaned++;
      }
    }

    this.lastCleanup = now;
    this.totalExpiredCleaned += cleaned;

    return cleaned;
  }

  /**
   * Start the automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);

    // Don't prevent process exit
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the automatic cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Check capacity and evict if necessary
   */
  private checkCapacity(): void {
    if (this.config.maxTokens <= 0) {
      return;
    }

    const totalTokens = this.accessTokens.size + this.refreshTokens.size;
    if (totalTokens >= this.config.maxTokens) {
      // Run cleanup first
      this.cleanup();

      // If still over capacity, evict oldest tokens
      const stillOver = this.accessTokens.size + this.refreshTokens.size - this.config.maxTokens;
      if (stillOver > 0) {
        this.evictOldestTokens(stillOver + 100); // Evict some extra
      }
    }
  }

  /**
   * Evict the oldest tokens
   *
   * @param count - Number of tokens to evict
   */
  private evictOldestTokens(count: number): void {
    // Get all tokens sorted by issuedAt
    const allTokens: Array<{ token: string; issuedAt: number; type: 'access' | 'refresh' }> = [];

    for (const [token, claims] of this.accessTokens) {
      allTokens.push({ token, issuedAt: claims.issuedAt, type: 'access' });
    }

    for (const [token, claims] of this.refreshTokens) {
      allTokens.push({ token, issuedAt: claims.issuedAt, type: 'refresh' });
    }

    allTokens.sort((a, b) => a.issuedAt - b.issuedAt);

    // Evict oldest
    const toEvict = allTokens.slice(0, count);
    for (const { token, type } of toEvict) {
      if (type === 'access') {
        this.accessTokens.delete(token);
      } else {
        this.refreshTokens.delete(token);
      }
    }
  }

  /**
   * Check if a timestamp has expired
   */
  private isExpired(expiresAt: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return expiresAt <= now;
  }

  // ============================================================================
  // Statistics and Management
  // ============================================================================

  /**
   * Get store statistics
   */
  getStats(): TokenStoreStats {
    return {
      accessTokenCount: this.accessTokens.size,
      refreshTokenCount: this.refreshTokens.size,
      authCodeCount: this.authorizationCodes.size,
      revokedTokenCount: this.revokedTokens.size,
      lastCleanup: this.lastCleanup,
      totalExpiredCleaned: this.totalExpiredCleaned,
    };
  }

  /**
   * Clear all tokens
   */
  clear(): void {
    this.accessTokens.clear();
    this.refreshTokens.clear();
    this.authorizationCodes.clear();
    this.revokedTokens.clear();
  }

  /**
   * Destroy the store
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }

  /**
   * Get the total number of tokens
   */
  get size(): number {
    return this.accessTokens.size + this.refreshTokens.size;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new TokenStore instance
 *
 * @param config - Store configuration
 * @returns A new TokenStore
 */
export function createTokenStore(config: TokenStoreConfig = {}): TokenStore {
  return new TokenStore(config);
}
