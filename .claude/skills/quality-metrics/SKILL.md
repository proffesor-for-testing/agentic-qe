---
name: quality-metrics
description: "Tracks quality metrics including defect density, test effectiveness ratio, DORA metrics, and mean time to detection. Use when establishing quality dashboards, defining KPIs, evaluating test suite effectiveness, or reporting quality trends to stakeholders."
category: testing-methodologies
priority: high
tokenEstimate: 900
agents: [qe-quality-analyzer, qe-test-executor, qe-coverage-analyzer, qe-production-intelligence, qe-quality-gate]
implementation_status: optimized
optimization_version: 1.0
last_optimized: 2025-12-02
dependencies: []
quick_reference_card: true
tags: [metrics, dora, quality-gates, dashboards, kpis, measurement]
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/quality-metrics.yaml
---

# Quality Metrics

<default_to_action>
When measuring quality or building dashboards:
1. MEASURE outcomes (bug escape rate, MTTD) not activities (test count)
2. AVOID vanity metrics: 100% coverage means nothing if tests don't catch bugs
3. SET thresholds that drive behavior (quality gates block bad code)
4. TREND over time: Direction matters more than absolute numbers
</default_to_action>

## Quick Reference Card

### When to Use
- Building quality dashboards
- Defining quality gates
- Evaluating testing effectiveness
- Justifying quality investments

### Quality Gate Thresholds
| Metric | Blocking Threshold | Warning |
|--------|-------------------|---------|
| Test pass rate | 100% | - |
| Critical coverage | > 80% | > 70% |
| Security critical | 0 | - |
| Performance p95 | < 200ms | < 500ms |
| Flaky tests | < 2% | < 5% |

---

## Dashboard Design

```typescript
// Agent generates quality dashboard
await Task("Generate Dashboard", {
  metrics: {
    delivery: ['deployment-frequency', 'lead-time', 'change-failure-rate'],
    quality: ['bug-escape-rate', 'test-effectiveness', 'defect-density'],
    stability: ['mttd', 'mttr', 'availability'],
    process: ['code-review-time', 'flaky-test-rate', 'coverage-trend']
  },
  visualization: 'grafana',
  alerts: {
    critical: { bug_escape_rate: '>20%', mttr: '>24h' },
    warning: { coverage: '<70%', flaky_rate: '>5%' }
  }
}, "qe-quality-analyzer");
```

---

## Quality Gate Configuration

```json
{
  "qualityGates": {
    "commit": {
      "coverage": { "min": 80, "blocking": true },
      "lint": { "errors": 0, "blocking": true }
    },
    "pr": {
      "tests": { "pass": "100%", "blocking": true },
      "security": { "critical": 0, "blocking": true },
      "coverage_delta": { "min": 0, "blocking": false }
    },
    "release": {
      "e2e": { "pass": "100%", "blocking": true },
      "performance_p95": { "max_ms": 200, "blocking": true },
      "bug_escape_rate": { "max": "10%", "blocking": false }
    }
  }
}
```

---

## Agent-Assisted Metrics

```typescript
// Calculate quality trends
await Task("Quality Trend Analysis", {
  timeframe: '90d',
  metrics: ['bug-escape-rate', 'mttd', 'test-effectiveness'],
  compare: 'previous-90d',
  predictNext: '30d'
}, "qe-quality-analyzer");

// Evaluate quality gate
await Task("Quality Gate Evaluation", {
  buildId: 'build-123',
  environment: 'staging',
  metrics: currentMetrics,
  policy: qualityPolicy
}, "qe-quality-gate");
```

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/quality-metrics/
├── dashboards/*         - Dashboard configurations
├── trends/*             - Historical metric data
├── gates/*              - Gate evaluation results
└── alerts/*             - Triggered alerts
```

### Fleet Coordination
```typescript
const metricsFleet = await FleetManager.coordinate({
  strategy: 'quality-metrics',
  agents: [
    'qe-quality-analyzer',         // Trend analysis
    'qe-test-executor',            // Test metrics
    'qe-coverage-analyzer',        // Coverage data
    'qe-production-intelligence',  // Production metrics
    'qe-quality-gate'              // Gate decisions
  ],
  topology: 'mesh'
});
```

---

## Related Skills
- [agentic-quality-engineering](../agentic-quality-engineering/) - Agent coordination
- [cicd-pipeline-qe-orchestrator](../cicd-pipeline-qe-orchestrator/) - Quality gates
- [risk-based-testing](../risk-based-testing/) - Risk-informed metrics
- [shift-right-testing](../shift-right-testing/) - Production metrics

---

## Remember

**With Agents:** Agents track metrics automatically, analyze trends, trigger alerts, and make gate decisions. Use agents to maintain continuous quality visibility.
