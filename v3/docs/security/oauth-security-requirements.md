# OAuth 2.0 Security Requirements for A2A Protocol

**Document Version:** 1.0.0
**Created:** 2026-01-31
**Author:** Security Auditor Agent
**Status:** ACTIVE
**Applies To:** ADR-054 A2A Protocol OAuth 2.0 Implementation

---

## Executive Summary

This document defines comprehensive security requirements for implementing OAuth 2.0 authentication in the A2A Protocol adapter. These requirements are based on:

- **OAuth 2.0 Security Best Current Practice (BCP)** - RFC 6819, draft-ietf-oauth-security-topics
- **OWASP OAuth 2.0 Security Guidelines**
- **A2A Protocol v0.3 Security Specifications**
- **NIST SP 800-63B Digital Identity Guidelines**

---

## 1. OWASP OAuth 2.0 Security Checklist

### 1.1 Authorization Server Requirements

| Requirement | Priority | Status | Implementation Notes |
|------------|----------|--------|---------------------|
| Use TLS 1.2+ for all OAuth endpoints | CRITICAL | REQUIRED | All `/a2a/*` endpoints must enforce HTTPS |
| Validate `redirect_uri` against pre-registered list | CRITICAL | REQUIRED | Exact string matching, no wildcards |
| Use cryptographic binding for authorization codes | HIGH | REQUIRED | Bind code to `client_id` and `redirect_uri` |
| Implement PKCE (RFC 7636) for public clients | HIGH | REQUIRED | Require `code_challenge` with S256 method |
| Enforce short-lived authorization codes (< 10 min) | HIGH | REQUIRED | Recommend 60-second expiration |
| Single-use authorization codes | CRITICAL | REQUIRED | Revoke after first use |
| Validate `state` parameter for CSRF protection | HIGH | REQUIRED | Minimum 128-bit entropy |
| Implement token rotation for refresh tokens | MEDIUM | RECOMMENDED | Issue new refresh token on each use |
| Bind tokens to client credentials | HIGH | REQUIRED | Token must reference authenticated client |

### 1.2 Client Requirements

| Requirement | Priority | Status | Implementation Notes |
|------------|----------|--------|---------------------|
| Store client secrets securely | CRITICAL | REQUIRED | Use encrypted storage, never in code |
| Use confidential clients when possible | HIGH | RECOMMENDED | Prefer server-side authentication |
| Implement PKCE for all authorization code flows | HIGH | REQUIRED | Use S256 code challenge method |
| Validate TLS certificates | CRITICAL | REQUIRED | No certificate pinning exemptions |
| Never expose tokens in URLs | HIGH | REQUIRED | Use POST body or Authorization header |
| Store tokens securely | CRITICAL | REQUIRED | Memory only, never localStorage |

### 1.3 Resource Server (A2A Endpoints) Requirements

| Requirement | Priority | Status | Implementation Notes |
|------------|----------|--------|---------------------|
| Validate access token on every request | CRITICAL | REQUIRED | Check signature, expiration, issuer |
| Verify token binding to client | HIGH | REQUIRED | Check `client_id` claim matches |
| Enforce scope restrictions | HIGH | REQUIRED | Reject requests with insufficient scopes |
| Use constant-time comparison for tokens | CRITICAL | REQUIRED | Prevent timing attacks |
| Return appropriate error codes | MEDIUM | REQUIRED | Use RFC 6750 error format |

---

## 2. Token Security Requirements

### 2.1 Token Generation

```typescript
interface TokenGenerationRequirements {
  // Minimum entropy for token generation
  accessTokenEntropyBits: 256;  // REQUIRED: 256-bit minimum
  refreshTokenEntropyBits: 256; // REQUIRED: 256-bit minimum

  // Token format
  accessTokenFormat: 'JWT' | 'opaque';
  preferredFormat: 'JWT'; // For stateless validation

  // Cryptographic requirements
  signingAlgorithm: 'RS256' | 'ES256'; // NEVER 'none' or HS256 with weak secret
  keyRotationPeriod: '90 days'; // Maximum key validity
}
```

