/**
 * Validation Result Aggregator
 * ADR-056 Phase 5: Aggregates validation results from parallel runs
 *
 * This module provides:
 * - Aggregation of multiple skill validation results
 * - Cross-model anomaly detection
 * - Regression detection against historical data
 * - Unified markdown and JSON report generation
 * - Trust tier manifest auto-updates
 *
 * @module validation/validation-result-aggregator
 * @see docs/adrs/ADR-056-trust-but-verify.md
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import type {
  SkillValidationLearner,
  SkillValidationOutcome,
  SkillTrustTier,
} from '../learning/skill-validation-learner.js';
import type { SwarmValidationResult as BaseSwarmValidationResult } from './swarm-skill-validator.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Issue severity level
 */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Issue found during validation
 */
export interface ValidationIssue {
  skill: string;
  model: string;
  severity: IssueSeverity;
  type: 'schema_failure' | 'validator_failure' | 'eval_failure' | 'timeout' | 'error';
  message: string;
  testId?: string;
  details?: Record<string, unknown>;
}

/**
 * Model-specific anomaly detected during cross-model analysis
 */
export interface ModelAnomaly {
  model: string;
  type: 'high_variance' | 'low_performance' | 'inconsistent' | 'regression';
  description: string;
  passRate: number;
  avgPassRate: number;
  deviation: number;
}

/**
 * Validation summary for a single skill
 */
export interface SkillValidationSummary {
  skill: string;
  trustTier: SkillTrustTier;
  passRateByModel: Map<string, number>;
  avgPassRate: number;
  schemaValid: boolean;
  validatorPassed: boolean;
  evalPassed: boolean;
  issues: ValidationIssue[];
  executionTimeMs: number;
  testCount: number;
  passedTests: number;
  failedTests: number;
}

/**
 * Cross-model analysis report
 */
export interface CrossModelReport {
  variance: number;
  stdDeviation: number;
  anomalies: ModelAnomaly[];
  consistentSkills: string[];
  inconsistentSkills: string[];
  modelPerformance: Map<string, {
    avgPassRate: number;
    skillCount: number;
    totalTests: number;
  }>;
}

/**
 * Regression detected against historical baseline
 */
export interface RegressionReport {
  skill: string;
  model: string;
  previousPassRate: number;
  currentPassRate: number;
  regressionAmount: number;
  trend: 'improving' | 'stable' | 'declining';
  possibleCauses: string[];
  severity: IssueSeverity;
}

/**
 * Aggregated result from a parallel validation run (input to aggregator)
 * Contains multiple outcomes from a single model run
 */
export interface ParallelValidationRunResult {
  runId: string;
  model: string;
  outcomes: SkillValidationOutcome[];
  timestamp: Date;
  durationMs: number;
  metadata?: {
    environment?: string;
    version?: string;
    [key: string]: unknown;
  };
}

/**
 * Re-export the base swarm validation result for convenience
 */
export type { BaseSwarmValidationResult as SwarmValidationResult };

/**
 * Complete aggregated validation report
 */
export interface AggregatedValidationReport {
  timestamp: Date;
  runId: string;
  summary: {
    totalSkills: number;
    passedSkills: number;
    failedSkills: number;
    avgPassRate: number;
    totalDurationMs: number;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    modelsUsed: string[];
  };
  skillResults: Map<string, SkillValidationSummary>;
  crossModelAnalysis: CrossModelReport;
  regressions: RegressionReport[];
  recommendations: string[];
  metadata: {
    version: string;
    environment?: string;
    generatedBy: string;
    inputs: {
      runIds: string[];
      models: string[];
    };
  };
}

/**
 * Configuration for the aggregator
 */
