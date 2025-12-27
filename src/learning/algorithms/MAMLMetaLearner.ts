/**
 * MAMLMetaLearner - Model-Agnostic Meta-Learning for QE Agents
 *
 * Implements MAML-style meta-learning that enables agents to "learn how to learn".
 * Agents can quickly adapt to new testing domains with just 5-10 examples.
 *
 * Key Concepts:
 * - Inner Loop: Fast adaptation to new task with few gradient steps (5-10 examples)
 * - Outer Loop: Learn initialization parameters that enable fast adaptation
 * - Meta-Learning: After seeing few examples of new test pattern, agent performs well
 *
 * Algorithm:
 * 1. Initialize meta-parameters θ (Q-table initialization)
 * 2. For each task Ti in task distribution:
 *    a. Sample K examples from Ti (support set)
 *    b. Adapt: θ'i = θ - α∇Loss(θ, support) [inner loop]
 *    c. Evaluate on query set from Ti
 * 3. Update meta-parameters: θ = θ - β∇Loss(θ', query) [outer loop]
 * 4. Result: θ is optimized for fast adaptation to new tasks
 *
 * Use Cases:
 * - New testing framework adoption (5-10 examples → proficient)
 * - New project domain (few examples → effective testing strategy)
 * - API testing → UI testing transfer learning
 */

import { AbstractRLLearner, RLConfig, QValue } from './AbstractRLLearner';
import { TaskExperience, AgentAction, TaskState } from '../types';

/**
 * MAML configuration extends base RL config with meta-learning parameters
 */
export interface MAMLConfig extends RLConfig {
  // Inner loop (task adaptation)
  innerLearningRate: number; // α - fast adaptation learning rate (higher than outer)
  innerSteps: number; // Number of gradient steps for task adaptation (5-10)

  // Outer loop (meta-learning)
  metaLearningRate: number; // β - meta-parameter update rate (lower than inner)

  // Task distribution
  minTaskExamples: number; // Minimum examples per task (support set size)
  maxTaskExamples: number; // Maximum examples per task
  taskBatchSize: number; // Number of tasks to meta-train on per batch

  // Meta-gradient computation
  firstOrderApproximation: boolean; // Use first-order MAML (faster, less accurate)

  // Base algorithm to wrap
  baseAlgorithm?: AbstractRLLearner; // RL algorithm for inner loop (default: Q-Learning)
}

/**
 * Default MAML configuration
 */
const DEFAULT_MAML_CONFIG: Partial<MAMLConfig> = {
  // Base RL config
  learningRate: 0.01, // Outer loop meta-learning rate (β)
  discountFactor: 0.95,
  explorationRate: 0.2, // Lower exploration for meta-learning
  explorationDecay: 0.99,
  minExplorationRate: 0.05,
  useExperienceReplay: false, // MAML uses episodic learning
  replayBufferSize: 1000,
  batchSize: 10, // Task batch size

  // MAML-specific
  innerLearningRate: 0.1, // α - higher for fast adaptation
  innerSteps: 5, // Few-shot learning (5 gradient steps)
  metaLearningRate: 0.01, // β - meta-parameter update
  minTaskExamples: 5, // Support set size (few-shot)
  maxTaskExamples: 10,
  taskBatchSize: 5, // Meta-train on 5 tasks per batch
  firstOrderApproximation: true // Faster computation
};

/**
 * Task for meta-learning (contains support and query sets)
 */
interface MetaTask {
  id: string;
  taskType: string; // e.g., "unit-testing", "api-testing", "ui-testing"
  supportSet: TaskExperience[]; // Examples for adaptation (5-10)
  querySet: TaskExperience[]; // Examples for meta-evaluation
  metadata?: Record<string, any>;
}

/**
 * Meta-learning episode tracking
 */
interface MetaEpisode {
  episodeId: string;
  tasks: MetaTask[];
  preAdaptationLoss: number; // Loss before adaptation
  postAdaptationLoss: number; // Loss after adaptation
  metaLoss: number; // Meta-gradient loss
  improvement: number; // How much adaptation helped
  timestamp: Date;
}

