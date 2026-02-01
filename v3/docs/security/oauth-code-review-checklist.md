# OAuth 2.0 Security Code Review Checklist

**Document Version:** 1.0.0
**Created:** 2026-01-31
**Author:** Security Auditor Agent
**Applies To:** All OAuth 2.0 related code changes in A2A Protocol

---

## Instructions for Reviewers

This checklist MUST be completed for all pull requests that touch:
- Authentication/authorization code
- Token handling (generation, validation, storage, revocation)
- OAuth endpoints (authorize, token, revoke, introspect)
- Client registration and management
- Scope definitions and enforcement
- Session management

**Reviewer must check each applicable item and sign off before approval.**

---

## 1. Token Generation and Handling

### 1.1 Random Number Generation
- [ ] **Tokens use CSPRNG** - `crypto.randomBytes()` or `crypto.randomUUID()` only
- [ ] **No Math.random()** - Never used for security-sensitive values
- [ ] **Minimum 256-bit entropy** - Tokens are at least 32 bytes (64 hex chars)
- [ ] **No predictable patterns** - No sequential, timestamp-only, or guessable IDs

```typescript
// CORRECT
const token = crypto.randomBytes(32).toString('hex');
const id = crypto.randomUUID();

// INCORRECT - MUST REJECT
const token = Math.random().toString(36);
const id = `token-${Date.now()}`;
```

### 1.2 Token Validation
- [ ] **Constant-time comparison** - Uses `crypto.timingSafeEqual()` or equivalent
- [ ] **Validate before use** - Token validated before any authorized action
- [ ] **Check expiration** - Token expiry checked on every request
- [ ] **Verify signature** - JWT signature verified with correct algorithm
- [ ] **No algorithm confusion** - Algorithm specified by server, not token

```typescript
// CORRECT
const isValid = crypto.timingSafeEqual(
  Buffer.from(providedToken),
  Buffer.from(storedToken)
);

// INCORRECT - TIMING ATTACK VULNERABLE
const isValid = providedToken === storedToken;
```

### 1.3 Token Storage
- [ ] **Encrypted at rest** - Tokens encrypted in database with AES-256-GCM
- [ ] **Secure memory handling** - Tokens not held in memory longer than needed
- [ ] **No localStorage** - Never store tokens in browser localStorage
- [ ] **HTTP-only cookies** - If using cookies, HttpOnly flag set

### 1.4 Token Transmission
- [ ] **Authorization header only** - Tokens sent in `Authorization: Bearer <token>`
- [ ] **Never in URL** - No tokens in query strings or path parameters
- [ ] **HTTPS enforced** - TLS 1.2+ required for all token endpoints

---

## 2. Authorization Code Flow

### 2.1 Authorization Request
- [ ] **State parameter required** - Minimum 128-bit random value
- [ ] **State validated on callback** - Exact match required
- [ ] **PKCE required for public clients** - `code_challenge` with S256 method
- [ ] **PKCE recommended for all clients** - Defense in depth
- [ ] **Redirect URI validated** - Exact match against registered URIs

### 2.2 Authorization Code Handling
- [ ] **Single-use enforcement** - Code invalidated after first exchange
- [ ] **Short lifetime** - Maximum 10 minutes, prefer 60 seconds
- [ ] **Bound to client_id** - Code only valid for requesting client
- [ ] **Bound to redirect_uri** - Code only valid for original redirect
- [ ] **PKCE verifier validated** - `code_verifier` matches `code_challenge`

### 2.3 Redirect URI Validation
- [ ] **Exact string match** - No regex, no wildcards
- [ ] **Pre-registered only** - URI must be in client's registered list
- [ ] **No localhost exceptions** - localhost URIs not allowed in production
- [ ] **No open redirects** - User data validated before redirect

```typescript
// CORRECT
const isValidRedirect = client.redirect_uris.includes(requestedUri);

// INCORRECT - VULNERABLE TO BYPASS
const isValidRedirect = requestedUri.startsWith(client.redirect_uri);
const isValidRedirect = client.redirect_uris.some(uri =>
  requestedUri.includes(uri)
);
```

---

## 3. Scope Enforcement

