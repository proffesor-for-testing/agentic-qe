# Superplane Security Audit Report

**Audit Date**: 2026-03-06
**Auditor**: V3 QE Security Auditor
**Scope**: Full codebase at `/tmp/superplane`
**Standards**: OWASP Top 10 2021, CWE/SANS Top 25

---

## Executive Summary

The Superplane project is a Go-based DevOps control plane with OAuth/password authentication, gRPC + REST APIs, RBAC via Casbin, AES-GCM encryption for secrets, and 37+ third-party integrations. The codebase demonstrates generally strong security practices: parameterized database queries via GORM, bcrypt password hashing, proper HMAC signature verification in integrations, and SSRF protection on outbound HTTP. However, the audit identified **4 HIGH**, **6 MEDIUM**, and **5 LOW** severity findings that require attention.

---

## Findings by Severity

### CRITICAL (0 findings)

No critical vulnerabilities identified.

---

### HIGH (4 findings)

#### H-1: HMAC Signature Verification Uses Non-Constant-Time String Comparison (CWE-208)

**OWASP**: A02:2021 - Cryptographic Failures
**File**: `pkg/crypto/hmac.go:14`
**Evidence**:
```go
computed := fmt.Sprintf("%x", h.Sum(nil))
if computed != signature {
    return fmt.Errorf("invalid signature")
}
```

The webhook HMAC signature verification uses a direct string equality comparison (`!=`) instead of `hmac.Equal()` or `subtle.ConstantTimeCompare()`. This is vulnerable to timing side-channel attacks, allowing an attacker to iteratively guess the correct HMAC byte-by-byte by measuring response times.

This is particularly impactful because this function is used by the webhook trigger (`pkg/triggers/webhook/webhook.go:255`) to authenticate incoming webhook requests, which are internet-facing.

Note: The individual integrations (Slack, GitLab, Grafana, etc.) correctly use `hmac.Equal()` or `subtle.ConstantTimeCompare()` for their own signature checks, but the core `VerifySignature` function does not.

**Remediation**:
```go
import "crypto/hmac"

func VerifySignature(key []byte, data []byte, signature string) error {
    h := hmac.New(sha256.New, key)
    h.Write(data)
    computed := fmt.Sprintf("%x", h.Sum(nil))
    if !hmac.Equal([]byte(computed), []byte(signature)) {
        return fmt.Errorf("invalid signature")
    }
    return nil
}
```

---

#### H-2: NoOpEncryptor Available in Production via Environment Variable (CWE-311)

**OWASP**: A02:2021 - Cryptographic Failures
**File**: `pkg/server/server.go:334-336`
**Evidence**:
```go
if os.Getenv("NO_ENCRYPTION") == "yes" {
    log.Warn("NO_ENCRYPTION is set to yes, using NoOpEncryptor")
    encryptorInstance = crypto.NewNoOpEncryptor()
}
```

Setting `NO_ENCRYPTION=yes` in production causes all secret data (OAuth access tokens, webhook secrets, integration credentials, SMTP passwords) to be stored in plaintext in the database. The `NoOpEncryptor` returns data completely unmodified. This is used in `docker-compose.dev.yml` (`NO_ENCRYPTION: "yes"`) and in test code, but there is no guard preventing its use in production.

Additionally, the dev compose file hardcodes `ENCRYPTION_KEY: 1234567890abcdefghijklmnopqrstuv` -- if any production deployment uses this same value, all secrets are trivially decryptable.

**Remediation**:
- Remove the `NO_ENCRYPTION` code path entirely, or restrict it with an additional `APP_ENV == "development"` guard.
- Add a startup check that `ENCRYPTION_KEY` meets minimum entropy requirements (reject known weak keys).
- Remove all hardcoded keys from `docker-compose.dev.yml` and use `.env` files (which are already in `.gitignore`).

---

#### H-3: Cookie Secure Flag Depends on Request TLS State, Not Configuration (CWE-614)

