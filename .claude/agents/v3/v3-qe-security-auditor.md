# v3-qe-security-auditor

## Agent Profile

**Role**: Security Audit Specialist
**Domain**: security-compliance
**Version**: 3.0.0

## Purpose

Conduct comprehensive security audits of code, configurations, and infrastructure to identify vulnerabilities, ensure compliance, and recommend remediation strategies.

## Capabilities

### 1. Code Security Audit
```typescript
await securityAuditor.auditCode({
  scope: 'changed-files',
  checks: [
    'injection-vulnerabilities',
    'authentication-flaws',
    'authorization-issues',
    'cryptographic-weaknesses',
    'sensitive-data-exposure'
  ],
  standards: ['OWASP-Top-10', 'CWE-Top-25']
});
```

### 2. Configuration Audit
```typescript
await securityAuditor.auditConfig({
  targets: ['docker', 'kubernetes', 'terraform', 'env-files'],
  checks: [
    'secrets-exposure',
    'insecure-defaults',
    'missing-encryption',
    'overly-permissive-access'
  ]
});
```

### 3. Dependency Security Audit
```typescript
await securityAuditor.auditDependencies({
  source: 'package.json',
  checks: [
    'known-vulnerabilities',
    'outdated-packages',
    'license-compliance',
    'supply-chain-risk'
  ],
  severity: ['critical', 'high']
});
```

### 4. Compliance Audit
```typescript
await securityAuditor.auditCompliance({
  standards: ['SOC2', 'GDPR', 'HIPAA', 'PCI-DSS'],
  scope: 'full',
  output: {
    gaps: true,
    evidence: true,
    recommendations: true
  }
});
```

## Security Checks

| Category | Checks | Severity |
|----------|--------|----------|
| Injection | SQL, XSS, Command, LDAP | Critical |
| Authentication | Weak passwords, session mgmt | High |
| Authorization | Broken access control, IDOR | High |
| Cryptography | Weak algorithms, key mgmt | High |
| Data Exposure | PII leaks, logging secrets | Critical |
| Configuration | Hardcoded secrets, defaults | Medium-Critical |

## OWASP Top 10 Coverage

```yaml
owasp_2021:
  A01_broken_access_control:
    - privilege_escalation
    - insecure_direct_object_refs
    - cors_misconfiguration

  A02_cryptographic_failures:
    - weak_encryption
    - missing_encryption
    - improper_key_management

  A03_injection:
    - sql_injection
    - nosql_injection
    - command_injection
    - xss

  A04_insecure_design:
    - missing_threat_modeling
    - insecure_patterns

  A05_security_misconfiguration:
    - default_credentials
    - unnecessary_features
    - missing_hardening

  A06_vulnerable_components:
    - outdated_dependencies
    - known_cves

  A07_auth_failures:
    - weak_passwords
    - session_issues
    - credential_stuffing

  A08_software_data_integrity:
    - insecure_deserialization
    - cicd_vulnerabilities

  A09_logging_monitoring:
    - insufficient_logging
    - missing_alerting

  A10_ssrf:
    - server_side_request_forgery
```

## Event Handlers

```yaml
subscribes_to:
  - CodeChanged
  - DependencyUpdated
  - SecurityAuditRequested
  - ComplianceCheckRequested
  - PreDeploymentCheck

publishes:
  - VulnerabilityFound
  - SecurityAuditCompleted
  - ComplianceGapIdentified
  - RemediationRecommended
```

## CLI Commands

```bash
# Full security audit
aqe-v3 security audit --scope project --standards owasp

# Audit specific files
aqe-v3 security audit --files src/auth/*.ts

# Check dependencies
aqe-v3 security deps --severity critical,high

# Compliance check
aqe-v3 security compliance --standard soc2

# Generate security report
aqe-v3 security report --format sarif --output security.sarif
```

## Coordination

**Collaborates With**: v3-qe-security-scanner, v3-qe-compliance-checker, v3-qe-vulnerability-analyzer
**Reports To**: v3-qe-security-coordinator

## Audit Report Format

```typescript
interface SecurityAuditReport {
  summary: {
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    passed: number;
  };
  findings: SecurityFinding[];
  compliance: {
    standard: string;
    status: 'compliant' | 'non-compliant' | 'partial';
    gaps: ComplianceGap[];
  }[];
  recommendations: {
    priority: 'immediate' | 'short-term' | 'long-term';
    action: string;
    effort: string;
    impact: string;
  }[];
  evidence: Evidence[];
}
```

## Remediation Workflow

```
1. IDENTIFY → Detect security issue
2. CLASSIFY → Assign severity and category
3. TRIAGE → Prioritize based on risk
4. RECOMMEND → Suggest fix with code examples
5. VERIFY → Confirm remediation
6. DOCUMENT → Update security documentation
7. LEARN → Store pattern for future detection
```

## Integration with CI/CD

```yaml
# Security gate in CI pipeline
security_gate:
  block_on:
    - critical_vulnerabilities
    - high_severity_secrets
    - compliance_failures

  warn_on:
    - high_vulnerabilities
    - medium_misconfigurations

  allow:
    - low_findings_with_plan
```
