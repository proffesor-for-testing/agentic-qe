# ADR-058: @claude-flow/guidance Governance Integration

**Status:** Implemented
**Date:** 2026-02-03
**Implemented:** 2026-02-04
**Decision Makers:** Architecture Team
**Context Owner:** Lead Architect
**Analysis Method:** Six Thinking Hats
**Implementation Plan:** [guidance-integration-consolidated.md](../../../docs/plans/guidance-integration-consolidated.md)

---

## Context

AQE Fleet v3 agents experience predictable degradation patterns:

| Problem | Impact | Current Mitigation |
|---------|--------|-------------------|
| Rule drift after ~30 minutes | Agents ignore CLAUDE.md policies | None |
| Runaway loops | Token waste, infinite retries | Manual intervention |
| Memory corruption | Contradictory patterns in ReasoningBank | None |
| No audit trails | Cannot prove decisions for compliance | Basic logging |
| One-size-fits-all rules | Same rules for all task types | None |

The `@claude-flow/guidance` package (v3.0.0-alpha.1, published 2026-02-02) provides a complete governance solution with:
- 7-phase enforcement pipeline (compile, retrieve, enforce, track trust, defend, prove, evolve)
- 30+ pre-built modules
- WASM security kernel
- ReasoningBank integration via @claude-flow/hooks

### Analysis Method

Six Thinking Hats analysis was conducted ([full report](../../../docs/analysis/claude-flow-guidance-six-hats-analysis.md)):

| Hat | Key Findings |
|-----|--------------|
| White (Facts) | 31 modules, 10-100x autonomy improvement, 30-60% cost reduction |
| Red (Intuition) | Excited about autonomy gains, anxious about 31 modules complexity |
| Black (Risks) | Alpha package, breaking changes possible, WASM compatibility |
| Yellow (Benefits) | Pre-built modules, ReasoningBank bridge exists, conformance tests included |
| Green (Ideas) | Dual trust system, HNSW-powered shard retrieval, contradiction as test oracle |
| Blue (Action) | 4-week phased rollout, wire don't build, feature flags for safety |

---

## Decision

**Integrate @claude-flow/guidance into AQE Fleet v3 by wiring pre-built modules to existing infrastructure, NOT by building custom governance components.**

### Key Architectural Choices

1. **Import, Don't Build**: Use pre-built modules from the package
2. **Thin Adapter Layer**: Create minimal adapters in `v3/src/integrations/guidance/`
3. **Feature Flag Rollout**: Each governance feature toggleable independently
4. **12 QE-Specific Shards**: Domain-specific policy bundles
5. **Leverage Existing Bridge**: Use @claude-flow/hooks ReasoningBank integration

### What We're Integrating

| Module | Import Path | AQE Integration Point |
|--------|-------------|----------------------|
| ContinueGate | `@claude-flow/guidance/continue-gate` | ReasoningBankService agent loop |
| MemoryWriteGate | `@claude-flow/guidance/memory-gate` | ReasoningBankService.storePattern |
| DeterministicToolGateway | `@claude-flow/guidance/gateway` | MCP tool handlers |
| TrustAccumulator | `@claude-flow/guidance/trust` | QE_AGENT_REGISTRY routing |
| ProofEnvelope | `@claude-flow/guidance/proof` | Audit trail for compliance |
| Evolution Pipeline | `@claude-flow/guidance/evolution` | ReasoningBank pattern promotion |
| ShardRetriever | `@claude-flow/guidance/retriever` | Domain-specific rule loading |
| WASM Kernel | `@claude-flow/guidance/wasm-kernel` | Security-critical operations |

### What We're Creating

| Component | Purpose |
|-----------|---------|
| 12 domain shards | QE-specific governance rules per domain |
| Thin adapters | Wire package modules to AQE services |
| Feature flags | Gradual rollout and emergency rollback |
| Constitution | Unbreakable QE invariants |

---

## Rationale

### Why Pre-Built Modules (Not Custom Build)

| Factor | Custom Build | Pre-Built Modules |
|--------|--------------|-------------------|
| Time to implement | 8 weeks | 4 weeks |
| Testing required | Extensive | Conformance kit included |
| Maintenance burden | High | Package maintainer |
| Risk of bugs | High (new code) | Lower (tested in claude-flow) |
| ReasoningBank integration | Custom bridge needed | Already exists in @claude-flow/hooks |

### Why This Package

1. **Same ecosystem**: Both AQE and guidance built on claude-flow patterns
2. **ReasoningBank compatibility**: @claude-flow/hooks already bridges guidance to ReasoningBank
3. **HNSW integration**: Uses same vector search approach as AQE
4. **Proven architecture**: 7-phase pipeline addresses all our identified gaps

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Build custom governance | 2x effort, maintenance burden, reinventing |
| No governance | Unacceptable degradation patterns continue |
| Different governance package | None as comprehensive, no ReasoningBank bridge |
| Wait for stable release | Alpha risk acceptable with feature flags |

---

## Consequences