**OWASP**: A07:2021 - Identification and Authentication Failures
**Files**: `pkg/authentication/authentication.go:275,381,484`, `pkg/public/setup_owner.go:164`
**Evidence**:
```go
http.SetCookie(w, &http.Cookie{
    Secure:   r.TLS != nil,
    // ...
})
```

The `Secure` flag on authentication cookies is set based on `r.TLS != nil`. Behind a TLS-terminating load balancer or reverse proxy (the standard production deployment), `r.TLS` will be `nil` even though the external connection is HTTPS. This means authentication cookies will be sent over unencrypted connections, making them susceptible to network interception.

**Remediation**:
- Use a configuration flag (e.g., `COOKIE_SECURE=true`) or derive from the `BASE_URL` scheme:
```go
Secure: strings.HasPrefix(os.Getenv("BASE_URL"), "https://"),
```

---

#### H-4: No Password Complexity or Strength Validation (CWE-521)

**OWASP**: A07:2021 - Identification and Authentication Failures
**Files**: `pkg/authentication/authentication.go:392-489` (signup), `pkg/public/setup_owner.go:36-172` (owner setup)
**Evidence**: Both `handlePasswordSignup` and `setupOwner` accept any non-empty password with no length, complexity, or entropy requirements.

The only validation is:
```go
if name == "" || email == "" || password == "" {
    http.Error(w, "Name, email, and password are required", http.StatusBadRequest)
```

A single-character password is accepted. This is a DevOps control plane that manages CI/CD secrets, deployments, and integrations -- weak passwords pose a significant risk.

**Remediation**:
- Enforce minimum 12 characters with mixed character classes.
- Consider checking against common password dictionaries.
- Implement both server-side and client-side validation.

---

### MEDIUM (6 findings)

#### M-1: No Rate Limiting on Authentication Endpoints (CWE-307)

**OWASP**: A07:2021 - Identification and Authentication Failures
**Files**: `pkg/authentication/authentication.go:316-390` (login), `pkg/public/setup_owner.go` (owner setup)

The password login endpoint (`POST /login`), signup endpoint (`POST /signup`), and owner setup endpoint have no rate limiting or account lockout mechanism. An attacker can perform unlimited brute-force password guessing attempts. The search for `rate.?limit|rateLimit|throttl` across the entire `pkg/` directory returned no hits for API-level rate limiting.

**Remediation**:
- Implement per-IP and per-account rate limiting on `/login` and `/signup`.
- Add progressive delays or temporary lockouts after N failed attempts.
- Consider using a middleware like `golang.org/x/time/rate`.

---

#### M-2: gRPC Server Reflection Enabled Unconditionally (CWE-200)

**OWASP**: A05:2021 - Security Misconfiguration
**File**: `pkg/grpc/server.go:131`
**Evidence**:
```go
reflection.Register(grpcServer)
```

gRPC server reflection is registered unconditionally, exposing the full service and message schema to any client that can reach the gRPC port. This allows attackers to enumerate all available RPC methods, message types, and field names, significantly reducing the effort needed to craft attacks.

**Remediation**:
- Gate reflection behind an environment variable:
```go
if os.Getenv("APP_ENV") == "development" {
    reflection.Register(grpcServer)
}
```

---

#### M-3: OAuth Refresh Tokens Stored Unencrypted (CWE-312)

**OWASP**: A02:2021 - Cryptographic Failures
**File**: `pkg/authentication/authentication.go:575`
**Evidence**:
```go
accountProvider.RefreshToken = gothUser.RefreshToken
```

While OAuth access tokens are encrypted before storage (`encryptor.Encrypt`), the refresh token is stored as-is in plaintext. Refresh tokens are long-lived credentials that can be used to generate new access tokens. If the database is compromised, an attacker gains persistent access to users' GitHub/Google accounts.

**Remediation**:
- Encrypt refresh tokens the same way access tokens are encrypted before storage.

---

#### M-4: Webhook "None" Authentication Mode Allows Unauthenticated Triggers (CWE-306)

