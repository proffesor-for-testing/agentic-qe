# RuVector Self-Learning Validation Tests

This directory contains comprehensive integration tests for RuVector's GNN self-learning capabilities.

## Test Overview

**File**: `RuVector.SelfLearning.test.ts`

**Purpose**: Validate that RuVector's Graph Neural Network (GNN) with LoRA adapters and EWC++ demonstrates measurable self-learning improvements.

## GOAP Metrics Tested

### 1. Search Quality Improvement
- **Target**: 10%+ improvement over 100 queries
- **Test**: Measures confidence scores before and after learning
- **Validates**: GNN reranking improves with usage

### 2. EWC++ Pattern Retention
- **Target**: 98%+ retention after adding 1000 new patterns
- **Test**: Stores initial patterns, adds many new ones, verifies originals still retrievable
- **Validates**: Elastic Weight Consolidation prevents catastrophic forgetting

### 3. Search Latency
- **Target**: <1ms p95 latency
- **Test**: Executes 1000 searches and measures p50, p95, p99 latencies
- **Validates**: HNSW + GNN maintains O(log n) performance

### 4. LoRA Memory Constraints
- **Target**: <300MB for adapters
- **Test**: Stores 500+ patterns, forces consolidation, checks memory usage
- **Validates**: Low-Rank Adaptation keeps memory footprint small

## Running the Tests

### Prerequisites

**Option 1: With Docker (Recommended for Integration Tests)**
```bash
# Start RuVector Docker service
docker run -d -p 8080:8080 ruvector/server:latest

# Verify service is running
curl http://localhost:8080/health
```

**Option 2: Mock Mode (Unit Testing)**
```bash
# No Docker required - uses in-memory mock client
export RUVECTOR_MOCK=true
```

### Running Tests

```bash
# Run all RuVector tests with real Docker service
npm run test:integration -- RuVector.SelfLearning

# Run with mock client (no Docker)
RUVECTOR_MOCK=true npm run test:integration -- RuVector.SelfLearning

# Skip RuVector tests entirely
SKIP_RUVECTOR_TESTS=true npm run test:integration

# Run with debug logging
DEBUG=true npm run test:integration -- RuVector.SelfLearning
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RUVECTOR_URL` | RuVector service URL | `http://localhost:8080` |
| `RUVECTOR_MOCK` | Use mock client instead of Docker | `false` |
| `SKIP_RUVECTOR_TESTS` | Skip all RuVector tests | `false` |
| `DEBUG` | Enable verbose logging | `false` |

## Test Structure

### 1. Health Check
Verifies RuVector service is healthy and GNN/LoRA are active.

### 2. Search Quality Improvement
- **Phase 1**: Baseline (20 queries) - measure initial quality
- **Phase 2**: Learning (50 queries) - GNN learns patterns
- **Phase 3**: Evaluation (30 queries) - measure improved quality
- **Assertion**: 10%+ improvement in confidence scores

### 3. EWC++ Pattern Retention
- **Phase 1**: Store 100 initial patterns, verify retrieval
- **Phase 2**: Add 1000 new patterns (forgetting trigger)
- **Phase 3**: Verify initial patterns still retrievable at 98%+
- **Assertion**: EWC++ prevents catastrophic forgetting

### 4. Performance Constraints
- Warmup with 100 patterns
- Measure 1000 search operations
- Calculate p50, p95, p99 latencies
- **Assertion**: p95 < 1ms

### 5. LoRA Memory Constraints
- Store 500 patterns to trigger learning
- Force LoRA consolidation
- Check memory usage via metrics API
- **Assertion**: <300MB total memory

### 6. GNN Metrics
- Train GNN with 100 patterns
- Force learning consolidation
- Verify precision, recall, F1 score
- **Assertion**: All metrics >80%

### 7. End-to-End Learning Workflow
- Complete learning cycle across 5 categories
- Force consolidation
- Verify high-confidence retrieval
- **Assertion**: 60%+ retrieval rate with >0.8 confidence

## Mock Client Behavior

