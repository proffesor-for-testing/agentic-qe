# Governance Module - @claude-flow/guidance Integration

> **ADR-058**: Long-Horizon Agent Governance for Agentic QE Fleet v3

## Overview

The Governance module provides enterprise-grade governance mechanisms for the Agentic QE Fleet, implementing the @claude-flow/guidance patterns for long-horizon agent autonomy. It ensures agents operate within safe boundaries while maximizing effectiveness through trust accumulation, learning, and adaptive rule evolution.

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

## Components

### 1. Feature Flags (`feature-flags.ts`)

Central configuration for gradual rollout of governance features.

```typescript
import { governanceFlags, loadFlagsFromEnv } from './governance';

// Load from environment
loadFlagsFromEnv();

// Check specific features
if (isContinueGateEnabled()) {
  // Loop detection active
}

// Enable strict mode (blocking enforcement)
governanceFlags.enableStrictMode();
```

**Feature Categories:**
- `global`: Log violations, escalate to Queen, strict mode
- `continueGate`: Loop detection, rework ratio thresholds
- `memoryWriteGate`: Contradiction detection, temporal decay
- `trustAccumulator`: Tier thresholds, auto-adjustment
- `deterministicGateway`: Idempotency, schema validation
- `evolutionPipeline`: Rule optimization, variant testing
- `shardRetriever`: Domain shard retrieval
- `shardEmbeddings`: TF-IDF semantic search
- `abBenchmarking`: Statistical significance testing
- `adversarialDefense`: Threat detection patterns
- `proofEnvelope`: Hash-chained audit trails
- `complianceReporter`: Violation tracking, scoring
- `constitutionalEnforcer`: 7 invariant enforcement

### 2. ContinueGate (`continue-gate-integration.ts`)

Detects agent loops and excessive rework to prevent runaway agents.

```typescript
import { continueGateIntegration, createActionRecord } from './governance';

// Record an action
continueGateIntegration.recordAction(createActionRecord(
  'agent-001',
  'file:edit',
  'src/module.ts',
  { lineCount: 50 },
  true // success
));

// Evaluate if agent should continue
const decision = await continueGateIntegration.evaluate('agent-001');
if (!decision.shouldContinue) {
  console.log(`Agent throttled: ${decision.reason}`);
  // Wait for throttleMs before retrying
}
```

**Detection Criteria:**
- Repeated identical actions (loop detection)
- High failure rate (rework ratio > 0.5)
- Excessive retries on same target

### 3. MemoryWriteGate (`memory-write-gate-integration.ts`)

Prevents contradictory patterns from being stored in ReasoningBank.

```typescript
import { memoryWriteGateIntegration, createMemoryPattern } from './governance';

const pattern = createMemoryPattern(
  'auth-rule-v2',
  { rule: 'Always use JWT tokens' },
  'security-compliance',
  { agentId: 'qe-security-scanner', tags: ['auth', 'jwt'] }
);

const decision = await memoryWriteGateIntegration.evaluateWrite(pattern);
if (!decision.allowed) {
  console.log(`Write blocked: ${decision.reason}`);
  console.log(`Conflicts with: ${decision.conflictingPatterns}`);
  console.log(`Suggested: ${decision.suggestedResolution}`);
}
```

**Features:**
- Semantic contradiction detection
- Domain namespacing
- Temporal decay for stale patterns
- Supersede chain tracking

### 4. TrustAccumulator (`trust-accumulator-integration.ts`)

Manages agent trust tiers based on task outcomes.

```typescript
import { trustAccumulatorIntegration, createTaskOutcome } from './governance';

// Record task outcome
const outcome = createTaskOutcome(
  'agent-001',
  'task-123',
  true, // success
  { tokensUsed: 1500, executionTimeMs: 2500 }
);
trustAccumulatorIntegration.recordOutcome(outcome);

// Get agent tier
const tier = trustAccumulatorIntegration.getTier('agent-001');
// Returns: 'untrusted' | 'basic' | 'standard' | 'elevated' | 'trusted'

// Select best agent for task
const selection = trustAccumulatorIntegration.selectAgent(
  ['agent-001', 'agent-002'],
  'test-generation'
);
```

**Trust Tiers:**
| Tier | Success Rate | Privileges |
|------|-------------|------------|
| `untrusted` | <50% | Limited actions, heavy monitoring |
| `basic` | 50-70% | Standard actions, moderate monitoring |
| `standard` | 70-85% | Extended actions, light monitoring |
| `elevated` | 85-95% | Full actions, minimal monitoring |
| `trusted` | >95% | All actions, audit only |

