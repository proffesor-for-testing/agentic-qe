/**
 * A2A JWT Utilities
 *
 * Provides JWT signing, verification, and decoding using the 'jose' library.
 * Implements standard JWT claims with A2A-specific extensions.
 *
 * @module adapters/a2a/auth/jwt-utils
 */

import * as jose from 'jose';

// ============================================================================
// JWT Types
// ============================================================================

/**
 * Standard JWT payload with A2A extensions
 */
export interface JWTPayload {
  /** Issuer - who issued the token */
  readonly iss?: string;

  /** Subject - the client/user ID */
  readonly sub?: string;

  /** Audience - intended recipient */
  readonly aud?: string | string[];

  /** Expiration time (Unix timestamp) */
  readonly exp?: number;

  /** Not before time (Unix timestamp) */
  readonly nbf?: number;

  /** Issued at time (Unix timestamp) */
  readonly iat?: number;

  /** JWT ID - unique identifier for the token */
  readonly jti?: string;

  /** OAuth 2.0 scopes (space-separated) */
  readonly scope?: string;

  /** Client ID for machine-to-machine auth */
  readonly client_id?: string;

  /** Token type (access, refresh) */
  readonly token_type?: 'access' | 'refresh';

  /** Additional custom claims */
  readonly [key: string]: unknown;
}

/**
 * Options for signing a JWT
 */
export interface SignOptions {
  /** Algorithm to use (default: HS256) */
  readonly algorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512';

  /** Token expiration in seconds (default: 3600) */
  readonly expiresIn?: number;

  /** Not before offset in seconds (default: 0) */
  readonly notBefore?: number;

  /** Issuer claim */
  readonly issuer?: string;

  /** Audience claim */
  readonly audience?: string | string[];

  /** JWT ID (auto-generated if not provided) */
  readonly jti?: string;
}

/**
 * Options for verifying a JWT
 */
export interface VerifyOptions {
  /** Expected issuer */
  readonly issuer?: string;

  /** Expected audience */
  readonly audience?: string | string[];

  /** Clock tolerance in seconds (default: 0) */
  readonly clockTolerance?: number;

  /** Current time override for testing */
  readonly currentTime?: Date;

  /** Required claims */
  readonly requiredClaims?: string[];
}

/**
 * Result of JWT decoding (without verification)
 */
export interface DecodedJWT {
  /** JWT header */
  readonly header: jose.JWTHeaderParameters;

  /** JWT payload */
  readonly payload: JWTPayload;

  /** Original token signature */
  readonly signature: string;
}

// ============================================================================
// JWT Error Types
// ============================================================================

/**
 * JWT-related error
 */
export class JWTError extends Error {
  public readonly code: JWTErrorCode;

  constructor(code: JWTErrorCode, message: string) {
    super(message);
    this.name = 'JWTError';
    this.code = code;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, JWTError);
    }
  }
}

/**
 * JWT error codes
 */
export type JWTErrorCode =
  | 'TOKEN_EXPIRED'
  | 'TOKEN_NOT_VALID_YET'
  | 'INVALID_SIGNATURE'
  | 'INVALID_TOKEN'
  | 'MISSING_CLAIM'
  | 'INVALID_ISSUER'
  | 'INVALID_AUDIENCE'
  | 'ALGORITHM_MISMATCH';

// ============================================================================
// JWT Signing
// ============================================================================

/**
 * Sign a JWT with the given payload and secret
 *
 * @param payload - The JWT payload
 * @param secret - The signing secret (for HMAC) or private key (for RSA/EC)
 * @param options - Signing options
 * @returns The signed JWT string
 *
 * @example
 * ```typescript
 * const token = await signJWT(
 *   { sub: 'client-123', scope: 'agent:read task:create' },
 *   'my-secret-key',
 *   { expiresIn: 3600, issuer: 'a2a-platform' }
 * );
 * ```
 */
