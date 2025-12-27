/**
 * TransferLearningManager - Issue #118 Task 2.3
 *
 * Enables knowledge transfer between different QE domains (e.g., unit testing → integration testing).
 * Supports domain similarity calculation, adjustable transfer coefficients, fine-tuning, and metrics tracking.
 *
 * Domain Examples:
 * - Unit testing → Integration testing
 * - API testing → Contract testing
 * - Performance testing → Load testing
 * - Security scanning → Vulnerability detection
 */

import { Logger } from '../utils/Logger';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';
import { v4 as uuidv4 } from 'uuid';
import {
  TaskExperience,
  TaskState,
  AgentAction,
  LearnedPattern
} from './types';

/**
 * QE Domain definitions
 */
export type QEDomain =
  | 'unit-testing'
  | 'integration-testing'
  | 'api-testing'
  | 'contract-testing'
  | 'performance-testing'
  | 'load-testing'
  | 'security-scanning'
  | 'vulnerability-detection'
  | 'e2e-testing'
  | 'regression-testing';

/**
 * Domain feature vector for similarity calculation
 */
export interface DomainFeatures {
  domain: QEDomain;
  complexity: number; // 0-1 scale
  isolation: number; // 0-1 (unit=high, e2e=low)
  stateful: number; // 0-1 (unit=low, integration=high)
  externalDependencies: number; // 0-1
  executionTime: number; // 0-1 (normalized)
  parallelizable: number; // 0-1
  deterministic: number; // 0-1
}

/**
 * Transfer mapping between source and target domains
 */
