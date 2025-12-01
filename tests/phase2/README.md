# Phase 2 Integration Tests

Comprehensive test suite for Phase 2 GOAP implementation components, validating instrumentation, evaluation, and voting systems.

## Overview

Phase 2 tests validate the following components:
- **Agent Instrumentation**: OpenTelemetry tracing for all 18 QE agents
- **Clause Evaluation**: Constitution evaluators (AST, Metric, Pattern, Semantic)
- **Voting System**: Multi-agent voting with consensus algorithms
- **Validation Criteria**: End-to-end validation of GOAP implementation

## Test Files

### 1. instrumentation.integration.test.ts

Tests OpenTelemetry instrumentation for agent lifecycle and task execution.

**Coverage:**
- Agent lifecycle span creation (spawn, execute, complete, error)
- Token tracking for multiple agent types
- Distributed trace propagation across agent calls
- Semantic attributes attachment per agent type
- Performance requirements (<1ms span creation overhead)

**Run:**
```bash
npm run test:phase2:instrumentation
```

**Key Tests:**
- ✓ Agent spawn span with semantic attributes
- ✓ Task execution span with token/cost tracking
- ✓ Error handling with proper span status
- ✓ Parent-child trace propagation
- ✓ Multi-agent coordination tracing
- ✓ Specialized operation attributes (test-gen, coverage, security, perf)

### 2. evaluation.integration.test.ts

Tests constitution clause evaluators on real TypeScript files.

**Coverage:**
- AST evaluator parsing and validation
- Metric evaluator calculating cyclomatic complexity
- Pattern evaluator matching regex patterns
- Semantic evaluator with mocked LLM
- Evaluator framework coordination
- Performance requirements (<5s per file evaluation)

**Run:**
```bash
npm run test:phase2:evaluation
```

**Key Tests:**
- ✓ AST parsing on real TypeScript files
- ✓ Cyclomatic complexity calculation
- ✓ Complex regex pattern matching
- ✓ Semantic analysis with mocked LLM responses
- ✓ Multi-evaluator coordination
- ✓ Error handling for invalid code

### 3. voting.integration.test.ts

Tests multi-agent voting system with consensus algorithms.

**Coverage:**
- Panel assembly with 3+ agents
- Voting protocol message passing
- Majority consensus algorithm
- Weighted consensus algorithm
- Voting orchestrator with timeout handling
- Result aggregation with metadata

**Run:**
```bash
npm run test:phase2:voting
```

**Key Tests:**
- ✓ Panel assembly with expertise matching
- ✓ Vote distribution to all panel members
- ✓ Majority consensus calculation
- ✓ Weighted consensus with agent weights
- ✓ Timeout handling and retry logic
- ✓ Participation rate tracking
- ✓ End-to-end voting workflow

### 4. validation.test.ts

Validates Phase 2 implementation against GOAP requirements.

**Coverage:**
- VC1: Agent trace retrieval (CLI equivalent: `aqe telemetry trace --agent`)
- VC2: Per-agent token breakdown
- VC3: Clause evaluation on sample file
- VC4: Multi-agent voting aggregation

**Run:**
```bash
npm run test:phase2:validation
```

**Key Tests:**
- ✓ Retrieve all traces for specific agent type
- ✓ Trace parent-child relationships
- ✓ Per-agent token and cost tracking
- ✓ Model-specific token breakdown
- ✓ File evaluation with performance constraints
- ✓ Multi-clause sequential evaluation
- ✓ Voting result aggregation
- ✓ End-to-end workflow integration

## Running Tests

### All Phase 2 Tests
```bash
npm run test:phase2
```

### Individual Test Suites
```bash
# Agent instrumentation only
npm run test:phase2:instrumentation

# Clause evaluation only
npm run test:phase2:evaluation

# Voting system only
npm run test:phase2:voting

# Validation criteria only
npm run test:phase2:validation
```

### With Coverage
```bash
npm run test:coverage -- tests/phase2
```

### Debug Mode
```bash
npm run test:debug -- tests/phase2/instrumentation.integration.test.ts
```

## Test Structure

Each test file follows this structure:

