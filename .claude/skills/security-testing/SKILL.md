---
name: security-testing
description: Test for security vulnerabilities using OWASP principles and security testing techniques. Use when conducting security audits, testing authentication/authorization, or implementing security practices.
version: 1.0.0
category: testing
tags: [security, owasp, penetration-testing, vulnerability-scanning, authentication, authorization]
difficulty: advanced
estimated_time: 60 minutes
author: user
---

# Security Testing

## Core Philosophy

Security is not a feature you add at the end. It's a quality attribute you build in from the start. Test for security issues like you test for functional issues - continuously and realistically.

**Key principle:** Think like an attacker, build like a defender.

## OWASP Top 10 (2021) - Must Test

### 1. Broken Access Control
**Risk:** Users accessing resources they shouldn't

**Test Scenarios:**
```javascript
// Horizontal privilege escalation
test('user cannot access another user\'s order', async () => {
  const userAToken = await login('userA');
  const userBOrder = await createOrder('userB');
  
  const response = await api.get(`/orders/${userBOrder.id}`, {
    headers: { Authorization: `Bearer ${userAToken}` }
  });
  
  expect(response.status).toBe(403); // Forbidden
});

// Vertical privilege escalation
test('regular user cannot access admin endpoint', async () => {
  const userToken = await login('regularUser');
  
  const response = await api.get('/admin/users', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  
  expect(response.status).toBe(403);
});

// Missing authorization check
test('unauthenticated user cannot create order', async () => {
  const response = await api.post('/orders', orderData);
  expect(response.status).toBe(401); // Unauthorized
});
```

### 2. Cryptographic Failures
**Risk:** Sensitive data exposed due to weak encryption

**Test Scenarios:**
```javascript
test('passwords are hashed, not stored in plaintext', async () => {
  const user = await db.users.create({
    email: 'test@example.com',
    password: 'MyPassword123'
  });
  
  const storedUser = await db.users.findById(user.id);
  expect(storedUser.password).not.toBe('MyPassword123');
  expect(storedUser.password).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt format
});

test('sensitive data encrypted in transit', async () => {
  const response = await fetch('https://api.example.com/profile');
  expect(response.url).toStartWith('https://'); // Not http://
});

test('API does not return sensitive data unnecessarily', async () => {
  const response = await api.get('/users/me');
  expect(response.body).not.toHaveProperty('password');
  expect(response.body).not.toHaveProperty('ssn');
  expect(response.body).not.toHaveProperty('creditCard');
});
```

### 3. Injection
**Risk:** SQL injection, command injection, XSS

**Test Scenarios:**
```javascript
// SQL Injection
test('prevents SQL injection in search', async () => {
  const maliciousQuery = "' OR '1'='1";
  const response = await api.get(`/products?search=${maliciousQuery}`);
  
  // Should return empty or sanitized results, not all products
  expect(response.body.length).toBeLessThan(100);
});

// Command Injection
test('prevents command injection in file upload', async () => {
  const maliciousFilename = '; rm -rf /';
  const response = await api.post('/upload', {
    filename: maliciousFilename,
    content: 'test'
  });
  
  expect(response.status).toBe(400); // Rejected
});

// XSS (Cross-Site Scripting)
test('sanitizes user input in HTML output', async () => {
  const maliciousInput = '<script>alert("XSS")</script>';
  await api.post('/comments', { text: maliciousInput });
  
  const response = await api.get('/comments');
  const html = response.body;
  
  // Should be escaped, not executable
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
});
```

### 4. Insecure Design
**Risk:** Fundamental security flaws in architecture

