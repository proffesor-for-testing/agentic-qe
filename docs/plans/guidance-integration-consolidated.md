# Consolidated GOAP Plan: @claude-flow/guidance Integration into AQE Fleet v3

**Date**: 2026-02-03
**Version**: 2.0.0 (Consolidated)
**ADR**: [ADR-058](../../v3/implementation/adrs/ADR-058-guidance-governance-integration.md)
**Methodology**: SPARC-GOAP with Six Hats Analysis

---

## Executive Summary

This plan integrates **@claude-flow/guidance** Long-Horizon Agent Governance into AQE Fleet v3 by **wiring pre-built modules** rather than building from scratch.

**Critical Discovery**: The `@claude-flow/guidance@3.0.0-alpha.1` package (published 2026-02-02) provides **30+ pre-built governance modules**. Original 8-week plan reduced to **4 weeks**.

### Expected Outcomes

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Autonomy duration | ~30 min | 8+ hours | **10-100x** |
| Loop incidents/day | ~5 | 0 | **100%** |
| Memory corruption/week | ~2 | 0 | **100%** |
| Cost per QE run | baseline | -40% | **40%** |
| Rule compliance | Degrades | Constant | **Mechanical** |

---

## Part A: Pre-Built Modules (No Build Required)

### @claude-flow/guidance Exports

```
npm: @claude-flow/guidance@3.0.0-alpha.1

Pre-built modules (just import and wire):
├── ./continue-gate      ← ContinueGate (P0) - Loop detection
├── ./memory-gate        ← MemoryWriteGate (P0) - Contradiction detection
├── ./gateway            ← DeterministicToolGateway (P1) - Idempotency
├── ./trust              ← TrustAccumulator (P1) - Agent trust scoring
├── ./proof              ← ProofEnvelope (P2) - Hash-chained audit trails
├── ./evolution          ← Evolution Pipeline (P2) - Rule optimization
├── ./adversarial        ← Adversarial Defense - Injection detection
├── ./wasm-kernel        ← WASM Security Kernel - Fast crypto ops
├── ./compiler           ← GuidanceCompiler - Markdown → policy
├── ./retriever          ← ShardRetriever - Intent-based rule injection
├── ./authority          ← AuthorityGate - Permission boundaries
├── ./coherence          ← CoherenceScheduler - Privilege tiers
├── ./ledger             ← Proof Ledger - Persistent audit log
├── ./analyzer           ← 6-dimension scoring
├── ./optimizer          ← Rule optimizer
├── ./temporal           ← Temporal decay
├── ./artifacts          ← Artifact signing
├── ./generators         ← Scaffold generators
├── ./persistence        ← Persistent storage
├── ./uncertainty        ← Uncertainty handling
├── ./capabilities       ← Capability algebra
├── ./truth-anchors      ← Truth anchors
├── ./meta-governance    ← Meta-governance
├── ./conformance-kit    ← Acceptance tests
├── ./manifest-validator ← Manifest validation
└── ./ruvbot-integration ← RuvBot integration

Dependencies:
├── @claude-flow/hooks@^3.0.0-alpha.7   ← Has ReasoningBank integration!
├── @claude-flow/memory@^3.0.0-alpha.2
└── @claude-flow/shared@^3.0.0-alpha.1
```

### @claude-flow/hooks ReasoningBank Bridge

The hooks package already provides ReasoningBank integration:

```typescript
// From @claude-flow/hooks/reasoningbank
async generateGuidance(context: HookContext): Promise<GuidanceResult>
```

**Built-in capabilities**:
- Vector Search via HNSW (M=16, efConstruction=200)
- Domain Detection (security, testing, performance, architecture, debugging)
- Multi-Source Guidance (patterns + templates + agent suggestions)
- Agent Routing with confidence metrics

---

## Part B: Current AQE v3 State

### What Exists

| Component | Location | Status |
|-----------|----------|--------|
| UnifiedMemoryManager | `v3/src/kernel/unified-memory.ts` | Complete |
| ReasoningBankService | `v3/src/mcp/services/reasoning-bank-service.ts` | Complete |
| QE Agent Registry | `v3/src/routing/qe-agent-registry.ts` | 90+ agents |
| HNSW Vector Index | `v3/src/kernel/unified-memory.ts` | Complete |
| 12 DDD Domains | `v3/src/domains/` | Complete |
| MCP Server | `v3/src/mcp/server.ts` | 50+ tools |

