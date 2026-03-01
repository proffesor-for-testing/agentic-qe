/**
 * A2A OAuth 2.0 Authentication Module
 *
 * Provides OAuth 2.0 authentication infrastructure for the A2A protocol:
 * - OAuth 2.0 Provider (authorization code + client credentials flows)
 * - Token Store (in-memory token storage with TTL)
 * - JWT Utilities (signing, verification, decoding)
 * - Scope Definitions (A2A core + QE domain scopes)
 * - JWT validation middleware
 * - OAuth 2.0 token endpoints
 * - OpenID Connect discovery
 *
 * @module adapters/a2a/auth
 * @see https://a2a-protocol.org/latest/specification/
 * @see https://datatracker.ietf.org/doc/html/rfc6749
 */

// ============================================================================
// Scopes
// ============================================================================

export {
  // Core Scopes
  A2A_CORE_SCOPES,
  type A2ACoreScope,

  // Domain Scopes
  A2A_DOMAIN_SCOPES,
  type A2ADomainScope,

  // Combined Scopes
  A2A_SCOPES,
  type A2AScope,

  // Scope Utilities
  getScopeDescription,
  isValidScope,
  scopeHierarchy,
  expandScopes,
  validateScopes,
  getMissingScopes,
  normalizeScopes,
  parseScopeString,
  formatScopeString,

  // Scope Categories
  getScopesByCategory,
  getQEDomainScopes,
  getCoreScopes,

  // Default Scopes
  DEFAULT_CLIENT_SCOPES,
  ADMIN_SCOPES,
} from './scopes.js';

// ============================================================================
// JWT Utilities
// ============================================================================

export {
  // Types
  type JWTPayload,
  type SignOptions,
  type VerifyOptions,
  type DecodedJWT,

  // Error Types
  JWTError,
  type JWTErrorCode,

  // Signing Functions
  signJWT,
  signAccessToken,
  signRefreshToken,

  // Verification Functions
  verifyJWT,

  // Decoding Functions
  decodeJWT,

  // Utility Functions
  isTokenExpired,
  getTokenTTL,
  extractScopes as extractScopesFromToken,
  hasScope as tokenHasScope,
  generateTokenId,
  getCurrentTimestamp,
} from './jwt-utils.js';

// ============================================================================
// Token Store
// ============================================================================

export {
  // Token Store Class
  TokenStore,
  createTokenStore,

  // Configuration
  type TokenStoreConfig,
  DEFAULT_TOKEN_STORE_CONFIG,

  // Token Claims Types
  type BaseTokenClaims,
  type AccessTokenClaims,
  type RefreshTokenClaims,
  type AuthorizationCodeClaims,
  type TokenClaims as StoredTokenClaims,

  // Statistics
  type TokenStoreStats,
} from './token-store.js';

// ============================================================================
// OAuth 2.0 Provider
// ============================================================================

export {
  // Provider Class
  OAuth2Provider as OAuth2ProviderImpl,
  createOAuth2Provider,
  createTestOAuth2Provider,

  // Configuration
  type OAuth2Config,
  DEFAULT_OAUTH2_CONFIG,

  // Client Types
  type ClientCredentials,

  // Token Types
  type AuthorizationCode,
  type TokenPair,

  // Error Types
  OAuth2ProviderError,
  type OAuth2Error as OAuth2ProviderErrorResponse,
  type OAuth2ErrorCode,

  // Grant Types
  type GrantType as OAuth2GrantType,
} from './oauth-provider.js';

// ============================================================================
// Middleware
// ============================================================================

export {
  // Types
  type TokenClaims,
  type JWTVerifier,
  type JWTAuthenticatedRequest,
  type JWTMiddlewareOptions,
  type ScopeOptions,
  type OAuthErrorType,
  type OAuthError,

  // Error Factory
  createOAuthError,

  // Token Extraction
  extractBearerToken,
  parseScopes,

  // JWT Middleware
  createJWTMiddleware,
  jwtAuthMiddleware,

  // Scope Validation
  requireScopes,
  hasScope,
  hasAnyScope,
  hasAllScopes,

  // Utility Middleware
  optionalAuth,
  mockAuthMiddleware,
} from './middleware.js';

// ============================================================================
// Routes
// ============================================================================

export {
  // Types
  type GrantType,
  type TokenRequest,
  type TokenResponse,
  type AuthorizationRequest,
  type RevokeRequest,
  type OpenIDConfiguration,
  type OAuth2Provider,
  type OAuthRouteDefinition,
  type OAuthRoutesConfig,

  // Configuration
  DEFAULT_OAUTH_ROUTES_CONFIG,

  // Route Factory
  getOAuthRouteDefinitions,
  createOAuthRoutes,

  // Utilities
  validateRedirectUri,
  generateCodeChallenge,
  verifyCodeChallenge,
} from './routes.js';
