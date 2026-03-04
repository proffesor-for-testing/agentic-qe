# Loki-Mode Quality Gates

> Added in v3.7.7 — 7 adversarial quality features to catch sycophantic outputs, hollow tests, and routing drift.

All features are **enabled by default** (opt-out). Disable them individually via config flags if needed.

---

## 1. Anti-Sycophancy Scorer

**Problem**: Multiple AI models rubber-stamp each other's findings, creating false consensus.

**How it works**: After consensus votes are collected, a `SycophancyScorer` evaluates 4 weighted signals:
- **Verdict unanimity** (30%): All votes identical?
- **Reasoning similarity** (30%): Jaccard similarity on tokenized justifications
- **Confidence uniformity** (20%): Standard deviation of confidence scores
- **Issue count consistency** (20%): Variation in reported issue counts

**Levels**: `independent` | `mild` | `moderate` | `severe`

When `severe` sycophancy is detected, the engine can trigger a Devil's Advocate review.

**Enable**:
```typescript
import { createConsensusEngine } from 'agentic-qe';

const engine = createConsensusEngine({
  enableSycophancyCheck: true,
});

// Optional: react to severe sycophancy
engine.onSevereSycophancy((finding, votes) => {
  console.log('Rubber-stamping detected — triggering Devil\'s Advocate');
});
```

---

## 2. Test Quality Gates

**Problem**: AI-generated tests pass CI but test nothing — tautological assertions, empty bodies, no source imports.

**Detectors**:
| Detector | What it catches | Example |
|----------|----------------|---------|
| No source import | Test doesn't import the file it claims to test | `it('tests UserService', () => { ... })` with no UserService import |
| Tautological assertion | Assertion that can never fail | `expect(true).toBe(true)`, `expect(x).toBe(x)` |
| Empty test body | Test with no assertions | `it('should work', () => {})` |
| Mirrored assertion | Values copied from source literals | `expect(getVersion()).toBe('1.0.0')` where `'1.0.0'` is hardcoded |

**Enable**:
```typescript
const testConfig = {
  enableTestQualityGate: true,  // Runs after every test generation
};
```

**Result**: Each generated test gets a `qualityGateResult` with `passed: boolean`, `score: 0-100`, and an array of issues.

---

## 3. Blind Review for Test Generation

**Problem**: A single test generator may have blind spots. Running multiple independent generators catches more edge cases.

**How it works**:
1. Runs your test generator N times in parallel with different temperatures
2. Collects all generated tests
3. Deduplicates using Jaccard similarity on tokenized assertions
4. Returns the merged set with uniqueness statistics

**Use**:
```typescript
import { BlindReviewOrchestrator } from 'agentic-qe';

const orchestrator = new BlindReviewOrchestrator(testGenerator, {
  reviewerCount: 3,
  varyTemperatures: true,
  temperatures: [0.3, 0.7, 1.0],
  deduplicationThreshold: 0.85,
});

const result = await orchestrator.generateWithBlindReview(request);
// result.mergedTests — deduplicated union of all generators' output
// result.uniquenessScore — how different the generators' outputs were
```

---

## 4. EMA Calibration

**Problem**: Agent accuracy changes over time, but routing weights stay static.

**How it works**: An Exponential Moving Average (EMA) tracks each agent's success rate. The derived weight adjusts routing decisions:

```
weight = clamp(ema / baseline, floor=0.2, ceiling=2.0)
```

- Agents with consistent success get higher weights
- Agents with recent failures get downweighted
- State persists to SQLite across sessions

**Enable**:
```typescript
import { createRoutingFeedbackCollector } from 'agentic-qe';

const feedback = createRoutingFeedbackCollector(10000, {
  enableEMACalibration: true,
});
```

---

## 5. Edge-Case Injection

**Problem**: Test generators don't learn from past bugs. The same edge cases get missed repeatedly.

**How it works**:
1. Before test generation, queries the pattern store for historical edge-case patterns matching the domain
2. Ranks patterns by `successRate * applicationCount`
3. Formats top-N patterns as prompt context
4. Prepends to the LLM prompt: `"## Edge cases that caught real bugs in similar code: ..."`

**Enable**:
```typescript
const testConfig = {
  enableEdgeCaseInjection: true,  // Injects patterns before LLM call
};
```

**Requirements**: Needs a populated pattern store. Patterns accumulate automatically via experience capture after test runs.

---

## 6. Complexity-Driven Team Composition

**Problem**: The same agent team runs regardless of whether the code is a simple utility or a security-critical auth module.

**How it works**: Analyzes code across 8 dimensions:
- **From AST** (4): Cyclomatic complexity, cognitive complexity, lines of code, maintainability index
- **From regex** (4): Security patterns (auth/crypto/token), concurrency patterns (async/Promise), data-flow complexity, API surface area

Maps the result to a team composition:
- High security score → adds security auditor agent
- High concurrency score → adds chaos engineering agent
- High API surface → adds integration testing agent

**Enable**:
```typescript
// In TierConfig
const tierConfig = {
  enableComplexityComposition: true,
};
```

---

## 7. Auto-Escalation

**Problem**: When an agent tier keeps failing, manual intervention is needed to escalate. When it keeps succeeding, you're overpaying.

**How it works**:
- Tracks consecutive failures/successes per agent
- 3 consecutive failures → escalate (e.g., haiku → sonnet)
- 5 consecutive successes → de-escalate (e.g., sonnet → haiku)
- Uses the existing fallback chain: `booster → haiku → sonnet → opus`

**Enable**:
```typescript
import { createRoutingFeedbackCollector } from 'agentic-qe';

const feedback = createRoutingFeedbackCollector(10000, {
  enableAutoEscalation: true,
});
```

---

## Configuration Reference

All flags in one place (all `true` by default — set to `false` to disable):

```typescript
// RoutingConfig
{
  enableEMACalibration: true,       // Item 4: EMA voting weights
  enableAutoEscalation: true,       // Item 7: Automatic tier promotion/demotion
}

// ConsensusEngineConfig
{
  enableSycophancyCheck: true,      // Item 1: Rubber-stamp detection
}

// TestGeneratorConfig
{
  enableTestQualityGate: true,      // Item 2: Tautology/empty test detection
  enableEdgeCaseInjection: true,    // Item 5: Historical pattern injection
}

// TierConfig
{
  enableComplexityComposition: true, // Item 6: 8-dim agent team composition
}
```

---

## Architecture

These features follow AQE's design principles:
- **Extend, don't duplicate**: All features wire into existing services (ConsensusEngine, RoutingFeedback, TestGenerator, TierSelector)
- **Enabled by default**: All features active out of the box; disable individually via config flags
- **Minimal new code**: 7 new modules (~2,900 lines total), 7 modified integration points
- **Full test coverage**: 178 dedicated tests across 7 test files