### What's Missing (Gaps)

| Feature | Priority | Current | Gap |
|---------|----------|---------|-----|
| ContinueGate | P0 | None | No loop detection |
| MemoryWriteGate | P0 | None | No contradiction detection |
| DeterministicToolGateway | P1 | None | No idempotency |
| TrustAccumulator | P1 | Basic scoring | Not in routing |
| Proof Envelopes | P2 | Basic logging | No hash chains |
| Evolution Pipeline | P2 | Pattern promotion | No auto-evolution |
| Constitution | P2 | Static CLAUDE.md | No compiled policy |

---

## Part C: Revised GOAP Actions (4 Weeks)

### Phase 1: Foundation (Week 1)

```yaml
actions:
  backup_memory_db:
    id: "p1-01"
    preconditions: [".agentic-qe/memory.db exists"]
    effects: ["backup_verified = true"]
    command: |
      npm run backup
      cp .agentic-qe/memory.db .agentic-qe/backups/memory-$(date +%s).db
    cost: 1
    parallel_group: "prereq"

  install_guidance:
    id: "p1-02"
    preconditions: ["backup_verified = true"]
    effects: ["@claude-flow/guidance installed", "all_modules_available = true"]
    command: npm install @claude-flow/guidance@3.0.0-alpha.1 --save
    cost: 1
    blocked_by: ["p1-01"]

  scaffold_constitution:
    id: "p1-03"
    preconditions: ["@claude-flow/guidance installed"]
    effects: ["constitution scaffolded"]
    command: npx @claude-flow/guidance scaffold --project-root . --model claude-opus
    cost: 1
    blocked_by: ["p1-02"]

  create_feature_flags:
    id: "p1-04"
    preconditions: []
    effects: ["feature_flags_available = true"]
    file: "v3/src/governance/feature-flags.ts"
    cost: 1
    parallel_group: "infra"

  wire_continue_gate:
    id: "p1-05"
    preconditions: ["@claude-flow/guidance installed"]
    effects: ["agent_loop_protected = true"]
    agent: "qe-integration-architect"
    cost: 2
    blocked_by: ["p1-02"]

  wire_memory_write_gate:
    id: "p1-06"
    preconditions: ["@claude-flow/guidance installed"]
    effects: ["reasoning_bank_protected = true"]
    agent: "reasoningbank-learner"
    cost: 2
    parallel_group: "wiring"
    blocked_by: ["p1-02"]

phase1_goal:
  - "backup_verified = true"
  - "all_modules_available = true"
  - "constitution scaffolded"
  - "feature_flags_available = true"
  - "agent_loop_protected = true"
  - "reasoning_bank_protected = true"
```

### Phase 2: Shards & Gateway (Week 2)

```yaml
actions:
  create_12_domain_shards:
    id: "p2-01"
    preconditions: ["constitution scaffolded"]
    effects: ["all_12_shards_created = true"]
    agent: "qe-fleet-commander"
    cost: 4
    domains:
      - test-generation
      - test-execution
      - coverage-analysis
      - quality-assessment
      - defect-intelligence
      - requirements-validation
      - code-intelligence
      - security-compliance
      - contract-testing
      - visual-accessibility
      - chaos-resilience
      - learning-optimization

  wire_deterministic_gateway:
    id: "p2-02"
    preconditions: ["@claude-flow/guidance installed"]
    effects: ["tool_idempotency_enforced = true"]
    agent: "qe-integration-architect"
    cost: 2
    parallel_group: "gateway"

  wire_budget_meter:
    id: "p2-03"
    preconditions: ["@claude-flow/guidance installed"]
    effects: ["budget_metering_active = true"]
    agent: "qe-metrics-optimizer"
    cost: 2
    parallel_group: "gateway"

  test_wasm_compatibility:
    id: "p2-04"
    preconditions: ["@claude-flow/guidance installed"]
    effects: ["wasm_or_fallback_available = true"]
    agent: "performance-engineer"
    cost: 1
    parallel_group: "infra"

phase2_goal:
  - "all_12_shards_created = true"
  - "tool_idempotency_enforced = true"
  - "budget_metering_active = true"
  - "wasm_or_fallback_available = true"
```