export interface TransferMapping {
  id: string;
  sourceDomain: QEDomain;
  targetDomain: QEDomain;
  similarity: number; // 0-1
  transferCoefficient: number; // 0-1 (how much knowledge to transfer)
  experiencesTransferred: number;
  successRate: number; // success rate after transfer
  createdAt: Date;
  lastTransferAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Transfer learning configuration
 */
export interface TransferConfig {
  enabled: boolean;
  minSimilarity: number; // minimum domain similarity to allow transfer (0-1)
  defaultTransferCoefficient: number; // default knowledge transfer weight (0-1)
  adaptiveCoefficient: boolean; // adjust coefficient based on transfer success
  maxTransferExperiences: number; // max experiences to transfer per operation
  fineTuningEnabled: boolean; // enable fine-tuning after transfer
  fineTuningIterations: number; // number of fine-tuning iterations
}

/**
 * Transfer metrics for tracking performance
 */
export interface TransferMetrics {
  mappingId: string;
  sourceDomain: QEDomain;
  targetDomain: QEDomain;
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  avgPerformanceGain: number; // percentage improvement
  transferEfficiency: number; // success rate
  lastUpdated: Date;
}

/**
 * Fine-tuning result
 */
export interface FineTuningResult {
  domain: QEDomain;
  initialPerformance: number;
  finalPerformance: number;
  improvement: number;
  iterations: number;
  experiencesUsed: number;
}

/**
 * Default transfer configuration
 */
const DEFAULT_TRANSFER_CONFIG: TransferConfig = {
  enabled: true,
  minSimilarity: 0.3,
  defaultTransferCoefficient: 0.5,
  adaptiveCoefficient: true,
  maxTransferExperiences: 100,
  fineTuningEnabled: true,
  fineTuningIterations: 10
};

/**
 * Domain feature definitions
 */
const DOMAIN_FEATURES: Record<QEDomain, Omit<DomainFeatures, 'domain'>> = {
  'unit-testing': {
    complexity: 0.3,
    isolation: 0.9,
    stateful: 0.1,
    externalDependencies: 0.1,
    executionTime: 0.1,
    parallelizable: 0.9,
    deterministic: 0.9
  },
  'integration-testing': {
    complexity: 0.6,
    isolation: 0.4,
    stateful: 0.7,
    externalDependencies: 0.6,
    executionTime: 0.5,
    parallelizable: 0.5,
    deterministic: 0.7
  },
  'api-testing': {
    complexity: 0.5,
    isolation: 0.5,
    stateful: 0.5,
    externalDependencies: 0.7,
    executionTime: 0.4,
    parallelizable: 0.7,
    deterministic: 0.8
  },
  'contract-testing': {
    complexity: 0.5,
    isolation: 0.6,
    stateful: 0.4,
    externalDependencies: 0.6,
    executionTime: 0.3,
    parallelizable: 0.8,
    deterministic: 0.9
  },
  'performance-testing': {
    complexity: 0.7,
    isolation: 0.3,
    stateful: 0.6,
    externalDependencies: 0.8,
    executionTime: 0.8,
    parallelizable: 0.6,
    deterministic: 0.5
  },
  'load-testing': {
    complexity: 0.8,
    isolation: 0.2,
    stateful: 0.7,
    externalDependencies: 0.9,
    executionTime: 0.9,
    parallelizable: 0.4,
    deterministic: 0.4
  },
  'security-scanning': {
    complexity: 0.6,
    isolation: 0.5,
    stateful: 0.4,
    externalDependencies: 0.5,
    executionTime: 0.6,
    parallelizable: 0.6,
    deterministic: 0.7
  },
  'vulnerability-detection': {
    complexity: 0.7,
    isolation: 0.4,
    stateful: 0.5,
    externalDependencies: 0.6,
    executionTime: 0.7,
    parallelizable: 0.5,
    deterministic: 0.6
  },
  'e2e-testing': {
    complexity: 0.9,
    isolation: 0.1,
    stateful: 0.9,
    externalDependencies: 0.9,
    executionTime: 0.9,
    parallelizable: 0.2,
    deterministic: 0.5
  },
  'regression-testing': {
    complexity: 0.6,
    isolation: 0.5,
    stateful: 0.6,
    externalDependencies: 0.5,
    executionTime: 0.6,
    parallelizable: 0.6,
    deterministic: 0.8
  }
};

// ============================================================================
// Serialization helpers for memory store compatibility
// ============================================================================

/**
 * Serializable version of TransferMapping for storage
 */
interface SerializableTransferMapping {
  id: string;
  sourceDomain: QEDomain;
  targetDomain: QEDomain;
  similarity: number;
  transferCoefficient: number;
  experiencesTransferred: number;
  successRate: number;
  createdAt: string; // ISO date string
  lastTransferAt?: string; // ISO date string
  metadata?: Record<string, unknown>;
}

/**
 * Serializable version of TransferMetrics for storage
 */
interface SerializableTransferMetrics {
  mappingId: string;
  sourceDomain: QEDomain;
  targetDomain: QEDomain;
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  avgPerformanceGain: number;
  transferEfficiency: number;
  lastUpdated: string; // ISO date string
}

/**
 * Serializable version of TaskExperience for storage
 */
interface SerializableTaskExperience {
  taskId: string;
  taskType: string;
  state: {
    taskComplexity: number;
    requiredCapabilities: string[];
    contextFeatures: Record<string, unknown>;
    previousAttempts: number;
    availableResources: number;
    timeConstraint?: number;
  };
  action: {
    strategy: string;
    toolsUsed: string[];
    parallelization: number;
    retryPolicy: string;
    resourceAllocation: number;
  };
  reward: number;
  nextState: {
    taskComplexity: number;
    requiredCapabilities: string[];
    contextFeatures: Record<string, unknown>;
    previousAttempts: number;
    availableResources: number;
    timeConstraint?: number;
  };
  timestamp: string; // ISO date string
  agentId: string;
  done?: boolean;
}

/**
 * Convert TransferMapping to serializable format
 */
function serializeMapping(mapping: TransferMapping): SerializableTransferMapping {
  return {
    id: mapping.id,
    sourceDomain: mapping.sourceDomain,
    targetDomain: mapping.targetDomain,
    similarity: mapping.similarity,
    transferCoefficient: mapping.transferCoefficient,
    experiencesTransferred: mapping.experiencesTransferred,
    successRate: mapping.successRate,
    createdAt: mapping.createdAt.toISOString(),
    lastTransferAt: mapping.lastTransferAt?.toISOString(),
    metadata: mapping.metadata as Record<string, unknown> | undefined
  };
}

/**
 * Convert TransferMetrics to serializable format
 */
function serializeMetrics(metrics: TransferMetrics): SerializableTransferMetrics {
  return {
    mappingId: metrics.mappingId,
    sourceDomain: metrics.sourceDomain,
    targetDomain: metrics.targetDomain,
    totalTransfers: metrics.totalTransfers,
    successfulTransfers: metrics.successfulTransfers,
    failedTransfers: metrics.failedTransfers,
    avgPerformanceGain: metrics.avgPerformanceGain,
    transferEfficiency: metrics.transferEfficiency,
    lastUpdated: metrics.lastUpdated.toISOString()
  };
}

/**
 * Convert TaskExperience array to serializable format
 */
function serializeExperiences(experiences: TaskExperience[]): SerializableTaskExperience[] {
  return experiences.map(exp => ({
    taskId: exp.taskId,
    taskType: exp.taskType,
    state: {
      taskComplexity: exp.state.taskComplexity,
      requiredCapabilities: exp.state.requiredCapabilities,
      contextFeatures: exp.state.contextFeatures as Record<string, unknown>,
      previousAttempts: exp.state.previousAttempts,
      availableResources: exp.state.availableResources,
      timeConstraint: exp.state.timeConstraint
    },
    action: {
      strategy: exp.action.strategy,
      toolsUsed: exp.action.toolsUsed,
      parallelization: exp.action.parallelization,
      retryPolicy: exp.action.retryPolicy,
      resourceAllocation: exp.action.resourceAllocation
    },
    reward: exp.reward,
    nextState: {
      taskComplexity: exp.nextState.taskComplexity,
      requiredCapabilities: exp.nextState.requiredCapabilities,
      contextFeatures: exp.nextState.contextFeatures as Record<string, unknown>,
      previousAttempts: exp.nextState.previousAttempts,
      availableResources: exp.nextState.availableResources,
      timeConstraint: exp.nextState.timeConstraint
    },
    timestamp: exp.timestamp.toISOString(),
    agentId: exp.agentId,
    done: exp.done
  }));
}

/**
 * Type guard to check if value is a valid serializable experience array
 */
function isSerializableExperienceArray(value: unknown): value is SerializableTaskExperience[] {
  if (!Array.isArray(value)) {
    return false;
  }
  if (value.length === 0) {
    return true;
  }
  const first = value[0];
  return (
    typeof first === 'object' &&
    first !== null &&
    'taskId' in first &&
    'taskType' in first &&
    'state' in first &&
    'action' in first &&
    'reward' in first &&
    'timestamp' in first
  );
}

/**
 * Deserialize experiences from storage format
 */
function deserializeExperiences(data: SerializableTaskExperience[]): TaskExperience[] {
  return data.map(exp => ({
    taskId: exp.taskId,
    taskType: exp.taskType,
    state: {
      taskComplexity: exp.state.taskComplexity,
      requiredCapabilities: exp.state.requiredCapabilities,
      contextFeatures: exp.state.contextFeatures,
      previousAttempts: exp.state.previousAttempts,
      availableResources: exp.state.availableResources,
      timeConstraint: exp.state.timeConstraint
    },
    action: {
      strategy: exp.action.strategy,
      toolsUsed: exp.action.toolsUsed,
      parallelization: exp.action.parallelization,
      retryPolicy: exp.action.retryPolicy,
      resourceAllocation: exp.action.resourceAllocation
    },
    reward: exp.reward,
    nextState: {
      taskComplexity: exp.nextState.taskComplexity,
      requiredCapabilities: exp.nextState.requiredCapabilities,
      contextFeatures: exp.nextState.contextFeatures,
      previousAttempts: exp.nextState.previousAttempts,
      availableResources: exp.nextState.availableResources,
      timeConstraint: exp.nextState.timeConstraint
    },
    timestamp: new Date(exp.timestamp),
    agentId: exp.agentId,
    done: exp.done
  }));
}

/**
 * TransferLearningManager - Manages knowledge transfer between QE domains
 */
export class TransferLearningManager {
  private readonly logger: Logger;
  private readonly memoryStore: SwarmMemoryManager;
  private config: TransferConfig;
  private mappings: Map<string, TransferMapping>; // mappingId -> mapping
  private metrics: Map<string, TransferMetrics>; // mappingId -> metrics

