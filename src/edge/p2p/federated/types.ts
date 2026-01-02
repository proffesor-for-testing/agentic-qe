/**
 * Federated Learning Infrastructure Types
 *
 * Type definitions for privacy-preserving distributed learning across QE agents.
 * Enables collaborative model training without sharing raw data, using
 * techniques like FedAvg, FedProx, secure aggregation, and differential privacy.
 *
 * @module edge/p2p/federated/types
 * @version 1.0.0
 */

// ============================================
// Protocol Version and Constants
// ============================================

/**
 * Federated learning protocol version
 */
export const FEDERATED_PROTOCOL_VERSION = '1.0.0';

/**
 * Default number of local training epochs
 */
export const DEFAULT_LOCAL_EPOCHS = 5;

/**
 * Default batch size for local training
 */
export const DEFAULT_BATCH_SIZE = 32;

/**
 * Default learning rate
 */
export const DEFAULT_LEARNING_RATE = 0.01;

/**
 * Default minimum participation ratio for a round
 */
export const DEFAULT_MIN_PARTICIPATION = 0.3;

/**
 * Default round timeout in milliseconds (5 minutes)
 */
export const DEFAULT_ROUND_TIMEOUT = 5 * 60 * 1000;

/**
 * Default model checkpoint interval (every 10 rounds)
 */
export const DEFAULT_CHECKPOINT_INTERVAL = 10;

/**
 * Maximum gradient norm for clipping
 */
export const DEFAULT_GRADIENT_CLIP_NORM = 1.0;

/**
 * Default differential privacy epsilon for federated learning
 */
export const FL_DEFAULT_DP_EPSILON = 1.0;

/**
 * Default differential privacy delta for federated learning
 */
export const FL_DEFAULT_DP_DELTA = 1e-5;

/**
 * Maximum model size in bytes (50MB)
 */
export const MAX_MODEL_SIZE = 50 * 1024 * 1024;

/**
 * Maximum number of participants per round
 */
export const MAX_PARTICIPANTS_PER_ROUND = 100;

// ============================================
// Aggregation Strategies
// ============================================

/**
 * Aggregation strategies for combining model updates
 */
export enum AggregationStrategy {
  /**
   * Federated Averaging: Weighted average based on sample counts
   * McMahan et al., 2017
   */
  FED_AVG = 'fed_avg',

  /**
   * Federated Proximal: Adds proximal term for heterogeneous data
   * Li et al., 2020
   */
  FED_PROX = 'fed_prox',

  /**
   * Federated Matched Averaging: Layer-wise matching
   * Wang et al., 2020
   */
  FED_MA = 'fed_ma',

  /**
   * Weighted median aggregation (Byzantine-resilient)
   */
  WEIGHTED_MEDIAN = 'weighted_median',

  /**
   * Trimmed mean (outlier-resistant)
   */
  TRIMMED_MEAN = 'trimmed_mean',

  /**
   * Krum aggregation (Byzantine-resilient)
   */
  KRUM = 'krum',

  /**
   * Coordinate-wise median
   */
  COORDINATE_MEDIAN = 'coordinate_median',
}

/**
 * Participant selection strategies
 */
export enum SelectionStrategy {
  /** Random selection */
  RANDOM = 'random',

  /** Importance sampling based on data size */
  IMPORTANCE = 'importance',

  /** Priority to participants with more diverse data */
  DIVERSITY = 'diversity',

  /** Round-robin selection */
  ROUND_ROBIN = 'round_robin',

  /** Active learning-based selection */
  ACTIVE = 'active',

  /** Power-of-choice selection */
  POWER_OF_CHOICE = 'power_of_choice',
}

/**
 * Round lifecycle states
 */
export enum RoundStatus {
  /** Round is being prepared */
  PREPARING = 'preparing',

  /** Waiting for participants to join */
  AWAITING_PARTICIPANTS = 'awaiting_participants',

  /** Round announced, collecting updates */
  ANNOUNCED = 'announced',

  /** Collecting model updates */
  COLLECTING = 'collecting',

  /** Aggregating updates */
  AGGREGATING = 'aggregating',