export async function signJWT(
  payload: JWTPayload,
  secret: string | Uint8Array,
  options: SignOptions = {}
): Promise<string> {
  const {
    algorithm = 'HS256',
    expiresIn = 3600,
    notBefore = 0,
    issuer,
    audience,
    jti,
  } = options;

  // Convert string secret to Uint8Array for jose
  const secretKey = typeof secret === 'string'
    ? new TextEncoder().encode(secret)
    : secret;

  // Build the JWT
  let jwt = new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg: algorithm })
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`);

  if (notBefore > 0) {
    jwt = jwt.setNotBefore(`${notBefore}s`);
  }

  if (issuer) {
    jwt = jwt.setIssuer(issuer);
  }

  if (audience) {
    jwt = jwt.setAudience(audience);
  }

  if (jti) {
    jwt = jwt.setJti(jti);
  } else {
    // Generate a unique JTI using crypto.randomUUID
    jwt = jwt.setJti(crypto.randomUUID());
  }

  return jwt.sign(secretKey);
}

/**
 * Sign a JWT for an access token
 *
 * @param clientId - The client ID
 * @param scopes - Array of granted scopes
 * @param secret - The signing secret
 * @param options - Additional signing options
 * @returns The signed access token
 */
export async function signAccessToken(
  clientId: string,
  scopes: string[],
  secret: string | Uint8Array,
  options: SignOptions = {}
): Promise<string> {
  const payload: JWTPayload = {
    sub: clientId,
    client_id: clientId,
    scope: scopes.join(' '),
    token_type: 'access',
  };

  return signJWT(payload, secret, options);
}

/**
 * Sign a JWT for a refresh token
 *
 * @param clientId - The client ID
 * @param scopes - Array of granted scopes
 * @param secret - The signing secret
 * @param options - Additional signing options
 * @returns The signed refresh token
 */
export async function signRefreshToken(
  clientId: string,
  scopes: string[],
  secret: string | Uint8Array,
  options: SignOptions = {}
): Promise<string> {
  const payload: JWTPayload = {
    sub: clientId,
    client_id: clientId,
    scope: scopes.join(' '),
    token_type: 'refresh',
  };

  // Refresh tokens typically have longer expiration
  const refreshOptions: SignOptions = {
    expiresIn: 86400 * 30, // 30 days default
    ...options,
  };

  return signJWT(payload, secret, refreshOptions);
}

// ============================================================================
// JWT Verification
// ============================================================================

/**
 * Verify a JWT and return the payload
 *
 * @param token - The JWT string to verify
 * @param secret - The secret or public key for verification
 * @param options - Verification options
 * @returns The verified JWT payload
 * @throws {JWTError} If verification fails
 *
 * @example
 * ```typescript
 * try {
 *   const payload = await verifyJWT(token, 'my-secret-key', {
 *     issuer: 'a2a-platform',
 *     audience: 'my-agent',
 *   });
 *   console.log('Client:', payload.sub);
 *   console.log('Scopes:', payload.scope);
 * } catch (error) {
 *   if (error instanceof JWTError) {
 *     console.error('JWT Error:', error.code, error.message);
 *   }
 * }
 * ```
 */
export async function verifyJWT(
  token: string,
  secret: string | Uint8Array,
  options: VerifyOptions = {}
): Promise<JWTPayload> {
  const secretKey = typeof secret === 'string'
    ? new TextEncoder().encode(secret)
    : secret;

  try {
    const verifyOptions: jose.JWTVerifyOptions = {};

    if (options.issuer) {
      verifyOptions.issuer = options.issuer;
    }

    if (options.audience) {
      verifyOptions.audience = options.audience;
    }

    if (options.clockTolerance !== undefined) {
      verifyOptions.clockTolerance = options.clockTolerance;
    }

    if (options.currentTime) {
      verifyOptions.currentDate = options.currentTime;
    }

    if (options.requiredClaims) {
      verifyOptions.requiredClaims = options.requiredClaims;
    }

    const { payload } = await jose.jwtVerify(token, secretKey, verifyOptions);
    return payload as JWTPayload;
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      throw new JWTError('TOKEN_EXPIRED', 'Token has expired');
    }
    if (error instanceof jose.errors.JWTClaimValidationFailed) {
      if (error.message.includes('not yet valid')) {
        throw new JWTError('TOKEN_NOT_VALID_YET', 'Token is not yet valid');
      }
      if (error.message.includes('issuer')) {
        throw new JWTError('INVALID_ISSUER', 'Token issuer is invalid');
      }
      if (error.message.includes('audience')) {
        throw new JWTError('INVALID_AUDIENCE', 'Token audience is invalid');
      }
      if (error.message.includes('required')) {
        throw new JWTError('MISSING_CLAIM', error.message);
      }
    }
    if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      throw new JWTError('INVALID_SIGNATURE', 'Token signature is invalid');
    }
    if (error instanceof jose.errors.JOSEAlgNotAllowed) {
      throw new JWTError('ALGORITHM_MISMATCH', 'Token algorithm is not allowed');
    }

    throw new JWTError('INVALID_TOKEN', 'Token is invalid');
  }
}

// ============================================================================
// JWT Decoding (Without Verification)
// ============================================================================

/**
 * Decode a JWT without verifying the signature
 *
 * WARNING: This does NOT verify the token! Use only for extracting
 * information when verification is not required (e.g., reading claims
 * before deciding which key to use for verification).
 *
 * @param token - The JWT string to decode
 * @returns The decoded JWT with header, payload, and signature
 * @throws {JWTError} If the token format is invalid
 *
 * @example
 * ```typescript
 * const decoded = decodeJWT(token);
 * console.log('Algorithm:', decoded.header.alg);
 * console.log('Subject:', decoded.payload.sub);
 * ```
 */
export function decodeJWT(token: string): DecodedJWT {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new JWTError('INVALID_TOKEN', 'Token must have three parts');
    }

    const [headerB64, payloadB64, signature] = parts;

    // Decode header
    const headerJson = new TextDecoder().decode(jose.base64url.decode(headerB64));
    const header = JSON.parse(headerJson) as jose.JWTHeaderParameters;

    // Decode payload
    const payloadJson = new TextDecoder().decode(jose.base64url.decode(payloadB64));
    const payload = JSON.parse(payloadJson) as JWTPayload;

    return {
      header,
      payload,
      signature,
    };
  } catch (error) {
    if (error instanceof JWTError) {
      throw error;
    }
    throw new JWTError('INVALID_TOKEN', 'Failed to decode token');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a JWT is expired (without verification)
 *
 * @param token - The JWT string or decoded payload
 * @returns True if the token is expired
 */
export function isTokenExpired(token: string | JWTPayload): boolean {
  const payload = typeof token === 'string' ? decodeJWT(token).payload : token;

  if (!payload.exp) {
    return false; // No expiration claim means not expired
  }

  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now;
}

/**
 * Get the time until token expiration
 *
 * @param token - The JWT string or decoded payload
 * @returns Seconds until expiration (negative if expired)
 */
export function getTokenTTL(token: string | JWTPayload): number {
  const payload = typeof token === 'string' ? decodeJWT(token).payload : token;

  if (!payload.exp) {
    return Infinity;
  }

  const now = Math.floor(Date.now() / 1000);
  return payload.exp - now;
}

/**
 * Extract scopes from a JWT
 *
 * @param token - The JWT string or decoded payload
 * @returns Array of scope strings
 */
export function extractScopes(token: string | JWTPayload): string[] {
  const payload = typeof token === 'string' ? decodeJWT(token).payload : token;

  if (!payload.scope) {
    return [];
  }

  return payload.scope.trim().split(/\s+/).filter(Boolean);
}

/**
 * Check if a token has a specific scope
 *
 * @param token - The JWT string or decoded payload
 * @param scope - The scope to check for
 * @returns True if the token has the scope
 */
export function hasScope(token: string | JWTPayload, scope: string): boolean {
  const scopes = extractScopes(token);
  return scopes.includes(scope);
}

/**
 * Generate a unique token ID
 *
 * @returns A unique token ID (UUID v4)
 */
export function generateTokenId(): string {
  return crypto.randomUUID();
}

/**
 * Get current Unix timestamp in seconds
 *
 * @returns Current time as Unix timestamp
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}