```typescript
describe('Component Name', () => {
  let component: Component;

  beforeAll(() => {
    // One-time setup
  });

  beforeEach(() => {
    // Per-test setup
    component = new Component();
  });

  afterEach(() => {
    // Per-test cleanup
  });

  afterAll(() => {
    // One-time cleanup
  });

  describe('Feature Group', () => {
    it('should validate specific behavior', async () => {
      // Arrange
      const input = createTestData();

      // Act
      const result = await component.process(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

## Fixtures and Mocks

Test fixtures are located in `/tests/fixtures/`:

```typescript
import {
  MockSpan,
  createMockVotingAgent,
  createMockVote,
  SAMPLE_CODE,
} from '../fixtures/phase2-mocks';
```

**Available Mocks:**
- `MockSpan`: Lightweight OpenTelemetry span
- `createMockVotingAgent()`: Create test voting agents
- `createMockVote()`: Create test votes
- `createMockVotingTask()`: Create test tasks
- `createMockLLMResponse()`: Mock semantic evaluator responses
- `SAMPLE_CODE`: TypeScript code samples for evaluation

## Performance Requirements

Phase 2 tests validate these performance requirements:

| Component | Requirement | Test |
|-----------|-------------|------|
| Span Creation | <1ms per span | instrumentation.integration.test.ts |
| File Evaluation | <5s per file | evaluation.integration.test.ts |
| Voting Aggregation | <1s per result | voting.integration.test.ts |
| High-Volume Spans | <5s for 1000 spans | instrumentation.integration.test.ts |

## Validation Criteria

Phase 2 tests validate these acceptance criteria from the implementation plan:

### VC1: Agent Trace Retrieval
- ✅ Retrieve traces for specific agent type
- ✅ Filter by time range
- ✅ Parent-child trace relationships
- ✅ Distributed trace ID consistency

### VC2: Token Breakdown
- ✅ Track tokens per agent type
- ✅ Calculate cost per agent
- ✅ Model-specific token aggregation
- ✅ Multi-task token accumulation

### VC3: Clause Evaluation
- ✅ AST evaluation on real files
- ✅ Cyclomatic complexity calculation
- ✅ Pattern matching with regex
- ✅ Multi-evaluator coordination

### VC4: Multi-Agent Voting
- ✅ Panel assembly (3+ agents)
- ✅ Majority consensus
- ✅ Weighted consensus
- ✅ Timeout/retry handling
- ✅ Result aggregation

## Troubleshooting

### Test Timeout
If tests timeout, increase memory:
```bash
node --expose-gc --max-old-space-size=2048 node_modules/.bin/jest tests/phase2
```

### Mock Setup Issues
Ensure mocks are reset between tests:
```typescript
beforeEach(() => {
  jest.clearAllMocks();
  spanExporter.reset();
});
```

### OpenTelemetry Errors
Verify provider is properly initialized:
```typescript
beforeAll(() => {
  tracerProvider = new NodeTracerProvider();
  tracerProvider.register();
});

afterAll(async () => {
  await tracerProvider.shutdown();
});
```

## CI/CD Integration

Phase 2 tests are integrated into CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run Phase 2 Tests
  run: npm run test:phase2
```

## Contributing

When adding new Phase 2 tests:

1. **Follow naming convention**: `*.integration.test.ts` for integration tests
2. **Use fixtures**: Import from `../fixtures/phase2-mocks`
3. **Clean up resources**: Always use `afterEach()` and `afterAll()`
4. **Document tests**: Add JSDoc comments explaining test purpose
5. **Performance aware**: Validate against performance requirements
6. **Update this README**: Document new test coverage

## Related Documentation

- [Phase 2 Implementation Plan](../../docs/UNIFIED-GOAP-IMPLEMENTATION-PLAN.md)
- [Instrumentation Schema](../../docs/phase2/instrumentation-schema.json)
- [Agent Reference](../../docs/reference/agents.md)
- [Test Fixtures README](../fixtures/README.md)

## Support

For issues or questions about Phase 2 tests:
1. Check test output for specific error messages
2. Review mock setup in fixtures
3. Verify component implementations are complete
4. Run individual test suites to isolate issues
