# Cross-Phase Memory Implementation

**Version**: 1.1
**Date**: 2026-01-25
**Status**: ✅ IMPLEMENTED

---

## Implementation Status

| Component | Status | Location |
|-----------|--------|----------|
| TypeScript Types | ✅ Implemented | `v3/src/types/cross-phase-signals.ts` |
| Memory Service | ✅ Implemented | `v3/src/memory/cross-phase-memory.ts` |
| Hook Executor | ✅ Implemented | `v3/src/hooks/cross-phase-hooks.ts` |
| Hook Config | ✅ Implemented | `.claude/hooks/cross-phase-memory.yaml` |

**Commit**: `50dc1aaa` - feat(v3): implement cross-phase memory system for QCSD feedback loops

---

## Overview

This document defines the persistent memory architecture that enables automated cross-phase feedback loops in QCSD. Without this memory layer, feedback loops are manual; with it, they become automated.

**Note**: The schemas and configurations below are now actual TypeScript code - see Implementation Status table above.

---

## Memory Architecture

### Namespace Structure

```
qcsd-memory/
├── production-patterns/          # Loop 1 & 2: Production → Earlier phases
│   ├── defect-weights/          # Risk weights from defect analysis
│   ├── failure-modes/           # Common failure patterns
│   └── sla-violations/          # Performance/reliability issues
│
├── development-patterns/         # Loop 4: Development → Grooming
│   ├── coverage-gaps/           # Untestable code patterns
│   ├── ac-problems/             # Requirements that caused issues
│   └── test-debt/               # Technical debt indicators
│
├── cicd-patterns/               # Loop 3: CI/CD → Development
│   ├── flaky-tests/             # Flaky test patterns
│   ├── gate-failures/           # Quality gate failure reasons
│   └── build-health/            # Build stability metrics
│
└── cross-phase-signals/         # Routing signals between phases
    ├── ideation-inputs/         # What Ideation should know
    ├── grooming-inputs/         # What Grooming should know
    └── development-inputs/      # What Development should know
```

---

## Loop 1: Production → Ideation (Strategic)

### Memory Schema

```typescript
interface ProductionRiskSignal {
  id: string;                          // "risk-signal-2026-Q1-001"
  timestamp: string;                   // ISO 8601
  source: "production";
  target: "ideation";
  loopType: "strategic";

  riskWeights: {
    category: string;                  // "payment-integration", "auth-session"
    weight: number;                    // 0.0 - 1.0 (higher = riskier)
    confidence: number;                // 0.0 - 1.0
    evidence: {
      defectCount: number;
      percentageOfTotal: number;
      severityDistribution: Record<string, number>;
      timeRange: { start: string; end: string };
    };
  }[];

  recommendations: {
    forRiskAssessor: string[];         // ["Weight payment risks at 0.85"]
    forQualityCriteria: string[];      // ["Security category = P0 for payment features"]
  };

  expiresAt: string;                   // When this signal becomes stale
}
```

### Storage Implementation

```javascript
// PRODUCTION PHASE: Store risk signals after analyzing defects

// Step 1: Analyze production defects
const defectAnalysis = await mcp__agentic_qe__defect_predict({
  target: "production-logs/",
  timeRange: "last-90-days"
});

// Step 2: Extract risk weights
const riskWeights = extractRiskWeights(defectAnalysis);

// Step 3: Store for Ideation consumption
await mcp__agentic_qe__memory_store({
  key: `risk-signal-${quarter}-${Date.now()}`,
  namespace: "qcsd-memory/production-patterns/defect-weights",
  value: {
    id: `risk-signal-${quarter}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: "production",
    target: "ideation",
    loopType: "strategic",
    riskWeights: [
      {
        category: "payment-integration",
        weight: 0.85,
        confidence: 0.92,
        evidence: {
          defectCount: 47,
          percentageOfTotal: 47,
          severityDistribution: { P1: 12, P2: 23, P3: 12 },
          timeRange: { start: "2025-10-01", end: "2026-01-01" }
        }
      },
      {
        category: "auth-session",
        weight: 0.70,
        confidence: 0.88,
        evidence: {
          defectCount: 23,
          percentageOfTotal: 23,
          severityDistribution: { P1: 5, P2: 10, P3: 8 },
          timeRange: { start: "2025-10-01", end: "2026-01-01" }
        }
      }
    ],
    recommendations: {
      forRiskAssessor: [
        "Weight payment-integration risks at 0.85 (HIGH)",
        "Weight auth-session risks at 0.70 (HIGH)",
        "Require timeout/retry strategy for payment features"
      ],
      forQualityCriteria: [
        "Security category = P0 for features touching payments",
        "Reliability category = P0 for session management"
      ]
    },
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
  }
});

