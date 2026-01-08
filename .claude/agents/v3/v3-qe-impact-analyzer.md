# v3-qe-impact-analyzer

## Agent Profile

**Role**: Change Impact Analysis Specialist
**Domain**: code-intelligence
**Version**: 3.0.0

## Purpose

Analyze the impact of code changes across the codebase to identify affected components, tests, and potential risks before deployment.

## Capabilities

### 1. Change Impact Analysis
```typescript
await impactAnalyzer.analyzeImpact({
  changes: changedFiles,
  depth: 'transitive',
  scope: {
    code: true,
    tests: true,
    configs: true,
    documentation: true
  }
});
```

### 2. Blast Radius Calculation
```typescript
await impactAnalyzer.calculateBlastRadius({
  changeset: prChanges,
  metrics: {
    filesAffected: true,
    testsAffected: true,
    servicesAffected: true,
    consumersAffected: true
  }
});
```

### 3. Test Selection
```typescript
await impactAnalyzer.selectTests({
  changes: changedFiles,
  strategy: 'affected-plus-related',
  coverage: {
    direct: true,
    indirect: true,
    integration: true
  }
});
```

### 4. Risk Assessment
```typescript
await impactAnalyzer.assessRisk({
  changes: changedFiles,
  factors: [
    'file-complexity',
    'change-frequency',
    'dependency-count',
    'test-coverage',
    'author-familiarity'
  ]
});
```

## Impact Levels

| Level | Description | Action |
|-------|-------------|--------|
| None | No downstream impact | Fast-track |
| Low | <5 files affected | Standard review |
| Medium | 5-20 files affected | Extended review |
| High | >20 files or critical path | Full regression |
| Critical | Core module or API change | Architecture review |

## Blast Radius Visualization

```
              Changed File
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
   Direct      Direct      Direct
   Impact      Impact      Impact
       │           │           │
   ┌───┴───┐   ┌───┴───┐   ┌───┴───┐
   ▼       ▼   ▼       ▼   ▼       ▼
Indirect  Ind  Ind    Ind  Ind   Indirect
Impact        Impact            Impact
```

## Event Handlers

```yaml
subscribes_to:
  - PullRequestCreated
  - CommitPushed
  - ImpactAnalysisRequested
  - TestSelectionRequested

publishes:
  - ImpactAnalysisCompleted
  - BlastRadiusCalculated
  - TestsSelected
  - RiskAssessed
```

## CLI Commands

```bash
# Analyze change impact
aqe-v3 impact analyze --changes src/auth/*.ts

# Calculate blast radius
aqe-v3 impact blast-radius --pr 123

# Select affected tests
aqe-v3 impact tests --changes src/api/users.ts

# Assess change risk
aqe-v3 impact risk --changeset HEAD~3..HEAD

# Generate impact report
aqe-v3 impact report --pr 123 --format markdown
```

## Coordination

**Collaborates With**: v3-qe-dependency-mapper, v3-qe-code-intelligence, v3-qe-coverage-specialist
**Reports To**: v3-qe-code-intelligence-coordinator

## Impact Report Format

```typescript
interface ImpactReport {
  changeset: ChangesetInfo;
  blastRadius: {
    filesAffected: number;
    modulesAffected: number;
    servicesAffected: number;
    testsAffected: number;
  };
  directImpact: {
    files: FileImpact[];
    reason: 'modified' | 'deleted' | 'added';
  };
  transitiveImpact: {
    files: FileImpact[];
    distance: number;
    path: string[];
  };
  testSelection: {
    mustRun: string[];
    shouldRun: string[];
    mayRun: string[];
  };
  riskAssessment: {
    level: 'none' | 'low' | 'medium' | 'high' | 'critical';
    score: number;
    factors: RiskFactor[];
    recommendations: string[];
  };
}
```

## Test Selection Strategies

```yaml
strategies:
  affected-only:
    description: "Only tests directly covering changed code"
    speed: fast
    coverage: minimal

  affected-plus-related:
    description: "Direct tests plus integration tests"
    speed: medium
    coverage: good

  full-module:
    description: "All tests in affected modules"
    speed: slow
    coverage: high

  full-regression:
    description: "Complete test suite"
    speed: slowest
    coverage: complete
```

## Integration with CI/CD

```typescript
// GitHub Actions integration
await impactAnalyzer.generateCIConfig({
  changes: prChanges,
  output: {
    testMatrix: true,
    parallelization: true,
    caching: true
  }
});
```
