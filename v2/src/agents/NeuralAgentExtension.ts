/**
 * Neural Agent Extension
 *
 * Provides neural training capabilities to agents using AgentDB's 9 RL algorithms.
 * This is a mixin/extension that can be applied to any BaseAgent.
 *
 * Usage:
 * ```typescript
 * class MyAgent extends BaseAgent {
 *   private neuralExt: NeuralAgentExtension;
 *
 *   constructor(config) {
 *     super(config);
 *     this.neuralExt = new NeuralAgentExtension(this, config.neuralConfig);
 *   }
 *
 *   protected async onPostTask(data: PostTaskData) {
 *     await super.onPostTask(data);
 *     await this.neuralExt.collectExperience(data);
 *   }
 * }
 * ```
 */

import { Logger } from '../utils/Logger';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';
import { AgentDBManager } from '../core/memory/AgentDBManager';
import { NeuralTrainer } from '../core/neural/NeuralTrainer';
import {
  NeuralConfig,
  Experience,
  State,
  Action,
  ExperienceCollectionConfig,
  RLAlgorithm,
  PredictionResult
} from '../core/neural/types';
import { PostTaskData, TaskErrorData, QETask } from '../types';

/**
 * Task data structure for neural state snapshots
 * Captures the task and optional result for state extraction
 */
export interface NeuralTaskData {
  /** The task being executed */
  task?: Partial<QETask>;
  /** Optional result from task execution */
  result?: NeuralTaskResult;
}

/**
 * Result structure from task execution used for neural training
 * Contains metrics and metadata for reward calculation and action extraction
 */
export interface NeuralTaskResult {
  /** Whether the task succeeded */
  success?: boolean;
  /** Execution time in milliseconds */
  executionTime?: number;
  /** Code coverage percentage (0-1) */
  coverage?: number;
  /** Quality score (0-1) */
  quality?: number;
  /** Errors encountered during execution */
  errors?: string[];
  /** Resource usage percentage (0-1) */
  resourceUsage?: number;
  /** Strategy or action type used */
  strategy?: string;
  /** Action type identifier */
  actionType?: string;
  /** Tools used during execution */
  toolsUsed?: string[];
  /** Parallelization factor (0-1) */
  parallelization?: number;
  /** Retry policy used */
  retryPolicy?: string;
  /** Resource allocation factor (0-1) */
  resourceAllocation?: number;
  /** Additional action parameters */
  actionParameters?: Record<string, unknown>;
  /** Q-value from prediction */
  qValue?: number;
}

/**
 * Default experience collection configuration
 */
const DEFAULT_COLLECTION_CONFIG: ExperienceCollectionConfig = {
  enabled: true,
  collectionInterval: 1, // Collect every task
  minReward: undefined, // No minimum
  maxBuffer: 1000,
  autoTrain: true
};

/**
 * Neural Agent Extension
 *
 * Adds neural training capabilities to agents:
 * - Automatic experience collection from task execution
 * - Integration with 9 RL algorithms via AgentDB
 * - Action prediction using trained models
 * - Automatic training when buffer is full
 */
export class NeuralAgentExtension {
  private readonly logger: Logger;
  private readonly agentId: string;
  private readonly memoryStore: SwarmMemoryManager;
  private readonly agentDB: AgentDBManager;
  private readonly neuralTrainer: NeuralTrainer;
  private readonly collectionConfig: ExperienceCollectionConfig;
  private taskCounter: number = 0;
  private stateSnapshot?: State;

  constructor(
    agentId: string,
    memoryStore: SwarmMemoryManager,
    agentDB: AgentDBManager,
    neuralConfig?: Partial<NeuralConfig>,
    collectionConfig?: Partial<ExperienceCollectionConfig>
  ) {
    this.logger = Logger.getInstance();
    this.agentId = agentId;
    this.memoryStore = memoryStore;
    this.agentDB = agentDB;
    this.collectionConfig = { ...DEFAULT_COLLECTION_CONFIG, ...collectionConfig };

    // Initialize neural trainer
    this.neuralTrainer = new NeuralTrainer(
      agentId,
      memoryStore,
      agentDB,
      neuralConfig
    );
  }

  /**
   * Initialize the extension
   */
  async initialize(): Promise<void> {
    await this.neuralTrainer.initialize();
    this.logger.info(`NeuralAgentExtension initialized for agent ${this.agentId}`);
  }

  /**
   * Snapshot current state before task execution (call from onPreTask)
   */
  snapshotState(taskData: NeuralTaskData): void {
    if (!this.collectionConfig.enabled) return;

    this.stateSnapshot = this.extractState(taskData);
  }

  /**
   * Collect experience after task execution (call from onPostTask)
   */
  async collectExperience(data: PostTaskData): Promise<void> {
    if (!this.collectionConfig.enabled) return;

    this.taskCounter++;

    // Check collection interval
    if (this.taskCounter % this.collectionConfig.collectionInterval !== 0) {
      return;
    }

    try {
      // Cast result to NeuralTaskResult for proper typing
      const result = data.result as NeuralTaskResult;

      // Calculate reward from task result
      const reward = this.calculateReward(result);

      // Check minimum reward threshold
      if (this.collectionConfig.minReward !== undefined && reward < this.collectionConfig.minReward) {
        return;
      }

      // Extract action from result
      const action = this.extractAction(result);

      // Extract next state
      const nextState = this.extractState({
        task: data.assignment.task,
        result
      });

      // Create experience
      const experience: Experience = {
        id: `exp-${this.agentId}-${Date.now()}`,
        state: this.stateSnapshot || nextState, // Use snapshot if available
        action,
        reward,
        nextState,
        done: result.success || false,
        timestamp: new Date()
      };

      // Add to trainer's buffer
      await this.neuralTrainer.train([experience]);

      // Auto-train if buffer is full
      if (this.collectionConfig.autoTrain) {
        const status = this.neuralTrainer.getStatus();
        if (status.experienceCount >= this.collectionConfig.maxBuffer) {
          this.logger.info(`Experience buffer full (${status.experienceCount}), triggering training`);
          await this.trainModel();
        }
      }

      this.logger.debug(`Collected experience: reward=${reward.toFixed(2)}, action=${action.type}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to collect experience: ${message}`);
    }
  }