// Step 4: Notify learning coordinator
await mcp__agentic_qe__memory_share({
  sourceAgentId: "qe-defect-predictor",
  targetAgentIds: ["qe-learning-coordinator"],
  knowledgeDomain: "production-risk-signals"
});
```

### Retrieval Implementation (Ideation Phase)

```javascript
// IDEATION PHASE: Query risk signals before risk assessment

// Step 1: Query production signals
const productionSignals = await mcp__agentic_qe__memory_query({
  pattern: "risk-signal-*",
  namespace: "qcsd-memory/production-patterns/defect-weights"
});

// Step 2: Filter to non-expired signals
const activeSignals = productionSignals.filter(
  s => new Date(s.expiresAt) > new Date()
);

// Step 3: Apply to risk assessment
const riskAssessmentPrompt = `
You are qe-risk-assessor. Before starting, apply these LEARNED RISK WEIGHTS:

${activeSignals.map(s => s.riskWeights.map(rw =>
  `- ${rw.category}: Weight ${rw.weight} (${rw.evidence.percentageOfTotal}% of defects)`
).join('\n')).join('\n')}

RECOMMENDATIONS FROM PRODUCTION:
${activeSignals.flatMap(s => s.recommendations.forRiskAssessor).join('\n')}

Now assess risks for the following epic, with these weights pre-applied:
[EPIC CONTENT]
`;

await Task({
  description: "Risk assessment with production learning",
  prompt: riskAssessmentPrompt,
  subagent_type: "qe-risk-assessor",
  run_in_background: true
});
```

### CLI Alternative

```bash
# PRODUCTION: Store risk signal
npx @claude-flow/cli@latest memory store \
  --key "risk-signal-2026-Q1-$(date +%s)" \
  --namespace "qcsd-memory/production-patterns/defect-weights" \
  --value '{
    "source": "production",
    "target": "ideation",
    "riskWeights": [
      {"category": "payment-integration", "weight": 0.85}
    ]
  }'

# IDEATION: Query risk signals
npx @claude-flow/cli@latest memory search \
  --query "risk weights for ideation" \
  --namespace "qcsd-memory/production-patterns"

# Route signals to learning coordinator
npx @claude-flow/cli@latest hooks route \
  --task "Apply production risk weights to ideation" \
  --source "qe-defect-predictor" \
  --target "qe-learning-coordinator"
```

---

## Loop 2: Production → Grooming (Tactical)

### Memory Schema

```typescript
interface SFDIPOTWeightSignal {
  id: string;
  timestamp: string;
  source: "production";
  target: "grooming";
  loopType: "tactical";

  factorWeights: {
    factor: "Structure" | "Function" | "Data" | "Interfaces" | "Platform" | "Operations" | "Time";
    weight: number;                    // 0.0 - 1.0
    defectPercentage: number;
    commonPatterns: string[];          // ["decimal precision", "null handling"]
  }[];

  featureContext: string;              // "payment", "auth", "reporting"

  recommendations: {
    forProductFactorsAssessor: string[];
  };
}
```

### Storage Implementation

```javascript
// PRODUCTION: Analyze defects by SFDIPOT factor

