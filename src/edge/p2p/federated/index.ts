/**
 * Federated Learning Infrastructure
 *
 * Privacy-preserving distributed learning across QE agents.
 * Enables collaborative model training without sharing raw data.
 *
 * Features:
 * - Multiple aggregation strategies (FedAvg, FedProx, FedMA)
 * - Differential privacy support
 * - Secure aggregation with secret sharing
 * - Byzantine-resilient aggregation
 * - Model checkpointing and rollback
 * - Convergence monitoring
 *
 * @module edge/p2p/federated
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   FederatedCoordinator,
 *   createFederatedConfig,
 *   createModelArchitecture,
 *   AggregationStrategy,
 *   SelectionStrategy,
 * } from '@ruvector/edge/p2p/federated';
 *
 * // Define model architecture
 * const architecture = createModelArchitecture('my-model', [
 *   { name: 'dense1', type: 'dense', shape: [128, 64] },
 *   { name: 'dense2', type: 'dense', shape: [64, 10] },
 * ]);
 *
 * // Create federated config
 * const config = createFederatedConfig('session-1', 'my-model', 100, {
 *   aggregationStrategy: AggregationStrategy.FED_AVG,
 *   selectionStrategy: SelectionStrategy.RANDOM,
 *   differentialPrivacy: {
 *     enabled: true,
 *     epsilon: 1.0,
 *     delta: 1e-5,
 *     mechanism: 'gaussian',
 *     sensitivity: 1.0,
 *     clipNorm: 1.0,
 *     trackBudget: true,
 *   },
 * });
 *
 * // Create coordinator
 * const coordinator = new FederatedCoordinator({
 *   federatedConfig: config,
 *   modelConfig: { architecture },
 * });
 *
 * // Start training
 * const result = await coordinator.startTraining();
 * ```
 */

// ============================================
// Types
// ============================================

export type {
  // Configuration
  FederatedConfig,
  FLDifferentialPrivacyConfig,
  SecureAggregationConfig,
  CompressionConfig,
  ConvergenceCriteria,
  LocalTrainingConfig,

  // Model
  ModelLayer,
  ModelArchitecture,
  ModelWeights,
  ModelUpdate,
  ModelCheckpoint,
  OptimizerConfig,
  CompressionInfo,
  LocalTrainingMetrics,
  TrainingMetrics,

  // Round
  RoundState,
  RoundMetrics,
  RoundError,
  Participant,
  ParticipantCapabilities,
  ParticipantHistory,

  // Aggregation
  AggregationResult,
  AggregationMetrics,
  PrivacyBudget,

  // Events
  FederatedEvent,
  FederatedEventHandler,

  // Protocol Messages
  RoundAnnouncement,
  JoinRequest,
  JoinResponse,
  UpdateSubmission,
  AggregationBroadcast,
} from './types';

export {
  // Enums
  AggregationStrategy,
  SelectionStrategy,
  RoundStatus,
  UpdateType,
  ConvergenceStatus,
  FederatedEventType,
  FederatedErrorCode,

  // Error class
  FederatedError,

  // Constants
  FEDERATED_PROTOCOL_VERSION,
  DEFAULT_LOCAL_EPOCHS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_LEARNING_RATE,
  DEFAULT_MIN_PARTICIPATION,
  DEFAULT_ROUND_TIMEOUT,
  DEFAULT_CHECKPOINT_INTERVAL,
  DEFAULT_GRADIENT_CLIP_NORM,
  FL_DEFAULT_DP_EPSILON,
  FL_DEFAULT_DP_DELTA,
  MAX_MODEL_SIZE,
  MAX_PARTICIPANTS_PER_ROUND,

  // Default configs
  DEFAULT_FEDERATED_CONFIG,
  FL_DEFAULT_DP_CONFIG,
  DEFAULT_SECURE_AGGREGATION_CONFIG,
  DEFAULT_COMPRESSION_CONFIG,
  DEFAULT_CONVERGENCE_CRITERIA,
} from './types';

// ============================================
// Classes
// ============================================

export {
  GradientAggregator,
  createGradientAggregator,
  type GradientAggregatorConfig,
} from './GradientAggregator';

export {
  FederatedRound,
  createFederatedRound,
  type RoundConfig,
  type ParticipantInfo,
  RoundEventType,
  type RoundEvent,
  type RoundEventHandler,
} from './FederatedRound';

export {
  ModelManager,
  createModelManager,
  createModelArchitecture,
  type ModelManagerConfig,
  type LocalTrainingOptions,
} from './ModelManager';

export {
  FederatedCoordinator,
  createFederatedCoordinator,
  createFederatedConfig,
  type CoordinatorConfig,
  type TransportAdapter,
  type TrainingResult,
} from './FederatedCoordinator';
