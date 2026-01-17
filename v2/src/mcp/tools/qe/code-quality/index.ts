/**
 * Code Quality Tools Index
 * Exports complexity analysis and quality metrics calculation tools
 *
 * @module qe/code-quality
 * @version 1.5.0
 */

// Re-export analysis tools
export {
  analyzeComplexity,
  type ComplexityAnalysisParams,
  type ComplexityAnalysisResult,
  type ComplexityMetric,
  type FunctionComplexity,
  type ComplexityHotspot
} from './analyze-complexity'

export {
  calculateQualityMetrics,
  type QualityMetricsParams,
  type QualityMetricsResult,
  type MaintainabilityScore,
  type ReliabilityScore,
  type SecurityScore,
  type TechnicalDebt
} from './calculate-quality-metrics'

// Response helper
import type { QEToolResponse } from '../shared/types'

const VERSION = '1.5.0';

export function createResponse<T>(data: T, startTime: number): QEToolResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      requestId: `code-quality-${Date.now()}`,
      timestamp: new Date().toISOString(),
      executionTime: Date.now() - startTime,
      version: VERSION
    }
  };
}
