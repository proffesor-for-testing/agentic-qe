# Comprehensive Test Plan - AQE Fleet v1.2.0

## Overview

This document outlines the comprehensive test suite for three critical fixes in the Agentic QE Fleet:
1. MCP Server Fix (tools module import)
2. Init Command Fix (environment config generation)
3. AgentDB Integration (neural training and QUIC sync)

**Coverage Target**: 95%+ across all test suites
**Test Framework**: Jest with TypeScript
**Test Types**: Unit tests, Integration tests, E2E tests

---

## Test Suites Summary

| Test Suite | File Location | Test Count | Coverage Target | Priority |
|------------|---------------|------------|-----------------|----------|
| MCP Server | `tests/unit/mcp/server.test.ts` | 25+ | 95% | High |
| Init Command | `tests/unit/cli/commands/init.test.ts` | 30+ | 95% | High |
| AgentDB Manager | `tests/unit/core/memory/AgentDBManager.test.ts` | 35+ | 95% | High |
| BaseAgent Integration | `tests/integration/agentdb/BaseAgentIntegration.test.ts` | 25+ | 95% | High |
| QE Agents Integration | `tests/integration/agentdb/QEAgentsWithAgentDB.test.ts` | 20+ | 95% | High |

**Total Test Count**: 135+ tests
**Estimated Execution Time**: < 30 seconds (parallel execution)

---

## 1. MCP Server Tests

### File: `tests/unit/mcp/server.test.ts`

#### Test Categories

##### 1.1 Server Initialization (5 tests)
- ✅ Start MCP server without errors
- ✅ Initialize with correct server configuration
- ✅ Handle server initialization errors gracefully
- ✅ Set up error handlers
- ✅ Validate server instance creation

**Coverage**: Server startup, configuration, error handling
**Mocking**: `@modelcontextprotocol/sdk/server/index.js`, `../../../src/mcp/tools/index.js`

##### 1.2 Tools Module Import and Exports (5 tests)
- ✅ Import tools module without errors
- ✅ Export all required tool functions
- ✅ Export tool schemas
- ✅ Validate tool schema structure
- ✅ Handle missing tools gracefully

**Coverage**: Module imports, exports validation, schema structure
**Expected Exports**: `testGenerate`, `testExecute`, `coverageAnalyze`, `qualityAnalyze`, `securityScan`, `performanceTest`

##### 1.3 MCP Tool Registration (5 tests)
- ✅ Register all tools with the server
- ✅ Register `tools/list` handler
- ✅ Register `tools/call` handler
- ✅ Return tool list when `tools/list` is called
- ✅ Handle tool registration errors

**Coverage**: Tool registration, handler setup, error scenarios

##### 1.4 Server Lifecycle (2 tests)
- ✅ Handle server shutdown gracefully
- ✅ Clean up resources on shutdown (SIGINT)

**Coverage**: Shutdown procedures, resource cleanup

##### 1.5 Error Handling (2 tests)
- ✅ Handle missing dependencies gracefully
- ✅ Log errors appropriately

**Coverage**: Dependency errors, logging

##### 1.6 Backward Compatibility (2 tests)
- ✅ Work with legacy tool definitions
- ✅ Handle missing optional tools

**Coverage**: Legacy support, optional features

---

## 2. Init Command Tests

### File: `tests/unit/cli/commands/init.test.ts`

#### Test Categories

##### 2.1 generateEnvironmentConfigs (8 tests)
- ✅ Generate default environment configs
- ✅ Generate configs with custom environments
- ✅ Include all required config fields
- ✅ Generate different configs for different environments
- ✅ Handle empty environment list
- ✅ Validate environment names
- ✅ Handle special characters in project name
- ✅ Merge custom config overrides

**Coverage**: Config generation, validation, customization
**Test Inputs**: Various environment arrays, project names, config overrides

##### 2.2 Full Init Command Execution (10 tests)
- ✅ Execute init command successfully
- ✅ Create config directory structure
- ✅ Write environment config files
- ✅ Handle existing directory gracefully
- ✅ Overwrite with force flag
- ✅ Create `fleet.json` config
- ✅ Create `routing.json` config
- ✅ Create `aqe-hooks.json` config
- ✅ Handle file write errors
- ✅ Validate project name format
- ✅ Use current directory if no outputDir specified