  /** Distributing aggregated model */
  DISTRIBUTING = 'distributing',

  /** Round completed successfully */
  COMPLETED = 'completed',

  /** Round failed */
  FAILED = 'failed',

  /** Round cancelled */
  CANCELLED = 'cancelled',

  /** Round timed out */
  TIMED_OUT = 'timed_out',
}

/**
 * Model update types
 */
export enum UpdateType {
  /** Full model weights */
  FULL_WEIGHTS = 'full_weights',

  /** Gradient deltas only */
  GRADIENTS = 'gradients',

  /** Compressed gradients */
  COMPRESSED_GRADIENTS = 'compressed_gradients',

  /** Sparse updates (top-k) */
  SPARSE = 'sparse',

  /** Quantized updates */
  QUANTIZED = 'quantized',
}

/**
 * Convergence status
 */
export enum ConvergenceStatus {
  /** Not started */
  NOT_STARTED = 'not_started',

  /** Training in progress */
  TRAINING = 'training',

  /** Converging */
  CONVERGING = 'converging',

  /** Converged */
  CONVERGED = 'converged',

  /** Diverging */
  DIVERGING = 'diverging',

  /** Plateaued */
  PLATEAUED = 'plateaued',
}

// ============================================
// Core Configuration Interfaces
// ============================================

/**
 * Main federated learning configuration
 */
export interface FederatedConfig {
  /** Unique identifier for this federated learning session */
  sessionId: string;

  /** Model identifier being trained */
  modelId: string;

  /** Aggregation strategy to use */
  aggregationStrategy: AggregationStrategy;

  /** Participant selection strategy */
  selectionStrategy: SelectionStrategy;

  /** Number of local training epochs */
  localEpochs: number;

  /** Local batch size */
  batchSize: number;

  /** Learning rate */
  learningRate: number;

  /** Minimum participation ratio (0-1) */
  minParticipation: number;

  /** Maximum participants per round */
  maxParticipants: number;

  /** Round timeout in milliseconds */
  roundTimeout: number;

  /** Total number of training rounds */
  totalRounds: number;

  /** Checkpoint interval (save every N rounds) */
  checkpointInterval: number;

  /** Enable gradient clipping */
  enableGradientClipping: boolean;

  /** Gradient clip norm */
  gradientClipNorm: number;

  /** Differential privacy configuration */
  differentialPrivacy?: FLDifferentialPrivacyConfig;

  /** Secure aggregation configuration */
  secureAggregation?: SecureAggregationConfig;

  /** FedProx proximal term (mu) */
  proximalMu?: number;

  /** Model compression configuration */
  compression?: CompressionConfig;

  /** Convergence criteria */
  convergence?: ConvergenceCriteria;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Differential privacy configuration for federated learning
 */
export interface FLDifferentialPrivacyConfig {
  /** Enable differential privacy */
  enabled: boolean;

  /** Privacy budget (epsilon) */
  epsilon: number;

  /** Delta parameter */
  delta: number;

  /** Mechanism to use for noise addition */
  mechanism: 'laplace' | 'gaussian';

  /** Sensitivity bound for gradients */
  sensitivity: number;

  /** Clip gradients to this L2 norm */
  clipNorm: number;

  /** Per-round privacy budget */
  perRoundBudget?: number;

  /** Total privacy budget */
  totalBudget?: number;

  /** Track privacy budget usage */
  trackBudget: boolean;
}

/**
 * Secure aggregation configuration
 */
export interface SecureAggregationConfig {
  /** Enable secure aggregation */
  enabled: boolean;

  /** Threshold for secret reconstruction */
  threshold: number;

  /** Total number of shares */
  totalShares: number;

  /** Enable pairwise masking */
  pairwiseMasking: boolean;

  /** Key agreement protocol */
  keyAgreement: 'diffie_hellman' | 'ecdh';

  /** Enable dropout resilience */
  dropoutResilience: boolean;

  /** Maximum dropout rate supported */
  maxDropoutRate: number;
}

/**
 * Model compression configuration
 */
export interface CompressionConfig {
  /** Enable compression */
  enabled: boolean;

