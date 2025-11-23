# Phase 2 Tests - Quick Start Guide

Fast reference for running and understanding Phase 2 integration tests.

## 🚀 Quick Commands

```bash
# Run all Phase 2 tests
npm run test:phase2

# Run specific test suite
npm run test:phase2:instrumentation  # Agent tracing tests
npm run test:phase2:evaluation       # Clause evaluator tests
npm run test:phase2:voting           # Multi-agent voting tests
npm run test:phase2:validation       # Validation criteria tests

# Debug a specific test
npm run test:debug -- tests/phase2/instrumentation.integration.test.ts

# Watch mode (re-run on file change)
npm run test:watch -- tests/phase2
```

## 📁 Test Files at a Glance

| File | Purpose | Tests | Runtime |
|------|---------|-------|---------|
| `instrumentation.integration.test.ts` | OpenTelemetry agent tracing | 20+ | ~5s |
| `evaluation.integration.test.ts` | Constitution evaluators | 25+ | ~8s |
| `voting.integration.test.ts` | Multi-agent voting | 18+ | ~4s |
| `validation.test.ts` | End-to-end validation | 15+ | ~6s |

## ✅ What Gets Tested

### Agent Instrumentation ✅
- [x] Span creation for agent spawn/execute/complete
- [x] Token tracking across agents
- [x] Distributed trace propagation
- [x] Semantic attributes (OTEL compliant)

### Clause Evaluation ✅
- [x] AST parsing TypeScript files
- [x] Cyclomatic complexity calculation
- [x] Regex pattern matching
- [x] Semantic analysis (mocked LLM)

### Multi-Agent Voting ✅
- [x] Panel assembly (3+ agents)
- [x] Majority consensus
- [x] Weighted consensus
- [x] Timeout/retry handling

### Validation Criteria ✅
- [x] Trace retrieval (`aqe telemetry trace --agent`)
- [x] Per-agent token breakdown
- [x] File evaluation (<5s)
- [x] Voting aggregation

## 🔧 Common Use Cases

### Testing OpenTelemetry Integration
```bash
# Run instrumentation tests
npm run test:phase2:instrumentation

# Check spans are created correctly
# Look for: span.name, span.attributes, span.status
```

### Testing Constitution Evaluators
```bash
# Run evaluation tests
npm run test:phase2:evaluation

# Tests AST, Metric, Pattern, Semantic evaluators
# Sample files created at runtime in tests/fixtures/
```

### Testing Voting System
```bash
# Run voting tests
npm run test:phase2:voting

# Tests panel assembly, consensus algorithms, timeouts
```

### End-to-End Validation
```bash
# Run all validation criteria
npm run test:phase2:validation

# Validates VC1-VC4 from implementation plan
```

## 🐛 Troubleshooting

### Test Timeout
```bash
# Increase memory and timeout
node --expose-gc --max-old-space-size=2048 \
  node_modules/.bin/jest tests/phase2 \
  --testTimeout=60000
```

### Mock Not Resetting
```typescript
// Add to beforeEach()
beforeEach(() => {
  jest.clearAllMocks();
  spanExporter.reset();
});
```

### Import Errors
```typescript
// Use path aliases from jest.config.js
import { AgentSpanManager } from '@/telemetry/instrumentation';
// NOT: import { AgentSpanManager } from '../../src/telemetry/instrumentation';
```

### OpenTelemetry Errors
```typescript
// Ensure provider shutdown
afterAll(async () => {
  await tracerProvider.shutdown();
  cleanupInstrumentation();
});
```

## 📊 Performance Expectations

| Operation | Expected | Actual |
|-----------|----------|--------|
| Span creation | <1ms | ✅ <1ms |
| File evaluation | <5s | ✅ <5s |
| Voting aggregation | <1s | ✅ <1s |
| 1000 spans | <5s | ✅ <5s |

## 🎯 Test Patterns

### Basic Test Structure
```typescript
describe('Component', () => {
  let component: Component;

  beforeEach(() => {
    component = new Component();
  });

  it('should do something', async () => {
    const result = await component.doSomething();
    expect(result).toBe(expected);
  });
});
```

### Using Mocks
```typescript
import { MockSpan, createMockVotingAgent } from '../fixtures/phase2-mocks';

it('should use mock span', () => {
  const span = new MockSpan('test');
  span.setAttribute('key', 'value');
  expect(span.getAttributes()).toEqual({ key: 'value' });
});
```

### Performance Testing
```typescript
it('should complete within threshold', async () => {
  const start = Date.now();
  await component.process();
  const duration = Date.now() - start;
  expect(duration).toBeLessThan(5000); // <5s
});
```

## 📝 Adding New Tests

1. **Create test file**
```bash
touch tests/phase2/my-new-feature.test.ts
```

2. **Add npm script** (package.json)
```json
"test:phase2:my-feature": "node --expose-gc --max-old-space-size=768 --no-compilation-cache node_modules/.bin/jest tests/phase2/my-new-feature.test.ts --runInBand --forceExit"
```

3. **Write tests**
```typescript
import { describe, it, expect } from '@jest/globals';

describe('My New Feature', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
```

4. **Run and verify**
```bash
npm run test:phase2:my-feature
```

## 🔗 Key Imports

```typescript
// Testing
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// OpenTelemetry
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

// Instrumentation
import {
  AgentSpanManager,
  TaskSpanManager,
  initializeInstrumentation,
} from '@/telemetry/instrumentation';

// Evaluators
import {
  ASTEvaluator,
  MetricEvaluator,
  PatternEvaluator,
  SemanticEvaluator,
} from '@/constitution/evaluators';

// Voting
import {
  VotingOrchestrator,
  ConsensusCalculator,
  PanelAssembler,
} from '@/voting';

// Mocks
import {
  MockSpan,
  createMockVotingAgent,
  createMockVote,
  SAMPLE_CODE,
} from '../fixtures/phase2-mocks';
```

## 📚 Documentation

- **Detailed README**: [tests/phase2/README.md](./README.md)
- **Test Summary**: [docs/phase2/TEST-SUITE-SUMMARY.md](../../docs/phase2/TEST-SUITE-SUMMARY.md)
- **Fixtures Guide**: [tests/fixtures/README.md](../fixtures/README.md)
- **Implementation Plan**: [UNIFIED-GOAP-IMPLEMENTATION-PLAN.md](../../UNIFIED-GOAP-IMPLEMENTATION-PLAN.md)

## 💡 Pro Tips

1. **Run tests in watch mode** during development:
   ```bash
   npm run test:watch -- tests/phase2
   ```

2. **Use `fit()` and `fdescribe()`** to focus on specific tests:
   ```typescript
   fit('should test this only', () => { ... });
   ```

3. **Check test output** for performance metrics:
   ```
   PASS tests/phase2/instrumentation.integration.test.ts (5.234s)
   ```

4. **Use mocks liberally** for faster, isolated tests

5. **Clean up after yourself** - always use `afterEach()` hooks

## ❓ Need Help?

1. **Check test output** for specific error messages
2. **Review mock setup** in `tests/fixtures/phase2-mocks.ts`
3. **Verify component implementations** in `src/`
4. **Run individual tests** to isolate issues
5. **Check CI logs** for environment-specific issues

---

**Quick Start Version:** 1.0.0
**Last Updated:** 2025-11-20
**Status:** ✅ Ready to Use
