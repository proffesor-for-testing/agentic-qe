/**
 * Test Generator Agent
 * Generates comprehensive test cases based on requirements and code
 */

import { QEAgent, AgentContext, AgentExecutionResult } from '../base/QEAgent';
import { QEAgentConfig, TestStatus } from '../../types';
import { QEMemory } from '../../memory/QEMemory';
import { HookManager } from '../../hooks';
import { Logger } from '../../utils/Logger';

const logger = new Logger('TestGenerator');

export interface TestCase {
  id: string;
  name: string;
  description: string;
  type: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  priority: 'critical' | 'high' | 'medium' | 'low';
  preconditions: string[];
  steps: TestStep[];
  expectedResults: string[];
  testData: any;
  tags: string[];
}

export interface TestStep {
  action: string;
  input?: any;
  expectedOutput?: any;
  validation?: string;
}

export interface TestSuite {
  name: string;
  description: string;
  testCases: TestCase[];
  setupScript?: string;
  teardownScript?: string;
  metadata: {
    generated: string;
    agent: string;
    coverage: string[];
  };
}

export interface TestDataSet {
  valid: any[];
  invalid: any[];
  boundary: any[];
  edge: any[];
  performance: any[];
}

export class TestGenerator extends QEAgent {
  private generatedSuites: Map<string, TestSuite> = new Map();

  constructor(
    config: QEAgentConfig,
    memory: QEMemory,
    hooks: HookManager,
    logger?: Logger
  ) {
    super(
      {
        ...config,
        name: config.name || 'test-generator',
        type: 'test-analyzer',
        capabilities: [
          'test-generation',
          'test-analysis',
          'risk-assessment',
          'test-optimization',
          'coverage-analysis',
          'pattern-recognition',
          'bug-detection'
        ]
      },
      memory,
      hooks,
      logger
    );
  }

  /**
   * Generate test cases from requirements
   */
  public async generateFromRequirements(
    requirements: string[],
    context: AgentContext
  ): Promise<TestCase[]> {
    logger.info(`Generating tests from ${requirements.length} requirements`);

    const testCases: TestCase[] = [];

    for (const requirement of requirements) {
      const cases = await this.generateTestCasesForRequirement(requirement, context);
      testCases.push(...cases);
    }

    // Store generated tests
    await this.memory.store({
      key: `generated_tests_${Date.now()}`,
      value: testCases,
      type: 'test-data',
      sessionId: 'default-session',
      agentId: this.name,
      timestamp: new Date(),
      tags: ['generated', 'test-cases', 'requirements'],
      metadata: {
        agent: this.name,
        requirements: requirements.length,
        tests: testCases.length
      }
    });

    return testCases;
  }

  /**
   * Generate test data sets
   */
  public async generateTestData(
    schema: any,
    context: AgentContext
  ): Promise<TestDataSet> {
    logger.info('Generating test data sets');

    const testData: TestDataSet = {
      valid: [],
      invalid: [],
      boundary: [],
      edge: [],
      performance: []
    };

    // Generate valid data
    testData.valid = this.generateValidData(schema, 5);

    // Generate invalid data
    testData.invalid = this.generateInvalidData(schema, 5);

    // Generate boundary values
    testData.boundary = this.generateBoundaryData(schema);

    // Generate edge cases
    testData.edge = this.generateEdgeCases(schema);

    // Generate performance test data
    testData.performance = this.generatePerformanceData(schema, 100);

    return testData;
  }

  /**
   * Generate parameterized tests
   */
  public async generateParameterizedTests(
    functionSignature: string,
    context: AgentContext
  ): Promise<TestCase[]> {
    logger.info(`Generating parameterized tests for: ${functionSignature}`);

    const testCases: TestCase[] = [];

    // Parse function signature to understand parameters
    const parameters = this.parseFunctionSignature(functionSignature);

    // Generate test cases for different parameter combinations
    const combinations = this.generateParameterCombinations(parameters);

    for (const combo of combinations) {
      const testCase: TestCase = {
        id: `param_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `Test ${functionSignature} with ${JSON.stringify(combo)}`,
        description: 'Parameterized test case',
        type: 'unit',
        priority: 'medium',
        preconditions: [],
        steps: [
          {
            action: 'Call function',
            input: combo,
            validation: 'Assert expected output'
          }
        ],
        expectedResults: ['Function returns expected value'],
        testData: combo,
        tags: ['parameterized', 'unit']
      };

      testCases.push(testCase);
    }

    return testCases;
  }

  /**
   * Generate boundary value tests
   */
  public async generateBoundaryTests(
    inputRanges: any,
    context: AgentContext
  ): Promise<TestCase[]> {
    logger.info('Generating boundary value tests');

    const testCases: TestCase[] = [];

    for (const [field, range] of Object.entries(inputRanges)) {
      // Test minimum boundary
      testCases.push(this.createBoundaryTestCase(field, range, 'min'));

      // Test maximum boundary
      testCases.push(this.createBoundaryTestCase(field, range, 'max'));

      // Test just below minimum
      testCases.push(this.createBoundaryTestCase(field, range, 'below_min'));

      // Test just above maximum
      testCases.push(this.createBoundaryTestCase(field, range, 'above_max'));
    }

    return testCases;
  }

  /**
   * Generate property-based tests
   */
  public async generatePropertyTests(
    properties: string[],
    context: AgentContext
  ): Promise<TestCase[]> {
    logger.info('Generating property-based tests');

    const testCases: TestCase[] = [];

    for (const property of properties) {
      const testCase: TestCase = {
        id: `property_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `Property test: ${property}`,
        description: `Verify property: ${property}`,
        type: 'unit',
        priority: 'high',
        preconditions: ['System initialized'],
        steps: [
          {
            action: 'Generate random inputs',
            validation: 'Inputs are valid'
          },
          {
            action: 'Execute operation',
            validation: 'No exceptions'
          },
          {
            action: 'Verify property',
            validation: property
          }
        ],
        expectedResults: [`Property ${property} holds for all inputs`],
        testData: { property },
        tags: ['property-based', 'invariant']
      };

      testCases.push(testCase);
    }

    return testCases;
  }