export interface AggregatorConfig {
  /** Variance threshold for cross-model anomaly detection (0-1) */
  varianceThreshold: number;
  /** Pass rate drop threshold for regression detection (0-1) */
  regressionThreshold: number;
  /** Minimum samples required for statistical analysis */
  minSamples: number;
  /** Whether to auto-update manifest after aggregation */
  autoUpdateManifest: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: AggregatorConfig = {
  varianceThreshold: 0.04, // ~20% standard deviation
  regressionThreshold: 0.1, // 10% drop triggers regression
  minSamples: 3,
  autoUpdateManifest: false,
};

// ============================================================================
// Validation Result Aggregator
// ============================================================================

/**
 * Aggregates validation results from parallel runs, detects anomalies,
 * and generates unified reports.
 *
 * @example
 * ```typescript
 * const aggregator = new ValidationResultAggregator(learner, manifestPath);
 *
 * // Aggregate results from multiple parallel runs
 * const report = await aggregator.aggregateResults([
 *   { runId: 'run-1', model: 'sonnet', outcomes: [...], ... },
 *   { runId: 'run-2', model: 'opus', outcomes: [...], ... },
 * ]);
 *
 * // Generate markdown report
 * const markdown = aggregator.generateMarkdownReport(report);
 *
 * // Update manifest with new pass rates
 * await aggregator.updateManifest(report);
 * ```
 */
export class ValidationResultAggregator {
  private config: AggregatorConfig;

  constructor(
    private readonly learner: SkillValidationLearner,
    private readonly manifestPath: string,
    config: Partial<AggregatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Aggregate results from parallel validation runs
   */
  async aggregateResults(
    results: ParallelValidationRunResult[]
  ): Promise<AggregatedValidationReport> {
    const runId = `agg-${Date.now()}`;
    const timestamp = new Date();

    // Build skill results map
    const skillResults = this.buildSkillResultsMap(results);

    // Calculate summary
    const summary = this.calculateSummary(skillResults, results);

    // Perform cross-model analysis
    const crossModelAnalysis = await this.detectCrossModelAnomalies(results);

    // Detect regressions
    const regressions = await this.detectRegressions(results, this.config.regressionThreshold);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      skillResults,
      crossModelAnalysis,
      regressions
    );

    const report: AggregatedValidationReport = {
      timestamp,
      runId,
      summary,
      skillResults,
      crossModelAnalysis,
      regressions,
      recommendations,
      metadata: {
        version: '1.0.0',
        environment: results[0]?.metadata?.environment as string | undefined,
        generatedBy: 'ValidationResultAggregator',
        inputs: {
          runIds: results.map(r => r.runId),
          models: [...new Set(results.map(r => r.model))],
        },
      },
    };

    // Auto-update manifest if configured
    if (this.config.autoUpdateManifest) {
      await this.updateManifest(report);
    }

    return report;
  }

  /**
   * Build skill results map from multiple validation runs
   */
  private buildSkillResultsMap(
    results: ParallelValidationRunResult[]
  ): Map<string, SkillValidationSummary> {
    const skillMap = new Map<string, SkillValidationSummary>();

    for (const result of results) {
      for (const outcome of result.outcomes) {
        const skillName = outcome.skillName;

        if (!skillMap.has(skillName)) {
          skillMap.set(skillName, {
            skill: skillName,
            trustTier: outcome.trustTier,
            passRateByModel: new Map(),
            avgPassRate: 0,
            schemaValid: true,
            validatorPassed: true,
            evalPassed: true,
            issues: [],
            executionTimeMs: 0,
            testCount: 0,
            passedTests: 0,
            failedTests: 0,
          });
        }

        const summary = skillMap.get(skillName)!;

        // Update model-specific pass rate
        const passRate = outcome.testCaseResults.filter(t => t.passed).length /
          (outcome.testCaseResults.length || 1);
        summary.passRateByModel.set(result.model, passRate);

        // Update test counts
        summary.testCount += outcome.testCaseResults.length;
        summary.passedTests += outcome.testCaseResults.filter(t => t.passed).length;
        summary.failedTests += outcome.testCaseResults.filter(t => !t.passed).length;

        // Update execution time
        summary.executionTimeMs += outcome.metadata?.duration as number || 0;

        // Track validation level results
        if (outcome.validationLevel === 'schema' && !outcome.passed) {
          summary.schemaValid = false;
        }
        if (outcome.validationLevel === 'validator' && !outcome.passed) {
          summary.validatorPassed = false;
        }
        if (outcome.validationLevel === 'eval' && !outcome.passed) {
          summary.evalPassed = false;
        }

        // Collect issues from failed tests
        for (const testCase of outcome.testCaseResults) {
          if (!testCase.passed && testCase.error) {
            summary.issues.push({
              skill: skillName,
              model: result.model,
              severity: testCase.priority === 'critical' ? 'critical' :
                testCase.priority === 'high' ? 'high' :
                  testCase.priority === 'medium' ? 'medium' : 'low',
              type: this.categorizeIssueType(outcome.validationLevel, testCase.error),
              message: testCase.error,
              testId: testCase.testId,
            });
          }
        }
      }
    }

    // Calculate average pass rates
    for (const summary of skillMap.values()) {
      const passRates = Array.from(summary.passRateByModel.values());
      summary.avgPassRate = passRates.length > 0
        ? passRates.reduce((a, b) => a + b, 0) / passRates.length
        : 0;
    }

    return skillMap;
  }