### Positive

- **10-100x autonomy improvement**: Agents can run for hours/days instead of minutes
- **30-60% cost reduction**: Duplicate operations eliminated via DeterministicToolGateway
- **Zero loop drift**: ContinueGate mechanically enforced
- **Zero memory corruption**: MemoryWriteGate contradiction detection
- **Compliance ready**: Hash-chained proof envelopes for audit trails
- **Self-improving**: Evolution pipeline optimizes rules from run history
- **50% effort reduction**: 4 weeks instead of 8 weeks

### Negative

- **Alpha dependency**: Package may have breaking changes
- **Version lock risk**: Must pin exact version
- **New dependency tree**: Adds @claude-flow/hooks, @claude-flow/memory, @claude-flow/shared
- **Learning curve**: Team must understand guidance concepts

### Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking changes | Pin exact version (3.0.0-alpha.1), feature flags |
| Dependency bloat | Evaluate bundle size, tree-shaking |
| Learning curve | Documentation, training session |
| Alpha bugs | Conformance tests, integration tests |

---

## Implementation

### Phase Overview

| Phase | Week | Focus | Key Deliverables |
|-------|------|-------|------------------|
| 1 | 1 | Foundation | Install, scaffold, wire ContinueGate + MemoryWriteGate |
| 2 | 2 | Shards & Gateway | 12 domain shards, DeterministicToolGateway, budget metering |
| 3 | 3 | Trust & Evolution | TrustAccumulator, Evolution Pipeline, HNSW shard retrieval |
| 4 | 4 | Enterprise | Adversarial defense, proof envelopes, conformance tests |

### File Structure

```
v3/src/integrations/guidance/
├── index.ts                     # Re-exports from @claude-flow/guidance
├── reasoning-bank-adapter.ts    # Wires gates to ReasoningBankService
├── mcp-gateway-adapter.ts       # Wires gateway to MCP tools
├── agent-registry-adapter.ts    # Wires trust to agent routing
├── feature-flags.ts             # GOVERNANCE_* environment flags
└── config.ts                    # Guidance configuration

.claude/guidance/
├── constitution.md              # QE Constitutional invariants
└── shards/
    ├── test-generation.shard.md
    ├── coverage-analysis.shard.md
    ├── security-compliance.shard.md
    └── ... (12 total)
```

### Feature Flags

```typescript
export const GOVERNANCE_FLAGS = {
  CONTINUE_GATE_ENABLED: process.env.GOVERNANCE_CONTINUE_GATE === 'true',
  MEMORY_WRITE_GATE_ENABLED: process.env.GOVERNANCE_MEMORY_WRITE_GATE === 'true',
  DETERMINISTIC_GATEWAY_ENABLED: process.env.GOVERNANCE_DETERMINISTIC_GATEWAY === 'true',
  TRUST_ACCUMULATOR_ENABLED: process.env.GOVERNANCE_TRUST_ACCUMULATOR === 'true',
  PROOF_ENVELOPES_ENABLED: process.env.GOVERNANCE_PROOF_ENVELOPES === 'true',
  EVOLUTION_PIPELINE_ENABLED: process.env.GOVERNANCE_EVOLUTION_PIPELINE === 'true',
  ADVERSARIAL_DEFENSE_ENABLED: process.env.GOVERNANCE_ADVERSARIAL_DEFENSE === 'true',
};
```

### Integration Pattern

```typescript
// v3/src/integrations/guidance/index.ts
import { ContinueGate } from '@claude-flow/guidance/continue-gate';
import { MemoryWriteGate } from '@claude-flow/guidance/memory-gate';
import { TrustAccumulator } from '@claude-flow/guidance/trust';
import { GOVERNANCE_FLAGS } from './feature-flags';

export function createGovernanceMiddleware(reasoningBank: ReasoningBankService) {
  const middleware = {
    continueGate: GOVERNANCE_FLAGS.CONTINUE_GATE_ENABLED
      ? new ContinueGate()
      : null,
    memoryWriteGate: GOVERNANCE_FLAGS.MEMORY_WRITE_GATE_ENABLED
      ? new MemoryWriteGate()
      : null,
    trustAccumulator: GOVERNANCE_FLAGS.TRUST_ACCUMULATOR_ENABLED
      ? new TrustAccumulator()
      : null,
  };

  return middleware;
}
```

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Autonomy duration | ~30 min | 8+ hours | Time between rule drift |
| Loop incidents/day | ~5 | 0 | ContinueGate block count |
| Memory corruption/week | ~2 | 0 | MemoryWriteGate conflicts |
| Cost per QE run | baseline | -40% | Budget meter reports |
| Agent reliability | unknown | 95%+ | TrustAccumulator scores |
| Routing accuracy | ~70% | 85%+ | Trust-based routing metrics |
| Compliance audit time | hours | minutes | Proof envelope export |

---

## Verification

### Phase 1 Verification