await mcp__agentic_qe__memory_store({
  key: `sfdipot-weights-${featureArea}-${Date.now()}`,
  namespace: "qcsd-memory/production-patterns/failure-modes",
  value: {
    id: `sfdipot-weights-${featureArea}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: "production",
    target: "grooming",
    loopType: "tactical",
    factorWeights: [
      {
        factor: "Data",
        weight: 0.90,
        defectPercentage: 60,
        commonPatterns: [
          "decimal precision in currency",
          "null handling in optional fields",
          "timezone conversion errors"
        ]
      },
      {
        factor: "Interfaces",
        weight: 0.75,
        defectPercentage: 25,
        commonPatterns: [
          "API contract version mismatch",
          "timeout handling missing",
          "retry logic insufficient"
        ]
      }
    ],
    featureContext: "payment-transfers",
    recommendations: {
      forProductFactorsAssessor: [
        "Weight Data factor at 0.90 for payment features",
        "Always check: decimal precision, null handling, timezone",
        "Weight Interfaces at 0.75 - API contracts need explicit validation"
      ]
    }
  }
});
```

### Retrieval Implementation (Grooming Phase)

```javascript
// GROOMING: Query SFDIPOT weights before product factors assessment

const sfdipotSignals = await mcp__agentic_qe__memory_query({
  pattern: `sfdipot-weights-${featureArea}-*`,
  namespace: "qcsd-memory/production-patterns/failure-modes"
});

const productFactorsPrompt = `
You are qe-product-factors-assessor. Apply these LEARNED FACTOR WEIGHTS:

FEATURE AREA: ${featureArea}

HISTORICAL DEFECT PATTERNS:
${sfdipotSignals.flatMap(s => s.factorWeights.map(fw =>
  `${fw.factor}: ${fw.defectPercentage}% of defects
   Common patterns: ${fw.commonPatterns.join(', ')}`
)).join('\n\n')}

WEIGHT THESE FACTORS HIGHER in your SFDIPOT assessment.

Now analyze the following story:
[STORY CONTENT]
`;
```

---

## Loop 3: CI/CD → Development (Operational)

### Memory Schema

```typescript
interface TestHealthSignal {
  id: string;
  timestamp: string;
  source: "cicd";
  target: "development";
  loopType: "operational";

  flakyPatterns: {
    pattern: string;                   // "shared database state"
    frequency: number;                 // How often it causes flakiness
    affectedTests: string[];           // Test file paths
    rootCause: string;
    fix: string;                       // "Use transaction rollback"
  }[];

  gateFailures: {
    reason: string;
    percentage: number;
    trend: "increasing" | "stable" | "decreasing";
  }[];

  recommendations: {
    forTestArchitect: string[];
    antiPatterns: string[];            // Patterns to AVOID in new tests
  };
}
```

### Storage Implementation

```javascript
// CI/CD: After quality gate evaluation, store patterns

await mcp__agentic_qe__memory_store({
  key: `test-health-${sprint}-${Date.now()}`,
  namespace: "qcsd-memory/cicd-patterns/flaky-tests",
  value: {
    id: `test-health-${sprint}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: "cicd",
    target: "development",
    loopType: "operational",
    flakyPatterns: [
      {
        pattern: "shared-database-state",
        frequency: 0.80,
        affectedTests: [
          "tests/integration/user.test.ts",
          "tests/integration/order.test.ts"
        ],
        rootCause: "Tests share database without isolation",
        fix: "Use transaction rollback or test containers"
      },
      {
        pattern: "timing-dependent-assertions",
        frequency: 0.15,
        affectedTests: [
          "tests/e2e/notification.test.ts"
        ],
        rootCause: "setTimeout-based waits instead of polling",
        fix: "Use waitFor() with polling instead of fixed delays"
      }
    ],
    gateFailures: [
      { reason: "flaky-tests", percentage: 60, trend: "stable" },
      { reason: "genuine-regression", percentage: 25, trend: "decreasing" },
      { reason: "environment-issues", percentage: 15, trend: "increasing" }
    ],
    recommendations: {
      forTestArchitect: [
        "Generate tests with isolated database state (transaction rollback)",
        "Use polling-based waits, never setTimeout",
        "Mock external services by default"
      ],
      antiPatterns: [
        "AVOID: Shared database fixtures between tests",
        "AVOID: Fixed setTimeout waits",
        "AVOID: Tests that depend on execution order"
      ]
    }
  }
});
```

### Retrieval Implementation (Development Phase)

```javascript
// DEVELOPMENT: Query CI/CD health before generating tests

const cicdSignals = await mcp__agentic_qe__memory_query({
  pattern: "test-health-*",
  namespace: "qcsd-memory/cicd-patterns/flaky-tests"
});

const testArchitectPrompt = `
You are qe-test-architect. CRITICAL: Apply these LEARNED ANTI-PATTERNS:

FLAKY PATTERNS TO AVOID:
${cicdSignals.flatMap(s => s.flakyPatterns.map(fp =>
  `❌ ${fp.pattern} (causes ${fp.frequency * 100}% of flakiness)
   Root cause: ${fp.rootCause}
   ✅ Fix: ${fp.fix}`
)).join('\n\n')}

ANTI-PATTERNS (DO NOT GENERATE):
${cicdSignals.flatMap(s => s.recommendations.antiPatterns).join('\n')}

REQUIRED PATTERNS:
${cicdSignals.flatMap(s => s.recommendations.forTestArchitect).join('\n')}

Now generate tests for:
[CODE TO TEST]
`;
```

---

## Loop 4: Development → Grooming (Quality Criteria)

### Memory Schema

```typescript
interface ACQualitySignal {
  id: string;
  timestamp: string;
  source: "development";
  target: "grooming";
  loopType: "quality-criteria";