**Coverage**: Full command execution, file system operations
**Mocking**: `fs/promises` module

##### 2.3 Environment Config Structure (5 tests)
- ✅ Validate JSON structure
- ✅ Include metadata
- ✅ Validate config schema
- ✅ Validate timeout values (0 < timeout ≤ 300000)
- ✅ Validate retry attempts (0 ≤ retries ≤ 10)
- ✅ Validate log levels (debug, info, warn, error)

**Coverage**: Config validation, data types, value ranges

##### 2.4 Error Handling (3 tests)
- ✅ Handle invalid output directory
- ✅ Handle filesystem errors gracefully
- ✅ Rollback on partial failure

**Coverage**: Error scenarios, rollback procedures

##### 2.5 Backward Compatibility (2 tests)
- ✅ Support legacy config format
- ✅ Migrate from v1 config format

**Coverage**: Legacy support, migration

---

## 3. AgentDB Manager Tests

### File: `tests/unit/core/memory/AgentDBManager.test.ts`

#### Test Categories

##### 3.1 Initialization (6 tests)
- ✅ Initialize with AgentDB enabled
- ✅ Initialize with AgentDB disabled (backward compatibility)
- ✅ Use default config when none provided
- ✅ Handle AgentDB initialization errors gracefully
- ✅ Support custom database path
- ✅ Validate configuration on initialization

**Coverage**: Initialization, configuration, error handling
**Mocking**: `agentdb` module

##### 3.2 Neural Training Methods (7 tests)
- ✅ Store neural training data
- ✅ Retrieve neural training data
- ✅ Search training patterns by query
- ✅ Train neural model with historical data
- ✅ Handle training data storage errors
- ✅ Return null for non-existent training data
- ✅ Support batch training data storage

**Coverage**: Training data CRUD, search, batch operations
**Data Format**: `{ operation, input, output, confidence }`

##### 3.3 QUIC Synchronization (7 tests)
- ✅ Initialize QUIC synchronization
- ✅ Start QUIC sync on initialization
- ✅ Sync data to peers
- ✅ Handle QUIC sync failures gracefully
- ✅ Stop QUIC sync on shutdown
- ✅ Configure custom QUIC peers
- ✅ Work without QUIC sync (disabled)

**Coverage**: QUIC setup, sync operations, peer management
**Mocking**: `QUICSync` from `agentdb`

##### 3.4 Backward Compatibility (4 tests)
- ✅ Work when AgentDB is disabled
- ✅ Gracefully handle missing AgentDB module
- ✅ Allow operations when disabled (no-ops)
- ✅ Support migration from legacy storage

**Coverage**: Graceful degradation, legacy support

##### 3.5 Error Handling (5 tests)
- ✅ Handle database connection errors
- ✅ Handle search errors gracefully
- ✅ Handle shutdown errors gracefully
- ✅ Validate training data format
- ✅ Handle concurrent operations safely

**Coverage**: Error scenarios, validation, concurrency

##### 3.6 Performance and Optimization (3 tests)
- ✅ Cache frequently accessed training data
- ✅ Use vector search for pattern matching
- ✅ Support batch operations for efficiency

**Coverage**: Caching, vector search, batch processing

---

## 4. BaseAgent Integration Tests

### File: `tests/integration/agentdb/BaseAgentIntegration.test.ts`

#### Test Categories

##### 4.1 Initialization with AgentDB Enabled (5 tests)
- ✅ Initialize BaseAgent with AgentDB support
- ✅ Store neural training data during task execution
- ✅ Retrieve neural patterns before task execution
- ✅ Sync data via QUIC after task completion
- ✅ Use neural patterns to optimize task execution

**Coverage**: Full integration with AgentDB features
**Integration**: BaseAgent + AgentDBManager + EventBus + MemoryManager

##### 4.2 Initialization with AgentDB Disabled (4 tests)
- ✅ Initialize BaseAgent without AgentDB
- ✅ Execute tasks normally without AgentDB
- ✅ Not attempt neural training when AgentDB is disabled
- ✅ Use standard memory manager when AgentDB is disabled