When `RUVECTOR_MOCK=true`, tests use an in-memory mock client that:
- Simulates vector similarity search with cosine distance
- Implements basic cache hit/miss logic
- Returns mock metrics (no actual GNN/LoRA)
- Useful for CI/CD when Docker is unavailable

**Note**: Mock mode validates test structure but doesn't prove real GNN learning.

## Expected Output

```
 PASS  tests/integration/RuVector.SelfLearning.test.ts
  RuVector Self-Learning Validation
    Health Check
      ✓ should verify RuVector service is healthy (52ms)
    Search Quality Improvement
      ✓ should improve search quality by 10%+ over 100 queries (15234ms)
        📊 Search Quality Metrics:
          Baseline confidence: 0.823
          Evaluation confidence: 0.947
          Improvement: 15.07%
          Cache hit rate: 68.42%
          Total patterns: 87
      ✓ should demonstrate increasing cache hit rate over time (8521ms)
    EWC++ Pattern Retention
      ✓ should retain 98%+ of patterns after adding new ones (45123ms)
        📊 EWC++ Pattern Retention Metrics:
          Initial patterns: 100
          New patterns added: 1000
          Initial recall rate: 87.00%
          Final recall rate: 98.00%
          Retention: 98.00%
          Total patterns stored: 1087
    Performance Constraints
      ✓ should maintain <1ms p95 search latency (12456ms)
        📊 Search Latency Metrics:
          Searches: 1000
          Average: 0.423ms
          p50: 0.387ms
          p95: 0.876ms
          p99: 1.234ms
      ✓ should keep LoRA adapters under 300MB (18234ms)
        📊 LoRA Memory Metrics:
          Patterns stored: 543
          LoRA updates: 54
          Memory usage: 127.34 MB
          Memory per pattern: 0.235 MB
    GNN Metrics
      ✓ should provide GNN quality metrics (8765ms)
        📊 GNN Quality Metrics:
          Precision: 94.23%
          Recall: 91.87%
          F1 Score: 93.03%
    End-to-End Learning Workflow
      ✓ should demonstrate complete learning cycle (24567ms)
        📊 Learning Cycle Results:
          Patterns stored: 100
          High-confidence retrievals: 5/5
          Retrieval rate: 100.00%
          Final cache hit rate: 72.34%
          Total queries: 234
          LoRA updates: 23

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Time:        145.234 s
```

## Integration with AQE Fleet

These tests validate the foundation for RuVector integration with Agentic QE agents:

1. **Test Generation Agent**: Uses pattern cache to reduce LLM calls by 60%+
2. **Coverage Analysis Agent**: Learns common coverage patterns
3. **Code Review Agent**: Caches review insights for similar code
4. **Flaky Test Detection**: Remembers flaky pattern signatures

## Troubleshooting

### Docker Service Not Starting
```bash
# Check Docker logs
docker logs <container-id>

# Verify port is available
lsof -i :8080

# Try different port
docker run -d -p 9090:8080 ruvector/server:latest
export RUVECTOR_URL=http://localhost:9090
```

### Tests Timing Out
- Increase Jest timeout in test file (already set to 120s-180s)
- Check Docker resource limits (CPU/memory)
- Use mock mode for faster iteration

### Low Improvement Metrics
- GNN learning requires diverse query patterns
- Try increasing number of training queries
- Check that patterns are actually similar (not random)

### Memory Usage Not Reported
- Mock client doesn't track real memory
- Ensure using real Docker client
- Check RuVector server version supports `/v1/metrics`

## Contributing

When adding new RuVector tests:
1. Follow existing patterns (setup/teardown, metrics logging)
2. Support both real and mock modes
3. Use descriptive console logging for metrics
4. Set appropriate timeouts (these are long-running tests)
5. Document expected behavior and GOAP targets

## References

- [RuVector Documentation](https://github.com/ruvnet/ruvector)
- [GOAP M0.5.4 Specification](../../docs/agentics/M0.5.4-GNN-Self-Learning.md)
- [RuVectorClient Implementation](../../src/providers/RuVectorClient.ts)
- [Phase 0.5: LLM Independence Initiative](../../docs/phase-0.5-llm-independence.md)
