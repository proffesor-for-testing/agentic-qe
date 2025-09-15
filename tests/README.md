# Agentic QE Framework Test Suite

## 🧪 Overview

Comprehensive test suite for the Agentic QE Framework covering unit tests, integration tests, and performance tests. The test suite validates the core functionality, agent collaboration, distributed memory system, and system performance under load.

## 📁 Test Structure

```
tests/
├── unit/                          # Unit tests for individual components
│   ├── base-agent.test.ts         # BaseAgent class tests
│   ├── distributed-memory.test.ts # DistributedMemorySystem tests
│   ├── requirements-explorer.test.ts # RequirementsExplorerAgent tests
│   ├── performance-hunter.test.ts # PerformanceHunterAgent tests
│   └── sparc-coder.test.ts       # SPARCCoderAgent tests
├── integration/                   # Integration tests
│   └── agent-collaboration.test.ts # Agent collaboration tests
├── performance/                   # Performance and stress tests
│   └── performance-stress.test.ts # System performance tests
├── mocks/                        # Mock implementations
│   ├── logger.mock.ts            # Mock logger
│   ├── event-bus.mock.ts         # Mock event bus
│   └── memory-system.mock.ts     # Mock memory system
├── utils/                        # Test utilities
│   └── test-helpers.ts           # Test helper functions
├── setup.ts                     # Global test setup
├── test-runner.ts               # Custom test runner
└── README.md                    # This file
```

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm test                    # Basic test run
npm run test:all           # Comprehensive test run with runner
npm run test:coverage      # Tests with coverage report
```

### Run Specific Test Suites
```bash
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:performance   # Performance tests only
```

### Custom Test Runner
```bash
npm run test:runner help   # Show runner help
npm run test:check         # Check test environment
npm run test:runner list   # List available test suites
```

## 📊 Test Coverage

### Coverage Requirements
- **Statements**: >80%
- **Branches**: >75%
- **Functions**: >80%
- **Lines**: >80%

### Generate Coverage Report
```bash
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory with HTML, LCOV, and text formats.

## 🔧 Test Configuration

### Jest Configuration (`jest.config.js`)
- **Environment**: Node.js
- **Test Match**: `**/*.test.ts`, `**/*.spec.ts`
- **Setup**: Global setup in `tests/setup.ts`
- **Timeout**: 30 seconds (configurable per test)
- **Coverage**: Comprehensive coverage collection

### TypeScript Support
- Full TypeScript support with `ts-jest`
- Type checking during tests
- Source map support for debugging

## 📋 Test Categories

### 1. Unit Tests (`tests/unit/`)

#### BaseAgent Tests (`base-agent.test.ts`)
- **Constructor & Initialization**: Agent setup and configuration
- **Task Execution**: Complete perceive-decide-act-learn cycle
- **Decision Explanation**: Explainable AI reasoning traces
- **Collaboration**: Agent-to-agent communication
- **Knowledge Sharing**: Distributed knowledge management
- **State Management**: Persistence and recovery
- **Error Handling**: Graceful error recovery
- **Metrics & Performance**: Performance tracking
- **Event Handling**: Event bus integration
- **RST Heuristics**: Testing methodology integration

#### DistributedMemorySystem Tests (`distributed-memory.test.ts`)
- **Storage Operations**: Store, retrieve, delete operations
- **Query Operations**: Complex multi-dimensional queries
- **Sharing Operations**: Agent knowledge sharing
- **Statistics & Monitoring**: Memory usage tracking
- **Synchronization**: Distributed consistency
- **Replication**: Data replication across nodes
- **Cache Management**: LRU cache and TTL handling
- **Partitioning**: Data partitioning strategies
- **Concurrent Operations**: Thread-safe operations
- **Error Handling**: Fault tolerance

#### Agent-Specific Tests
- **RequirementsExplorerAgent**: Requirements analysis, ambiguity detection, testability assessment
- **PerformanceHunterAgent**: Performance bottleneck identification, optimization recommendations
- **SPARCCoderAgent**: TDD cycles, code generation, quality assessment

### 2. Integration Tests (`tests/integration/`)

#### Agent Collaboration (`agent-collaboration.test.ts`)
- **Knowledge Sharing**: Cross-agent knowledge transfer
- **Event-Driven Collaboration**: Event bus communication
- **Multi-Agent Workflows**: End-to-end SPARC workflows
- **Distributed Memory Coordination**: Consistent state management
- **Agent State Synchronization**: State consistency across agents
- **Error Handling**: Collaborative error recovery
- **Performance Impact**: Collaboration overhead analysis

### 3. Performance Tests (`tests/performance/`)

#### Performance & Stress (`performance-stress.test.ts`)
- **Memory System Performance**: High-volume operations
- **Agent Performance**: Concurrent agent execution
- **System Scalability**: Linear scaling validation
- **Memory Pressure**: High-load behavior
- **Real-world Load Simulation**: Realistic workflow testing
- **Edge Cases**: Boundary condition handling

## 🛠️ Mock System

### Mock Services (`tests/mocks/`)

#### MockLogger (`logger.mock.ts`)
- Captures all log calls for verification
- Methods: `debug()`, `info()`, `warn()`, `error()`
- Utilities: `reset()`, `getLastCall()`, `getAllCalls()`

