/**
 * Agentic QE v3 - Quality Partition Detector
 * ADR-030: Detects clusters of related quality issues
 *
 * Analyzes quality dimensions to identify partitions (clusters) of related issues.
 * Based on graph partitioning concepts from ruvector-mincut.
 */

import {
  QualityDimensions,
  QualityPartition,
  QualityPartitionType,
  QualityLambda,
  CoherenceGatePolicy,
  DEFAULT_COHERENCE_GATE_POLICY,
} from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Dimension groupings for partition detection
 */
const DIMENSION_GROUPS: Record<QualityPartitionType, (keyof QualityDimensions)[]> = {
  testing: ['coverage', 'passRate', 'reliability'],
  security: ['security'],
  performance: ['performance', 'reliability'],
  maintainability: ['maintainability', 'technicalDebt', 'duplication'],
  mixed: [], // Used when issues span multiple groups
};

/**
 * Configuration for partition detection
 */
export interface PartitionDetectorConfig {
  /** Policy settings for thresholds */
  policy: CoherenceGatePolicy;

  /** Minimum severity to create a partition */
  minPartitionSeverity: number;

  /** Whether to include file paths in partitions */
  includeAffectedPaths: boolean;
}

/**
 * Default detector configuration
 */
const DEFAULT_DETECTOR_CONFIG: PartitionDetectorConfig = {
  policy: DEFAULT_COHERENCE_GATE_POLICY,
  minPartitionSeverity: 0.3,
  includeAffectedPaths: true,
};

/**
 * Result of partition detection
 */
export interface PartitionDetectionResult {
  /** Detected partitions */
  partitions: QualityPartition[];

  /** Total number of partitions */
  partitionCount: number;

  /** Whether quality is fragmented (multiple severe partitions) */
  isFragmented: boolean;

  /** Overall fragmentation score (0-1, higher = more fragmented) */
  fragmentationScore: number;

  /** Recommended priority for remediation */
  priorityPartition?: QualityPartition;
}

/**
 * Quality Partition Detector
 * Identifies clusters of related quality issues
 */
export class PartitionDetector {
  private readonly config: PartitionDetectorConfig;

  constructor(config: Partial<PartitionDetectorConfig> = {}) {
    this.config = { ...DEFAULT_DETECTOR_CONFIG, ...config };
  }

  /**
   * Detect quality partitions from dimensions
   */
  detect(dimensions: QualityDimensions): PartitionDetectionResult {
    const partitions: QualityPartition[] = [];
    const threshold = this.config.policy.boundaryThreshold;

    // Check each dimension group for issues
    for (const [groupType, groupDimensions] of Object.entries(DIMENSION_GROUPS)) {
      if (groupType === 'mixed') continue; // Mixed is handled separately

      const partition = this.analyzeGroup(
        groupType as QualityPartitionType,
        groupDimensions,
        dimensions,
        threshold
      );

      if (partition && partition.severity >= this.config.minPartitionSeverity) {
        partitions.push(partition);
      }
    }

    // Check for mixed partition (issues across groups)
    const mixedPartition = this.detectMixedPartition(dimensions, threshold, partitions);
    if (mixedPartition && mixedPartition.severity >= this.config.minPartitionSeverity) {
      // Only add mixed if it reveals additional issues
      if (!partitions.some(p => p.dimensions.length === mixedPartition.dimensions.length)) {
        partitions.push(mixedPartition);
      }
    }

    // Calculate fragmentation
    const fragmentationScore = this.calculateFragmentation(partitions, dimensions);
    const isFragmented = fragmentationScore > 0.5;

    // Find priority partition (most severe)
    const priorityPartition = partitions.length > 0
      ? partitions.reduce((a, b) => a.severity > b.severity ? a : b)
      : undefined;

    return {
      partitions,
      partitionCount: partitions.length,
      isFragmented,
      fragmentationScore,
      priorityPartition,
    };
  }

  /**
   * Update a lambda with partition information
   */
  updateLambdaWithPartitions(lambda: QualityLambda): QualityLambda {
    const result = this.detect(lambda.dimensions);
    return {
      ...lambda,
      partitionCount: result.partitionCount,
    };
  }

