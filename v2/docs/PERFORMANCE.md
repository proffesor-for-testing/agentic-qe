# Performance Benchmarks

> **Last Updated**: December 2025 (v2.2.0)
> **Environment**: Node.js 20+, TypeScript 5.0+, SQLite/AgentDB

## Core Performance Metrics

| Metric | Target | Measured | Notes |
|--------|--------|----------|-------|
| Pattern Matching (p95) | <50ms | ~32ms | Via AgentDB vector search |
| Learning Iteration | <100ms | ~68ms | Q-value updates |
| ML Flaky Detection (1000 tests) | <500ms | ~385ms | Statistical + ML hybrid |
| Agent Memory | <100MB | ~85MB | Per agent instance |
| Agent Spawning | <100ms | ~80ms | Via Task tool |

## Feature-Specific Performance

### Test Generation
- **Throughput**: 1000+ tests/minute (depends on complexity)
- **Pattern Reuse**: 85%+ matching accuracy across 6 frameworks
- **Optimization**: Sublinear O(log n) test selection algorithms

### Coverage Analysis
- **Complexity**: O(log n) gap detection
- **Real-time**: Incremental analysis during test runs

### Flaky Test Detection
- **Accuracy**: 90%+ with ML-enhanced detection
- **False Positives**: <5% threshold
- **Detection Types**: Timing, race conditions, resource contention

### Data Generation
- **Throughput**: 10,000+ records/second
- **Compliance**: GDPR-aware with PII masking

## Cost Optimization

### Multi-Model Router (Opt-in)
- **Potential Savings**: Up to 70-81% vs single-model baseline
- **How**: Routes simple tasks to cheaper models (GPT-3.5, Claude Haiku)
- **Configuration**: Enable via `aqe routing enable`

> **Note**: Actual savings depend on your task distribution and model pricing.

## Visualization Performance

| Component | Target | Measured |
|-----------|--------|----------|
| Event Write Throughput | 100/sec | 185/sec |
| Query Latency | <100ms | <1ms |
| Render (100 nodes) | <100ms | ~50ms |
| Render (1000 nodes) | <500ms | ~350ms |

## How We Measure

- **Pattern Matching**: Time from query to AgentDB response
- **Learning**: Time per Q-value update cycle
- **Flaky Detection**: End-to-end analysis of test history
- **Agent Memory**: Heap snapshot during typical operations

## Reproducing Benchmarks

```bash
# Run performance tests
npm run test:performance

# Run benchmarks
npm run test:benchmark
```

## Known Limitations

1. **First-run penalty**: Initial learning has no cached patterns
2. **Large codebases**: Memory scales with project size
3. **Network-bound**: LLM calls depend on provider latency
4. **Cold starts**: First agent spawn takes longer than subsequent

---

*Benchmarks measured on development environment. Your results may vary based on hardware, project size, and configuration.*