**OWASP**: A07:2021 - Identification and Authentication Failures
**File**: `pkg/triggers/webhook/webhook.go:113,227-301`
**Evidence**:
```go
{Label: "None (unsafe)", Value: "none"},
```

The webhook trigger supports a "none" authentication mode. When `config.Authentication` is anything other than "signature", "bearer", or "header_token", the `HandleWebhook` switch statement falls through without any authentication check. The code correctly labels it as "unsafe" in the UI, but there is no server-side warning log, no audit trail, and no ability for org admins to disallow it via RBAC policy.

**Remediation**:
- Add an explicit `case "none":` with an audit log entry.
- Consider adding an org-level setting to disallow unauthenticated webhooks.
- At minimum, log a warning when a webhook with no authentication receives a request.

---

#### M-5: Hardcoded Development Credentials in docker-compose.dev.yml (CWE-798)

**OWASP**: A07:2021 - Identification and Authentication Failures
**File**: `docker-compose.dev.yml:20,58-66,119,130`
**Evidence**:
```yaml
DB_PASSWORD: "the-cake-is-a-lie"
ENCRYPTION_KEY: 1234567890abcdefghijklmnopqrstuv
JWT_SECRET: 1234567890abcdefghijklmnopqrstuv
SESSION_SECRET: 1234567890abcdefghijklmnopqrstuv
GITHUB_CLIENT_ID: 1234567890abcdefghijklmnopqrstuv
GITHUB_CLIENT_SECRET: 1234567890abcdefghijklmnopqrstuv
GOOGLE_CLIENT_ID: 1234567890abcdefghijklmnopqrstuv
GOOGLE_CLIENT_SECRET: 1234567890abcdefghijklmnopqrstuv
```

**Severity Calibration**: The `docker-compose.dev.yml` is committed to the repository. While `.env` is listed in `.gitignore`, the compose file itself contains hardcoded placeholder secrets. These are clearly dev-only values, but they establish dangerous patterns:
- `JWT_SECRET` and `ENCRYPTION_KEY` use the same value, so a key compromise affects both token signing and data encryption.
- `RABBITMQ_URL: "amqp://guest:guest@rabbitmq:5672"` uses default RabbitMQ credentials.
- The `pgweb` service exposes the database UI with the hardcoded password.

**Remediation**:
- Move all secrets to `.env.example` (with placeholder instructions) and use `.env` for actual values.
- Use different values for `JWT_SECRET` and `ENCRYPTION_KEY`.
- Add a startup validator that rejects the placeholder values outside development mode.

---

#### M-6: Discord Webhook Notification Vulnerable to Command Injection (CWE-78)

**OWASP**: A03:2021 - Injection
**File**: `.github/workflows/discord-release.yml:13-23`
**Evidence**:
```yaml
-d '{
  "embeds": [{
    "title": "New Release: '"${{ github.event.release.tag_name }}"'",
    "url": "'"${{ github.event.release.html_url }}"'",
    "description": "'"${{ github.event.release.name }}"'"
  }]
}'
```

The release tag name and release name are injected directly into the shell command without sanitization. An attacker with repository write access could create a release with a crafted tag name containing shell metacharacters or JSON injection payloads, potentially leaking the `DISCORD_RELEASES_WEBHOOK_URL` secret.

**Remediation**:
- Use a dedicated GitHub Action for Discord notifications, or set event data as environment variables and reference them safely:
```yaml
env:
  TAG_NAME: ${{ github.event.release.tag_name }}
  RELEASE_URL: ${{ github.event.release.html_url }}
run: |
  jq -n --arg tag "$TAG_NAME" --arg url "$RELEASE_URL" \
    '{"embeds":[{"title":("New Release: " + $tag),"url":$url}]}' | \
    curl -X POST -H "Content-Type: application/json" -d @- "${{ secrets.DISCORD_RELEASES_WEBHOOK_URL }}"
```

---

### LOW (5 findings)

#### L-1: JWT Uses HS256 (Symmetric HMAC) Instead of Asymmetric Signing (CWE-327)