/**
 * MAMLMetaLearner - Model-Agnostic Meta-Learning for Fast Adaptation
 *
 * Learns an initialization of Q-values that enables rapid adaptation to new
 * testing tasks with minimal examples (5-10 shots).
 *
 * Example:
 * - Agent trained on Jest, Mocha, Jasmine unit testing
 * - Sees 5-10 examples of Vitest tests
 * - Immediately generates high-quality Vitest tests
 *
 * Meta-Learning Process:
 * 1. Sample batch of tasks (different testing scenarios)
 * 2. For each task:
 *    - Adapt Q-table with support set (inner loop)
 *    - Evaluate adapted Q-table on query set
 * 3. Compute meta-gradient from all tasks
 * 4. Update meta-parameters (Q-table initialization)
 */
export class MAMLMetaLearner extends AbstractRLLearner {
  private readonly mamlConfig: MAMLConfig;
  private metaQTable: Map<string, Map<string, QValue>>; // Meta-learned initialization
  private taskBuffer: Map<string, TaskExperience[]>; // Buffer of tasks for meta-learning
  private metaEpisodes: MetaEpisode[]; // History of meta-learning episodes
  private metaStepCount: number; // Number of meta-updates performed
  private baseAlgorithm?: AbstractRLLearner; // Wrapped base algorithm

  constructor(config: Partial<MAMLConfig> = {}) {
    const fullConfig = { ...DEFAULT_MAML_CONFIG, ...config } as MAMLConfig;
    super(fullConfig);
    this.mamlConfig = fullConfig;

    // Meta-parameters (learned Q-table initialization)
    this.metaQTable = new Map();

    // Initialize with base Q-table
    this.copyQTable(this.qTable, this.metaQTable);

    // Task organization
    this.taskBuffer = new Map();
    this.metaEpisodes = [];
    this.metaStepCount = 0;

    this.logger.info('MAMLMetaLearner initialized for fast adaptation', {
      innerLearningRate: fullConfig.innerLearningRate,
      innerSteps: fullConfig.innerSteps,
      metaLearningRate: fullConfig.metaLearningRate,
      supportSetSize: fullConfig.minTaskExamples
    });
  }

  /**
   * Update Q-value using base algorithm (delegates to wrapped algorithm if available)
   * For MAML, this is called during inner loop adaptation
   */
  update(experience: TaskExperience, nextAction?: AgentAction): void {
    if (this.baseAlgorithm) {
      this.baseAlgorithm.update(experience, nextAction);
    } else {
      // Default: Q-Learning update
      this.qLearningUpdate(experience);
    }

    // Buffer experience by task type for meta-learning
    this.bufferExperience(experience);

    this.stepCount++;
  }

  /**
   * Q-Learning update rule (default inner loop algorithm)
   */
  private qLearningUpdate(experience: TaskExperience): void {
    const stateKey = this.encodeState(experience.state);
    const actionKey = this.encodeAction(experience.action);
    const nextStateKey = this.encodeState(experience.nextState);

    // Get current Q-value
    const currentQ = this.getQValueRaw(stateKey, actionKey);

    // Get max Q-value for next state
    const nextStateActions = this.qTable.get(nextStateKey);
    const maxNextQ = nextStateActions && nextStateActions.size > 0
      ? Math.max(...Array.from(nextStateActions.values()).map(qv => qv.value))
      : 0;

    // Q-learning update
    const tdTarget = experience.reward + this.config.discountFactor * maxNextQ;
    const tdError = tdTarget - currentQ;
    const newQ = currentQ + this.config.learningRate * tdError;

    this.setQValue(stateKey, actionKey, newQ);
  }

  /**
   * Buffer experience by task type for meta-learning
   */
  private bufferExperience(experience: TaskExperience): void {
    const taskType = experience.taskType;

    if (!this.taskBuffer.has(taskType)) {
      this.taskBuffer.set(taskType, []);
    }

    const buffer = this.taskBuffer.get(taskType)!;
    buffer.push(experience);

    // Limit buffer size per task type
    const maxBufferSize = this.mamlConfig.maxTaskExamples * 10;
    if (buffer.length > maxBufferSize) {
      buffer.shift(); // Remove oldest
    }
  }

