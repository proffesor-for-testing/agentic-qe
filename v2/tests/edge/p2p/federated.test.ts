/**
 * Federated Learning Infrastructure Tests
 *
 * Tests for P2-005: Federated Learning Infrastructure including:
 * - FedAvg aggregation
 * - Gradient clipping
 * - Differential privacy noise injection
 * - Round coordination
 * - Participant selection
 * - Failure handling
 * - Convergence monitoring
 *
 * @module tests/edge/p2p/federated
 */


import {
  // Types
  AggregationStrategy,
  SelectionStrategy,
  RoundStatus,
  UpdateType,
  ConvergenceStatus,
  FederatedEventType,
  FederatedErrorCode,
  FederatedError,

  // Classes
  GradientAggregator,
  FederatedRound,
  ModelManager,
  FederatedCoordinator,

  // Factory functions
  createGradientAggregator,
  createFederatedRound,
  createModelManager,
  createModelArchitecture,
  createFederatedCoordinator,
  createFederatedConfig,

  // Types
  type ModelWeights,
  type ModelUpdate,
  type FederatedConfig,
  type ParticipantInfo,
  type RoundConfig,
} from '../../../src/edge/p2p/federated';

// ============================================
// Test Fixtures
// ============================================

function createTestWeights(layerSizes: number[] = [100, 50, 10]): ModelWeights {
  const weights = new Map<string, Float32Array>();
  const shapes = new Map<string, number[]>();
  let totalBytes = 0;

  layerSizes.forEach((size, i) => {
    const layerName = `layer_${i}`;
    const data = new Float32Array(size);
    for (let j = 0; j < size; j++) {
      data[j] = Math.random() * 2 - 1; // Random values between -1 and 1
    }
    weights.set(layerName, data);
    shapes.set(layerName, [size]);
    totalBytes += size * 4; // Float32 = 4 bytes
  });

  return {
    modelId: 'test-model',
    version: '1.0.0',
    weights,
    shapes,
    totalBytes,
    checksum: 'test-checksum',
    timestamp: Date.now(),
  };
}

function createTestUpdate(
  participantId: string,
  roundId: string,
  sampleCount: number = 100,
  layerSizes: number[] = [100, 50, 10]
): ModelUpdate {
  const deltas = new Map<string, Float32Array>();

  layerSizes.forEach((size, i) => {
    const layerName = `layer_${i}`;
    const data = new Float32Array(size);
    for (let j = 0; j < size; j++) {
      data[j] = (Math.random() - 0.5) * 0.1; // Small random deltas
    }
    deltas.set(layerName, data);
  });

  return {
    updateId: `update-${participantId}-${Date.now()}`,
    participantId,
    roundId,
    updateType: UpdateType.GRADIENTS,
    deltas,
    sampleCount,
    localLoss: Math.random() * 0.5,
    localEpochs: 5,
    metrics: {
      lossHistory: [0.5, 0.4, 0.35, 0.32, 0.3],
      finalLoss: 0.3,
      trainingTime: 1000,
      gradientSteps: 50,
    },
    timestamp: Date.now(),
  };
}

function createTestArchitecture() {
  return createModelArchitecture('test-model', [
    { name: 'layer_0', type: 'dense', shape: [100] },
    { name: 'layer_1', type: 'dense', shape: [50] },
    { name: 'layer_2', type: 'dense', shape: [10] },
  ]);
}

function createTestParticipants(count: number): Map<string, ParticipantInfo> {
  const participants = new Map<string, ParticipantInfo>();

  for (let i = 0; i < count; i++) {
    participants.set(`participant-${i}`, {
      participantId: `participant-${i}`,
      channelId: `channel-${i}`,
      sampleCount: 100 + Math.floor(Math.random() * 100),
      capabilities: {
        secureAggregation: true,
        differentialPrivacy: true,
        compression: true,
        maxModelSize: 50 * 1024 * 1024,
        computeScore: 0.8,
      },
      trustScore: 0.9,
    });
  }

  return participants;
}

// ============================================
// GradientAggregator Tests
// ============================================