**OWASP**: A02:2021 - Cryptographic Failures
**File**: `pkg/jwt/jwt.go:21`
**Evidence**:
```go
token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{...})
```

The authentication JWT uses HS256 (HMAC-SHA256) with a shared secret. This means every service instance that needs to verify tokens must have the secret, increasing the attack surface. The OIDC provider correctly uses RS256 (RSA) asymmetric signing. Consider migrating the auth JWT to RS256 as well for defense-in-depth, though HS256 is not inherently broken when the secret is properly managed.

---

#### L-2: JWT Token Duration is Fixed at 24 Hours with No Rotation (CWE-613)

**OWASP**: A07:2021 - Identification and Authentication Failures
**File**: `pkg/authentication/authentication.go:263`
**Evidence**:
```go
token, err := a.jwtSigner.Generate(account.ID.String(), 24*time.Hour)
```

All JWT tokens have a fixed 24-hour lifetime with no refresh token mechanism. If a token is compromised, there is no way to revoke it before expiration. Shorter-lived tokens with refresh capabilities would reduce the window of exposure.

---

#### L-3: Error Messages May Leak Internal State in gRPC Interceptor (CWE-209)

**OWASP**: A04:2021 - Insecure Design
**File**: `pkg/grpc/error_sanitizer.go:43`
**Evidence**:
```go
if _, ok := status.FromError(err); ok {
    return err
}
```

The error sanitizer passes through any error that is already a gRPC status error without sanitization. If handler code accidentally wraps sensitive details in a `status.Error(codes.Internal, sensitiveMessage)`, it will reach the client. The sanitizer only catches non-status errors and GORM/PG errors. This is acceptable but worth noting.

---

#### L-4: Development Authentication Bypass Route Has Redundant Guard (CWE-284)

**OWASP**: A01:2021 - Broken Access Control
**File**: `pkg/authentication/authentication.go:101-106,134-138`

The dev auth handler at `/auth/{provider}/callback` has a proper `if !a.isDev` guard at line 135-137, and the route is only registered when `a.isDev` is true (line 101-106). This is good defense-in-depth. No vulnerability here, but ensure `APP_ENV` is never set to `development` in production environments. There is no explicit production safeguard beyond the environment variable check.

---

#### L-5: Database SSL Disabled in Development Compose (CWE-319)

**OWASP**: A02:2021 - Cryptographic Failures
**File**: `docker-compose.dev.yml:18`
**Evidence**:
```yaml
POSTGRES_DB_SSL: "false"
```

Database connections use `sslmode=disable` in development. This is expected for local development but ensure production deployments enforce `POSTGRES_DB_SSL: "true"`.

---

## OWASP Top 10 2021 Coverage Summary

| Category | Status | Findings |
|----------|--------|----------|
| A01 Broken Access Control | PASS | 0 (RBAC via Casbin is comprehensive) |
| A02 Cryptographic Failures | FAIL | H-1, H-2, M-3, L-1, L-5 |
| A03 Injection | PASS* | M-6 (CI/CD only, no SQL injection found) |
| A04 Insecure Design | PASS | L-3 |
| A05 Security Misconfiguration | FAIL | M-2, M-5 |
| A06 Vulnerable Components | PASS | Dependencies are current |
| A07 Auth Failures | FAIL | H-3, H-4, M-1, M-4, L-2 |
| A08 Software Integrity | PASS | Go modules with checksums |
| A09 Logging Failures | PASS | Structured logging, no PII in logs |
| A10 SSRF | PASS | DNS rebinding + private IP protection |

---

## Positive Security Findings

The following security practices deserve recognition:

1. **No SQL Injection**: All database queries use GORM's parameterized interface. No string-concatenated SQL found anywhere in the codebase. The 197 SQL migrations use DDL statements (CREATE/ALTER/DROP) which are not injection-susceptible.

2. **SSRF Protection**: The `pkg/registry/http.go` implements robust SSRF defenses including DNS rebinding protection (IP validation at connect-time via `Dialer.Control`), blocked host lists, private IP range blocking, redirect validation, and response size limits.