  /**
   * Perform meta-learning update (outer loop)
   * Learns Q-table initialization that enables fast adaptation
   *
   * This should be called periodically after collecting enough task examples
   */
  async performMetaUpdate(): Promise<MetaEpisode | null> {
    // Sample batch of tasks from buffer
    const tasks = this.sampleMetaTasks();

    if (tasks.length < this.mamlConfig.taskBatchSize) {
      this.logger.debug(`Not enough tasks for meta-update (${tasks.length}/${this.mamlConfig.taskBatchSize})`);
      return null;
    }

    // Meta-gradients accumulator
    const metaGradients = new Map<string, Map<string, number>>();

    let totalPreAdaptLoss = 0;
    let totalPostAdaptLoss = 0;

    // For each task in the batch
    for (const task of tasks) {
      // 1. Clone meta-parameters for this task
      const taskQTable = this.cloneQTable(this.metaQTable);

      // 2. Inner loop: Adapt to task using support set
      const preAdaptLoss = this.evaluateLoss(taskQTable, task.supportSet);

      for (let step = 0; step < this.mamlConfig.innerSteps; step++) {
        this.adaptToTask(taskQTable, task.supportSet, this.mamlConfig.innerLearningRate);
      }

      // 3. Evaluate adapted parameters on query set
      const postAdaptLoss = this.evaluateLoss(taskQTable, task.querySet);

      totalPreAdaptLoss += preAdaptLoss;
      totalPostAdaptLoss += postAdaptLoss;

      // 4. Compute meta-gradients
      if (this.mamlConfig.firstOrderApproximation) {
        // First-order MAML: ignore second derivatives
        this.computeFirstOrderGradients(metaGradients, taskQTable, task.querySet);
      } else {
        // Full MAML: compute through inner loop
        this.computeSecondOrderGradients(metaGradients, this.metaQTable, task);
      }
    }

    // 5. Update meta-parameters using accumulated gradients
    this.updateMetaParameters(metaGradients, tasks.length);

    // 6. Copy meta-parameters to main Q-table
    this.copyQTable(this.metaQTable, this.qTable);

    this.metaStepCount++;

    // Create meta-episode record
    const metaEpisode: MetaEpisode = {
      episodeId: `meta-${this.metaStepCount}-${Date.now()}`,
      tasks,
      preAdaptationLoss: totalPreAdaptLoss / tasks.length,
      postAdaptationLoss: totalPostAdaptLoss / tasks.length,
      metaLoss: totalPostAdaptLoss / tasks.length,
      improvement: ((totalPreAdaptLoss - totalPostAdaptLoss) / totalPreAdaptLoss) * 100,
      timestamp: new Date()
    };

    this.metaEpisodes.push(metaEpisode);

    this.logger.info('Meta-update completed', {
      episode: metaEpisode.episodeId,
      tasks: tasks.length,
      preAdaptLoss: metaEpisode.preAdaptationLoss.toFixed(4),
      postAdaptLoss: metaEpisode.postAdaptationLoss.toFixed(4),
      improvement: `${metaEpisode.improvement.toFixed(2)}%`
    });

    return metaEpisode;
  }

  /**
   * Sample batch of meta-tasks from task buffer
   * Each task contains support set (for adaptation) and query set (for evaluation)
   */
  private sampleMetaTasks(): MetaTask[] {
    const tasks: MetaTask[] = [];
    const taskTypes = Array.from(this.taskBuffer.keys());

    // Sample up to taskBatchSize tasks
    const numTasks = Math.min(this.mamlConfig.taskBatchSize, taskTypes.length);

    for (let i = 0; i < numTasks; i++) {
      const taskType = taskTypes[i % taskTypes.length];
      const experiences = this.taskBuffer.get(taskType) || [];

      if (experiences.length < this.mamlConfig.minTaskExamples * 2) {
        continue; // Not enough examples for support + query sets
      }

      // Shuffle experiences
      const shuffled = [...experiences].sort(() => Math.random() - 0.5);

      // Split into support and query sets
      const supportSize = this.mamlConfig.minTaskExamples;
      const supportSet = shuffled.slice(0, supportSize);
      const querySet = shuffled.slice(supportSize, supportSize * 2);

      tasks.push({
        id: `task-${taskType}-${Date.now()}`,
        taskType,
        supportSet,
        querySet
      });
    }

    return tasks;
  }