### Phase 3: Trust & Evolution (Week 3)

```yaml
actions:
  wire_trust_accumulator:
    id: "p3-01"
    preconditions: ["reasoning_bank_protected = true"]
    effects: ["trust_routing_active = true"]
    agent: "qe-fleet-commander"
    cost: 2

  wire_evolution_pipeline:
    id: "p3-02"
    preconditions: ["reasoning_bank_protected = true"]
    effects: ["evolution_learning_integrated = true"]
    agent: "reasoningbank-learner"
    cost: 2
    parallel_group: "evolution"

  configure_shard_retriever:
    id: "p3-03"
    preconditions: ["all_12_shards_created = true"]
    effects: ["semantic_shard_retrieval_active = true"]
    agent: "memory-specialist"
    cost: 2

  embed_all_shards:
    id: "p3-04"
    preconditions: ["semantic_shard_retrieval_active = true"]
    effects: ["shard_embeddings_indexed = true"]
    agent: "qe-code-intelligence"
    cost: 1
    blocked_by: ["p3-03"]

  setup_ab_benchmarking:
    id: "p3-05"
    preconditions: ["evolution_learning_integrated = true"]
    effects: ["ab_benchmarking_available = true"]
    agent: "performance-engineer"
    cost: 2
    blocked_by: ["p3-02"]

phase3_goal:
  - "trust_routing_active = true"
  - "evolution_learning_integrated = true"
  - "semantic_shard_retrieval_active = true"
  - "shard_embeddings_indexed = true"
  - "ab_benchmarking_available = true"
```

### Phase 4: Enterprise & Validation (Week 4)

```yaml
actions:
  wire_adversarial_defense:
    id: "p4-01"
    preconditions: ["trust_routing_active = true"]
    effects: ["adversarial_detection_active = true"]
    agent: "security-architect"
    cost: 2

  configure_proof_envelopes:
    id: "p4-02"
    preconditions: ["@claude-flow/guidance installed"]
    effects: ["proof_envelopes_active = true"]
    agent: "qe-security-auditor"
    cost: 2
    parallel_group: "compliance"

  create_compliance_reporter:
    id: "p4-03"
    preconditions: ["proof_envelopes_active = true"]
    effects: ["compliance_reporting_active = true"]
    agent: "qe-quality-gate"
    cost: 2
    blocked_by: ["p4-02"]

  enforce_constitutional_invariants:
    id: "p4-04"
    preconditions: ["adversarial_detection_active = true"]
    effects: ["constitutional_invariants_enforced = true"]
    agent: "qe-integration-architect"
    cost: 2
    blocked_by: ["p4-01"]

  run_conformance_tests:
    id: "p4-05"
    preconditions: ["all wiring complete"]
    effects: ["conformance_tests_pass = true"]
    command: npx @claude-flow/guidance conformance-test
    cost: 1

  create_documentation:
    id: "p4-06"
    preconditions: ["conformance_tests_pass = true"]
    effects: ["documentation_complete = true"]
    agent: "adr-architect"
    cost: 2
    blocked_by: ["p4-05"]

phase4_goal:
  - "adversarial_detection_active = true"
  - "proof_envelopes_active = true"
  - "compliance_reporting_active = true"
  - "constitutional_invariants_enforced = true"
  - "conformance_tests_pass = true"
  - "documentation_complete = true"
```

---

## Part D: Agent Assignment Matrix

| Phase | Task | Primary Agent | Memory Namespace |
|-------|------|---------------|------------------|
| 1 | Backup | coder | `governance:backup` |
| 1 | Install | coder | `governance:install` |
| 1 | Scaffold | qe-integration-architect | `governance:constitution` |
| 1 | ContinueGate | qe-integration-architect | `governance:gates:continue` |
| 1 | MemoryWriteGate | reasoningbank-learner | `governance:gates:memory` |
| 2 | Domain Shards | qe-fleet-commander | `governance:shards` |
| 2 | Gateway | qe-integration-architect | `governance:gateway` |
| 2 | Budget Meter | qe-metrics-optimizer | `governance:budget` |
| 3 | TrustAccumulator | qe-fleet-commander | `governance:trust` |
| 3 | Evolution | reasoningbank-learner | `governance:evolution` |
| 3 | Shard Retriever | memory-specialist | `governance:retrieval` |
| 4 | Adversarial | security-architect | `governance:adversarial` |
| 4 | Proof Envelopes | qe-security-auditor | `governance:proofs` |
| 4 | Documentation | adr-architect | `governance:docs` |