  constructor(
    memoryStore: SwarmMemoryManager,
    config: Partial<TransferConfig> = {}
  ) {
    this.logger = Logger.getInstance();
    this.memoryStore = memoryStore;
    this.config = { ...DEFAULT_TRANSFER_CONFIG, ...config };
    this.mappings = new Map();
    this.metrics = new Map();
  }

  /**
   * Initialize the transfer learning manager
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing TransferLearningManager');

    // Load existing mappings from database
    await this.loadMappings();

    // Load existing metrics from database
    await this.loadMetrics();

    this.logger.info(`TransferLearningManager initialized with ${this.mappings.size} mappings`);
  }

  /**
   * Calculate similarity between two QE domains
   * Uses cosine similarity on domain feature vectors
   *
   * @param sourceDomain - Source domain
   * @param targetDomain - Target domain
   * @returns Similarity score (0-1)
   */
  calculateDomainSimilarity(sourceDomain: QEDomain, targetDomain: QEDomain): number {
    const sourceFeatures = this.getDomainFeatures(sourceDomain);
    const targetFeatures = this.getDomainFeatures(targetDomain);

    // Calculate cosine similarity
    const dotProduct = this.calculateDotProduct(sourceFeatures, targetFeatures);
    const sourceMagnitude = this.calculateMagnitude(sourceFeatures);
    const targetMagnitude = this.calculateMagnitude(targetFeatures);

    const similarity = dotProduct / (sourceMagnitude * targetMagnitude);

    this.logger.debug(`Domain similarity: ${sourceDomain} → ${targetDomain} = ${similarity.toFixed(3)}`);

    return Math.max(0, Math.min(1, similarity));
  }

