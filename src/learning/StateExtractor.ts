/**
 * StateExtractor - Extract features from task context for Q-learning
 *
 * Converts raw task data into normalized feature vectors suitable for
 * reinforcement learning. Handles different agent types and task complexities.
 */

import * as os from 'os';
import { TaskState, AgentAction } from './types';
import { QETask } from '../types';

export interface StateExtractionConfig {
  maxCapabilities?: number;
  maxAttempts?: number;
  maxTimeConstraint?: number; // in milliseconds
  enableContextFeatures?: boolean;
}

const DEFAULT_CONFIG: StateExtractionConfig = {
  maxCapabilities: 10,
  maxAttempts: 5,
  maxTimeConstraint: 300000, // 5 minutes
  enableContextFeatures: true
};

/**
 * StateExtractor - Extract and normalize task features for learning
 */
export class StateExtractor {
  private readonly config: StateExtractionConfig;

  constructor(config: Partial<StateExtractionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract state from task for Q-learning
   */
  extractState(task: QETask, context?: any): TaskState {
    const complexity = this.estimateTaskComplexity(task);
    const capabilities = this.extractRequiredCapabilities(task);
    const contextFeatures = this.config.enableContextFeatures
      ? this.extractContextFeatures(task, context)
      : {};

    return {
      taskComplexity: complexity,
      requiredCapabilities: capabilities,
      contextFeatures,
      previousAttempts: (task as any).previousAttempts || 0,
      availableResources: this.estimateAvailableResources(context),
      timeConstraint: (task as any).timeout
    };
  }

  /**
   * Extract features as normalized vector
   */
  extractFeatures(state: TaskState): number[] {
    return [
      // Task complexity (0-1)
      state.taskComplexity,

      // Required capabilities normalized (0-1)
      Math.min(state.requiredCapabilities.length / this.config.maxCapabilities!, 1.0),

      // Previous attempts normalized (0-1)
      Math.min(state.previousAttempts / this.config.maxAttempts!, 1.0),

      // Available resources (0-1)
      state.availableResources,

      // Time constraint normalized (0-1)
      state.timeConstraint
        ? Math.min(state.timeConstraint / this.config.maxTimeConstraint!, 1.0)
        : 1.0,

      // Context features hash (0-1)
      this.hashContextFeatures(state.contextFeatures)
    ];
  }

  /**
   * Estimate task complexity based on task properties
   */
  private estimateTaskComplexity(task: QETask): number {
    let complexity = 0.5; // baseline

    // Factor 1: Required capabilities
    const capabilityCount = task.requirements?.capabilities?.length || 0;
    complexity += Math.min(capabilityCount * 0.1, 0.3);

    // Factor 2: Description length (more detailed = more complex)
    const descriptionLength = (task.description || '').length;
    if (descriptionLength > 500) complexity += 0.1;
    if (descriptionLength > 1000) complexity += 0.1;

    // Factor 3: Task type complexity weights
    const typeComplexity: Record<string, number> = {
      'test-generation': 0.7,
      'test-execution': 0.5,
      'coverage-analysis': 0.6,
      'performance-testing': 0.8,
      'security-scanning': 0.8,
      'quality-gate': 0.6,
      'regression-analysis': 0.7,
      'api-validation': 0.6,
      'chaos-testing': 0.9,
      'visual-testing': 0.7
    };

    const typeWeight = typeComplexity[task.type] || 0.5;
    complexity = complexity * 0.6 + typeWeight * 0.4; // Weighted average

    return Math.min(1.0, Math.max(0.0, complexity));
  }

  /**
   * Extract required capabilities from task
   */
  private extractRequiredCapabilities(task: QETask): string[] {
    const capabilities: string[] = [];

    // From requirements
    if (task.requirements?.capabilities) {
      capabilities.push(...task.requirements.capabilities);
    }

    // Inferred from task type
    const typeCapabilities: Record<string, string[]> = {
      'test-generation': ['code-analysis', 'test-writing'],
      'test-execution': ['test-running', 'result-parsing'],
      'coverage-analysis': ['code-analysis', 'metrics-calculation'],
      'performance-testing': ['load-generation', 'metrics-analysis'],
      'security-scanning': ['vulnerability-detection', 'security-analysis'],
      'quality-gate': ['metrics-validation', 'decision-making'],
      'regression-analysis': ['code-analysis', 'risk-assessment'],
      'api-validation': ['api-testing', 'schema-validation'],
      'chaos-testing': ['fault-injection', 'resilience-testing'],
      'visual-testing': ['screenshot-comparison', 'visual-analysis']
    };

    const inferredCaps = typeCapabilities[task.type] || [];
    capabilities.push(...inferredCaps);

    // Deduplicate
    return Array.from(new Set(capabilities));
  }

  /**
   * Extract context features from task and environment
   */
  private extractContextFeatures(task: QETask, context?: any): Record<string, any> {
    const features: Record<string, any> = {};

    // Task context
    if (task.context) {
      features.taskContext = task.context;
    }

    // Environment context
    if (context) {
      features.environment = {
        hasCI: !!context.CI,
        hasCoverage: !!context.coverage,
        hasTests: !!context.tests,
        projectSize: context.projectSize || 'unknown'
      };
    }

    // Requirements context
    if (task.requirements) {
      features.requirements = {
        hasTimeout: !!(task as any).timeout,
        hasPriority: !!(task as any).priority,
        hasMetadata: !!(task as any).metadata
      };
    }

    return features;
  }

  /**
   * Estimate available resources using real system monitoring
   */
  private estimateAvailableResources(context?: any): number {
    // Real-time system resource monitoring using Node.js os module
    const cpus = os.cpus();
    const totalCpus = cpus.length;
    const loadAvg = os.loadavg()[0]; // 1-minute load average

    // CPU availability: normalized by CPU count (0-1 scale)
    const cpuAvailability = Math.max(0, 1 - (loadAvg / totalCpus));

    // Memory availability (0-1 scale)
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryAvailability = freeMemory / totalMemory;

    // Process-specific memory usage
    const processMemory = process.memoryUsage();
    const heapUsageRatio = processMemory.heapUsed / processMemory.heapTotal;
    const processMemoryAvailability = 1 - heapUsageRatio;

    // Weighted average of resource indicators
    let resources = (
      cpuAvailability * 0.4 +
      memoryAvailability * 0.3 +
      processMemoryAvailability * 0.3
    );

    // Apply context-based adjustments if provided
    if (context) {
      if (context.highLoad) resources *= 0.7;
      if (context.lowMemory) resources *= 0.7;
      if (context.cpuIntensive) resources *= 0.8;
    }

    return Math.min(1.0, Math.max(0.0, resources));
  }

  /**
   * Hash context features into a single normalized value
   */
  private hashContextFeatures(features: Record<string, any>): number {
    const str = JSON.stringify(features);
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    // Normalize to 0-1
    return Math.abs(hash % 1000) / 1000;
  }

  /**
   * Encode state to string key for Q-table
   */
  encodeState(state: TaskState): string {
    const features = this.extractFeatures(state);
    // Round to reduce state space (discretization)
    return features.map(f => Math.round(f * 10) / 10).join(',');
  }

  /**
   * Encode action to string key
   */
  encodeAction(action: AgentAction): string {
    return `${action.strategy}:${action.parallelization.toFixed(1)}:${action.retryPolicy}`;
  }

  /**
   * Reduce feature dimensionality using simple hashing
   */
  reduceDimensionality(features: number[], targetDim: number): number[] {
    if (features.length <= targetDim) {
      return features;
    }

    const reduced = new Array(targetDim).fill(0);

    for (let i = 0; i < features.length; i++) {
      const targetIndex = i % targetDim;
      reduced[targetIndex] += features[i];
    }

    // Normalize
    const sum = reduced.reduce((a, b) => a + Math.abs(b), 0);
    if (sum > 0) {
      for (let i = 0; i < reduced.length; i++) {
        reduced[i] /= sum;
      }
    }

    return reduced;
  }
}
