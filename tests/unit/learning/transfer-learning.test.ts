/**
 * Transfer Learning Manager Tests - Issue #118 Task 2.3
 *
 * Tests for knowledge transfer between QE domains
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  TransferLearningManager,
  QEDomain,
  TransferMapping,
  TransferMetrics,
  FineTuningResult
} from '../../../src/learning/TransferLearningManager';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { TaskExperience, TaskState, AgentAction } from '../../../src/learning/types';

describe('TransferLearningManager', () => {
  let memoryStore: SwarmMemoryManager;
  let transferManager: TransferLearningManager;

  beforeEach(async () => {
    // Use in-memory database for tests
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();

    transferManager = new TransferLearningManager(memoryStore);
    await transferManager.initialize();
  });

  afterEach(() => {
    transferManager.dispose();
  });

  describe('Domain Similarity Calculation', () => {
    it('should calculate high similarity between related domains', () => {
      const similarity = transferManager.calculateDomainSimilarity(
        'unit-testing',
        'integration-testing'
      );

      expect(similarity).toBeGreaterThan(0.5);
      expect(similarity).toBeLessThanOrEqual(1.0);
    });

    it('should calculate high similarity for API and Contract testing', () => {
      const similarity = transferManager.calculateDomainSimilarity(
        'api-testing',
        'contract-testing'
      );

      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should calculate high similarity for Performance and Load testing', () => {
      const similarity = transferManager.calculateDomainSimilarity(
        'performance-testing',
        'load-testing'
      );

      expect(similarity).toBeGreaterThan(0.8);
    });

    it('should calculate high similarity for Security and Vulnerability detection', () => {
      const similarity = transferManager.calculateDomainSimilarity(
        'security-scanning',
        'vulnerability-detection'
      );

      expect(similarity).toBeGreaterThan(0.8);
    });

    it('should calculate lower similarity between unrelated domains', () => {
      const similarity = transferManager.calculateDomainSimilarity(
        'unit-testing',
        'load-testing'
      );

      expect(similarity).toBeLessThan(0.7);
    });

    it('should return 1.0 for identical domains', () => {
      const similarity = transferManager.calculateDomainSimilarity(
        'unit-testing',
        'unit-testing'
      );

      expect(similarity).toBe(1.0);
    });

    it('should return values between 0 and 1', () => {
      const domains: QEDomain[] = [
        'unit-testing',
        'integration-testing',
        'api-testing',
        'performance-testing',
        'security-scanning'
      ];

      domains.forEach(source => {
        domains.forEach(target => {
          const similarity = transferManager.calculateDomainSimilarity(source, target);
          expect(similarity).toBeGreaterThanOrEqual(0);
          expect(similarity).toBeLessThanOrEqual(1);
        });
      });
    });
  });

  describe('Knowledge Transfer', () => {
    let sourceExperiences: TaskExperience[];

    beforeEach(() => {
      // Create sample experiences from unit testing
      sourceExperiences = [
        createExperience('unit-test-1', 1.5, 'unit-testing'),
        createExperience('unit-test-2', 1.2, 'unit-testing'),
        createExperience('unit-test-3', 1.8, 'unit-testing'),
        createExperience('unit-test-4', 1.0, 'unit-testing'),
        createExperience('unit-test-5', 1.3, 'unit-testing')
      ];
    });

    it('should transfer knowledge from unit to integration testing', async () => {
      const mapping = await transferManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        sourceExperiences
      );

      expect(mapping).toBeDefined();
      expect(mapping.sourceDomain).toBe('unit-testing');
      expect(mapping.targetDomain).toBe('integration-testing');
      expect(mapping.experiencesTransferred).toBe(5);
      expect(mapping.similarity).toBeGreaterThan(0);
    });

    it('should apply transfer coefficient to experience rewards', async () => {
      const transferCoefficient = 0.5;
      const mapping = await transferManager.transferKnowledge(
        'api-testing',
        'contract-testing',
        sourceExperiences,
        transferCoefficient
      );

      expect(mapping.transferCoefficient).toBe(transferCoefficient);
    });

    it('should reject transfer when similarity is too low', async () => {
      // Configure with high minimum similarity
      const strictManager = new TransferLearningManager(memoryStore, {
        minSimilarity: 0.95
      });
      await strictManager.initialize();

      await expect(
        strictManager.transferKnowledge(
          'unit-testing',
          'load-testing',
          sourceExperiences
        )
      ).rejects.toThrow('Domain similarity too low');

      strictManager.dispose();
    });

    it('should limit number of experiences transferred', async () => {
      const maxTransfer = 3;
      const limitedManager = new TransferLearningManager(memoryStore, {
        maxTransferExperiences: maxTransfer
      });
      await limitedManager.initialize();

      const manyExperiences = Array(20)
        .fill(null)
        .map((_, i) => createExperience(`test-${i}`, 1.0, 'unit-testing'));

      const mapping = await limitedManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        manyExperiences
      );

      expect(mapping.experiencesTransferred).toBe(maxTransfer);

      limitedManager.dispose();
    });

    it('should update mapping on subsequent transfers', async () => {
      const firstMapping = await transferManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        sourceExperiences
      );

      const moreExperiences = [
        createExperience('unit-test-6', 1.4, 'unit-testing'),
        createExperience('unit-test-7', 1.6, 'unit-testing')
      ];

      const secondMapping = await transferManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        moreExperiences
      );

      expect(secondMapping.id).toBe(firstMapping.id);
      expect(secondMapping.experiencesTransferred).toBe(7);
      expect(secondMapping.lastTransferAt).toBeDefined();
    });

    it('should throw error when transfer learning is disabled', async () => {
      const disabledManager = new TransferLearningManager(memoryStore, {
        enabled: false
      });
      await disabledManager.initialize();

      await expect(
        disabledManager.transferKnowledge(
          'unit-testing',
          'integration-testing',
          sourceExperiences
        )
      ).rejects.toThrow('Transfer learning is disabled');

      disabledManager.dispose();
    });
  });

  describe('Fine-Tuning', () => {
    it('should fine-tune transferred knowledge', async () => {
      const targetExperiences: TaskExperience[] = [
        createExperience('integration-test-1', 1.8, 'integration-testing'),
        createExperience('integration-test-2', 1.5, 'integration-testing'),
        createExperience('integration-test-3', 1.9, 'integration-testing')
      ];

      const sourceExperiences: TaskExperience[] = [
        createExperience('unit-test-1', 1.2, 'unit-testing'),
        createExperience('unit-test-2', 1.0, 'unit-testing')
      ];

      // First transfer knowledge
      await transferManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        sourceExperiences
      );

      // Then fine-tune
      const result = await transferManager.fineTuneTransferredKnowledge(
        'integration-testing',
        targetExperiences
      );

      expect(result).toBeDefined();
      expect(result.domain).toBe('integration-testing');
      expect(result.finalPerformance).toBeDefined();
      expect(result.improvement).toBeDefined();
      expect(result.iterations).toBeGreaterThan(0);
    });

    it('should improve performance after fine-tuning', async () => {
      const targetExperiences: TaskExperience[] = [
        createExperience('test-1', 2.0, 'integration-testing'),
        createExperience('test-2', 1.9, 'integration-testing')
      ];

      const sourceExperiences: TaskExperience[] = [
        createExperience('test-3', 0.5, 'unit-testing'),
        createExperience('test-4', 0.6, 'unit-testing')
      ];

      await transferManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        sourceExperiences
      );

      const result = await transferManager.fineTuneTransferredKnowledge(
        'integration-testing',
        targetExperiences
      );

      expect(result.finalPerformance).toBeGreaterThan(result.initialPerformance);
      expect(result.improvement).toBeGreaterThan(0);
    });

    it('should throw error when fine-tuning is disabled', async () => {
      const noFineTuneManager = new TransferLearningManager(memoryStore, {
        fineTuningEnabled: false
      });
      await noFineTuneManager.initialize();

      const experiences = [createExperience('test-1', 1.0, 'integration-testing')];

      await expect(
        noFineTuneManager.fineTuneTransferredKnowledge(
          'integration-testing',
          experiences
        )
      ).rejects.toThrow('Fine-tuning is disabled');

      noFineTuneManager.dispose();
    });

    it('should use configured number of fine-tuning iterations', async () => {
      const iterations = 5;
      const customManager = new TransferLearningManager(memoryStore, {
        fineTuningIterations: iterations
      });
      await customManager.initialize();

      const sourceExperiences = [createExperience('test-1', 1.0, 'unit-testing')];
      const targetExperiences = [createExperience('test-2', 1.5, 'integration-testing')];

      await customManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        sourceExperiences
      );

      const result = await customManager.fineTuneTransferredKnowledge(
        'integration-testing',
        targetExperiences
      );

      expect(result.iterations).toBeLessThanOrEqual(iterations);

      customManager.dispose();
    });
  });

  describe('Adaptive Transfer Coefficient', () => {
    it('should increase coefficient on successful transfer', async () => {
      const adaptiveManager = new TransferLearningManager(memoryStore, {
        adaptiveCoefficient: true,
        defaultTransferCoefficient: 0.5
      });
      await adaptiveManager.initialize();

      const experiences = [createExperience('test-1', 1.0, 'unit-testing')];

      const mapping = await adaptiveManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        experiences
      );

      const initialCoefficient = mapping.transferCoefficient;

      await adaptiveManager.adjustTransferCoefficient(mapping.id, true);

      const mappings = adaptiveManager.getAllMappings();
      const updatedMapping = mappings.find(m => m.id === mapping.id);

      expect(updatedMapping?.transferCoefficient).toBeGreaterThan(initialCoefficient);

      adaptiveManager.dispose();
    });

    it('should decrease coefficient on failed transfer', async () => {
      const adaptiveManager = new TransferLearningManager(memoryStore, {
        adaptiveCoefficient: true,
        defaultTransferCoefficient: 0.5
      });
      await adaptiveManager.initialize();

      const experiences = [createExperience('test-1', 1.0, 'unit-testing')];

      const mapping = await adaptiveManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        experiences
      );

      const initialCoefficient = mapping.transferCoefficient;

      await adaptiveManager.adjustTransferCoefficient(mapping.id, false);

      const mappings = adaptiveManager.getAllMappings();
      const updatedMapping = mappings.find(m => m.id === mapping.id);

      expect(updatedMapping?.transferCoefficient).toBeLessThan(initialCoefficient);

      adaptiveManager.dispose();
    });

    it('should not adjust coefficient when adaptive mode is disabled', async () => {
      const staticManager = new TransferLearningManager(memoryStore, {
        adaptiveCoefficient: false,
        defaultTransferCoefficient: 0.5
      });
      await staticManager.initialize();

      const experiences = [createExperience('test-1', 1.0, 'unit-testing')];

      const mapping = await staticManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        experiences
      );

      const initialCoefficient = mapping.transferCoefficient;

      await staticManager.adjustTransferCoefficient(mapping.id, true);

      const mappings = staticManager.getAllMappings();
      const updatedMapping = mappings.find(m => m.id === mapping.id);

      expect(updatedMapping?.transferCoefficient).toBe(initialCoefficient);

      staticManager.dispose();
    });

    it('should clamp coefficient between 0.1 and 1.0', async () => {
      const adaptiveManager = new TransferLearningManager(memoryStore, {
        adaptiveCoefficient: true,
        defaultTransferCoefficient: 0.95
      });
      await adaptiveManager.initialize();

      const experiences = [createExperience('test-1', 1.0, 'unit-testing')];

      const mapping = await adaptiveManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        experiences
      );

      // Try to increase beyond 1.0
      for (let i = 0; i < 5; i++) {
        await adaptiveManager.adjustTransferCoefficient(mapping.id, true);
      }

      const mappings = adaptiveManager.getAllMappings();
      const updatedMapping = mappings.find(m => m.id === mapping.id);

      expect(updatedMapping?.transferCoefficient).toBeLessThanOrEqual(1.0);

      adaptiveManager.dispose();
    });
  });

  describe('Transfer Metrics', () => {
    it('should track transfer metrics', async () => {
      const experiences = [createExperience('test-1', 1.0, 'unit-testing')];

      const mapping = await transferManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        experiences
      );

      const metrics = transferManager.getTransferMetrics(
        'unit-testing',
        'integration-testing'
      );

      expect(metrics).toBeDefined();
      expect(metrics?.mappingId).toBe(mapping.id);
      expect(metrics?.sourceDomain).toBe('unit-testing');
      expect(metrics?.targetDomain).toBe('integration-testing');
      expect(metrics?.totalTransfers).toBeGreaterThan(0);
    });

    it('should calculate transfer efficiency', async () => {
      const experiences = [createExperience('test-1', 1.0, 'unit-testing')];

      await transferManager.transferKnowledge(
        'api-testing',
        'contract-testing',
        experiences
      );

      const metrics = transferManager.getTransferMetrics(
        'api-testing',
        'contract-testing'
      );

      expect(metrics?.transferEfficiency).toBeGreaterThanOrEqual(0);
      expect(metrics?.transferEfficiency).toBeLessThanOrEqual(1);
    });

    it('should return undefined for non-existent mapping', () => {
      const metrics = transferManager.getTransferMetrics(
        'unit-testing',
        'load-testing'
      );

      expect(metrics).toBeUndefined();
    });

    it('should return all metrics', async () => {
      const experiences = [createExperience('test-1', 1.0, 'unit-testing')];

      await transferManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        experiences
      );

      await transferManager.transferKnowledge(
        'api-testing',
        'contract-testing',
        experiences
      );

      const allMetrics = transferManager.getAllMetrics();

      expect(allMetrics.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Integration with AgentDB', () => {
    it('should persist transfer mappings to database', async () => {
      const experiences = [createExperience('test-1', 1.0, 'unit-testing')];

      const mapping = await transferManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        experiences
      );

      // Retrieve from memory store
      const stored = await memoryStore.retrieve(
        `transfer-learning/mappings/${mapping.id}`,
        { partition: 'learning' }
      );

      expect(stored).toBeDefined();
      expect((stored as TransferMapping).id).toBe(mapping.id);
    });

    it('should persist transfer metrics to database', async () => {
      const experiences = [createExperience('test-1', 1.0, 'unit-testing')];

      const mapping = await transferManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        experiences
      );

      const metrics = transferManager.getTransferMetrics(
        'unit-testing',
        'integration-testing'
      );

      // Retrieve from memory store
      const stored = await memoryStore.retrieve(
        `transfer-learning/metrics/${mapping.id}`,
        { partition: 'learning' }
      );

      expect(stored).toBeDefined();
      expect((stored as TransferMetrics).mappingId).toBe(metrics?.mappingId);
    });

    it('should persist transferred experiences to database', async () => {
      const experiences = [
        createExperience('test-1', 1.0, 'unit-testing'),
        createExperience('test-2', 1.5, 'unit-testing')
      ];

      await transferManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        experiences
      );

      // Retrieve from memory store
      const stored = await memoryStore.retrieve(
        'transfer-learning/experiences/integration-testing',
        { partition: 'learning' }
      );

      expect(stored).toBeDefined();
      expect(Array.isArray(stored)).toBe(true);
      expect((stored as TaskExperience[]).length).toBeGreaterThan(0);
    });
  });

  describe('Multiple Domain Transfers', () => {
    it('should support transfer from multiple source domains', async () => {
      const unitExperiences = [createExperience('unit-1', 1.0, 'unit-testing')];
      const apiExperiences = [createExperience('api-1', 1.5, 'api-testing')];

      await transferManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        unitExperiences
      );

      await transferManager.transferKnowledge(
        'api-testing',
        'integration-testing',
        apiExperiences
      );

      const allMappings = transferManager.getAllMappings();
      const integrationMappings = allMappings.filter(
        m => m.targetDomain === 'integration-testing'
      );

      expect(integrationMappings.length).toBe(2);
    });

    it('should support transfer to multiple target domains', async () => {
      const experiences = [createExperience('test-1', 1.0, 'unit-testing')];

      await transferManager.transferKnowledge(
        'unit-testing',
        'integration-testing',
        experiences
      );

      await transferManager.transferKnowledge(
        'unit-testing',
        'regression-testing',
        experiences
      );

      const allMappings = transferManager.getAllMappings();
      const unitMappings = allMappings.filter(
        m => m.sourceDomain === 'unit-testing'
      );

      expect(unitMappings.length).toBe(2);
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createExperience(
  taskId: string,
  reward: number,
  taskType: string
): TaskExperience {
  const state: TaskState = {
    taskComplexity: 0.5,
    requiredCapabilities: ['testing'],
    contextFeatures: {},
    previousAttempts: 0,
    availableResources: 1.0
  };

  const action: AgentAction = {
    strategy: 'default',
    toolsUsed: ['jest'],
    parallelization: 0.5,
    retryPolicy: 'exponential',
    resourceAllocation: 0.5
  };

  return {
    taskId,
    taskType,
    state,
    action,
    reward,
    nextState: state,
    timestamp: new Date(),
    agentId: 'test-agent'
  };
}