---

## Part E: Execution Commands

### Phase 1 Commands

```bash
#!/bin/bash
# Phase 1: Foundation (Week 1)

echo "=== Phase 1: Foundation ==="

# Step 1: Backup (MANDATORY)
npm run backup
cp .agentic-qe/memory.db .agentic-qe/backups/memory-$(date +%s).db
ls -la .agentic-qe/backups/

# Step 2: Install guidance package
npm install @claude-flow/guidance@3.0.0-alpha.1 --save

# Step 3: Verify modules available
node -e "
const { ContinueGate } = require('@claude-flow/guidance/continue-gate');
const { MemoryWriteGate } = require('@claude-flow/guidance/memory-gate');
const { TrustAccumulator } = require('@claude-flow/guidance/trust');
console.log('ContinueGate:', typeof ContinueGate);
console.log('MemoryWriteGate:', typeof MemoryWriteGate);
console.log('TrustAccumulator:', typeof TrustAccumulator);
"

# Step 4: Scaffold constitution
npx @claude-flow/guidance scaffold --project-root . --model claude-opus

# Step 5: Create governance directory
mkdir -p v3/src/integrations/guidance

# Step 6: Record progress
npx @claude-flow/cli@latest memory store \
  --key "governance:phase1:complete" \
  --value "{\"timestamp\": \"$(date -Iseconds)\", \"status\": \"complete\"}" \
  --namespace governance

echo "Phase 1 complete."
```

### Phase 2 Commands

```bash
#!/bin/bash
# Phase 2: Shards & Gateway (Week 2)

echo "=== Phase 2: Shards & Gateway ==="

# Create 12 domain shards
for domain in test-generation test-execution coverage-analysis quality-assessment \
              defect-intelligence requirements-validation code-intelligence \
              security-compliance contract-testing visual-accessibility \
              chaos-resilience learning-optimization; do
  cat > .claude/guidance/shards/${domain}.shard.md << EOF
# ${domain} Domain Shard

## Rules
- Domain-specific governance rules for ${domain}
- Loaded automatically by ShardRetriever when task matches

## Thresholds
- Quality score minimum: 0.7
- Confidence minimum: 0.6

## Patterns
- See: v3/src/domains/${domain}/ for domain patterns
EOF
done

# Verify shards
ls -la .claude/guidance/shards/

# Record progress
npx @claude-flow/cli@latest memory store \
  --key "governance:phase2:complete" \
  --value "{\"timestamp\": \"$(date -Iseconds)\", \"shards_created\": 12}" \
  --namespace governance

echo "Phase 2 complete."
```

### Phase 3 Commands

```bash
#!/bin/bash
# Phase 3: Trust & Evolution (Week 3)

echo "=== Phase 3: Trust & Evolution ==="

# Initialize swarm for parallel work
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical-mesh \
  --max-agents 10 \
  --strategy specialized

# Generate embeddings for shards
cd v3 && npm run sync:embeddings:force 2>/dev/null || echo "Manual embedding needed" && cd ..

# Store baseline metrics
npx @claude-flow/cli@latest memory store \
  --key "governance:benchmark:baseline" \
  --value "{\"timestamp\": \"$(date -Iseconds)\", \"autonomy_min\": 30, \"loops_per_day\": 5}" \
  --namespace governance

echo "Phase 3 complete."
```

### Phase 4 Commands

