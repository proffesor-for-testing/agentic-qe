---
name: "qe-defect-intelligence"
description: "Predict defects before they escape using ML, analyze root causes with 5-whys and fault trees, and learn defect patterns from historical data. Use when prioritizing testing by risk or investigating recurring failures."
---

# QE Defect Intelligence

ML-based defect prediction, pattern recognition from historical data, and automated root cause analysis.

## Quick Start

```bash
# Predict defects in changed code
aqe defect predict --changes HEAD~5..HEAD

# Analyze failure patterns
aqe defect patterns --period 90d --min-occurrences 3

# Root cause analysis
aqe defect rca --failure "test/auth.test.ts:45"

# Learn from resolved defects
aqe defect learn --source jira --status resolved
```

## Workflow

### Step 1: Predict Defect-Prone Code

```typescript
await defectPredictor.predictFromChanges({
  changes: prChanges,
  factors: {
    codeChurn: { weight: 0.2 },
    complexity: { weight: 0.25 },
    authorExperience: { weight: 0.15 },
    fileHistory: { weight: 0.2 },
    testCoverage: { weight: 0.2 }
  },
  threshold: { high: 0.7, medium: 0.4, low: 0.2 }
});
```

**Checkpoint:** Flag all files with risk score > 0.7 for extra review.

### Step 2: Learn Patterns

```typescript
await patternLearner.learnPatterns({
  source: {
    defects: 'jira:project=MYAPP&type=bug',
    commits: 'git:last-6-months',
    tests: 'test-results:last-1000-runs'
  },
  patterns: ['code-smell-to-defect', 'change-coupling', 'test-gap-correlation', 'complexity-defect-density'],
  output: { rules: true, visualizations: true, recommendations: true }
});
```

**Checkpoint:** Validate learned patterns against holdout data set.

### Step 3: Root Cause Analysis

```typescript
await rootCauseAnalyzer.analyze({
  failure: testFailure,
  methods: ['five-whys', 'fishbone-diagram', 'fault-tree', 'change-impact'],
  context: {
    recentChanges: true,
    environmentDiff: true,
    dependencyChanges: true,
    similarFailures: true
  }
});
```

## Pattern Categories

| Pattern | Detection | Prevention |
|---------|-----------|------------|
| Null pointer | Static analysis | Null checks, Optional |
| Race condition | Concurrency analysis | Locks, atomic ops |
| Memory leak | Heap analysis | Resource cleanup |
| Off-by-one | Boundary analysis | Loop invariants |
| Injection | Taint analysis | Input validation |

## Root Cause Templates

```yaml
five_whys:
  max_depth: 5
  prompt_template: "Why did {effect} happen?"

fishbone:
  categories: [people, process, tools, environment, materials, measurement]

fault_tree:
  top_event: "Test Failure"
  gate_types: [AND, OR, NOT]
```

## Issue Tracker Integration

```typescript
await defectIntelligence.syncWithTracker({
  source: 'jira',
  project: 'MYAPP',
  sync: { defectData: 'bidirectional', predictions: 'create-tasks', patterns: 'update-labels' },
  automation: { flagHighRisk: true, suggestAssignee: true, linkRelated: true }
});
```

## Coordination

**Primary Agents**: qe-defect-predictor, qe-pattern-learner, qe-root-cause-analyzer
**Related Skills**: qe-coverage-analysis, qe-quality-assessment
