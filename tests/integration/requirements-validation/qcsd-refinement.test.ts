/**
 * QCSD Refinement Swarm Integration Tests
 *
 * Verifies the complete refinement pipeline:
 * 1. SFDIPOT product factor analysis (7 factors, 37 subcategories)
 * 2. BDD scenario generation (Given/When/Then)
 * 3. INVEST requirements validation
 * 4. Contract validation (conditional - HAS_API)
 * 5. Impact analysis (conditional - HAS_REFACTORING)
 * 6. Dependency mapping (conditional - HAS_DEPENDENCIES)
 * 7. Test idea rewriting (transformation)
 * 8. Cross-phase signal consumption
 * 9. Workflow orchestrator integration
 * 10. Error handling
 *
 * These tests use mock memory to ensure deterministic behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QCSDRefinementPlugin,
  SFDIPOTAssessment,
  BDDScenarioSet,
  RefinementReport,
} from '../../../src/domains/requirements-validation/qcsd-refinement-plugin';
import {
  WorkflowOrchestrator,
  WorkflowDefinition,
} from '../../../src/coordination/workflow-orchestrator';
import { InMemoryEventBus } from '../../../src/kernel/event-bus';
import { DefaultAgentCoordinator } from '../../../src/kernel/agent-coordinator';
import { MemoryBackend, StoreOptions, EventBus, AgentCoordinator } from '../../../src/kernel/interfaces';
import { DomainName } from '../../../src/shared/types';

// ============================================================================
// Mock Memory Backend
// ============================================================================

function createMockMemory(): MemoryBackend {
  const store = new Map<string, unknown>();

  return {
    async initialize() {},
    async dispose() {},
    async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
      store.set(key, value);
    },
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async delete(key: string): Promise<boolean> {
      return store.delete(key);
    },
    async has(key: string): Promise<boolean> {
      return store.has(key);
    },
    async search(pattern: string, _limit?: number): Promise<string[]> {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(store.keys()).filter((k) => regex.test(k));
    },
    async vectorSearch(_embedding: number[], _k: number): Promise<[]> {
      return [];
    },
    async storeVector(
      _key: string,
      _embedding: number[],
      _metadata?: unknown
    ): Promise<void> {},
  };
}

// ============================================================================
// Test Workflow Definitions
// ============================================================================

function createSFDIPOTTestWorkflow(): WorkflowDefinition {
  return {
    id: 'sfdipot-test',
    name: 'SFDIPOT Analysis Test Workflow',
    description: 'Test workflow for SFDIPOT product factor analysis',
    version: '1.0.0',
    steps: [
      {
        id: 'analyze-sfdipot',
        name: 'Analyze SFDIPOT Factors',
        domain: 'requirements-validation' as DomainName,
        action: 'analyzeSFDIPOT',
        inputMapping: {
          targetId: 'input.targetId',
          description: 'input.description',
          acceptanceCriteria: 'input.acceptanceCriteria',
        },
      },
    ],
  };
}

function createBDDTestWorkflow(): WorkflowDefinition {
  return {
    id: 'bdd-test',
    name: 'BDD Generation Test Workflow',
    description: 'Test workflow for BDD scenario generation',
    version: '1.0.0',
    steps: [
      {
        id: 'generate-bdd',
        name: 'Generate BDD Scenarios',
        domain: 'requirements-validation' as DomainName,
        action: 'generateBDDScenarios',
        inputMapping: {
          targetId: 'input.targetId',
          description: 'input.description',
          acceptanceCriteria: 'input.acceptanceCriteria',
        },
      },
    ],
  };
}

function createRequirementsTestWorkflow(): WorkflowDefinition {
  return {
    id: 'requirements-test',
    name: 'Requirements Validation Test Workflow',
    description: 'Test workflow for INVEST requirements validation',
    version: '1.0.0',
    steps: [
      {
        id: 'validate-requirements',
        name: 'Validate Requirements',
        domain: 'requirements-validation' as DomainName,
        action: 'validateRefinementRequirements',
        inputMapping: {
          targetId: 'input.targetId',
          description: 'input.description',
          acceptanceCriteria: 'input.acceptanceCriteria',
        },
      },
    ],
  };
}

function createCrossPhaseTestWorkflow(): WorkflowDefinition {
  return {
    id: 'cross-phase-test',
    name: 'Cross-Phase Signals Test Workflow',
    description: 'Test workflow for cross-phase signal consumption',
    version: '1.0.0',
    steps: [
      {
        id: 'consume-signals',
        name: 'Consume Cross-Phase Signals',
        domain: 'requirements-validation' as DomainName,
        action: 'consumeCrossPhaseSignals',
        inputMapping: {
          targetId: 'input.targetId',
        },
      },
    ],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('QCSD Refinement Swarm Integration', () => {
  let memory: MemoryBackend;
  let eventBus: EventBus;
  let agentCoordinator: AgentCoordinator;
  let orchestrator: WorkflowOrchestrator;
  let plugin: QCSDRefinementPlugin;

  beforeEach(async () => {
    memory = createMockMemory();
    eventBus = new InMemoryEventBus();
    agentCoordinator = new DefaultAgentCoordinator();
    orchestrator = new WorkflowOrchestrator(eventBus, memory, agentCoordinator, {
      maxConcurrentWorkflows: 10,
      defaultStepTimeout: 60000,
      defaultWorkflowTimeout: 600000,
      enableEventTriggers: false,
      persistExecutions: false,
    });

    plugin = new QCSDRefinementPlugin(memory);
    await plugin.initialize();
    await orchestrator.initialize();
    plugin.registerWorkflowActions(orchestrator);

    // Register test workflows
    orchestrator.registerWorkflow(createSFDIPOTTestWorkflow());
    orchestrator.registerWorkflow(createBDDTestWorkflow());
    orchestrator.registerWorkflow(createRequirementsTestWorkflow());
    orchestrator.registerWorkflow(createCrossPhaseTestWorkflow());
  });

  afterEach(async () => {
    await orchestrator.dispose();
    await plugin.dispose();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Action Registration Tests
  // ============================================================================

  describe('action registration', () => {
    const expectedActions: Array<{ domain: DomainName; action: string }> = [
      { domain: 'requirements-validation' as DomainName, action: 'analyzeSFDIPOT' },
      { domain: 'requirements-validation' as DomainName, action: 'generateBDDScenarios' },
      { domain: 'requirements-validation' as DomainName, action: 'validateRefinementRequirements' },
      { domain: 'requirements-validation' as DomainName, action: 'generateRefinementReport' },
      { domain: 'requirements-validation' as DomainName, action: 'consumeCrossPhaseSignals' },
      { domain: 'code-intelligence' as DomainName, action: 'mapDependencies' },
      { domain: 'code-intelligence' as DomainName, action: 'analyzeImpact' },
      { domain: 'contract-testing' as DomainName, action: 'validateContracts' },
      { domain: 'test-generation' as DomainName, action: 'rewriteTestIdeas' },
      { domain: 'learning-optimization' as DomainName, action: 'storeRefinementLearnings' },
    ];

    for (const { domain, action } of expectedActions) {
      it(`should have ${domain}/${action} action registered`, () => {
        const isRegistered = orchestrator.isActionRegistered(domain, action);
        expect(isRegistered).toBe(true);
      });
    }

    it('should list all refinement actions for requirements-validation domain', () => {
      const actions = orchestrator.getRegisteredActions('requirements-validation' as DomainName);
      expect(actions).toContain('analyzeSFDIPOT');
      expect(actions).toContain('generateBDDScenarios');
      expect(actions).toContain('validateRefinementRequirements');
      expect(actions).toContain('generateRefinementReport');
      expect(actions).toContain('consumeCrossPhaseSignals');
    });

    it('should register actions in code-intelligence domain', () => {
      const actions = orchestrator.getRegisteredActions('code-intelligence' as DomainName);
      expect(actions).toContain('mapDependencies');
      expect(actions).toContain('analyzeImpact');
    });

    it('should register actions in contract-testing domain', () => {
      const actions = orchestrator.getRegisteredActions('contract-testing' as DomainName);
      expect(actions).toContain('validateContracts');
    });

    it('should register actions in test-generation domain', () => {
      const actions = orchestrator.getRegisteredActions('test-generation' as DomainName);
      expect(actions).toContain('rewriteTestIdeas');
    });
  });

  // ============================================================================
  // SFDIPOT Analysis Tests
  // ============================================================================

  describe('SFDIPOT analysis via workflow execution', () => {
    it('should analyze all 7 SFDIPOT factors for a story', async () => {
      const result = await orchestrator.executeWorkflow('sfdipot-test', {
        targetId: 'STORY-001',
        description: 'Build a REST API endpoint for user authentication with OAuth2 support. The API should integrate with existing database layer and support horizontal scaling.',
        acceptanceCriteria: [
          'Given a valid OAuth2 token, when the user requests /api/auth/profile, then return user profile data',
          'Given an expired token, when the user makes any API request, then return 401 Unauthorized',
          'Given concurrent requests, when load exceeds 1000 RPS, then response time stays under 200ms',
        ],
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      const stepResult = status?.stepResults?.get('analyze-sfdipot');
      expect(stepResult).toBeDefined();
      expect(stepResult?.status).toBe('completed');

      const assessment = stepResult?.output as SFDIPOTAssessment;
      expect(assessment.factors).toBeDefined();
      expect(assessment.factors.length).toBe(7);
      expect(assessment.overallScore).toBeGreaterThanOrEqual(0);
      expect(assessment.overallScore).toBeLessThanOrEqual(100);

      // Verify all 7 factors are present
      const factorNames = assessment.factors.map(f => f.factor);
      expect(factorNames).toContain('structure');
      expect(factorNames).toContain('function');
      expect(factorNames).toContain('data');
      expect(factorNames).toContain('interfaces');
      expect(factorNames).toContain('platform');
      expect(factorNames).toContain('operations');
      expect(factorNames).toContain('time');
    });

    it('should detect high relevance for API-related factors', async () => {
      const result = await orchestrator.executeWorkflow('sfdipot-test', {
        targetId: 'STORY-002',
        description: 'Create REST API endpoint with GraphQL integration and webhook notifications for downstream services',
        acceptanceCriteria: ['API returns JSON responses', 'Webhooks fire within 5 seconds'],
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      const stepResult = status?.stepResults?.get('analyze-sfdipot');
      const assessment = stepResult?.output as SFDIPOTAssessment;

      // Interfaces factor should have high weight due to API/GraphQL/webhook keywords
      const interfacesFactor = assessment.factors.find(f => f.factor === 'interfaces');
      expect(interfacesFactor).toBeDefined();
      expect(interfacesFactor!.weight).toBeGreaterThanOrEqual(5);
    });

    it('should store SFDIPOT results in memory', async () => {
      const result = await orchestrator.executeWorkflow('sfdipot-test', {
        targetId: 'STORY-MEM-001',
        description: 'Simple feature with data processing',
        acceptanceCriteria: ['Data is processed correctly'],
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      // Verify data stored in memory
      const stored = await memory.get<unknown>('qcsd-refinement:sfdipot:STORY-MEM-001');
      expect(stored).toBeDefined();
    });
  });

  // ============================================================================
  // BDD Generation Tests
  // ============================================================================

  describe('BDD scenario generation via workflow execution', () => {
    it('should generate BDD scenarios from story description', async () => {
      const result = await orchestrator.executeWorkflow('bdd-test', {
        targetId: 'STORY-BDD-001',
        description: 'User login with email and password authentication',
        acceptanceCriteria: [
          'Given a registered user, when they enter valid credentials, then they are logged in',
          'Given invalid credentials, when login is attempted, then show error message',
        ],
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      const stepResult = status?.stepResults?.get('generate-bdd');
      expect(stepResult).toBeDefined();
      expect(stepResult?.status).toBe('completed');

      const scenarios = stepResult?.output as BDDScenarioSet;
      expect(scenarios.features).toBeDefined();
      expect(scenarios.features.length).toBeGreaterThan(0);
      expect(scenarios.totalScenarios).toBeGreaterThan(0);

      // Verify coverage breakdown exists
      expect(scenarios.coverage).toBeDefined();
      expect(scenarios.coverage.happyPath).toBeGreaterThanOrEqual(0);
    });

    it('should generate scenarios covering multiple types', async () => {
      const result = await orchestrator.executeWorkflow('bdd-test', {
        targetId: 'STORY-BDD-002',
        description: 'Payment processing with credit card validation and error handling for expired cards and security fraud detection',
        acceptanceCriteria: [
          'Given a valid credit card, when payment is submitted, then charge is processed',
          'Given an expired card, when payment is attempted, then show expiry error',
          'Given a fraudulent transaction, when detected, then block and notify security team',
        ],
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      const stepResult = status?.stepResults?.get('generate-bdd');
      const scenarios = stepResult?.output as BDDScenarioSet;

      // Should have scenarios of multiple types
      const allScenarios = scenarios.features.flatMap(f => f.scenarios);
      const types = new Set(allScenarios.map(s => s.type));
      expect(types.size).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // Requirements Validation Tests
  // ============================================================================

  describe('requirements validation via workflow execution', () => {
    it('should validate requirements with INVEST criteria', async () => {
      const result = await orchestrator.executeWorkflow('requirements-test', {
        targetId: 'STORY-REQ-001',
        description: 'As a user, I want to reset my password so that I can regain access to my account',
        acceptanceCriteria: [
          'Given a registered email, when reset is requested, then send reset link',
          'Given a valid reset token, when new password is set, then update credentials',
          'Given an expired token, when reset is attempted, then show expiry message',
        ],
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      const stepResult = status?.stepResults?.get('validate-requirements');
      expect(stepResult).toBeDefined();
      expect(stepResult?.status).toBe('completed');

      const validation = stepResult?.output as { valid: boolean; investScore: number; completeness: number; gaps: string[]; suggestions: string[] };
      expect(validation.investScore).toBeGreaterThanOrEqual(0);
      expect(validation.investScore).toBeLessThanOrEqual(100);
      expect(validation.completeness).toBeGreaterThanOrEqual(0);
      expect(validation.completeness).toBeLessThanOrEqual(100);
      expect(Array.isArray(validation.gaps)).toBe(true);
    });

    it('should identify gaps in incomplete requirements', async () => {
      const result = await orchestrator.executeWorkflow('requirements-test', {
        targetId: 'STORY-REQ-002',
        description: 'Make things better',
        acceptanceCriteria: [],
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      const stepResult = status?.stepResults?.get('validate-requirements');
      const validation = stepResult?.output as { valid: boolean; investScore: number; completeness: number; gaps: string[]; suggestions: string[] };

      // Incomplete requirements should have gaps
      expect(validation.gaps.length).toBeGreaterThan(0);
      expect(validation.completeness).toBeLessThan(80);
    });
  });

  // ============================================================================
  // Cross-Phase Signal Tests
  // ============================================================================

  describe('cross-phase signal consumption', () => {
    it('should consume tactical signals from memory', async () => {
      // Pre-populate memory with cross-phase signals
      await memory.set('cross-phase:tactical:defect-pattern-001', {
        factor: 'interfaces',
        pattern: 'API timeout errors',
        weight: 0.8,
      });

      await memory.set('cross-phase:quality-criteria:testability-issue-001', {
        pattern: 'Untestable async workflows',
        recommendation: 'Add explicit wait conditions',
      });

      const result = await orchestrator.executeWorkflow('cross-phase-test', {
        targetId: 'STORY-XP-001',
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      const stepResult = status?.stepResults?.get('consume-signals');
      expect(stepResult).toBeDefined();
      expect(stepResult?.status).toBe('completed');

      const signals = stepResult?.output as { tacticalSignals: unknown[]; qualitySignals: unknown[]; insights: string[] };
      expect(signals).toBeDefined();
      expect(Array.isArray(signals.insights)).toBe(true);
    });

    it('should handle empty cross-phase signals gracefully', async () => {
      const result = await orchestrator.executeWorkflow('cross-phase-test', {
        targetId: 'STORY-XP-002',
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      const stepResult = status?.stepResults?.get('consume-signals');
      const signals = stepResult?.output as { tacticalSignals: unknown[]; qualitySignals: unknown[]; insights: string[] };
      expect(signals.tacticalSignals).toEqual([]);
      expect(signals.qualitySignals).toEqual([]);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should handle missing targetId gracefully', async () => {
      const result = await orchestrator.executeWorkflow('sfdipot-test', {
        description: 'A story without targetId',
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      // Should still complete (using fallback ID)
      expect(status?.status).toBe('completed');
    });

    it('should handle empty description gracefully', async () => {
      const result = await orchestrator.executeWorkflow('bdd-test', {
        targetId: 'STORY-ERR-001',
        description: '',
        acceptanceCriteria: [],
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      // Should generate minimal scenarios even with empty input
      const stepResult = status?.stepResults?.get('generate-bdd');
      const scenarios = stepResult?.output as BDDScenarioSet;
      expect(scenarios.features).toBeDefined();
    });
  });
});

// ============================================================================
// Plugin Lifecycle Tests
// ============================================================================

describe('QCSD Refinement Plugin Lifecycle', () => {
  it('should throw if registerWorkflowActions called before initialize', async () => {
    const memory = createMockMemory();
    const eventBus = new InMemoryEventBus();
    const agentCoordinator = new DefaultAgentCoordinator();
    const orchestrator = new WorkflowOrchestrator(eventBus, memory, agentCoordinator, {
      maxConcurrentWorkflows: 10,
      defaultStepTimeout: 60000,
      defaultWorkflowTimeout: 600000,
      enableEventTriggers: false,
      persistExecutions: false,
    });
    await orchestrator.initialize();

    const plugin = new QCSDRefinementPlugin(memory);
    // NOT calling plugin.initialize()

    expect(() => plugin.registerWorkflowActions(orchestrator)).toThrow(
      'QCSDRefinementPlugin must be initialized'
    );

    await orchestrator.dispose();
  });

  it('should allow multiple initialize calls (idempotent)', async () => {
    const memory = createMockMemory();
    const plugin = new QCSDRefinementPlugin(memory);

    await plugin.initialize();
    await plugin.initialize(); // Should not throw
    await plugin.initialize(); // Should not throw

    await plugin.dispose();
  });

  it('should clean up on dispose', async () => {
    const memory = createMockMemory();
    const plugin = new QCSDRefinementPlugin(memory);

    await plugin.initialize();
    await plugin.dispose();

    // Should be able to re-initialize after dispose
    await plugin.initialize();
    await plugin.dispose();
  });
});
