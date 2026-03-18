# Security Testing — Compliance & Agent CLI Commands

Merged from `qe-security-compliance`. Use these for v3 agent-specific security/compliance capabilities.

## AQE CLI Commands

```bash
# Full security scan
aqe security scan --scope src/ --checks all

# Vulnerability check
aqe security vulns --dependencies --severity critical,high

# Compliance audit
aqe security compliance --standard soc2 --output report.html

# OWASP check
aqe security owasp --top-10 --scope src/
```

## Agent Workflow

```typescript
// Security audit
Task("Security audit", `
  Perform comprehensive security audit:
  - SAST scan for code vulnerabilities
  - Dependency vulnerability check
  - Secret detection in code and configs
  - OWASP Top 10 validation
  Generate security report with remediation steps.
`, "qe-security-auditor")

// Compliance validation
Task("SOC2 compliance check", `
  Validate SOC2 compliance requirements:
  - Access control verification
  - Encryption validation
  - Audit logging check
  - Data retention compliance
  Generate compliance evidence report.
`, "qe-compliance-checker")
```

## SAST Scanning

```typescript
await securityScanner.staticAnalysis({
  scope: 'src/**/*.ts',
  checks: ['sql-injection', 'xss', 'command-injection', 'path-traversal', 'insecure-crypto', 'hardcoded-secrets'],
  rules: 'owasp-top-10',
  severity: ['critical', 'high', 'medium']
});
```

## Dependency Scanning

```typescript
await securityScanner.dependencyCheck({
  sources: ['package.json', 'package-lock.json'],
  checks: { knownVulnerabilities: true, outdatedPackages: true, licenseCompliance: true, supplyChainRisk: true },
  severity: ['critical', 'high'],
  autoFix: { enabled: true, dryRun: false }
});
```

## Compliance Audit

```typescript
await complianceChecker.audit({
  standards: ['SOC2', 'GDPR', 'HIPAA'],
  scope: { code: 'src/', configs: 'config/', infrastructure: 'terraform/' },
  output: { gaps: true, evidence: true, recommendations: true }
});
```

## Secret Detection

```typescript
await securityScanner.detectSecrets({
  scope: ['.', 'config/', '.env*'],
  patterns: ['api-keys', 'passwords', 'tokens', 'private-keys', 'connection-strings'],
  exclude: ['*.test.ts', 'mocks/'],
  action: { onDetect: 'block', notify: ['security-team'] }
});
```

## Security Gates

```yaml
security_gates:
  block_merge:
    - critical_vulnerabilities > 0
    - high_vulnerabilities > 2
    - secrets_detected > 0
    - compliance_failures > 0
  warn:
    - medium_vulnerabilities > 5
    - outdated_dependencies > 10
  enforce:
    - signed_commits: required
    - code_review: required
    - security_scan: required
```

## Compliance Standards Coverage

| Standard | Scope | Auto-Check |
|----------|-------|------------|
| SOC2 | Security controls | Partial |
| GDPR | Data privacy | Partial |
| HIPAA | Health data | Partial |
| PCI-DSS | Payment data | Yes |
| ISO 27001 | InfoSec | Partial |

## Security Report Interface

```typescript
interface SecurityReport {
  summary: { score: number; critical: number; high: number; medium: number; low: number };
  vulnerabilities: { id: string; type: string; severity: string; location: string; description: string; remediation: string; cwe: string; owasp: string }[];
  dependencies: { vulnerable: number; outdated: number; details: DependencyVuln[] };
  compliance: { standard: string; status: 'compliant' | 'non-compliant' | 'partial'; gaps: ComplianceGap[]; evidence: Evidence[] }[];
  secrets: { detected: number; locations: SecretLocation[] };
}
```

## Coordination

**Primary Agents**: qe-security-auditor, qe-security-scanner, qe-compliance-checker
**Coordinator**: qe-security-coordinator
