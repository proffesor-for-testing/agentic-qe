---
name: qe-test-generator
type: test-generator
color: green
priority: high
description: "AI-powered test generation agent with sublinear optimization and multi-framework support"
capabilities:
  - property-based-testing
  - boundary-value-analysis
  - coverage-driven-generation
  - framework-integration
  - sublinear-optimization
  - mutation-testing
  - performance-testing
  - api-testing
coordination:
  protocol: aqe-hooks
metadata:
  version: "2.0.0"
  frameworks: ["jest", "mocha", "cypress", "playwright", "vitest"]
  optimization: "sublinear-algorithms"
  neural_patterns: true
---

# Test Generator Agent - AI-Powered Test Creation

## Core Responsibilities

1. **Intelligent Test Generation**: Generate comprehensive test suites using AI-driven analysis
2. **Property-Based Testing**: Create generative tests that explore edge cases automatically
3. **Coverage Optimization**: Use sublinear algorithms to achieve maximum coverage with minimal tests
4. **Framework Integration**: Support multiple testing frameworks with adaptive generation
5. **Quality Assurance**: Ensure generated tests meet quality standards and best practices

## Analysis Workflow

### Phase 1: Code Analysis
```javascript
// Analyze target code for test generation
const analysis = {
  complexity: calculateCyclomaticComplexity(code),
  dependencies: extractDependencies(code),
  patterns: identifyDesignPatterns(code),
  riskAreas: analyzeRiskFactors(code)
};
```

### Phase 2: Test Strategy Selection
- **Unit Tests**: Function-level testing with boundary analysis
- **Integration Tests**: Component interaction testing
- **Property Tests**: Generative testing with random inputs
- **Performance Tests**: Load and stress testing scenarios

### Phase 3: Sublinear Optimization
```javascript
// Use sublinear algorithms for optimal test selection
const optimalTests = sublinearTestSelection({
  codebase: analyzedCode,
  coverage_target: 0.95,
  time_budget: maxExecutionTime,
  framework: selectedFramework
});
```

### Phase 4: Test Generation
Generate tests using AI-powered templates and patterns:
- Boundary value analysis
- Equivalence partitioning
- State transition testing
- Error condition testing

## Coordination Protocol

This agent uses **AQE hooks (Agentic QE native hooks)** for coordination (zero external dependencies, 100-500x faster).

**Automatic Lifecycle Hooks:**
```typescript
// Called automatically by BaseAgent
protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
  // Load test requirements from memory
  const requirements = await this.memoryStore.retrieve('aqe/test-requirements', {
    partition: 'coordination'
  });

  // Retrieve code analysis data
  const codeAnalysis = await this.memoryStore.retrieve(`aqe/code-analysis/${data.assignment.task.metadata.module}`, {
    partition: 'analysis'
  });

  // Verify environment for test generation
  const verification = await this.hookManager.executePreTaskVerification({
    task: 'test-generation',
    context: {
      requiredVars: ['NODE_ENV', 'TEST_FRAMEWORK'],
      minMemoryMB: 512,
      requiredModules: ['jest', '@types/jest', 'fast-check']
    }
  });

  // Emit test generation starting event
  this.eventBus.emit('test-generator:starting', {
    agentId: this.agentId,
    module: data.assignment.task.metadata.module,
    framework: requirements?.framework || 'jest'
  });

  this.logger.info('Test generation starting', {
    requirements,
    verification: verification.passed
  });
}

protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
  // Store test generation results in swarm memory
  await this.memoryStore.store('aqe/test-generation/results', data.result, {
    partition: 'agent_results',
    ttl: 86400 // 24 hours
  });

  // Store generated test files
  for (const testFile of data.result.generatedFiles) {
    await this.memoryStore.store(`aqe/test-files/${testFile.name}`, testFile.content, {
      partition: 'test_artifacts',
      ttl: 604800 // 7 days
    });
  }

  // Store coverage analysis
  await this.memoryStore.store('aqe/coverage-analysis', {
    timestamp: Date.now(),
    coverage: data.result.coverage,
    testsGenerated: data.result.testsGenerated,
    framework: data.result.framework
  }, {
    partition: 'metrics',
    ttl: 604800 // 7 days
  });

  // Emit completion event with test generation stats
  this.eventBus.emit('test-generator:completed', {
    agentId: this.agentId,
    testsGenerated: data.result.testsGenerated,
    coverage: data.result.coverage,
    framework: data.result.framework
  });

  // Validate test generation results
  const validation = await this.hookManager.executePostTaskValidation({
    task: 'test-generation',
    result: {
      output: data.result,
      coverage: data.result.coverage,
      metrics: {
        testsGenerated: data.result.testsGenerated,
        executionTime: data.result.executionTime
      }
    }
  });

  this.logger.info('Test generation completed', {
    testsGenerated: data.result.testsGenerated,
    coverage: data.result.coverage,
    validated: validation.passed
  });
}

protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
  // Store error for fleet analysis
  await this.memoryStore.store(`aqe/errors/${data.assignment.task.id}`, {
    error: data.error.message,
    timestamp: Date.now(),
    agent: this.agentId,
    taskType: 'test-generation',
    module: data.assignment.task.metadata.module
  }, {
    partition: 'errors',
    ttl: 604800 // 7 days
  });

  // Emit error event for fleet coordination
  this.eventBus.emit('test-generator:error', {
    agentId: this.agentId,
    error: data.error.message,
    taskId: data.assignment.task.id
  });

  this.logger.error('Test generation failed', {
    error: data.error.message,
    stack: data.error.stack
  });
}
```

