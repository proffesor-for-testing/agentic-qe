# Agentic QE Test Suite

Comprehensive Test-Driven Development (TDD) test suite following **London School TDD** methodology for the Agentic Quality Engineering platform.

## Test Architecture Overview

### London School TDD Approach

This test suite follows the **London School (Mockist)** approach to TDD, which emphasizes:

- **Outside-In Development**: Start with acceptance tests and work inward
- **Mock-Driven Development**: Mock all dependencies to isolate units
- **Behavior Verification**: Focus on how objects collaborate, not what they contain
- **Interaction Testing**: Verify the conversations between objects
- **Contract Definition**: Use mocks to define clear interfaces

### Test Structure

```
tests/
├── unit/                    # Unit tests (London School TDD)
│   ├── fleet-manager.test.ts  # Fleet initialization & agent spawning
│   ├── test-generator.test.ts # AI test generation with mocks
│   ├── test-executor.test.ts  # Parallel execution scenarios
│   ├── coverage-analyzer.test.ts # O(log n) optimization
│   └── quality-gate.test.ts   # Decision tree logic
├── integration/           # Integration tests
│   └── agent-coordination.test.ts # Multi-agent communication
├── e2e/                   # End-to-end tests
│   └── cli.test.ts           # CLI commands & workflows
├── setup/                 # Test configuration
│   ├── jest.setup.ts         # Global Jest configuration
│   └── london-school.setup.ts # London School TDD utilities
├── __mocks__/             # Mock definitions
│   └── external-dependencies.ts # External service mocks
├── processors/            # Test result processors
│   └── london-school-processor.js # TDD compliance analysis
└── sequencers/            # Test execution order
    └── tdd-sequencer.js       # Optimal TDD test ordering
```

## Test Categories

### 1. Unit Tests (London School TDD)

**Philosophy**: Mock all dependencies, focus on behavior verification

#### Fleet Manager Tests
- **Mock Strategy**: Mock logger, metrics, agent factory
- **Focus Areas**: Agent spawning coordination, resource allocation
- **Key Patterns**: Collaboration verification, contract testing

#### Test Generator Tests
- **Mock Strategy**: Mock code analyzer, AI service, file system
- **Focus Areas**: AI-driven test creation, framework integration
- **Key Patterns**: Behavior-driven generation, mock coordination

#### Test Executor Tests
- **Mock Strategy**: Mock test runners, resource manager, result aggregator
- **Focus Areas**: Parallel execution, failure handling, retry logic
- **Key Patterns**: Interaction verification, collaboration testing

#### Coverage Analyzer Tests
- **Mock Strategy**: Mock sublinear solver, coverage collector, metrics
- **Focus Areas**: O(log n) optimization, temporal advantage
- **Key Patterns**: Algorithm coordination, performance verification

#### Quality Gate Tests
- **Mock Strategy**: Mock metrics collector, decision engine, policy engine
- **Focus Areas**: Decision tree logic, policy evaluation
- **Key Patterns**: Decision flow verification, rule engine testing

### 2. Integration Tests

**Philosophy**: Test real component interactions with mocked external services

#### Agent Coordination Tests
- **Integration Scope**: Multi-agent communication patterns
- **Mock Strategy**: Mock message bus, external APIs
- **Focus Areas**: Hierarchical/mesh topologies, failure recovery
- **Key Patterns**: Event-driven coordination, load balancing

### 3. End-to-End Tests

**Philosophy**: Test complete user workflows through CLI interface

#### CLI Tests
- **E2E Scope**: Complete CLI command workflows
- **Mock Strategy**: Mock external services only
- **Focus Areas**: Fleet management, test generation, quality gates
- **Key Patterns**: Command validation, workflow verification

## London School TDD Patterns

### 1. Mock-First Development

```typescript
// Define collaborator contracts through mocks
const mockRepository = {
  save: jest.fn().mockResolvedValue({ id: '123' }),
  findByEmail: jest.fn().mockResolvedValue(null)
};

const mockNotifier = {
  sendWelcome: jest.fn().mockResolvedValue(true)
};
```

### 2. Behavior Verification

```typescript
// Focus on HOW objects collaborate
it('should coordinate user creation workflow', async () => {
  await userService.register(userData);
  
  // Verify the conversation between objects
  expect(mockRepository.findByEmail).toHaveBeenCalledWith(userData.email);
  expect(mockRepository.save).toHaveBeenCalledWith(
    expect.objectContaining({ email: userData.email })
  );
  expect(mockNotifier.sendWelcome).toHaveBeenCalledWith('123');
});
```

### 3. Contract Testing

```typescript
// Define and verify contracts
const userServiceContract = {
  register: {
    input: { email: 'string', password: 'string' },
    output: { success: 'boolean', id: 'string' },
    collaborators: ['UserRepository', 'NotificationService']
  }
};
```

### 4. Interaction Patterns

