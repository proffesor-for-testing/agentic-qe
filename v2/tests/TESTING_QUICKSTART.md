# Testing Quick Start - LLM Independence

Quick reference for running and writing tests for the LLM independence layer.

## Run Tests

```bash
# Unit tests (no Ollama needed)
npm run test:unit -- tests/providers/OllamaProvider.test.ts
npm run test:unit -- tests/agents/AgentLLMAdapter.test.ts
npm run test:unit -- tests/config/ConfigLoader.test.ts

# Integration tests (requires Ollama)
npm run test:integration -- OllamaProvider.integration

# All tests
npm run test:unit -- tests/providers/ tests/agents/ tests/config/

# With coverage
npm run test:unit -- --coverage tests/providers/

# Watch mode
npm run test:unit -- --watch OllamaProvider.test.ts
```

## Setup for Integration Tests

```bash
# Install Ollama (macOS)
brew install ollama

# Install Ollama (Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama
ollama serve

# Pull test model (small, 400MB)
ollama pull qwen2.5:0.5b

# Verify
curl http://localhost:11434/api/tags
```

## Using MockLLMProvider

```typescript
import { MockLLMProvider } from '../mocks/MockLLMProvider';

// Create mock
const mock = new MockLLMProvider({
  name: 'test-provider',
  defaultModel: 'test-model',
  simulateLatency: 50 // Optional delay
});

// Initialize
await mock.initialize();

// Configure responses
mock.setCompletionResponse('Hello from mock!');
mock.setEmbeddingResponse([0.1, 0.2, 0.3, ...]);

// Use in tests
const result = await mock.complete({
  messages: [{ role: 'user', content: 'Hello' }]
});

// Verify calls
const calls = mock.getCallHistory();
expect(calls).toHaveLength(1);
expect(calls[0].method).toBe('complete');

// Cleanup
mock.reset();
await mock.shutdown();
```

## Test Patterns

### Basic Test Structure
```typescript
describe('MyComponent', () => {
  let component: MyComponent;

  beforeEach(() => {
    component = new MyComponent();
  });

  afterEach(async () => {
    await component.shutdown();
  });

  /**
   * Test description
   */
  it('should do something', async () => {
    // Arrange
    const input = { ... };

    // Act
    const result = await component.doSomething(input);

    // Assert
    expect(result).toBeDefined();
    expect(result.value).toBe('expected');
  });
});
```

### Testing Errors
```typescript
it('should throw error on invalid input', async () => {
  await expect(
    component.doSomething(invalidInput)
  ).rejects.toThrow(LLMProviderError);

  await expect(
    component.doSomething(invalidInput)
  ).rejects.toThrow('specific error message');
});
```

### Testing Streams
```typescript
it('should stream data', async () => {
  const chunks: string[] = [];

  for await (const event of component.streamData()) {
    if (event.type === 'data') {
      chunks.push(event.data);
    }
  }

  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks.join('')).toContain('expected');
});
```

### Mocking HTTP
```typescript
// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// In test
mockFetch.mockResolvedValueOnce({
  ok: true,
  json: async () => ({ result: 'data' })
});

const result = await component.fetchData();
expect(mockFetch).toHaveBeenCalled();
```

## Common Assertions

```typescript
// Existence
expect(value).toBeDefined();
expect(value).not.toBeNull();
expect(array).toHaveLength(3);

// Values
expect(value).toBe('exact');
expect(value).toEqual({ complex: 'object' });
expect(number).toBeGreaterThan(0);
expect(number).toBeLessThan(100);

// Arrays
expect(array).toContain('item');
expect(array).toHaveLength(5);

// Objects
expect(obj).toHaveProperty('key');
expect(obj.key).toBe('value');

// Types
expect(typeof value).toBe('string');
expect(value).toBeInstanceOf(Class);

// Errors
await expect(promise).rejects.toThrow();
await expect(promise).rejects.toThrow(ErrorClass);
await expect(promise).rejects.toThrow('message');
```

## File Locations

```
tests/
├── mocks/
│   └── MockLLMProvider.ts          # Reusable mock
├── providers/
│   ├── OllamaProvider.test.ts      # Unit tests (23 tests)
│   └── OllamaProvider.integration.test.ts  # Integration (9 tests)
├── agents/
│   └── AgentLLMAdapter.test.ts     # Adapter tests (26 tests)
└── config/
    └── ConfigLoader.test.ts        # Config tests (26 tests)
```

## Coverage Targets

| Component | Target | Current |
|-----------|--------|---------|
| OllamaProvider | 95%+ | TBD |
| AgentLLMAdapter | 95%+ | TBD |
| ConfigLoader | 95%+ | TBD |
| Overall | 90%+ | TBD |

## Troubleshooting

### Tests Timeout
- Increase timeout: `jest.setTimeout(30000)`
- Check if Ollama is responding slowly
- Use smaller model for integration tests

### Mock Not Working
- Clear mocks in `beforeEach`
- Check mock is properly initialized
- Verify mock responses are configured

### Integration Tests Skip
- Check Ollama is running: `curl http://localhost:11434`
- Verify model is installed: `ollama list`
- Check logs: `ollama serve` output

### Coverage Too Low
- Add error case tests
- Test edge cases (empty, null, invalid)
- Test all method parameters
- Test concurrent operations

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run Unit Tests
  run: npm run test:unit

- name: Generate Coverage
  run: npm run test:unit -- --coverage

- name: Upload Coverage
  uses: codecov/codecov-action@v3
```

### Pre-commit Hook
```bash
#!/bin/bash
npm run test:unit -- --bail --maxWorkers=1
```

## Documentation

- **Full Guide:** `/workspaces/agentic-qe-cf/docs/testing/llm-independence-test-suite.md`
- **Provider README:** `/workspaces/agentic-qe-cf/tests/providers/README.md`
- **Test Files:** `/workspaces/agentic-qe-cf/tests/`

## Questions?

- Check test file JSDoc comments for examples
- Review existing test patterns in codebase
- See MockLLMProvider implementation for mocking examples
- Ask QE Test Generator Agent for assistance

---

**Quick Tip:** Run unit tests first (no setup needed), then integration tests with Ollama.
