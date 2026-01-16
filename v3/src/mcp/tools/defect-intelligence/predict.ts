/**
 * Agentic QE v3 - Defect Intelligence MCP Tool
 *
 * qe/defects/predict - Predict defect probability using ML models
 *
 * This tool wraps the REAL defect-intelligence domain service.
 * Uses actual code analysis, git history, and weighted feature prediction.
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema, getSharedMemoryBackend } from '../base';
import { ToolResult } from '../../types';
import { DefectPredictorService } from '../../../domains/defect-intelligence/services/defect-predictor';
import { MemoryBackend, VectorSearchResult } from '../../../kernel/interfaces';
import { Severity } from '../../../shared/types';

// ============================================================================
// Types
// ============================================================================

export interface DefectPredictParams {
  files?: string[];
  target?: string;
  lookback?: number;
  minConfidence?: number;
  threshold?: number;
  features?: PredictionFeature[];
  [key: string]: unknown;
}

export interface PredictionFeature {
  name: string;
  weight?: number;
}

export interface DefectPredictResult {
  predictions: FilePrediction[];
  modelConfidence: number;
  topRiskFactors: RiskFactor[];
  recommendations: string[];
  modelMetrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
  };
}

export interface FilePrediction {
  file: string;
  probability: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  factors: ContributingFactor[];
  recommendations: string[];
}

export interface ContributingFactor {
  name: string;
  contribution: number;
  description: string;
}

export interface RiskFactor {
  name: string;
  impact: number;
  affectedFiles: number;
}

// ============================================================================
// Feature Descriptions
// ============================================================================

const FACTOR_DESCRIPTIONS: Record<string, string> = {
  codeComplexity: 'High cyclomatic complexity increases defect probability',
  changeFrequency: 'Frequently modified files are more prone to defects',
  bugHistory: 'Previous defects in this area indicate higher risk',
  testCoverage: 'Low test coverage increases undetected defect risk',
  developerExperience: 'Code written by less experienced developers may have more issues',
  codeAge: 'New code is more likely to have defects than mature, stable code',
  complexity: 'High cyclomatic complexity increases defect probability',
  churn: 'Frequently modified files are more prone to defects',
  history: 'Previous defects in this area indicate higher risk',
  coverage: 'Low test coverage increases undetected defect risk',
  coupling: 'High coupling makes changes risky',
  age: 'New code may have more defects than stable code',
};

// ============================================================================
// Tool Implementation
// ============================================================================

export class DefectPredictTool extends MCPToolBase<DefectPredictParams, DefectPredictResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/defects/predict',
    description:
      'Predict defect probability for files using ML models. Analyzes code complexity, change frequency, git history, and test coverage.',
    domain: 'defect-intelligence',
    schema: DEFECT_PREDICT_SCHEMA,
    streaming: true,
    timeout: 180000,
  };

  private predictorService: DefectPredictorService | null = null;

  /**
   * Get or create the defect predictor service
   */
  private async getService(context: MCPToolContext): Promise<DefectPredictorService> {
    if (!this.predictorService) {
      // Create a memory backend from context or use shared persistent backend
      const memory = (context as any).memory as MemoryBackend | undefined;

      if (memory) {
        this.predictorService = new DefectPredictorService(memory);
      } else {
        // Use shared persistent memory backend
        this.predictorService = new DefectPredictorService(await getSharedMemoryBackend());
      }
    }
    return this.predictorService;
  }

  async execute(
    params: DefectPredictParams,
    context: MCPToolContext
  ): Promise<ToolResult<DefectPredictResult>> {
    const {
      files = [],
      threshold = 0.5,
      minConfidence = 0.7,
      features = [
        { name: 'codeComplexity', weight: 0.25 },
        { name: 'changeFrequency', weight: 0.20 },
        { name: 'developerExperience', weight: 0.15 },
        { name: 'testCoverage', weight: 0.20 },
        { name: 'codeAge', weight: 0.10 },
        { name: 'bugHistory', weight: 0.10 },
      ],
    } = params;

    try {
      this.emitStream(context, {
        status: 'analyzing',
        message: `Analyzing ${files.length || 'provided'} files using ML-based prediction`,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      // Check if demo mode is EXPLICITLY requested (only for testing/docs)
      if (this.isDemoMode(context)) {
        this.markAsDemoData(context, 'Demo mode explicitly requested');
        return this.getDemoResult(files);
      }

      // Get the real service
      const service = await this.getService(context);

      // Use real prediction service - NO FALLBACKS
      const result = await service.predictDefects({
        files,
        features: features.map((f) => ({
          name: f.name,
          weight: f.weight ?? 0.25,
        })),
        threshold,
      });

      // If prediction failed, return error - don't silently fall back
      if (!result.success) {
        return {
          success: false,
          error: `Defect prediction failed: ${result.error?.message || 'Service unavailable'}. Ensure the defect-intelligence domain is properly initialized.`,
        };
      }

      // Mark as real data - we have actual predictions
      this.markAsRealData();

      const predictions = result.value.predictions;

      // Filter by minimum confidence
      const filteredPredictions = predictions.filter((p) => p.probability >= 1 - minConfidence);

      // Convert to output format
      const outputPredictions: FilePrediction[] = filteredPredictions.map((p) => ({
        file: p.file,
        probability: Math.round(p.probability * 100) / 100,
        riskLevel: severityToRiskLevel(p.riskLevel),
        factors: p.factors.map((f) => ({
          name: f.name,
          contribution: f.contribution,
          description: FACTOR_DESCRIPTIONS[f.name] || `${f.name} contributes to defect risk`,
        })),
        recommendations: p.recommendations,
      }));

      // Sort by probability (highest risk first)
      outputPredictions.sort((a, b) => b.probability - a.probability);

      // Aggregate risk factors across all predictions
      const topRiskFactors = aggregateRiskFactors(outputPredictions);

      // Get model metrics
      const modelMetrics = await service.getModelMetrics();

      this.emitStream(context, {
        status: 'complete',
        message: `Analyzed ${files.length} files, ${outputPredictions.length} with elevated risk`,
        progress: 100,
      });

      return {
        success: true,
        data: {
          predictions: outputPredictions,
          modelConfidence: result.value.modelConfidence,
          topRiskFactors,
          recommendations: generateGlobalRecommendations(outputPredictions),
          modelMetrics: {
            accuracy: modelMetrics.accuracy,
            precision: modelMetrics.precision,
            recall: modelMetrics.recall,
            f1Score: modelMetrics.f1Score,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Defect prediction failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Return demo defect prediction data when no real data available.
   * Only used when demoMode is explicitly requested or as fallback with warning.
   */
  private getDemoResult(files: string[]): ToolResult<DefectPredictResult> {
    const targetFiles = files.length > 0 ? files : ['src/service.ts', 'src/handler.ts', 'src/utils.ts'];

    const predictions: FilePrediction[] = targetFiles.map((file, idx) => ({
      file,
      probability: Math.max(0.9 - idx * 0.15, 0.35),
      riskLevel: idx === 0 ? 'high' : idx === 1 ? 'medium' : 'low',
      factors: [
        { name: 'codeComplexity', contribution: 0.35, description: FACTOR_DESCRIPTIONS['codeComplexity'] },
        { name: 'changeFrequency', contribution: 0.25, description: FACTOR_DESCRIPTIONS['changeFrequency'] },
        { name: 'testCoverage', contribution: 0.20, description: FACTOR_DESCRIPTIONS['testCoverage'] },
      ],
      recommendations: [
        `Increase test coverage for ${file}`,
        'Consider refactoring complex functions',
        'Review recent changes for potential issues',
      ],
    }));

    return {
      success: true,
      data: {
        predictions,
        modelConfidence: 0.85,
        topRiskFactors: [
          { name: 'High Complexity', impact: 0.35, affectedFiles: predictions.length },
          { name: 'Frequent Changes', impact: 0.25, affectedFiles: Math.ceil(predictions.length * 0.7) },
          { name: 'Low Coverage', impact: 0.20, affectedFiles: Math.ceil(predictions.length * 0.5) },
        ],
        recommendations: [
          'Focus testing on files with highest defect probability',
          'Increase test coverage in high-risk areas',
          'Review recent changes to frequently-modified files',
          'Consider refactoring complex modules',
        ],
        modelMetrics: {
          accuracy: 0.82,
          precision: 0.78,
          recall: 0.85,
          f1Score: 0.81,
        },
      },
    };
  }

  /**
   * Reset instance-level service cache.
   * Called when fleet is disposed to prevent stale backend references.
   */
  override resetInstanceCache(): void {
    this.predictorService = null;
  }
}

// ============================================================================
// Schema
// ============================================================================

const DEFECT_PREDICT_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      description: 'Specific files to analyze',
      items: { type: 'string', description: 'File path' },
    },
    target: {
      type: 'string',
      description: 'Target directory to analyze',
      default: '.',
    },
    lookback: {
      type: 'number',
      description: 'Days of history to consider',
      minimum: 7,
      maximum: 365,
      default: 30,
    },
    threshold: {
      type: 'number',
      description: 'Risk threshold for classification (0-1)',
      minimum: 0,
      maximum: 1,
      default: 0.5,
    },
    minConfidence: {
      type: 'number',
      description: 'Minimum prediction confidence (0-1)',
      minimum: 0,
      maximum: 1,
      default: 0.7,
    },
    features: {
      type: 'array',
      description: 'Features to use for prediction',
      items: {
        type: 'object',
        description: 'Prediction feature',
        properties: {
          name: { type: 'string', description: 'Feature name' },
          weight: { type: 'number', description: 'Feature weight' },
        },
      },
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function severityToRiskLevel(severity: Severity): 'critical' | 'high' | 'medium' | 'low' {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
    case 'info':
    default:
      return 'low';
  }
}

function aggregateRiskFactors(predictions: FilePrediction[]): RiskFactor[] {
  const factorCounts = new Map<string, { impact: number; count: number }>();

  for (const pred of predictions) {
    for (const factor of pred.factors) {
      const existing = factorCounts.get(factor.name) || { impact: 0, count: 0 };
      existing.impact += factor.contribution;
      existing.count += 1;
      factorCounts.set(factor.name, existing);
    }
  }

  const factors: RiskFactor[] = [];
  for (const [name, data] of factorCounts) {
    factors.push({
      name: formatFactorName(name),
      impact: Math.round((data.impact / data.count) * 100) / 100,
      affectedFiles: data.count,
    });
  }

  // Sort by impact
  factors.sort((a, b) => b.impact - a.impact);

  return factors.slice(0, 5); // Top 5 factors
}

function formatFactorName(name: string): string {
  const nameMap: Record<string, string> = {
    codeComplexity: 'High Complexity',
    changeFrequency: 'Frequent Changes',
    bugHistory: 'Bug History',
    testCoverage: 'Low Coverage',
    developerExperience: 'Developer Experience',
    codeAge: 'Code Age',
  };
  return nameMap[name] || name.replace(/([A-Z])/g, ' $1').trim();
}

function generateGlobalRecommendations(predictions: FilePrediction[]): string[] {
  const recommendations: string[] = [];

  const criticalCount = predictions.filter((p) => p.riskLevel === 'critical').length;
  const highCount = predictions.filter((p) => p.riskLevel === 'high').length;
  const avgProbability =
    predictions.length > 0
      ? predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length
      : 0;

  if (criticalCount > 0) {
    recommendations.push(`CRITICAL: ${criticalCount} files require immediate attention`);
    recommendations.push('Consider code review and comprehensive testing before deployment');
  }

  if (highCount > 0) {
    recommendations.push(`High risk detected in ${highCount} files`);
    recommendations.push('Increase test coverage in high-risk areas');
  }

  if (avgProbability > 0.5) {
    recommendations.push('Overall defect risk is elevated - consider delaying release');
    recommendations.push('Run full regression test suite before deployment');
  } else {
    recommendations.push('Focus testing on files with highest defect probability');
  }

  recommendations.push('Review recent changes to frequently-modified files');
  recommendations.push('Consider refactoring complex modules');

  return [...new Set(recommendations)];
}

