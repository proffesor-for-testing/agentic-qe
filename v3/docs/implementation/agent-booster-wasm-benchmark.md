# Agent Booster WASM Benchmark Report

**Date:** 2026-01-21
**Source:** https://github.com/proffesor-for-testing/agentic-flow
**Build:** `wasm-pack build --target nodejs --release`

## Executive Summary

Agent Booster WASM is **ready for integration** with excellent performance and good accuracy. Phase 2 customizations needed for 3 edge cases.

| Metric | Result | Target | Status |
|--------|--------|--------|--------|
| Small code latency | **0.016ms** | <1ms | ✅ Exceeds |
| Large code latency | **0.347ms** | <1ms | ✅ Exceeds |
| Accuracy | **81%** (13/16) | >80% | ✅ Met |
| QE scenarios | **83%** (5/6) | >80% | ✅ Met |

## Phase 1: Performance Results

```
| Scenario                              | Avg (ms) | P95 (ms) | Min (ms) |
|---------------------------------------|----------|----------|----------|
| Small code (1 function, ~50 chars)    |    0.016 |    0.027 |    0.012 |
| Medium code (class, ~500 chars)       |    0.041 |    0.049 |    0.036 |
| Large code (20 functions, ~2KB)       |    0.347 |    0.373 |    0.331 |
| TypeScript (interface + function)     |    0.023 |    0.026 |    0.018 |
```

**Key insight:** Even 2KB of code with 20 functions processes in <0.5ms. This is 1000x faster than a typical LLM call.

## Phase 1: Accuracy Results

### General Transforms (5/6 passed)
| Test | Confidence | Status |
|------|------------|--------|
| Simple function replacement | 91.6% | ✅ |
| Add method to class | 57.5% | ❌ Below threshold |
| var to const transform | 64.7% | ✅ |
| Add TypeScript types | 73.6% | ✅ |
| Add try-catch wrapper | 85.0% | ✅ |
| Add null check | 85.0% | ✅ |

### QE-Specific Scenarios (5/6 passed)
| Test | Confidence | Status |
|------|------------|--------|
| Add test assertion | 77.1% | ✅ |
| Convert to async test | 84.8% | ✅ |
| Add mock setup | 76.7% | ✅ |
| Convert to parameterized test | - | ❌ No match |
| Add setup/teardown | 68.4% | ✅ |
| Add error assertion | 61.0% | ✅ |

### Edge Cases (3/4 passed)
| Test | Confidence | Status |
|------|------------|--------|
| Empty original code | - | ❌ Error |
| Distinguish similar functions | 94.9% | ✅ |
| Unicode and special characters | 77.5% | ✅ |
| Deeply nested code | 97.4% | ✅ |

## Phase 2: Required Improvements

### Priority 1: Parameterized Test Conversion
**Problem:** Converting single tests to `test.each` format fails
**Root cause:** Structural change too different from original
**Solution:** Add template in `templates.rs`:
```rust
static TEST_EACH_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"test\s*\(\s*['\"]([^'\"]+)['\"]").unwrap()
});
```

### Priority 2: Empty File Handling
**Problem:** Empty original code throws error
**Root cause:** No chunks extracted, similarity fails
**Solution:** In `lib.rs`, detect empty and use `Append` strategy directly

### Priority 3: Class Method Addition
**Problem:** Adding methods to classes has low confidence (57.5%)
**Root cause:** `InsertAfter` vs `ExactReplace` confusion
**Solution:** Tune thresholds in `merge.rs`:
```rust
// Current
s if s >= 0.50 => MergeStrategy::FuzzyReplace
// Proposed
s if s >= 0.45 => MergeStrategy::FuzzyReplace
```

## Integration Plan

### Immediate (Phase 1)
1. Copy WASM pkg to `v3/src/integrations/agent-booster-wasm/`
2. Create TypeScript wrapper with error handling
3. Wire into `CodeTransformService`
4. Add fallback to pattern-based transforms for failed cases

### Week 2 (Phase 2)
1. Fork: Add `test.each` template pattern
2. Fork: Fix empty file handling
3. Fork: Tune confidence thresholds
4. Rebuild and replace WASM

## Files

| File | Size | Purpose |
|------|------|---------|
| `agent_booster_wasm_bg.wasm` | 1.2MB | WASM binary |
| `agent_booster_wasm.js` | 28KB | JS glue code |
| `agent_booster_wasm.d.ts` | 3.4KB | TypeScript definitions |

## Recommendation

**Proceed with Phase 1 integration.** The 81% accuracy with sub-millisecond performance provides immediate value. Failed cases (3/16) can fall back to pattern-based transforms until Phase 2 improvements are merged.

### Cost-Benefit Analysis

| Approach | Latency | Accuracy | Cost |
|----------|---------|----------|------|
| WASM (current) | 0.02-0.35ms | 81% | $0 |
| Haiku fallback | ~500ms | 95% | ~$0.0001/call |
| Pattern-based | <0.1ms | 60% | $0 |

**Optimal strategy:** WASM first → Pattern fallback → Haiku escalation