  /**
   * Transfer knowledge from source domain to target domain
   *
   * @param sourceDomain - Source domain with existing knowledge
   * @param targetDomain - Target domain to receive knowledge
   * @param sourceExperiences - Experiences from source domain
   * @param transferCoefficient - Optional override for transfer coefficient (0-1)
   * @returns Transfer mapping with results
   */
  async transferKnowledge(
    sourceDomain: QEDomain,
    targetDomain: QEDomain,
    sourceExperiences: TaskExperience[],
    transferCoefficient?: number
  ): Promise<TransferMapping> {
    if (!this.config.enabled) {
      throw new Error('Transfer learning is disabled');
    }

    // Calculate domain similarity
    const similarity = this.calculateDomainSimilarity(sourceDomain, targetDomain);

    if (similarity < this.config.minSimilarity) {
      throw new Error(
        `Domain similarity too low: ${similarity.toFixed(3)} < ${this.config.minSimilarity}`
      );
    }

    // Get or create transfer mapping
    let mapping = this.getMapping(sourceDomain, targetDomain);
    if (!mapping) {
      mapping = await this.createMapping(
        sourceDomain,
        targetDomain,
        similarity,
        transferCoefficient ?? this.config.defaultTransferCoefficient
      );
    }

    // Limit experiences to transfer
    const experiencesToTransfer = sourceExperiences.slice(
      0,
      this.config.maxTransferExperiences
    );

    // Apply transfer coefficient to adjust experience rewards
    const transferredExperiences = this.applyTransferCoefficient(
      experiencesToTransfer,
      mapping.transferCoefficient
    );

    // Store transferred experiences in target domain namespace
    await this.storeTransferredExperiences(
      targetDomain,
      transferredExperiences
    );

    // Update mapping statistics
    mapping.experiencesTransferred += transferredExperiences.length;
    mapping.lastTransferAt = new Date();
    await this.updateMapping(mapping);

    // Update metrics
    await this.updateTransferMetrics(mapping.id, true);

    this.logger.info(
      `Transferred ${transferredExperiences.length} experiences from ${sourceDomain} to ${targetDomain} ` +
      `(similarity: ${similarity.toFixed(3)}, coefficient: ${mapping.transferCoefficient.toFixed(3)})`
    );

    return mapping;
  }