  /**
   * Categorize issue type based on validation level and error message
   */
  private categorizeIssueType(
    level: string,
    error: string
  ): ValidationIssue['type'] {
    if (error.toLowerCase().includes('timeout')) return 'timeout';
    if (level === 'schema') return 'schema_failure';
    if (level === 'validator') return 'validator_failure';
    if (level === 'eval') return 'eval_failure';
    return 'error';
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(
    skillResults: Map<string, SkillValidationSummary>,
    results: ParallelValidationRunResult[]
  ): AggregatedValidationReport['summary'] {
    const skills = Array.from(skillResults.values());
    const passedSkills = skills.filter(s => s.avgPassRate >= 0.9).length;
    const avgPassRate = skills.length > 0
      ? skills.reduce((sum, s) => sum + s.avgPassRate, 0) / skills.length
      : 0;

    return {
      totalSkills: skills.length,
      passedSkills,
      failedSkills: skills.length - passedSkills,
      avgPassRate,
      totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
      totalTests: skills.reduce((sum, s) => sum + s.testCount, 0),
      passedTests: skills.reduce((sum, s) => sum + s.passedTests, 0),
      failedTests: skills.reduce((sum, s) => sum + s.failedTests, 0),
      modelsUsed: [...new Set(results.map(r => r.model))],
    };
  }

  /**
   * Detect cross-model anomalies
   */
  async detectCrossModelAnomalies(
    results: ParallelValidationRunResult[]
  ): Promise<CrossModelReport> {
    const modelPassRates = new Map<string, number[]>();
    const modelStats = new Map<string, { totalTests: number; passedTests: number; skillCount: number }>();
    const skillConsistency = new Map<string, { passRates: number[]; models: string[] }>();

    // Collect pass rates by model and skill
    for (const result of results) {
      if (!modelPassRates.has(result.model)) {
        modelPassRates.set(result.model, []);
        modelStats.set(result.model, { totalTests: 0, passedTests: 0, skillCount: 0 });
      }

      for (const outcome of result.outcomes) {
        const passRate = outcome.testCaseResults.filter(t => t.passed).length /
          (outcome.testCaseResults.length || 1);

        modelPassRates.get(result.model)!.push(passRate);
        const stats = modelStats.get(result.model)!;
        stats.totalTests += outcome.testCaseResults.length;
        stats.passedTests += outcome.testCaseResults.filter(t => t.passed).length;
        stats.skillCount++;

        // Track skill consistency across models
        if (!skillConsistency.has(outcome.skillName)) {
          skillConsistency.set(outcome.skillName, { passRates: [], models: [] });
        }
        skillConsistency.get(outcome.skillName)!.passRates.push(passRate);
        skillConsistency.get(outcome.skillName)!.models.push(result.model);
      }
    }

    // Calculate overall variance
    const allPassRates: number[] = [];
    for (const rates of modelPassRates.values()) {
      allPassRates.push(...rates);
    }

    const avgPassRate = allPassRates.length > 0
      ? allPassRates.reduce((a, b) => a + b, 0) / allPassRates.length
      : 0;

    const variance = allPassRates.length > 1
      ? allPassRates.reduce((sum, r) => sum + Math.pow(r - avgPassRate, 2), 0) / allPassRates.length
      : 0;

    const stdDeviation = Math.sqrt(variance);

    // Detect model anomalies
    const anomalies: ModelAnomaly[] = [];
    const modelPerformance = new Map<string, { avgPassRate: number; skillCount: number; totalTests: number }>();

    for (const [model, rates] of modelPassRates.entries()) {
      const modelAvg = rates.reduce((a, b) => a + b, 0) / rates.length;
      const deviation = modelAvg - avgPassRate;
      const stats = modelStats.get(model)!;

      modelPerformance.set(model, {
        avgPassRate: modelAvg,
        skillCount: stats.skillCount,
        totalTests: stats.totalTests,
      });

      // Check for significant deviation
      if (Math.abs(deviation) > this.config.varianceThreshold * 2) {
        anomalies.push({
          model,
          type: deviation < 0 ? 'low_performance' : 'high_variance',
          description: `Model ${model} has ${(deviation * 100).toFixed(1)}% difference from average`,
          passRate: modelAvg,
          avgPassRate,
          deviation: Math.abs(deviation),
        });
      }
    }

    // Identify consistent vs inconsistent skills
    const consistentSkills: string[] = [];
    const inconsistentSkills: string[] = [];

    for (const [skill, data] of skillConsistency.entries()) {
      if (data.passRates.length < 2) continue;

      const skillAvg = data.passRates.reduce((a, b) => a + b, 0) / data.passRates.length;
      const skillVariance = data.passRates.reduce((sum, r) => sum + Math.pow(r - skillAvg, 2), 0) / data.passRates.length;

      if (skillVariance < this.config.varianceThreshold) {
        consistentSkills.push(skill);
      } else {
        inconsistentSkills.push(skill);
      }
    }

    return {
      variance,
      stdDeviation,
      anomalies,
      consistentSkills,
      inconsistentSkills,
      modelPerformance,
    };
  }

  /**
   * Detect regressions against historical data
   */
  async detectRegressions(
    results: ParallelValidationRunResult[],
    threshold: number
  ): Promise<RegressionReport[]> {
    const regressions: RegressionReport[] = [];
    const processedSkills = new Set<string>();

    for (const result of results) {
      for (const outcome of result.outcomes) {
        const key = `${outcome.skillName}-${result.model}`;
        if (processedSkills.has(key)) continue;
        processedSkills.add(key);

        // Get historical trends from learner
        const trends = await this.learner.getValidationTrends(outcome.skillName);
        if (!trends) continue;

        const currentPassRate = outcome.testCaseResults.filter(t => t.passed).length /
          (outcome.testCaseResults.length || 1);

        const previousPassRate = trends.recentPassRate;
        const regressionAmount = previousPassRate - currentPassRate;

        if (regressionAmount >= threshold) {
          regressions.push({
            skill: outcome.skillName,
            model: result.model,
            previousPassRate,
            currentPassRate,
            regressionAmount,
            trend: trends.overall,
            possibleCauses: this.analyzePossibleCauses(outcome, regressionAmount),
            severity: this.categorizeRegressionSeverity(regressionAmount),
          });
        }
      }
    }

    // Sort by severity and regression amount
    return regressions.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.regressionAmount - a.regressionAmount;
    });
  }

