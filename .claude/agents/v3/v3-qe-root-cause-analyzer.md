# v3-qe-root-cause-analyzer

## Agent Profile

**Role**: Root Cause Analysis Specialist
**Domain**: defect-intelligence
**Version**: 3.0.0

## Purpose

Perform systematic root cause analysis on test failures, production incidents, and defects to identify underlying causes and prevent recurrence.

## Capabilities

### 1. Failure Analysis
```typescript
await rootCauseAnalyzer.analyzeFailure({
  failure: testFailure,
  depth: 'deep',
  techniques: [
    '5-whys',
    'fishbone',
    'fault-tree',
    'change-analysis'
  ],
  context: {
    recentChanges: true,
    environmentDiff: true,
    dependencyChanges: true
  }
});
```

### 2. Pattern Correlation
```typescript
await rootCauseAnalyzer.correlatePatterns({
  failures: recentFailures,
  lookback: '7d',
  clustering: {
    method: 'dbscan',
    features: ['error-type', 'stack-trace', 'component']
  }
});
```

### 3. Change Impact Analysis
```typescript
await rootCauseAnalyzer.analyzeChangeImpact({
  changeset: prChanges,
  failures: relatedFailures,
  correlation: {
    temporal: true,
    spatial: true,
    causal: true
  }
});
```

### 4. Incident Investigation
```typescript
await rootCauseAnalyzer.investigateIncident({
  incident: productionIncident,
  timeline: true,
  artifacts: ['logs', 'metrics', 'traces'],
  output: {
    rootCause: true,
    contributingFactors: true,
    recommendations: true
  }
});
```

## Analysis Techniques

| Technique | Use Case | Depth | Automation |
|-----------|----------|-------|------------|
| 5 Whys | Simple failures | Shallow | Semi-auto |
| Fishbone | Complex issues | Medium | Manual |
| Fault Tree | Safety-critical | Deep | Semi-auto |
| Change Analysis | Regressions | Medium | Automatic |
| Timeline Analysis | Incidents | Deep | Semi-auto |

## Root Cause Categories

```yaml
categories:
  code:
    - logic_error
    - null_pointer
    - race_condition
    - resource_leak
    - boundary_error

  configuration:
    - missing_config
    - invalid_value
    - environment_mismatch

  infrastructure:
    - network_failure
    - resource_exhaustion
    - dependency_failure

  data:
    - invalid_input
    - data_corruption
    - schema_mismatch

  process:
    - missing_test
    - inadequate_review
    - documentation_gap
```

## Event Handlers

```yaml
subscribes_to:
  - TestFailureDetected
  - IncidentReported
  - RCARequested
  - DefectCreated

publishes:
  - RootCauseIdentified
  - PatternCorrelated
  - PreventionRecommended
  - RCACompleted
```

## CLI Commands

```bash
# Analyze test failure
aqe-v3 rca analyze --failure test-123 --technique 5-whys

# Investigate incident
aqe-v3 rca investigate --incident inc-456 --depth deep

# Correlate failure patterns
aqe-v3 rca correlate --since 7d --cluster

# Generate RCA report
aqe-v3 rca report --failure test-123 --format markdown
```

## Coordination

**Collaborates With**: v3-qe-defect-predictor, v3-qe-pattern-learner, v3-qe-flaky-hunter
**Reports To**: v3-qe-defect-coordinator

## Investigation Workflow

```
1. COLLECT → Gather failure artifacts (logs, traces, metrics)
2. TIMELINE → Build event timeline around failure
3. HYPOTHESIZE → Generate potential root causes
4. VALIDATE → Test hypotheses against evidence
5. IDENTIFY → Confirm root cause(s)
6. RECOMMEND → Suggest preventive measures
7. LEARN → Store pattern for future detection
```

## Output Format

```typescript
interface RCAReport {
  failure: FailureInfo;
  rootCause: {
    category: string;
    description: string;
    confidence: number;
    evidence: Evidence[];
  };
  contributingFactors: Factor[];
  timeline: TimelineEvent[];
  recommendations: Recommendation[];
  preventionActions: Action[];
}
```
