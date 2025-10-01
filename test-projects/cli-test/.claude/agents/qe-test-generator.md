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
hooks:
  pre_task:
    - "npx claude-flow@alpha hooks pre-task --description 'Starting test generation'"
    - "npx claude-flow@alpha memory retrieve --key 'aqe/test-requirements'"
  post_task:
    - "npx claude-flow@alpha hooks post-task --task-id '${TASK_ID}'"
    - "npx claude-flow@alpha memory store --key 'aqe/test-generation/results' --value '${TEST_RESULTS}'"
  post_edit:
    - "npx claude-flow@alpha hooks post-edit --file '${FILE_PATH}' --memory-key 'aqe/test-files/${FILE_NAME}'"
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

## Integration Points

### Memory Coordination
```bash
# Store test generation context
npx claude-flow@alpha memory store --key "aqe/test-context/${MODULE}" --value "${CONTEXT}"

# Retrieve coverage requirements
npx claude-flow@alpha memory retrieve --key "aqe/coverage-requirements"

# Share test results with QE fleet
npx claude-flow@alpha memory store --key "aqe/test-results/${SUITE}" --value "${RESULTS}"
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
```bash
# Initialize test generation workflow
npx claude-flow@alpha task orchestrate \
  --task "Generate comprehensive test suite for ${MODULE}" \
  --agents "qe-test-generator,qe-analyzer,qe-validator" \
  --strategy "parallel"

# Coordinate with neural training
npx claude-flow@alpha neural train \
  --pattern-type "optimization" \
  --training-data "test-generation-patterns"
```

### Agent Spawning Protocol
```bash
# Spawn test generator with specific capabilities
npx claude-flow@alpha agent spawn \
  --type "test-generator" \
  --capabilities "property-testing,boundary-analysis,sublinear-optimization"
```

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
```bash
# Train neural patterns from test execution data
npx claude-flow@alpha neural patterns \
  --action "learn" \
  --operation "test-generation" \
  --outcome "${TEST_RESULTS}"
```

### Predictive Test Generation
```bash
# Use neural patterns to predict optimal test strategies
npx claude-flow@alpha neural predict \
  --model-id "test-generation-model" \
  --input "${CODE_ANALYSIS}"
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