**Review Checklist:**
- [ ] Principle of least privilege (minimal permissions)
- [ ] Defense in depth (multiple security layers)
- [ ] Fail securely (errors don't expose info)
- [ ] Secure defaults (secure by default, not opt-in)

**Test Scenarios:**
```javascript
test('rate limiting prevents brute force', async () => {
  const attempts = 20;
  const responses = [];
  
  for (let i = 0; i < attempts; i++) {
    responses.push(await api.post('/login', {
      email: 'test@example.com',
      password: 'wrong'
    }));
  }
  
  const rateLimited = responses.filter(r => r.status === 429);
  expect(rateLimited.length).toBeGreaterThan(0);
});

test('session expires after timeout', async () => {
  const token = await login();
  
  // Wait for session timeout (e.g., 30 minutes)
  await sleep(31 * 60 * 1000);
  
  const response = await api.get('/profile', {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  expect(response.status).toBe(401); // Expired
});
```

### 5. Security Misconfiguration
**Risk:** Default configs, exposed admin panels, verbose errors

**Test Scenarios:**
```javascript
test('error messages do not leak sensitive info', async () => {
  const response = await api.post('/login', {
    email: 'nonexistent@example.com',
    password: 'wrong'
  });
  
  // Should be generic, not "user doesn't exist" vs "wrong password"
  expect(response.body.error).toBe('Invalid credentials');
});

test('admin panel not accessible without auth', async () => {
  const response = await fetch('https://example.com/admin');
  expect(response.status).toBe(401);
});

test('sensitive endpoints not exposed', async () => {
  const endpoints = [
    '/debug', '/.env', '/config', '/.git',
    '/admin', '/phpinfo.php', '/server-status'
  ];
  
  for (let endpoint of endpoints) {
    const response = await fetch(`https://example.com${endpoint}`);
    expect(response.status).not.toBe(200);
  }
});
```

### 6. Vulnerable and Outdated Components
**Risk:** Using libraries with known vulnerabilities

**Prevention:**
```bash
# Check for vulnerabilities regularly
npm audit
npm audit fix

# Or with Yarn
yarn audit

# Use Snyk, Dependabot, or similar
snyk test
```

**CI/CD Integration:**
```yaml
# GitHub Actions example
- name: Security audit
  run: npm audit --audit-level=high
  
- name: Check for outdated packages
  run: npm outdated
```

### 7. Identification and Authentication Failures
**Risk:** Weak passwords, poor session management

**Test Scenarios:**
```javascript
test('rejects weak passwords', async () => {
  const weakPasswords = ['123456', 'password', 'abc123'];
  
  for (let pwd of weakPasswords) {
    const response = await api.post('/register', {
      email: 'test@example.com',
      password: pwd
    });
    expect(response.status).toBe(400);
  }
});

