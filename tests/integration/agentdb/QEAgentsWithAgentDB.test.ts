/**
 * QE Agents AgentDB Integration Tests
 *
 * Tests for specialized QE agents with neural training and QUIC sync
 * Coverage target: 95%+
 *
 * Test scenarios:
 * 1. QE Test Generator with neural pattern learning
 * 2. QE Test Executor with performance optimization
 * 3. QE Coverage Analyzer with intelligent gap detection
 * 4. Cross-agent coordination via QUIC sync
 * 5. Fleet-wide neural training
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { QETestGenerator } from '@agents/qe/QETestGenerator.js';
import { QETestExecutor } from '@agents/qe/QETestExecutor.js';
import { QECoverageAnalyzer } from '@agents/qe/QECoverageAnalyzer.js';
import { AgentDBManager } from '@core/memory/AgentDBManager.js';
import { FleetManager } from '@core/FleetManager.js';
import { AgentId, TaskAssignment } from '@typessrc/types/agent.types.js';
import { EventBus } from '@core/EventBus.js';
import { MemoryManager } from '@core/MemoryManager.js';

// Mock AgentDB module
jest.mock('agentdb');

describe('QE Agents with AgentDB Integration', () => {
  let eventBus: EventBus;
  let memoryManager: MemoryManager;
  let agentDBManager: AgentDBManager;
  let fleetManager: FleetManager;

  beforeEach(async () => {
    jest.clearAllMocks();
    eventBus = new EventBus();
    memoryManager = new MemoryManager();

    agentDBManager = new AgentDBManager({
      enabled: true,
      dbPath: ':memory:',
      quicSync: {
        enabled: true,
        peers: ['localhost:4433'],
      },
    });
    await agentDBManager.initialize();

    fleetManager = new FleetManager({
      topology: 'mesh',
      maxAgents: 10,
    });
    await fleetManager.initialize();
  });

  afterEach(async () => {
    await fleetManager.shutdown();
    await agentDBManager.shutdown();
  });

  describe('QE Test Generator with Neural Learning', () => {
    let testGenerator: QETestGenerator;

    beforeEach(async () => {
      const agentId: AgentId = {
        type: 'qe-test-generator',
        instanceId: 'tg-001',
      };

      testGenerator = new QETestGenerator(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await testGenerator.initialize();
    });

    afterEach(async () => {
      await testGenerator.shutdown();
    });

    it('should learn from test generation patterns', async () => {
      // Arrange
      const task: TaskAssignment = {
        id: 'task-gen-001',
        task: {
          id: 'task-gen-001',
          description: 'Generate tests for UserService',
          priority: 'high',
          metadata: {
            module: 'UserService',
            complexity: 7,
            testFramework: 'jest',
          },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      const storeSpy = jest.spyOn(agentDBManager, 'storeTrainingData');

      // Act
      await testGenerator.executeTask(task);

      // Assert
      expect(storeSpy).toHaveBeenCalledWith(
        expect.stringContaining('qe-test-generator'),
        expect.objectContaining({
          operation: 'test-generation',
          input: expect.objectContaining({
            module: 'UserService',
            complexity: 7,
          }),
          output: expect.objectContaining({
            testsGenerated: expect.any(Number),
          }),
        })
      );
    });

    it('should retrieve historical patterns for similar modules', async () => {
      // Arrange
      const historicalPattern = {
        operation: 'test-generation',
        input: { module: 'UserService', complexity: 7 },
        output: { testsGenerated: 15, propertyTests: 5 },
        confidence: 0.92,
      };

      jest.spyOn(agentDBManager, 'searchPatterns').mockResolvedValue([
        historicalPattern,
      ]);

      const task: TaskAssignment = {
        id: 'task-gen-002',
        task: {
          id: 'task-gen-002',
          description: 'Generate tests for similar module',
          priority: 'high',
          metadata: {
            module: 'UserService',
            complexity: 7,
          },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      const result = await testGenerator.executeTask(task);

      // Assert
      expect(agentDBManager.searchPatterns).toHaveBeenCalledWith(
        expect.stringContaining('UserService'),
        expect.any(Object)
      );
      expect(result.metadata?.usedPatterns).toBe(true);
    });

    it('should optimize test generation based on learned patterns', async () => {
      // Arrange
      const patterns = [
        {
          operation: 'test-generation',
          input: { complexity: 5 },
          output: { testsGenerated: 10, executionTime: 50 },
        },
        {
          operation: 'test-generation',
          input: { complexity: 8 },
          output: { testsGenerated: 20, executionTime: 120 },
        },
      ];

      jest.spyOn(agentDBManager, 'searchPatterns').mockResolvedValue(patterns);

      const task: TaskAssignment = {
        id: 'task-gen-003',
        task: {
          id: 'task-gen-003',
          description: 'Generate tests efficiently',
          priority: 'high',
          metadata: {
            module: 'ProductService',
            complexity: 6,
          },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      const startTime = Date.now();
      const result = await testGenerator.executeTask(task);
      const actualTime = Date.now() - startTime;

      // Assert - Should be optimized based on patterns
      expect(result).toBeDefined();
      expect(actualTime).toBeLessThan(100); // Optimized execution
    });

    it('should sync generated test patterns to fleet', async () => {
      // Arrange
      const task: TaskAssignment = {
        id: 'task-gen-004',
        task: {
          id: 'task-gen-004',
          description: 'Generate tests and sync',
          priority: 'high',
          metadata: {
            module: 'OrderService',
          },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      const syncSpy = jest.spyOn(agentDBManager, 'syncToPeers');

      // Act
      await testGenerator.executeTask(task);

      // Assert
      expect(syncSpy).toHaveBeenCalled();
    });
  });

  describe('QE Test Executor with Performance Optimization', () => {
    let testExecutor: QETestExecutor;

    beforeEach(async () => {
      const agentId: AgentId = {
        type: 'qe-test-executor',
        instanceId: 'te-001',
      };

      testExecutor = new QETestExecutor(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await testExecutor.initialize();
    });

    afterEach(async () => {
      await testExecutor.shutdown();
    });

    it('should learn optimal test execution strategies', async () => {
      // Arrange
      const task: TaskAssignment = {
        id: 'task-exec-001',
        task: {
          id: 'task-exec-001',
          description: 'Execute test suite',
          priority: 'high',
          metadata: {
            suite: 'UserService.test.ts',
            testCount: 50,
          },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      const storeSpy = jest.spyOn(agentDBManager, 'storeTrainingData');

      // Act
      await testExecutor.executeTask(task);

      // Assert
      expect(storeSpy).toHaveBeenCalledWith(
        expect.stringContaining('qe-test-executor'),
        expect.objectContaining({
          operation: 'test-execution',
          input: expect.objectContaining({
            testCount: 50,
          }),
          output: expect.objectContaining({
            executionTime: expect.any(Number),
            parallelism: expect.any(Number),
          }),
        })
      );
    });

    it('should retrieve optimal parallelism settings from patterns', async () => {
      // Arrange
      const optimalPattern = {
        operation: 'test-execution',
        input: { testCount: 50 },
        output: { executionTime: 100, parallelism: 4 },
        confidence: 0.95,
      };

      jest.spyOn(agentDBManager, 'searchPatterns').mockResolvedValue([
        optimalPattern,
      ]);

      const task: TaskAssignment = {
        id: 'task-exec-002',
        task: {
          id: 'task-exec-002',
          description: 'Execute tests with optimal parallelism',
          priority: 'high',
          metadata: {
            suite: 'ProductService.test.ts',
            testCount: 50,
          },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      const result = await testExecutor.executeTask(task);

      // Assert
      expect(result.metadata?.parallelism).toBe(4);
    });

    it('should share execution metrics across fleet', async () => {
      // Arrange
      const task: TaskAssignment = {
        id: 'task-exec-003',
        task: {
          id: 'task-exec-003',
          description: 'Execute and share metrics',
          priority: 'high',
          metadata: {
            suite: 'OrderService.test.ts',
          },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      const syncSpy = jest.spyOn(agentDBManager, 'syncToPeers');

      // Act
      await testExecutor.executeTask(task);

      // Assert
      expect(syncSpy).toHaveBeenCalledWith(
        expect.stringContaining('qe-test-executor'),
        expect.objectContaining({
          executionMetrics: expect.any(Object),
        })
      );
    });
  });

  describe('QE Coverage Analyzer with Intelligent Gap Detection', () => {
    let coverageAnalyzer: QECoverageAnalyzer;

    beforeEach(async () => {
      const agentId: AgentId = {
        type: 'qe-coverage-analyzer',
        instanceId: 'ca-001',
      };

      coverageAnalyzer = new QECoverageAnalyzer(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await coverageAnalyzer.initialize();
    });

    afterEach(async () => {
      await coverageAnalyzer.shutdown();
    });

    it('should learn coverage gap patterns', async () => {
      // Arrange
      const task: TaskAssignment = {
        id: 'task-cov-001',
        task: {
          id: 'task-cov-001',
          description: 'Analyze coverage gaps',
          priority: 'high',
          metadata: {
            module: 'UserService',
            currentCoverage: 0.75,
            targetCoverage: 0.95,
          },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      const storeSpy = jest.spyOn(agentDBManager, 'storeTrainingData');

      // Act
      await coverageAnalyzer.executeTask(task);

      // Assert
      expect(storeSpy).toHaveBeenCalledWith(
        expect.stringContaining('qe-coverage-analyzer'),
        expect.objectContaining({
          operation: 'coverage-analysis',
          input: expect.objectContaining({
            currentCoverage: 0.75,
          }),
          output: expect.objectContaining({
            gapsFound: expect.any(Number),
            prioritizedGaps: expect.any(Array),
          }),
        })
      );
    });

    it('should use historical gap data for prioritization', async () => {
      // Arrange
      const historicalGaps = [
        {
          operation: 'coverage-analysis',
          input: { module: 'UserService' },
          output: {
            gapsFound: 5,
            highPriorityGaps: ['authentication', 'validation'],
          },
          confidence: 0.90,
        },
      ];

      jest.spyOn(agentDBManager, 'searchPatterns').mockResolvedValue(
        historicalGaps
      );

      const task: TaskAssignment = {
        id: 'task-cov-002',
        task: {
          id: 'task-cov-002',
          description: 'Prioritize gaps intelligently',
          priority: 'high',
          metadata: {
            module: 'UserService',
          },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      const result = await coverageAnalyzer.executeTask(task);

      // Assert
      expect(result.metadata?.usedHistoricalData).toBe(true);
      expect(result.metadata?.prioritizedGaps).toContain('authentication');
    });

    it('should sync coverage insights to other QE agents', async () => {
      // Arrange
      const task: TaskAssignment = {
        id: 'task-cov-003',
        task: {
          id: 'task-cov-003',
          description: 'Analyze and sync coverage data',
          priority: 'high',
          metadata: {
            module: 'ProductService',
          },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      const syncSpy = jest.spyOn(agentDBManager, 'syncToPeers');

      // Act
      await coverageAnalyzer.executeTask(task);

      // Assert
      expect(syncSpy).toHaveBeenCalledWith(
        expect.stringContaining('qe-coverage-analyzer'),
        expect.objectContaining({
          coverageInsights: expect.any(Object),
        })
      );
    });
  });

  describe('Cross-Agent Coordination via QUIC Sync', () => {
    let testGenerator: QETestGenerator;
    let testExecutor: QETestExecutor;
    let coverageAnalyzer: QECoverageAnalyzer;

    beforeEach(async () => {
      testGenerator = new QETestGenerator(
        { type: 'qe-test-generator', instanceId: 'tg-001' },
        eventBus,
        memoryManager,
        { agentDBManager }
      );

      testExecutor = new QETestExecutor(
        { type: 'qe-test-executor', instanceId: 'te-001' },
        eventBus,
        memoryManager,
        { agentDBManager }
      );

      coverageAnalyzer = new QECoverageAnalyzer(
        { type: 'qe-coverage-analyzer', instanceId: 'ca-001' },
        eventBus,
        memoryManager,
        { agentDBManager }
      );

      await Promise.all([
        testGenerator.initialize(),
        testExecutor.initialize(),
        coverageAnalyzer.initialize(),
      ]);
    });

    afterEach(async () => {
      await Promise.all([
        testGenerator.shutdown(),
        testExecutor.shutdown(),
        coverageAnalyzer.shutdown(),
      ]);
    });

    it('should sync test generation results to executor', async () => {
      // Arrange
      const syncSpy = jest.spyOn(agentDBManager, 'syncToPeers');

      const genTask: TaskAssignment = {
        id: 'task-gen-sync-001',
        task: {
          id: 'task-gen-sync-001',
          description: 'Generate tests for sync',
          priority: 'high',
          metadata: { module: 'UserService' },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      await testGenerator.executeTask(genTask);

      // Assert
      expect(syncSpy).toHaveBeenCalled();

      // Verify executor can retrieve synced data
      const syncedData = await agentDBManager.retrieveTrainingData(
        'qe-test-generator/tg-001',
        'test-generation'
      );
      expect(syncedData).toBeDefined();
    });

    it('should coordinate coverage analysis with test generation', async () => {
      // Arrange
      const searchSpy = jest.spyOn(agentDBManager, 'searchPatterns');

      // Coverage analyzer finds gaps
      const covTask: TaskAssignment = {
        id: 'task-cov-coord-001',
        task: {
          id: 'task-cov-coord-001',
          description: 'Find coverage gaps',
          priority: 'high',
          metadata: { module: 'UserService' },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      await coverageAnalyzer.executeTask(covTask);

      // Test generator uses gap data
      const genTask: TaskAssignment = {
        id: 'task-gen-coord-001',
        task: {
          id: 'task-gen-coord-001',
          description: 'Generate tests for gaps',
          priority: 'high',
          metadata: { module: 'UserService' },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      await testGenerator.executeTask(genTask);

      // Assert
      expect(searchSpy).toHaveBeenCalled();
    });

    it('should share execution results for fleet-wide optimization', async () => {
      // Arrange
      const syncSpy = jest.spyOn(agentDBManager, 'syncToPeers');

      const tasks = [
        {
          agent: testGenerator,
          task: {
            id: 'task-fleet-001',
            task: {
              id: 'task-fleet-001',
              description: 'Generate tests',
              priority: 'high' as const,
              metadata: { module: 'UserService' },
            },
            assignedAt: new Date(),
            status: 'assigned' as const,
          },
        },
        {
          agent: testExecutor,
          task: {
            id: 'task-fleet-002',
            task: {
              id: 'task-fleet-002',
              description: 'Execute tests',
              priority: 'high' as const,
              metadata: { suite: 'UserService.test.ts' },
            },
            assignedAt: new Date(),
            status: 'assigned' as const,
          },
        },
        {
          agent: coverageAnalyzer,
          task: {
            id: 'task-fleet-003',
            task: {
              id: 'task-fleet-003',
              description: 'Analyze coverage',
              priority: 'high' as const,
              metadata: { module: 'UserService' },
            },
            assignedAt: new Date(),
            status: 'assigned' as const,
          },
        },
      ];

      // Act
      await Promise.all(
        tasks.map(({ agent, task }) => agent.executeTask(task))
      );

      // Assert - All agents should sync
      expect(syncSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Fleet-Wide Neural Training', () => {
    it('should aggregate patterns from multiple agents', async () => {
      // Arrange
      const agents = [
        new QETestGenerator(
          { type: 'qe-test-generator', instanceId: 'tg-001' },
          eventBus,
          memoryManager,
          { agentDBManager }
        ),
        new QETestGenerator(
          { type: 'qe-test-generator', instanceId: 'tg-002' },
          eventBus,
          memoryManager,
          { agentDBManager }
        ),
      ];

      await Promise.all(agents.map(a => a.initialize()));

      const tasks = agents.map((agent, i) => ({
        id: `task-agg-${i}`,
        task: {
          id: `task-agg-${i}`,
          description: `Generate tests ${i}`,
          priority: 'high' as const,
          metadata: { module: `Service${i}` },
        },
        assignedAt: new Date(),
        status: 'assigned' as const,
      }));

      // Act
      await Promise.all(
        tasks.map((task, i) => agents[i].executeTask(task))
      );

      // Search for aggregated patterns
      const patterns = await agentDBManager.searchPatterns('test-generation');

      // Assert
      expect(patterns.length).toBeGreaterThan(0);

      // Cleanup
      await Promise.all(agents.map(a => a.shutdown()));
    });

    it('should enable cross-agent learning', async () => {
      // Arrange
      const generator = new QETestGenerator(
        { type: 'qe-test-generator', instanceId: 'tg-cross-001' },
        eventBus,
        memoryManager,
        { agentDBManager }
      );

      const executor = new QETestExecutor(
        { type: 'qe-test-executor', instanceId: 'te-cross-001' },
        eventBus,
        memoryManager,
        { agentDBManager }
      );

      await Promise.all([generator.initialize(), executor.initialize()]);

      // Generator learns a pattern
      await generator.executeTask({
        id: 'task-learn-001',
        task: {
          id: 'task-learn-001',
          description: 'Generate tests',
          priority: 'high',
          metadata: { module: 'SharedService', complexity: 8 },
        },
        assignedAt: new Date(),
        status: 'assigned',
      });

      // Act - Executor retrieves generator's pattern
      const patterns = await agentDBManager.searchPatterns('SharedService');

      // Assert
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]).toHaveProperty('operation', 'test-generation');

      // Cleanup
      await Promise.all([generator.shutdown(), executor.shutdown()]);
    });
  });
});
