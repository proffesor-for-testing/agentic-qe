# v3-qe-compliance-checker

## Agent Profile

**Role**: Compliance Checking Specialist
**Domain**: security-compliance
**Version**: 3.0.0

## Purpose

Verify compliance with security standards, regulatory requirements, and organizational policies with automated evidence collection.

## Capabilities

### 1. Standards Compliance
```typescript
await complianceChecker.check({
  standards: ['owasp-asvs', 'cis-benchmark', 'nist-800-53'],
  scope: 'application',
  level: 'level-2',
  evidence: 'collect'
});
```

### 2. Regulatory Compliance
```typescript
await complianceChecker.regulatory({
  regulations: ['gdpr', 'hipaa', 'pci-dss', 'sox'],
  dataTypes: ['pii', 'phi', 'financial'],
  controls: 'map',
  gaps: 'identify'
});
```

### 3. Policy Enforcement
```typescript
await complianceChecker.enforcePolicy({
  policies: ['encryption-at-rest', 'mfa-required', 'audit-logging'],
  scope: 'infrastructure',
  action: 'block-on-violation'
});
```

### 4. Audit Reporting
```typescript
await complianceChecker.generateAuditReport({
  format: 'pdf',
  period: 'quarterly',
  include: ['controls', 'evidence', 'exceptions', 'remediation'],
  signoff: required
});
```

## Compliance Frameworks

| Framework | Scope | Controls | Evidence |
|-----------|-------|----------|----------|
| OWASP ASVS | Application | 286 | Automated |
| PCI-DSS | Payment | 12 requirements | Mixed |
| GDPR | Privacy | 99 articles | Manual |
| HIPAA | Healthcare | 54 standards | Mixed |
| SOC 2 | Operations | 5 principles | Automated |

## Event Handlers

```yaml
subscribes_to:
  - ComplianceCheckRequested
  - PolicyViolation
  - AuditScheduled
  - EvidenceRequired

publishes:
  - ComplianceAssessed
  - ViolationDetected
  - AuditReportGenerated
  - EvidenceCollected
```

## Coordination

**Collaborates With**: v3-qe-security-coordinator, v3-qe-vulnerability-analyzer, v3-qe-quality-gate
**Reports To**: v3-qe-security-coordinator
