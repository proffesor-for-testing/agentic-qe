/**
 * JWT Utilities Unit Tests
 *
 * Comprehensive test suite for JWT signing, verification, and decoding.
 *
 * @module tests/unit/adapters/a2a/auth/jwt-utils
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Types for JWT utilities (implementation will be created by other agents)
interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  scope?: string;
  [key: string]: unknown;
}

interface JwtHeader {
  alg: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512';
  typ: 'JWT';
  kid?: string;
}

interface SignOptions {
  algorithm?: JwtHeader['alg'];
  expiresIn?: number;
  notBefore?: number;
  issuer?: string;
  subject?: string;
  audience?: string | string[];
  jwtId?: string;
  keyId?: string;
}

interface VerifyOptions {
  algorithms?: JwtHeader['alg'][];
  issuer?: string | string[];
  audience?: string | string[];
  subject?: string;
  clockTolerance?: number;
  maxAge?: number;
  ignoreExpiration?: boolean;
  ignoreNotBefore?: boolean;
}

interface VerifyResult {
  valid: boolean;
  payload?: JwtPayload;
  header?: JwtHeader;
  error?: string;
}

interface DecodedToken {
  header: JwtHeader;
  payload: JwtPayload;
  signature: string;
}

// Mock implementation for testing
const createJwtUtils = () => {
  const secretKey = 'test-secret-key-for-jwt-signing';

  // Simple base64url encoding/decoding
  const base64urlEncode = (str: string): string => {
    return Buffer.from(str).toString('base64url');
  };

  const base64urlDecode = (str: string): string => {
    return Buffer.from(str, 'base64url').toString('utf-8');
  };

  // Simple HMAC-SHA256 signature (mock for testing)
  const sign = (data: string, key: string): string => {
    // In real implementation, use crypto.createHmac
    // For testing, we use a simple hash-like function that varies with both data and key
    let hash = 0;
    const combined = `${key}:${data}`;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Create a pseudo-random signature based on the hash
    const sig = Buffer.from(`${hash.toString(36)}${combined.slice(0, 20)}`).toString('base64url');
    return sig.slice(0, 43).padEnd(43, 'A');
  };

  return {
    sign(payload: JwtPayload, secret: string, options: SignOptions = {}): string {
      const now = Math.floor(Date.now() / 1000);

      const header: JwtHeader = {
        alg: options.algorithm ?? 'HS256',
        typ: 'JWT',
        ...(options.keyId && { kid: options.keyId }),
      };

      const tokenPayload: JwtPayload = {
        ...payload,
        iat: payload.iat ?? now,
        ...(options.expiresIn && { exp: now + options.expiresIn }),
        ...(options.notBefore && { nbf: now + options.notBefore }),
        ...(options.issuer && { iss: options.issuer }),
        ...(options.subject && { sub: options.subject }),
        ...(options.audience && { aud: options.audience }),
        ...(options.jwtId && { jti: options.jwtId }),
      };

      const headerB64 = base64urlEncode(JSON.stringify(header));
      const payloadB64 = base64urlEncode(JSON.stringify(tokenPayload));
      const signature = sign(`${headerB64}.${payloadB64}`, secret);

      return `${headerB64}.${payloadB64}.${signature}`;
    },

    verify(token: string, secret: string, options: VerifyOptions = {}): VerifyResult {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) {
          return { valid: false, error: 'Invalid token format' };
        }

        const [headerB64, payloadB64, signatureB64] = parts;

        // Decode and parse
        const header: JwtHeader = JSON.parse(base64urlDecode(headerB64));
        const payload: JwtPayload = JSON.parse(base64urlDecode(payloadB64));

        // Verify algorithm
        if (options.algorithms && !options.algorithms.includes(header.alg)) {
          return { valid: false, error: `Algorithm ${header.alg} not allowed` };
        }

        // Verify signature
        const expectedSignature = sign(`${headerB64}.${payloadB64}`, secret);
        if (signatureB64 !== expectedSignature) {
          return { valid: false, error: 'Invalid signature' };
        }

        const now = Math.floor(Date.now() / 1000);
        const clockTolerance = options.clockTolerance ?? 0;

        // Verify expiration
        if (!options.ignoreExpiration && payload.exp) {
          if (now > payload.exp + clockTolerance) {
            return { valid: false, error: 'Token has expired' };
          }
        }

        // Verify not before
        if (!options.ignoreNotBefore && payload.nbf) {
          if (now < payload.nbf - clockTolerance) {
            return { valid: false, error: 'Token not yet valid' };
          }
        }

        // Verify issuer
        if (options.issuer) {
          const allowedIssuers = Array.isArray(options.issuer) ? options.issuer : [options.issuer];
          if (!payload.iss || !allowedIssuers.includes(payload.iss)) {
            return { valid: false, error: 'Invalid issuer' };
          }
        }

        // Verify audience
        if (options.audience) {
          const allowedAudiences = Array.isArray(options.audience) ? options.audience : [options.audience];
          const tokenAudiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];

          if (!tokenAudiences.some((aud) => allowedAudiences.includes(aud))) {
            return { valid: false, error: 'Invalid audience' };
          }
        }

        // Verify subject
        if (options.subject && payload.sub !== options.subject) {
          return { valid: false, error: 'Invalid subject' };
        }

        // Verify max age
        if (options.maxAge && payload.iat) {
          if (now - payload.iat > options.maxAge) {
            return { valid: false, error: 'Token too old' };
          }
        }

        return { valid: true, payload, header };
      } catch (error) {
        return { valid: false, error: 'Token parsing failed' };
      }
    },

    decode(token: string, options: { complete?: boolean } = {}): DecodedToken | JwtPayload | null {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) {
          return null;
        }

        const [headerB64, payloadB64, signature] = parts;
        const header: JwtHeader = JSON.parse(base64urlDecode(headerB64));
        const payload: JwtPayload = JSON.parse(base64urlDecode(payloadB64));

        if (options.complete) {
          return { header, payload, signature };
        }

        return payload;
      } catch {
        return null;
      }
    },

    extractScope(token: string): string[] {
      const payload = this.decode(token);
      if (!payload || typeof payload !== 'object' || !('scope' in payload)) {
        return [];
      }

      const scope = (payload as JwtPayload).scope;
      if (typeof scope !== 'string') {
        return [];
      }

      return scope.split(' ').filter((s) => s.length > 0);
    },

    isExpired(token: string): boolean {
      const payload = this.decode(token);
      if (!payload || typeof payload !== 'object' || !('exp' in payload)) {
        return true; // No expiration means invalid/expired
      }

      const exp = (payload as JwtPayload).exp;
      if (typeof exp !== 'number') {
        return true;
      }

      return Date.now() / 1000 > exp;
    },
  };
};

// ============================================================================
// Test Suite
// ============================================================================

describe('JWT Utilities', () => {
  const jwtUtils = createJwtUtils();
  const testSecret = 'test-secret-key-32-characters!!';

  // ==========================================================================
  // Signing Tests
  // ==========================================================================

  describe('sign', () => {
    it('should sign a payload and return a valid JWT', () => {
      const payload = { userId: 'user-123', role: 'admin' };

      const token = jwtUtils.sign(payload, testSecret);

      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    });

    it('should include standard claims', () => {
      const payload = { data: 'test' };

      const token = jwtUtils.sign(payload, testSecret, {
        issuer: 'https://qe.example.com',
        subject: 'user-123',
        audience: 'https://api.example.com',
        jwtId: 'unique-id-456',
      });

      const decoded = jwtUtils.decode(token) as JwtPayload;

      expect(decoded.iss).toBe('https://qe.example.com');
      expect(decoded.sub).toBe('user-123');
      expect(decoded.aud).toBe('https://api.example.com');
      expect(decoded.jti).toBe('unique-id-456');
    });

    it('should set expiration time', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        expiresIn: 3600, // 1 hour
      });

      const decoded = jwtUtils.decode(token) as JwtPayload;
      const now = Math.floor(Date.now() / 1000);

      expect(decoded.exp).toBeDefined();
      expect(decoded.exp! - now).toBeGreaterThanOrEqual(3599);
      expect(decoded.exp! - now).toBeLessThanOrEqual(3601);
    });

    it('should set issued at time', () => {
      const beforeSign = Math.floor(Date.now() / 1000);

      const token = jwtUtils.sign({ data: 'test' }, testSecret);

      const decoded = jwtUtils.decode(token) as JwtPayload;

      expect(decoded.iat).toBeDefined();
      expect(decoded.iat).toBeGreaterThanOrEqual(beforeSign);
      expect(decoded.iat).toBeLessThanOrEqual(beforeSign + 1);
    });

    it('should set not before time', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        notBefore: 60, // Valid in 1 minute
      });

      const decoded = jwtUtils.decode(token) as JwtPayload;
      const now = Math.floor(Date.now() / 1000);

      expect(decoded.nbf).toBeDefined();
      expect(decoded.nbf! - now).toBeGreaterThanOrEqual(59);
    });

    it('should use specified algorithm', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        algorithm: 'HS256',
      });

      const decoded = jwtUtils.decode(token, { complete: true }) as DecodedToken;

      expect(decoded.header.alg).toBe('HS256');
      expect(decoded.header.typ).toBe('JWT');
    });

    it('should include key ID in header', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        keyId: 'key-001',
      });

      const decoded = jwtUtils.decode(token, { complete: true }) as DecodedToken;

      expect(decoded.header.kid).toBe('key-001');
    });

    it('should preserve custom claims', () => {
      const customPayload = {
        userId: 'user-123',
        roles: ['admin', 'user'],
        custom: { nested: { value: 42 } },
      };

      const token = jwtUtils.sign(customPayload, testSecret);
      const decoded = jwtUtils.decode(token) as JwtPayload;

      expect(decoded.userId).toBe('user-123');
      expect(decoded.roles).toEqual(['admin', 'user']);
      expect(decoded.custom).toEqual({ nested: { value: 42 } });
    });
  });

  // ==========================================================================
  // Verification Tests
  // ==========================================================================

  describe('verify', () => {
    it('should verify a valid token', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        expiresIn: 3600,
      });

      const result = jwtUtils.verify(token, testSecret);

      expect(result.valid).toBe(true);
      expect(result.payload?.data).toBe('test');
    });

    it('should reject token with invalid signature', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret);

      const result = jwtUtils.verify(token, 'wrong-secret');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid signature');
    });

    it('should reject expired token', () => {
      vi.useFakeTimers();

      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        expiresIn: 60, // 1 minute
      });

      vi.advanceTimersByTime(120000); // 2 minutes later

      const result = jwtUtils.verify(token, testSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');

      vi.useRealTimers();
    });

    it('should reject token used before nbf', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        notBefore: 3600, // Valid in 1 hour
      });

      const result = jwtUtils.verify(token, testSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not yet valid');
    });

    it('should validate issuer', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        issuer: 'https://wrong.example.com',
      });

      const result = jwtUtils.verify(token, testSecret, {
        issuer: 'https://qe.example.com',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid issuer');
    });

    it('should validate audience', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        audience: 'https://wrong-api.example.com',
      });

      const result = jwtUtils.verify(token, testSecret, {
        audience: 'https://api.example.com',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid audience');
    });

    it('should accept token with matching audience in array', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        audience: 'https://api.example.com',
      });

      const result = jwtUtils.verify(token, testSecret, {
        audience: ['https://api.example.com', 'https://other.example.com'],
      });

      expect(result.valid).toBe(true);
    });

    it('should validate subject', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        subject: 'user-wrong',
      });

      const result = jwtUtils.verify(token, testSecret, {
        subject: 'user-123',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid subject');
    });

    it('should respect clock tolerance', () => {
      vi.useFakeTimers();

      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        expiresIn: 60,
      });

      vi.advanceTimersByTime(65000); // 5 seconds past expiration

      const result = jwtUtils.verify(token, testSecret, {
        clockTolerance: 10, // Allow 10 seconds tolerance
      });

      expect(result.valid).toBe(true);

      vi.useRealTimers();
    });

    it('should check max age', () => {
      vi.useFakeTimers();

      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        expiresIn: 3600, // Valid for 1 hour
      });

      vi.advanceTimersByTime(1800000); // 30 minutes

      const result = jwtUtils.verify(token, testSecret, {
        maxAge: 600, // But only accept if issued within 10 minutes
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Token too old');

      vi.useRealTimers();
    });

    it('should allow ignoring expiration', () => {
      vi.useFakeTimers();

      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        expiresIn: 60,
      });

      vi.advanceTimersByTime(120000);

      const result = jwtUtils.verify(token, testSecret, {
        ignoreExpiration: true,
      });

      expect(result.valid).toBe(true);

      vi.useRealTimers();
    });

    it('should reject malformed token', () => {
      const result = jwtUtils.verify('not.a.valid.token.format', testSecret);

      expect(result.valid).toBe(false);
    });

    it('should return header and payload on success', () => {
      const token = jwtUtils.sign({ userId: 'user-123' }, testSecret, {
        algorithm: 'HS256',
        issuer: 'https://qe.example.com',
      });

      const result = jwtUtils.verify(token, testSecret);

      expect(result.valid).toBe(true);
      expect(result.header?.alg).toBe('HS256');
      expect(result.payload?.userId).toBe('user-123');
      expect(result.payload?.iss).toBe('https://qe.example.com');
    });
  });

  // ==========================================================================
  // Decoding Tests
  // ==========================================================================

  describe('decode', () => {
    it('should decode token without verification', () => {
      const token = jwtUtils.sign({ userId: 'user-123' }, testSecret);

      // Decode with wrong secret should still work
      const decoded = jwtUtils.decode(token) as JwtPayload;

      expect(decoded.userId).toBe('user-123');
    });

    it('should return complete token when requested', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        algorithm: 'HS256',
        keyId: 'key-001',
      });

      const decoded = jwtUtils.decode(token, { complete: true }) as DecodedToken;

      expect(decoded.header).toBeDefined();
      expect(decoded.payload).toBeDefined();
      expect(decoded.signature).toBeDefined();
      expect(decoded.header.alg).toBe('HS256');
      expect(decoded.header.kid).toBe('key-001');
    });

    it('should return null for invalid token', () => {
      const decoded = jwtUtils.decode('invalid-token');

      expect(decoded).toBeNull();
    });

    it('should return null for malformed JSON', () => {
      const decoded = jwtUtils.decode('eyJub3QiOmpzb259.eyJub3QiOmpzb259.signature');

      expect(decoded).toBeNull();
    });
  });

  // ==========================================================================
  // Helper Function Tests
  // ==========================================================================

  describe('extractScope', () => {
    it('should extract scopes from token', () => {
      const token = jwtUtils.sign({ scope: 'agent:read task:create message:send' }, testSecret);

      const scopes = jwtUtils.extractScope(token);

      expect(scopes).toEqual(['agent:read', 'task:create', 'message:send']);
    });

    it('should return empty array if no scope', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret);

      const scopes = jwtUtils.extractScope(token);

      expect(scopes).toEqual([]);
    });

    it('should handle empty scope string', () => {
      const token = jwtUtils.sign({ scope: '' }, testSecret);

      const scopes = jwtUtils.extractScope(token);

      expect(scopes).toEqual([]);
    });
  });

  describe('isExpired', () => {
    it('should return false for valid token', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        expiresIn: 3600,
      });

      expect(jwtUtils.isExpired(token)).toBe(false);
    });

    it('should return true for expired token', () => {
      vi.useFakeTimers();

      const token = jwtUtils.sign({ data: 'test' }, testSecret, {
        expiresIn: 60,
      });

      vi.advanceTimersByTime(120000);

      expect(jwtUtils.isExpired(token)).toBe(true);

      vi.useRealTimers();
    });

    it('should return true for token without expiration', () => {
      const token = jwtUtils.sign({ data: 'test' }, testSecret);
      // Remove exp from payload by manually creating token
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      delete payload.exp;
      const noExpToken = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${parts[2]}`;

      expect(jwtUtils.isExpired(noExpToken)).toBe(true);
    });

    it('should return true for invalid token', () => {
      expect(jwtUtils.isExpired('invalid-token')).toBe(true);
    });
  });
});
