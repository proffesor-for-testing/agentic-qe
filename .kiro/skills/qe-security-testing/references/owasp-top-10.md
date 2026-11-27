# OWASP Top 10 (2021) Quick Reference

## A01: Broken Access Control
- Test: Horizontal privilege escalation (user A accessing user B's data)
- Test: Vertical privilege escalation (user accessing admin endpoints)
- Test: IDOR on every object reference (change IDs in URLs/params)
- Test: Missing function-level access control on API endpoints
- Common miss: Admin APIs accessible without auth check

## A02: Cryptographic Failures
- Test: TLS version (require 1.2+, reject 1.0/1.1)
- Test: Password hashing (bcrypt/argon2, never MD5/SHA1)
- Test: Sensitive data in URLs/logs/error messages
- Test: Cookie flags (Secure, HttpOnly, SameSite)
- Common miss: API keys in client-side JavaScript

## A03: Injection
- Test: SQL injection on all input fields (parameterized queries?)
- Test: XSS (reflected, stored, DOM-based) — try `<script>alert(1)</script>` and encoded variants
- Test: Command injection on any server-side exec
- Test: NoSQL injection on MongoDB queries
- Common miss: Second-order SQL injection via stored data

## A04: Insecure Design
- Test: Business logic flaws (negative quantities, race conditions)
- Test: Missing rate limiting on sensitive endpoints
- Test: Lack of resource quotas
- Common miss: Discount codes applied multiple times

## A05: Security Misconfiguration
- Test: Default credentials on all services
- Test: Unnecessary HTTP methods (OPTIONS, TRACE)
- Test: Directory listing enabled
- Test: Stack traces in error responses
- Common miss: S3 bucket with public ACL

## A06: Vulnerable Components
- Test: `npm audit` / `snyk test` for known CVEs
- Test: Outdated framework versions
- Test: Abandoned dependencies (no updates in 2+ years)
- Common miss: Transitive dependencies with critical CVEs

## A07: Auth Failures
- Test: Credential stuffing protection (rate limiting, captcha)
- Test: Session fixation (new session ID after login)
- Test: JWT validation (algorithm confusion, expiry, signature)
- Test: MFA bypass attempts
- Common miss: Password reset token doesn't expire

## A08: Software/Data Integrity
- Test: CI/CD pipeline integrity (signed commits, reviewed PRs)
- Test: Dependency integrity (lock files, SRI hashes)
- Test: Deserialization attacks
- Common miss: Auto-update mechanism without signature verification

## A09: Logging/Monitoring Failures
- Test: Failed login attempts logged with IP
- Test: Sensitive data NOT in logs (passwords, tokens)
- Test: Log injection prevention
- Common miss: No alerting on repeated auth failures

## A10: SSRF
- Test: URL parameters that fetch external resources
- Test: Internal network access via URL manipulation
- Test: Cloud metadata endpoint access (169.254.169.254)
- Common miss: Redirect chains bypassing allowlists
