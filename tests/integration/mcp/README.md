# MCP Integration Test Suite

Comprehensive integration tests for all critical AQE MCP tools to prevent regression and ensure correct functionality.

## Test Files

### 1. `test-harness.ts`
Shared test utilities and infrastructure for MCP tool testing.

**Key Features:**
- MCP server initialization and cleanup
- Tool call execution with response parsing
- Memory store operations
- Event bus coordination
- Mock file creation for testing
- Agent spawning and task execution helpers

**Usage:**
```typescript
const harness = new MCPTestHarness();
await harness.initialize();

const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, params);
harness.assertSuccess(result);
const data = harness.parseToolResponse(result);

await harness.cleanup();
```

### 2. `quality-analyze.integration.test.ts` (30 tests)
Tests the `quality_analyze` MCP tool with comprehensive parameter combinations.

**Test Coverage:**
- ✅ Complete dataSource with context
- ✅ Missing context (should use defaults)
- ✅ Code metrics as structured object
- ✅ Code metrics as file path
- ✅ Invalid scope handling
- ✅ Empty metrics array
- ✅ Custom thresholds
- ✅ Historical comparison
- ✅ Recommendations enabled/disabled
- ✅ Different scopes (code, tests, performance, security, all)
- ✅ Agent spawn failures
- ✅ Quality report structure validation
- ✅ Memory coordination

**Key Learnings:**
- Context parameter is optional and defaults to 'development'
- Code metrics can be a file path string OR structured object
- Empty metrics array correctly fails validation
- Agent spawn failures fall back to local analysis

### 3. `regression-risk.integration.test.ts` (23 tests)
Tests the `regression_risk_analyze` MCP tool with various parameter formats.

**Test Coverage:**
- ✅ changeSet format (original)
- ✅ changes format (simplified)
- ✅ Both formats (should prefer changeSet)
- ✅ Neither format (should fail)
- ✅ Complex changes array (multiple types)
- ✅ Minimal changes (single file)
- ✅ Coverage data integration
- ✅ Historical data enabled
- ✅ Different analysis depths
- ✅ Invalid repository handling
- ✅ Risk level classification
- ✅ Test selection recommendations
- ✅ Impact component analysis
- ✅ Custom threshold application
- ✅ Report structure validation

**Key Learnings:**
- Tool accepts BOTH `changeSet` and `changes` parameters
- When both provided, `changeSet` takes precedence
- Tool fails correctly when neither is provided
- Risk levels properly classified: low/medium/high/critical
- Recommendations include test selection strategies

### 4. `fleet-management.integration.test.ts` (28 tests)
Tests fleet initialization, agent spawning, task orchestration, and status monitoring.

**Test Coverage:**
- ✅ Fleet initialization with all topologies (hierarchical, mesh, ring, adaptive)
- ✅ Agent spawning for all 7 agent types
- ✅ Agent spawning with custom resources
- ✅ Multiple agents with unique names
- ✅ Task orchestration with different strategies (parallel, sequential, adaptive)
- ✅ Different priority levels (low, medium, high, critical)
- ✅ Fleet status with/without metrics
- ✅ Agent lifecycle management
- ✅ Parallel agent spawning
- ✅ Multi-agent coordination workflows
- ✅ Error recovery

**Key Learnings:**
- maxAgents must be between 5 and 50
- All 7 agent types spawn successfully
- Concurrent spawning handles properly
- Fleet coordination works across agent types

### 5. `test-execution.integration.test.ts` (32 tests)
Tests test generation, execution, optimization, and coverage analysis.

**Test Coverage:**
- ✅ Test generation for all types (unit, integration, e2e, property-based, mutation)
- ✅ Test execution with parallel and sequential modes
- ✅ All report formats (junit, tap, json, html)
- ✅ Retry mechanism for flaky tests
- ✅ Streaming test execution
- ✅ Test optimization with sublinear algorithms
- ✅ Optimization for different metrics (execution-time, coverage, cost, reliability)
- ✅ Coverage analysis with Johnson-Lindenstrauss algorithm
- ✅ Coverage gap detection
- ✅ End-to-end workflow (generate → execute → analyze)
- ✅ Performance benchmarking
- ✅ Real-time performance monitoring
- ✅ Security scanning (comprehensive, SAST, DAST)