  /**
   * Analyze possible causes for regression
   */
  private analyzePossibleCauses(
    outcome: SkillValidationOutcome,
    regressionAmount: number
  ): string[] {
    const causes: string[] = [];

    // Check for new failing tests
    const failedTests = outcome.testCaseResults.filter(t => !t.passed);
    if (failedTests.length > 0) {
      const categories = [...new Set(failedTests.map(t => t.category).filter(Boolean))];
      if (categories.length > 0) {
        causes.push(`Failures in categories: ${categories.join(', ')}`);
      }
    }

    // Check for critical test failures
    const criticalFailures = failedTests.filter(t => t.priority === 'critical');
    if (criticalFailures.length > 0) {
      causes.push(`${criticalFailures.length} critical test(s) failing`);
    }

    // Check for low reasoning quality
    const avgReasoning = outcome.testCaseResults.reduce((sum, t) => sum + t.reasoningQuality, 0) /
      (outcome.testCaseResults.length || 1);
    if (avgReasoning < 0.7) {
      causes.push(`Low reasoning quality score: ${(avgReasoning * 100).toFixed(1)}%`);
    }

    // Suggest model-related issues for large regressions
    if (regressionAmount > 0.3) {
      causes.push('Possible model behavior change or prompt drift');
    }

    if (causes.length === 0) {
      causes.push('No specific cause identified - review test details');
    }

    return causes;
  }

