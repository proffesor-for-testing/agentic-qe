/**
 * Agentic QE v3 - Quality Assessment MCP Tool
 *
 * qe/quality/evaluate - Evaluate quality gates and deployment decisions
 *
 * This tool wraps the quality-assessment domain service.
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema } from '../base';
import { ToolResult } from '../../types';

// ============================================================================
// Types
// ============================================================================

export interface QualityEvaluateParams {
  metrics?: QualityMetrics;
  gateName?: string;
  thresholds?: GateThresholds;
  includeAdvice?: boolean;
  riskTolerance?: 'low' | 'medium' | 'high';
  [key: string]: unknown;
}

export interface QualityMetrics {
  coverage?: number;
  testsPassing?: number;
  criticalBugs?: number;
  codeSmells?: number;
  securityVulnerabilities?: number;
  technicalDebt?: number;
  duplications?: number;
  complexity?: number;
}

export interface GateThresholds {
  coverage?: { min: number };
  testsPassing?: { min: number };
  criticalBugs?: { max: number };
  codeSmells?: { max: number };
  securityVulnerabilities?: { max: number };
  technicalDebt?: { max: number };
}

export interface QualityEvaluateResult {
  passed: boolean;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  checks: QualityCheck[];
  deploymentAdvice?: DeploymentAdvice;
  recommendations: Recommendation[];
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  value: number;
  threshold?: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
}

export interface DeploymentAdvice {
  decision: 'approved' | 'warning' | 'blocked';
  confidence: number;
  riskScore: number;
  reasons: string[];
  conditions?: string[];
  rollbackPlan?: string;
}

export interface Recommendation {
  type: 'improvement' | 'warning' | 'critical';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class QualityEvaluateTool extends MCPToolBase<QualityEvaluateParams, QualityEvaluateResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/quality/evaluate',
    description: 'Evaluate quality gates and provide deployment recommendations. Analyzes coverage, bugs, complexity, and security.',
    domain: 'quality-assessment',
    schema: QUALITY_EVALUATE_SCHEMA,
    streaming: true,
    timeout: 120000,
  };

  async execute(
    params: QualityEvaluateParams,
    context: MCPToolContext
  ): Promise<ToolResult<QualityEvaluateResult>> {
    const {
      metrics = getDefaultMetrics(),
      gateName = 'default',
      thresholds = getDefaultThresholds(),
      includeAdvice = true,
      riskTolerance = 'medium',
    } = params;

    try {
      this.emitStream(context, {
        status: 'evaluating',
        message: `Evaluating quality gate: ${gateName}`,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      // Evaluate each quality check
      const checks: QualityCheck[] = [];

      // Coverage check
      if (thresholds.coverage && metrics.coverage !== undefined) {
        checks.push({
          name: 'Coverage',
          passed: metrics.coverage >= thresholds.coverage.min,
          value: metrics.coverage,
          threshold: thresholds.coverage.min,
          severity: 'high',
          message: metrics.coverage >= thresholds.coverage.min
            ? `Coverage ${metrics.coverage}% meets threshold`
            : `Coverage ${metrics.coverage}% below ${thresholds.coverage.min}% threshold`,
        });
      }

      // Tests passing check
      if (thresholds.testsPassing && metrics.testsPassing !== undefined) {
        checks.push({
          name: 'Tests Passing',
          passed: metrics.testsPassing >= thresholds.testsPassing.min,
          value: metrics.testsPassing,
          threshold: thresholds.testsPassing.min,
          severity: 'critical',
          message: metrics.testsPassing >= thresholds.testsPassing.min
            ? `${metrics.testsPassing}% tests passing`
            : `Only ${metrics.testsPassing}% tests passing`,
        });
      }

      // Critical bugs check
      if (thresholds.criticalBugs && metrics.criticalBugs !== undefined) {
        checks.push({
          name: 'Critical Bugs',
          passed: metrics.criticalBugs <= thresholds.criticalBugs.max,
          value: metrics.criticalBugs,
          threshold: thresholds.criticalBugs.max,
          severity: 'critical',
          message: metrics.criticalBugs <= thresholds.criticalBugs.max
            ? `${metrics.criticalBugs} critical bugs within threshold`
            : `${metrics.criticalBugs} critical bugs exceed threshold of ${thresholds.criticalBugs.max}`,
        });
      }

      // Security vulnerabilities check
      if (thresholds.securityVulnerabilities && metrics.securityVulnerabilities !== undefined) {
        checks.push({
          name: 'Security Vulnerabilities',
          passed: metrics.securityVulnerabilities <= thresholds.securityVulnerabilities.max,
          value: metrics.securityVulnerabilities,
          threshold: thresholds.securityVulnerabilities.max,
          severity: 'critical',
          message: metrics.securityVulnerabilities <= thresholds.securityVulnerabilities.max
            ? `${metrics.securityVulnerabilities} vulnerabilities within threshold`
            : `${metrics.securityVulnerabilities} vulnerabilities found`,
        });
      }

      // Code smells check
      if (thresholds.codeSmells && metrics.codeSmells !== undefined) {
        checks.push({
          name: 'Code Smells',
          passed: metrics.codeSmells <= thresholds.codeSmells.max,
          value: metrics.codeSmells,
          threshold: thresholds.codeSmells.max,
          severity: 'medium',
          message: metrics.codeSmells <= thresholds.codeSmells.max
            ? `${metrics.codeSmells} code smells within threshold`
            : `${metrics.codeSmells} code smells detected`,
        });
      }

      // Calculate overall score and grade
      const passedChecks = checks.filter(c => c.passed).length;
      const totalChecks = checks.length;
      const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;
      const grade = calculateGrade(score, checks);
      const passed = checks.every(c => c.passed || c.severity !== 'critical');

      // Generate deployment advice
      const deploymentAdvice: DeploymentAdvice | undefined = includeAdvice
        ? generateDeploymentAdvice(passed, score, checks, riskTolerance)
        : undefined;

      // Generate recommendations
      const recommendations = generateRecommendations(checks, metrics);

      this.emitStream(context, {
        status: 'complete',
        message: `Quality evaluation complete: ${grade} (${score}%)`,
        progress: 100,
      });

      return {
        success: true,
        data: {
          passed,
          score,
          grade,
          checks,
          deploymentAdvice,
          recommendations,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Quality evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// ============================================================================
// Schema
// ============================================================================

const QUALITY_EVALUATE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    metrics: {
      type: 'object',
      description: 'Quality metrics to evaluate',
      properties: {
        coverage: { type: 'number', description: 'Code coverage percentage' },
        testsPassing: { type: 'number', description: 'Percentage of passing tests' },
        criticalBugs: { type: 'number', description: 'Number of critical bugs' },
        codeSmells: { type: 'number', description: 'Number of code smells' },
        securityVulnerabilities: { type: 'number', description: 'Number of security vulnerabilities' },
        technicalDebt: { type: 'number', description: 'Technical debt in hours' },
        duplications: { type: 'number', description: 'Code duplication percentage' },
        complexity: { type: 'number', description: 'Cyclomatic complexity' },
      },
    },
    gateName: {
      type: 'string',
      description: 'Name of the quality gate',
      default: 'default',
    },
    thresholds: {
      type: 'object',
      description: 'Quality gate thresholds',
    },
    includeAdvice: {
      type: 'boolean',
      description: 'Include deployment advice',
      default: true,
    },
    riskTolerance: {
      type: 'string',
      description: 'Risk tolerance level',
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function getDefaultMetrics(): QualityMetrics {
  return {
    coverage: 80,
    testsPassing: 95,
    criticalBugs: 0,
    codeSmells: 15,
    securityVulnerabilities: 0,
    technicalDebt: 4,
    duplications: 3,
    complexity: 8,
  };
}

function getDefaultThresholds(): GateThresholds {
  return {
    coverage: { min: 80 },
    testsPassing: { min: 95 },
    criticalBugs: { max: 0 },
    securityVulnerabilities: { max: 0 },
    codeSmells: { max: 50 },
    technicalDebt: { max: 8 },
  };
}

function calculateGrade(score: number, checks: QualityCheck[]): 'A' | 'B' | 'C' | 'D' | 'F' {
  const hasCriticalFailure = checks.some(c => !c.passed && c.severity === 'critical');

  if (hasCriticalFailure) return 'F';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function generateDeploymentAdvice(
  passed: boolean,
  score: number,
  checks: QualityCheck[],
  riskTolerance: 'low' | 'medium' | 'high'
): DeploymentAdvice {
  const criticalFailures = checks.filter(c => !c.passed && c.severity === 'critical');
  const highFailures = checks.filter(c => !c.passed && c.severity === 'high');

  const riskScore = (criticalFailures.length * 0.4 + highFailures.length * 0.2) + (100 - score) / 100;
  const adjustedRisk = Math.min(riskScore, 1);

  let decision: 'approved' | 'warning' | 'blocked';
  const riskThresholds = {
    low: { block: 0.2, warn: 0.1 },
    medium: { block: 0.4, warn: 0.2 },
    high: { block: 0.6, warn: 0.4 },
  };

  const threshold = riskThresholds[riskTolerance];
  if (adjustedRisk >= threshold.block || criticalFailures.length > 0) {
    decision = 'blocked';
  } else if (adjustedRisk >= threshold.warn) {
    decision = 'warning';
  } else {
    decision = 'approved';
  }

  return {
    decision,
    confidence: Math.round((1 - adjustedRisk) * 100) / 100,
    riskScore: Math.round(adjustedRisk * 100) / 100,
    reasons: [
      ...criticalFailures.map(c => `Critical: ${c.name} - ${c.message}`),
      ...highFailures.map(c => `High: ${c.name} - ${c.message}`),
    ],
    conditions: decision === 'warning'
      ? ['Monitor closely after deployment', 'Prepare rollback plan']
      : undefined,
    rollbackPlan: decision !== 'approved'
      ? 'Revert to previous version if issues detected'
      : undefined,
  };
}

function generateRecommendations(checks: QualityCheck[], metrics: QualityMetrics): Recommendation[] {
  const recommendations: Recommendation[] = [];

  const failedChecks = checks.filter(c => !c.passed);

  for (const check of failedChecks) {
    recommendations.push({
      type: check.severity === 'critical' ? 'critical' : check.severity === 'high' ? 'warning' : 'improvement',
      title: `Fix ${check.name}`,
      description: check.message,
      impact: check.severity === 'critical' || check.severity === 'high' ? 'high' : 'medium',
      effort: 'medium',
    });
  }

  // Add proactive recommendations
  if ((metrics.coverage || 0) < 90) {
    recommendations.push({
      type: 'improvement',
      title: 'Increase test coverage',
      description: `Current coverage is ${metrics.coverage}%. Consider adding tests for critical paths.`,
      impact: 'medium',
      effort: 'medium',
    });
  }

  return recommendations;
}