**Key Learnings:**
- Streaming provides real-time progress updates
- Backward compatible (works with streaming disabled)
- Sublinear algorithms optimize large test suites
- Complete workflow integration works seamlessly

### 6. `parameter-validation.integration.test.ts` (38 tests)
Tests parameter validation, type checking, and error handling across all MCP tools.

**Test Coverage:**
- ✅ Missing required parameters
- ✅ Invalid enum values
- ✅ Type mismatches (string/number/boolean)
- ✅ Boundary conditions (min/max values)
- ✅ Empty arrays
- ✅ Optional parameter handling
- ✅ Range validation (coverageTarget, retryCount, etc.)

**Tools Validated:**
- fleet_init
- agent_spawn
- quality_analyze
- test_generate
- test_execute
- task_orchestrate
- regression_risk_analyze
- optimize_tests
- coverage_analyze_sublinear

**Key Learnings:**
- Proper validation of all enum types
- Correct min/max bounds enforcement
- Type checking works as expected
- Optional parameters handled correctly

## Running the Tests

### Run all MCP integration tests:
```bash
npm run test:mcp
```

### Run specific test file:
```bash
npm run test:mcp -- quality-analyze.integration.test.ts
```

### Run with coverage:
```bash
npm run test:coverage -- tests/integration/mcp
```

## Test Statistics

- **Total Test Files**: 6
- **Total Tests**: 151
- **Test Categories**:
  - Quality Analysis: 30 tests
  - Regression Risk: 23 tests
  - Fleet Management: 28 tests
  - Test Execution: 32 tests
  - Parameter Validation: 38 tests
  - Test Harness: Shared infrastructure

## Coverage Goals

- ✅ All critical MCP tools have integration tests
- ✅ Tests cover happy paths and error cases
- ✅ Tests validate recent fixes (context optional, parameter aliasing)
- ⏱️  Target: Tests run in <5 minutes total
- 🎯 Target: 90%+ code coverage for MCP handlers

## Recent Fixes Validated

1. **Context Parameter Optional** (quality-analyze)
   - ✅ Test confirms context defaults to 'development' when missing
   - ✅ Test confirms complete context is used when provided

2. **Parameter Aliasing** (regression-risk-analyze)
   - ✅ Test confirms both `changeSet` and `changes` work
   - ✅ Test confirms `changeSet` takes precedence when both provided
   - ✅ Test confirms error when neither is provided

3. **Code Metrics Flexibility** (quality-analyze)
   - ✅ Test confirms structured object format works
   - ✅ Test confirms file path string format works

4. **Type Validation** (all tools)
   - ✅ Tests confirm proper enum validation
   - ✅ Tests confirm type mismatch detection
   - ✅ Tests confirm boundary condition handling

## Test Patterns

### 1. Arrange-Act-Assert
All tests follow clear AAA pattern:
```typescript
it('should test something', async () => {
  // Arrange
  const params = { /* ... */ };

  // Act
  const result = await harness.callTool(TOOL_NAME, params);

  // Assert
  harness.assertSuccess(result);
  expect(data).toHaveProperty('field');
});
```

### 2. Error Case Testing
```typescript
it('should fail with invalid parameter', async () => {
  const result = await harness.callTool(TOOL_NAME, invalidParams);

  expect(result.success).toBe(false);
  expect(result.error).toContain('expected error message');
});
```

### 3. Comprehensive Structure Validation
```typescript
it('should return properly structured response', async () => {
  const result = await harness.callTool(TOOL_NAME, params);

  harness.assertSuccess(result);
  const data = harness.parseToolResponse(result);

  harness.assertContainsFields(data, ['field1', 'field2', 'field3']);
  expect(data.field1).toBeDefined();
  expect(data.field2.nested).toBe(expected);
});
```

## Contributing

When adding new MCP tools or handlers:

1. Add integration tests to appropriate file or create new file
2. Use the `MCPTestHarness` for consistent testing
3. Test both happy paths and error cases
4. Validate parameter types and boundaries
5. Check response structure completeness
6. Run `npm run test:mcp` to ensure no regressions

## Maintenance

- Review and update tests when MCP tools are modified
- Add new test cases for discovered edge cases
- Keep test harness utilities up to date
- Monitor test execution time and optimize if needed

---

**Generated**: 2025-10-30
**Version**: 1.0.0
**Author**: Agentic QE Team