describe('GradientAggregator', () => {
  describe('FedAvg aggregation', () => {
    it('should aggregate updates using weighted average', async () => {
      const aggregator = createGradientAggregator({
        strategy: AggregationStrategy.FED_AVG,
        enableClipping: false,
      });

      const globalModel = createTestWeights();
      const updates = [
        createTestUpdate('p1', 'round-1', 100),
        createTestUpdate('p2', 'round-1', 200),
        createTestUpdate('p3', 'round-1', 100),
      ];

      const result = await aggregator.aggregate(updates, globalModel);

      expect(result.updateCount).toBe(3);
      expect(result.totalSamples).toBe(400);
      expect(result.aggregatedWeights).toBeDefined();
      expect(result.aggregatedWeights.weights.size).toBe(3);
      expect(result.metrics.aggregationTime).toBeGreaterThanOrEqual(0);
    });

    it('should weight updates by sample count', async () => {
      const aggregator = createGradientAggregator({
        strategy: AggregationStrategy.FED_AVG,
        enableClipping: false,
      });

      const globalModel = createTestWeights([10]);

      // Create updates with known deltas
      const update1 = createTestUpdate('p1', 'round-1', 300);
      const update2 = createTestUpdate('p2', 'round-1', 100);

      // Set specific deltas for testing
      update1.deltas.set('layer_0', new Float32Array(10).fill(1.0));
      update2.deltas.set('layer_0', new Float32Array(10).fill(-1.0));

      const result = await aggregator.aggregate([update1, update2], globalModel);

      // With 300:100 weighting, result should be (1.0 * 0.75) + (-1.0 * 0.25) = 0.5
      const aggregatedLayer = result.aggregatedWeights.weights.get('layer_0')!;
      const originalLayer = globalModel.weights.get('layer_0')!;

      // The aggregated value should be original + weighted delta
      const expectedDelta = (1.0 * 0.75) + (-1.0 * 0.25); // 0.5
      expect(aggregatedLayer[0]).toBeCloseTo(originalLayer[0] + expectedDelta, 5);
    });

    it('should throw error with no updates', async () => {
      const aggregator = createGradientAggregator();
      const globalModel = createTestWeights();

      await expect(aggregator.aggregate([], globalModel)).rejects.toThrow(FederatedError);
    });
  });

  describe('Gradient clipping', () => {
    it('should clip gradients to specified norm', () => {
      const aggregator = createGradientAggregator({
        strategy: AggregationStrategy.FED_AVG,
        enableClipping: true,
        clipNorm: 1.0,
      });

      // Create update with large gradients
      const update = createTestUpdate('p1', 'round-1');
      update.deltas.set('layer_0', new Float32Array(100).fill(10.0)); // Large values

      const clipped = aggregator.clipGradients(update);

      // Compute clipped norm
      const clippedNorm = aggregator.computeGradientNorm(clipped);
      expect(clippedNorm).toBeLessThanOrEqual(1.01); // Allow small tolerance
    });

    it('should not modify gradients within norm', () => {
      const aggregator = createGradientAggregator({
        enableClipping: true,
        clipNorm: 100.0, // High clip norm
      });

      const update = createTestUpdate('p1', 'round-1');
      const originalNorm = aggregator.computeGradientNorm(update);

      const clipped = aggregator.clipGradients(update);
      const clippedNorm = aggregator.computeGradientNorm(clipped);

      expect(clippedNorm).toBeCloseTo(originalNorm, 5);
    });
  });

  describe('Differential privacy', () => {
    it('should add noise when DP is enabled', async () => {
      const aggregator = createGradientAggregator({
        strategy: AggregationStrategy.FED_AVG,
        enableClipping: true,
        clipNorm: 1.0,
        differentialPrivacy: {
          enabled: true,
          epsilon: 1.0,
          delta: 1e-5,
          mechanism: 'gaussian',
          sensitivity: 1.0,
          clipNorm: 1.0,
          trackBudget: true,
        },
      });

      const globalModel = createTestWeights([10]);
      const updates = [createTestUpdate('p1', 'round-1', 100)];
      updates[0].deltas.set('layer_0', new Float32Array(10).fill(0.0));

      const result = await aggregator.aggregate(updates, globalModel);

      // With DP noise, aggregated weights should differ from original
      const aggregatedLayer = result.aggregatedWeights.weights.get('layer_0')!;
      const originalLayer = globalModel.weights.get('layer_0')!;

      // At least some values should be different due to noise
      let hasDifference = false;
      for (let i = 0; i < aggregatedLayer.length; i++) {
        if (Math.abs(aggregatedLayer[i] - originalLayer[i]) > 1e-6) {
          hasDifference = true;
          break;
        }
      }
      expect(hasDifference).toBe(true);
    });

    it('should track privacy budget', async () => {
      const aggregator = createGradientAggregator({
        differentialPrivacy: {
          enabled: true,
          epsilon: 0.1,
          delta: 1e-5,
          mechanism: 'gaussian',
          sensitivity: 1.0,
          clipNorm: 1.0,
          trackBudget: true,
          totalBudget: 1.0,
        },
      });

      const globalModel = createTestWeights();
      const updates = [createTestUpdate('p1', 'round-1')];

      // Run multiple aggregations
      for (let i = 0; i < 5; i++) {
        await aggregator.aggregate(updates, globalModel);
      }

      const budget = aggregator.getPrivacyBudget();
      expect(budget.consumedEpsilon).toBeGreaterThan(0);
      expect(budget.remainingEpsilon).toBeLessThan(budget.totalEpsilon);
      expect(budget.epsilonHistory.length).toBe(5);
    });
  });

  describe('Byzantine-resilient aggregation', () => {
    it('should use trimmed mean to exclude outliers', async () => {
      const aggregator = createGradientAggregator({
        strategy: AggregationStrategy.TRIMMED_MEAN,
        trimRatio: 0.2, // Trim 20%
        enableClipping: false,
      });

      const globalModel = createTestWeights([10]);

      // Create updates with one outlier
      const updates = [
        createTestUpdate('p1', 'round-1', 100),
        createTestUpdate('p2', 'round-1', 100),
        createTestUpdate('p3', 'round-1', 100),
        createTestUpdate('p4', 'round-1', 100),
        createTestUpdate('p5', 'round-1', 100), // Will be outlier
      ];

      // Make p5 an outlier with very different gradients
      updates[4].deltas.set('layer_0', new Float32Array(10).fill(1000.0));

      const result = await aggregator.aggregate(updates, globalModel);

      // Outlier should be excluded
      expect(result.excludedUpdates.length).toBeGreaterThanOrEqual(1);
      expect(result.updateCount).toBeLessThan(5);
    });

    it('should use Krum to select closest updates', async () => {
      const aggregator = createGradientAggregator({
        strategy: AggregationStrategy.KRUM,
        byzantineTolerance: 1,
        enableClipping: false,
      });

      const globalModel = createTestWeights([10]);

      // Create updates with similar gradients
      const updates = [];
      for (let i = 0; i < 5; i++) {
        const update = createTestUpdate(`p${i}`, 'round-1', 100);
        update.deltas.set('layer_0', new Float32Array(10).fill(0.1 * (i + 1)));
        updates.push(update);
      }

      const result = await aggregator.aggregate(updates, globalModel);

      expect(result.updateCount).toBe(1); // Krum selects one update
      expect(result.aggregatedWeights).toBeDefined();
    });
  });
});