**Token ID Requirements:**
- Must use cryptographically secure random number generator (CSPRNG)
- Node.js: `crypto.randomBytes(32)` or `crypto.randomUUID()`
- Never use `Math.random()` or predictable sequences

### 2.2 Token Storage

| Storage Location | Risk Level | Recommendation |
|-----------------|------------|----------------|
| Server-side memory | LOW | Preferred for server applications |
| Server-side database | MEDIUM | Encrypt with AES-256-GCM |
| HTTP-only cookies | MEDIUM | Use Secure, SameSite=Strict flags |
| localStorage/sessionStorage | HIGH | NEVER store tokens |
| URL query parameters | CRITICAL | NEVER expose tokens |

**Database Storage Schema:**
```typescript
interface SecureTokenStorage {
  // Hash token ID for lookups (SHA-256)
  tokenIdHash: string;

  // Encrypt token value with AES-256-GCM
  encryptedToken: {
    ciphertext: string;
    iv: string;      // 96-bit unique IV
    authTag: string; // GCM authentication tag
  };

  // Metadata (not encrypted, for queries)
  clientId: string;
  userId: string;
  scopes: string[];
  expiresAt: Date;
  createdAt: Date;

  // Security tracking
  lastUsedAt: Date;
  lastUsedIp: string;
  usageCount: number;
}
```

### 2.3 Token Transmission

| Requirement | Implementation |
|-------------|----------------|
| Always use HTTPS | TLS 1.2+ with strong cipher suites |
| Use Authorization header | `Authorization: Bearer <token>` |
| Never in query string | Tokens visible in logs, browser history |
| Never in referrer URLs | Use `Referrer-Policy: no-referrer` |
| Set proper CORS headers | Restrict `Access-Control-Allow-Origin` |

### 2.4 Token Expiration

```typescript
interface TokenExpirationPolicy {
  accessToken: {
    maxLifetime: '15 minutes';     // RECOMMENDED
    absoluteMaximum: '1 hour';     // MUST NOT exceed
    refreshable: true;
  };

  refreshToken: {
    maxLifetime: '7 days';         // RECOMMENDED for interactive
    absoluteMaximum: '90 days';    // MUST NOT exceed
    rotateOnUse: true;             // Issue new token on refresh
    revokeOnReuse: true;           // Detect token replay
  };

  authorizationCode: {
    maxLifetime: '60 seconds';     // RECOMMENDED
    absoluteMaximum: '10 minutes'; // MUST NOT exceed
    singleUse: true;               // REQUIRED
  };
}
```

### 2.5 Token Revocation

**Revocation Triggers:**
- User logout
- Password change
- Security incident
- Client deauthorization
- Suspicious activity detection
- Token reuse (for refresh tokens with rotation)

**Revocation Implementation:**
```typescript
interface TokenRevocationSystem {
  // Synchronous revocation for critical operations
  revokeToken(tokenId: string): Promise<void>;

  // Batch revocation for security incidents
  revokeAllUserTokens(userId: string): Promise<number>;
  revokeAllClientTokens(clientId: string): Promise<number>;

  // Revocation list for JWT validation (if using opaque tokens, not needed)
  revocationList: {
    type: 'bloom-filter' | 'redis-set';
    ttl: 'max-token-lifetime';
    checkOnEveryRequest: true;
  };
}
```

---

## 3. Scope Enforcement Requirements

### 3.1 Scope Hierarchy