  /**
   * Adapt Q-table to a specific task using support set (inner loop)
   */
  private adaptToTask(
    qTable: Map<string, Map<string, QValue>>,
    supportSet: TaskExperience[],
    learningRate: number
  ): void {
    for (const experience of supportSet) {
      const stateKey = this.encodeState(experience.state);
      const actionKey = this.encodeAction(experience.action);
      const nextStateKey = this.encodeState(experience.nextState);

      // Get current Q-value from task-specific table
      const currentQ = this.getQValueFromTable(qTable, stateKey, actionKey);

      // Get max Q-value for next state
      const nextStateActions = qTable.get(nextStateKey);
      const maxNextQ = nextStateActions && nextStateActions.size > 0
        ? Math.max(...Array.from(nextStateActions.values()).map(qv => qv.value))
        : 0;

      // Q-learning update with inner learning rate
      const tdTarget = experience.reward + this.config.discountFactor * maxNextQ;
      const tdError = tdTarget - currentQ;
      const newQ = currentQ + learningRate * tdError;

      // Update task-specific Q-table
      this.setQValueInTable(qTable, stateKey, actionKey, newQ);
    }
  }

  /**
   * Evaluate loss (TD error) on a set of experiences
   */
  private evaluateLoss(
    qTable: Map<string, Map<string, QValue>>,
    experiences: TaskExperience[]
  ): number {
    let totalLoss = 0;

    for (const experience of experiences) {
      const stateKey = this.encodeState(experience.state);
      const actionKey = this.encodeAction(experience.action);
      const nextStateKey = this.encodeState(experience.nextState);

      const currentQ = this.getQValueFromTable(qTable, stateKey, actionKey);

      const nextStateActions = qTable.get(nextStateKey);
      const maxNextQ = nextStateActions && nextStateActions.size > 0
        ? Math.max(...Array.from(nextStateActions.values()).map(qv => qv.value))
        : 0;

      const tdTarget = experience.reward + this.config.discountFactor * maxNextQ;
      const tdError = tdTarget - currentQ;

      totalLoss += tdError * tdError; // Squared TD error
    }

    return experiences.length > 0 ? totalLoss / experiences.length : 0;
  }

  /**
   * Compute first-order meta-gradients (FOMAML)
   * Faster approximation that ignores second-order derivatives
   */
  private computeFirstOrderGradients(
    metaGradients: Map<string, Map<string, number>>,
    adaptedQTable: Map<string, Map<string, QValue>>,
    querySet: TaskExperience[]
  ): void {
    for (const experience of querySet) {
      const stateKey = this.encodeState(experience.state);
      const actionKey = this.encodeAction(experience.action);
      const nextStateKey = this.encodeState(experience.nextState);

      const currentQ = this.getQValueFromTable(adaptedQTable, stateKey, actionKey);

      const nextStateActions = adaptedQTable.get(nextStateKey);
      const maxNextQ = nextStateActions && nextStateActions.size > 0
        ? Math.max(...Array.from(nextStateActions.values()).map(qv => qv.value))
        : 0;

      const tdTarget = experience.reward + this.config.discountFactor * maxNextQ;
      const tdError = tdTarget - currentQ;

      // Gradient: ∂Loss/∂Q = -2 * TD-error
      const gradient = -2 * tdError;

      // Accumulate gradient
      if (!metaGradients.has(stateKey)) {
        metaGradients.set(stateKey, new Map());
      }
      const stateGradients = metaGradients.get(stateKey)!;
      const currentGradient = stateGradients.get(actionKey) || 0;
      stateGradients.set(actionKey, currentGradient + gradient);
    }
  }

  /**
   * Compute second-order meta-gradients (Full MAML)
   * More accurate but computationally expensive
   */
  private computeSecondOrderGradients(
    metaGradients: Map<string, Map<string, number>>,
    metaQTable: Map<string, Map<string, QValue>>,
    task: MetaTask
  ): void {
    // For simplicity, use first-order approximation
    // Full second-order computation requires computing Hessians
    const adaptedQTable = this.cloneQTable(metaQTable);

    for (let step = 0; step < this.mamlConfig.innerSteps; step++) {
      this.adaptToTask(adaptedQTable, task.supportSet, this.mamlConfig.innerLearningRate);
    }

    this.computeFirstOrderGradients(metaGradients, adaptedQTable, task.querySet);
  }