  /** Compression type */
  type: 'quantization' | 'sparsification' | 'low_rank' | 'none';

  /** Quantization bits (for quantization type) */
  quantizationBits?: number;

  /** Sparsification ratio (for sparsification type) */
  sparsificationRatio?: number;

  /** Low rank factor (for low_rank type) */
  lowRankFactor?: number;

  /** Error feedback for compression errors */
  errorFeedback: boolean;
}

/**
 * Convergence criteria
 */
export interface ConvergenceCriteria {
  /** Minimum loss improvement threshold */
  minLossImprovement: number;

  /** Patience (rounds without improvement) */
  patience: number;

  /** Target accuracy (if known) */
  targetAccuracy?: number;

  /** Maximum rounds without improvement */
  maxRoundsWithoutImprovement: number;

  /** Early stopping enabled */
  earlyStoppingEnabled: boolean;
}

// ============================================
// Model and Update Interfaces
// ============================================

/**
 * Model layer definition
 */
export interface ModelLayer {
  /** Layer name/identifier */
  name: string;

  /** Layer type (dense, conv, etc.) */
  type: string;

  /** Weight shape */
  shape: number[];

  /** Total number of parameters */
  parameterCount: number;

  /** Data type */
  dtype: 'float32' | 'float16' | 'int8';

  /** Whether layer is trainable */
  trainable: boolean;
}

/**
 * Model architecture definition
 */
export interface ModelArchitecture {
  /** Model identifier */
  modelId: string;

  /** Model name */
  name: string;

  /** Model version */
  version: string;

  /** Layer definitions */
  layers: ModelLayer[];

  /** Total parameter count */
  totalParameters: number;

  /** Trainable parameter count */
  trainableParameters: number;

  /** Input shape */
  inputShape: number[];

  /** Output shape */
  outputShape: number[];

  /** Optimizer configuration */
  optimizer?: OptimizerConfig;
}

/**
 * Optimizer configuration
 */
export interface OptimizerConfig {
  /** Optimizer type */
  type: 'sgd' | 'adam' | 'adamw' | 'rmsprop';

  /** Learning rate */
  learningRate: number;

  /** Momentum (for SGD) */
  momentum?: number;

  /** Beta1 (for Adam) */
  beta1?: number;

  /** Beta2 (for Adam) */
  beta2?: number;

  /** Weight decay */
  weightDecay?: number;
}

/**
 * Model weights container
 */
export interface ModelWeights {
  /** Model identifier */
  modelId: string;

  /** Model version */
  version: string;

  /** Weights by layer name */
  weights: Map<string, Float32Array>;

  /** Biases by layer name (if separate) */
  biases?: Map<string, Float32Array>;

  /** Weight shapes by layer */
  shapes: Map<string, number[]>;

  /** Total size in bytes */
  totalBytes: number;

  /** Checksum for integrity */
  checksum: string;

  /** Timestamp of creation */
  timestamp: number;
}

/**
 * Model update from a participant
 */
export interface ModelUpdate {
  /** Unique update identifier */
  updateId: string;

  /** Participant who generated this update */
  participantId: string;

  /** Round this update belongs to */
  roundId: string;

  /** Type of update */
  updateType: UpdateType;

  /** Gradient vectors or weight deltas by layer */
  deltas: Map<string, Float32Array>;

  /** Number of local samples used */
  sampleCount: number;

  /** Local loss value */
  localLoss: number;

  /** Local accuracy (if applicable) */
  localAccuracy?: number;

  /** Number of local epochs completed */
  localEpochs: number;

  /** Metrics from local training */
  metrics: LocalTrainingMetrics;

  /** Differential privacy noise added */
  dpNoiseAdded?: boolean;

  /** Update signature */
  signature?: string;

  /** Timestamp of creation */
  timestamp: number;

  /** Compressed format (if applicable) */
  compressed?: boolean;

  /** Compression metadata */
  compressionInfo?: CompressionInfo;
}

/**
 * Compression metadata
 */
export interface CompressionInfo {
  /** Original size in bytes */
  originalSize: number;

  /** Compressed size in bytes */
  compressedSize: number;

  /** Compression ratio */
  compressionRatio: number;