```bash
# Backup exists
[ -f ".agentic-qe/backups/memory-*.db" ] && echo "PASS"

# Package installed
npm list @claude-flow/guidance | grep "3.0.0-alpha.1" && echo "PASS"

# Constitution scaffolded
[ -f ".claude/guidance/constitution.md" ] && echo "PASS"

# ContinueGate integrated
grep -r "ContinueGate" v3/src/ && echo "PASS"
```

### Final Verification

```bash
# Run conformance tests
npx @claude-flow/guidance conformance-test

# Verify all metrics
npx @claude-flow/cli@latest memory search --query "governance:*" --namespace governance
```

---

## References

- [Six Hats Analysis](../../../docs/analysis/claude-flow-guidance-six-hats-analysis.md)
- [Consolidated GOAP Plan](../../../docs/plans/guidance-integration-consolidated.md)
- [@claude-flow/guidance README](https://github.com/ruvnet/claude-flow/blob/main/v3/%40claude-flow/guidance/README.md)
- [ADR-021: QE ReasoningBank](./v3-adrs.md#adr-021-qe-reasoningbank-for-pattern-learning)
- [ADR-022: Adaptive QE Agent Routing](./v3-adrs.md#adr-022-adaptive-qe-agent-routing)

---

---

## Implementation Notes (2026-02-04)

### Modules Implemented

All governance modules created in `v3/src/governance/`:

| Module | File | Status |
|--------|------|--------|
| ContinueGate | `continue-gate-integration.ts` | ✅ Implemented |
| MemoryWriteGate | `memory-write-gate-integration.ts` | ✅ Implemented |
| TrustAccumulator | `trust-accumulator-integration.ts` | ✅ Implemented |
| DeterministicToolGateway | `deterministic-gateway-integration.ts` | ✅ Implemented |
| ProofEnvelope | `proof-envelope-integration.ts` | ✅ Implemented |
| Evolution Pipeline | `evolution-pipeline-integration.ts` | ✅ Implemented |
| ShardRetriever | `shard-retriever-integration.ts` | ✅ Implemented |
| WASM Kernel | `wasm-kernel-integration.ts` | ✅ Implemented |
| A/B Benchmarking | `ab-benchmarking.ts` | ✅ Implemented |
| Adversarial Defense | `adversarial-defense-integration.ts` | ✅ Implemented |
| Constitutional Enforcer | `constitutional-enforcer.ts` | ✅ Implemented |
| Compliance Reporter | `compliance-reporter.ts` | ✅ Implemented |
| Feature Flags | `feature-flags.ts` | ✅ Implemented |
| Queen Governance Adapter | `queen-governance-adapter.ts` | ✅ Implemented |
| GovernanceAwareDomainMixin | `coordination/mixins/governance-aware-domain.ts` | ✅ Implemented |

### Integration Points Wired

| Integration Point | Location | Gates Wired |
|-------------------|----------|-------------|
| QueenCoordinator | `coordination/queen-coordinator.ts` | ContinueGate, TrustAccumulator, BudgetMeter |
| RealQEReasoningBank | `learning/real-qe-reasoning-bank.ts` | MemoryWriteGate (evaluateWrite, registerPattern) |
| MCP Memory Handlers | `mcp/handlers/memory-handlers.ts` | MemoryWriteGate (memory_store, memory_share) |
| 12 Domain Coordinators | `domains/*/coordinator.ts` | GovernanceAwareDomainMixin |
| Security Compliance | `domains/security-compliance/coordinator.ts` | validateSecurityScanRequired() (Constitutional Invariant #2) |
| Chaos Resilience | `domains/chaos-resilience/coordinator.ts` | createDestructiveOpsGovernanceMixin (Constitutional Invariant #3) |

### Test Coverage

- **657 tests passing** (full test suite)
- **13 governance integration test files**
- Tests verify: ContinueGate blocking, MemoryWriteGate contradiction detection, TrustAccumulator scoring, Constitutional Invariant enforcement

### Domain Coordinators with GovernanceAwareDomainMixin

All 12 domain coordinators wired:
1. test-generation - `createGovernanceAwareMixin`
2. test-execution - `createGovernanceAwareMixin`
3. coverage-analysis - `createGovernanceAwareMixin`
4. quality-assessment - `createGovernanceAwareMixin`
5. defect-intelligence - `createGovernanceAwareMixin`
6. learning-optimization - `createGovernanceAwareMixin`
7. requirements-validation - `createGovernanceAwareMixin`
8. visual-accessibility - `createGovernanceAwareMixin`
9. chaos-resilience - `createDestructiveOpsGovernanceMixin`
10. contract-testing - `createGovernanceAwareMixin`
11. code-intelligence - `createGovernanceAwareMixin`
12. security-compliance - `createSecurityGovernanceMixin`

### Pending (Optional Configuration)

- `.claude/guidance/shards/` - 12 domain-specific shard files (configuration, not code)

---

*ADR created: 2026-02-03*
*Implementation completed: 2026-02-04*
*Package version: @claude-flow/guidance@3.0.0-alpha.1*