### 3.1 Scope Validation
- [ ] **Allowlist validation** - Only known scopes accepted
- [ ] **Format validation** - Scope format matches expected pattern
- [ ] **No injection** - Scope string sanitized before use
- [ ] **Case-sensitive** - Scope comparison is case-sensitive

### 3.2 Scope Grant
- [ ] **Never exceeds request** - Granted scopes <= requested scopes
- [ ] **Never exceeds client** - Granted scopes <= client's allowed scopes
- [ ] **Clear in response** - Granted scopes returned in token response

### 3.3 Scope Enforcement
- [ ] **Per-endpoint check** - Each endpoint validates required scopes
- [ ] **Hierarchy respected** - Parent scopes grant child permissions
- [ ] **Reduction only** - Delegated tokens cannot escalate scope

```typescript
// CORRECT - Explicit scope check
function requireScope(requiredScope: string) {
  return (req, res, next) => {
    const tokenScopes = req.token.scopes;
    if (!hasScope(tokenScopes, requiredScope)) {
      return res.status(403).json({ error: 'insufficient_scope' });
    }
    next();
  };
}

// INCORRECT - Missing scope check
app.post('/admin/action', (req, res) => {
  // No scope validation!
  performAdminAction();
});
```

---

## 4. Client Authentication

### 4.1 Client Credentials
- [ ] **Secrets hashed** - Argon2id with appropriate parameters
- [ ] **Secrets never logged** - Not in logs, errors, or traces
- [ ] **Secrets rotatable** - Mechanism exists for secret rotation
- [ ] **Minimum entropy** - Client secrets have 256-bit entropy

### 4.2 Client Validation
- [ ] **Required for confidential** - Confidential clients always authenticate
- [ ] **PKCE for public** - Public clients use PKCE instead of secrets
- [ ] **Rate limited** - Failed auth attempts limited per client

---

## 5. JWT Implementation (if applicable)

### 5.1 JWT Creation
- [ ] **Strong algorithm** - RS256, ES256, or stronger (never HS256 with weak key)
- [ ] **No 'none' algorithm** - Algorithm 'none' explicitly rejected
- [ ] **Required claims set** - iss, aud, exp, iat, jti present
- [ ] **Short lifetime** - exp set to 15 minutes or less

### 5.2 JWT Validation
- [ ] **Algorithm pinned** - Expected algorithm specified, not from token
- [ ] **Signature verified** - Full cryptographic verification
- [ ] **Issuer validated** - iss matches expected issuer
- [ ] **Audience validated** - aud matches expected audience
- [ ] **Expiration enforced** - exp checked against current time
- [ ] **JTI tracked** - JWT ID recorded to prevent replay

```typescript
// CORRECT - Algorithm specified by server
const payload = jwt.verify(token, publicKey, { algorithms: ['ES256'] });

// INCORRECT - ALGORITHM CONFUSION VULNERABLE
const payload = jwt.verify(token, key); // Uses alg from header!
```

---

## 6. Error Handling

### 6.1 Error Messages
- [ ] **No sensitive data** - Errors don't reveal tokens, secrets, or internals
- [ ] **No stack traces** - Stack traces not exposed to clients
- [ ] **Generic failures** - Authentication failures use generic messages
- [ ] **No user enumeration** - "Invalid credentials" not "User not found"

### 6.2 Error Logging
- [ ] **Log security events** - Failed auth, token misuse logged
- [ ] **Mask sensitive data** - Tokens/secrets masked in logs
- [ ] **Correlation IDs** - Requests traceable via correlation ID
- [ ] **Structured logging** - JSON format for parsing

---

## 7. Transport Security

### 7.1 TLS Configuration
- [ ] **TLS 1.2+ only** - No SSL 3.0, TLS 1.0, TLS 1.1
- [ ] **Strong ciphers** - Only approved cipher suites
- [ ] **HSTS enabled** - Strict-Transport-Security header set
- [ ] **Certificate validation** - No certificate bypass