  /**
   * Categorize regression severity
   */
  private categorizeRegressionSeverity(regressionAmount: number): IssueSeverity {
    if (regressionAmount >= 0.5) return 'critical';
    if (regressionAmount >= 0.3) return 'high';
    if (regressionAmount >= 0.15) return 'medium';
    return 'low';
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    skillResults: Map<string, SkillValidationSummary>,
    crossModel: CrossModelReport,
    regressions: RegressionReport[]
  ): string[] {
    const recommendations: string[] = [];

    // Recommendations based on cross-model analysis
    if (crossModel.inconsistentSkills.length > 0) {
      recommendations.push(
        `Review ${crossModel.inconsistentSkills.length} skills with inconsistent cross-model behavior: ` +
        crossModel.inconsistentSkills.slice(0, 3).join(', ') +
        (crossModel.inconsistentSkills.length > 3 ? ` and ${crossModel.inconsistentSkills.length - 3} more` : '')
      );
    }

    if (crossModel.anomalies.some(a => a.type === 'low_performance')) {
      const lowPerfModels = crossModel.anomalies
        .filter(a => a.type === 'low_performance')
        .map(a => a.model);
      recommendations.push(
        `Investigate low performance on model(s): ${lowPerfModels.join(', ')}`
      );
    }

    // Recommendations based on regressions
    const criticalRegressions = regressions.filter(r => r.severity === 'critical');
    if (criticalRegressions.length > 0) {
      recommendations.push(
        `URGENT: ${criticalRegressions.length} critical regression(s) detected - immediate review required`
      );
    }

    // Recommendations based on skill results
    const failingSkills = Array.from(skillResults.values()).filter(s => s.avgPassRate < 0.9);
    if (failingSkills.length > 0) {
      const schemaFailures = failingSkills.filter(s => !s.schemaValid);
      const validatorFailures = failingSkills.filter(s => !s.validatorPassed);

      if (schemaFailures.length > 0) {
        recommendations.push(
          `Fix schema validation for: ${schemaFailures.map(s => s.skill).slice(0, 3).join(', ')}`
        );
      }

      if (validatorFailures.length > 0) {
        recommendations.push(
          `Review validator scripts for: ${validatorFailures.map(s => s.skill).slice(0, 3).join(', ')}`
        );
      }
    }

    // General improvement recommendations
    const avgPassRate = Array.from(skillResults.values())
      .reduce((sum, s) => sum + s.avgPassRate, 0) / skillResults.size;

    if (avgPassRate < 0.8) {
      recommendations.push(
        'Overall pass rate below 80% - consider reviewing skill definitions and test expectations'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('All validations passing - no immediate action required');
    }

    return recommendations;
  }

  /**
   * Update trust tier manifest with new pass rates
   */
  async updateManifest(report: AggregatedValidationReport): Promise<void> {
    if (!existsSync(this.manifestPath)) {
      throw new Error(`Manifest file not found: ${this.manifestPath}`);
    }

    const manifest = JSON.parse(readFileSync(this.manifestPath, 'utf-8'));

    // Update skill pass rates and validation status
    for (const [skillName, summary] of report.skillResults.entries()) {
      if (manifest.skills && manifest.skills[skillName]) {
        const skill = manifest.skills[skillName];

        // Update validation status
        if (!skill.validation) {
          skill.validation = {};
        }

        skill.validation.passRate = summary.avgPassRate;
        skill.validation.lastValidated = report.timestamp.toISOString();
        skill.validation.status = summary.avgPassRate >= 0.9 ? 'passing' : 'failing';

        // Update model-specific pass rates
        skill.validation.passRateByModel = Object.fromEntries(summary.passRateByModel);
      }
    }

    // Update validation status summary
    const skills = Array.from(report.skillResults.values());
    manifest.validationStatus = {
      passing: skills.filter(s => s.avgPassRate >= 0.9).length,
      failing: skills.filter(s => s.avgPassRate < 0.9).length,
      unknown: 0,
      skipped: manifest.summary?.tier0 || 0,
    };

    // Update generation metadata
    manifest.generatedAt = new Date().toISOString();
    manifest.lastValidationRun = {
      runId: report.runId,
      timestamp: report.timestamp.toISOString(),
      avgPassRate: report.summary.avgPassRate,
      modelsUsed: report.summary.modelsUsed,
    };

    writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(report: AggregatedValidationReport): string {
    const { summary, crossModelAnalysis, regressions, recommendations, skillResults } = report;

    const statusEmoji = summary.avgPassRate >= 0.9 ? '`' :
      summary.avgPassRate >= 0.7 ? '`' : '`';

    const sections: string[] = [];

    // Header
    sections.push(`# Validation Report

> ${statusEmoji} Generated: ${report.timestamp.toISOString()}
> Run ID: ${report.runId}

---

## Summary

| Metric | Value |
|--------|-------|
| Total Skills | ${summary.totalSkills} |
| Passed Skills | ${summary.passedSkills} (${(summary.passedSkills / summary.totalSkills * 100).toFixed(1)}%) |
| Failed Skills | ${summary.failedSkills} |
| Average Pass Rate | ${(summary.avgPassRate * 100).toFixed(1)}% |
| Total Tests | ${summary.totalTests} |
| Passed Tests | ${summary.passedTests} |
| Failed Tests | ${summary.failedTests} |
| Total Duration | ${(summary.totalDurationMs / 1000).toFixed(1)}s |
| Models Used | ${summary.modelsUsed.join(', ')} |`);

    // Recommendations
    sections.push(`
---

## Recommendations

${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);

    // Cross-Model Analysis
    sections.push(`
---

## Cross-Model Analysis

**Variance:** ${(crossModelAnalysis.variance * 100).toFixed(2)}%
**Std Deviation:** ${(crossModelAnalysis.stdDeviation * 100).toFixed(2)}%

### Model Performance

| Model | Avg Pass Rate | Skills Tested | Total Tests |
|-------|---------------|---------------|-------------|
${Array.from(crossModelAnalysis.modelPerformance.entries())
    .map(([model, perf]) =>
      `| ${model} | ${(perf.avgPassRate * 100).toFixed(1)}% | ${perf.skillCount} | ${perf.totalTests} |`
    ).join('\n')}`);

    if (crossModelAnalysis.anomalies.length > 0) {
      sections.push(`
### Anomalies Detected

| Model | Type | Description | Deviation |
|-------|------|-------------|-----------|
${crossModelAnalysis.anomalies.map(a =>
    `| ${a.model} | ${a.type} | ${a.description} | ${(a.deviation * 100).toFixed(1)}% |`
  ).join('\n')}`);
    }

    if (crossModelAnalysis.inconsistentSkills.length > 0) {
      sections.push(`
### Inconsistent Skills

These skills show high variance across models:

${crossModelAnalysis.inconsistentSkills.map(s => `- ${s}`).join('\n')}`);
    }

    // Regressions
    if (regressions.length > 0) {
      sections.push(`
---

## Regressions Detected

| Skill | Model | Previous | Current | Drop | Severity |
|-------|-------|----------|---------|------|----------|
${regressions.map(r =>
    `| ${r.skill} | ${r.model} | ${(r.previousPassRate * 100).toFixed(1)}% | ${(r.currentPassRate * 100).toFixed(1)}% | ${(r.regressionAmount * 100).toFixed(1)}% | ${r.severity} |`
  ).join('\n')}`);

      // Detailed regression causes
      for (const reg of regressions.filter(r => r.severity === 'critical' || r.severity === 'high')) {
        sections.push(`
### ${reg.skill} (${reg.model})

**Possible Causes:**
${reg.possibleCauses.map(c => `- ${c}`).join('\n')}`);
      }
    }

    // Skill Results
    sections.push(`
---

## Skill Results

### Passing Skills (${summary.passedSkills})

| Skill | Trust Tier | Pass Rate | Tests | Issues |
|-------|------------|-----------|-------|--------|
${Array.from(skillResults.values())
    .filter(s => s.avgPassRate >= 0.9)
    .sort((a, b) => b.avgPassRate - a.avgPassRate)
    .map(s =>
      `| ${s.skill} | T${s.trustTier} | ${(s.avgPassRate * 100).toFixed(1)}% | ${s.passedTests}/${s.testCount} | ${s.issues.length} |`
    ).join('\n')}`);

    if (summary.failedSkills > 0) {
      sections.push(`
### Failing Skills (${summary.failedSkills})

| Skill | Trust Tier | Pass Rate | Tests | Critical Issues |
|-------|------------|-----------|-------|-----------------|
${Array.from(skillResults.values())
    .filter(s => s.avgPassRate < 0.9)
    .sort((a, b) => a.avgPassRate - b.avgPassRate)
    .map(s => {
      const criticalCount = s.issues.filter(i => i.severity === 'critical').length;
      return `| ${s.skill} | T${s.trustTier} | ${(s.avgPassRate * 100).toFixed(1)}% | ${s.passedTests}/${s.testCount} | ${criticalCount} |`;
    }).join('\n')}`);

      // Detailed issues for failing skills
      const failingSkills = Array.from(skillResults.values()).filter(s => s.avgPassRate < 0.9);
      for (const skill of failingSkills.slice(0, 5)) { // Top 5 failing skills
        if (skill.issues.length > 0) {
          sections.push(`
#### ${skill.skill} Issues

${skill.issues.slice(0, 5).map(i =>
    `- **[${i.severity}]** ${i.type}: ${i.message}${i.testId ? ` (${i.testId})` : ''}`
  ).join('\n')}${skill.issues.length > 5 ? `\n- ... and ${skill.issues.length - 5} more issues` : ''}`);
        }
      }
    }

    // Footer
    sections.push(`
---

*Generated by ValidationResultAggregator v${report.metadata.version}*
*Policy: ADR-056 Trust But Verify*`);

    return sections.join('\n');
  }

  /**
   * Generate JSON report for CI integration
   */
  generateJsonReport(report: AggregatedValidationReport): string {
    // Convert Maps to plain objects for JSON serialization
    const serializable = {
      ...report,
      skillResults: Object.fromEntries(
        Array.from(report.skillResults.entries()).map(([key, value]) => [
          key,
          {
            ...value,
            passRateByModel: Object.fromEntries(value.passRateByModel),
          },
        ])
      ),
      crossModelAnalysis: {
        ...report.crossModelAnalysis,
        modelPerformance: Object.fromEntries(report.crossModelAnalysis.modelPerformance),
      },
    };

    return JSON.stringify(serializable, null, 2);
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a ValidationResultAggregator instance
 */
export function createValidationResultAggregator(
  learner: SkillValidationLearner,
  manifestPath: string,
  config?: Partial<AggregatorConfig>
): ValidationResultAggregator {
  return new ValidationResultAggregator(learner, manifestPath, config);
}