  /**
   * Collect negative experience from task errors (call from onTaskError)
   */
  async collectErrorExperience(data: TaskErrorData): Promise<void> {
    if (!this.collectionConfig.enabled) return;

    try {
      // Create negative experience with penalty reward
      const experience: Experience = {
        id: `error-exp-${this.agentId}-${Date.now()}`,
        state: this.stateSnapshot || this.extractState({ task: data.assignment.task }),
        action: {
          type: 'error',
          parameters: {
            errorType: data.error.name,
            errorMessage: data.error.message
          }
        },
        reward: -1.0, // Negative reward for errors
        nextState: this.stateSnapshot || this.extractState({ task: data.assignment.task }),
        done: true,
        timestamp: new Date()
      };

      await this.neuralTrainer.train([experience]);

      this.logger.debug(`Collected error experience with penalty reward`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to collect error experience: ${message}`);
    }
  }

  /**
   * Predict best action for current state
   */
  async predictAction(state: State, algorithm?: RLAlgorithm): Promise<PredictionResult> {
    return await this.neuralTrainer.predictAction(state, algorithm);
  }

  /**
   * Train model manually
   */
  async trainModel(algorithm?: RLAlgorithm): Promise<void> {
    const experiences = this.neuralTrainer.getExperiences();

    if (experiences.length === 0) {
      this.logger.warn('No experiences to train on');
      return;
    }

    await this.neuralTrainer.train(experiences, algorithm);
    this.neuralTrainer.clearExperiences(); // Clear after training
  }

  /**
   * Save model to disk
   */
  async saveModel(path?: string): Promise<void> {
    const savePath = path || `${process.cwd()}/.agentic-qe/data/neural/models`;
    await this.neuralTrainer.saveModel(`${this.agentId}-model`, savePath);
  }

  /**
   * Load model from disk
   */
  async loadModel(path: string): Promise<void> {
    await this.neuralTrainer.loadModel(path);
  }

  /**
   * Switch RL algorithm
   */
  async switchAlgorithm(algorithm: RLAlgorithm): Promise<void> {
    await this.neuralTrainer.switchAlgorithm(algorithm);
  }

  /**
   * Get trainer status
   */
  getStatus() {
    return this.neuralTrainer.getStatus();
  }

  /**
   * Get neural trainer instance (for advanced usage)
   */
  getTrainer(): NeuralTrainer {
    return this.neuralTrainer;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract state from task data
   */
  private extractState(data: NeuralTaskData): State {
    const task = data.task || {};
    const result = data.result || {};

    return {
      taskComplexity: this.estimateComplexity(task),
      capabilities: task.requirements?.capabilities || [],
      contextFeatures: task.context || {},
      resourceAvailability: result.resourceUsage ? (1 - result.resourceUsage) : 0.8,
      previousAttempts: 0,
      // Add custom features
      taskType: task.type,
      timestamp: Date.now()
    };
  }

  /**
   * Extract action from result
   */
  private extractAction(result: NeuralTaskResult): Action {
    return {
      type: result.strategy || result.actionType || 'default',
      parameters: {
        toolsUsed: result.toolsUsed || [],
        parallelization: result.parallelization || 0.5,
        retryPolicy: result.retryPolicy || 'exponential',
        resourceAllocation: result.resourceAllocation || 0.5,
        ...result.actionParameters
      },
      qValue: result.qValue
    };
  }

  /**
   * Calculate reward from task result
   */
  private calculateReward(result: NeuralTaskResult): number {
    let reward = 0;

    // Success/failure (primary component)
    reward += result.success ? 1.0 : -1.0;

    // Execution time bonus (faster is better)
    if (result.executionTime) {
      const timeFactor = Math.max(0, 1 - result.executionTime / 30000); // 30 sec baseline
      reward += timeFactor * 0.5;
    }

    // Quality metrics bonus
    if (result.coverage) {
      reward += (result.coverage - 0.8) * 2; // Bonus above 80%
    }

    if (result.quality) {
      reward += (result.quality - 0.8) * 1; // Quality bonus
    }

    // Error penalty
    if (result.errors && result.errors.length > 0) {
      reward -= result.errors.length * 0.1;
    }

    // Resource efficiency bonus
    if (result.resourceUsage) {
      reward += (1 - result.resourceUsage) * 0.3;
    }

    // Clamp to [-2, 2]
    return Math.max(-2, Math.min(2, reward));
  }

  /**
   * Estimate task complexity
   */
  private estimateComplexity(task: Partial<QETask>): number {
    let complexity = 0.5; // Baseline

    if (task.requirements?.capabilities) {
      complexity += task.requirements.capabilities.length * 0.1;
    }

    const taskSpec = task as { timeout?: number };
    if (taskSpec.timeout && taskSpec.timeout < 10000) {
      complexity += 0.2; // Tight deadline
    }

    return Math.min(1.0, complexity);
  }
}