// ============================================
// FederatedRound Tests
// ============================================

describe('FederatedRound', () => {
  let mockSendMessage: ReturnType<typeof jest.fn>;
  let mockBroadcastMessage: ReturnType<typeof jest.fn>;
  const activeRounds: { cancel: (reason: string) => void }[] = [];

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue(undefined);
    mockBroadcastMessage = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Clean up any active rounds
    for (const round of activeRounds) {
      try {
        round.cancel('Test cleanup');
      } catch {
        // Ignore cleanup errors
      }
    }
    activeRounds.length = 0;

    // Allow time for async cleanup
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  describe('Round lifecycle', () => {
    it('should start a round and transition through states', async () => {
      const aggregator = createGradientAggregator();
      const globalModel = createTestWeights();
      const participants = createTestParticipants(5);

      const config = createFederatedConfig('session-1', 'test-model', 10, {
        minParticipation: 0.2,
        maxParticipants: 5,
        roundTimeout: 5000,
      });

      const roundConfig: RoundConfig = {
        sessionId: config.sessionId,
        roundNumber: 0,
        federatedConfig: config,
        globalModel,
        availableParticipants: participants,
        aggregator,
        sendMessage: mockSendMessage,
        broadcastMessage: mockBroadcastMessage,
      };

      const round = createFederatedRound(roundConfig);

      expect(round.getStatus()).toBe(RoundStatus.PREPARING);

      // Start the round - don't await as it waits for completion
      void round.start();

      // Also catch the waitForCompletion promise to prevent unhandled rejections
      void round.waitForCompletion().catch(() => {
        // Expected: round will be cancelled
      });

      // Give some time for state transitions
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect([
        RoundStatus.AWAITING_PARTICIPANTS,
        RoundStatus.ANNOUNCED,
        RoundStatus.COLLECTING,
      ]).toContain(round.getStatus());

      // Cleanup
      round.cancel('Test cleanup');

      // Allow promises to settle
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    it('should handle join requests', async () => {
      const aggregator = createGradientAggregator();
      const globalModel = createTestWeights();
      const participants = createTestParticipants(5);

      const config = createFederatedConfig('session-1', 'test-model', 10, {
        minParticipation: 0.2,
        maxParticipants: 10,
        roundTimeout: 10000,
      });

      const roundConfig: RoundConfig = {
        sessionId: config.sessionId,
        roundNumber: 0,
        federatedConfig: config,
        globalModel,
        availableParticipants: participants,
        aggregator,
        sendMessage: mockSendMessage,
        broadcastMessage: mockBroadcastMessage,
      };

      const round = createFederatedRound(roundConfig);
      void round.start();
      void round.waitForCompletion().catch(() => {
        // Expected: round will be cancelled
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const joinRequest = {
        type: 'join_request' as const,
        sessionId: config.sessionId,
        roundId: round.getRoundId(),
        participantId: 'new-participant',
        sampleCount: 150,
        capabilities: {
          secureAggregation: true,
          differentialPrivacy: true,
          compression: true,
          maxModelSize: 50 * 1024 * 1024,
          computeScore: 0.8,
        },
      };

      const response = await round.handleJoinRequest(joinRequest);

      expect(response.accepted).toBe(true);
      expect(response.weight).toBeDefined();
      expect(response.model).toBeDefined();

      // Cleanup
      round.cancel('Test cleanup');
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    it('should reject join request for wrong round', async () => {
      const aggregator = createGradientAggregator();
      const globalModel = createTestWeights();
      const participants = createTestParticipants(5);

      const config = createFederatedConfig('session-1', 'test-model', 10);

      const roundConfig: RoundConfig = {
        sessionId: config.sessionId,
        roundNumber: 0,
        federatedConfig: config,
        globalModel,
        availableParticipants: participants,
        aggregator,
        sendMessage: mockSendMessage,
        broadcastMessage: mockBroadcastMessage,
      };

      const round = createFederatedRound(roundConfig);
      void round.start();
      void round.waitForCompletion().catch(() => {
        // Expected: round will be cancelled
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const joinRequest = {
        type: 'join_request' as const,
        sessionId: config.sessionId,
        roundId: 'wrong-round-id',
        participantId: 'new-participant',
        sampleCount: 150,
        capabilities: {
          secureAggregation: true,
          differentialPrivacy: true,
          compression: true,
          maxModelSize: 50 * 1024 * 1024,
          computeScore: 0.8,
        },
      };

      const response = await round.handleJoinRequest(joinRequest);

      expect(response.accepted).toBe(false);
      expect(response.rejectionReason).toBe('Wrong round ID');

      // Cleanup
      round.cancel('Test cleanup');
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  });

  describe('Update collection', () => {
    it('should accept valid update submissions', async () => {
      const aggregator = createGradientAggregator();
      const globalModel = createTestWeights();
      const participants = createTestParticipants(3);

      const config = createFederatedConfig('session-1', 'test-model', 10, {
        minParticipation: 0.1, // Lower to allow single participant
        maxParticipants: 10,
        roundTimeout: 10000,
      });

      const roundConfig: RoundConfig = {
        sessionId: config.sessionId,
        roundNumber: 0,
        federatedConfig: config,
        globalModel,
        availableParticipants: participants,
        aggregator,
        sendMessage: mockSendMessage,
        broadcastMessage: mockBroadcastMessage,
      };

      const round = createFederatedRound(roundConfig);
      round.start();

      // Wait for round to transition to collecting state
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Join first
      const joinResponse = await round.handleJoinRequest({
        type: 'join_request',
        sessionId: config.sessionId,
        roundId: round.getRoundId(),
        participantId: 'participant-0',
        sampleCount: 100,
        capabilities: {
          secureAggregation: true,
          differentialPrivacy: true,
          compression: true,
          maxModelSize: 50 * 1024 * 1024,
          computeScore: 0.8,
        },
      });

      expect(joinResponse.accepted).toBe(true);

      // Submit update
      const update = createTestUpdate('participant-0', round.getRoundId());
      const accepted = await round.handleUpdateSubmission({
        type: 'update_submission',
        sessionId: config.sessionId,
        roundId: round.getRoundId(),
        update,
      });

      expect(accepted).toBe(true);
      expect(round.getUpdates().size).toBe(1);

      // Cleanup - wrap in try/catch
      try {
        round.cancel('Test cleanup');
      } catch {
        // Ignore cleanup errors
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  });

  describe('Failure handling', () => {
    it('should handle participant dropout', async () => {
      const aggregator = createGradientAggregator();
      const globalModel = createTestWeights();
      const participants = createTestParticipants(5);

      const config = createFederatedConfig('session-1', 'test-model', 10, {
        minParticipation: 0.2,
        roundTimeout: 10000,
      });

      const roundConfig: RoundConfig = {
        sessionId: config.sessionId,
        roundNumber: 0,
        federatedConfig: config,
        globalModel,
        availableParticipants: participants,
        aggregator,
        sendMessage: mockSendMessage,
        broadcastMessage: mockBroadcastMessage,
      };

      const round = createFederatedRound(roundConfig);
      void round.start();
      void round.waitForCompletion().catch(() => {
        // Expected: round will be cancelled
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Join a participant
      await round.handleJoinRequest({
        type: 'join_request',
        sessionId: config.sessionId,
        roundId: round.getRoundId(),
        participantId: 'dropout-participant',
        sampleCount: 100,
        capabilities: {
          secureAggregation: true,
          differentialPrivacy: true,
          compression: true,
          maxModelSize: 50 * 1024 * 1024,
          computeScore: 0.8,
        },
      });

      expect(round.getParticipants().size).toBe(1);

      // Simulate dropout
      round.handleParticipantDropout('dropout-participant');

      expect(round.getParticipants().size).toBe(0);

      // Cleanup
      round.cancel('Test cleanup');
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    it('should cancel round on request', async () => {
      const aggregator = createGradientAggregator();
      const globalModel = createTestWeights();
      const participants = createTestParticipants(5);

      const config = createFederatedConfig('session-1', 'test-model', 10);

      const roundConfig: RoundConfig = {
        sessionId: config.sessionId,
        roundNumber: 0,
        federatedConfig: config,
        globalModel,
        availableParticipants: participants,
        aggregator,
        sendMessage: mockSendMessage,
        broadcastMessage: mockBroadcastMessage,
      };

      const round = createFederatedRound(roundConfig);
      void round.start();
      void round.waitForCompletion().catch(() => {
        // Expected: round will be cancelled
      });

      round.cancel('User requested cancellation');

      expect(round.getStatus()).toBe(RoundStatus.CANCELLED);
      expect(round.isFinished()).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  });
});

// ============================================
// ModelManager Tests
// ============================================

describe('ModelManager', () => {
  const architecture = createTestArchitecture();

  describe('Weight management', () => {
    it('should set and get weights', () => {
      const manager = createModelManager({ architecture });
      const weights = createTestWeights();

      manager.setWeights(weights);
      const retrieved = manager.getWeights();

      expect(retrieved).not.toBeNull();
      expect(retrieved!.modelId).toBe(weights.modelId);
      expect(retrieved!.weights.size).toBe(weights.weights.size);
    });

    it('should clone weights to prevent mutation', () => {
      const manager = createModelManager({ architecture });
      const weights = createTestWeights();

      manager.setWeights(weights);

      // Modify original
      weights.weights.get('layer_0')![0] = 999;

      // Manager's copy should be unchanged
      const retrieved = manager.getWeights();
      expect(retrieved!.weights.get('layer_0')![0]).not.toBe(999);
    });

    it('should track previous weights for rollback', () => {
      const manager = createModelManager({ architecture });

      const weights1 = createTestWeights();
      weights1.version = '1.0.0';
      manager.setWeights(weights1);

      const weights2 = createTestWeights();
      weights2.version = '1.0.1';
      manager.setWeights(weights2);

      const previous = manager.getPreviousWeights();
      expect(previous).not.toBeNull();
      expect(previous!.version).toBe('1.0.0');
    });
  });

  describe('Local training', () => {
    it('should generate model update from local training', async () => {
      const manager = createModelManager({
        architecture,
        optimizer: { type: 'sgd', learningRate: 0.01 },
      });

      manager.setWeights(createTestWeights());

      const update = await manager.trainLocal({
        epochs: 3,
        batchSize: 16,
        learningRate: 0.01,
        updateType: UpdateType.GRADIENTS,
      });

      expect(update.updateId).toBeDefined();
      expect(update.updateType).toBe(UpdateType.GRADIENTS);
      expect(update.localEpochs).toBe(3);
      expect(update.deltas.size).toBeGreaterThan(0);
      expect(update.metrics.lossHistory.length).toBe(3);
    });

    it('should throw error if no weights set', async () => {
      const manager = createModelManager({ architecture });

      await expect(
        manager.trainLocal({
          epochs: 1,
          batchSize: 16,
          learningRate: 0.01,
          updateType: UpdateType.GRADIENTS,
        })
      ).rejects.toThrow(FederatedError);
    });
  });

  describe('Checkpointing', () => {
    it('should create and restore checkpoints', () => {
      const manager = createModelManager({
        architecture,
        checkpointInterval: 5,
        maxCheckpoints: 3,
      });

      manager.setWeights(createTestWeights());

      const metrics = {
        currentRound: 5,
        totalRounds: 100,
        bestLoss: 0.1,
        bestRound: 5,
        lossHistory: [0.5, 0.4, 0.3, 0.2, 0.1],
        convergenceStatus: ConvergenceStatus.CONVERGING,
        startTime: Date.now(),
        totalTrainingTime: 10000,
        totalCommunicationBytes: 1000000,
        avgParticipationRate: 0.8,
      };

      const checkpoint = manager.checkpoint('session-1', 5, metrics);

      expect(checkpoint.checkpointId).toBeDefined();
      expect(checkpoint.roundNumber).toBe(5);
      expect(checkpoint.weights).toBeDefined();

      // Modify weights
      const newWeights = createTestWeights();
      newWeights.version = '2.0.0';
      manager.setWeights(newWeights);

      // Restore checkpoint
      manager.restoreCheckpoint(checkpoint.checkpointId);

      const restored = manager.getWeights();
      expect(restored!.version).toBe('1.0.0');
    });

    it('should prune old checkpoints', () => {
      const manager = createModelManager({
        architecture,
        maxCheckpoints: 2,
      });

      manager.setWeights(createTestWeights());

      const metrics = {
        currentRound: 0,
        totalRounds: 100,
        bestLoss: 0.1,
        bestRound: 0,
        lossHistory: [],
        convergenceStatus: ConvergenceStatus.TRAINING,
        startTime: Date.now(),
        totalTrainingTime: 0,
        totalCommunicationBytes: 0,
        avgParticipationRate: 0,
      };

      // Create 3 checkpoints
      manager.checkpoint('session-1', 1, { ...metrics, currentRound: 1 });
      manager.checkpoint('session-1', 2, { ...metrics, currentRound: 2 });
      manager.checkpoint('session-1', 3, { ...metrics, currentRound: 3 });

      const checkpoints = manager.getCheckpoints();
      expect(checkpoints.length).toBe(2);
      // Should keep most recent
      expect(checkpoints[0].roundNumber).toBe(3);
      expect(checkpoints[1].roundNumber).toBe(2);
    });
  });

  describe('Rollback', () => {
    it('should rollback to previous weights', () => {
      const manager = createModelManager({ architecture });

      const weights1 = createTestWeights();
      weights1.version = '1.0.0';
      manager.setWeights(weights1);

      const weights2 = createTestWeights();
      weights2.version = '2.0.0';
      manager.setWeights(weights2);

      const success = manager.rollback();

      expect(success).toBe(true);
      expect(manager.getWeights()!.version).toBe('1.0.0');
    });

    it('should return false if no previous weights', () => {
      const manager = createModelManager({ architecture });
      manager.setWeights(createTestWeights());

      const success = manager.rollback();
      expect(success).toBe(false);
    });
  });
});

// ============================================
// FederatedCoordinator Tests
// ============================================

describe('FederatedCoordinator', () => {
  const architecture = createTestArchitecture();

  describe('Configuration', () => {
    it('should create coordinator with valid config', () => {
      const config = createFederatedConfig('session-1', 'test-model', 100, {
        aggregationStrategy: AggregationStrategy.FED_AVG,
        selectionStrategy: SelectionStrategy.RANDOM,
      });

      const coordinator = createFederatedCoordinator({
        federatedConfig: config,
        modelConfig: { architecture },
      });

      expect(coordinator.getSessionId()).toBe('session-1');
      expect(coordinator.isTraining()).toBe(false);
      expect(coordinator.getCurrentRound()).toBe(0);
    });

    it('should merge with default config', () => {
      const config = createFederatedConfig('session-1', 'test-model', 50);

      const coordinator = createFederatedCoordinator({
        federatedConfig: config,
        modelConfig: { architecture },
      });

      const fullConfig = coordinator.getConfig();
      expect(fullConfig.localEpochs).toBeDefined();
      expect(fullConfig.batchSize).toBeDefined();
      expect(fullConfig.minParticipation).toBeDefined();
    });
  });

  describe('Training lifecycle', () => {
    it('should emit events during training', async () => {
      const config = createFederatedConfig('session-1', 'test-model', 1, {
        roundTimeout: 100,
        minParticipation: 0,
      });

      const events: FederatedEventType[] = [];

      const mockTransport = {
        send: jest.fn().mockResolvedValue(undefined),
        broadcast: jest.fn().mockResolvedValue(undefined),
        onMessage: jest.fn(),
        getAvailableParticipants: jest.fn().mockResolvedValue(createTestParticipants(3)),
      };

      const coordinator = createFederatedCoordinator({
        federatedConfig: config,
        modelConfig: { architecture },
        initialWeights: createTestWeights(),
        transport: mockTransport,
      });

      coordinator.on((event) => {
        events.push(event.type);
      });

      // Start training (will fail due to no real participants submitting)
      try {
        await Promise.race([
          coordinator.startTraining(),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
      } catch {
        // Expected to timeout/fail in test environment
      }

      coordinator.stopTraining('Test complete');

      expect(events).toContain(FederatedEventType.SESSION_STARTED);
    });

    it('should stop training on request', () => {
      const config = createFederatedConfig('session-1', 'test-model', 100);

      const coordinator = createFederatedCoordinator({
        federatedConfig: config,
        modelConfig: { architecture },
      });

      // Just test that stop doesn't throw when not training
      coordinator.stopTraining('Test stop');
      expect(coordinator.isTraining()).toBe(false);
    });

    it('should reset state', () => {
      const config = createFederatedConfig('session-1', 'test-model', 100);

      const coordinator = createFederatedCoordinator({
        federatedConfig: config,
        modelConfig: { architecture },
        initialWeights: createTestWeights(),
      });

      coordinator.reset();

      expect(coordinator.getCurrentRound()).toBe(0);
      expect(coordinator.getConvergenceStatus()).toBe(ConvergenceStatus.NOT_STARTED);
      expect(coordinator.getModel()).toBeNull();
    });
  });

  describe('Convergence monitoring', () => {
    it('should track training metrics', () => {
      const config = createFederatedConfig('session-1', 'test-model', 100);

      const coordinator = createFederatedCoordinator({
        federatedConfig: config,
        modelConfig: { architecture },
      });

      const metrics = coordinator.getMetrics();

      expect(metrics.currentRound).toBe(0);
      expect(metrics.totalRounds).toBe(100);
      expect(metrics.convergenceStatus).toBe(ConvergenceStatus.NOT_STARTED);
      expect(metrics.lossHistory).toEqual([]);
    });
  });

  describe('Privacy budget', () => {
    it('should track privacy budget when DP enabled', () => {
      const config = createFederatedConfig('session-1', 'test-model', 100, {
        differentialPrivacy: {
          enabled: true,
          epsilon: 1.0,
          delta: 1e-5,
          mechanism: 'gaussian',
          sensitivity: 1.0,
          clipNorm: 1.0,
          trackBudget: true,
          totalBudget: 10.0,
        },
      });

      const coordinator = createFederatedCoordinator({
        federatedConfig: config,
        modelConfig: { architecture },
      });

      const budget = coordinator.getPrivacyBudget();

      expect(budget).not.toBeNull();
      expect(budget!.totalEpsilon).toBe(10.0);
      expect(budget!.consumedEpsilon).toBe(0);
      expect(budget!.exhausted).toBe(false);
    });

    it('should return null when DP not enabled', () => {
      const config = createFederatedConfig('session-1', 'test-model', 100);

      const coordinator = createFederatedCoordinator({
        federatedConfig: config,
        modelConfig: { architecture },
      });

      expect(coordinator.getPrivacyBudget()).toBeNull();
    });
  });
});

// ============================================
// Integration Tests
// ============================================

describe('Federated Learning Integration', () => {
  it('should complete full aggregation flow', async () => {
    // Create aggregator
    const aggregator = createGradientAggregator({
      strategy: AggregationStrategy.FED_AVG,
      enableClipping: true,
      clipNorm: 1.0,
    });

    // Create global model
    const globalModel = createTestWeights([64, 32, 10]);

    // Create multiple updates with known sample counts
    const sampleCounts = [100, 150, 200, 250, 300];
    const expectedTotal = sampleCounts.reduce((a, b) => a + b, 0); // 1000

    const updates = [];
    for (let i = 0; i < 5; i++) {
      updates.push(createTestUpdate(`p${i}`, 'round-1', sampleCounts[i], [64, 32, 10]));
    }

    // Aggregate
    const result = await aggregator.aggregate(updates, globalModel);

    // Verify result
    expect(result.updateCount).toBe(5);
    expect(result.totalSamples).toBe(expectedTotal);
    expect(result.aggregatedWeights.weights.size).toBe(3);
    expect(result.metrics.aggregationTime).toBeGreaterThanOrEqual(0);
    expect(result.metrics.weightNorm).toBeGreaterThan(0);
  });

  it('should handle model manager update cycle', () => {
    const architecture = createTestArchitecture();
    const manager = createModelManager({
      architecture,
      optimizer: { type: 'adam', learningRate: 0.001 },
    });

    // Set initial weights
    const initial = createTestWeights();
    manager.setWeights(initial);

    // Apply update
    const updated = createTestWeights();
    updated.version = '1.0.1';
    manager.applyUpdate(updated);

    // Verify
    expect(manager.getWeights()!.version).toBe('1.0.1');
    expect(manager.getPreviousWeights()!.version).toBe('1.0.0');
    expect(manager.getRoundNumber()).toBe(1);
  });
});
