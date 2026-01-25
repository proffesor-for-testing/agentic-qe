# Coordination Protocols

Agentic QE v3 uses 6 coordination protocols for automated multi-agent workflows.

## Protocol Overview

| Protocol | Trigger | Participants | Purpose |
|----------|---------|--------------|---------|
| Morning Sync | 9am daily | All agents | Prioritization |
| Quality Gate | Release candidate | Queen + specialists | Deployment decision |
| Learning Consolidation | Friday 6pm | Learning group | Pattern consolidation |
| Defect Investigation | Test failure | Defect group | Root cause analysis |
| Code Intelligence Index | Code change | Code intel group | KG update |
| Security Audit | 2am daily | Security group | Security scan |

## Protocol 1: Morning Sync

**Schedule**: Daily 9am or session start

**Participants**: All agents

**Workflow**:
```
1. Queen collects overnight test results
2. Agents report pending tasks
3. Risk areas identified
4. Work prioritized for the day
5. Resource allocation
```

**Trigger**:
```bash
# Automatic at 9am
# Or manual:
aqe-v3 orchestrate --protocol morning-sync
```

## Protocol 2: Quality Gate

**Trigger**: Release candidate event

**Participants**:
- v3-qe-queen-coordinator
- v3-qe-quality-gate
- v3-qe-coverage-specialist
- v3-qe-regression-analyzer
- v3-qe-security-scanner

**Workflow**:
```
1. Aggregate quality metrics
2. Evaluate coverage thresholds
3. Check for regressions
4. Run security scan
5. ML-based risk assessment
6. Recommend: deploy/block/warn
```

**Trigger**:
```bash
aqe-v3 orchestrate --protocol quality-gate
# Or via event: release-candidate
```

**Output**:
```typescript
interface QualityGateResult {
  decision: 'deploy' | 'block' | 'warn';
  confidence: number;
  metrics: {
    coverage: number;
    testsPassing: number;
    regressionRisk: number;
    securityScore: number;
  };
  blockers: string[];
  warnings: string[];
}
```

## Protocol 3: Learning Consolidation

**Schedule**: Friday 6pm

**Participants**:
- v3-qe-learning-coordinator
- v3-qe-transfer-specialist
- v3-qe-pattern-learner
- v3-qe-production-intel

**Workflow**:
```
1. Gather patterns from all domains
2. Consolidate into knowledge base
3. Identify cross-domain transfers
4. Update embeddings
5. Prune stale patterns
6. Report sprint learnings
```

**Trigger**:
```bash
aqe-v3 orchestrate --protocol learning-consolidation
```

## Protocol 4: Defect Investigation

**Trigger**: Test failure event

**Participants**:
- v3-qe-defect-predictor
- v3-qe-root-cause-analyzer
- v3-qe-flaky-hunter
- v3-qe-regression-analyzer

**Workflow**:
```
1. Check if test is flaky
2. If not flaky:
   a. Analyze root cause
   b. Predict related failures
   c. Check for regression
3. Generate investigation report
4. Suggest fixes
```

**Trigger**:
```bash
aqe-v3 investigate <failure-id>
# Or automatic on test-failure event
```

**Output**:
```typescript
interface InvestigationResult {
  testId: string;
  isFlaky: boolean;
  rootCause: {
    type: string;
    description: string;
    evidence: string[];
  };
  relatedFailures: string[];
  regressionRisk: number;
  suggestedFixes: Fix[];
}
```

## Protocol 5: Code Intelligence Index

**Trigger**: Code change, hourly, or manual

**Participants**:
- v3-qe-code-intelligence
- v3-qe-semantic-analyzer
- v3-qe-dependency-mapper

**Workflow**:
```
1. Detect changed files
2. Parse AST and extract entities
3. Update Knowledge Graph
4. Refresh embeddings
5. Rebuild dependency graph
6. Calculate impact scores
```

**Trigger**:
```bash
aqe-v3 kg index
# Or automatic on code-change event
# Or hourly schedule
```

## Protocol 6: Security Audit

**Schedule**: 2am daily or on dependency update

**Participants**:
- v3-qe-security-scanner
- v3-qe-security-auditor
- v3-qe-compliance-validator

**Workflow**:
```
1. Run SAST scan
2. Check dependencies for CVEs
3. Validate compliance (SOC2, GDPR)
4. Generate security report
5. Create issues for critical findings
6. Notify on critical vulnerabilities
```

**Trigger**:
```bash
aqe-v3 security audit
# Or automatic at 2am
# Or on dependency-update event
```

**Output**:
```typescript
interface SecurityAuditResult {
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  compliance: {
    soc2: 'pass' | 'fail' | 'partial';
    gdpr: 'pass' | 'fail' | 'partial';
  };
  findings: Finding[];
  recommendations: string[];
}
```

## Custom Protocols

You can define custom protocols:

```yaml
# .agentic-qe/protocols/custom-review.yaml
name: code-review
description: "Comprehensive code review"
participants:
  - v3-qe-code-reviewer
  - v3-qe-security-scanner
  - v3-qe-quality-analyzer
triggers:
  - event: pull-request-created
  - command: "aqe-v3 review"
workflow:
  - step: quality-check
    agent: v3-qe-quality-analyzer
  - step: security-scan
    agent: v3-qe-security-scanner
  - step: review
    agent: v3-qe-code-reviewer
    depends_on: [quality-check, security-scan]
```

## Protocol Events

Each protocol publishes events:

| Protocol | Events Published |
|----------|------------------|
| Morning Sync | `DailyPlanCreated`, `RisksIdentified` |
| Quality Gate | `QualityGateEvaluated`, `DeploymentApproved/Blocked` |
| Learning Consolidation | `PatternsConsolidated`, `TransferCompleted` |
| Defect Investigation | `RootCauseIdentified`, `FixSuggested` |
| Code Intelligence Index | `KnowledgeGraphUpdated`, `ImpactCalculated` |
| Security Audit | `SecurityAuditCompleted`, `VulnerabilityFound` |

## Related Documentation

- [Agent Index](index.md)
- [Agent Hierarchy](hierarchy.md)
- [Domain Events](../reference/events.md)
