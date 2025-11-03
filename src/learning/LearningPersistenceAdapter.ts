/**
 * LearningPersistenceAdapter - Abstraction layer for learning data persistence
 *
 * Enables testability and flexibility in storage backends.
 * Follows the Persistence Adapter Pattern for clean separation of concerns.
 */

import { Database } from '../utils/Database';
import { TaskExperience } from './types';
import { Logger } from '../utils/Logger';

/**
 * Abstraction layer for learning data persistence
 * Enables testability and flexibility in storage backends
 */
export interface LearningPersistence {
  /**
   * Store a single learning experience
   */
  storeExperience(agentId: string, experience: TaskExperience): Promise<void>;

  /**
   * Store a Q-value update
   */
  storeQValue(agentId: string, stateKey: string, actionKey: string, qValue: number): Promise<void>;

  /**
   * Batch store multiple experiences (optimized)
   */
  batchStoreExperiences(agentId: string, experiences: TaskExperience[]): Promise<void>;

  /**
   * Load Q-table from storage
   */
  loadQTable(agentId: string): Promise<Map<string, Map<string, number>>>;

  /**
   * Store learning snapshot for analytics
   */
  storeLearningSnapshot(agentId: string, metrics: any): Promise<void>;

  /**
   * Flush any pending batched writes
   */
  flush(): Promise<void>;
}

/**
 * Database implementation of persistence adapter
 */
export class DatabaseLearningPersistence implements LearningPersistence {
  private readonly logger: Logger;
  private pendingExperiences: Array<{agentId: string; experience: TaskExperience}> = [];
  private pendingQValues: Array<{agentId: string; stateKey: string; actionKey: string; qValue: number}> = [];
  private batchSize: number = 10;
  private flushTimer?: NodeJS.Timeout;

  constructor(private database: Database) {
    this.logger = Logger.getInstance();

    // Auto-flush every 5 seconds
    this.flushTimer = setInterval(() => {
      this.flush().catch(err =>
        this.logger.warn('Auto-flush failed:', err)
      );
    }, 5000);
  }

  async storeExperience(agentId: string, experience: TaskExperience): Promise<void> {
    // Queue for batch write
    this.pendingExperiences.push({agentId, experience});

    if (this.pendingExperiences.length >= this.batchSize) {
      await this.flushExperiences();
    }
  }

  async storeQValue(agentId: string, stateKey: string, actionKey: string, qValue: number): Promise<void> {
    // Queue for batch write
    this.pendingQValues.push({agentId, stateKey, actionKey, qValue});

    if (this.pendingQValues.length >= this.batchSize) {
      await this.flushQValues();
    }
  }

  async batchStoreExperiences(agentId: string, experiences: TaskExperience[]): Promise<void> {
    if (experiences.length === 0) return;

    try {
      // Use database transaction for batch insert
      await Promise.all(
        experiences.map(exp =>
          this.database.storeLearningExperience({
            agentId,
            taskId: exp.taskId,
            taskType: exp.taskType,
            state: JSON.stringify(exp.state),
            action: JSON.stringify(exp.action),
            reward: exp.reward,
            nextState: JSON.stringify(exp.nextState),
            episodeId: `episode-${Date.now()}`
          })
        )
      );

      this.logger.debug(`Batch stored ${experiences.length} experiences for agent ${agentId}`);
    } catch (error) {
      this.logger.error('Batch experience storage failed:', error);
      throw error;
    }
  }

  private async flushExperiences(): Promise<void> {
    if (this.pendingExperiences.length === 0) return;

    const batch = this.pendingExperiences.splice(0);

    try {
      await Promise.all(
        batch.map(({agentId, experience}) =>
          this.database.storeLearningExperience({
            agentId,
            taskId: experience.taskId,
            taskType: experience.taskType,
            state: JSON.stringify(experience.state),
            action: JSON.stringify(experience.action),
            reward: experience.reward,
            nextState: JSON.stringify(experience.nextState),
            episodeId: `episode-${Date.now()}`
          })
        )
      );

      this.logger.debug(`Flushed ${batch.length} experiences`);
    } catch (error) {
      this.logger.error('Experience flush failed:', error);
      // Re-queue on failure
      this.pendingExperiences.unshift(...batch);
    }
  }