test('enforces multi-factor authentication for sensitive ops', async () => {
  const token = await login('user@example.com', 'password');
  
  // Try to change email without MFA
  const response = await api.put('/profile/email', {
    newEmail: 'new@example.com'
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  expect(response.status).toBe(403); // Requires MFA
});

test('prevents session fixation', async () => {
  const sessionBefore = await getSessionId();
  
  await login('user@example.com', 'password');
  
  const sessionAfter = await getSessionId();
  
  // Session ID should change after login
  expect(sessionAfter).not.toBe(sessionBefore);
});
```

### 8. Software and Data Integrity Failures
**Risk:** Unsigned updates, untrusted CI/CD pipeline

**Test Scenarios:**
```javascript
test('API responses include integrity check', async () => {
  const response = await api.get('/config');
  
  // Should include checksum or signature
  expect(response.headers['x-content-signature']).toBeDefined();
});

test('uploaded files are scanned for malware', async () => {
  const maliciousFile = createTestVirusFile(); // EICAR test file
  
  const response = await api.post('/upload', maliciousFile);
  
  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/malware|virus/i);
});
```

### 9. Security Logging and Monitoring Failures
**Risk:** Breaches not detected, no audit trail

**Test Scenarios:**
```javascript
test('failed login attempts are logged', async () => {
  await api.post('/login', { email: 'test@example.com', password: 'wrong' });
  
  const logs = await getLogs('authentication');
  const failedLogin = logs.find(l => l.event === 'login_failed');
  
  expect(failedLogin).toBeDefined();
  expect(failedLogin.ip).toBeDefined();
  expect(failedLogin.timestamp).toBeDefined();
});

test('sensitive operations are audited', async () => {
  const adminToken = await login('admin@example.com', 'password');
  
  await api.delete('/users/123', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  
  const auditLog = await getAuditLog();
  const deletion = auditLog.find(l => l.action === 'user_deleted');
  
  expect(deletion.actor).toBe('admin@example.com');
  expect(deletion.target).toBe('123');
});
```

### 10. Server-Side Request Forgery (SSRF)
**Risk:** Attacker makes server request internal resources

**Test Scenarios:**
```javascript
test('prevents SSRF via URL parameter', async () => {
  const internalUrl = 'http://localhost:8080/admin';
  
  const response = await api.post('/fetch-url', {
    url: internalUrl
  });
  
  expect(response.status).toBe(400); // Rejected
});

test('validates and sanitizes URL inputs', async () => {
  const maliciousUrls = [
    'file:///etc/passwd',
    'http://169.254.169.254/latest/meta-data/', // AWS metadata
    'http://metadata.google.internal/', // GCP metadata
  ];
  
  for (let url of maliciousUrls) {
    const response = await api.post('/fetch-url', { url });
    expect(response.status).toBe(400);
  }
});
```

## Security Testing Tools

### Static Analysis (SAST)
- **SonarQube** - Code quality + security
- **Semgrep** - Fast, customizable rules
- **ESLint security plugins** - JavaScript
- **Bandit** - Python security linter

### Dynamic Analysis (DAST)
- **OWASP ZAP** - Web app security scanner
- **Burp Suite** - Security testing platform
- **Nikto** - Web server scanner

### Dependency Scanning
- **npm audit / yarn audit** - Node.js
- **Snyk** - Multi-language
- **Dependabot** - GitHub integration
- **OWASP Dependency-Check** - Multi-language

### Secret Scanning
- **git-secrets** - Prevent secrets in commits
- **TruffleHog** - Find secrets in git history
- **GitGuardian** - Real-time secret detection

## Penetration Testing Basics

### Manual Testing Approach

1. **Reconnaissance**
   - Identify attack surface
   - Map endpoints and functionality
   - Note technologies used

2. **Enumeration**
   - Discover hidden endpoints
   - Test common paths (/admin, /.env, /api)
   - Check for information disclosure

3. **Exploitation**
   - Test for OWASP Top 10
   - Try auth bypasses
   - Test input validation

4. **Reporting**
   - Document findings
   - Rate severity
   - Provide remediation steps

### Automated Scanning

```bash
# OWASP ZAP baseline scan
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://example.com \
  -r report.html

# Nikto web server scan
nikto -h https://example.com

# Nmap port scan
nmap -sV -sC example.com
```

## Security in CI/CD

### Pre-commit Hooks
```bash
# .git/hooks/pre-commit
#!/bin/sh

# Check for secrets
git-secrets --scan

# Run security linter
npm run lint:security

# Abort commit if issues found
if [ $? -ne 0 ]; then
  echo "Security issues found. Commit aborted."
  exit 1
fi
```

### CI Pipeline
```yaml
# GitHub Actions example
security-checks:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v2
    
    - name: Dependency audit
      run: npm audit --audit-level=high
      
    - name: SAST scan
      run: npm run sast
      
    - name: Secret scan
      uses: trufflesecurity/trufflehog@main
      
    - name: DAST scan (staging)
      if: github.ref == 'refs/heads/main'
      run: |
        docker run owasp/zap2docker-stable \
          zap-baseline.py -t https://staging.example.com
```

## Common Security Mistakes

### ❌ Security by Obscurity
**Problem:** Hiding admin panel at `/super-secret-admin`
**Better:** Proper authentication + authorization

### ❌ Client-Side Validation Only
**Problem:** JavaScript validation can be bypassed
**Better:** Always validate on server side

### ❌ Trusting User Input
**Problem:** Assuming input is safe
**Better:** Sanitize, validate, escape all input

### ❌ Hardcoded Secrets
**Problem:** API keys in code
**Better:** Environment variables, secret management

### ❌ Insufficient Logging
**Problem:** Can't detect or investigate breaches
**Better:** Log security events, monitor for anomalies

## Security Testing Checklist

### Authentication
- [ ] Strong password requirements
- [ ] Password hashing (bcrypt, scrypt, Argon2)
- [ ] MFA for sensitive operations
- [ ] Account lockout after failed attempts
- [ ] Secure password reset flow
- [ ] Session timeout
- [ ] Session ID changes after login

### Authorization
- [ ] Check authorization on every request
- [ ] Principle of least privilege
- [ ] No horizontal privilege escalation
- [ ] No vertical privilege escalation
- [ ] Resource-level authorization

### Data Protection
- [ ] HTTPS everywhere
- [ ] Sensitive data encrypted at rest
- [ ] Secrets not in code or logs
- [ ] PII handling compliance (GDPR, etc.)
- [ ] Secure file uploads
- [ ] Safe data deletion

### Input Validation
- [ ] Validate all input server-side
- [ ] Whitelist, not blacklist
- [ ] Parameterized queries (no SQL injection)
- [ ] Output encoding (no XSS)
- [ ] File upload restrictions
- [ ] Rate limiting

### API Security
- [ ] Authentication required
- [ ] Authorization per endpoint
- [ ] CORS configured properly
- [ ] Rate limiting
- [ ] Input validation
- [ ] Error handling (no info leakage)

### Infrastructure
- [ ] Keep dependencies updated
- [ ] Remove unnecessary services
- [ ] Secure defaults
- [ ] Regular security scans
- [ ] Secrets management
- [ ] Security headers configured

## Real-World Example: API Security Audit

**Scenario:** E-commerce API security review

**Findings:**

1. **Critical: Authorization Bypass**
   ```javascript
   // Vulnerable code
   app.get('/orders/:id', (req, res) => {
     const order = db.orders.findById(req.params.id);
     res.json(order); // No ownership check!
   });
   
   // Fixed
   app.get('/orders/:id', auth, (req, res) => {
     const order = db.orders.findById(req.params.id);
     if (order.userId !== req.user.id) {
       return res.status(403).json({ error: 'Forbidden' });
     }
     res.json(order);
   });
   ```

2. **High: Weak Password Policy**
   - No minimum length
   - No complexity requirements
   - **Fix:** Require 12+ chars, mixed case, numbers

3. **Medium: Verbose Error Messages**
   - Stack traces in production
   - **Fix:** Generic errors for clients, detailed logs server-side

4. **Low: Missing Security Headers**
   - No HSTS, CSP, X-Frame-Options
   - **Fix:** Add helmet.js middleware

**Result:** 4 vulnerabilities fixed before production launch.

## Using with QE Agents

### Multi-Layer Security Scanning

**qe-security-scanner** performs comprehensive security testing:
```typescript
// Agent runs multi-layer security scan
const securityScan = await agent.comprehensiveScan({
  target: 'src/',
  layers: {
    sast: true,           // Static analysis
    dast: true,           // Dynamic analysis
    dependencies: true,   // npm audit
    secrets: true,        // Secret scanning
    containers: true      // Docker image scanning
  },
  severity: ['critical', 'high', 'medium']
});

// Returns categorized vulnerabilities
```

### OWASP Top 10 Automated Testing

```typescript
// Agent tests all OWASP Top 10 vulnerabilities
const owaspTest = await agent.testOWASP({
  categories: [
    'broken-access-control',
    'cryptographic-failures',
    'injection',
    'insecure-design',
    'security-misconfiguration'
  ],
  depth: 'comprehensive'
});
```

### Vulnerability Fix Validation

```typescript
// Agent validates security fix
const validation = await agent.validateFix({
  vulnerability: 'CVE-2024-12345',
  expectedResolution: 'upgrade package to v2.0.0',
  retestAfterFix: true
});

// Returns: { fixed: true, retestPassed: true, residualRisk: 'low' }
```

### Security Fleet Coordination

```typescript
const securityFleet = await FleetManager.coordinate({
  strategy: 'security-testing',
  agents: [
    'qe-security-scanner',         // Run scans
    'qe-api-contract-validator',   // API security
    'qe-quality-analyzer',         // Code security review
    'qe-deployment-readiness'      // Security gate
  ],
  topology: 'parallel'
});
```

---

## Related Skills

**Testing:**
- [agentic-quality-engineering](../agentic-quality-engineering/) - Security testing coordination
- [api-testing-patterns](../api-testing-patterns/) - API security testing

**Development:**
- [code-review-quality](../code-review-quality/) - Security code review

**Quality:**
- [quality-metrics](../quality-metrics/) - Security metrics tracking

## Remember

Security testing is not a one-time activity. It's an ongoing process. Build security into your development workflow, test continuously, and stay informed about new threats.

**Think like an attacker:** What would you try to break? Test that.
**Build like a defender:** Assume input is malicious until proven otherwise.