  /** Compression type used */
  compressionType: string;

  /** Indices for sparse updates */
  sparseIndices?: Map<string, Uint32Array>;
}

/**
 * Local training metrics
 */
export interface LocalTrainingMetrics {
  /** Training loss history */
  lossHistory: number[];

  /** Final training loss */
  finalLoss: number;

  /** Training accuracy (if applicable) */
  accuracy?: number;

  /** Training time in milliseconds */
  trainingTime: number;

  /** Number of gradient steps */
  gradientSteps: number;

  /** Gradient norms history */
  gradientNorms?: number[];

  /** Memory usage peak */
  peakMemoryUsage?: number;
}

// ============================================
// Round State Interfaces
// ============================================

/**
 * Participant information
 */
export interface Participant {
  /** Unique participant identifier */
  participantId: string;

  /** Agent channel for communication */
  channelId?: string;

  /** Number of local samples */
  sampleCount: number;

  /** Participation weight */
  weight: number;

  /** Whether participant has submitted update */
  hasSubmitted: boolean;

  /** When participant joined */
  joinedAt: number;

  /** When participant submitted (if applicable) */
  submittedAt?: number;

  /** Participant's public key for secure aggregation */
  publicKey?: string;

  /** Participant capabilities */
  capabilities: ParticipantCapabilities;

  /** Historical performance */
  history?: ParticipantHistory;
}

/**
 * Participant capabilities
 */
export interface ParticipantCapabilities {
  /** Supports secure aggregation */
  secureAggregation: boolean;

  /** Supports differential privacy */
  differentialPrivacy: boolean;

  /** Supports compression */
  compression: boolean;

  /** Maximum model size supported */
  maxModelSize: number;

  /** Compute capability score */
  computeScore: number;
}

/**
 * Participant historical performance
 */
export interface ParticipantHistory {
  /** Total rounds participated */
  totalRounds: number;

  /** Successful submissions */
  successfulSubmissions: number;

  /** Average submission time */
  avgSubmissionTime: number;

  /** Average loss improvement contribution */
  avgLossContribution: number;

  /** Dropout rate */
  dropoutRate: number;

  /** Trust score */
  trustScore: number;
}

/**
 * Round state tracking
 */
export interface RoundState {
  /** Unique round identifier */
  roundId: string;

  /** Round number (0-indexed) */
  roundNumber: number;

  /** Current round status */
  status: RoundStatus;

  /** Participants in this round */
  participants: Map<string, Participant>;

  /** Received model updates */
  updates: Map<string, ModelUpdate>;

  /** Global model at start of round */
  startingModel: ModelWeights;

  /** Aggregated model (after aggregation) */
  aggregatedModel?: ModelWeights;

  /** Round start timestamp */
  startedAt: number;

  /** Round end timestamp */
  endedAt?: number;

  /** Target number of participants */
  targetParticipants: number;

  /** Minimum required participants */
  minParticipants: number;

  /** Round timeout deadline */
  timeoutAt: number;

  /** Round metrics */
  metrics: RoundMetrics;

  /** Errors encountered */
  errors: RoundError[];
}

/**
 * Round metrics
 */
export interface RoundMetrics {
  /** Number of participants who joined */
  participantsJoined: number;

  /** Number of participants who submitted */
  participantsSubmitted: number;

  /** Participation rate */
  participationRate: number;

  /** Total samples across all participants */
  totalSamples: number;

  /** Aggregated loss */
  aggregatedLoss: number;

  /** Aggregated accuracy (if applicable) */
  aggregatedAccuracy?: number;

  /** Loss improvement from previous round */
  lossImprovement: number;

  /** Round duration in milliseconds */
  duration: number;

  /** Aggregation time in milliseconds */
  aggregationTime?: number;

  /** Communication overhead in bytes */
  communicationBytes: number;

  /** Privacy budget consumed this round */
  privacyBudgetConsumed?: number;
}

/**
 * Round error information
 */
export interface RoundError {
  /** Error type */
  type: string;

  /** Error message */
  message: string;

  /** Participant involved (if applicable) */
  participantId?: string;

  /** Error timestamp */
  timestamp: number;