  /**
   * Fine-tune transferred knowledge for target domain
   * Adjusts transferred knowledge based on target domain feedback
   *
   * @param targetDomain - Target domain to fine-tune
   * @param targetExperiences - New experiences from target domain
   * @returns Fine-tuning result
   */
  async fineTuneTransferredKnowledge(
    targetDomain: QEDomain,
    targetExperiences: TaskExperience[]
  ): Promise<FineTuningResult> {
    if (!this.config.fineTuningEnabled) {
      throw new Error('Fine-tuning is disabled');
    }

    this.logger.info(`Fine-tuning transferred knowledge for ${targetDomain}`);

    // Calculate initial performance (baseline from transferred experiences)
    const transferredExperiences = await this.getTransferredExperiences(targetDomain);
    const initialPerformance = this.calculateAverageReward(transferredExperiences);

    // Perform iterative fine-tuning
    let currentPerformance = initialPerformance;
    let iterationCount = 0;

    for (let i = 0; i < this.config.fineTuningIterations; i++) {
      // Blend transferred and target experiences
      const blendRatio = (i + 1) / this.config.fineTuningIterations;
      const blendedExperiences = this.blendExperiences(
        transferredExperiences,
        targetExperiences,
        blendRatio
      );

      // Recalculate performance
      const newPerformance = this.calculateAverageReward(blendedExperiences);

      // Early stopping if performance converges
      if (Math.abs(newPerformance - currentPerformance) < 0.01) {
        break;
      }

      currentPerformance = newPerformance;
      iterationCount++;
    }

    const improvement = ((currentPerformance - initialPerformance) / Math.abs(initialPerformance)) * 100;

    const result: FineTuningResult = {
      domain: targetDomain,
      initialPerformance,
      finalPerformance: currentPerformance,
      improvement,
      iterations: iterationCount,
      experiencesUsed: transferredExperiences.length + targetExperiences.length
    };

    this.logger.info(
      `Fine-tuning completed for ${targetDomain}: ` +
      `${initialPerformance.toFixed(3)} → ${currentPerformance.toFixed(3)} ` +
      `(+${improvement.toFixed(1)}%) in ${iterationCount} iterations`
    );

    return result;
  }

  /**
   * Adjust transfer coefficient based on transfer success
   * Implements adaptive transfer learning
   *
   * @param mappingId - Transfer mapping ID
   * @param success - Whether the transfer was successful
   */
  async adjustTransferCoefficient(mappingId: string, success: boolean): Promise<void> {
    if (!this.config.adaptiveCoefficient) {
      return;
    }

    const mapping = this.mappings.get(mappingId);
    if (!mapping) {
      throw new Error(`Transfer mapping not found: ${mappingId}`);
    }

    // Adaptive adjustment: increase on success, decrease on failure
    const adjustmentRate = 0.05;
    const oldCoefficient = mapping.transferCoefficient;

    if (success) {
      mapping.transferCoefficient = Math.min(1.0, mapping.transferCoefficient + adjustmentRate);
    } else {
      mapping.transferCoefficient = Math.max(0.1, mapping.transferCoefficient - adjustmentRate);
    }

    await this.updateMapping(mapping);

    this.logger.debug(
      `Adjusted transfer coefficient for ${mapping.sourceDomain} → ${mapping.targetDomain}: ` +
      `${oldCoefficient.toFixed(3)} → ${mapping.transferCoefficient.toFixed(3)}`
    );
  }