```typescript
/**
 * A2A Protocol OAuth Scopes
 * Format: resource:action or resource:subresource:action
 */
const A2A_SCOPES = {
  // Task operations
  'tasks:read': 'Read task status and history',
  'tasks:write': 'Create and update tasks',
  'tasks:cancel': 'Cancel tasks',
  'tasks:admin': 'Full task management (includes all task scopes)',

  // Agent discovery
  'agents:discover': 'Discover and list agents',
  'agents:card': 'Access public agent cards',
  'agents:card:extended': 'Access extended agent cards with rate limits',

  // Message operations
  'message:send': 'Send messages to agents',
  'message:stream': 'Subscribe to streaming responses',

  // Push notifications
  'push:subscribe': 'Subscribe to push notifications',
  'push:manage': 'Manage push notification settings',

  // Admin operations (restricted)
  'admin:read': 'Read system configuration',
  'admin:write': 'Modify system configuration',
} as const;

// Scope hierarchy (higher scope implies lower)
const SCOPE_HIERARCHY: Record<string, string[]> = {
  'tasks:admin': ['tasks:read', 'tasks:write', 'tasks:cancel'],
  'agents:card:extended': ['agents:card'],
  'push:manage': ['push:subscribe'],
  'admin:write': ['admin:read'],
};
```

### 3.2 Scope Validation Rules

```typescript
interface ScopeValidationRules {
  // Never grant more scopes than requested
  grantMaximumScopes: false;

  // Scope request validation
  validateScopeFormat: /^[a-z]+:[a-z]+(:[a-z]+)?$/;
  maxScopesPerRequest: 10;
  rejectUnknownScopes: true;

  // Scope enforcement per endpoint
  endpointScopes: {
    'POST /a2a/tasks': ['tasks:write', 'message:send'],
    'GET /a2a/tasks/:id': ['tasks:read'],
    'POST /a2a/tasks/:id/cancel': ['tasks:cancel'],
    'GET /a2a/:agentId/card': ['agents:card'],
    'GET /a2a/:agentId/card?extended=true': ['agents:card:extended'],
    'GET /a2a/tasks/:id/subscribe': ['message:stream'],
  };
}
```

### 3.3 Dynamic Scope Reduction

When a task is delegated to a sub-agent:
- Scope must be equal to or less than parent
- Cannot request new scopes not in original grant
- Log all scope reductions for audit

---

## 4. PKCE Requirements (RFC 7636)

### 4.1 PKCE Implementation

```typescript
interface PKCERequirements {
  // Code verifier requirements
  codeVerifier: {
    minLength: 43;         // REQUIRED by RFC 7636
    maxLength: 128;        // REQUIRED by RFC 7636
    charset: '[A-Za-z0-9-._~]'; // Unreserved characters
    entropy: '256 bits';   // RECOMMENDED minimum
  };

  // Code challenge requirements
  codeChallenge: {
    method: 'S256';        // REQUIRED (plain is deprecated)
    algorithm: 'SHA-256';
    encoding: 'base64url'; // No padding
  };

  // Validation
  validation: {
    rejectPlainMethod: true;      // REQUIRED for security
    rejectMissingPKCE: true;      // For public clients
    validateOnTokenExchange: true;
  };
}
```

### 4.2 PKCE Flow

```
1. Client generates code_verifier (43-128 chars, CSPRNG)
2. Client computes code_challenge = BASE64URL(SHA256(code_verifier))
3. Authorization request includes: code_challenge, code_challenge_method=S256
4. Server stores code_challenge with authorization code
5. Token request includes: code_verifier
6. Server validates: BASE64URL(SHA256(code_verifier)) === stored_code_challenge
```

---

## 5. Rate Limiting Requirements

### 5.1 Rate Limit Tiers

```typescript
interface RateLimitConfiguration {
  // Per-client rate limits
  perClient: {
    tokenRequests: {
      limit: 100,
      window: '1 minute',
      action: 'reject-with-429',
    },
    authorizationRequests: {
      limit: 50,
      window: '1 minute',
      action: 'reject-with-429',
    },
  };

  // Per-IP rate limits (for unauthenticated endpoints)
  perIp: {
    discoveryRequests: {
      limit: 1000,
      window: '1 minute',
      action: 'slow-down',
    },
    failedAuthAttempts: {
      limit: 5,
      window: '15 minutes',
      action: 'temporary-lockout',
      lockoutDuration: '30 minutes',
    },
  };

  // Global rate limits
  global: {
    totalRequests: {
      limit: 10000,
      window: '1 second',
      action: 'queue-or-reject',
    },
  };
}
```

