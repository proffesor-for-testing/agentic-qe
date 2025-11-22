# Test Fixtures for Phase 2

This directory contains test fixtures and mock implementations for Phase 2 integration tests.

## Structure

```
fixtures/
├── phase2-mocks.ts          # Shared mocks for all Phase 2 tests
├── test-code/               # Sample TypeScript files for evaluation tests
│   └── (created at test runtime)
└── validation/              # Sample files for validation criteria tests
    └── (created at test runtime)
```

## Usage

### Mock Components

```typescript
import {
  MockSpan,
  createMockVotingAgent,
  createMockVote,
  SAMPLE_CODE,
} from '../fixtures/phase2-mocks';

// Mock OpenTelemetry span
const span = new MockSpan('test-span');
span.setAttribute('key', 'value');
span.end();

// Mock voting agent
const agent = createMockVotingAgent('agent-1', 'test-generator', ['testing']);

// Mock vote
const vote = createMockVote('agent-1', 'task-1', 0.9, 0.95);

// Sample code for evaluation
const code = SAMPLE_CODE.simple;
```

### Test Data

The `phase2-mocks.ts` module provides:

- **MockSpan**: Lightweight span implementation for testing without full OTEL
- **Mock Voting Components**: Agents, votes, tasks
- **Mock LLM Responses**: For semantic evaluation tests
- **Sample Code**: Various TypeScript code samples for evaluation
- **Mock Databases**: In-memory stores for testing

## Best Practices

1. **Use Mocks Over Real Components**: Prefer mocks for faster, isolated tests
2. **Clean Up After Tests**: Reset mocks in `afterEach()` hooks
3. **Realistic Data**: Mock data should reflect real-world scenarios
4. **Type Safety**: All mocks are fully typed

## Adding New Fixtures

1. Add new mock to `phase2-mocks.ts`
2. Export with proper TypeScript types
3. Update this README with usage example
4. Add JSDoc comments to the mock
