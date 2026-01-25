/**
 * QuantizationManager - Centralized Vector Quantization management
 * Provides utilities for optimal quantization selection, monitoring, and tuning
 */

export type QuantizationType = 'scalar' | 'binary' | 'product' | 'none';

export interface QuantizationMetrics {
  type: QuantizationType;
  memoryReduction: number; // Reduction factor (e.g., 4x, 32x)
  estimatedAccuracyLoss: number; // Percentage (e.g., 1-5%)
  searchSpeedIncrease: number; // Multiplier (e.g., 3x, 10x)
  memoryUsageMB: number;
  vectorCount: number;
  timestamp: Date;
}

export interface QuantizationRecommendation {
  type: QuantizationType;
  reason: string;
  expectedBenefits: {
    memoryReduction: string;
    speedIncrease: string;
    accuracyImpact: string;
  };
  useCase: string;
}

export interface AgentProfile {
  vectorCount: number; // How many vectors will be stored
  memoryConstraint?: 'low' | 'medium' | 'high'; // Memory availability
  accuracyPriority?: 'low' | 'medium' | 'high' | 'critical'; // Accuracy requirement
  speedPriority?: 'low' | 'medium' | 'high' | 'critical'; // Speed requirement
  deployment?: 'cloud' | 'edge' | 'mobile' | 'desktop'; // Deployment target
}

export class QuantizationManager {
  private static metricsHistory: Map<string, QuantizationMetrics[]> = new Map();

  /**
   * Get optimal quantization type based on agent profile
   */
  static getRecommendation(profile: AgentProfile): QuantizationRecommendation {
    const { vectorCount, memoryConstraint, accuracyPriority, speedPriority, deployment } = profile;

    // Critical accuracy requirement - no quantization
    if (accuracyPriority === 'critical') {
      return {
        type: 'none',
        reason: 'Critical accuracy requirement demands full precision',
        expectedBenefits: {
          memoryReduction: '1x (no reduction)',
          speedIncrease: '1x (baseline)',
          accuracyImpact: '0% loss'
        },
        useCase: 'Production systems requiring maximum accuracy'
      };
    }

    // Mobile/Edge deployment - aggressive compression
    if (deployment === 'mobile' || deployment === 'edge' || memoryConstraint === 'low') {
      return {
        type: 'binary',
        reason: 'Mobile/edge deployment requires aggressive memory optimization',
        expectedBenefits: {
          memoryReduction: '32x (e.g., 3GB → 96MB)',
          speedIncrease: '10x faster search',
          accuracyImpact: '2-5% loss (95-98% accuracy)'
        },
        useCase: 'Mobile apps, edge devices, low-memory environments'
      };
    }

    // Large scale (1M+ vectors) - product quantization
    if (vectorCount > 1000000) {
      return {
        type: 'product',
        reason: 'Large-scale deployment benefits from product quantization',
        expectedBenefits: {
          memoryReduction: '8-16x (e.g., 3GB → 192MB)',
          speedIncrease: '5x faster search',
          accuracyImpact: '3-7% loss (93-97% accuracy)'
        },
        useCase: 'Large-scale vector databases (>1M vectors)'
      };
    }

    // High speed priority - binary or product
    if (speedPriority === 'critical' || speedPriority === 'high') {
      return {
        type: vectorCount > 100000 ? 'product' : 'binary',
        reason: 'High speed priority requires aggressive optimization',
        expectedBenefits: {
          memoryReduction: vectorCount > 100000 ? '8-16x' : '32x',
          speedIncrease: vectorCount > 100000 ? '5x' : '10x',
          accuracyImpact: vectorCount > 100000 ? '3-7% loss' : '2-5% loss'
        },
        useCase: 'Real-time search, low-latency applications'
      };
    }

    // Medium scale (10K-1M vectors) - scalar quantization (RECOMMENDED DEFAULT)
    if (vectorCount >= 10000 && vectorCount <= 1000000) {
      return {
        type: 'scalar',
        reason: 'Balanced performance/accuracy for medium-scale deployment',
        expectedBenefits: {
          memoryReduction: '4x (e.g., 3GB → 768MB)',
          speedIncrease: '3x faster search',
          accuracyImpact: '1-2% loss (98-99% accuracy)'
        },
        useCase: 'Production applications, medium datasets (10K-1M vectors)'
      };
    }

    // Small scale (<10K vectors) - no quantization needed
    if (vectorCount < 10000) {
      return {
        type: 'none',
        reason: 'Small dataset doesn\'t benefit significantly from quantization',
        expectedBenefits: {
          memoryReduction: '1x (no reduction)',
          speedIncrease: '1x (baseline)',
          accuracyImpact: '0% loss'
        },
        useCase: 'Development, small datasets (<10K vectors)'
      };
    }

    // Default recommendation - scalar (safe choice)
    return {
      type: 'scalar',
      reason: 'Balanced default choice for general use',
      expectedBenefits: {
        memoryReduction: '4x',
        speedIncrease: '3x',
        accuracyImpact: '1-2% loss'
      },
      useCase: 'General-purpose applications'
    };
  }