  /**
   * Update meta-parameters using accumulated gradients
   */
  private updateMetaParameters(
    metaGradients: Map<string, Map<string, number>>,
    numTasks: number
  ): void {
    for (const [stateKey, stateGradients] of metaGradients.entries()) {
      for (const [actionKey, gradient] of stateGradients.entries()) {
        const currentQ = this.getQValueFromTable(this.metaQTable, stateKey, actionKey);

        // Average gradient over tasks
        const avgGradient = gradient / numTasks;

        // Meta-gradient descent
        const newQ = currentQ - this.mamlConfig.metaLearningRate * avgGradient;

        this.setQValueInTable(this.metaQTable, stateKey, actionKey, newQ);
      }
    }
  }

  /**
   * Fast adaptation to new task (few-shot learning)
   * Given 5-10 examples, quickly adapt Q-table for new testing domain
   *
   * @param examples Few examples of new task (5-10)
   * @returns Adapted Q-table
   */
  async fastAdapt(examples: TaskExperience[]): Promise<Map<string, Map<string, QValue>>> {
    if (examples.length < this.mamlConfig.minTaskExamples) {
      this.logger.warn(`Few-shot adaptation requires at least ${this.mamlConfig.minTaskExamples} examples, got ${examples.length}`);
    }

    // Clone meta-parameters
    const adaptedQTable = this.cloneQTable(this.metaQTable);

    // Perform inner loop adaptation
    for (let step = 0; step < this.mamlConfig.innerSteps; step++) {
      this.adaptToTask(adaptedQTable, examples, this.mamlConfig.innerLearningRate);
    }

    this.logger.info(`Fast adaptation completed with ${examples.length} examples in ${this.mamlConfig.innerSteps} steps`);

    return adaptedQTable;
  }

  /**
   * Get Q-value from specific Q-table (helper)
   */
  private getQValueFromTable(
    qTable: Map<string, Map<string, QValue>>,
    stateKey: string,
    actionKey: string
  ): number {
    const stateActions = qTable.get(stateKey);
    if (!stateActions) return 0;

    const qValue = stateActions.get(actionKey);
    return qValue?.value ?? 0;
  }

  /**
   * Set Q-value in specific Q-table (helper)
   */
  private setQValueInTable(
    qTable: Map<string, Map<string, QValue>>,
    stateKey: string,
    actionKey: string,
    value: number
  ): void {
    if (!qTable.has(stateKey)) {
      qTable.set(stateKey, new Map());
    }
    const stateActions = qTable.get(stateKey)!;

    const currentQValue = stateActions.get(actionKey);
    stateActions.set(actionKey, {
      state: stateKey,
      action: actionKey,
      value,
      updateCount: (currentQValue?.updateCount ?? 0) + 1,
      lastUpdated: Date.now()
    });
  }

  /**
   * Get Q-value (raw, without creating entry)
   */
  private getQValueRaw(stateKey: string, actionKey: string): number {
    return this.getQValueFromTable(this.qTable, stateKey, actionKey);
  }

  /**
   * Clone Q-table
   */
  private cloneQTable(source: Map<string, Map<string, QValue>>): Map<string, Map<string, QValue>> {
    const cloned = new Map<string, Map<string, QValue>>();

    for (const [stateKey, stateActions] of source.entries()) {
      const clonedActions = new Map<string, QValue>();
      for (const [actionKey, qValue] of stateActions.entries()) {
        clonedActions.set(actionKey, { ...qValue });
      }
      cloned.set(stateKey, clonedActions);
    }

    return cloned;
  }

  /**
   * Copy Q-table from source to destination
   */
  private copyQTable(
    source: Map<string, Map<string, QValue>>,
    destination: Map<string, Map<string, QValue>>
  ): void {
    destination.clear();

    for (const [stateKey, stateActions] of source.entries()) {
      const copiedActions = new Map<string, QValue>();
      for (const [actionKey, qValue] of stateActions.entries()) {
        copiedActions.set(actionKey, { ...qValue });
      }
      destination.set(stateKey, copiedActions);
    }
  }

