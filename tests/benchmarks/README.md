# Agentic QE v3 Performance Benchmarks

This directory contains performance benchmark suites for validating system performance metrics.

## Benchmark Suites

### ADR-051 Agentic-Flow Integration Benchmarks

**File:** `agentic-flow-performance.bench.ts`

Validates the success metrics defined in ADR-051 for the Agentic-Flow integration:

| Component | Target Metric | Benchmark Coverage |
|-----------|--------------|-------------------|
| **Agent Booster** | <5ms mechanical edit | ✅ 10 transform types |
| **Model Router** | <10ms routing decision | ✅ 5 complexity levels |
| **ONNX Embeddings** | <50ms embedding generation | ✅ 9 scenarios |
| **ReasoningBank** | <20ms pattern retrieval | ✅ 6 operations |
| **Cross-Session Hit Rate** | 50% pattern hits | ✅ Validated |
| **Pattern Retention** | 100% retention | ✅ Validated |

**Total Scenarios:** 41 benchmarks

**Run Benchmarks:**
```bash
# Run all agentic-flow benchmarks
npx vitest bench tests/benchmarks/agentic-flow-performance.bench.ts --run

# Run with detailed output
npx vitest bench tests/benchmarks/agentic-flow-performance.bench.ts --reporter=verbose --run

# Run specific benchmark group
npx vitest bench tests/benchmarks/agentic-flow-performance.bench.ts -t "Agent Booster"
```

## Benchmark Results

Latest benchmark results are documented in:

📊 **Performance Report:** `/workspaces/agentic-qe/docs/reports/adr-051-performance-validation.md`

### Key Results (Latest Run)

✅ **All ADR-051 targets exceeded:**

- Agent Booster: **0.2-19μs** (1,000-10,000x faster than 5ms target)
- Model Router: **0.14-0.33μs** (30,000-71,000x faster than 10ms target)
- ONNX Embeddings: **86-110μs** (450-580x faster than 50ms target)
- ReasoningBank: **0.08-8.9μs** (2,000-250,000x faster than 20ms target)
- Cross-Session Hit Rate: **~50%** (target met)
- Pattern Retention: **100%** (target met)

## Code Intelligence Token Reduction Benchmarks

**File:** `code-intelligence-token-reduction.bench.ts`

Validates O(log n) sublinear coverage analysis performance with knowledge graph-based code understanding.

**Target Metric:** 80% token reduction vs full file transmission

**Run Benchmarks:**
```bash
npm run benchmark:token-reduction
```

## Writing New Benchmarks

Use Vitest's `bench()` API for performance testing:

```typescript
import { bench, describe } from 'vitest';

describe('My Performance Test', () => {
  bench('operation name', () => {
    // Code to benchmark
    myFunction();
  });

  bench('operation with setup', async () => {
    // Setup is included in measurement
    const data = prepareData();
    await processData(data);
  });
});
```

### Best Practices

1. **Use descriptive names:** Clearly indicate what is being benchmarked
2. **Include units:** Specify data sizes (e.g., "10 lines", "1000 vectors")
3. **Target metrics:** Document expected performance in comments
4. **Avoid I/O:** Keep benchmarks CPU-bound for reproducibility
5. **Warm-up:** Vitest automatically runs warmup iterations
6. **Sample size:** Vitest automatically determines optimal sample count

### Benchmark Configuration

Benchmarks are configured in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    benchmark: {
      include: ['**/*.bench.ts'],
    },
  },
});
```

## Continuous Integration

Benchmarks should be run:

1. **Before release:** Validate performance targets are met
2. **After optimization:** Verify improvements
3. **Regression detection:** Compare against baseline

### Performance Baselines

Store baseline results in `/docs/reports/` for comparison:

```bash
# Generate baseline
npx vitest bench --reporter=json > baseline.json

# Compare against baseline
npx vitest bench --reporter=json > current.json
# (Use tools like hyperfine or custom scripts for comparison)
```

## Performance Targets

### ADR-051 Success Metrics

| Metric | Target | Status |
|--------|--------|--------|
| Agent Booster latency | <5ms | ✅ EXCEEDED (0.2-19μs) |
| Model Router decision | <10ms | ✅ EXCEEDED (0.14μs) |
| ONNX embedding generation | <50ms | ✅ EXCEEDED (86-110μs) |
| ReasoningBank retrieval | <20ms | ✅ EXCEEDED (8.9μs) |
| Cross-session hit rate | 50% | ✅ MET (~50%) |
| Pattern retention rate | 100% | ✅ MET (100%) |

### ADR-042 Token Reduction

| Metric | Target | Status |
|--------|--------|--------|
| Token reduction | 80% | ✅ VALIDATED |
| Semantic accuracy | >95% | ✅ VALIDATED |

## Troubleshooting

### Benchmarks Running Slow

- Check system load: `top` or `htop`
- Close other applications
- Disable browser/IDE heavy processes
- Use dedicated benchmark environment

### Inconsistent Results

- Run multiple times and average
- Check for background processes
- Ensure stable CPU frequency (disable turbo boost)
- Use `--no-parallel` flag

### Memory Issues

- Reduce sample size in benchmarks
- Split large benchmarks into smaller groups
- Use `--max-old-space-size=4096` Node flag

## Related Documentation

- [ADR-051: Agentic-Flow Integration](../../docs/architecture/adr-051-agentic-flow-integration.md)
- [ADR-042: Token Usage Optimization](../../docs/architecture/adr-042-token-usage-optimization.md)
- [Performance Report](../../docs/reports/adr-051-performance-validation.md)
- [Vitest Benchmark API](https://vitest.dev/guide/features.html#benchmarking-experimental)

## Contributing

When adding new benchmarks:

1. Follow naming convention: `[feature]-[aspect].bench.ts`
2. Document target metrics in comments
3. Include baseline comparisons
4. Update this README with new benchmark info
5. Add results to `/docs/reports/`

## Questions?

Contact the QE Performance team or open an issue in the repository.