  /** Stack trace (if available) */
  stack?: string;

  /** Whether error is recoverable */
  recoverable: boolean;
}

// ============================================
// Aggregation Types
// ============================================

/**
 * Aggregation result
 */
export interface AggregationResult {
  /** Aggregated model weights */
  aggregatedWeights: ModelWeights;

  /** Number of updates aggregated */
  updateCount: number;

  /** Total samples represented */
  totalSamples: number;

  /** Aggregation metrics */
  metrics: AggregationMetrics;

  /** Updates that were excluded (outliers, etc.) */
  excludedUpdates: string[];

  /** Aggregation timestamp */
  timestamp: number;
}

/**
 * Aggregation metrics
 */
export interface AggregationMetrics {
  /** Time taken for aggregation (ms) */
  aggregationTime: number;

  /** Weight norm of aggregated model */
  weightNorm: number;

  /** Update variance */
  updateVariance: number;

  /** Outlier score (for Byzantine detection) */
  outlierScore?: number;

  /** Secure aggregation overhead (if used) */
  secureAggregationOverhead?: number;
}

/**
 * Privacy budget tracking
 */
export interface PrivacyBudget {
  /** Total epsilon budget */
  totalEpsilon: number;

  /** Total delta budget */
  totalDelta: number;

  /** Epsilon consumed so far */
  consumedEpsilon: number;

  /** Delta consumed so far */
  consumedDelta: number;

  /** Remaining epsilon */
  remainingEpsilon: number;

  /** Remaining delta */
  remainingDelta: number;

  /** Per-round epsilon consumption history */
  epsilonHistory: number[];

  /** Whether budget is exhausted */
  exhausted: boolean;

  /** Estimated rounds remaining */
  estimatedRoundsRemaining: number;
}

// ============================================
// Event Types
// ============================================

/**
 * Federated learning event types
 */
export enum FederatedEventType {
  /** Session started */
  SESSION_STARTED = 'session_started',

  /** Session ended */
  SESSION_ENDED = 'session_ended',

  /** Round started */
  ROUND_STARTED = 'round_started',

  /** Participant joined round */
  PARTICIPANT_JOINED = 'participant_joined',

  /** Update received */
  UPDATE_RECEIVED = 'update_received',

  /** Aggregation started */
  AGGREGATION_STARTED = 'aggregation_started',

  /** Aggregation completed */
  AGGREGATION_COMPLETED = 'aggregation_completed',

  /** Model distributed */
  MODEL_DISTRIBUTED = 'model_distributed',

  /** Round completed */
  ROUND_COMPLETED = 'round_completed',

  /** Round failed */
  ROUND_FAILED = 'round_failed',

  /** Round timed out */
  ROUND_TIMED_OUT = 'round_timed_out',

  /** Convergence detected */
  CONVERGENCE_DETECTED = 'convergence_detected',

  /** Checkpoint saved */
  CHECKPOINT_SAVED = 'checkpoint_saved',

  /** Privacy budget warning */
  PRIVACY_BUDGET_WARNING = 'privacy_budget_warning',

  /** Privacy budget exhausted */
  PRIVACY_BUDGET_EXHAUSTED = 'privacy_budget_exhausted',

  /** Participant dropped */
  PARTICIPANT_DROPPED = 'participant_dropped',

  /** Byzantine behavior detected */
  BYZANTINE_DETECTED = 'byzantine_detected',
}

/**
 * Federated learning event
 */
export interface FederatedEvent {
  /** Event type */
  type: FederatedEventType;

  /** Event timestamp */
  timestamp: number;

  /** Session identifier */
  sessionId: string;

  /** Round identifier (if applicable) */
  roundId?: string;

  /** Event details */
  details: unknown;
}

/**
 * Federated event handler
 */
export type FederatedEventHandler = (event: FederatedEvent) => void;

// ============================================
// Error Types
// ============================================

/**
 * Federated learning error codes
 */
export enum FederatedErrorCode {
  /** Invalid configuration */
  INVALID_CONFIG = 'INVALID_CONFIG',

  /** Session not found */
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',

