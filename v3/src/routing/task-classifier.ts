/**
 * Task Classifier - TD-002
 * ADR-026: Intelligent Model Routing
 *
 * Classifies QE tasks by complexity to enable intelligent model routing.
 * Uses multiple factors to determine task complexity and recommend
 * the optimal Claude model (haiku/sonnet/opus).
 */

import type { QETask, AgentCapability } from './types.js';
import type { QEDomain } from '../learning/qe-patterns.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Task complexity levels for model routing
 */
export type TaskComplexity = 'simple' | 'moderate' | 'complex' | 'critical';

/**
 * Claude model types for routing
 */
export type ClaudeModel = 'haiku' | 'sonnet' | 'opus';

/**
 * A factor that contributes to complexity scoring
 */
export interface ComplexityFactor {
  /** Factor name/identifier */
  readonly name: string;
  /** Weight contribution to the score */
  readonly weight: number;
  /** Human-readable description */
  readonly description?: string;
}

/**
 * Result of task classification
 */
export interface ClassificationResult {
  /** Determined complexity level */
  readonly complexity: TaskComplexity;
  /** Recommended Claude model based on complexity */
  readonly recommendedModel: ClaudeModel;
  /** Factors that contributed to the score */
  readonly factors: ComplexityFactor[];
  /** Raw complexity score (0-100) */
  readonly score: number;
  /** Classification timestamp */
  readonly timestamp: Date;
}

/**
 * Extended task properties for classification
 * Extends QETask with additional fields useful for complexity analysis
 */