  untestablePatterns: {
    acPattern: string;                 // "user should be notified"
    problem: string;                   // "No observable behavior"
    frequency: number;                 // How often this pattern appears
    betterPattern: string;             // "User receives X notification within Y seconds"
  }[];

  coverageGaps: {
    codeArea: string;
    coveragePercentage: number;
    rootCause: string;                 // "Vague AC", "Missing edge cases"
    acImprovement: string;
  }[];

  recommendations: {
    forRequirementsValidator: string[];
    acTemplates: Record<string, string>;  // Pattern → Template
  };
}
```

### Storage Implementation

```javascript
// DEVELOPMENT: After coverage analysis, store AC quality signals

await mcp__agentic_qe__memory_store({
  key: `ac-quality-${sprint}-${Date.now()}`,
  namespace: "qcsd-memory/development-patterns/ac-problems",
  value: {
    id: `ac-quality-${sprint}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: "development",
    target: "grooming",
    loopType: "quality-criteria",
    untestablePatterns: [
      {
        acPattern: "user should be notified",
        problem: "No observable behavior - how do we verify?",
        frequency: 0.35,
        betterPattern: "User receives [type] notification within [X] seconds via [channel], verifiable by [method]"
      },
      {
        acPattern: "system should be fast",
        problem: "No measurable criteria",
        frequency: 0.20,
        betterPattern: "API response time < [X]ms at p95 under [Y] concurrent users"
      },
      {
        acPattern: "data should be secure",
        problem: "Too vague to test",
        frequency: 0.15,
        betterPattern: "PII fields encrypted at rest (AES-256), in transit (TLS 1.3), masked in logs"
      }
    ],
    coverageGaps: [
      {
        codeArea: "notification-service",
        coveragePercentage: 45,
        rootCause: "AC says 'notify' but no testable criteria",
        acImprovement: "Add: delivery confirmation, timing SLA, retry on failure"
      }
    ],
    recommendations: {
      forRequirementsValidator: [
        "Flag ACs containing 'should be notified' - require delivery mechanism",
        "Flag ACs containing 'should be fast' - require p95 latency target",
        "Flag ACs containing 'should be secure' - require specific controls"
      ],
      acTemplates: {
        "notification": "User receives [type] notification within [X] seconds via [channel], verifiable by [observable behavior]",
        "performance": "Operation completes in < [X]ms at p95 under [Y] concurrent users",
        "security": "[Data type] encrypted with [algorithm] at rest, [protocol] in transit, [masking] in logs"
      }
    }
  }
});
```

### Retrieval Implementation (Grooming Phase)

```javascript
// GROOMING: Query AC quality signals before requirements validation

const acSignals = await mcp__agentic_qe__memory_query({
  pattern: "ac-quality-*",
  namespace: "qcsd-memory/development-patterns/ac-problems"
});

const requirementsValidatorPrompt = `
You are qe-requirements-validator. FLAG these KNOWN UNTESTABLE PATTERNS:

PATTERNS THAT CAUSED COVERAGE GAPS:
${acSignals.flatMap(s => s.untestablePatterns.map(up =>
  `❌ Pattern: "${up.acPattern}"
   Problem: ${up.problem}
   Frequency: ${up.frequency * 100}% of ACs
   ✅ Better: "${up.betterPattern}"`
)).join('\n\n')}

AC TEMPLATES TO SUGGEST:
${Object.entries(acSignals[0]?.recommendations.acTemplates || {}).map(
  ([type, template]) => `${type}: "${template}"`
).join('\n')}

Now validate these acceptance criteria:
[AC CONTENT]

For any AC matching the untestable patterns, IMMEDIATELY FLAG IT and suggest the better pattern.
`;
```

---

## Automatic Trigger Hooks

### Hook Configuration

```yaml
# .claude/hooks/cross-phase-memory.yaml

hooks:
  # After production defect analysis
  post-defect-analysis:
    trigger: "qe-defect-predictor completes"
    action:
      - store_risk_weights
      - notify_learning_coordinator
    target_phases: [ideation, grooming]

  # After CI/CD quality gate
  post-quality-gate:
    trigger: "qe-quality-gate completes"
    action:
      - store_flaky_patterns
      - store_gate_failure_reasons
    target_phases: [development]

  # After coverage analysis
  post-coverage-analysis:
    trigger: "qe-coverage-specialist completes"
    action:
      - store_coverage_gaps
      - store_ac_problems
    target_phases: [grooming]

  # At phase start - query relevant signals
  pre-ideation:
    trigger: "ideation phase starts"
    action:
      - query_production_risk_signals
      - inject_into_agent_context

  pre-grooming:
    trigger: "grooming phase starts"
    action:
      - query_sfdipot_weights
      - query_ac_quality_signals
      - inject_into_agent_context

  pre-development:
    trigger: "development phase starts"
    action:
      - query_cicd_health_signals
      - inject_into_agent_context
```

### CLI Hook Commands

```bash
# Register post-task hook for defect analysis
npx @claude-flow/cli@latest hooks post-task \
  --task-id "defect-analysis" \
  --success true \
  --action "store-cross-phase-signal" \
  --target-namespace "qcsd-memory/production-patterns"

# Register pre-task hook for ideation
npx @claude-flow/cli@latest hooks pre-task \
  --description "QCSD Ideation" \
  --action "query-cross-phase-signals" \
  --source-namespaces "qcsd-memory/production-patterns"
```

---

## Memory Expiration & Cleanup

### Expiration Policy

| Signal Type | Default TTL | Rationale |
|-------------|-------------|-----------|
| Risk weights | 90 days | Defect patterns change slowly |
| SFDIPOT weights | 90 days | Product factor risks stable |
| Flaky patterns | 30 days | CI/CD health changes quickly |
| AC quality | 60 days | Grooming practices evolve |

### Cleanup Job

```javascript
// Run weekly to clean expired signals
async function cleanupExpiredSignals() {
  const namespaces = [
    "qcsd-memory/production-patterns/defect-weights",
    "qcsd-memory/production-patterns/failure-modes",
    "qcsd-memory/cicd-patterns/flaky-tests",
    "qcsd-memory/development-patterns/ac-problems"
  ];

  for (const namespace of namespaces) {
    const signals = await mcp__agentic_qe__memory_query({
      pattern: "*",
      namespace
    });

    for (const signal of signals) {
      if (new Date(signal.expiresAt) < new Date()) {
        await mcp__agentic_qe__memory_delete({
          key: signal.id,
          namespace
        });
        console.log(`Expired: ${signal.id}`);
      }
    }
  }
}
```

---

## Verification: Is the Loop Working?

### Metrics to Track

```typescript
interface FeedbackLoopMetrics {
  loopId: string;                      // "loop-1-strategic"

  // Input metrics
  signalsGenerated: number;            // How many signals stored
  signalsConsumed: number;             // How many signals queried

  // Output metrics
  recommendationsApplied: number;      // Did target agent use them?
  outcomesImproved: boolean;           // Did defects decrease?

  // Timing
  avgSignalAge: number;                // Days since signal created
  consumptionLatency: number;          // Time from store to query
}
```

### Dashboard Query

```javascript
// Check loop health
const loopHealth = await mcp__agentic_qe__memory_query({
  pattern: "*",
  namespace: "qcsd-memory/cross-phase-signals"
});

console.log(`
CROSS-PHASE FEEDBACK LOOP HEALTH
================================
Loop 1 (Strategic):  ${countSignals(loopHealth, 'strategic')} signals
Loop 2 (Tactical):   ${countSignals(loopHealth, 'tactical')} signals
Loop 3 (Operational): ${countSignals(loopHealth, 'operational')} signals
Loop 4 (QualityCrit): ${countSignals(loopHealth, 'quality-criteria')} signals

Oldest signal: ${getOldestSignal(loopHealth)}
Newest signal: ${getNewestSignal(loopHealth)}
`);
```

---

## Summary

| Loop | Storage Namespace | Key Pattern | TTL |
|------|-------------------|-------------|-----|
| 1: Strategic | `production-patterns/defect-weights` | `risk-signal-*` | 90d |
| 2: Tactical | `production-patterns/failure-modes` | `sfdipot-weights-*` | 90d |
| 3: Operational | `cicd-patterns/flaky-tests` | `test-health-*` | 30d |
| 4: Quality Criteria | `development-patterns/ac-problems` | `ac-quality-*` | 60d |

**Key Principle:** Store at source phase, query at target phase, expire when stale.

---

*Document created: 2026-01-25*
*Implementation specification for QCSD cross-phase memory*