  /**
   * Get remediation recommendations for partitions
   */
  getRemediationPlan(partitions: QualityPartition[]): RemediationPlan {
    const steps: RemediationStep[] = [];

    // Sort partitions by severity (most severe first)
    const sorted = [...partitions].sort((a, b) => b.severity - a.severity);

    for (const partition of sorted) {
      steps.push({
        partition,
        priority: this.calculatePriority(partition),
        estimatedEffort: this.estimateEffort(partition),
        actions: this.getPartitionActions(partition),
      });
    }

    return {
      steps,
      totalPartitions: partitions.length,
      estimatedTotalEffort: steps.reduce((sum, s) => sum + s.estimatedEffort, 0),
      criticalCount: partitions.filter(p => p.isCritical).length,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Analyze a dimension group for issues
   */
  private analyzeGroup(
    type: QualityPartitionType,
    groupDimensions: (keyof QualityDimensions)[],
    dimensions: QualityDimensions,
    threshold: number
  ): QualityPartition | null {
    const affectedDimensions: (keyof QualityDimensions)[] = [];
    let totalSeverity = 0;
    let hasCritical = false;

    for (const dim of groupDimensions) {
      const value = dimensions[dim];
      if (value !== undefined && value < threshold) {
        affectedDimensions.push(dim);

        // Calculate severity for this dimension (how far below threshold)
        const severity = (threshold - value) / threshold;
        totalSeverity += severity;

        // Check if critical (significantly below threshold)
        if (value < threshold - 0.2) {
          hasCritical = true;
        }
      }
    }

    if (affectedDimensions.length === 0) {
      return null;
    }

    const avgSeverity = totalSeverity / affectedDimensions.length;

    return {
      id: uuidv4(),
      type,
      dimensions: affectedDimensions,
      severity: avgSeverity,
      isCritical: hasCritical,
      remediation: this.getRemediationForType(type, avgSeverity),
    };
  }

  /**
   * Detect mixed partition (issues spanning multiple groups)
   */
  private detectMixedPartition(
    dimensions: QualityDimensions,
    threshold: number,
    existingPartitions: QualityPartition[]
  ): QualityPartition | null {
    // Find all dimensions below threshold
    const allAffected: (keyof QualityDimensions)[] = [];

    for (const [key, value] of Object.entries(dimensions) as [keyof QualityDimensions, number | undefined][]) {
      if (value !== undefined && value < threshold) {
        allAffected.push(key);
      }
    }

    if (allAffected.length <= 2) {
      return null; // Not enough for a mixed partition
    }

    // Check if dimensions span multiple groups
    const groups = new Set<QualityPartitionType>();
    for (const dim of allAffected) {
      for (const [groupType, groupDims] of Object.entries(DIMENSION_GROUPS)) {
        if (groupDims.includes(dim)) {
          groups.add(groupType as QualityPartitionType);
        }
      }
    }

    if (groups.size < 2) {
      return null; // All in same group
    }

    // Calculate overall severity
    let totalSeverity = 0;
    for (const dim of allAffected) {
      const value = dimensions[dim];
      if (value !== undefined) {
        totalSeverity += (threshold - value) / threshold;
      }
    }
    const avgSeverity = totalSeverity / allAffected.length;

    return {
      id: uuidv4(),
      type: 'mixed',
      dimensions: allAffected,
      severity: avgSeverity,
      isCritical: avgSeverity > 0.5,
      remediation: 'Multiple quality areas affected. Consider comprehensive quality review.',
    };
  }

  /**
   * Calculate fragmentation score
   */
  private calculateFragmentation(
    partitions: QualityPartition[],
    dimensions: QualityDimensions
  ): number {
    if (partitions.length === 0) {
      return 0;
    }

    // Count total dimensions
    let totalDimensions = 0;
    for (const value of Object.values(dimensions)) {
      if (value !== undefined) {
        totalDimensions++;
      }
    }

    if (totalDimensions === 0) {
      return 0;
    }

    // Count affected dimensions across all partitions
    const affectedDimensions = new Set<keyof QualityDimensions>();
    for (const partition of partitions) {
      for (const dim of partition.dimensions) {
        affectedDimensions.add(dim);
      }
    }

    // Fragmentation = (partitions * affected) / (total^2)
    // Normalized to 0-1 range
    const score = (partitions.length * affectedDimensions.size) / (totalDimensions * totalDimensions);

    return Math.min(score, 1);
  }

  /**
   * Get remediation suggestion for partition type
   */
  private getRemediationForType(type: QualityPartitionType, severity: number): string {
    const remediations: Record<QualityPartitionType, string[]> = {
      testing: [
        'Add unit tests for uncovered code paths',
        'Fix failing tests and investigate root causes',
        'Implement flaky test detection and stabilization',
      ],
      security: [
        'Run security vulnerability scan',
        'Update dependencies with known vulnerabilities',
        'Review and fix security issues immediately',
      ],
      performance: [
        'Profile application for performance bottlenecks',
        'Optimize slow code paths',
        'Consider caching or lazy loading strategies',
      ],
      maintainability: [
        'Refactor complex code sections',
        'Reduce code duplication through abstraction',
        'Address technical debt in high-impact areas',
      ],
      mixed: [
        'Conduct comprehensive quality review',
        'Prioritize issues by business impact',
        'Consider dedicated quality improvement sprint',
      ],
    };

    const suggestions = remediations[type];
    if (severity > 0.7) {
      return `CRITICAL: ${suggestions[2]}`;
    } else if (severity > 0.4) {
      return suggestions[1];
    }
    return suggestions[0];
  }

  /**
   * Calculate priority for remediation step
   */
  private calculatePriority(partition: QualityPartition): 'critical' | 'high' | 'medium' | 'low' {
    if (partition.isCritical) return 'critical';
    if (partition.severity > 0.7) return 'high';
    if (partition.severity > 0.4) return 'medium';
    return 'low';
  }

  /**
   * Estimate effort for partition remediation (in hours)
   */
  private estimateEffort(partition: QualityPartition): number {
    const baseEffort = partition.dimensions.length * 2; // 2 hours per dimension
    const severityMultiplier = 1 + partition.severity; // Higher severity = more effort

    // Different types have different base efforts
    const typeMultipliers: Record<QualityPartitionType, number> = {
      testing: 1.0,
      security: 1.5, // Security takes more care
      performance: 1.2,
      maintainability: 1.3, // Refactoring takes time
      mixed: 1.5,
    };

    return Math.ceil(baseEffort * severityMultiplier * typeMultipliers[partition.type]);
  }

  /**
   * Get specific actions for partition type
   */
  private getPartitionActions(partition: QualityPartition): string[] {
    const actions: string[] = [];

    switch (partition.type) {
      case 'testing':
        actions.push('Review test coverage reports');
        actions.push('Identify and fix failing tests');
        if (partition.dimensions.includes('reliability')) {
          actions.push('Quarantine and fix flaky tests');
        }
        break;

      case 'security':
        actions.push('Run full security scan');
        actions.push('Review CVE database for dependencies');
        actions.push('Apply security patches');
        break;

      case 'performance':
        actions.push('Profile application performance');
        actions.push('Review and optimize slow endpoints');
        actions.push('Check for memory leaks');
        break;

      case 'maintainability':
        actions.push('Run code quality analysis');
        if (partition.dimensions.includes('duplication')) {
          actions.push('Identify and extract common code');
        }
        if (partition.dimensions.includes('technicalDebt')) {
          actions.push('Prioritize technical debt items');
        }
        break;

      case 'mixed':
        actions.push('Schedule comprehensive quality review');
        actions.push('Create quality improvement backlog');
        actions.push('Assign ownership for each area');
        break;
    }

    return actions;
  }
}

/**
 * Remediation step for a partition
 */
export interface RemediationStep {
  partition: QualityPartition;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedEffort: number; // hours
  actions: string[];
}

/**
 * Complete remediation plan
 */
export interface RemediationPlan {
  steps: RemediationStep[];
  totalPartitions: number;
  estimatedTotalEffort: number; // hours
  criticalCount: number;
}

/**
 * Factory function to create a partition detector
 */
export function createPartitionDetector(
  config?: Partial<PartitionDetectorConfig>
): PartitionDetector {
  return new PartitionDetector(config);
}

/**
 * Convenience function to detect partitions
 */
export function detectQualityPartitions(
  dimensions: QualityDimensions,
  config?: Partial<PartitionDetectorConfig>
): PartitionDetectionResult {
  const detector = createPartitionDetector(config);
  return detector.detect(dimensions);
}