  /** Round not found */
  ROUND_NOT_FOUND = 'ROUND_NOT_FOUND',

  /** Participant not found */
  PARTICIPANT_NOT_FOUND = 'PARTICIPANT_NOT_FOUND',

  /** Invalid model update */
  INVALID_UPDATE = 'INVALID_UPDATE',

  /** Aggregation failed */
  AGGREGATION_FAILED = 'AGGREGATION_FAILED',

  /** Round timeout */
  ROUND_TIMEOUT = 'ROUND_TIMEOUT',

  /** Insufficient participants */
  INSUFFICIENT_PARTICIPANTS = 'INSUFFICIENT_PARTICIPANTS',

  /** Privacy budget exhausted */
  PRIVACY_BUDGET_EXHAUSTED = 'PRIVACY_BUDGET_EXHAUSTED',

  /** Model size exceeded */
  MODEL_TOO_LARGE = 'MODEL_TOO_LARGE',

  /** Communication error */
  COMMUNICATION_ERROR = 'COMMUNICATION_ERROR',

  /** Secure aggregation error */
  SECURE_AGGREGATION_ERROR = 'SECURE_AGGREGATION_ERROR',

  /** Byzantine behavior detected */
  BYZANTINE_DETECTED = 'BYZANTINE_DETECTED',

  /** Checkpoint error */
  CHECKPOINT_ERROR = 'CHECKPOINT_ERROR',

  /** Convergence not reached */
  CONVERGENCE_FAILED = 'CONVERGENCE_FAILED',

  /** Model version mismatch */
  VERSION_MISMATCH = 'VERSION_MISMATCH',
}

/**
 * Federated learning error
 */
export class FederatedError extends Error {
  constructor(
    message: string,
    public readonly code: FederatedErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'FederatedError';
  }
}

// ============================================
// Checkpoint Types
// ============================================

/**
 * Model checkpoint
 */
export interface ModelCheckpoint {
  /** Checkpoint identifier */
  checkpointId: string;

  /** Session identifier */
  sessionId: string;

  /** Round number */
  roundNumber: number;

  /** Model weights */
  weights: ModelWeights;

  /** Optimizer state (if needed for resume) */
  optimizerState?: Record<string, Float32Array>;

  /** Training metrics at checkpoint */
  metrics: TrainingMetrics;

  /** Privacy budget at checkpoint */
  privacyBudget?: PrivacyBudget;

  /** Checkpoint timestamp */
  timestamp: number;

  /** Checkpoint size in bytes */
  size: number;
}

/**
 * Training metrics summary
 */
export interface TrainingMetrics {
  /** Current round number */
  currentRound: number;

  /** Total rounds planned */
  totalRounds: number;

  /** Best loss achieved */
  bestLoss: number;

  /** Best round (for best loss) */
  bestRound: number;

  /** Loss history */
  lossHistory: number[];

  /** Accuracy history (if applicable) */
  accuracyHistory?: number[];

  /** Convergence status */
  convergenceStatus: ConvergenceStatus;

  /** Training start time */
  startTime: number;

  /** Total training time */
  totalTrainingTime: number;

  /** Total communication bytes */
  totalCommunicationBytes: number;

  /** Average participation rate */
  avgParticipationRate: number;
}

// ============================================
// Message Types for Protocol
// ============================================

/**
 * Round announcement message
 */
export interface RoundAnnouncement {
  /** Message type */
  type: 'round_announcement';

  /** Session identifier */
  sessionId: string;

  /** Round identifier */
  roundId: string;

  /** Round number */
  roundNumber: number;

  /** Current global model version */
  modelVersion: string;

  /** Model checksum */
  modelChecksum: string;

  /** Configuration for local training */
  trainingConfig: LocalTrainingConfig;

  /** Deadline for submission */
  deadline: number;

  /** Minimum participants required */
  minParticipants: number;
}

/**
 * Local training configuration sent to participants
 */
export interface LocalTrainingConfig {
  /** Number of local epochs */
  epochs: number;

  /** Batch size */
  batchSize: number;

  /** Learning rate */
  learningRate: number;

  /** Update type expected */
  updateType: UpdateType;

