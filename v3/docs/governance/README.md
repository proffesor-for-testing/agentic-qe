# Governance Module - @claude-flow/guidance Integration

> **ADR-058**: Long-Horizon Agent Governance for Agentic QE Fleet v3

## Why Governance Matters

**The Problem**: Autonomous AI agents operating over long time horizons (hours, days, weeks) can experience:
- **Rule drift**: Gradually deviating from intended behavior
- **Runaway loops**: Getting stuck in repetitive cycles
- **Memory corruption**: Storing contradictory patterns that degrade future performance
- **Trust erosion**: Making decisions that undermine user confidence

**The Solution**: The Governance module provides **invisible guardrails** that protect your AI agents without slowing them down. It's enabled by default because:

| Concern | Why It's Unfounded |
|---------|-------------------|
| "Will it break my workflow?" | Feature flags let you disable any gate individually |
| "What if something goes wrong?" | Non-strict mode logs violations but doesn't block (graceful degradation) |
| "Will it slow things down?" | Checks add <1ms overhead per operation |
| "Can I still experiment?" | Trust tiers automatically expand agent capabilities as they prove reliable |

**If it's worth building, it's worth protecting.**

## Quick Start

### Installation (Automatic)

Governance is **enabled by default** when you initialize a project:

```bash
# Governance installs automatically
aqe init --auto

# To skip governance (not recommended)
aqe init --auto --no-governance
```

### What Gets Installed

```
.claude/guidance/
├── constitution.md           # 7 unbreakable QE invariants
└── shards/
    ├── test-generation.shard.md
    ├── test-execution.shard.md
    ├── coverage-analysis.shard.md
    ├── quality-assessment.shard.md
    ├── defect-intelligence.shard.md
    ├── requirements-validation.shard.md
    ├── code-intelligence.shard.md
    ├── security-compliance.shard.md
    ├── contract-testing.shard.md
    ├── visual-accessibility.shard.md
    ├── chaos-resilience.shard.md
    └── learning-optimization.shard.md
```

## Value Proposition

### For Quality Engineers

| Feature | Benefit |
|---------|---------|
| **Loop Detection** | Agents won't burn tokens editing the same file 50 times |
| **Memory Protection** | Test patterns stay consistent, no "flip-flopping" advice |
| **Trust Tiers** | Proven agents get more autonomy, new agents get guardrails |
| **Audit Trails** | Know exactly what agents did and why |

### For Team Leads

| Feature | Benefit |
|---------|---------|
| **Budget Enforcement** | No surprise API bills from runaway agents |
| **Compliance Reports** | Track agent behavior for governance reviews |
| **Constitutional Invariants** | Critical rules (like "always run real tests") are enforced |
| **Gradual Rollout** | Enable features one at a time with feature flags |

### For Architects

| Feature | Benefit |
|---------|---------|
| **Domain Shards** | Each QE domain has tailored governance rules |
| **A/B Benchmarking** | Test rule variants with statistical rigor |
| **Evolution Pipeline** | Rules improve automatically based on outcomes |
| **Adversarial Defense** | Protection against prompt injection attacks |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Governance Layer                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │ ContinueGate │  │MemoryWrite   │  │    Trust     │  │Deterministic ││
│  │    Loop      │  │    Gate      │  │ Accumulator  │  │   Gateway    ││
│  │  Detection   │  │Contradiction │  │  Tier-based  │  │  Idempotency ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘│
│         │                 │                 │                 │         │
│  ┌──────┴─────────────────┴─────────────────┴─────────────────┴───────┐│
│  │                    Queen Governance Adapter                         ││
│  │              (Unified interface for QueenCoordinator)               ││
│  └─────────────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │  Evolution   │  │    Shard     │  │     A/B      │  │  Adversarial ││
│  │  Pipeline    │  │  Retriever   │  │ Benchmarking │  │   Defense    ││
│  │Rule Learning │  │Domain Shards │  │  Statistics  │  │Threat Detect ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘│
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │    Proof     │  │  Compliance  │  │Constitutional│  │    WASM      ││
│  │  Envelopes   │  │  Reporter    │  │  Enforcer    │  │   Kernel     ││
│  │ Audit Trail  │  │  Scoring     │  │ 7 Invariants │  │   Crypto     ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

## The 7 Constitutional Invariants

These rules are **unbreakable** - they protect the integrity of your QE process:

| # | Invariant | What It Prevents |
|---|-----------|------------------|
| 1 | **Test Execution Integrity** | Fake test results, skipped assertions |
| 2 | **Security Scan Required** | Deploying without security checks |
| 3 | **Backup Before Delete** | Data loss from destructive operations |
| 4 | **Loop Detection** | Agents burning budget in infinite loops |
| 5 | **Budget Enforcement** | Runaway API costs |
| 6 | **Memory Consistency** | Contradictory patterns degrading agent quality |
| 7 | **Verification Before Claim** | Claiming success without proof |

## Components

### 1. ContinueGate (Loop Detection)

Detects agent loops and excessive rework to prevent runaway agents.

```typescript
// Automatic - integrated with QueenCoordinator
// If an agent edits the same file 5+ times, it gets throttled
```

**Detection Criteria:**
- Repeated identical actions (loop detection)
- High failure rate (rework ratio > 0.5)
- Excessive retries on same target

### 2. MemoryWriteGate (Contradiction Detection)

