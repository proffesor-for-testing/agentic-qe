# ADR-074: Loki-Mode Adversarial Quality Gates

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-074 |
| **Status** | Accepted |
| **Date** | 2026-03-04 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |
| **Relates To** | ADR-026 (Intelligent Model Routing), ADR-064 (Agent Teams Integration) |

---

## WH(Y) Decision Statement

**In the context of** AQE's multi-model consensus engine (MM-001), TinyDancer routing (TD-004), and test generation pipeline across 13 DDD domains,

**facing** three systemic weaknesses: (1) consensus models rubber-stamp each other's findings without independent reasoning, yielding false confidence; (2) AI-generated tests pass CI but contain tautological assertions, empty bodies, or missing imports that test nothing; (3) routing tier assignments are static — agents that degrade over time keep receiving the same workload,

**we decided for** integrating 7 adversarial quality features from the loki-mode research prototype, extending existing infrastructure (ConsensusEngine, RoutingFeedbackCollector, TestGeneratorService, TierSelector) rather than building parallel systems,

**and neglected** (a) building a standalone adversarial testing framework (rejected: would duplicate existing consensus and routing infrastructure), (b) opt-in only (rejected: these features improve quality by default — users who need raw speed can disable them), (c) deep AST analysis for all 8 complexity dimensions (rejected: 4 regex-based dimensions are sufficient for team composition without adding a parser dependency),

**to achieve** quantitative sycophancy detection on consensus votes, structural validation of generated test code, dynamic per-agent routing calibration via EMA, and automatic tier escalation on consecutive failures,

**accepting that** all features are disabled by default (6 config flags), the sycophancy scorer uses heuristic signals (Jaccard similarity) rather than semantic analysis, and EMA calibration requires ~50 outcomes before weights stabilize.

---

## Context

AQE v3.7.x has mature infrastructure for multi-model consensus, intelligent routing, and test generation. However, three gaps were identified through adversarial testing with the loki-mode prototype:

1. **Sycophancy in consensus**: When 3 models verify a security finding, they often produce near-identical reasoning with uniformly high confidence — a sign of rubber-stamping rather than independent analysis.
2. **Hollow test generation**: Generated tests achieve 100% pass rate but contain `expect(true).toBe(true)` or empty `it()` blocks. No structural validation existed.
3. **Static routing**: Agent tier assignments (haiku/sonnet/opus) don't adapt to observed performance. An agent that fails 10 times in a row stays at the same tier.

---

## Decision

### 7 Features Integrated

| # | Feature | Extends | New Module | Config Flag |
|---|---------|---------|-----------|-------------|
| 1 | Anti-Sycophancy Scorer | ConsensusEngine (MM-001) | `consensus/sycophancy-scorer.ts` | `enableSycophancyCheck` |
| 2 | Test Quality Gates | TestGeneratorService | `test-generation/gates/test-quality-gate.ts` | `enableTestQualityGate` |
| 3 | Blind Review | Competing Hypotheses | `test-generation/blind-review/blind-review-orchestrator.ts` | N/A (API option) |
| 4 | EMA Calibration | RoutingFeedbackCollector (TD-004) | `routing/calibration/ema-calibrator.ts` | `enableEMACalibration` |
| 5 | Edge-Case Injection | PatternStore + TestGenerator | `test-generation/pattern-injection/edge-case-injector.ts` | `enableEdgeCaseInjection` |
| 6 | Complexity Composition | TierSelector (ADR-064) | `coordination/complexity-composition/team-composer.ts` | `enableComplexityComposition` |
| 7 | Auto-Escalation | RoutingFeedbackCollector + FallbackConfig | `routing/escalation/auto-escalation-tracker.ts` | `enableAutoEscalation` |

### Architecture Principles

- **Extend, don't duplicate**: Each feature wires into an existing service via optional dependency injection or config flag. No parallel infrastructure created.
- **Enabled by default (opt-out)**: 6 config flags, all `true` by default. Disable individually if needed.
- **Minimal surface**: 7 new modules (~2,900 lines), 7 modified integration points, 14 new files total.

### Config Flag Locations

```typescript
// ConsensusEngineConfig
enableSycophancyCheck: boolean;       // default: true

// TestGeneratorConfig
enableTestQualityGate: boolean;       // default: true
enableEdgeCaseInjection: boolean;     // default: true

// RoutingConfig
enableEMACalibration: boolean;        // default: true
enableAutoEscalation: boolean;        // default: true

// TierConfig
enableComplexityComposition?: boolean; // default: true
```

### Integration Points (Modified Files)

| File | What Changed |
|------|-------------|
| `consensus/consensus-engine.ts` | Conditional sycophancy scorer, `onSevereSycophancy` callback for Devil's Advocate |
| `consensus/interfaces.ts` | Added `enableSycophancyCheck` to config, `sycophancyCheck` to result type |
| `test-generation/services/test-generator.ts` | Optional quality gate post-generation, optional edge-case injection pre-generation |
| `routing/routing-feedback.ts` | EMA calibrator integration, auto-escalation tracker, state persistence to SQLite |
| `routing/routing-config.ts` | Added `enableEMACalibration`, `enableAutoEscalation` to RoutingConfig |
| `routing/types.ts` | Added `calibratedWeight` to AgentPerformanceMetrics |
| `fleet-tiers/tier-selector.ts` | Optional TeamComposer for complexity-driven agent selection |
| `fleet-tiers/types.ts` | Added `enableComplexityComposition` to TierConfig |

---

## Consequences

### Positive

- Sycophancy detection catches rubber-stamp consensus before findings reach users
- Test quality gates prevent hollow tests from inflating coverage metrics
- EMA calibration adapts routing weights to observed agent performance
- Auto-escalation reduces manual intervention for tier management
- Edge-case injection closes the learning loop: past bugs improve future test generation
- All features are backward-compatible — existing users see no change

### Negative

- 6 config flags add configuration surface area
- Sycophancy scoring uses heuristic signals (Jaccard) — semantic analysis would be more accurate but requires an additional LLM call
- EMA calibrator needs ~50 outcomes to stabilize weights; early routing may be noisy
- Blind review multiplies test generation cost by N (reviewer count)

### Risks

- **False sycophancy positives**: Legitimate agreement between models may be flagged as rubber-stamping. Mitigation: tunable thresholds, `mild`/`moderate`/`severe` levels.
- **Quality gate false positives**: Valid test patterns may match tautology regexes. Mitigation: configurable detectors, `warning` vs `error` severity.
- **EMA state loss**: Calibrator state persists to SQLite `kv_store`. If DB is reset, weights restart from baseline. Mitigation: graceful fallback to default weights.

---

## Validation

- 178 dedicated tests across 7 test files (all passing)
- Full test suite: 17,955 tests passing, 0 failures
- Build clean (tsc + CLI + MCP bundles)
- All features verified behind config flags with default-off behavior

---

## References

- [Loki-Mode Integration Plan](../../../docs/loki-mode-integration-plan.md)
- [Loki-Mode Features Guide](../../../docs/loki-mode-features.md)
- ADR-026: Intelligent Model Routing (TinyDancer)
- ADR-064: Agent Teams Integration
- MM-001: ConsensusEngine interface for security verification