### 5.2 Rate Limit Response Headers

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1706745600
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "error": {
    "code": -32030,
    "message": "Rate limit exceeded",
    "data": {
      "retryAfter": 60
    }
  }
}
```

### 5.3 Failed Authentication Tracking

```typescript
interface FailedAuthTracking {
  // Track failed attempts per client_id and IP
  trackingKey: 'client_id' | 'ip_address' | 'both';

  // Progressive delays
  progressiveDelay: {
    attempt1_2: 0,        // No delay
    attempt3_4: 1000,     // 1 second
    attempt5_6: 5000,     // 5 seconds
    attempt7_9: 30000,    // 30 seconds
    attempt10Plus: 'lockout',
  };

  // Lockout policy
  lockout: {
    duration: '30 minutes';
    notifyAdmin: true;
    logSecurityEvent: true;
  };

  // Reset on successful auth
  resetOnSuccess: true;
}
```

---

## 6. Audit Logging Requirements

### 6.1 Security Events to Log

| Event Category | Events | Priority |
|---------------|--------|----------|
| Authentication | Login success, login failure, logout, token refresh | CRITICAL |
| Authorization | Scope granted, scope denied, permission check | HIGH |
| Token Lifecycle | Token issued, token revoked, token expired | HIGH |
| Rate Limiting | Limit reached, lockout triggered, lockout released | MEDIUM |
| Configuration | Client registered, client modified, scope changed | HIGH |
| Anomalies | Unusual IP, token reuse, suspicious patterns | CRITICAL |

### 6.2 Log Entry Format

```typescript
interface SecurityAuditLog {
  // Event identification
  id: string;              // UUID
  timestamp: string;       // ISO 8601 with timezone
  eventType: string;       // e.g., 'oauth.token.issued'
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

  // Actor information
  actor: {
    type: 'client' | 'user' | 'system';
    id: string;
    ip: string;
    userAgent?: string;
  };

  // Resource affected
  resource: {
    type: 'token' | 'client' | 'user' | 'scope';
    id: string;
  };

  // Action details
  action: {
    type: string;
    result: 'success' | 'failure' | 'denied';
    reason?: string;
  };

  // Security context
  security: {
    riskScore?: number;     // 0-100
    threatIndicators?: string[];
    mitigationApplied?: string;
  };

  // Correlation
  correlationId?: string;   // Request trace ID
  sessionId?: string;
  parentEventId?: string;   // For event chains
}
```

### 6.3 Log Retention and Protection

```typescript
interface AuditLogPolicy {
  // Retention
  retention: {
    securityEvents: '2 years';    // Compliance requirement
    generalEvents: '90 days';
    debugLogs: '7 days';
  };

  // Protection
  protection: {
    encrypted: true;              // At rest
    immutable: true;              // Write-once
    integrityChecked: true;       // Hash chains
    accessLogged: true;           // Log access to logs
  };