  /**
   * Calculate memory usage for given configuration
   */
  static calculateMemoryUsage(
    vectorCount: number,
    dimensions: number = 768,
    quantizationType: QuantizationType = 'scalar'
  ): { bytesPerVector: number; totalMB: number; reduction: string } {
    const float32BytesPerDim = 4;
    const baseBytes = dimensions * float32BytesPerDim;

    let bytesPerVector: number;
    let reductionFactor: number;

    switch (quantizationType) {
      case 'binary':
        bytesPerVector = Math.ceil(dimensions / 8); // 1 bit per dimension
        reductionFactor = 32;
        break;
      case 'scalar':
        bytesPerVector = dimensions; // uint8 per dimension
        reductionFactor = 4;
        break;
      case 'product':
        bytesPerVector = Math.ceil(dimensions / 16); // Product quantization ~16x
        reductionFactor = 16;
        break;
      case 'none':
      default:
        bytesPerVector = baseBytes;
        reductionFactor = 1;
        break;
    }

    const totalBytes = vectorCount * bytesPerVector;
    const totalMB = totalBytes / (1024 * 1024);

    return {
      bytesPerVector,
      totalMB: Math.round(totalMB * 100) / 100,
      reduction: reductionFactor === 1 ? 'none' : `${reductionFactor}x`
    };
  }

  /**
   * Record quantization metrics for monitoring
   */
  static recordMetrics(agentId: string, metrics: QuantizationMetrics): void {
    if (!this.metricsHistory.has(agentId)) {
      this.metricsHistory.set(agentId, []);
    }
    this.metricsHistory.get(agentId)!.push(metrics);

    // Keep only last 100 metrics per agent
    const history = this.metricsHistory.get(agentId)!;
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Get metrics for an agent
   */
  static getMetrics(agentId: string): QuantizationMetrics[] {
    return this.metricsHistory.get(agentId) || [];
  }

  /**
   * Get aggregated metrics across all agents
   */
  static getAggregatedMetrics(): {
    totalVectors: number;
    totalMemoryMB: number;
    averageMemoryReduction: number;
    quantizationTypes: Record<QuantizationType, number>;
  } {
    let totalVectors = 0;
    let totalMemoryMB = 0;
    let totalReduction = 0;
    let count = 0;
    const quantizationTypes: Record<QuantizationType, number> = {
      none: 0,
      scalar: 0,
      binary: 0,
      product: 0
    };

    for (const metrics of this.metricsHistory.values()) {
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        totalVectors += latest.vectorCount;
        totalMemoryMB += latest.memoryUsageMB;
        totalReduction += latest.memoryReduction;
        count++;
        quantizationTypes[latest.type]++;
      }
    }

    return {
      totalVectors,
      totalMemoryMB: Math.round(totalMemoryMB * 100) / 100,
      averageMemoryReduction: count > 0 ? totalReduction / count : 1,
      quantizationTypes
    };
  }

  /**
   * Compare quantization types side-by-side
   */
  static compareQuantizationTypes(vectorCount: number, dimensions: number = 768): Array<{
    type: QuantizationType;
    memoryMB: number;
    reduction: string;
    speedMultiplier: string;
    accuracyLoss: string;
    recommended: boolean;
  }> {
    const types: QuantizationType[] = ['none', 'scalar', 'binary', 'product'];
    const profile: AgentProfile = { vectorCount };
    const recommendation = this.getRecommendation(profile);

    return types.map(type => {
      const { totalMB, reduction } = this.calculateMemoryUsage(vectorCount, dimensions, type);

      let speedMultiplier: string;
      let accuracyLoss: string;

      switch (type) {
        case 'binary':
          speedMultiplier = '10x';
          accuracyLoss = '2-5%';
          break;
        case 'scalar':
          speedMultiplier = '3x';
          accuracyLoss = '1-2%';
          break;
        case 'product':
          speedMultiplier = '5x';
          accuracyLoss = '3-7%';
          break;
        case 'none':
        default:
          speedMultiplier = '1x';
          accuracyLoss = '0%';
          break;
      }

      return {
        type,
        memoryMB: totalMB,
        reduction,
        speedMultiplier,
        accuracyLoss,
        recommended: type === recommendation.type
      };
    });
  }

  /**
   * Generate quantization report for diagnostics
   */
  static generateReport(): string {
    const aggregated = this.getAggregatedMetrics();
    const report: string[] = [
      '═══════════════════════════════════════════════════════════',
      '           VECTOR QUANTIZATION REPORT',
      '═══════════════════════════════════════════════════════════',
      '',
      '📊 AGGREGATE METRICS:',
      `  Total Vectors: ${aggregated.totalVectors.toLocaleString()}`,
      `  Total Memory Usage: ${aggregated.totalMemoryMB.toFixed(2)} MB`,
      `  Average Reduction: ${aggregated.averageMemoryReduction.toFixed(1)}x`,
      '',
      '🔧 QUANTIZATION DISTRIBUTION:',
      `  None (Full Precision): ${aggregated.quantizationTypes.none} agents`,
      `  Scalar (4x):           ${aggregated.quantizationTypes.scalar} agents`,
      `  Binary (32x):          ${aggregated.quantizationTypes.binary} agents`,
      `  Product (8-16x):       ${aggregated.quantizationTypes.product} agents`,
      '',
      '═══════════════════════════════════════════════════════════'
    ];

    return report.join('\n');
  }

  /**
   * Clear all metrics (for testing)
   */
  static clearMetrics(): void {
    this.metricsHistory.clear();
  }
}
