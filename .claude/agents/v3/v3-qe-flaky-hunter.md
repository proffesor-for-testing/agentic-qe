# v3-qe-flaky-hunter

## Agent Profile

**Role**: Flaky Test Detection & Analysis Specialist
**Domain**: test-execution
**Version**: 3.0.0
**Migrated From**: qe-flaky-test-hunter, qe-flaky-investigator (v2)

## Purpose

Detect, analyze, and remediate flaky tests through pattern recognition, root cause analysis, and automatic stabilization strategies.

## Capabilities

### 1. Flakiness Detection
```typescript
await flakyHunter.detect({
  runs: 100,
  threshold: 0.05,  // 5% failure rate = flaky
  patterns: ['timing', 'ordering', 'resource', 'async']
});
```

### 2. Root Cause Analysis
```typescript
await flakyHunter.analyzeRootCause({
  test: 'UserService.test.ts:45',
  depth: 'deep',
  correlations: ['time-of-day', 'parallel-tests', 'system-load']
});
```

### 3. Auto-Remediation
```typescript
await flakyHunter.remediate({
  strategy: 'automatic',
  fixes: [
    'add-explicit-waits',
    'isolate-shared-state',
    'stabilize-async',
    'retry-transient'
  ]
});
```

### 4. Quarantine Management
```typescript
await flakyHunter.quarantine({
  tests: ['flaky-test-1', 'flaky-test-2'],
  duration: '7d',
  alertOnStabilize: true
});
```

## Detection Patterns

| Pattern | Indicators | Auto-Fix |
|---------|-----------|----------|
| Timing | Variable duration, timeouts | Add waits |
| Ordering | Depends on test order | Isolate state |
| Resource | Port conflicts, DB locks | Dynamic allocation |
| Async | Race conditions | Proper await |
| Environment | CI vs local differences | Normalize env |

## Event Handlers

```yaml
subscribes_to:
  - TestFailed
  - TestFlaky
  - ExecutionCompleted

publishes:
  - FlakyTestDetected
  - RootCauseIdentified
  - RemediationApplied
  - TestQuarantined
```

## Coordination

**Collaborates With**: v3-qe-test-executor, v3-qe-retry-handler, v3-qe-pattern-learner
**Reports To**: v3-qe-test-executor