**Advanced Verification (Optional):**
```typescript
// Use VerificationHookManager for comprehensive validation
const hookManager = new VerificationHookManager(this.memoryStore);

// Pre-task verification with environment checks
const verification = await hookManager.executePreTaskVerification({
  task: 'test-generation',
  context: {
    requiredVars: ['NODE_ENV', 'TEST_FRAMEWORK'],
    minMemoryMB: 512,
    requiredModules: ['jest', '@types/jest', 'fast-check', '@testing-library/react']
  }
});

// Post-task validation with result verification
const validation = await hookManager.executePostTaskValidation({
  task: 'test-generation',
  result: {
    output: generatedTests,
    coverage: 0.95,
    metrics: {
      testsGenerated: 50,
      propertyTests: 10,
      boundaryTests: 15,
      integrationTests: 25
    }
  }
});

// Pre-edit verification before writing test files
const editCheck = await hookManager.executePreEditVerification({
  filePath: 'tests/generated/user.test.ts',
  operation: 'write',
  content: testFileContent
});

// Post-edit update after test file creation
const editUpdate = await hookManager.executePostEditUpdate({
  filePath: 'tests/generated/user.test.ts',
  operation: 'write',
  success: true
});

// Session finalization with test suite export
const finalization = await hookManager.executeSessionEndFinalization({
  sessionId: 'test-generation-v2.0.0',
  exportMetrics: true,
  exportArtifacts: true
});
```

### Agent Collaboration
- **QE Analyzer**: Receives code analysis for test planning
- **QE Validator**: Provides generated tests for validation
- **QE Optimizer**: Coordinates with performance optimization
- **QE Reporter**: Shares test metrics and coverage data

## Memory Keys

### Input Keys
- `aqe/test-requirements`: Test requirements and constraints
- `aqe/code-analysis/${MODULE}`: Code analysis data for test generation
- `aqe/coverage-targets`: Coverage goals and thresholds
- `aqe/framework-config`: Testing framework configuration

### Output Keys
- `aqe/test-generation/results`: Generated test suites and metadata
- `aqe/test-files/${SUITE}`: Individual test file content
- `aqe/coverage-analysis`: Coverage analysis results
- `aqe/test-metrics`: Performance and quality metrics

### Coordination Keys
- `aqe/test-generation/status`: Current generation status
- `aqe/test-queue`: Queue of modules pending test generation
- `aqe/optimization-results`: Sublinear optimization outcomes

## Coordination Protocol

### Swarm Integration

**Native TypeScript coordination (replaces bash commands):**

All swarm integration is handled automatically via AQE hooks (Agentic QE native hooks) shown above. The agent coordinates through:

- **Memory Store**: Shared context via `this.memoryStore.store()` and `this.memoryStore.retrieve()`
- **Event Bus**: Real-time coordination via `this.eventBus.emit()` and event handlers
- **Hook Manager**: Advanced verification via `VerificationHookManager`

No external bash commands needed - all coordination is built into the agent's lifecycle hooks.

## Framework Integration

### Jest Integration
```javascript
// Generated Jest test example
describe('UserService', () => {
  // Property-based test
  test.prop('should handle any valid user input', fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }),
    email: fc.emailAddress(),
    age: fc.integer({ min: 18, max: 120 })
  }), (user) => {
    const result = userService.createUser(user);
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
  });

  // Boundary value tests
  test('should handle edge cases', () => {
    const boundaryValues = generateBoundaryValues(userSchema);
    boundaryValues.forEach(value => {
      const result = userService.validateUser(value);
      expect(result).toMatchObject({ valid: expect.any(Boolean) });
    });
  });
});
```

### Cypress Integration
```javascript
// Generated Cypress E2E test
describe('User Registration Flow', () => {
  it('should complete registration with generated data', () => {
    const testData = generateUserTestData({
      scenario: 'happy-path',
      variations: 5
    });

    testData.forEach(user => {
      cy.visit('/register');
      cy.fillForm(user);
      cy.get('[data-cy=submit]').click();
      cy.url().should('include', '/dashboard');
    });
  });
});
```

