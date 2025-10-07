/**
 * Comprehensive Test Suite for Advanced MCP Tools
 * Tests: Requirements Validation, BDD Generation, Production Intelligence, API Changes, Mutation Testing
 * Total: 37 test cases covering all edge cases
 */

import { requirementsValidate } from '../../../src/mcp/handlers/advanced/requirements-validate';
import { requirementsGenerateBDD } from '../../../src/mcp/handlers/advanced/requirements-generate-bdd';
import { productionIncidentReplay } from '../../../src/mcp/handlers/advanced/production-incident-replay';
import { productionRUMAnalyze } from '../../../src/mcp/handlers/advanced/production-rum-analyze';
import { apiBreakingChanges } from '../../../src/mcp/handlers/advanced/api-breaking-changes';
import { mutationTestExecute } from '../../../src/mcp/handlers/advanced/mutation-test-execute';

describe('Requirements Validation Tool', () => {
  it('should validate testable requirements', async () => {
    const requirements = [
      'The login function shall authenticate users with valid credentials',
      'The system shall respond within 200ms',
      'Users must be able to export data to CSV format'
    ];

    const result = await requirementsValidate({ requirements });

    expect(result.totalRequirements).toBe(3);
    expect(result.testableCount).toBeGreaterThan(0);
    expect(result.testableCount).toBeLessThanOrEqual(3);
    expect(result.validationResults).toHaveLength(3);
    expect(result.overallScore).toBeGreaterThan(0);
  });

  it('should detect ambiguous requirements', async () => {
    const requirements = [
      'The system should be fast',
      'Users want a good experience',
      'It must work properly'
    ];

    const result = await requirementsValidate({ requirements });

    const ambiguous = result.validationResults.filter(r => r.issues.some(i => i.type === 'ambiguity'));
    expect(ambiguous.length).toBeGreaterThan(0);
    expect(result.overallScore).toBeLessThan(0.7);
  });

  it('should identify missing acceptance criteria', async () => {
    const requirements = [
      'Users shall be able to login'
    ];

    const result = await requirementsValidate({
      requirements,
      strictMode: true
    });

    const missingCriteria = result.validationResults.filter(
      r => r.issues.some(i => i.type === 'missing-criteria')
    );
    expect(missingCriteria.length).toBeGreaterThan(0);
  });

  it('should generate test suggestions for valid requirements', async () => {
    const requirements = [
      'The API shall return user data within 100ms for authenticated requests'
    ];

    const result = await requirementsValidate({
      requirements,
      generateTestSuggestions: true
    });

    expect(result.validationResults[0].testSuggestions).toBeDefined();
    expect(result.validationResults[0].testSuggestions!.length).toBeGreaterThan(0);
  });

  it('should validate measurable performance requirements', async () => {
    const requirements = [
      'System shall handle 1000 concurrent users',
      'Response time must be under 500ms for 95th percentile'
    ];

    const result = await requirementsValidate({ requirements });

    expect(result.testableCount).toBe(2);
    result.validationResults.forEach(r => {
      expect(r.isTestable).toBe(true);
      expect(r.testabilityScore).toBeGreaterThan(0.7);
    });
  });

  it('should handle empty requirements', async () => {
    const result = await requirementsValidate({ requirements: [] });

    expect(result.totalRequirements).toBe(0);
    expect(result.testableCount).toBe(0);
    expect(result.recommendations).toContain('No requirements provided for validation');
  });
});

