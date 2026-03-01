# Security Compliance Domain

## Bounded Context Overview

**Domain**: Security & Compliance
**Responsibility**: SAST/DAST scanning, vulnerability analysis, compliance validation
**Location**: `src/domains/security-compliance/`

The Security Compliance domain provides comprehensive security testing capabilities including static analysis, dynamic testing, dependency scanning, secret detection, and regulatory compliance validation.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **SAST** | Static Application Security Testing |
| **DAST** | Dynamic Application Security Testing |
| **Vulnerability** | Security weakness in code or dependencies |
| **CVE** | Common Vulnerabilities and Exposures identifier |
| **Compliance Standard** | Regulatory framework (OWASP, PCI-DSS, GDPR) |
| **Remediation** | Action to fix a vulnerability |
| **Security Posture** | Overall security health assessment |
| **Secret** | Credential or sensitive data in code |

## Domain Model

### Aggregates

#### SecurityAuditReport (Aggregate Root)
Complete security audit with all scan types.

```typescript
interface SecurityAuditReport {
  auditId: string;
  timestamp: Date;
  sastResults?: SASTResult;
  dastResults?: DASTResult;
  dependencyResults?: DependencyScanResult;
  secretScanResults?: SecretScanResult;
  overallRiskScore: RiskScore;
  recommendations: string[];
}
```

#### ComplianceReport (Aggregate Root)
Compliance validation against a standard.

```typescript
interface ComplianceReport {
  standardId: string;
  standardName: string;
  violations: ComplianceViolation[];
  passedRules: string[];
  skippedRules: string[];
  complianceScore: number;
  generatedAt: Date;
}
```

### Entities

#### Vulnerability
Security vulnerability with full context.

```typescript
interface Vulnerability {
  id: string;
  cveId?: string;
  title: string;
  description: string;
  severity: VulnerabilitySeverity;
  category: VulnerabilityCategory;
  location: VulnerabilityLocation;
  remediation: RemediationAdvice;
  references: string[];
}
```

#### ComplianceRule
Individual compliance requirement.

```typescript
interface ComplianceRule {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: 'required' | 'recommended' | 'optional';
  checkType: 'static' | 'dynamic' | 'manual';
}
```

#### DetectedSecret
Secret found in source code.

```typescript
interface DetectedSecret {
  type: 'api-key' | 'password' | 'token' | 'certificate' | 'private-key';
  location: VulnerabilityLocation;
  entropy: number;
  isValid: boolean;
}
```

### Value Objects

#### VulnerabilitySeverity
```typescript
type VulnerabilitySeverity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
```

#### VulnerabilityCategory (OWASP Top 10)
```typescript
type VulnerabilityCategory =
  | 'injection'
  | 'broken-auth'
  | 'sensitive-data'
  | 'xxe'
  | 'access-control'
  | 'security-misconfiguration'
  | 'xss'
  | 'insecure-deserialization'
  | 'vulnerable-components'
  | 'insufficient-logging';
```

#### VulnerabilityLocation
Precise location of vulnerability.

```typescript
interface VulnerabilityLocation {
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly snippet?: string;
  readonly dependency?: DependencyInfo;
}
```

#### RemediationAdvice
Fix recommendation with effort estimate.

```typescript
interface RemediationAdvice {
  readonly description: string;
  readonly fixExample?: string;
  readonly estimatedEffort: 'trivial' | 'minor' | 'moderate' | 'major';
  readonly automatable: boolean;
  readonly llmEnhanced?: boolean;     // ADR-051
}
```

#### ScanSummary
Aggregate scan statistics.

```typescript
interface ScanSummary {
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  readonly informational: number;
  readonly totalFiles: number;
  readonly scanDurationMs: number;
}
```

## Domain Services

### ISecurityComplianceCoordinator
Primary coordinator for the domain.

```typescript
interface ISecurityComplianceCoordinator {
  runSecurityAudit(options: SecurityAuditOptions): Promise<Result<SecurityAuditReport>>;
  runComplianceCheck(standardId: string): Promise<Result<ComplianceReport>>;
  getSecurityPosture(): Promise<Result<SecurityPosture>>;
}
```

### ISASTService
Static analysis service.

```typescript
interface ISASTService {
  scan(files: FilePath[]): Promise<Result<SASTResult>>;
  scanWithRules(files: FilePath[], ruleSetIds: string[]): Promise<Result<SASTResult>>;
  getAvailableRuleSets(): Promise<RuleSet[]>;
  checkFalsePositive(vulnerability: Vulnerability): Promise<Result<FalsePositiveCheck>>;
}
```

### IDASTService
Dynamic analysis service.

```typescript
interface IDASTService {
  scan(targetUrl: string, options?: DASTOptions): Promise<Result<DASTResult>>;
  scanAuthenticated(targetUrl: string, credentials: AuthCredentials, options?: DASTOptions): Promise<Result<DASTResult>>;
  getScanStatus(scanId: string): Promise<ScanStatus>;
}
```