### 7.2 Headers
- [ ] **CORS restrictive** - Origin allowlist, no wildcards with credentials
- [ ] **Referrer-Policy** - Set to `no-referrer` or `strict-origin`
- [ ] **X-Content-Type-Options** - Set to `nosniff`
- [ ] **Content-Security-Policy** - Appropriate CSP if serving HTML

---

## 8. Rate Limiting

### 8.1 Implementation
- [ ] **Token endpoint limited** - Rate limit on /token endpoint
- [ ] **Per-client tracking** - Limits tracked per client_id
- [ ] **Per-IP tracking** - Limits tracked per IP for unauthenticated
- [ ] **Retry-After header** - 429 responses include Retry-After

### 8.2 Failed Auth Handling
- [ ] **Progressive delay** - Increasing delay after failures
- [ ] **Account protection** - Lockout after excessive failures
- [ ] **Notification** - Alert on suspicious patterns

---

## 9. Logging and Audit

### 9.1 Required Events
- [ ] **Auth success** - Log successful authentications
- [ ] **Auth failure** - Log failed authentication attempts
- [ ] **Token issue** - Log token issuance (with masked token)
- [ ] **Token revoke** - Log token revocation
- [ ] **Scope change** - Log scope grant/deny decisions

### 9.2 Log Content
- [ ] **Timestamp** - ISO 8601 with timezone
- [ ] **Actor** - Client ID, user ID, IP address
- [ ] **Action** - What was attempted
- [ ] **Result** - Success/failure
- [ ] **No secrets** - Tokens, secrets, passwords never logged

---

## 10. Dependencies

### 10.1 Library Review
- [ ] **Known libraries** - Using well-maintained OAuth/JWT libraries
- [ ] **No CVEs** - Dependencies checked for known vulnerabilities
- [ ] **Minimal dependencies** - Only necessary libraries included
- [ ] **Pinned versions** - Versions locked in package-lock.json

### 10.2 Crypto Dependencies
- [ ] **No custom crypto** - Using standard crypto libraries
- [ ] **Node.js crypto** - Using built-in crypto module where possible
- [ ] **Audited libraries** - Third-party crypto libraries are audited

---

## Reviewer Sign-off

| Section | Reviewer | Date | Status |
|---------|----------|------|--------|
| Token Generation | | | |
| Authorization Flow | | | |
| Scope Enforcement | | | |
| Client Authentication | | | |
| JWT Implementation | | | |
| Error Handling | | | |
| Transport Security | | | |
| Rate Limiting | | | |
| Logging | | | |
| Dependencies | | | |

**Final Approval:**

- [ ] All critical items pass
- [ ] All high items pass or have documented exception
- [ ] Security tests added/updated
- [ ] No new vulnerabilities introduced

**Reviewer Signature:** _____________________ **Date:** _____________

---

## Common Vulnerability Patterns to Watch For

### Pattern 1: Token in URL
```typescript
// VULNERABILITY: Token exposed in URL
app.get('/api/resource?access_token=xxx')

// SECURE: Token in header
// Authorization: Bearer xxx
```

### Pattern 2: Algorithm Confusion
```typescript
// VULNERABILITY: Algorithm from token header
jwt.verify(token, key)

// SECURE: Algorithm pinned
jwt.verify(token, key, { algorithms: ['ES256'] })
```

### Pattern 3: Timing Attack
```typescript
// VULNERABILITY: Non-constant time comparison
if (providedToken === storedToken)

// SECURE: Constant time comparison
if (crypto.timingSafeEqual(Buffer.from(providedToken), Buffer.from(storedToken)))
```

### Pattern 4: Open Redirect
```typescript
// VULNERABILITY: Unvalidated redirect
res.redirect(req.query.redirect_uri)

// SECURE: Validate against allowlist
if (client.redirect_uris.includes(req.query.redirect_uri)) {
  res.redirect(req.query.redirect_uri)
}
```

### Pattern 5: Scope Injection
```typescript
// VULNERABILITY: Unsanitized scope
const grantedScopes = requestedScopes.split(' ');

// SECURE: Validate each scope
const grantedScopes = requestedScopes
  .split(' ')
  .filter(scope => KNOWN_SCOPES.includes(scope));
```

---

*Checklist maintained by Security Auditor Agent. Last updated: 2026-01-31*