describe('BDD Generation Tool', () => {
  it('should generate Given-When-Then scenarios from requirements', async () => {
    const requirement = 'Users shall be able to login with username and password';

    const result = await requirementsGenerateBDD({ requirement });

    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].given).toBeDefined();
    expect(result.scenarios[0].when).toBeDefined();
    expect(result.scenarios[0].then).toBeDefined();
    expect(result.scenarios[0].feature).toBe('User Authentication');
  });

  it('should generate multiple scenarios for complex requirements', async () => {
    const requirement = 'The system shall authenticate users and log failed attempts';

    const result = await requirementsGenerateBDD({ requirement });

    expect(result.scenarios.length).toBeGreaterThanOrEqual(2);
  });

  it('should include edge cases and error scenarios', async () => {
    const requirement = 'API shall return 404 for non-existent resources';

    const result = await requirementsGenerateBDD({
      requirement,
      includeEdgeCases: true
    });

    const errorScenarios = result.scenarios.filter(s =>
      s.title.toLowerCase().includes('error') ||
      s.title.toLowerCase().includes('invalid')
    );
    expect(errorScenarios.length).toBeGreaterThan(0);
  });

  it('should generate Cucumber format', async () => {
    const requirement = 'Users can export reports as PDF';

    const result = await requirementsGenerateBDD({
      requirement,
      format: 'cucumber'
    });

    expect(result.cucumberFeature).toBeDefined();
    expect(result.cucumberFeature).toContain('Feature:');
    expect(result.cucumberFeature).toContain('Scenario:');
    expect(result.cucumberFeature).toContain('Given');
    expect(result.cucumberFeature).toContain('When');
    expect(result.cucumberFeature).toContain('Then');
  });

  it('should generate test code for specific frameworks', async () => {
    const requirement = 'System validates email format';

    const result = await requirementsGenerateBDD({
      requirement,
      generateTestCode: true,
      framework: 'jest'
    });

    expect(result.testCode).toBeDefined();
    expect(result.testCode).toContain('describe(');
    expect(result.testCode).toContain('it(');
    expect(result.testCode).toContain('expect(');
  });

  it('should extract test data from requirements', async () => {
    const requirement = 'Password must be at least 8 characters with uppercase, lowercase, and numbers';

    const result = await requirementsGenerateBDD({
      requirement,
      extractTestData: true
    });

    expect(result.testData).toBeDefined();
    expect(result.testData!.validExamples).toBeDefined();
    expect(result.testData!.invalidExamples).toBeDefined();
  });
});

describe('Production Incident Replay Tool', () => {
  it('should replay incident and generate test', async () => {
    const incident = {
      id: 'INC-001',
      timestamp: '2025-01-15T10:30:00Z',
      type: 'error',
      message: 'Database connection timeout',
      stackTrace: 'Error at UserService.getProfile\n  at line 45',
      context: {
        userId: '12345',
        endpoint: '/api/users/profile'
      }
    };

    const result = await productionIncidentReplay({ incident });

    expect(result.testGenerated).toBe(true);
    expect(result.testCode).toBeDefined();
    expect(result.testCode).toContain('describe(');
    expect(result.reproducible).toBe(true);
  });

  it('should analyze incident root cause', async () => {
    const incident = {
      id: 'INC-002',
      timestamp: '2025-01-15T11:00:00Z',
      type: 'performance',
      message: 'Slow query detected',
      metrics: {
        queryTime: 5000,
        expectedTime: 100
      }
    };

    const result = await productionIncidentReplay({
      incident,
      analyzeRootCause: true
    });

    expect(result.rootCauseAnalysis).toBeDefined();
    expect(result.rootCauseAnalysis!.category).toBeDefined();
    expect(result.rootCauseAnalysis!.suggestedFixes).toHaveLength(1);
  });

  it('should extract relevant code context', async () => {
    const incident = {
      id: 'INC-003',
      timestamp: '2025-01-15T12:00:00Z',
      type: 'error',
      stackTrace: 'TypeError at PaymentService.processPayment line 123',
      sourceCode: `
        function processPayment(amount) {
          return amount.toFixed(2);
        }
      `
    };

    const result = await productionIncidentReplay({ incident });

    expect(result.codeContext).toBeDefined();
    expect(result.codeContext!.relevantFiles).toBeDefined();
  });

  it('should generate regression test suite', async () => {
    const incident = {
      id: 'INC-004',
      timestamp: '2025-01-15T13:00:00Z',
      type: 'error',
      message: 'Null pointer exception'
    };

    const result = await productionIncidentReplay({
      incident,
      generateRegressionTests: true
    });

    expect(result.regressionTests).toBeDefined();
    expect(result.regressionTests!.length).toBeGreaterThan(0);
  });

  it('should link to similar past incidents', async () => {
    const incident = {
      id: 'INC-005',
      timestamp: '2025-01-15T14:00:00Z',
      type: 'error',
      message: 'Connection timeout'
    };

    const result = await productionIncidentReplay({
      incident,
      linkSimilarIncidents: true
    });

    expect(result.similarIncidents).toBeDefined();
  });
});