```typescript
// Test object conversations
it('should follow proper workflow interactions', () => {
  const service = new OrderService(mockPayment, mockInventory, mockShipping);
  
  service.processOrder(order);
  
  // Verify interaction sequence
  expect(mockInventory.reserve).toHaveBeenCalledBefore(mockPayment.charge);
  expect(mockPayment.charge).toHaveBeenCalledBefore(mockShipping.schedule);
});
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### E2E Tests Only
```bash
npm run test:e2e
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### London School TDD Analysis
```bash
npm run test:london-school
```

## Test Configuration

### Jest Configuration
- **Framework**: Jest with TypeScript support
- **Test Environment**: Node.js
- **Parallel Execution**: Optimized for test type
- **Coverage Thresholds**: 90% lines, 85% branches
- **Custom Sequencer**: TDD-optimized execution order

### London School Setup
- **Mock Utilities**: Comprehensive mock creation helpers
- **Contract Testing**: Interface verification tools
- **Interaction Verification**: Collaboration pattern testing
- **Behavior Analysis**: TDD compliance scoring

### Mock Strategy
- **External Dependencies**: Fully mocked (database, APIs, file system)
- **Internal Dependencies**: Mocked at unit level, real at integration
- **Test Doubles**: Dummies, fakes, stubs, spies, mocks

## Coverage Requirements

### Unit Tests
- **Line Coverage**: ≥ 90%
- **Branch Coverage**: ≥ 85%
- **Function Coverage**: ≥ 90%
- **Statement Coverage**: ≥ 90%

### Integration Tests
- **Path Coverage**: ≥ 80%
- **API Coverage**: ≥ 95%
- **Error Path Coverage**: ≥ 75%

### E2E Tests
- **User Journey Coverage**: ≥ 90%
- **CLI Command Coverage**: ≥ 95%
- **Workflow Coverage**: ≥ 85%

## London School TDD Compliance

The test suite includes automated analysis of London School TDD compliance:

### Scoring Criteria
- **Mock Usage** (30%): Tests should mock all dependencies
- **Behavior Testing** (25%): Focus on behavior, not state
- **Interaction Testing** (25%): Verify object collaborations
- **Contract Testing** (20%): Define clear interfaces
- **State Testing Penalty** (-10%): Discourage excessive state testing

### Compliance Levels
- **Excellent** (≥ 80 points): Outstanding London School practices
- **Good** (60-79 points): Solid practices, room for improvement
- **Needs Improvement** (< 60 points): Focus on mock-driven development

## Performance Optimization

### Test Execution Order
1. **Unit Tests First**: Fastest feedback loop
2. **Integration Tests Second**: Medium execution time
3. **E2E Tests Last**: Comprehensive but slowest

### Parallel Execution
- **Unit Tests**: Full parallelization
- **Integration Tests**: Limited parallelization
- **E2E Tests**: Sequential execution

### Caching Strategy
- **Test Results**: Cached for incremental runs
- **Mock Data**: Reused across similar tests
- **Execution Times**: Tracked for optimal ordering

## Best Practices

### London School TDD
1. **Mock All Dependencies**: Create isolated unit tests
2. **Verify Interactions**: Focus on object collaborations
3. **Define Contracts**: Use mocks to specify interfaces
4. **Behavior Over State**: Test what objects do, not what they are

### Test Structure
1. **Arrange**: Setup mocks and test data
2. **Act**: Execute the system under test
3. **Assert**: Verify interactions and behavior

### Mock Management
1. **Clear Mocks**: Reset between tests
2. **Verify Usage**: Ensure all mocks are exercised
3. **Contract Compliance**: Maintain interface consistency

### Continuous Improvement
1. **Monitor Compliance**: Track London School TDD scores
2. **Refactor Tests**: Improve mock usage and behavior testing
3. **Update Contracts**: Evolve interfaces based on real usage

## Troubleshooting

### Common Issues

#### Mock Not Called
```typescript
// Problem: Mock expectation not met
expect(mockService.method).toHaveBeenCalled();

// Solution: Verify the interaction actually happens
expect(mockService.method).toHaveBeenCalledWith(expectedArgs);
```

#### State vs Behavior Testing
```typescript
// Avoid: State testing
expect(service.property).toBe(expectedValue);

// Prefer: Behavior testing
expect(mockCollaborator.method).toHaveBeenCalledWith(expectedArgs);
```

#### Mock Coordination
```typescript
// Ensure mocks are properly coordinated
beforeEach(() => {
  jest.clearAllMocks();
  setupMockCollaboration();
});
```

### Debug Tools
- **Mock Inspector**: Analyze mock call patterns
- **Interaction Tracer**: Track object collaborations
- **TDD Compliance**: Monitor London School adherence

## Contributing

When adding new tests:

1. **Follow London School TDD**: Mock dependencies, verify behavior
2. **Use Test Patterns**: Leverage provided utilities and patterns
3. **Maintain Coverage**: Ensure high test coverage
4. **Document Contracts**: Clearly define mock interfaces
5. **Verify Compliance**: Run TDD analysis to ensure quality

For questions or improvements, refer to the [London School TDD guidelines](https://martinfowler.com/articles/mocksArentStubs.html) and our team standards.