export interface ClassifiableTask extends QETask {
  /** Number of files involved in the task */
  readonly fileCount?: number;
  /** Whether task spans multiple components/modules */
  readonly crossComponent?: boolean;
  /** Task type identifier */
  readonly type?: string;
  /** Estimated lines of code affected */
  readonly estimatedLinesAffected?: number;
  /** Whether task requires external API calls */
  readonly requiresExternalApis?: boolean;
  /** Whether task involves database operations */
  readonly involvesDatabaseOps?: boolean;
  /** Whether task is time-sensitive */
  readonly timeSensitive?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Domains that inherently require more complex reasoning
 */
const COMPLEX_DOMAINS: readonly QEDomain[] = [
  'security-compliance',
  'chaos-resilience',
  'defect-intelligence',
] as const;

/**
 * Domains with moderate complexity
 */
const MODERATE_DOMAINS: readonly QEDomain[] = [
  'code-intelligence',
  'contract-testing',
  'quality-assessment',
  'learning-optimization',
] as const;

/**
 * Capabilities that indicate complex tasks
 */
const COMPLEX_CAPABILITIES: readonly AgentCapability[] = [
  'sast',
  'dast',
  'vulnerability',
  'owasp',
  'chaos-testing',
  'resilience',
  'fault-injection',
  'mutation-testing',
] as const;

/**
 * Complexity score thresholds for classification
 */
const COMPLEXITY_THRESHOLDS = {
  critical: 70,
  complex: 45,
  moderate: 20,
} as const;

/**
 * Model mapping based on complexity
 */
const COMPLEXITY_TO_MODEL: Record<TaskComplexity, ClaudeModel> = {
  critical: 'opus',
  complex: 'sonnet',
  moderate: 'sonnet',
  simple: 'haiku',
} as const;

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Classify a task by complexity
 *
 * Analyzes multiple factors including:
 * - File count and scope
 * - Domain complexity
 * - Required capabilities
 * - Cross-component impact
 * - Priority level
 *
 * @param task - The task to classify
 * @returns Classification result with complexity, model recommendation, and factors
 */
export function classifyTask(task: ClassifiableTask): ClassificationResult {
  const factors: ComplexityFactor[] = [];
  let score = 0;

  // Factor 1: File count (high file count = more complex)
  if (task.fileCount !== undefined) {
    if (task.fileCount > 20) {
      score += 25;
      factors.push({
        name: 'very-high-file-count',
        weight: 25,
        description: `Task involves ${task.fileCount} files (>20)`,
      });
    } else if (task.fileCount > 10) {
      score += 20;
      factors.push({
        name: 'high-file-count',
        weight: 20,
        description: `Task involves ${task.fileCount} files (>10)`,
      });
    } else if (task.fileCount > 5) {
      score += 10;
      factors.push({
        name: 'moderate-file-count',
        weight: 10,
        description: `Task involves ${task.fileCount} files (>5)`,
      });
    }
  }

  // Factor 2: Domain complexity
  if (task.domain) {
    if (COMPLEX_DOMAINS.includes(task.domain)) {
      score += 30;
      factors.push({
        name: 'complex-domain',
        weight: 30,
        description: `Domain '${task.domain}' requires complex reasoning`,
      });
    } else if (MODERATE_DOMAINS.includes(task.domain)) {
      score += 15;
      factors.push({
        name: 'moderate-domain',
        weight: 15,
        description: `Domain '${task.domain}' has moderate complexity`,
      });
    }
  }

  // Factor 3: Cross-component impact
  if (task.crossComponent) {
    score += 25;
    factors.push({
      name: 'cross-component',
      weight: 25,
      description: 'Task spans multiple components/modules',
    });
  }

  // Factor 4: Priority level
  if (task.priority === 'critical') {
    score += 25;
    factors.push({
      name: 'critical-priority',
      weight: 25,
      description: 'Critical priority requires careful attention',
    });
  } else if (task.priority === 'high') {
    score += 15;
    factors.push({
      name: 'high-priority',
      weight: 15,
      description: 'High priority task',
    });
  }

  // Factor 5: Complex capabilities required
  if (task.requiredCapabilities) {
    const complexCapCount = task.requiredCapabilities.filter(
      cap => COMPLEX_CAPABILITIES.includes(cap)
    ).length;
    if (complexCapCount > 0) {
      const weight = Math.min(20, complexCapCount * 10);
      score += weight;
      factors.push({
        name: 'complex-capabilities',
        weight,
        description: `Requires ${complexCapCount} complex capabilit${complexCapCount === 1 ? 'y' : 'ies'}`,
      });
    }
  }

  // Factor 6: External API dependencies
  if (task.requiresExternalApis) {
    score += 10;
    factors.push({
      name: 'external-apis',
      weight: 10,
      description: 'Requires external API integration',
    });
  }

  // Factor 7: Database operations
  if (task.involvesDatabaseOps) {
    score += 10;
    factors.push({
      name: 'database-ops',
      weight: 10,
      description: 'Involves database operations',
    });
  }

  // Factor 8: Time sensitivity
  if (task.timeSensitive) {
    score += 5;
    factors.push({
      name: 'time-sensitive',
      weight: 5,
      description: 'Time-sensitive task',
    });
  }

  // Factor 9: Estimated lines affected
  if (task.estimatedLinesAffected !== undefined) {
    if (task.estimatedLinesAffected > 500) {
      score += 15;
      factors.push({
        name: 'large-change',
        weight: 15,
        description: `Estimated ${task.estimatedLinesAffected} lines affected (>500)`,
      });
    } else if (task.estimatedLinesAffected > 200) {
      score += 10;
      factors.push({
        name: 'medium-change',
        weight: 10,
        description: `Estimated ${task.estimatedLinesAffected} lines affected (>200)`,
      });
    }
  }

  // Factor 10: Security-related task type
  if (task.type === 'security-scan' || task.type === 'vulnerability-assessment') {
    score += 20;
    factors.push({
      name: 'security-task',
      weight: 20,
      description: 'Security-related task requires careful analysis',
    });
  }

  // Determine complexity level based on score
  const complexity: TaskComplexity =
    score >= COMPLEXITY_THRESHOLDS.critical ? 'critical' :
    score >= COMPLEXITY_THRESHOLDS.complex ? 'complex' :
    score >= COMPLEXITY_THRESHOLDS.moderate ? 'moderate' :
    'simple';

  const recommendedModel = COMPLEXITY_TO_MODEL[complexity];

  return {
    complexity,
    recommendedModel,
    factors,
    score,
    timestamp: new Date(),
  };
}

/**
 * Quick check if a task is simple enough for Haiku
 *
 * @param task - The task to check
 * @returns true if task is simple enough for Haiku
 */
export function isSimpleTask(task: ClassifiableTask): boolean {
  const result = classifyTask(task);
  return result.complexity === 'simple';
}

/**
 * Quick check if a task requires Opus
 *
 * @param task - The task to check
 * @returns true if task requires Opus-level reasoning
 */
export function requiresOpus(task: ClassifiableTask): boolean {
  const result = classifyTask(task);
  return result.complexity === 'critical';
}

/**
 * Get the model recommendation for a task without full classification
 *
 * @param task - The task to analyze
 * @returns Recommended Claude model
 */
export function getRecommendedModel(task: ClassifiableTask): ClaudeModel {
  const result = classifyTask(task);
  return result.recommendedModel;
}

/**
 * Calculate complexity score without full classification
 *
 * @param task - The task to score
 * @returns Complexity score (0-100)
 */
export function getComplexityScore(task: ClassifiableTask): number {
  const result = classifyTask(task);
  return result.score;
}

// ============================================================================
// Exports
// ============================================================================

export {
  COMPLEX_DOMAINS,
  MODERATE_DOMAINS,
  COMPLEX_CAPABILITIES,
  COMPLEXITY_THRESHOLDS,
  COMPLEXITY_TO_MODEL,
};