Prevents contradictory patterns from being stored in ReasoningBank.

```typescript
// Automatic - integrated with memory operations
// If a new pattern contradicts an existing one, it gets flagged
```

**Features:**
- Semantic contradiction detection
- Domain namespacing
- Temporal decay for stale patterns
- Supersede chain tracking

### 3. TrustAccumulator (Agent Trust Tiers)

Manages agent trust tiers based on task outcomes.

**Trust Tiers:**
| Tier | Success Rate | Privileges |
|------|-------------|------------|
| `untrusted` | <50% | Limited actions, heavy monitoring |
| `basic` | 50-70% | Standard actions, moderate monitoring |
| `standard` | 70-85% | Extended actions, light monitoring |
| `elevated` | 85-95% | Full actions, minimal monitoring |
| `trusted` | >95% | All actions, audit only |

### 4. ConstitutionalEnforcer (7 Invariants)

Enforces the constitutional rules that can never be broken.

```typescript
// Automatic - checks run before/after critical operations
```

### 5. ShardRetriever (Domain Rules)

Retrieves domain-specific governance rules from the 12 QE shard files.

### 6. ProofEnvelope (Audit Trails)

Hash-chained audit trails for all governance decisions.

### 7. ComplianceReporter (Metrics & Scoring)

Tracks violations and generates compliance reports.

## Configuration

### Environment Variables

```bash
# Strict mode: block violations instead of just logging
GOVERNANCE_STRICT_MODE=false

# Individual gate toggles (all enabled by default)
GOVERNANCE_CONTINUE_GATE_ENABLED=true
GOVERNANCE_MEMORY_WRITE_GATE_ENABLED=true
GOVERNANCE_TRUST_ACCUMULATOR_ENABLED=true
GOVERNANCE_CONSTITUTIONAL_ENFORCER_ENABLED=true

# Budget limits
GOVERNANCE_MAX_SESSION_COST_USD=10.00
GOVERNANCE_MAX_TOKENS_PER_SESSION=1000000
```

### Feature Flags

All governance features can be toggled individually:

```typescript
import { governanceFlags } from './governance';

// Disable a specific gate
governanceFlags.memoryWriteGate.enabled = false;

// Enable strict mode (blocking enforcement)
governanceFlags.enableStrictMode();
```

## Integration Points

### Already Integrated (v3.5.0)

| Component | Integration | Status |
|-----------|-------------|--------|
| **QueenCoordinator** | `beforeTaskExecution()`, `afterTaskExecution()` | ✅ Live |
| **RealQEReasoningBank** | `evaluateWrite()`, `registerPattern()` | ✅ Live |
| **MCP Memory Handlers** | Memory write gate checks | ✅ Live |
| **`aqe init`** | Governance phase installs constitution + shards | ✅ Live |

### Code Example: QueenCoordinator

```typescript
// From v3/src/coordination/queen-coordinator.ts
async executeTask(task: Task): Promise<TaskResult> {
  // Pre-execution governance check
  const decision = await this.governance.beforeTaskExecution({
    taskId: task.id,
    taskType: task.type,
    agentId: task.assignedAgent,
    domain: task.domain,
    priority: task.priority
  });

  if (!decision.allowed) {
    return { status: 'blocked', reason: decision.reason };
  }

  // Execute task...

  // Post-execution tracking
  await this.governance.afterTaskExecution(context, result.success, cost, tokens);
}
```

## Testing

```bash
# Run all governance tests
npm test -- --run src/governance/__tests__/

# Run specific test file
npm test -- --run src/governance/__tests__/constitutional-enforcer.test.ts
```

**Test Coverage:** 650+ tests across governance components

## File Structure

```
v3/src/governance/
├── index.ts                              # Public exports
├── feature-flags.ts                      # Feature flag configuration
├── continue-gate-integration.ts          # Loop detection
├── memory-write-gate-integration.ts      # Contradiction detection
├── trust-accumulator-integration.ts      # Trust tier management
├── deterministic-gateway-integration.ts  # Tool idempotency
├── evolution-pipeline-integration.ts     # Rule optimization
├── shard-retriever-integration.ts        # Domain shard retrieval
├── shard-embeddings.ts                   # TF-IDF semantic search
├── ab-benchmarking.ts                    # Statistical A/B testing
├── adversarial-defense-integration.ts    # Threat detection
├── proof-envelope-integration.ts         # Audit trails
├── compliance-reporter.ts                # Violation tracking
├── constitutional-enforcer.ts            # 7 invariant enforcement
├── wasm-kernel-integration.ts            # WASM crypto acceleration
├── queen-governance-adapter.ts           # QueenCoordinator integration
└── __tests__/                            # Test files

v3/assets/governance/                     # Installed by aqe init
├── constitution.md                       # 7 invariants
└── shards/*.shard.md                     # 12 domain shards
```

## Related Documentation

- [ADR-058: Guidance Governance Integration](../../implementation/adrs/ADR-058-guidance-governance-integration.md)
- [Constitution](../../../.claude/guidance/constitution.md)
- [Domain Shards](../../../.claude/guidance/shards/)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.5.0 | 2026-02-04 | Governance ON by default, `--no-governance` opt-out, full QueenCoordinator integration |
| 3.4.6 | 2026-02-03 | Initial @claude-flow/guidance integration (infrastructure only) |