3. **Bcrypt Password Hashing**: Uses `bcrypt` with cost factor 12 (`pkg/crypto/password.go`), which is appropriate.

4. **AES-256-GCM Encryption**: Secret data uses AES-GCM with random nonces and authenticated associated data (`pkg/crypto/aes_gcm_encryptor.go`). The implementation correctly prepends the nonce and validates ciphertext length.

5. **Comprehensive RBAC**: The Casbin-based authorization system (`pkg/authorization/`) covers all gRPC endpoints with granular resource/action permissions. The interceptor pattern ensures no endpoint can bypass authorization. Custom roles properly validate against existing policies.

6. **Service Account Tokens**: Tokens are stored as SHA-256 hashes (`pkg/crypto/sha256.go:HashToken`), generated with 64 bytes of crypto/rand entropy, and verified via constant-time hash comparison.

7. **gRPC Error Sanitization**: Internal errors are sanitized before reaching clients (`pkg/grpc/error_sanitizer.go`), preventing leakage of database errors or stack traces.

8. **Container Security**: The Dockerfile uses a multi-stage build, runs as `nobody` user, and does not install unnecessary packages in the runner stage.

9. **Open Redirect Protection**: The `isValidRedirectURL` function (`pkg/authentication/authentication.go:623-633`) properly rejects external URLs and protocol-relative URLs.

10. **Integration Signature Verification**: All 37+ integrations that accept webhooks use constant-time comparison (`hmac.Equal` or `subtle.ConstantTimeCompare`) for their signature checks.

---

## Dependency Assessment

**Go version**: 1.25 (current)
**Key dependencies** (from `go.mod`):
- `golang-jwt/jwt/v4` v4.5.2 -- current, no known CVEs
- `casbin/casbin/v2` v2.134.0 -- current
- `golang.org/x/crypto` v0.47.0 -- current
- `jackc/pgx/v5` v5.5.5 -- current
- `gorilla/mux` v1.8.1 -- maintenance mode but stable
- `gorilla/websocket` v1.5.3 -- current
- `gorm.io/gorm` v1.26.0 -- current
- `grpc-ecosystem/go-grpc-middleware/v2` v2.3.1 -- current
- `markbates/goth` v1.81.0 -- current

No known CVEs identified in the direct dependencies at this time.

---

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | H-1: HMAC timing attack | 5 min | Webhook auth bypass |
| 2 | H-3: Cookie Secure flag | 15 min | Session hijacking |
| 3 | H-4: Password policy | 1 hour | Brute force |
| 4 | H-2: NoOpEncryptor guard | 30 min | Data exposure |
| 5 | M-1: Rate limiting | 2-4 hours | Brute force |
| 6 | M-3: Encrypt refresh tokens | 30 min | Token theft |
| 7 | M-2: gRPC reflection | 5 min | Info disclosure |
| 8 | M-4: Webhook none audit | 30 min | Audit trail |
| 9 | M-5: Dev credentials | 1 hour | Key reuse |
| 10 | M-6: Discord injection | 30 min | Secret leak |

---

## Methodology

- **Static Analysis**: Manual code review of all files in authentication, authorization, crypto, JWT, OIDC, secrets, triggers, web, and gRPC packages.
- **Pattern Search**: Regex scanning for SQL injection, hardcoded secrets, unsafe crypto, logging of sensitive data, exec injection, CORS misconfigurations, and TLS issues.
- **Dependency Audit**: Review of go.mod for known vulnerable versions.
- **Configuration Audit**: Review of Dockerfile, docker-compose.dev.yml, RBAC policies, and CI/CD workflows.
- **OWASP Coverage**: Each OWASP Top 10 2021 category was systematically checked.

**Files Audited**: 60+ Go source files, 2 RBAC policy files, 1 Dockerfile, 1 docker-compose file, 2 CI/CD workflows, 197 SQL migrations (sampled), go.mod.