```bash
#!/bin/bash
# Phase 4: Enterprise & Validation (Week 4)

echo "=== Phase 4: Enterprise & Validation ==="

# Add constitutional invariants
cat >> .claude/guidance/constitution.md << 'EOF'

## Constitutional Invariants (Enforced)

1. **Test Execution Integrity**: NEVER mark tests as passing without execution
2. **Security Scan Requirement**: NEVER skip security scans on auth-related code
3. **Regression Requirement**: ALWAYS run regression suite before release
4. **Backup Requirement**: NEVER delete coverage history without backup
5. **Verification Requirement**: ALWAYS verify before claiming success
EOF

# Run conformance tests
npx @claude-flow/guidance conformance-test

# Final metrics
npx @claude-flow/cli@latest memory store \
  --key "governance:integration:complete" \
  --value "{\"timestamp\": \"$(date -Iseconds)\", \"all_phases\": true}" \
  --namespace governance

npx @claude-flow/cli@latest hooks session-end --export-metrics true

echo "=== GUIDANCE INTEGRATION COMPLETE ==="
```

---

## Part F: File Structure After Integration

```
/workspaces/agentic-qe-new/
├── .claude/guidance/
│   ├── constitution.md                    # Main Constitution
│   └── shards/
│       ├── test-generation.shard.md
│       ├── test-execution.shard.md
│       ├── coverage-analysis.shard.md
│       ├── quality-assessment.shard.md
│       ├── defect-intelligence.shard.md
│       ├── requirements-validation.shard.md
│       ├── code-intelligence.shard.md
│       ├── security-compliance.shard.md
│       ├── contract-testing.shard.md
│       ├── visual-accessibility.shard.md
│       ├── chaos-resilience.shard.md
│       └── learning-optimization.shard.md
├── v3/src/integrations/guidance/          # NEW: Thin adapter layer
│   ├── index.ts                           # Re-exports from package
│   ├── reasoning-bank-adapter.ts          # Wires gates to ReasoningBank
│   ├── mcp-gateway-adapter.ts             # Wires gateway to MCP tools
│   ├── agent-registry-adapter.ts          # Wires trust to routing
│   └── config.ts                          # Feature flags
└── .agentic-qe/
    ├── memory.db
    ├── backups/
    │   └── memory-{timestamp}.db
    └── compliance/
        └── reports/
```

---

## Part G: Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Package is alpha | Medium | Pin exact version, monitor releases |
| Breaking changes | Medium | Feature flags for rollback |
| WASM incompatibility | Low | JS fallback built-in |
| Memory corruption | Medium | Mandatory backup before changes |
| Performance regression | Low | A/B benchmarking before merge |

### Rollback Procedure

```bash
# Emergency rollback
export GOVERNANCE_CONTINUE_GATE=false
export GOVERNANCE_MEMORY_WRITE_GATE=false
export GOVERNANCE_TRUST_ACCUMULATOR=false
export GOVERNANCE_EVOLUTION_PIPELINE=false

# Restore from backup if needed
cp .agentic-qe/backups/memory-TIMESTAMP.db .agentic-qe/memory.db
```

---

## Part H: Verification Checklist

### Phase 1 Verification

```bash
[ -f ".agentic-qe/backups/memory-*.db" ] && echo "PASS: Backup exists"
npm list @claude-flow/guidance && echo "PASS: Package installed"
[ -f ".claude/guidance/constitution.md" ] && echo "PASS: Constitution exists"
```

### Phase 2 Verification

```bash
ls -1 .claude/guidance/shards/*.shard.md | wc -l | grep -q "12" && echo "PASS: 12 shards"
```

### Phase 3 Verification

```bash
npx @claude-flow/cli@latest memory retrieve --key "governance:benchmark:baseline" --namespace governance
```

### Phase 4 Verification

```bash
npx @claude-flow/guidance conformance-test && echo "PASS: Conformance tests"
```

---

## Summary: Original vs Revised

| Aspect | Original Plan | Revised Plan |
|--------|---------------|--------------|
| Duration | 8 weeks | **4 weeks** |
| GOAP Actions | 43 | **~20** |
| Approach | Build modules | **Wire pre-built** |
| ContinueGate | Custom build | **Import from package** |
| MemoryWriteGate | Custom build | **Import from package** |
| TrustAccumulator | Custom build | **Import from package** |
| Effort reduction | - | **50%** |

---

*Consolidated plan created: 2026-02-03*
*Supersedes: guidance-integration-goap.md, guidance-integration-goap-addendum.md*