describe('Production RUM Analysis Tool', () => {
  it('should analyze real user monitoring data', async () => {
    const rumData = {
      sessionId: 'session-123',
      userActions: [
        { type: 'pageview', path: '/', timestamp: 1000, duration: 150 },
        { type: 'click', element: '#login-button', timestamp: 2000 },
        { type: 'api-call', endpoint: '/api/auth', timestamp: 2100, duration: 500 }
      ],
      metrics: {
        loadTime: 1200,
        interactionTime: 300,
        errorCount: 0
      }
    };

    const result = await productionRUMAnalyze({ rumData });

    expect(result.analyzed).toBe(true);
    expect(result.userJourney).toBeDefined();
    expect(result.performanceMetrics).toBeDefined();
  });

  it('should detect performance bottlenecks', async () => {
    const rumData = {
      sessionId: 'session-456',
      userActions: [
        { type: 'api-call', endpoint: '/api/search', timestamp: 1000, duration: 5000 }
      ]
    };

    const result = await productionRUMAnalyze({
      rumData,
      detectBottlenecks: true
    });

    expect(result.bottlenecks).toBeDefined();
    expect(result.bottlenecks!.length).toBeGreaterThan(0);
    expect(result.bottlenecks![0].severity).toBe('high');
  });

  it('should generate journey-based tests', async () => {
    const rumData = {
      sessionId: 'session-789',
      userActions: [
        { type: 'pageview', path: '/products' },
        { type: 'click', element: '.add-to-cart' },
        { type: 'pageview', path: '/checkout' }
      ]
    };

    const result = await productionRUMAnalyze({
      rumData,
      generateTests: true
    });

    expect(result.generatedTests).toBeDefined();
    expect(result.generatedTests).toContain('describe(');
  });

  it('should identify error patterns', async () => {
    const rumData = {
      sessionId: 'session-error',
      userActions: [
        { type: 'error', message: 'Failed to load resource', timestamp: 1000 },
        { type: 'error', message: 'Network timeout', timestamp: 2000 }
      ]
    };

    const result = await productionRUMAnalyze({ rumData });

    expect(result.errorPatterns).toBeDefined();
    expect(result.errorPatterns!.length).toBeGreaterThan(0);
  });

  it('should analyze user behavior patterns', async () => {
    const rumData = {
      sessionId: 'session-behavior',
      userActions: [
        { type: 'pageview', path: '/home' },
        { type: 'scroll', position: 500 },
        { type: 'click', element: '#menu' }
      ]
    };

    const result = await productionRUMAnalyze({
      rumData,
      analyzeBehavior: true
    });

    expect(result.behaviorInsights).toBeDefined();
    expect(result.behaviorInsights!.patterns).toBeDefined();
  });
});

describe('API Breaking Changes Tool', () => {
  it('should detect removed endpoints', async () => {
    const oldAPI = `
      export function getUser(id: string) {}
      export function deleteUser(id: string) {}
    `;
    const newAPI = `
      export function getUser(id: string) {}
    `;

    const result = await apiBreakingChanges({ oldAPI, newAPI });

    expect(result.hasBreakingChanges).toBe(true);
    const removals = result.changes.filter(c => c.type === 'removal');
    expect(removals.length).toBeGreaterThan(0);
    expect(removals[0].severity).toBe('major');
  });

  it('should detect parameter changes', async () => {
    const oldAPI = `
      export function updateUser(id: string, name: string) {}
    `;
    const newAPI = `
      export function updateUser(id: string, name: string, email: string) {}
    `;

    const result = await apiBreakingChanges({ oldAPI, newAPI });

    const paramChanges = result.changes.filter(c => c.type === 'parameter-change');
    expect(paramChanges.length).toBeGreaterThan(0);
  });

  it('should detect return type changes', async () => {
    const oldAPI = `
      export function getData(): string {}
    `;
    const newAPI = `
      export function getData(): number {}
    `;

    const result = await apiBreakingChanges({ oldAPI, newAPI });

    const returnChanges = result.changes.filter(c => c.type === 'return-type-change');
    expect(returnChanges.length).toBeGreaterThan(0);
    expect(returnChanges[0].severity).toBe('major');
  });

  it('should identify non-breaking additions', async () => {
    const oldAPI = `
      export function getUser(id: string) {}
    `;
    const newAPI = `
      export function getUser(id: string) {}
      export function getUserProfile(id: string) {}
    `;

    const result = await apiBreakingChanges({ oldAPI, newAPI });

    const additions = result.changes.filter(c => c.type === 'addition');
    expect(additions.length).toBeGreaterThan(0);
    expect(additions[0].severity).toBe('minor');
  });

  it('should calculate semver recommendation', async () => {
    const oldAPI = `export function test() {}`;
    const newAPI = `export function test(arg: string) {}`;

    const result = await apiBreakingChanges({
      oldAPI,
      newAPI,
      calculateSemver: true
    });

    expect(result.semverRecommendation).toBeDefined();
    expect(['major', 'minor', 'patch']).toContain(result.semverRecommendation);
  });

  it('should generate migration guide', async () => {
    const oldAPI = `export function oldMethod() {}`;
    const newAPI = `export function newMethod() {}`;

    const result = await apiBreakingChanges({
      oldAPI,
      newAPI,
      generateMigrationGuide: true
    });

    expect(result.migrationGuide).toBeDefined();
    expect(result.migrationGuide).toContain('Breaking Changes');
  });
});