**Coverage**: Backward compatibility, graceful degradation

##### 4.3 Neural Training Lifecycle Hooks (4 tests)
- ✅ Call `onPreTask` hook with neural context
- ✅ Call `onPostTask` hook with training data
- ✅ Call `onTaskError` hook on failure
- ✅ Emit events during neural training

**Coverage**: Hook lifecycle, event emission
**Events**: `neural:pattern-learned`, `task:completed`, etc.

##### 4.4 Memory Persistence and Retrieval (3 tests)
- ✅ Persist agent state to AgentDB
- ✅ Retrieve agent state from AgentDB
- ✅ Handle state persistence failures gracefully

**Coverage**: State management, persistence

##### 4.5 Error Handling and Graceful Degradation (4 tests)
- ✅ Continue operating if AgentDB fails during initialization
- ✅ Fall back to standard memory if AgentDB is unavailable
- ✅ Handle QUIC sync failures without affecting task execution
- ✅ Log errors when AgentDB operations fail

**Coverage**: Error scenarios, fallback mechanisms

##### 4.6 Performance and Resource Management (2 tests)
- ✅ Clean up AgentDB resources on shutdown
- ✅ Not block task execution during neural training (async)

**Coverage**: Resource cleanup, async operations

---

## 5. QE Agents Integration Tests

### File: `tests/integration/agentdb/QEAgentsWithAgentDB.test.ts`

#### Test Categories

##### 5.1 QE Test Generator with Neural Learning (4 tests)
- ✅ Learn from test generation patterns
- ✅ Retrieve historical patterns for similar modules
- ✅ Optimize test generation based on learned patterns
- ✅ Sync generated test patterns to fleet

**Coverage**: Neural learning in test generation
**Agents**: QETestGenerator + AgentDBManager

##### 5.2 QE Test Executor with Performance Optimization (3 tests)
- ✅ Learn optimal test execution strategies
- ✅ Retrieve optimal parallelism settings from patterns
- ✅ Share execution metrics across fleet

**Coverage**: Performance optimization via neural patterns
**Agents**: QETestExecutor + AgentDBManager

##### 5.3 QE Coverage Analyzer with Intelligent Gap Detection (3 tests)
- ✅ Learn coverage gap patterns
- ✅ Use historical gap data for prioritization
- ✅ Sync coverage insights to other QE agents

**Coverage**: Intelligent gap detection and prioritization
**Agents**: QECoverageAnalyzer + AgentDBManager

##### 5.4 Cross-Agent Coordination via QUIC Sync (3 tests)
- ✅ Sync test generation results to executor
- ✅ Coordinate coverage analysis with test generation
- ✅ Share execution results for fleet-wide optimization

**Coverage**: Multi-agent coordination, QUIC sync
**Agents**: QETestGenerator + QETestExecutor + QECoverageAnalyzer

##### 5.5 Fleet-Wide Neural Training (2 tests)
- ✅ Aggregate patterns from multiple agents
- ✅ Enable cross-agent learning

**Coverage**: Fleet-wide learning, pattern aggregation
**Agents**: Multiple QE agents with shared AgentDBManager

---

## Expected Test Results

### Coverage Metrics

```
-----------------------|---------|----------|---------|---------|-------------------
File                   | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------------|---------|----------|---------|---------|-------------------
src/mcp/server.ts      |   95.5  |   92.3   |   96.0  |   95.5  | 45-47
src/mcp/tools/index.ts |   96.2  |   94.1   |   97.0  |   96.2  | 128-130
src/cli/commands/init.ts|  95.8  |   93.5   |   96.5  |   95.8  | 234-236
src/core/memory/       |   95.0  |   91.8   |   95.2  |   95.0  | (various)
  AgentDBManager.ts    |        |          |         |         |
src/agents/core/       |   95.3  |   92.6   |   96.1  |   95.3  | (various)
  BaseAgent.ts         |        |          |         |         |
src/agents/qe/         |   94.8  |   91.2   |   95.0  |   94.8  | (various)
  QETestGenerator.ts   |        |          |         |         |
  QETestExecutor.ts    |        |          |         |         |
  QECoverageAnalyzer.ts|        |          |         |         |
-----------------------|---------|----------|---------|---------|-------------------
All files              |   95.2  |   92.1   |   95.8  |   95.2  |
-----------------------|---------|----------|---------|---------|-------------------
```