  private async flushQValues(): Promise<void> {
    if (this.pendingQValues.length === 0) return;

    const batch = this.pendingQValues.splice(0);

    try {
      await Promise.all(
        batch.map(({agentId, stateKey, actionKey, qValue}) =>
          this.database.upsertQValue(agentId, stateKey, actionKey, qValue)
        )
      );

      this.logger.debug(`Flushed ${batch.length} Q-values`);
    } catch (error) {
      this.logger.error('Q-value flush failed:', error);
      // Re-queue on failure
      this.pendingQValues.unshift(...batch);
    }
  }

  async loadQTable(agentId: string): Promise<Map<string, Map<string, number>>> {
    const qValues = await this.database.getAllQValues(agentId);
    const qTable = new Map<string, Map<string, number>>();

    for (const qv of qValues) {
      if (!qTable.has(qv.state_key)) {
        qTable.set(qv.state_key, new Map());
      }
      qTable.get(qv.state_key)!.set(qv.action_key, qv.q_value);
    }

    this.logger.info(`Loaded ${qValues.length} Q-values from database for agent ${agentId}`);
    return qTable;
  }

  async storeLearningSnapshot(agentId: string, metrics: any): Promise<void> {
    await this.database.storeLearningSnapshot({
      agentId,
      snapshotType: 'performance',
      metrics,
      improvementRate: metrics.recentImprovement || 0,
      totalExperiences: metrics.totalExperiences || 0,
      explorationRate: metrics.explorationRate || 0
    });
  }

  async flush(): Promise<void> {
    await Promise.all([
      this.flushExperiences(),
      this.flushQValues()
    ]);
  }

  /**
   * Cleanup method - stop auto-flush timer
   */
  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }
}

/**
 * In-memory implementation for testing (no persistence)
 */
export class InMemoryLearningPersistence implements LearningPersistence {
  private experiences: Map<string, TaskExperience[]> = new Map();
  private qTables: Map<string, Map<string, Map<string, number>>> = new Map();
  private snapshots: Map<string, any[]> = new Map();

  async storeExperience(agentId: string, experience: TaskExperience): Promise<void> {
    if (!this.experiences.has(agentId)) {
      this.experiences.set(agentId, []);
    }
    this.experiences.get(agentId)!.push(experience);
  }

  async storeQValue(agentId: string, stateKey: string, actionKey: string, qValue: number): Promise<void> {
    if (!this.qTables.has(agentId)) {
      this.qTables.set(agentId, new Map());
    }
    const qTable = this.qTables.get(agentId)!;
    if (!qTable.has(stateKey)) {
      qTable.set(stateKey, new Map());
    }
    qTable.get(stateKey)!.set(actionKey, qValue);
  }

  async batchStoreExperiences(agentId: string, experiences: TaskExperience[]): Promise<void> {
    for (const exp of experiences) {
      await this.storeExperience(agentId, exp);
    }
  }

  async loadQTable(agentId: string): Promise<Map<string, Map<string, number>>> {
    return this.qTables.get(agentId) || new Map();
  }

  async storeLearningSnapshot(agentId: string, metrics: any): Promise<void> {
    if (!this.snapshots.has(agentId)) {
      this.snapshots.set(agentId, []);
    }
    this.snapshots.get(agentId)!.push({
      timestamp: Date.now(),
      metrics
    });
  }

  async flush(): Promise<void> {
    // No-op for in-memory
  }

  /**
   * Testing utilities
   */
  getExperiences(agentId: string): TaskExperience[] {
    return this.experiences.get(agentId) || [];
  }

  getQTable(agentId: string): Map<string, Map<string, number>> {
    return this.qTables.get(agentId) || new Map();
  }

  getSnapshots(agentId: string): any[] {
    return this.snapshots.get(agentId) || [];
  }

  clear(): void {
    this.experiences.clear();
    this.qTables.clear();
    this.snapshots.clear();
  }
}