### 5. DeterministicGateway (`deterministic-gateway-integration.ts`)

Ensures tool call idempotency and schema validation.

```typescript
import { deterministicGatewayIntegration } from './governance';

const result = await deterministicGatewayIntegration.executeWithIdempotency(
  'file:write',
  { path: '/src/config.ts', content: '...' },
  async (params) => {
    // Actual execution
    return await writeFile(params.path, params.content);
  }
);

if (result.cached) {
  console.log('Returned cached result from idempotency key');
}
```

**Features:**
- Content-addressable caching
- Schema validation with Zod
- Budget metering integration
- Operation logging

### 6. EvolutionPipeline (`evolution-pipeline-integration.ts`)

Tracks rule effectiveness and optimizes governance rules.

```typescript
import { evolutionPipelineIntegration, withRuleTracking } from './governance';

// Execute with rule tracking
const result = await withRuleTracking(
  'test-generation',
  ['rule-001', 'rule-002'],
  async () => {
    // Task execution
    return await generateTests(sourceCode);
  }
);

// Get optimization suggestions
const optimizations = evolutionPipelineIntegration.getOptimizations();
for (const opt of optimizations) {
  console.log(`Rule ${opt.ruleId}: ${opt.suggestion}`);
}
```

**Metrics Tracked:**
- Success rate per rule
- Domain effectiveness
- Task type effectiveness
- Time-windowed statistics

### 7. ShardRetriever (`shard-retriever-integration.ts`)

Retrieves domain-specific governance shards.

```typescript
import { shardRetrieverIntegration } from './governance';

// Initialize with shards directory
await shardRetrieverIntegration.initialize('/path/to/.claude/guidance/shards');

// Get rules for context
const rules = await shardRetrieverIntegration.getRulesForContext({
  domain: 'test-generation',
  agentId: 'qe-test-architect',
  taskType: 'unit-test-creation'
});

console.log(rules.constraints); // Agent-specific constraints
console.log(rules.qualityThresholds); // Domain thresholds
console.log(rules.patterns); // Best practice patterns
```

**12 Domain Shards:**
- test-generation, test-execution, coverage-analysis
- quality-assessment, defect-intelligence, requirements-validation
- code-intelligence, security-compliance, contract-testing
- visual-accessibility, chaos-resilience, learning-optimization

### 8. ShardEmbeddings (`shard-embeddings.ts`)

TF-IDF semantic search for relevant governance content.

```typescript
import { shardEmbeddingsManager } from './governance';

// Initialize and build index
await shardEmbeddingsManager.initialize();

// Search for relevant shards
const results = await shardEmbeddingsManager.searchRelevant(
  'security vulnerability OWASP injection',
  { topK: 5, minSimilarity: 0.3 }
);

for (const result of results) {
  console.log(`${result.domain}/${result.section}: ${result.similarity}`);
}
```

### 9. A/B Benchmarking (`ab-benchmarking.ts`)

Statistical testing for governance rule variants.

```typescript
import { abBenchmarkingFramework, createBenchmarkConfig } from './governance';

// Create benchmark
const config = createBenchmarkConfig(
  'new-loop-threshold',
  [
    { id: 'control', params: { threshold: 0.5 } },
    { id: 'variant', params: { threshold: 0.6 } }
  ],
  [{ name: 'success_rate', type: 'rate', higherIsBetter: true }]
);

const benchmark = abBenchmarkingFramework.createBenchmark(config);

// Record observations
benchmark.recordObservation('control', 'success_rate', 1);
benchmark.recordObservation('variant', 'success_rate', 1);

// Analyze results
const results = abBenchmarkingFramework.analyzeBenchmark(benchmark.id);
console.log(`Winner: ${results.winner?.variantId}`);
console.log(`Significance: ${results.comparison.isSignificant}`);
```

**Statistical Methods:**
- Chi-square test for rate metrics
- Welch's t-test for continuous metrics
- Cohen's d effect size
- Configurable significance level (default: 0.05)

### 10. AdversarialDefense (`adversarial-defense-integration.ts`)

Detects and mitigates prompt injection and malicious inputs.