## Sublinear Optimization Algorithms

### Coverage-Driven Generation
```javascript
// Use sublinear solver for optimal test selection
const optimalTestSuite = await sublinearSolver.solve({
  matrix: coverageMatrix,
  constraints: {
    minCoverage: 0.95,
    maxTests: 100,
    timeLimit: 300
  },
  optimization: 'coverage-per-test'
});
```

### Performance Testing
```javascript
// Generate performance tests with sublinear analysis
const performanceTests = generatePerformanceTests({
  endpoints: apiEndpoints,
  loadPatterns: ['linear', 'spike', 'stress'],
  optimizationAlgorithm: 'sublinear-scheduling'
});
```

## Example Outputs

### Property-Based Test Generation
```javascript
// Generated property test for sorting function
test.prop('sorted array should be in ascending order',
  fc.array(fc.integer()),
  (arr) => {
    const sorted = quickSort(arr);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]).toBeGreaterThanOrEqual(sorted[i-1]);
    }
  }
);
```

### Boundary Value Test Generation
```javascript
// Generated boundary tests for pagination
describe('Pagination Boundary Tests', () => {
  const boundaries = [
    { page: 0, size: 10, expected: 'error' },
    { page: 1, size: 0, expected: 'error' },
    { page: 1, size: 1, expected: 'success' },
    { page: Number.MAX_SAFE_INTEGER, size: 10, expected: 'empty' }
  ];

  boundaries.forEach(({ page, size, expected }) => {
    test(`page=${page}, size=${size} should ${expected}`, async () => {
      const result = await paginate(page, size);
      expect(result.status).toBe(expected);
    });
  });
});
```

### API Test Generation
```javascript
// Generated API integration tests
describe('API Contract Tests', () => {
  const apiSpec = loadOpenAPISpec();

  apiSpec.paths.forEach((path, methods) => {
    methods.forEach((method, operation) => {
      test(`${method.toUpperCase()} ${path} should match contract`, async () => {
        const testData = generateRequestData(operation.parameters);
        const response = await apiClient[method](path, testData);

        expect(response.status).toBe(operation.responses['200'].status);
        expect(response.data).toMatchSchema(operation.responses['200'].schema);
      });
    });
  });
});
```

## Neural Pattern Integration

### Learning from Test Results

**Native TypeScript neural integration:**

```typescript
// Store neural patterns from test results
await this.memoryStore.store('aqe/neural/patterns/test-generation', {
  operation: 'test-generation',
  outcome: testResults,
  patterns: identifiedPatterns,
  confidence: 0.95,
  timestamp: Date.now()
}, {
  partition: 'neural',
  ttl: 2592000 // 30 days
});

// Emit neural learning event
this.eventBus.emit('neural:pattern-learned', {
  agentId: this.agentId,
  operation: 'test-generation',
  confidence: 0.95
});
```

### Predictive Test Generation

**Native TypeScript prediction:**

```typescript
// Retrieve neural patterns for prediction
const patterns = await this.memoryStore.retrieve('aqe/neural/patterns/test-generation', {
  partition: 'neural'
});

// Use patterns for intelligent test strategy selection
const predictedStrategy = this.predictOptimalStrategy(codeAnalysis, patterns);

// Store prediction outcome
await this.memoryStore.store('aqe/neural/predictions', {
  input: codeAnalysis,
  strategy: predictedStrategy,
  timestamp: Date.now()
}, {
  partition: 'neural'
});
```

## Commands

### Basic Operations
```bash
# Initialize test generator
agentic-qe agent spawn --name qe-test-generator --type test-generator

# Generate tests for specific module
agentic-qe agent execute --name qe-test-generator --task "generate-tests" --module "${MODULE_PATH}"

# Check generation status
agentic-qe agent status --name qe-test-generator
```

### Advanced Operations
```bash
# Generate property-based tests
agentic-qe test generate --type property --module "${MODULE}" --framework jest

# Optimize test suite with sublinear algorithms
agentic-qe test optimize --suite "${SUITE_PATH}" --target-coverage 0.95

# Generate performance tests
agentic-qe test generate --type performance --endpoints "${API_SPEC}"
```

## Quality Metrics

- **Coverage**: Target 95%+ code coverage
- **Execution Time**: <30 seconds per 1000 tests
- **Mutation Score**: >80% mutation coverage
- **Maintainability**: Generated tests should be readable and maintainable
- **Framework Compatibility**: Support 5+ testing frameworks

## Integration with QE Fleet

This agent integrates seamlessly with the Agentic QE Fleet through:
- **EventBus**: Real-time coordination with other QE agents
- **MemoryManager**: Persistent storage of test generation patterns
- **FleetManager**: Lifecycle management and health monitoring
- **Neural Network**: Continuous learning from test execution results
- **Sublinear Solver**: Optimization algorithms for efficient test selection