  /** Whether to apply differential privacy locally */
  applyDifferentialPrivacy: boolean;

  /** DP configuration (if applicable) */
  dpConfig?: FLDifferentialPrivacyConfig;

  /** Compression configuration (if applicable) */
  compressionConfig?: CompressionConfig;
}

/**
 * Join request from participant
 */
export interface JoinRequest {
  /** Message type */
  type: 'join_request';

  /** Session identifier */
  sessionId: string;

  /** Round identifier */
  roundId: string;

  /** Participant identifier */
  participantId: string;

  /** Number of local samples */
  sampleCount: number;

  /** Participant capabilities */
  capabilities: ParticipantCapabilities;

  /** Public key for secure aggregation (if applicable) */
  publicKey?: string;
}

/**
 * Join response to participant
 */
export interface JoinResponse {
  /** Message type */
  type: 'join_response';

  /** Whether join was accepted */
  accepted: boolean;

  /** Rejection reason (if not accepted) */
  rejectionReason?: string;

  /** Assigned participant weight */
  weight?: number;

  /** Current global model (or URL to download) */
  model?: ModelWeights | string;

  /** Secret shares for secure aggregation (if applicable) */
  secretShares?: Map<string, Uint8Array>;
}

/**
 * Update submission from participant
 */
export interface UpdateSubmission {
  /** Message type */
  type: 'update_submission';

  /** Session identifier */
  sessionId: string;

  /** Round identifier */
  roundId: string;

  /** The model update */
  update: ModelUpdate;
}

/**
 * Aggregation result broadcast
 */
export interface AggregationBroadcast {
  /** Message type */
  type: 'aggregation_result';

  /** Session identifier */
  sessionId: string;

  /** Round identifier */
  roundId: string;

  /** Aggregated model (or URL to download) */
  model: ModelWeights | string;

  /** Round metrics */
  metrics: RoundMetrics;

  /** Next round info (if continuing) */
  nextRound?: RoundAnnouncement;
}

// ============================================
// Default Configurations
// ============================================

/**
 * Default federated learning configuration
 */
export const DEFAULT_FEDERATED_CONFIG: Partial<FederatedConfig> = {
  aggregationStrategy: AggregationStrategy.FED_AVG,
  selectionStrategy: SelectionStrategy.RANDOM,
  localEpochs: DEFAULT_LOCAL_EPOCHS,
  batchSize: DEFAULT_BATCH_SIZE,
  learningRate: DEFAULT_LEARNING_RATE,
  minParticipation: DEFAULT_MIN_PARTICIPATION,
  maxParticipants: MAX_PARTICIPANTS_PER_ROUND,
  roundTimeout: DEFAULT_ROUND_TIMEOUT,
  checkpointInterval: DEFAULT_CHECKPOINT_INTERVAL,
  enableGradientClipping: true,
  gradientClipNorm: DEFAULT_GRADIENT_CLIP_NORM,
};

/**
 * Default differential privacy configuration for federated learning
 */
export const FL_DEFAULT_DP_CONFIG: FLDifferentialPrivacyConfig = {
  enabled: false,
  epsilon: FL_DEFAULT_DP_EPSILON,
  delta: FL_DEFAULT_DP_DELTA,
  mechanism: 'gaussian',
  sensitivity: 1.0,
  clipNorm: DEFAULT_GRADIENT_CLIP_NORM,
  trackBudget: true,
};

/**
 * Default secure aggregation configuration
 */
export const DEFAULT_SECURE_AGGREGATION_CONFIG: SecureAggregationConfig = {
  enabled: false,
  threshold: 2,
  totalShares: 3,
  pairwiseMasking: true,
  keyAgreement: 'ecdh',
  dropoutResilience: true,
  maxDropoutRate: 0.3,
};

/**
 * Default compression configuration
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  enabled: false,
  type: 'none',
  errorFeedback: true,
};

/**
 * Default convergence criteria
 */
export const DEFAULT_CONVERGENCE_CRITERIA: ConvergenceCriteria = {
  minLossImprovement: 0.001,
  patience: 5,
  maxRoundsWithoutImprovement: 10,
  earlyStoppingEnabled: true,
};
