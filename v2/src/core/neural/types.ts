/**
 * Neural Training Type Definitions
 *
 * Types for AgentDB-powered neural training with 9 RL algorithms
 */

/**
 * Reinforcement Learning Algorithms
 */
export type RLAlgorithm =
  | 'decision-transformer'
  | 'q-learning'
  | 'sarsa'
  | 'actor-critic'
  | 'ppo'
  | 'ddpg'
  | 'td3'
  | 'sac'
  | 'dqn';

/**
 * Neural Configuration
 */
export interface NeuralConfig {
  /** Enable neural training */
  enabled: boolean;

  /** RL algorithm to use */
  algorithm: RLAlgorithm;

  /** Learning rate */
  learningRate: number;

  /** Training batch size */
  batchSize: number;

  /** Number of training epochs */
  epochs: number;

  /** Validation split (0-1) */
  validationSplit: number;

  /** Save model every N episodes */
  modelSaveInterval: number;

  /** Create checkpoint every N episodes */
  checkpointInterval: number;

  /** Maximum number of checkpoints to keep */
  maxCheckpoints: number;

  /** Use GPU acceleration if available */
  useGPU: boolean;

  /** Experience replay buffer size */
  memorySize: number;

  /** Discount factor (gamma) for future rewards */
  gamma: number;

  /** Exploration rate (epsilon) */
  epsilon: number;

  /** Soft update coefficient (tau) for target networks */
  tau: number;
}

/**
 * State representation
 */
export interface State {
  /** Task complexity (0-1) */
  taskComplexity?: number;

  /** Required capabilities */
  capabilities?: string[];

  /** Context features */
  contextFeatures?: Record<string, any>;

  /** Resource availability (0-1) */
  resourceAvailability?: number;

  /** Previous attempts count */
  previousAttempts?: number;

  /** Custom state features */
  [key: string]: any;
}

/**
 * Action representation
 */
export interface Action {
  /** Action type */
  type: string;

  /** Action parameters */
  parameters: Record<string, any>;

  /** Predicted Q-value (optional) */
  qValue?: number;
}

/**
 * Experience for training
 */
export interface Experience {
  /** Unique experience ID */
  id?: string;

  /** Current state */
  state: State;

  /** Action taken */
  action: Action;

  /** Reward received */
  reward: number;

  /** Next state after action */
  nextState: State;

  /** Episode done flag */
  done: boolean;

  /** Q-value (optional) */
  qValue?: number;

  /** Timestamp */
  timestamp?: Date;
}

/**
 * Training metrics
 */
export interface TrainingMetrics {
  /** Algorithm used */
  algorithm: RLAlgorithm;

  /** Training loss */
  loss: number;

  /** Validation loss (optional) */
  valLoss?: number;

  /** Number of epochs completed */
  epochs: number;

  /** Number of experiences used */
  experienceCount: number;

  /** Training duration (ms) */
  duration: number;

  /** Timestamp */
  timestamp: Date;
}

/**
 * Prediction result
 */
export interface PredictionResult {
  /** Predicted best action */
  action: Action;

  /** Confidence score (0-1) */
  confidence: number;

  /** Predicted Q-value */
  qValue: number;

  /** Algorithm used */
  algorithm: RLAlgorithm;

  /** Alternative actions */
  alternativeActions: Array<{
    action: Action;
    qValue: number;
    confidence: number;
  }>;
}

/**
 * Trained model
 */
export interface Model {
  /** Model ID */
  id: string;

  /** Algorithm used */
  algorithm: RLAlgorithm;

  /** Agent ID */
  agentId: string;

  /** Episode count when saved */
  episodeCount: number;

  /** Experience count when saved */
  experienceCount: number;

  /** Training metrics history */
  metrics: Array<{
    algorithm: RLAlgorithm;
    latestMetrics: TrainingMetrics;
  }>;

  /** Configuration used */
  config: NeuralConfig;

  /** Save timestamp */
  savedAt: Date;

  /** Model version */
  version: string;
}

/**
 * Model checkpoint
 */
export interface ModelCheckpoint {
  /** Checkpoint ID */
  id: string;

  /** Episode count at checkpoint */
  episodeCount: number;

  /** Algorithm at checkpoint */
  algorithm: RLAlgorithm;

  /** Metrics at checkpoint */
  metrics: TrainingMetrics;

  /** Checkpoint timestamp */
  timestamp: Date;
}

/**
 * Neural training result
 */
export interface NeuralTrainingResult {
  /** Algorithm used */
  algorithm: RLAlgorithm;

  /** Training metrics */
  metrics: TrainingMetrics;

  /** Total episode count */
  episodeCount: number;

  /** Model updated flag */
  modelUpdated: boolean;

  /** Training duration (ms) */
  duration: number;
}

/**
 * Neural training options
 */
export interface NeuralTrainingOptions {
  /** Override epochs */
  epochs?: number;

  /** Override batch size */
  batchSize?: number;

  /** Override learning rate */
  learningRate?: number;

  /** Save model after training */
  saveModel?: boolean;

  /** Create checkpoint after training */
  createCheckpoint?: boolean;
}

/**
 * Experience collection config
 */
export interface ExperienceCollectionConfig {
  /** Enable experience collection */
  enabled: boolean;

  /** Collect every N tasks */
  collectionInterval: number;

  /** Minimum reward to collect */
  minReward?: number;

  /** Maximum experiences to buffer */
  maxBuffer: number;

  /** Auto-train when buffer full */
  autoTrain: boolean;
}