### IDependencySecurityService
Dependency vulnerability scanning.

```typescript
interface IDependencySecurityService {
  scanDependencies(manifestPath: FilePath): Promise<Result<DependencyScanResult>>;
  checkPackage(name: string, version: string, ecosystem: DependencyInfo['ecosystem']): Promise<Result<PackageSecurityInfo>>;
  getUpgradeRecommendations(vulnerabilities: Vulnerability[]): Promise<Result<UpgradeRecommendation[]>>;
}
```

### IComplianceValidationService
Compliance standard validation.

```typescript
interface IComplianceValidationService {
  validate(standard: ComplianceStandard, context: ComplianceContext): Promise<Result<ComplianceReport>>;
  getAvailableStandards(): Promise<ComplianceStandard[]>;
  analyzeGaps(currentState: ComplianceReport, targetStandard: ComplianceStandard): Promise<Result<GapAnalysis>>;
}
```

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `SecurityScanCompletedEvent` | Scan finished | `{ scanId, scanType, vulnerabilities, summary }` |
| `VulnerabilityDetectedEvent` | Vulnerability found | `{ vulnerability, isNew, previousOccurrences }` |
| `ComplianceCheckCompletedEvent` | Compliance check done | `{ standardId, violations, complianceScore, passed }` |

## Compliance Standards

### Supported Standards

| Standard | Coverage | Check Types |
|----------|----------|-------------|
| OWASP Top 10 | Full | SAST, DAST |
| PCI-DSS | Core requirements | SAST, Config |
| GDPR | Data handling | Manual + Static |
| HIPAA | Healthcare data | Manual + Static |
| SOC 2 | Security controls | Mixed |

## Repositories

```typescript
interface IVulnerabilityRepository {
  findById(id: string): Promise<Vulnerability | null>;
  findBySeverity(severity: VulnerabilitySeverity): Promise<Vulnerability[]>;
  findByFile(file: FilePath): Promise<Vulnerability[]>;
  save(vulnerability: Vulnerability): Promise<void>;
  markResolved(id: string): Promise<void>;
}

interface IComplianceReportRepository {
  findLatest(standardId: string): Promise<ComplianceReport | null>;
  findByDateRange(startDate: Date, endDate: Date): Promise<ComplianceReport[]>;
  save(report: ComplianceReport): Promise<void>;
}
```

## Context Integration

### Upstream Dependencies
- External vulnerability databases (NVD, GitHub Advisory)
- SAST tools (Semgrep, CodeQL, ESLint security)
- DAST tools (OWASP ZAP, Burp Suite)

### Downstream Consumers
- **Quality Assessment**: Security metrics for gates
- **Defect Intelligence**: Security defect patterns
- CI/CD pipelines: Security gate enforcement

### Anti-Corruption Layer
The domain abstracts different security tools through service interfaces, allowing multiple SAST/DAST tools to be used interchangeably.

## Task Handlers

| Task Type | Handler | Description |
|-----------|---------|-------------|
| `security-audit` | `runSecurityAudit()` | Full security audit |
| `sast-scan` | `scan()` | Static analysis |
| `dast-scan` | `scan()` | Dynamic analysis |
| `dependency-scan` | `scanDependencies()` | Dependency check |
| `compliance-check` | `runComplianceCheck()` | Compliance validation |

## Configuration Constants

```typescript
const SECURITY_CONSTANTS = {
  BASE_SECURITY_SCORE: 100,
  TARGET_COMPLIANCE_SCORE: 100,
  HTTP_OK: 200,
  HTTP_CREATED: 201,
  HTTP_UNAUTHORIZED: 401,
  HTTP_FORBIDDEN: 403,
  HTTP_TOO_MANY_REQUESTS: 429,
};
```

## Risk Scoring

```typescript
function calculateSecurityRiskScore(results: SecurityAuditReport): RiskScore {
  let score = SECURITY_CONSTANTS.BASE_SECURITY_SCORE;

  // Critical vulnerabilities: -20 each
  score -= (results.summary?.critical ?? 0) * 20;

  // High vulnerabilities: -10 each
  score -= (results.summary?.high ?? 0) * 10;

  // Medium vulnerabilities: -3 each
  score -= (results.summary?.medium ?? 0) * 3;

  // Low vulnerabilities: -1 each
  score -= (results.summary?.low ?? 0) * 1;

  // Secrets found: -15 each
  score -= (results.secretScanResults?.secretsFound.length ?? 0) * 15;

  return {
    value: Math.max(0, score),
    level: mapScoreToRiskLevel(score),
  };
}
```

## ADR References

- **ADR-051**: LLM-powered remediation advice
- **ADR-010**: Claims-based authorization for security operations
- **MM-006**: Consensus for critical vulnerability verification