  // Access control
  accessControl: {
    readAccess: ['security-team', 'compliance-team'];
    exportAccess: ['security-lead', 'legal'];
    deleteAccess: ['none'];       // Immutable
  };
}
```

---

## 7. Threat Model

### 7.1 Token Theft

**Threat:** Attacker obtains valid access or refresh token.

**Attack Vectors:**
- Man-in-the-middle (MITM)
- XSS injection
- Malicious browser extensions
- Compromised client application
- Server-side data breach

**Mitigations:**
| Mitigation | Implementation | Effectiveness |
|------------|----------------|---------------|
| Short token lifetime | 15-minute access tokens | HIGH |
| Refresh token rotation | New token on each refresh | HIGH |
| Token binding to IP/device | Validate request context | MEDIUM |
| Secure storage | Encrypted, memory-only | HIGH |
| TLS enforcement | HTTPS only, HSTS | HIGH |
| Token revocation API | Immediate invalidation | HIGH |

### 7.2 Scope Escalation

**Threat:** Attacker gains unauthorized permissions.

**Attack Vectors:**
- Parameter tampering
- Scope injection in authorization request
- Exploiting scope hierarchy bugs
- Confused deputy attacks

**Mitigations:**
| Mitigation | Implementation | Effectiveness |
|------------|----------------|---------------|
| Strict scope validation | Regex + allowlist | HIGH |
| Never grant unrequested scopes | Server-side enforcement | CRITICAL |
| Scope reduction only | Child tokens <= parent | HIGH |
| Consent screen verification | User confirms scopes | HIGH |

### 7.3 Client Impersonation

**Threat:** Attacker poses as legitimate OAuth client.

**Attack Vectors:**
- Stolen client credentials
- Redirect URI hijacking
- Phishing with similar client name

**Mitigations:**
| Mitigation | Implementation | Effectiveness |
|------------|----------------|---------------|
| Client authentication | client_secret or mTLS | HIGH |
| Strict redirect_uri validation | Exact match only | CRITICAL |
| Client registration review | Manual approval process | MEDIUM |
| PKCE for public clients | code_challenge validation | HIGH |

### 7.4 Replay Attacks

**Threat:** Attacker reuses captured tokens or codes.

**Attack Vectors:**
- Authorization code replay
- Refresh token replay
- Access token replay (within validity)

**Mitigations:**
| Mitigation | Implementation | Effectiveness |
|------------|----------------|---------------|
| Single-use authorization codes | Immediate invalidation | CRITICAL |
| Refresh token rotation | Detect reuse | HIGH |
| Nonce validation | Required for OIDC | HIGH |
| Request timestamp validation | Reject stale requests | MEDIUM |
| JTI (JWT ID) tracking | Prevent JWT replay | HIGH |

### 7.5 CSRF Attacks

**Threat:** Attacker forces user to authorize malicious client.

**Attack Vectors:**
- Cross-site request forgery
- Login CSRF
- OAuth state parameter bypass

**Mitigations:**
| Mitigation | Implementation | Effectiveness |
|------------|----------------|---------------|
| Mandatory state parameter | 128-bit minimum entropy | CRITICAL |
| State parameter binding | Tie to user session | HIGH |
| SameSite cookies | SameSite=Strict | MEDIUM |
| Origin header validation | Check request origin | HIGH |

---

## 8. Security Checklist for Code Review

### 8.1 Pre-Implementation Review

- [ ] Security requirements document reviewed and approved
- [ ] Threat model completed and reviewed
- [ ] Security test plan created
- [ ] Dependencies audited for known vulnerabilities
- [ ] Cryptographic libraries reviewed (no custom crypto)

### 8.2 Token Implementation Review

- [ ] Tokens generated using CSPRNG (`crypto.randomBytes`)
- [ ] Token entropy >= 256 bits
- [ ] Tokens never logged or exposed in errors
- [ ] Constant-time comparison used for token validation
- [ ] Token expiration enforced on every request
- [ ] Revocation check on every request (if using JWT revocation list)

### 8.3 Authorization Code Flow Review

- [ ] `redirect_uri` validated against registered URIs (exact match)
- [ ] Authorization codes single-use (invalidated after first exchange)
- [ ] Authorization codes short-lived (< 10 minutes, prefer 60 seconds)
- [ ] PKCE required for public clients
- [ ] `state` parameter required and validated
- [ ] Code bound to `client_id` and `redirect_uri`

### 8.4 Scope Implementation Review

- [ ] Scope validation uses allowlist (not blocklist)
- [ ] Unknown scopes rejected
- [ ] Scopes not granted beyond what was requested
- [ ] Scope enforcement on every protected endpoint
- [ ] Scope reduction enforced for delegated tokens

### 8.5 Error Handling Review

- [ ] Error messages do not leak sensitive information
- [ ] Stack traces not exposed to clients
- [ ] Invalid tokens return generic "invalid_token" error
- [ ] Failed authentication not distinguishable from "user not found"
- [ ] Rate limit errors include `Retry-After` header

### 8.6 Logging and Monitoring Review

- [ ] All security events logged
- [ ] Logs do not contain tokens, secrets, or PII
- [ ] Token IDs (not values) logged for correlation
- [ ] Failed authentication attempts logged with IP
- [ ] Log integrity protected (append-only, hashed)

### 8.7 Transport Security Review

- [ ] TLS 1.2+ required for all OAuth endpoints
- [ ] HSTS header configured
- [ ] Secure cookies (HttpOnly, Secure, SameSite)
- [ ] CORS configured restrictively
- [ ] Tokens never in URL query strings

---

## 9. Compliance Mapping

### 9.1 SOC 2 Controls

| SOC 2 Control | OAuth Implementation |
|--------------|---------------------|
| CC6.1 Logical Access | Token-based authentication, scope enforcement |
| CC6.2 System Boundaries | API gateway with OAuth validation |
| CC6.3 Access Removal | Token revocation on deprovisioning |
| CC6.6 Access Provisioning | Client registration workflow |
| CC7.1 Security Events | Security audit logging |
| CC7.2 Anomaly Detection | Failed auth monitoring, rate limiting |

### 9.2 GDPR Considerations

| GDPR Article | OAuth Implementation |
|-------------|---------------------|
| Art. 25 Privacy by Design | Minimal scope grants, token minimization |
| Art. 32 Security Measures | Encryption, access control, audit logs |
| Art. 33 Breach Notification | Token revocation, audit trail |
| Art. 17 Right to Erasure | Token revocation, log anonymization |

---

## 10. Implementation Recommendations

### 10.1 Recommended Libraries

```typescript
// Node.js OAuth 2.0 Implementation Stack
const recommendations = {
  // JWT creation and validation
  jwt: 'jose',                    // Modern, well-maintained

  // Password hashing (for client secrets)
  hashing: 'argon2',              // Memory-hard, modern

  // CSPRNG
  random: 'crypto.randomBytes',   // Node.js built-in

  // Rate limiting
  rateLimit: '@fastify/rate-limit' | 'express-rate-limit',

  // Token storage
  cache: 'ioredis',               // For token revocation lists

  // Audit logging
  logging: 'pino',                // Structured, performant
};
```

### 10.2 Configuration Example

```typescript
const oauthConfig: OAuth2Config = {
  // Token settings
  tokens: {
    accessToken: {
      lifetime: 15 * 60,          // 15 minutes
      algorithm: 'ES256',
      issuer: 'https://a2a.example.com',
    },
    refreshToken: {
      lifetime: 7 * 24 * 60 * 60, // 7 days
      rotateOnUse: true,
    },
    authorizationCode: {
      lifetime: 60,               // 60 seconds
    },
  },

  // PKCE settings
  pkce: {
    required: true,
    methods: ['S256'],            // Only S256, no plain
  },

  // Client settings
  clients: {
    allowPublicClients: true,
    requirePKCEForPublic: true,
    secretHashAlgorithm: 'argon2id',
  },

  // Rate limits
  rateLimit: {
    enabled: true,
    windowMs: 60000,
    maxRequests: 100,
  },

  // Security
  security: {
    enforceHttps: true,
    requireState: true,
    validateRedirectUri: 'exact',
  },
};
```

---

## Appendix A: Reference Documents

1. **OAuth 2.0 RFCs:**
   - RFC 6749: The OAuth 2.0 Authorization Framework
   - RFC 6750: Bearer Token Usage
   - RFC 6819: OAuth 2.0 Threat Model and Security Considerations
   - RFC 7636: PKCE (Proof Key for Code Exchange)
   - RFC 7662: Token Introspection
   - RFC 7009: Token Revocation

2. **OWASP Resources:**
   - OWASP OAuth 2.0 Security Guidelines
   - OWASP API Security Top 10

3. **Industry Standards:**
   - NIST SP 800-63B: Digital Identity Guidelines
   - PCI DSS v4.0: Payment Card Industry Data Security Standard

---

*Document maintained by Security Auditor Agent. Last reviewed: 2026-01-31*