```typescript
import { adversarialDefenseIntegration, quickThreatAssess, sanitizeUserInput } from './governance';

// Quick threat assessment
const assessment = quickThreatAssess(userInput, {
  agentId: 'qe-test-architect',
  domain: 'test-generation'
});

if (assessment.riskLevel === 'critical') {
  throw new Error(`Blocked: ${assessment.detectedPatterns[0].description}`);
}

// Sanitize input
const safeInput = sanitizeUserInput(userInput);
```

**Threat Categories:**
- `prompt_injection`: Instruction override attempts
- `jailbreak`: Safety bypass attempts
- `data_exfiltration`: Unauthorized data access
- `resource_abuse`: DoS/resource exhaustion
- `privilege_escalation`: Unauthorized privilege gain
- `social_engineering`: Manipulation attempts

### 11. ProofEnvelope (`proof-envelope-integration.ts`)

Hash-chained audit trails for governance decisions.

```typescript
import { proofEnvelopeIntegration, createProofEnvelopeIntegration } from './governance';

// Create proof for action
const proof = await proofEnvelopeIntegration.createProof(
  'agent-001',
  'task-execution',
  { taskId: 'task-123', result: 'success' }
);

// Verify proof
const verification = await proofEnvelopeIntegration.verifyProof(proof.id);
console.log(`Valid: ${verification.valid}`);

// Verify chain integrity
const chainVerification = await proofEnvelopeIntegration.verifyChain('agent-001');
console.log(`Chain valid: ${chainVerification.valid}`);
```

**Features:**
- SHA-256 hash chaining
- Merkle tree construction
- Tamper detection
- WASM-accelerated crypto

### 12. ComplianceReporter (`compliance-reporter.ts`)

Tracks violations and generates compliance reports.

```typescript
import { complianceReporter, createComplianceReporter } from './governance';

// Record violation
complianceReporter.recordViolation({
  type: 'budget_exceeded',
  severity: 'high',
  agentId: 'agent-001',
  details: { currentCost: 15.50, limit: 10.00 }
});

// Get compliance score
const score = complianceReporter.getComplianceScore('agent-001');
console.log(`Score: ${score.score}/100 (${score.grade})`);

// Generate report
const report = complianceReporter.generateReport({
  format: 'detailed',
  timeWindow: { start: Date.now() - 86400000, end: Date.now() }
});
```

**Violation Types:**
- `budget_exceeded`, `loop_detected`, `contradiction_detected`
- `trust_violation`, `schema_violation`, `unauthorized_domain`
- `security_threat`, `invariant_violation`

**Severity Levels:** `info`, `low`, `medium`, `high`, `critical`

### 13. ConstitutionalEnforcer (`constitutional-enforcer.ts`)

Enforces the 7 invariants from constitution.md.

```typescript
import { constitutionalEnforcer, createConstitutionalEnforcer } from './governance';

// Check test execution integrity
const result = await constitutionalEnforcer.checkTestExecutionIntegrity(
  'test-123',
  { passed: 45, failed: 2, skipped: 3 }
);

// Check all invariants
const allResults = await constitutionalEnforcer.checkAllInvariants(context);
const violations = allResults.filter(r => !r.passed);
```

**7 Invariants:**
1. **Test Execution Integrity**: Real tests with verified results
2. **Security Scan Required**: Security scans before deployment
3. **Backup Before Delete**: Backups before destructive operations
4. **Loop Detection**: Prevent runaway agent loops
5. **Budget Enforcement**: Cost limits respected
6. **Memory Consistency**: No contradictory patterns
7. **Verification Before Claim**: Verify before claiming success

### 14. WASMKernel (`wasm-kernel-integration.ts`)

WASM-accelerated crypto with JS fallback.

```typescript
import { wasmKernelIntegration } from './governance';

// Initialize WASM
await wasmKernelIntegration.initialize();

// SHA-256 hash
const hash = await wasmKernelIntegration.sha256(data);

// HMAC
const hmac = await wasmKernelIntegration.hmac(key, data);

// Get metrics
const metrics = wasmKernelIntegration.getMetrics();
console.log(`WASM available: ${metrics.wasmAvailable}`);
console.log(`Operations: ${metrics.operationCount}`);
```

### 15. QueenGovernanceAdapter (`queen-governance-adapter.ts`)

Unified interface for QueenCoordinator integration.

