# AQE Fleet Integration Tests

This directory contains comprehensive integration tests for the Agentic Quality Engineering (AQE) fleet, designed to validate agent coordination, memory persistence, error recovery, concurrent operations, and hook integration points.

## Test Structure

### 🧪 38 Comprehensive Integration Tests

#### 1. Agent Coordination (Tests 1-5)
- **File**: `agent-coordination.test.js`
- **Focus**: Multi-agent communication, task distribution, coordination protocols
- **Tests**:
  1. Test Generator and Executor coordination
  2. Coverage Analyzer and Quality Gate coordination
  3. Performance and Security agent coordination
  4. Sequential task handoff with state persistence
  5. Error handling in task handoff chain

#### 2. Memory Persistence (Tests 6-12)
- **File**: `memory-persistence.test.js`
- **Focus**: Claude Flow memory operations, cross-session persistence, state management
- **Tests**:
  6. Store and retrieve test execution state
  7. Agent coordination through shared memory
  8. Memory namespace isolation
  9. Session state preservation across restarts
  10. Memory-based agent recovery after failure
  11. High-volume memory operations
  12. Memory cleanup and garbage collection

#### 3. Error Recovery (Tests 13-20)
- **File**: `error-recovery.test.js`
- **Focus**: Fault tolerance, graceful degradation, automatic recovery systems
- **Tests**:
  13. Test generator agent failure and recovery
  14. Coverage analyzer timeout and fallback
  15. Quality gate circuit breaker pattern
  16. Memory corruption recovery
  17. Hook execution failure recovery
  18. Cascade failure isolation
  19. Test results recovery after partial execution
  20. Artifact recovery and validation

#### 4. Concurrent Operations (Tests 21-28)
- **File**: `concurrent-operations.test.js`
- **Focus**: Parallel agent execution, race condition handling, resource contention
- **Tests**:
  21. Concurrent test generation by multiple agents
  22. Parallel coverage analysis with resource sharing
  23. Concurrent quality gate validation
  24. Memory access synchronization
  25. File system contention handling
  26. Resource pool contention
  27. High concurrency agent spawning
  28. Memory stress test under concurrent load

#### 5. Hook Integration (Tests 29-38)
- **File**: `hook-integration.test.js`
- **Focus**: Claude Flow hooks, lifecycle management, event-driven coordination
- **Tests**:
  29. Pre-task hook execution and validation
  30. Post-task hook with metrics and coordination
  31. Post-edit hook with file coordination
  32. Session management hooks
  33. Notification hook for agent coordination
  34. Hook-based workflow orchestration
  35. Error propagation through hooks
  36. Hook execution performance under load
  37. Hook reliability and retry mechanisms
  38. Hook integration with memory persistence

## Running Tests

### Prerequisites
```bash
# Ensure AQE CLI is available
npm install -g @agentic-qe/cli

# Install dependencies
npm install

# Ensure Claude Flow is available
npm install -g claude-flow@alpha
```

### Run All Tests
```bash
# Using the test suite runner
node tests/integration/integration-test-suite.js run

# Using Jest directly
npm run test:integration

# Using AQE CLI
aqe test integration
```

### Run Specific Tests
```bash
# Run a specific test number (1-38)
node tests/integration/integration-test-suite.js run 15

# Run a specific test file
npx jest tests/integration/agent-coordination.test.js

# Run tests by pattern
npx jest --testNamePattern="memory"
```

### Run Tests with Coverage
```bash
npx jest tests/integration/ --coverage --coverageDirectory=coverage/integration
```

## Test Features

### 🔄 Hive Mind Coordination
All tests integrate with the AQE hive mind through Claude Flow memory:
- Store test execution status
- Share results between agents
- Coordinate test scheduling
- Report failures and recoveries

### 🚀 Performance Validation
- Concurrent execution testing (up to 50+ parallel operations)
- Memory stress testing (1000+ operations)
- Hook performance under load
- Resource contention handling

### 🛡️ Error Recovery Testing
- Agent failure and recovery mechanisms
- Memory corruption handling
- Circuit breaker patterns
- Cascade failure isolation

### 📊 Comprehensive Reporting
- Detailed test execution reports
- Performance metrics
- Error analysis
- Recommendations for improvements

## Test Configuration

### Memory Namespaces
- `aqe-test`: General test operations
- `aqe-memory-test`: Memory persistence tests
- `aqe-recovery-test`: Error recovery tests
- `aqe-concurrent-test`: Concurrent operations tests
- `aqe-hook-test`: Hook integration tests

### Environment Variables
```bash
# Test workspace directory
TEST_WORKSPACE=/tmp/aqe-integration-tests

# Claude Flow namespace
CLAUDE_FLOW_NAMESPACE=aqe-test

# Test timeout (milliseconds)
JEST_TIMEOUT=30000

# Concurrency level for parallel tests
TEST_CONCURRENCY=10
```

## Test Utilities

### Helper Functions
- `execCommand()`: Execute shell commands with proper error handling
- `simulateAgentExecution()`: Mock agent execution for testing
- `simulateMemoryOperations()`: Test memory operations
- `validateCoordination()`: Verify agent coordination

### Mock Data
- Agent configurations
- Test execution results
- Memory state snapshots
- Error scenarios

## Continuous Integration

### GitHub Actions Integration
```yaml
# .github/workflows/integration-tests.yml
name: AQE Integration Tests
on: [push, pull_request]
jobs:
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration
```

### Quality Gates
- 90% test pass rate required
- Maximum 30-second execution time
- Zero memory leaks
- No race conditions detected

## Debugging

### Enable Debug Logging
```bash
DEBUG=aqe:* npm run test:integration
```

### Memory Analysis
```bash
# Check memory usage during tests
node --max-old-space-size=4096 tests/integration/integration-test-suite.js run

# Memory leak detection
node --expose-gc --inspect tests/integration/memory-persistence.test.js
```

### Hook Debugging
```bash
# Enable Claude Flow debug mode
CLAUDE_FLOW_DEBUG=true npm run test:integration
```

## Contributing

### Adding New Tests
1. Follow the existing test structure
2. Include hive mind coordination
3. Add performance assertions
4. Include error scenarios
5. Update test count in documentation

### Test Naming Convention
- Test files: `[category].test.js`
- Test descriptions: Descriptive action statements
- Test numbers: Sequential (1-38, continue from 39+)

### Code Quality
- ESLint compliance
- JSDoc documentation
- Error handling
- Performance considerations

## Related Documentation
- [AQE Architecture](../../docs/architecture.md)
- [Claude Flow Integration](../../docs/claude-flow.md)
- [Performance Testing](../../docs/performance.md)
- [Error Recovery](../../docs/error-recovery.md)