  /**
   * Generate mutation tests
   */
  public async generateMutationTests(
    originalCode: string,
    context: AgentContext
  ): Promise<TestCase[]> {
    logger.info('Generating mutation tests');

    const mutations = [
      'Change == to !=',
      'Change > to <',
      'Change + to -',
      'Change && to ||',
      'Remove negation',
      'Change constant values'
    ];

    const testCases: TestCase[] = [];

    for (const mutation of mutations) {
      const testCase: TestCase = {
        id: `mutation_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `Mutation test: ${mutation}`,
        description: `Test should fail when: ${mutation}`,
        type: 'unit',
        priority: 'medium',
        preconditions: ['Original code passes tests'],
        steps: [
          {
            action: `Apply mutation: ${mutation}`,
            validation: 'Mutation applied successfully'
          },
          {
            action: 'Run test suite',
            validation: 'At least one test fails'
          }
        ],
        expectedResults: ['Mutation is detected by test suite'],
        testData: { mutation },
        tags: ['mutation', 'quality']
      };

      testCases.push(testCase);
    }

    return testCases;
  }

  /**
   * Main execution method implementation
   */
  protected async doExecute(context: AgentContext): Promise<AgentExecutionResult> {
    const task = (context.metadata?.task as string) || 'Generate comprehensive test suite';
    logger.info(`TestGenerator executing: ${task}`);
    const startTime = Date.now();

    try {
      const artifacts: string[] = [];
      let generatedData: any = {};
      let message = '';

      // Parse task to determine generation type
      if (task.includes('requirements')) {
        const requirements = this.extractRequirements(task);
        const tests = await this.generateFromRequirements(requirements, context);
        generatedData = { tests };
        message = `Generated ${tests.length} test cases from requirements`;
      } else if (task.includes('boundary')) {
        const ranges = { age: { min: 0, max: 120 }, score: { min: 0, max: 100 } };
        const tests = await this.generateBoundaryTests(ranges, context);
        generatedData = { tests };
        message = `Generated ${tests.length} boundary test cases`;
      } else if (task.includes('property')) {
        const properties = ['commutativity', 'associativity', 'idempotence'];
        const tests = await this.generatePropertyTests(properties, context);
        generatedData = { tests };
        message = `Generated ${tests.length} property-based tests`;
      } else if (task.includes('data')) {
        const schema = { type: 'object', properties: { id: { type: 'number' }, name: { type: 'string' } } };
        const data = await this.generateTestData(schema, context);
        generatedData = { data };
        message = `Generated test data sets: ${data.valid.length} valid, ${data.invalid.length} invalid`;
      } else {
        // Generate comprehensive test suite
        const suite = await this.generateComprehensiveTestSuite(task, context);
        generatedData = { suite };
        message = `Generated test suite with ${suite.testCases.length} test cases`;

        // Store suite as artifact
        const suitePath = `/tmp/test_suite_${Date.now()}.json`;
        artifacts.push(suitePath);
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        status: 'passed' as TestStatus,
        message,
        artifacts,
        metrics: {
          duration,
          testsGenerated: Array.isArray(generatedData.tests) ? generatedData.tests.length : 0
        },
        duration,
        metadata: {
          generationType: task.includes('requirements') ? 'requirements' :
                         task.includes('boundary') ? 'boundary' :
                         task.includes('property') ? 'property' :
                         task.includes('data') ? 'data' : 'comprehensive',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Generation failed:', error);
      const duration = Date.now() - startTime;
      return {
        success: false,
        status: 'failed' as TestStatus,
        message: `Test generation failed: ${error}`,
        error: error as Error,
        artifacts: [],
        metrics: {
          duration,
          testsGenerated: 0
        },
        duration,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Generate test cases for a single requirement
   */
  private async generateTestCasesForRequirement(
    requirement: string,
    context: AgentContext
  ): Promise<TestCase[]> {
    const testCases: TestCase[] = [];

    // Generate positive test case
    testCases.push({
      id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `Positive test for: ${requirement}`,
      description: `Verify requirement: ${requirement}`,
      type: 'integration',
      priority: 'high',
      preconditions: ['System is initialized'],
      steps: [
        {
          action: 'Setup test environment',
          validation: 'Environment ready'
        },
        {
          action: `Execute: ${requirement}`,
          validation: 'Operation successful'
        }
      ],
      expectedResults: ['Requirement is satisfied'],
      testData: {},
      tags: ['positive', 'requirement']
    });

    // Generate negative test case
    testCases.push({
      id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `Negative test for: ${requirement}`,
      description: `Test failure scenarios for: ${requirement}`,
      type: 'integration',
      priority: 'medium',
      preconditions: ['System is initialized'],
      steps: [
        {
          action: 'Setup invalid conditions',
          validation: 'Invalid state created'
        },
        {
          action: `Attempt: ${requirement}`,
          validation: 'Operation fails gracefully'
        }
      ],
      expectedResults: ['Appropriate error handling'],
      testData: {},
      tags: ['negative', 'error-handling']
    });

    return testCases;
  }

  /**
   * Generate comprehensive test suite
   */
  private async generateComprehensiveTestSuite(
    description: string,
    context: AgentContext
  ): Promise<TestSuite> {
    const testCases: TestCase[] = [];

    // Add various test types
    testCases.push(...await this.generateFromRequirements([description], context));
    testCases.push(...await this.generateBoundaryTests({ input: { min: 0, max: 100 } }, context));

    const suite: TestSuite = {
      name: `TestSuite_${Date.now()}`,
      description,
      testCases,
      setupScript: 'Initialize test environment',
      teardownScript: 'Cleanup test resources',
      metadata: {
        generated: new Date().toISOString(),
        agent: this.name,
        coverage: ['unit', 'integration', 'boundary']
      }
    };

    this.generatedSuites.set(suite.name, suite);
    return suite;
  }

  // Helper methods for data generation
  private generateValidData(schema: any, count: number): any[] {
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push({
        id: i + 1,
        name: `Valid_${i}`,
        value: Math.random() * 100
      });
    }
    return data;
  }

  private generateInvalidData(schema: any, count: number): any[] {
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push({
        id: null,
        name: '',
        value: NaN
      });
    }
    return data;
  }

  private generateBoundaryData(schema: any): any[] {
    return [
      { value: 0 },
      { value: -1 },
      { value: Number.MAX_SAFE_INTEGER },
      { value: Number.MIN_SAFE_INTEGER }
    ];
  }

  private generateEdgeCases(schema: any): any[] {
    return [
      null,
      undefined,
      {},
      [],
      '',
      'very_long_string'.repeat(1000)
    ];
  }

  private generatePerformanceData(schema: any, count: number): any[] {
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push({
        id: i,
        data: new Array(1000).fill(Math.random())
      });
    }
    return data;
  }

  private parseFunctionSignature(signature: string): any {
    // Simplified parsing
    return {
      name: 'function',
      params: ['param1', 'param2'],
      types: ['string', 'number']
    };
  }

  private generateParameterCombinations(parameters: any): any[] {
    // Generate various combinations
    return [
      { param1: 'test', param2: 1 },
      { param1: '', param2: 0 },
      { param1: null, param2: -1 }
    ];
  }

  private createBoundaryTestCase(field: string, range: any, type: string): TestCase {
    const values: any = {
      min: range.min,
      max: range.max,
      below_min: range.min - 1,
      above_max: range.max + 1
    };

    return {
      id: `boundary_${field}_${type}_${Date.now()}`,
      name: `Boundary test: ${field} ${type}`,
      description: `Test ${field} at ${type} boundary`,
      type: 'unit',
      priority: 'high',
      preconditions: [],
      steps: [
        {
          action: `Set ${field} to ${values[type]}`,
          input: values[type],
          validation: type.includes('min') || type.includes('max') ? 'Valid' : 'Invalid'
        }
      ],
      expectedResults: [type.includes('min') || type.includes('max') ? 'Accepted' : 'Rejected'],
      testData: { [field]: values[type] },
      tags: ['boundary', field]
    };
  }

  private extractRequirements(task: string): string[] {
    // Simple extraction logic
    const requirements = [];
    if (task.includes('authentication')) requirements.push('User authentication');
    if (task.includes('api')) requirements.push('API endpoint validation');
    if (task.includes('database')) requirements.push('Database operations');
    return requirements.length > 0 ? requirements : ['General functionality'];
  }
}