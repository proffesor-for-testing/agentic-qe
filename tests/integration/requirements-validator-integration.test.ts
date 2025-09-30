/**
 * RequirementsValidatorAgent Integration Tests
 * Tests memory coordination, hook execution, BDD scenario generation, and integration with TestGeneratorAgent
 */

import { EventEmitter } from 'events';
import { MemoryManager } from '../../src/core/MemoryManager';
import { EventBus } from '../../src/core/EventBus';
import { Database } from '../../src/utils/Database';
import { Logger } from '../../src/utils/Logger';

// Mock external dependencies
jest.mock('../../src/utils/Database');
jest.mock('../../src/utils/Logger');

describe('RequirementsValidatorAgent Integration', () => {
  let eventBus: EventBus;
  let memoryManager: MemoryManager;
  let mockDatabase: jest.Mocked<Database>;
  let mockLogger: jest.Mocked<Logger>;

  // Test data
  const testRequirement = {
    id: 'REQ-123',
    title: 'User Login Functionality',
    description: 'Users should be able to log in with email and password',
    acceptanceCriteria: [
      'User enters valid credentials',
      'System validates credentials',
      'User is redirected to dashboard'
    ],
    priority: 'high',
    stakeholders: ['Product', 'Engineering', 'QA']
  };

  const ambiguousRequirement = {
    id: 'REQ-456',
    title: 'Fast Response Time',
    description: 'System should be fast',
    acceptanceCriteria: [],
    priority: 'medium',
    stakeholders: ['Product']
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Database
    mockDatabase = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
      get: jest.fn().mockResolvedValue(null),
      all: jest.fn().mockResolvedValue([])
    } as any;

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      getInstance: jest.fn().mockReturnValue(mockLogger)
    } as any;

    (Database as jest.Mock).mockImplementation(() => mockDatabase);
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    // Create real EventBus and MemoryManager for integration testing
    eventBus = new EventBus();
    await eventBus.initialize();

    memoryManager = new MemoryManager(mockDatabase);
    await memoryManager.initialize();
  });

  afterEach(async () => {
    if (eventBus) {
      eventBus.removeAllListeners();
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('Memory Coordination (aqe/requirements/*)', () => {
    it('should store validated requirements in shared memory', async () => {
      const validationResult = {
        requirementId: testRequirement.id,
        testabilityScore: 85,
        invest: {
          independent: true,
          negotiable: true,
          valuable: true,
          estimable: true,
          small: true,
          testable: true
        },
        issues: [],
        recommendations: [],
        timestamp: Date.now()
      };

      // Store in aqe/requirements namespace
      await memoryManager.store('validated', validationResult, {
        namespace: 'aqe/requirements',
        ttl: 3600000,
        persist: true
      });

      // Retrieve validation result
      const retrieved = await memoryManager.retrieve('validated', {
        namespace: 'aqe/requirements'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.requirementId).toBe(testRequirement.id);
      expect(retrieved.value.testabilityScore).toBe(85);
      expect(retrieved.value.invest.testable).toBe(true);
    });

    it('should store BDD scenarios in aqe/bdd-scenarios namespace', async () => {
      const bddScenarios = {
        requirementId: testRequirement.id,
        feature: 'User Authentication',
        scenarios: [
          {
            type: 'positive',
            title: 'Successful login with valid credentials',
            given: ['a registered user with valid credentials'],
            when: ['the user submits the login form'],
            then: ['the user is redirected to the dashboard']
          },
          {
            type: 'negative',
            title: 'Login fails with invalid password',
            given: ['a registered user', 'an incorrect password'],
            when: ['the user submits the login form'],
            then: ['an error message is displayed', 'the user remains on the login page']
          }
        ],
        timestamp: Date.now()
      };

      // Store BDD scenarios
      await memoryManager.store('generated', bddScenarios, {
        namespace: 'aqe/bdd-scenarios',
        ttl: 7200000
      });

      // Retrieve scenarios
      const retrieved = await memoryManager.retrieve('generated', {
        namespace: 'aqe/bdd-scenarios'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.scenarios).toHaveLength(2);
      expect(retrieved.value.scenarios[0].type).toBe('positive');
    });

    it('should store risk scores in aqe/risk-scores namespace', async () => {
      const riskScore = {
        requirementId: ambiguousRequirement.id,
        overallRisk: 72,
        factors: {
          ambiguity: 85,
          complexity: 60,
          dependencies: 40,
          testability: 30
        },
        mitigations: [
          'Define specific performance metrics',
          'Add measurable acceptance criteria'
        ],
        timestamp: Date.now()
      };

      // Store risk score
      await memoryManager.store('REQ-456', riskScore, {
        namespace: 'aqe/risk-scores',
        ttl: 3600000
      });

      // Retrieve risk score
      const retrieved = await memoryManager.retrieve('REQ-456', {
        namespace: 'aqe/risk-scores'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.overallRisk).toBe(72);
      expect(retrieved.value.factors.ambiguity).toBe(85);
    });

    it('should coordinate with TestGeneratorAgent via shared memory', async () => {
      // Validator stores validated requirements
      const validatedReq = {
        requirementId: testRequirement.id,
        testabilityScore: 90,
        scenarios: [
          {
            title: 'Successful login',
            given: 'valid credentials',
            when: 'user logs in',
            then: 'dashboard is displayed'
          }
        ]
      };

      await memoryManager.store('validated', validatedReq, {
        namespace: 'aqe/requirements'
      });

      // TestGenerator retrieves validated requirements
      const retrieved = await memoryManager.retrieve('validated', {
        namespace: 'aqe/requirements'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.testabilityScore).toBeGreaterThanOrEqual(80);
      expect(retrieved.value.scenarios).toHaveLength(1);

      // TestGenerator stores generated tests
      const generatedTests = {
        sourceRequirement: retrieved.value.requirementId,
        tests: [
          {
            name: 'should log in successfully with valid credentials',
            type: 'unit',
            framework: 'jest',
            code: 'test code here'
          }
        ]
      };

      await memoryManager.store('generated-tests', generatedTests, {
        namespace: 'aqe/test-generator'
      });

      const tests = await memoryManager.retrieve('generated-tests', {
        namespace: 'aqe/test-generator'
      });

      expect(tests).toBeDefined();
      expect(tests.value.sourceRequirement).toBe(testRequirement.id);
    });
  });

  describe('Hook Execution', () => {
    it('should execute pre-task hook and retrieve context from memory', async () => {
      // Setup: Store project context
      const projectContext = {
        projectName: 'E-commerce Platform',
        language: 'TypeScript',
        testFrameworks: ['jest', 'cypress'],
        coverageTarget: 0.90
      };

      await memoryManager.store('project-context', projectContext, {
        namespace: 'aqe'
      });

      // Simulate pre-task hook
      const hookStartTime = Date.now();

      // Pre-task: Retrieve context
      const context = await memoryManager.retrieve('project-context', {
        namespace: 'aqe'
      });

      expect(context).toBeDefined();
      expect(context.value.projectName).toBe('E-commerce Platform');
      expect(context.value.testFrameworks).toContain('jest');

      // Log hook execution
      expect(Date.now() - hookStartTime).toBeLessThan(100);
    });

    it('should execute post-task hook and store validation results', async () => {
      const taskId = 'task-validate-REQ-123';
      const validationResults = {
        requirementId: testRequirement.id,
        testabilityScore: 85,
        bddScenariosGenerated: 5,
        risksIdentified: 2,
        completionTime: 2340
      };

      // Post-task: Store results
      await memoryManager.store('validation-report', validationResults, {
        namespace: 'aqe/requirements',
        metadata: { taskId, completedAt: new Date().toISOString() }
      });

      // Verify storage
      const stored = await memoryManager.retrieve('validation-report', {
        namespace: 'aqe/requirements'
      });

      expect(stored).toBeDefined();
      expect(stored.value.testabilityScore).toBe(85);
      expect(stored.metadata?.taskId).toBe(taskId);
    });

    it('should execute post-edit hook when requirements are updated', async () => {
      const filePath = '/specs/requirements/REQ-123.md';
      const updatedRequirement = {
        ...testRequirement,
        description: 'Users should be able to log in with email and password. Session timeout after 30 minutes.',
        lastModified: new Date().toISOString()
      };

      // Post-edit: Store updated requirement
      await memoryManager.store('updated', updatedRequirement, {
        namespace: 'aqe/requirements',
        metadata: { filePath, action: 'edit' }
      });

      // Verify update stored
      const updated = await memoryManager.retrieve('updated', {
        namespace: 'aqe/requirements'
      });

      expect(updated).toBeDefined();
      expect(updated.value.description).toContain('Session timeout');
      expect(updated.metadata?.filePath).toBe(filePath);
    });
  });

  describe('BDD Scenario Generation End-to-End', () => {
    it('should generate comprehensive BDD scenarios from requirements', async () => {
      // Input: Well-defined requirement
      const requirement = {
        id: 'REQ-789',
        title: 'Password Reset Flow',
        description: 'Users can reset their password via email link',
        acceptanceCriteria: [
          'User requests password reset',
          'Email with reset link is sent',
          'Link expires after 1 hour',
          'User creates new password',
          'User can log in with new password'
        ]
      };

      // Simulate scenario generation
      const scenarios = {
        requirementId: requirement.id,
        feature: {
          title: 'Password Reset',
          description: 'As a user, I want to reset my password so that I can regain access to my account',
          background: [
            'Given the email service is available',
            'And the user database is accessible'
          ]
        },
        scenarios: [
          {
            title: 'Successful password reset',
            type: 'positive',
            steps: {
              given: ['a registered user with email "user@example.com"'],
              when: [
                'the user requests a password reset',
                'the user clicks the reset link in the email',
                'the user enters a new password "NewSecure123!"'
              ],
              then: [
                'the password is updated in the system',
                'the user can log in with the new password',
                'the reset link is invalidated'
              ]
            }
          },
          {
            title: 'Password reset link expires after 1 hour',
            type: 'negative',
            steps: {
              given: ['a user requested a password reset 61 minutes ago'],
              when: ['the user clicks the reset link'],
              then: [
                'an error message is displayed',
                'the link is marked as expired',
                'the user is prompted to request a new reset link'
              ]
            }
          },
          {
            title: 'Password reset with invalid email',
            type: 'negative',
            steps: {
              given: ['a non-registered email "nonexistent@example.com"'],
              when: ['a password reset is requested'],
              then: [
                'no email is sent',
                'a generic success message is displayed for security',
                'the attempt is logged for security monitoring'
              ]
            }
          }
        ],
        coverage: {
          positiveCases: 1,
          negativeCases: 2,
          boundaryCases: 1,
          totalScenarios: 3
        },
        timestamp: Date.now()
      };

      // Store scenarios
      await memoryManager.store('generated', scenarios, {
        namespace: 'aqe/bdd-scenarios',
        persist: true
      });

      // Verify generation
      const stored = await memoryManager.retrieve('generated', {
        namespace: 'aqe/bdd-scenarios'
      });

      expect(stored).toBeDefined();
      expect(stored.value.scenarios).toHaveLength(3);
      expect(stored.value.coverage.positiveCases).toBe(1);
      expect(stored.value.coverage.negativeCases).toBe(2);
      expect(stored.value.scenarios[0].type).toBe('positive');
      expect(stored.value.scenarios[1].type).toBe('negative');
    });

    it('should identify missing acceptance criteria', async () => {
      const incompleteRequirement = {
        id: 'REQ-999',
        title: 'Data Export Feature',
        description: 'Users can export their data',
        acceptanceCriteria: [] // Empty!
      };

      // Analyze testability
      const analysis = {
        requirementId: incompleteRequirement.id,
        testabilityScore: 25, // Low score
        invest: {
          independent: true,
          negotiable: true,
          valuable: true,
          estimable: false, // Missing criteria makes it hard to estimate
          small: true,
          testable: false // Cannot test without criteria
        },
        issues: [
          'No acceptance criteria defined',
          'Ambiguous success conditions',
          'Missing data format specification',
          'No error handling defined'
        ],
        recommendations: [
          'Define: User can export data in CSV, JSON, or XML format',
          'Specify: Export includes all user data types (profile, transactions, settings)',
          'Add: Export completes within 30 seconds for up to 10,000 records',
          'Define: Error handling for large datasets or system failures'
        ],
        canGenerateBDD: false,
        timestamp: Date.now()
      };

      // Store analysis
      await memoryManager.store('analysis', analysis, {
        namespace: 'aqe/requirements'
      });

      // Verify analysis stored
      const stored = await memoryManager.retrieve('analysis', {
        namespace: 'aqe/requirements'
      });

      expect(stored).toBeDefined();
      expect(stored.value.testabilityScore).toBeLessThan(50);
      expect(stored.value.invest.testable).toBe(false);
      expect(stored.value.issues).toHaveLength(4);
      expect(stored.value.canGenerateBDD).toBe(false);
    });
  });

  describe('Integration with TestGeneratorAgent', () => {
    it('should pass validated requirements to TestGeneratorAgent for test creation', async () => {
      // Step 1: RequirementsValidator validates and generates scenarios
      const validatedReq = {
        requirementId: 'REQ-555',
        testabilityScore: 92,
        scenarios: [
          {
            title: 'User can add items to cart',
            given: 'a logged-in user viewing product catalog',
            when: 'user clicks "Add to Cart" button',
            then: 'item is added to cart and cart count increases'
          },
          {
            title: 'Cart persists across sessions',
            given: 'a user with items in cart',
            when: 'user logs out and logs back in',
            then: 'cart still contains the same items'
          }
        ],
        acceptanceCriteria: [
          'Items can be added to cart',
          'Cart persists across sessions',
          'Cart updates in real-time'
        ]
      };

      await memoryManager.store('REQ-555-validated', validatedReq, {
        namespace: 'aqe/requirements'
      });

      // Emit event for TestGeneratorAgent
      const eventId = await eventBus.emitFleetEvent(
        'requirements.validated',
        'requirements-validator',
        {
          requirementId: 'REQ-555',
          testabilityScore: 92,
          scenariosAvailable: true
        },
        'test-generator'
      );

      expect(eventId).toBeDefined();

      // Step 2: TestGeneratorAgent receives event and retrieves scenarios
      let testGeneratorReceived = false;
      const eventPromise = new Promise<void>((resolve) => {
        eventBus.once('requirements.validated', async (event) => {
          testGeneratorReceived = true;

          // Retrieve validated requirements
          const reqData = await memoryManager.retrieve('REQ-555-validated', {
            namespace: 'aqe/requirements'
          });

          expect(reqData).toBeDefined();
          expect(reqData.value.scenarios).toHaveLength(2);

          // Generate tests from scenarios
          const generatedTests = {
            requirementId: reqData.value.requirementId,
            tests: reqData.value.scenarios.map((scenario: any, index: number) => ({
              id: `TEST-${reqData.value.requirementId}-${index}`,
              name: scenario.title,
              type: 'integration',
              framework: 'cypress',
              scenario: scenario,
              code: `// Generated test for: ${scenario.title}\n// Implementation...`
            }))
          };

          // Store generated tests
          await memoryManager.store('REQ-555-tests', generatedTests, {
            namespace: 'aqe/test-generator'
          });

          resolve();
        });
      });

      await Promise.race([
        eventPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Event timeout')), 1000))
      ]);

      expect(testGeneratorReceived).toBe(true);

      // Verify tests were generated
      const tests = await memoryManager.retrieve('REQ-555-tests', {
        namespace: 'aqe/test-generator'
      });

      expect(tests).toBeDefined();
      expect(tests.value.tests).toHaveLength(2);
      expect(tests.value.tests[0].framework).toBe('cypress');
    });

    it('should coordinate complete requirements-to-tests workflow', async () => {
      const workflowEvents: string[] = [];

      // Listen for all workflow events
      eventBus.on('workflow.step', (event) => {
        workflowEvents.push(event.data.step);
      });

      // Step 1: Requirement submitted
      await eventBus.emitFleetEvent('workflow.step', 'system', {
        step: 'requirement-submitted'
      });

      const requirement = {
        id: 'REQ-WORKFLOW-1',
        title: 'Search Functionality',
        description: 'Users can search products by name, category, or price range'
      };

      await memoryManager.store('REQ-WORKFLOW-1', requirement, {
        namespace: 'aqe/requirements/raw'
      });

      // Step 2: Validation
      await eventBus.emitFleetEvent('workflow.step', 'requirements-validator', {
        step: 'validation-started'
      });

      const validation = {
        requirementId: requirement.id,
        testabilityScore: 88,
        validated: true
      };

      await memoryManager.store('REQ-WORKFLOW-1-validated', validation, {
        namespace: 'aqe/requirements'
      });

      await eventBus.emitFleetEvent('workflow.step', 'requirements-validator', {
        step: 'validation-completed'
      });

      // Step 3: BDD generation
      await eventBus.emitFleetEvent('workflow.step', 'requirements-validator', {
        step: 'bdd-generation-started'
      });

      const scenarios = {
        requirementId: requirement.id,
        scenarios: [
          { title: 'Search by product name' },
          { title: 'Search by category' },
          { title: 'Search by price range' }
        ]
      };

      await memoryManager.store('REQ-WORKFLOW-1-scenarios', scenarios, {
        namespace: 'aqe/bdd-scenarios'
      });

      await eventBus.emitFleetEvent('workflow.step', 'requirements-validator', {
        step: 'bdd-generation-completed'
      });

      // Step 4: Test generation
      await eventBus.emitFleetEvent('workflow.step', 'test-generator', {
        step: 'test-generation-started'
      });

      const tests = {
        requirementId: requirement.id,
        tests: scenarios.scenarios.map((s: any) => ({
          name: s.title,
          type: 'e2e'
        }))
      };

      await memoryManager.store('REQ-WORKFLOW-1-tests', tests, {
        namespace: 'aqe/test-generator'
      });

      await eventBus.emitFleetEvent('workflow.step', 'test-generator', {
        step: 'test-generation-completed'
      });

      // Verify complete workflow
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(workflowEvents).toContain('requirement-submitted');
      expect(workflowEvents).toContain('validation-started');
      expect(workflowEvents).toContain('validation-completed');
      expect(workflowEvents).toContain('bdd-generation-started');
      expect(workflowEvents).toContain('bdd-generation-completed');
      expect(workflowEvents).toContain('test-generation-started');
      expect(workflowEvents).toContain('test-generation-completed');

      // Verify all artifacts exist in memory
      const rawReq = await memoryManager.retrieve('REQ-WORKFLOW-1', {
        namespace: 'aqe/requirements/raw'
      });
      const validatedReq = await memoryManager.retrieve('REQ-WORKFLOW-1-validated', {
        namespace: 'aqe/requirements'
      });
      const bddScenarios = await memoryManager.retrieve('REQ-WORKFLOW-1-scenarios', {
        namespace: 'aqe/bdd-scenarios'
      });
      const generatedTests = await memoryManager.retrieve('REQ-WORKFLOW-1-tests', {
        namespace: 'aqe/test-generator'
      });

      expect(rawReq).toBeDefined();
      expect(validatedReq).toBeDefined();
      expect(bddScenarios).toBeDefined();
      expect(generatedTests).toBeDefined();
    });
  });

  describe('Event Bus Communication', () => {
    it('should emit requirements.validated event', async () => {
      let eventReceived = false;
      const eventData = {
        requirementId: 'REQ-EVENT-1',
        testabilityScore: 85,
        scenarios: 5
      };

      const eventPromise = new Promise<void>((resolve) => {
        eventBus.once('requirements.validated', (event) => {
          eventReceived = true;
          expect(event.data.requirementId).toBe(eventData.requirementId);
          expect(event.data.testabilityScore).toBe(85);
          resolve();
        });
      });

      await eventBus.emitFleetEvent(
        'requirements.validated',
        'requirements-validator',
        eventData
      );

      await Promise.race([
        eventPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Event timeout')), 500))
      ]);

      expect(eventReceived).toBe(true);
    });

    it('should emit requirements.issues-found event for problematic requirements', async () => {
      const issues = {
        requirementId: 'REQ-BAD',
        testabilityScore: 15,
        issues: [
          'Ambiguous terminology',
          'No acceptance criteria',
          'Conflicting dependencies'
        ],
        blocking: true
      };

      let issuesReceived = false;
      const eventPromise = new Promise<void>((resolve) => {
        eventBus.once('requirements.issues-found', (event) => {
          issuesReceived = true;
          expect(event.data.blocking).toBe(true);
          expect(event.data.issues).toHaveLength(3);
          resolve();
        });
      });

      await eventBus.emitFleetEvent(
        'requirements.issues-found',
        'requirements-validator',
        issues
      );

      await Promise.race([
        eventPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Event timeout')), 500))
      ]);

      expect(issuesReceived).toBe(true);
    });

    it('should handle multiple concurrent validation events', async () => {
      const eventCount = 5;
      const receivedEvents: any[] = [];

      const eventPromise = new Promise<void>((resolve) => {
        let count = 0;
        eventBus.on('requirements.validated', (event) => {
          receivedEvents.push(event);
          count++;
          if (count === eventCount) {
            resolve();
          }
        });
      });

      // Emit multiple events concurrently
      const emissions = Array.from({ length: eventCount }, (_, i) =>
        eventBus.emitFleetEvent('requirements.validated', 'requirements-validator', {
          requirementId: `REQ-${i}`,
          testabilityScore: 80 + i
        })
      );

      await Promise.all(emissions);

      await Promise.race([
        eventPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Event timeout')), 1000))
      ]);

      expect(receivedEvents).toHaveLength(eventCount);
    });
  });
});