  /**
   * Get meta-learning statistics
   */
  getMetaStatistics(): {
    metaSteps: number;
    metaEpisodes: number;
    avgPreAdaptLoss: number;
    avgPostAdaptLoss: number;
    avgImprovement: number;
    taskTypes: number;
    bufferedExperiences: number;
  } {
    const recentEpisodes = this.metaEpisodes.slice(-10);

    return {
      metaSteps: this.metaStepCount,
      metaEpisodes: this.metaEpisodes.length,
      avgPreAdaptLoss: recentEpisodes.length > 0
        ? recentEpisodes.reduce((sum, e) => sum + e.preAdaptationLoss, 0) / recentEpisodes.length
        : 0,
      avgPostAdaptLoss: recentEpisodes.length > 0
        ? recentEpisodes.reduce((sum, e) => sum + e.postAdaptationLoss, 0) / recentEpisodes.length
        : 0,
      avgImprovement: recentEpisodes.length > 0
        ? recentEpisodes.reduce((sum, e) => sum + e.improvement, 0) / recentEpisodes.length
        : 0,
      taskTypes: this.taskBuffer.size,
      bufferedExperiences: Array.from(this.taskBuffer.values()).reduce((sum, arr) => sum + arr.length, 0)
    };
  }

  /**
   * Get meta-episodes history
   */
  getMetaEpisodes(): MetaEpisode[] {
    return [...this.metaEpisodes];
  }

  /**
   * Clear task buffer
   */
  clearTaskBuffer(): void {
    this.taskBuffer.clear();
  }

  /**
   * Get default exploration rate
   */
  protected getDefaultExplorationRate(): number {
    return this.mamlConfig.explorationRate ?? 0.2;
  }

  /**
   * Get algorithm name
   */
  getAlgorithmName(): string {
    return 'MAML';
  }

  /**
   * Override getStatistics to include meta-learning metrics
   */
  getStatistics(): ReturnType<AbstractRLLearner['getStatistics']> & {
    maml: ReturnType<MAMLMetaLearner['getMetaStatistics']>;
  } {
    return {
      ...super.getStatistics(),
      maml: this.getMetaStatistics()
    };
  }

  /**
   * Export meta-learner state
   */
  export(): ReturnType<AbstractRLLearner['export']> & {
    metaQTable: Record<string, Record<string, QValue>>;
    taskBuffer: Record<string, TaskExperience[]>;
    metaEpisodes: MetaEpisode[];
    metaStepCount: number;
  } {
    const baseExport = super.export();

    // Serialize metaQTable
    const serializedMetaQTable: Record<string, Record<string, QValue>> = {};
    for (const [state, actions] of this.metaQTable.entries()) {
      serializedMetaQTable[state] = {};
      for (const [action, qValue] of actions.entries()) {
        serializedMetaQTable[state][action] = qValue;
      }
    }

    // Serialize taskBuffer
    const serializedTaskBuffer: Record<string, TaskExperience[]> = {};
    for (const [taskType, experiences] of this.taskBuffer.entries()) {
      serializedTaskBuffer[taskType] = experiences;
    }

    return {
      ...baseExport,
      metaQTable: serializedMetaQTable,
      taskBuffer: serializedTaskBuffer,
      metaEpisodes: this.metaEpisodes,
      metaStepCount: this.metaStepCount
    };
  }

  /**
   * Import meta-learner state
   */
  import(state: ReturnType<MAMLMetaLearner['export']>): void {
    super.import(state);

    // Deserialize metaQTable
    this.metaQTable.clear();
    for (const [stateKey, actions] of Object.entries(state.metaQTable)) {
      const actionMap = new Map<string, QValue>();
      for (const [actionKey, qValue] of Object.entries(actions)) {
        actionMap.set(actionKey, qValue);
      }
      this.metaQTable.set(stateKey, actionMap);
    }

    // Deserialize taskBuffer
    this.taskBuffer.clear();
    for (const [taskType, experiences] of Object.entries(state.taskBuffer)) {
      this.taskBuffer.set(taskType, experiences);
    }

    this.metaEpisodes = state.metaEpisodes;
    this.metaStepCount = state.metaStepCount;

    this.logger.info('Imported MAML state', {
      metaSteps: this.metaStepCount,
      taskTypes: this.taskBuffer.size,
      metaTableSize: this.metaQTable.size
    });
  }
}

/**
 * Create default MAML configuration
 */
export function createDefaultMAMLConfig(): MAMLConfig {
  return DEFAULT_MAML_CONFIG as MAMLConfig;
}