#### MockEventBus (`event-bus.mock.ts`)
- Event emission and subscription tracking
- Methods: `emit()`, `on()`, `off()`, `waitForEvent()`
- Utilities: `getEmittedEvents()`, `getLastEmittedEvent()`

#### MockMemorySystem (`memory-system.mock.ts`)
- In-memory storage with operation logging
- Full IMemorySystem interface implementation
- Utilities: `getStorageSize()`, `getLastOperation()`

### Test Utilities (`tests/utils/test-helpers.ts`)

#### Factory Functions
- `createTestAgentId()`: Generate test agent IDs
- `createTestAgentConfig()`: Create test configurations
- `createTestTask()`: Generate test tasks
- `createMockServices()`: Bundle mock services

#### Test Utilities
- `waitFor()`: Async condition waiting
- `createAsyncSpy()`: Advanced async spying
- `measureExecutionTime()`: Performance measurement
- `createSeededRandom()`: Deterministic randomization

## 📈 Performance Benchmarks

### Baseline Performance Targets

#### Memory Operations
- **Storage**: <10ms per operation (1000 items)
- **Retrieval**: <5ms per operation
- **Queries**: <100ms for complex queries (5000 items)
- **Concurrent Operations**: Linear scaling up to 100 concurrent ops

#### Agent Operations
- **Task Execution**: <200ms per task (simple tasks)
- **Collaboration**: <50ms per collaboration request
- **Knowledge Sharing**: <100ms per knowledge share
- **State Persistence**: <25ms per state save

#### System Performance
- **Multi-Agent Execution**: 10 agents, 5 tasks each < 5 seconds
- **Memory Under Load**: 2000 large entries < 10 seconds
- **Sustained Load**: 5 seconds continuous operation

## 🐛 Debugging Tests

### Running Individual Tests
```bash
# Run specific test file
npx jest tests/unit/base-agent.test.ts

# Run specific test case
npx jest tests/unit/base-agent.test.ts -t "should execute a task"

# Run with debugging
npx jest tests/unit/base-agent.test.ts --detectOpenHandles --verbose
```

### Debug Configuration
```bash
# Enable debug logging
LOG_LEVEL=debug npm test

# Run with Node.js debugging
node --inspect-brk node_modules/.bin/jest tests/unit/base-agent.test.ts
```

### Common Issues

#### Test Timeouts
- Increase timeout in test or jest config
- Check for hanging promises or async operations
- Use `--detectOpenHandles` to find open handles

#### Memory Leaks
- Ensure proper cleanup in `afterEach()`
- Reset mocks and clear memory systems
- Use `--forceExit` if needed

#### Type Errors
- Run `npm run typecheck` to verify TypeScript
- Ensure proper mock typing
- Check for missing type definitions

## 📝 Writing New Tests

### Test Structure Template
```typescript
describe('ComponentName', () => {
  let component: ComponentType;
  let mockServices: MockServices;

  beforeEach(() => {
    mockServices = createMockServices();
    component = new ComponentType(/* ... */);
  });

  afterEach(() => {
    mockServices.reset();
  });

  describe('Feature Group', () => {
    it('should do something specific', async () => {
      // Arrange
      const input = createTestInput();

      // Act
      const result = await component.doSomething(input);

      // Assert
      expect(result).toBeDefined();
      expect(mockServices.logger.infoCalls).toHaveLength(1);
    });
  });
});
```

### Best Practices

#### Test Organization
- Group related tests in `describe` blocks
- Use descriptive test names
- Follow Arrange-Act-Assert pattern
- One assertion per test when possible

#### Mock Usage
- Always reset mocks in `afterEach()`
- Verify mock interactions
- Use type-safe mocks
- Mock external dependencies only

#### Async Testing
- Always await async operations
- Use proper timeout values
- Handle promise rejections
- Test both success and failure cases

#### Performance Testing
- Use `measureExecutionTime()` helper
- Set realistic performance targets
- Test under various load conditions
- Monitor memory usage

## 🔍 Continuous Integration

### GitHub Actions Integration
```yaml
- name: Run Tests
  run: |
    npm run test:check
    npm run test:all
    npm run lint
    npm run typecheck

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

### Quality Gates
- All tests must pass
- Coverage thresholds must be met
- No linting errors
- TypeScript compilation must succeed

## 📚 Resources

### Testing Framework Documentation
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [TypeScript Testing](https://kulshekhar.github.io/ts-jest/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

### Agent Testing Patterns
- [Test-Driven Development](https://en.wikipedia.org/wiki/Test-driven_development)
- [Behavior-Driven Development](https://en.wikipedia.org/wiki/Behavior-driven_development)
- [Testing Microservices](https://martinfowler.com/articles/microservice-testing/)

## 🤝 Contributing

### Adding New Tests
1. Create test file in appropriate directory
2. Follow naming convention: `component-name.test.ts`
3. Include comprehensive coverage
4. Add performance benchmarks for critical paths
5. Update documentation

### Test Review Checklist
- [ ] Tests cover happy path and edge cases
- [ ] Error conditions are tested
- [ ] Mocks are properly used and reset
- [ ] Performance is within acceptable bounds
- [ ] Tests are deterministic and reliable
- [ ] Documentation is updated

---

**Test Coverage Target**: 90%+ comprehensive coverage across all components with focus on critical paths and edge cases.