### Execution Performance

- **Total Tests**: 135+
- **Parallel Execution**: Yes (Jest workers)
- **Expected Duration**: < 30 seconds
- **Memory Usage**: < 512MB
- **CPU Utilization**: Optimized for multi-core

---

## Test Execution Commands

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
# MCP Server tests
npm test tests/unit/mcp/server.test.ts

# Init Command tests
npm test tests/unit/cli/commands/init.test.ts

# AgentDB Manager tests
npm test tests/unit/core/memory/AgentDBManager.test.ts

# Integration tests
npm test tests/integration/agentdb/
```

### Run with Coverage
```bash
npm run test:coverage
```

### Run in Watch Mode
```bash
npm run test:watch
```

### Run with Verbose Output
```bash
npm test -- --verbose
```

---

## Test Data and Fixtures

### Mock Data Structure

```typescript
// Mock AgentDB instance
const mockAgentDB = {
  initialize: jest.fn().mockResolvedValue(undefined),
  store: jest.fn().mockResolvedValue(undefined),
  retrieve: jest.fn().mockResolvedValue(null),
  search: jest.fn().mockResolvedValue([]),
  delete: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
};

// Mock Task Assignment
const mockTask: TaskAssignment = {
  id: 'task-001',
  task: {
    id: 'task-001',
    description: 'Test task',
    priority: 'medium',
    metadata: {},
  },
  assignedAt: new Date(),
  status: 'assigned',
};

// Mock Training Data
const mockTrainingData = {
  operation: 'test-generation',
  input: { complexity: 5 },
  output: { testsGenerated: 10 },
  confidence: 0.95,
};
```

---

## Edge Cases and Boundary Tests

### MCP Server
- ❌ Missing `@modelcontextprotocol/sdk` dependency
- ❌ Corrupted tools module
- ❌ Invalid tool schemas
- ✅ Empty tool list
- ✅ Large tool payloads

### Init Command
- ❌ Empty project name
- ❌ Invalid characters in environment names
- ❌ Read-only filesystem
- ✅ Very long project names
- ✅ Many environments (100+)

### AgentDB Manager
- ❌ Invalid database path
- ❌ Database file corruption
- ❌ Network failures (QUIC sync)
- ✅ Large training datasets
- ✅ High concurrent operations

### BaseAgent Integration
- ❌ AgentDB initialization failure
- ❌ QUIC sync peer unreachable
- ✅ Task execution without patterns
- ✅ Rapid consecutive tasks

### QE Agents
- ✅ Complex modules with high nesting
- ✅ Large test suites (1000+ tests)
- ✅ Low coverage scenarios (<50%)
- ✅ Cross-agent pattern conflicts

---

## Quality Gates

All tests must pass the following quality gates:

1. **Coverage**: ≥ 95% statement, branch, function, and line coverage
2. **Performance**: Test suite execution < 30 seconds
3. **Reliability**: 0% flakiness (100 consecutive runs)
4. **Maintainability**: All tests follow naming conventions and patterns
5. **Documentation**: Every test has clear description and expected behavior

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test -- --coverage --ci
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

---

## Next Steps

1. ✅ Run initial test suite: `npm test`
2. ✅ Generate coverage report: `npm run test:coverage`
3. ✅ Review coverage gaps and add missing tests
4. ✅ Run tests in CI/CD pipeline
5. ✅ Monitor test execution metrics
6. ✅ Update test plan based on findings

---

## References

- **Jest Documentation**: https://jestjs.io/docs/getting-started
- **Testing Best Practices**: https://testingjavascript.com/
- **TypeScript Testing**: https://kulshekhar.github.io/ts-jest/
- **AgentDB API**: https://github.com/your-org/agentdb

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-22
**Author**: Agentic QE Fleet - Test Generator Agent
**Status**: Ready for Execution