```typescript
import { queenGovernanceAdapter } from './governance';

// Initialize
await queenGovernanceAdapter.initialize();

// Before task execution
const decision = await queenGovernanceAdapter.beforeTaskExecution({
  taskId: 'task-123',
  taskType: 'test-generation',
  agentId: 'qe-test-architect',
  domain: 'test-generation',
  priority: 'high'
});

if (!decision.allowed) {
  console.log(`Task blocked: ${decision.reason}`);
  return;
}

// Execute task...

// After task execution
await queenGovernanceAdapter.afterTaskExecution(context, true, 0.05, 1500);

// Memory write governance
const writeDecision = await queenGovernanceAdapter.beforeMemoryWrite({
  key: 'pattern-v1',
  value: { rule: '...' },
  domain: 'test-generation'
});
```

## Integration Points

### With QueenCoordinator

```typescript
class QueenCoordinator {
  private governance = queenGovernanceAdapter;

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

    // Execute task
    const result = await this.runTask(task);

    // Post-execution tracking
    await this.governance.afterTaskExecution(
      { ...task },
      result.success,
      result.cost,
      result.tokens
    );

    return result;
  }
}
```

### With ReasoningBank

```typescript
class ReasoningBank {
  async storePattern(pattern: Pattern): Promise<void> {
    // Check for contradictions
    const decision = await queenGovernanceAdapter.beforeMemoryWrite({
      key: pattern.key,
      value: pattern.value,
      domain: pattern.domain,
      agentId: pattern.sourceAgent
    });

    if (!decision.allowed) {
      throw new ContradictionError(decision.reason, decision.conflictingPatterns);
    }

    // Store pattern
    await this.storage.set(pattern.key, pattern);

    // Register with governance
    queenGovernanceAdapter.registerPattern({
      key: pattern.key,
      value: pattern.value,
      domain: pattern.domain
    });
  }
}
```

## Environment Variables

```bash
# Enable/disable governance features
GOVERNANCE_CONTINUE_GATE_ENABLED=true
GOVERNANCE_MEMORY_WRITE_GATE_ENABLED=true
GOVERNANCE_TRUST_ACCUMULATOR_ENABLED=true
GOVERNANCE_DETERMINISTIC_GATEWAY_ENABLED=true
GOVERNANCE_EVOLUTION_PIPELINE_ENABLED=true
GOVERNANCE_SHARD_RETRIEVER_ENABLED=true
GOVERNANCE_SHARD_EMBEDDINGS_ENABLED=true
GOVERNANCE_AB_BENCHMARKING_ENABLED=true
GOVERNANCE_ADVERSARIAL_DEFENSE_ENABLED=true
GOVERNANCE_PROOF_ENVELOPE_ENABLED=true
GOVERNANCE_COMPLIANCE_REPORTER_ENABLED=true
GOVERNANCE_CONSTITUTIONAL_ENFORCER_ENABLED=true

# Strict mode (blocking enforcement)
GOVERNANCE_STRICT_MODE=false

# Budget limits
GOVERNANCE_MAX_SESSION_COST_USD=10.00
GOVERNANCE_MAX_TOKENS_PER_SESSION=1000000
```

## Testing

```bash
# Run all governance tests
cd v3 && npm test -- --run src/governance/__tests__/

# Run specific test file
npm test -- --run src/governance/__tests__/constitutional-enforcer.test.ts

# Run with coverage
npm test -- --run --coverage src/governance/
```

**Test Coverage:**
- 650 tests across 12 test files
- All governance components have comprehensive unit tests
- Integration tests verify component interactions

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
    ├── governance-integration.test.ts
    ├── deterministic-gateway.test.ts
    ├── trust-accumulator.test.ts
    ├── wasm-compatibility.test.ts
    ├── evolution-pipeline.test.ts
    ├── shard-retriever.test.ts
    ├── shard-embeddings.test.ts
    ├── ab-benchmarking.test.ts
    ├── adversarial-defense.test.ts
    ├── proof-envelope.test.ts
    ├── compliance-reporter.test.ts
    └── constitutional-enforcer.test.ts
```

## Related Documentation

- [ADR-058: Guidance Governance Integration](../../docs/adr/ADR-058-guidance-governance-integration.md)
- [Constitution](../../../.claude/guidance/constitution.md)
- [Domain Shards](../../../.claude/guidance/shards/)
- [Integration Plan](../../../docs/plans/guidance-integration-consolidated.md)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.5.0 | 2026-02-03 | Initial @claude-flow/guidance integration |