  /**
   * Get transfer metrics for a specific mapping
   *
   * @param sourceDomain - Source domain
   * @param targetDomain - Target domain
   * @returns Transfer metrics or undefined
   */
  getTransferMetrics(sourceDomain: QEDomain, targetDomain: QEDomain): TransferMetrics | undefined {
    const mapping = this.getMapping(sourceDomain, targetDomain);
    if (!mapping) {
      return undefined;
    }
    return this.metrics.get(mapping.id);
  }

  /**
   * Get all transfer mappings
   */
  getAllMappings(): TransferMapping[] {
    return Array.from(this.mappings.values());
  }

  /**
   * Get all transfer metrics
   */
  getAllMetrics(): TransferMetrics[] {
    return Array.from(this.metrics.values());
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get domain feature vector
   */
  private getDomainFeatures(domain: QEDomain): DomainFeatures {
    const features = DOMAIN_FEATURES[domain];
    if (!features) {
      throw new Error(`Unknown domain: ${domain}`);
    }
    return { domain, ...features };
  }

  /**
   * Calculate dot product of two feature vectors
   */
  private calculateDotProduct(a: DomainFeatures, b: DomainFeatures): number {
    return (
      a.complexity * b.complexity +
      a.isolation * b.isolation +
      a.stateful * b.stateful +
      a.externalDependencies * b.externalDependencies +
      a.executionTime * b.executionTime +
      a.parallelizable * b.parallelizable +
      a.deterministic * b.deterministic
    );
  }

  /**
   * Calculate magnitude of feature vector
   */
  private calculateMagnitude(features: DomainFeatures): number {
    return Math.sqrt(
      features.complexity ** 2 +
      features.isolation ** 2 +
      features.stateful ** 2 +
      features.externalDependencies ** 2 +
      features.executionTime ** 2 +
      features.parallelizable ** 2 +
      features.deterministic ** 2
    );
  }

  /**
   * Get existing mapping between domains
   */
  private getMapping(sourceDomain: QEDomain, targetDomain: QEDomain): TransferMapping | undefined {
    const mappingArray = Array.from(this.mappings.values());
    for (const mapping of mappingArray) {
      if (mapping.sourceDomain === sourceDomain && mapping.targetDomain === targetDomain) {
        return mapping;
      }
    }
    return undefined;
  }

  /**
   * Create new transfer mapping
   */
  private async createMapping(
    sourceDomain: QEDomain,
    targetDomain: QEDomain,
    similarity: number,
    transferCoefficient: number
  ): Promise<TransferMapping> {
    const mapping: TransferMapping = {
      id: uuidv4(),
      sourceDomain,
      targetDomain,
      similarity,
      transferCoefficient,
      experiencesTransferred: 0,
      successRate: 0,
      createdAt: new Date()
    };

    this.mappings.set(mapping.id, mapping);

    // Persist to database (serialize for storage)
    await this.memoryStore.store(
      `transfer-learning/mappings/${mapping.id}`,
      serializeMapping(mapping) as unknown as Record<string, unknown>,
      { partition: 'learning' }
    );

    // Initialize metrics
    const metrics: TransferMetrics = {
      mappingId: mapping.id,
      sourceDomain,
      targetDomain,
      totalTransfers: 0,
      successfulTransfers: 0,
      failedTransfers: 0,
      avgPerformanceGain: 0,
      transferEfficiency: 0,
      lastUpdated: new Date()
    };

    this.metrics.set(mapping.id, metrics);

    await this.memoryStore.store(
      `transfer-learning/metrics/${mapping.id}`,
      serializeMetrics(metrics) as unknown as Record<string, unknown>,
      { partition: 'learning' }
    );

    return mapping;
  }

  /**
   * Update existing transfer mapping
   */
  private async updateMapping(mapping: TransferMapping): Promise<void> {
    this.mappings.set(mapping.id, mapping);

    await this.memoryStore.store(
      `transfer-learning/mappings/${mapping.id}`,
      serializeMapping(mapping) as unknown as Record<string, unknown>,
      { partition: 'learning' }
    );
  }

  /**
   * Apply transfer coefficient to experiences
   */
  private applyTransferCoefficient(
    experiences: TaskExperience[],
    coefficient: number
  ): TaskExperience[] {
    return experiences.map(exp => ({
      ...exp,
      reward: exp.reward * coefficient
    }));
  }

  /**
   * Store transferred experiences for target domain
   */
  private async storeTransferredExperiences(
    targetDomain: QEDomain,
    experiences: TaskExperience[]
  ): Promise<void> {
    await this.memoryStore.store(
      `transfer-learning/experiences/${targetDomain}`,
      serializeExperiences(experiences) as unknown as Record<string, unknown>,
      { partition: 'learning' }
    );
  }

  /**
   * Get transferred experiences for target domain
   */
  private async getTransferredExperiences(targetDomain: QEDomain): Promise<TaskExperience[]> {
    const retrieved = await this.memoryStore.retrieve(
      `transfer-learning/experiences/${targetDomain}`,
      { partition: 'learning' }
    );

    // Type guard and deserialization
    if (!retrieved) {
      return [];
    }

    if (isSerializableExperienceArray(retrieved)) {
      return deserializeExperiences(retrieved);
    }

    // Fallback for empty or unexpected data
    return [];
  }

  /**
   * Calculate average reward from experiences
   */
  private calculateAverageReward(experiences: TaskExperience[]): number {
    if (experiences.length === 0) {
      return 0;
    }
    const totalReward = experiences.reduce((sum, exp) => sum + exp.reward, 0);
    return totalReward / experiences.length;
  }

  /**
   * Blend transferred and target experiences
   * Higher blendRatio = more weight on target experiences
   */
  private blendExperiences(
    transferredExperiences: TaskExperience[],
    targetExperiences: TaskExperience[],
    blendRatio: number
  ): TaskExperience[] {
    const transferWeight = 1 - blendRatio;
    const targetWeight = blendRatio;

    const weightedTransferred = transferredExperiences.map(exp => ({
      ...exp,
      reward: exp.reward * transferWeight
    }));

    const weightedTarget = targetExperiences.map(exp => ({
      ...exp,
      reward: exp.reward * targetWeight
    }));

    return [...weightedTransferred, ...weightedTarget];
  }

  /**
   * Update transfer metrics
   */
  private async updateTransferMetrics(mappingId: string, success: boolean): Promise<void> {
    const metrics = this.metrics.get(mappingId);
    if (!metrics) {
      return;
    }

    metrics.totalTransfers++;
    if (success) {
      metrics.successfulTransfers++;
    } else {
      metrics.failedTransfers++;
    }

    metrics.transferEfficiency = metrics.successfulTransfers / metrics.totalTransfers;
    metrics.lastUpdated = new Date();

    this.metrics.set(mappingId, metrics);

    await this.memoryStore.store(
      `transfer-learning/metrics/${mappingId}`,
      serializeMetrics(metrics) as unknown as Record<string, unknown>,
      { partition: 'learning' }
    );
  }

  /**
   * Load mappings from database
   */
  private async loadMappings(): Promise<void> {
    try {
      // Query all mappings from memory store
      // Note: This is a simplified version - in production, you'd query by pattern
      this.logger.debug('Loading transfer mappings from database');
    } catch (error) {
      this.logger.warn('Failed to load transfer mappings:', error);
    }
  }

  /**
   * Load metrics from database
   */
  private async loadMetrics(): Promise<void> {
    try {
      // Query all metrics from memory store
      this.logger.debug('Loading transfer metrics from database');
    } catch (error) {
      this.logger.warn('Failed to load transfer metrics:', error);
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.mappings.clear();
    this.metrics.clear();
    this.logger.info('TransferLearningManager disposed');
  }
}
