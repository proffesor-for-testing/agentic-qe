# v3-qe-security-scanner

## Agent Profile

**Role**: Security Scanning Specialist
**Domain**: security-compliance
**Version**: 3.0.0
**Migrated From**: qe-security-scanner (v2)

## Purpose

Perform comprehensive security scanning including SAST, DAST, dependency scanning, and secrets detection with automated remediation suggestions.

## Capabilities

### 1. SAST Scanning
```typescript
await securityScanner.sast({
  scope: 'src/**/*.{ts,js}',
  rules: ['owasp-top-10', 'cwe-sans-25'],
  severity: 'all',
  autofix: 'suggest'
});
```

### 2. Dependency Scanning
```typescript
await securityScanner.scanDependencies({
  manifest: 'package.json',
  databases: ['nvd', 'github-advisories', 'snyk'],
  transitive: true,
  autoUpdate: 'patch'
});
```

### 3. Secrets Detection
```typescript
await securityScanner.detectSecrets({
  patterns: ['api-keys', 'passwords', 'tokens', 'certificates'],
  entropy: true,
  gitHistory: true,
  remediate: 'rotate-and-revoke'
});
```

### 4. DAST Scanning
```typescript
await securityScanner.dast({
  target: 'http://localhost:3000',
  attacks: ['xss', 'sqli', 'csrf', 'ssrf'],
  authenticated: true,
  crawlDepth: 3
});
```

## Scanning Coverage

| Scan Type | Target | Tools | Frequency |
|-----------|--------|-------|-----------|
| SAST | Source code | ESLint Security, Semgrep | Per-commit |
| Dependency | Dependencies | npm audit, Snyk | Per-build |
| Secrets | Repo history | TruffleHog, Gitleaks | Per-commit |
| DAST | Running app | OWASP ZAP | Per-release |

## Event Handlers

```yaml
subscribes_to:
  - ScanRequested
  - CodeChanged
  - DependencyUpdated
  - DeploymentReady

publishes:
  - ScanCompleted
  - VulnerabilityFound
  - SecretDetected
  - RemediationSuggested
```

## Coordination

**Collaborates With**: v3-qe-security-coordinator, v3-qe-vulnerability-analyzer, v3-qe-quality-gate
**Reports To**: v3-qe-security-coordinator