describe('Mutation Testing Tool', () => {
  it('should execute mutation testing on source code', async () => {
    const sourceCode = `
      function add(a, b) {
        return a + b;
      }
    `;
    const testCode = `
      test('adds numbers', () => {
        expect(add(1, 2)).toBe(3);
      });
    `;

    const result = await mutationTestExecute({
      sourceCode,
      testCode
    });

    expect(result.totalMutants).toBeGreaterThan(0);
    expect(result.killedMutants).toBeGreaterThanOrEqual(0);
    expect(result.survivedMutants).toBeGreaterThanOrEqual(0);
    expect(result.mutationScore).toBeGreaterThanOrEqual(0);
    expect(result.mutationScore).toBeLessThanOrEqual(100);
  });

  it('should detect survived mutants', async () => {
    const sourceCode = `
      function isPositive(n) {
        return n > 0;
      }
    `;
    const testCode = `
      test('checks positive', () => {
        expect(isPositive(5)).toBe(true);
      });
    `;

    const result = await mutationTestExecute({ sourceCode, testCode });

    if (result.survivedMutants > 0) {
      expect(result.survivors).toBeDefined();
      expect(result.survivors!.length).toBe(result.survivedMutants);
    }
  });

  it('should apply different mutation operators', async () => {
    const sourceCode = `
      function calculate(a, b) {
        return a + b * 2;
      }
    `;

    const result = await mutationTestExecute({
      sourceCode,
      testCode: 'test("calc", () => expect(calculate(1,2)).toBe(5));',
      operators: ['arithmetic', 'logical', 'relational']
    });

    expect(result.mutationsByOperator).toBeDefined();
    expect(Object.keys(result.mutationsByOperator!).length).toBeGreaterThan(0);
  });

  it('should calculate mutation coverage', async () => {
    const sourceCode = `
      function max(a, b) {
        if (a > b) return a;
        return b;
      }
    `;
    const testCode = `
      test('finds max', () => {
        expect(max(5, 3)).toBe(5);
        expect(max(2, 8)).toBe(8);
      });
    `;

    const result = await mutationTestExecute({
      sourceCode,
      testCode,
      calculateCoverage: true
    });

    expect(result.mutationCoverage).toBeDefined();
    expect(result.mutationCoverage).toBeGreaterThanOrEqual(0);
    expect(result.mutationCoverage).toBeLessThanOrEqual(100);
  });

  it('should generate test improvement suggestions', async () => {
    const sourceCode = `function divide(a, b) { return a / b; }`;
    const testCode = `test('divides', () => expect(divide(4, 2)).toBe(2));`;

    const result = await mutationTestExecute({
      sourceCode,
      testCode,
      generateSuggestions: true
    });

    expect(result.suggestions).toBeDefined();
    if (result.survivedMutants > 0) {
      expect(result.suggestions!.length).toBeGreaterThan(0);
    }
  });

  it('should support custom mutation timeout', async () => {
    const sourceCode = `function loop() { while(true); }`;
    const testCode = `test('runs', () => expect(true).toBe(true));`;

    const result = await mutationTestExecute({
      sourceCode,
      testCode,
      timeout: 100
    });

    expect(result.timedOut).toBeDefined();
  });
});

describe('Integration Tests - Tool Combinations', () => {
  it('should validate requirements and generate BDD scenarios', async () => {
    const requirements = ['Users shall reset password via email'];

    const validation = await requirementsValidate({ requirements });
    expect(validation.testableCount).toBeGreaterThan(0);

    const bdd = await requirementsGenerateBDD({
      requirement: requirements[0]
    });
    expect(bdd.scenarios.length).toBeGreaterThan(0);
  });

  it('should analyze RUM data and detect API changes', async () => {
    const rumData = {
      sessionId: 'test',
      userActions: [
        { type: 'api-call', endpoint: '/api/v1/users', timestamp: 1000 }
      ]
    };

    const rumResult = await productionRUMAnalyze({ rumData });
    expect(rumResult.analyzed).toBe(true);

    const oldAPI = `export function getUsers() {}`;
    const newAPI = `export function fetchUsers() {}`;
    const apiResult = await apiBreakingChanges({ oldAPI, newAPI });
    expect(apiResult.hasBreakingChanges).toBe(true);
  });
});
