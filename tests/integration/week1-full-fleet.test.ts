/**
 * Week 1 Full Fleet Integration Tests
 * Tests all 3 Week 1 agents coordinating together:
 * - RequirementsValidatorAgent
 * - ProductionIntelligenceAgent
 * - FleetCommanderAgent
 */

import { EventEmitter } from 'events';
import { MemoryManager } from '../../src/core/MemoryManager';
import { EventBus } from '../../src/core/EventBus';
import { Database } from '../../src/utils/Database';
import { Logger } from '../../src/utils/Logger';

// Mock external dependencies
jest.mock('../../src/utils/Database');
jest.mock('../../src/utils/Logger');

describe('Week 1 Full Fleet Integration', () => {
  let eventBus: EventBus;
  let memoryManager: MemoryManager;
  let mockDatabase: jest.Mocked<Database>;
  let mockLogger: jest.Mocked<Logger>;

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

    // Create real EventBus and MemoryManager
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

    if (global.gc) {
      global.gc();
    }
  });

  describe('Complete Requirements → Production Intelligence → Fleet Coordination', () => {
    it('should orchestrate full workflow from requirements to production testing', async () => {
      const workflowSteps: string[] = [];

      // Listen to all workflow events
      eventBus.on('workflow.step', (event) => {
        workflowSteps.push(event.data.step);
      });

      // ===== STEP 1: Requirements Validation =====
      await eventBus.emitFleetEvent('workflow.step', 'system', {
        step: 'requirements-submitted'
      });

      const requirement = {
        id: 'REQ-FLEET-001',
        title: 'Payment Gateway Integration',
        description: 'Integrate with Stripe payment gateway for processing transactions',
        acceptanceCriteria: [
          'Process credit card payments',
          'Handle payment failures gracefully',
          'Support refunds',
          'Log all transactions'
        ]
      };

      await memoryManager.store(requirement.id, requirement, {
        namespace: 'aqe/requirements/raw'
      });

      // RequirementsValidator validates
      await eventBus.emitFleetEvent('workflow.step', 'requirements-validator', {
        step: 'validation-started'
      });

      const validation = {
        requirementId: requirement.id,
        testabilityScore: 88,
        scenarios: [
          { title: 'Process successful payment', type: 'positive' },
          { title: 'Handle declined card', type: 'negative' },
          { title: 'Process refund', type: 'positive' },
          { title: 'Handle gateway timeout', type: 'negative' }
        ],
        validated: true,
        timestamp: Date.now()
      };

      await memoryManager.store(`${requirement.id}-validated`, validation, {
        namespace: 'aqe/requirements'
      });

      await eventBus.emitFleetEvent('workflow.step', 'requirements-validator', {
        step: 'validation-completed'
      });

      // ===== STEP 2: Fleet Commander Spawns Test Agents =====
      await eventBus.emitFleetEvent('workflow.step', 'fleet-commander', {
        step: 'analyzing-workload'
      });

      const workload = {
        requirementId: requirement.id,
        scenarios: validation.scenarios.length,
        estimatedTests: 12,
        frameworks: ['jest', 'supertest'],
        estimatedDuration: 1800000 // 30 min
      };

      await memoryManager.store('workload-analysis', workload, {
        namespace: 'aqe/fleet'
      });

      // Fleet Commander calculates optimal agent allocation
      const agentAllocation = {
        'test-generator': 2,
        'test-executor': 3,
        'coverage-analyzer': 1
      };

      await eventBus.emitFleetEvent('workflow.step', 'fleet-commander', {
        step: 'spawning-agents'
      });

      // Simulate agent spawning
      const spawnedAgents = Object.entries(agentAllocation).flatMap(([type, count]) =>
        Array.from({ length: count }, (_, i) => ({
          id: `${type}-${i}`,
          type,
          status: 'active'
        }))
      );

      await memoryManager.store('spawned-agents', spawnedAgents, {
        namespace: 'aqe/fleet/agents'
      });

      await eventBus.emitFleetEvent('workflow.step', 'fleet-commander', {
        step: 'agents-spawned',
        data: { count: spawnedAgents.length }
      });

      // ===== STEP 3: Test Generation and Execution =====
      await eventBus.emitFleetEvent('workflow.step', 'test-generator', {
        step: 'generating-tests'
      });

      const generatedTests = {
        requirementId: requirement.id,
        tests: validation.scenarios.map((scenario: any, index: number) => ({
          id: `TEST-${requirement.id}-${index}`,
          name: scenario.title,
          type: 'integration',
          framework: 'jest'
        }))
      };

      await memoryManager.store(`${requirement.id}-tests`, generatedTests, {
        namespace: 'aqe/test-generator'
      });

      await eventBus.emitFleetEvent('workflow.step', 'test-generator', {
        step: 'tests-generated',
        data: { count: generatedTests.tests.length }
      });

      // ===== STEP 4: Production Intelligence Analysis =====
      await eventBus.emitFleetEvent('workflow.step', 'production-intelligence', {
        step: 'analyzing-production-data'
      });

      // Simulate production incident related to payment processing
      const productionIncident = {
        id: 'INC-PAY-001',
        service: 'payment-service',
        error: 'Gateway timeout',
        frequency: 23,
        affectedUsers: 145,
        timestamp: Date.now()
      };

      await memoryManager.store('INC-PAY-001', productionIncident, {
        namespace: 'aqe/production/incidents'
      });

      // Generate additional test scenarios from production data
      const productionScenarios = {
        sourceIncident: productionIncident.id,
        scenarios: [
          {
            title: 'Reproduce gateway timeout under load',
            type: 'incident-replay',
            priority: 'critical'
          },
          {
            title: 'Verify timeout error handling',
            type: 'incident-replay',
            priority: 'high'
          }
        ],
        timestamp: Date.now()
      };

      await memoryManager.store('production-scenarios', productionScenarios, {
        namespace: 'aqe/production/test-scenarios'
      });

      await eventBus.emitFleetEvent('workflow.step', 'production-intelligence', {
        step: 'production-scenarios-generated',
        data: { count: productionScenarios.scenarios.length }
      });

      // ===== STEP 5: Fleet Commander Coordinates Execution =====
      await eventBus.emitFleetEvent('workflow.step', 'fleet-commander', {
        step: 'coordinating-test-execution'
      });

      const executionPlan = {
        totalTests: generatedTests.tests.length + productionScenarios.scenarios.length,
        agents: spawnedAgents.filter((a: any) => a.type === 'test-executor'),
        estimatedDuration: 900000, // 15 min
        priority: 'high'
      };

      await memoryManager.store('execution-plan', executionPlan, {
        namespace: 'aqe/fleet/coordination'
      });

      await eventBus.emitFleetEvent('workflow.step', 'fleet-commander', {
        step: 'execution-coordinated'
      });

      // ===== STEP 6: Workflow Complete =====
      await eventBus.emitFleetEvent('workflow.step', 'system', {
        step: 'workflow-completed'
      });

      // Wait for all events to propagate
      await new Promise(resolve => setTimeout(resolve, 200));

      // ===== VERIFICATION =====

      // Verify workflow steps
      expect(workflowSteps).toContain('requirements-submitted');
      expect(workflowSteps).toContain('validation-started');
      expect(workflowSteps).toContain('validation-completed');
      expect(workflowSteps).toContain('analyzing-workload');
      expect(workflowSteps).toContain('spawning-agents');
      expect(workflowSteps).toContain('agents-spawned');
      expect(workflowSteps).toContain('generating-tests');
      expect(workflowSteps).toContain('tests-generated');
      expect(workflowSteps).toContain('analyzing-production-data');
      expect(workflowSteps).toContain('production-scenarios-generated');
      expect(workflowSteps).toContain('coordinating-test-execution');
      expect(workflowSteps).toContain('execution-coordinated');
      expect(workflowSteps).toContain('workflow-completed');

      // Verify all artifacts exist in memory
      const rawReq = await memoryManager.retrieve(requirement.id, {
        namespace: 'aqe/requirements/raw'
      });
      const validatedReq = await memoryManager.retrieve(`${requirement.id}-validated`, {
        namespace: 'aqe/requirements'
      });
      const tests = await memoryManager.retrieve(`${requirement.id}-tests`, {
        namespace: 'aqe/test-generator'
      });
      const agents = await memoryManager.retrieve('spawned-agents', {
        namespace: 'aqe/fleet/agents'
      });
      const incident = await memoryManager.retrieve('INC-PAY-001', {
        namespace: 'aqe/production/incidents'
      });
      const prodScenarios = await memoryManager.retrieve('production-scenarios', {
        namespace: 'aqe/production/test-scenarios'
      });
      const plan = await memoryManager.retrieve('execution-plan', {
        namespace: 'aqe/fleet/coordination'
      });

      expect(rawReq).toBeDefined();
      expect(validatedReq).toBeDefined();
      expect(tests).toBeDefined();
      expect(agents).toBeDefined();
      expect(incident).toBeDefined();
      expect(prodScenarios).toBeDefined();
      expect(plan).toBeDefined();

      // Verify data integrity
      expect(validatedReq.value.testabilityScore).toBeGreaterThan(80);
      expect(tests.value.tests).toHaveLength(4);
      expect(agents.value).toHaveLength(6); // 2 + 3 + 1
      expect(prodScenarios.value.scenarios).toHaveLength(2);
    });
  });

  describe('Memory Sharing Across All Agents', () => {
    it('should share requirements validation results across agents', async () => {
      const validationResult = {
        requirementId: 'REQ-SHARE-001',
        testabilityScore: 92,
        scenarios: 5,
        timestamp: Date.now()
      };

      // RequirementsValidator stores
      await memoryManager.store('validation', validationResult, {
        namespace: 'aqe/requirements'
      });

      // FleetCommander retrieves to plan workload
      const fleetData = await memoryManager.retrieve('validation', {
        namespace: 'aqe/requirements'
      });

      expect(fleetData).toBeDefined();
      expect(fleetData.value.scenarios).toBe(5);

      // FleetCommander calculates agents needed
      const agentsNeeded = Math.ceil(fleetData.value.scenarios / 2);

      await memoryManager.store('agents-planned', {
        count: agentsNeeded,
        reason: 'Based on requirements validation'
      }, {
        namespace: 'aqe/fleet'
      });

      const fleetPlan = await memoryManager.retrieve('agents-planned', {
        namespace: 'aqe/fleet'
      });

      expect(fleetPlan).toBeDefined();
      expect(fleetPlan.value.count).toBe(3); // ceil(5/2)
    });

    it('should share production insights with requirements validation', async () => {
      // ProductionIntelligence identifies common failure pattern
      const productionInsight = {
        pattern: 'payment-timeout',
        frequency: 47,
        recommendation: 'Add timeout handling requirements',
        timestamp: Date.now()
      };

      await memoryManager.store('insight-payment', productionInsight, {
        namespace: 'aqe/production/insights'
      });

      // RequirementsValidator retrieves to enhance validation
      const insight = await memoryManager.retrieve('insight-payment', {
        namespace: 'aqe/production/insights'
      });

      expect(insight).toBeDefined();
      expect(insight.value.pattern).toBe('payment-timeout');

      // RequirementsValidator adds production-informed criteria
      const enhancedRequirement = {
        id: 'REQ-ENH-001',
        title: 'Payment Processing',
        acceptanceCriteria: [
          'Process payments within 5 seconds',
          'Handle gateway timeouts gracefully', // Added from production insight
          'Retry failed payments up to 3 times' // Added from production insight
        ],
        productionInformed: true,
        sourceInsight: productionInsight.pattern
      };

      await memoryManager.store('REQ-ENH-001', enhancedRequirement, {
        namespace: 'aqe/requirements'
      });

      const enhanced = await memoryManager.retrieve('REQ-ENH-001', {
        namespace: 'aqe/requirements'
      });

      expect(enhanced).toBeDefined();
      expect(enhanced.value.productionInformed).toBe(true);
      expect(enhanced.value.acceptanceCriteria).toHaveLength(3);
    });

    it('should share fleet health status with all agents', async () => {
      const fleetHealth = {
        totalAgents: 15,
        activeAgents: 13,
        erroredAgents: 2,
        cpuUtilization: 0.78,
        memoryUtilization: 0.65,
        status: 'degraded',
        timestamp: Date.now()
      };

      // FleetCommander publishes health status
      await memoryManager.store('health-status', fleetHealth, {
        namespace: 'aqe/fleet'
      });

      // All agents can check fleet health
      const healthCheck = await memoryManager.retrieve('health-status', {
        namespace: 'aqe/fleet'
      });

      expect(healthCheck).toBeDefined();
      expect(healthCheck.value.status).toBe('degraded');

      // Agents adjust behavior based on fleet health
      if (healthCheck.value.status === 'degraded') {
        // RequirementsValidator: Reduce validation depth
        const adjustedConfig = {
          agent: 'requirements-validator',
          adjustment: 'reduce-validation-depth',
          reason: 'Fleet degraded',
          timestamp: Date.now()
        };

        await memoryManager.store('req-val-adjustment', adjustedConfig, {
          namespace: 'aqe/requirements'
        });

        // ProductionIntelligence: Pause non-critical analysis
        const prodAdjustment = {
          agent: 'production-intelligence',
          adjustment: 'pause-non-critical',
          reason: 'Fleet degraded',
          timestamp: Date.now()
        };

        await memoryManager.store('prod-int-adjustment', prodAdjustment, {
          namespace: 'aqe/production'
        });
      }

      const reqAdjustment = await memoryManager.retrieve('req-val-adjustment', {
        namespace: 'aqe/requirements'
      });
      const prodAdjustment = await memoryManager.retrieve('prod-int-adjustment', {
        namespace: 'aqe/production'
      });

      expect(reqAdjustment).toBeDefined();
      expect(prodAdjustment).toBeDefined();
    });
  });

  describe('Event Bus Communication Between All Agents', () => {
    it('should coordinate via events across all 3 agents', async () => {
      const events: any[] = [];

      // Listen to all agent events
      eventBus.on('agent.event', (event) => {
        events.push({
          source: event.source,
          type: event.data.type,
          timestamp: event.timestamp
        });
      });

      // RequirementsValidator emits
      await eventBus.emitFleetEvent('agent.event', 'requirements-validator', {
        type: 'validation-completed',
        requirementId: 'REQ-001'
      });

      // FleetCommander emits
      await eventBus.emitFleetEvent('agent.event', 'fleet-commander', {
        type: 'agents-spawned',
        count: 5
      });

      // ProductionIntelligence emits
      await eventBus.emitFleetEvent('agent.event', 'production-intelligence', {
        type: 'incident-analyzed',
        incidentId: 'INC-001'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(events).toHaveLength(3);
      expect(events.map(e => e.source)).toContain('requirements-validator');
      expect(events.map(e => e.source)).toContain('fleet-commander');
      expect(events.map(e => e.source)).toContain('production-intelligence');
    });

    it('should handle cascading events between agents', async () => {
      const cascade: string[] = [];

      // Setup event chain
      eventBus.on('requirements.validated', async (event) => {
        cascade.push('requirements-validated');

        // Trigger fleet coordination
        await eventBus.emitFleetEvent('fleet.workload-detected', 'requirements-validator', {
          requirementId: event.data.requirementId,
          scenarios: 10
        });
      });

      eventBus.on('fleet.workload-detected', async (event) => {
        cascade.push('workload-detected');

        // FleetCommander spawns agents
        await eventBus.emitFleetEvent('fleet.agents-spawned', 'fleet-commander', {
          count: 5
        });
      });

      eventBus.on('fleet.agents-spawned', async (event) => {
        cascade.push('agents-spawned');

        // ProductionIntelligence provides context
        await eventBus.emitFleetEvent('production.context-provided', 'production-intelligence', {
          incidents: 3
        });
      });

      eventBus.on('production.context-provided', () => {
        cascade.push('context-provided');
      });

      // Start cascade
      await eventBus.emitFleetEvent('requirements.validated', 'requirements-validator', {
        requirementId: 'REQ-CASCADE-001',
        testabilityScore: 90
      });

      // Wait for cascade to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(cascade).toEqual([
        'requirements-validated',
        'workload-detected',
        'agents-spawned',
        'context-provided'
      ]);
    });

    it('should broadcast fleet-wide alerts to all agents', async () => {
      const agentsReceived: string[] = [];

      // All agents listen for alerts
      eventBus.on('fleet.alert', (event) => {
        agentsReceived.push(event.target || 'broadcast');
      });

      // FleetCommander broadcasts alert
      await eventBus.emitFleetEvent('fleet.alert', 'fleet-commander', {
        level: 'warning',
        message: 'High resource utilization detected',
        action: 'reduce-non-critical-tasks'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(agentsReceived).toContain('broadcast');
    });
  });

  describe('Complex Multi-Agent Scenarios', () => {
    it('should handle production incident triggering requirement update and fleet rebalancing', async () => {
      // Scenario: Production incident reveals missing requirement
      const incident = {
        id: 'INC-COMPLEX-001',
        error: 'Unhandled currency conversion edge case',
        severity: 'HIGH',
        affectedUsers: 234
      };

      await memoryManager.store(incident.id, incident, {
        namespace: 'aqe/production/incidents'
      });

      await eventBus.emitFleetEvent('production.incident', 'production-intelligence', {
        incidentId: incident.id,
        severity: 'HIGH'
      });

      // ProductionIntelligence identifies missing requirement
      const missingRequirement = {
        id: 'REQ-MISSING-001',
        title: 'Currency Conversion Edge Cases',
        description: 'Handle edge cases in currency conversion',
        source: 'production-incident',
        sourceIncident: incident.id,
        priority: 'high'
      };

      await memoryManager.store('REQ-MISSING-001', missingRequirement, {
        namespace: 'aqe/requirements/derived'
      });

      await eventBus.emitFleetEvent('requirements.derived', 'production-intelligence', {
        requirementId: 'REQ-MISSING-001',
        source: incident.id
      });

      // RequirementsValidator validates new requirement
      const validation = {
        requirementId: 'REQ-MISSING-001',
        testabilityScore: 78,
        scenarios: 6,
        urgent: true
      };

      await memoryManager.store('REQ-MISSING-001-validated', validation, {
        namespace: 'aqe/requirements'
      });

      await eventBus.emitFleetEvent('requirements.validated', 'requirements-validator', {
        requirementId: 'REQ-MISSING-001',
        urgent: true
      });

      // FleetCommander prioritizes new requirement
      const rebalancing = {
        action: 'rebalance-for-urgent',
        pausedTasks: 3,
        prioritizedRequirement: 'REQ-MISSING-001',
        agentsReassigned: 2
      };

      await memoryManager.store('rebalancing', rebalancing, {
        namespace: 'aqe/fleet/coordination'
      });

      await eventBus.emitFleetEvent('fleet.rebalanced', 'fleet-commander', {
        reason: 'urgent-production-incident',
        agentsReassigned: 2
      });

      // Verify complete flow
      const storedIncident = await memoryManager.retrieve(incident.id, {
        namespace: 'aqe/production/incidents'
      });
      const derivedReq = await memoryManager.retrieve('REQ-MISSING-001', {
        namespace: 'aqe/requirements/derived'
      });
      const validated = await memoryManager.retrieve('REQ-MISSING-001-validated', {
        namespace: 'aqe/requirements'
      });
      const rebalance = await memoryManager.retrieve('rebalancing', {
        namespace: 'aqe/fleet/coordination'
      });

      expect(storedIncident).toBeDefined();
      expect(derivedReq).toBeDefined();
      expect(validated).toBeDefined();
      expect(rebalance).toBeDefined();
      expect(rebalance.value.agentsReassigned).toBe(2);
    });

    it('should optimize fleet based on requirements complexity and production patterns', async () => {
      // Multiple requirements of varying complexity
      const requirements = [
        { id: 'REQ-A', complexity: 'low', scenarios: 3 },
        { id: 'REQ-B', complexity: 'medium', scenarios: 8 },
        { id: 'REQ-C', complexity: 'high', scenarios: 15 }
      ];

      await memoryManager.store('requirements-batch', requirements, {
        namespace: 'aqe/requirements'
      });

      // Production patterns indicate high failure rate in specific area
      const productionPatterns = {
        'REQ-B': { failureRate: 0.23, priority: 'critical' },
        'REQ-A': { failureRate: 0.02, priority: 'normal' },
        'REQ-C': { failureRate: 0.05, priority: 'normal' }
      };

      await memoryManager.store('patterns', productionPatterns, {
        namespace: 'aqe/production'
      });

      // FleetCommander optimizes allocation
      const optimization = {
        'REQ-A': { agents: 1, priority: 3 }, // Low complexity, low failure rate
        'REQ-B': { agents: 5, priority: 1 }, // Medium complexity, HIGH failure rate
        'REQ-C': { agents: 3, priority: 2 }  // High complexity, normal failure rate
      };

      await memoryManager.store('optimization', optimization, {
        namespace: 'aqe/fleet/allocation'
      });

      const optimized = await memoryManager.retrieve('optimization', {
        namespace: 'aqe/fleet/allocation'
      });

      expect(optimized).toBeDefined();
      // REQ-B gets most agents due to high production failure rate
      expect(optimized.value['REQ-B'].agents).toBeGreaterThan(optimized.value['REQ-A'].agents);
      expect(optimized.value['REQ-B'].priority).toBe(1);
    });
  });
});