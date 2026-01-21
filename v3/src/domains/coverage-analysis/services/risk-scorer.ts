/**
 * Agentic QE v3 - Risk Scoring Service
 * Implements IRiskScoringService with multi-factor risk analysis
 */

import { Result, ok, err, Severity } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  RiskCalculationRequest,
  RiskReport,
  RiskFactor,
} from '../interfaces';

// ============================================================================
// Service Interface
// ============================================================================

export interface IRiskScoringService {
  /** Calculate risk score for uncovered code */
  calculateRisk(request: RiskCalculationRequest): Promise<Result<RiskReport, Error>>;

  /** Factor in historical data (defects, changes, complexity) */
  factorInHistory(file: string, baseRisk: number): Promise<number>;

  /** Get risk trends over time */
  getRiskTrend(file: string): Promise<Result<RiskTrend, Error>>;
}

export interface RiskTrend {
  file: string;
  dataPoints: RiskTrendPoint[];
  trend: 'increasing' | 'decreasing' | 'stable';
  forecast: number;
}

export interface RiskTrendPoint {
  date: Date;
  riskScore: number;
  factors: string[];
}

// ============================================================================
// Default Risk Factors
// ============================================================================

const DEFAULT_RISK_FACTORS: RiskFactor[] = [
  { name: 'uncovered-lines', weight: 0.25 },
  { name: 'complexity', weight: 0.20 },
  { name: 'defect-history', weight: 0.20 },
  { name: 'change-frequency', weight: 0.15 },
  { name: 'code-age', weight: 0.10 },
  { name: 'dependency-count', weight: 0.10 },
];

// ============================================================================
// Service Implementation
// ============================================================================

export class RiskScorerService implements IRiskScoringService {
  private static readonly HISTORY_KEY_PREFIX = 'risk-history';
  private static readonly MAX_TREND_POINTS = 30;

  constructor(private readonly memory: MemoryBackend) {}

  /**
   * Calculate comprehensive risk score for uncovered code
   */
  async calculateRisk(request: RiskCalculationRequest): Promise<Result<RiskReport, Error>> {
    try {
      const { file, uncoveredLines, factors = DEFAULT_RISK_FACTORS } = request;

      // Normalize factor weights
      const normalizedFactors = this.normalizeFactorWeights(factors);

      // Calculate individual factor scores
      const factorScores = await this.calculateFactorScores(
        file,
        uncoveredLines,
        normalizedFactors
      );

      // Calculate overall risk score
      const overallRisk = factorScores.reduce(
        (sum, f) => sum + f.score * f.contribution,
        0
      );

      // Determine risk level
      const riskLevel = this.riskScoreToSeverity(overallRisk);

      // Generate recommendations based on risk profile
      const recommendations = this.generateRiskRecommendations(
        file,
        overallRisk,
        riskLevel,
        factorScores
      );

      // Store risk snapshot for trend analysis
      await this.storeRiskSnapshot(file, overallRisk, factorScores);

      return ok({
        file,
        overallRisk,
        riskLevel,
        factors: factorScores,
        recommendations,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Factor in historical data to adjust base risk score
   */
  async factorInHistory(file: string, baseRisk: number): Promise<number> {
    try {
      // Get defect history
      const defectHistory = await this.getDefectHistory(file);
      const defectFactor = Math.min(1, defectHistory.count / 10) * 0.3;

      // Get change frequency
      const changeFrequency = await this.getChangeFrequency(file);
      const changeFactor = Math.min(1, changeFrequency / 20) * 0.2;

      // Get historical risk trend
      const trendResult = await this.getRiskTrend(file);
      let trendFactor = 0;
      if (trendResult.success) {
        const trend = trendResult.value;
        if (trend.trend === 'increasing') {
          trendFactor = 0.15;
        } else if (trend.trend === 'decreasing') {
          trendFactor = -0.1;
        }
      }

      // Combine factors with base risk
      const adjustedRisk = baseRisk + defectFactor + changeFactor + trendFactor;

      return Math.min(1, Math.max(0, adjustedRisk));
    } catch {
      return baseRisk;
    }
  }

  /**
   * Get risk trends over time for a file
   */
  async getRiskTrend(file: string): Promise<Result<RiskTrend, Error>> {
    try {
      const historyKey = `${RiskScorerService.HISTORY_KEY_PREFIX}:${file}`;
      const history = await this.memory.get<RiskHistoryEntry[]>(historyKey);

      if (!history || history.length === 0) {
        return ok({
          file,
          dataPoints: [],
          trend: 'stable',
          forecast: 0.5,
        });
      }

      // Convert history to trend points
      const dataPoints: RiskTrendPoint[] = history
        .slice(-RiskScorerService.MAX_TREND_POINTS)
        .map((entry) => ({
          date: new Date(entry.timestamp),
          riskScore: entry.riskScore,
          factors: entry.topFactors,
        }));

      // Analyze trend
      const trend = this.analyzeTrend(dataPoints);

      // Forecast next risk value
      const forecast = this.forecastRisk(dataPoints);

      return ok({
        file,
        dataPoints,
        trend,
        forecast,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private normalizeFactorWeights(factors: RiskFactor[]): RiskFactor[] {
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    if (totalWeight === 0) return factors;

    return factors.map((f) => ({
      ...f,
      weight: f.weight / totalWeight,
    }));
  }

  private async calculateFactorScores(
    file: string,
    uncoveredLines: number[],
    factors: RiskFactor[]
  ): Promise<FactorScore[]> {
    const scores: FactorScore[] = [];

    for (const factor of factors) {
      const score = await this.calculateSingleFactorScore(factor.name, file, uncoveredLines);
      scores.push({
        name: factor.name,
        score,
        contribution: factor.weight,
      });
    }

    return scores;
  }

  private async calculateSingleFactorScore(
    factorName: string,
    file: string,
    uncoveredLines: number[]
  ): Promise<number> {
    switch (factorName) {
      case 'uncovered-lines':
        return this.calculateUncoveredLinesScore(uncoveredLines);

      case 'complexity':
        return await this.calculateComplexityScore(file);

      case 'defect-history':
        return await this.calculateDefectHistoryScore(file);

      case 'change-frequency':
        return await this.calculateChangeFrequencyScore(file);

      case 'code-age':
        return await this.calculateCodeAgeScore(file);

      case 'dependency-count':
        return await this.calculateDependencyScore(file);

      default:
        return 0.5; // Default moderate score for unknown factors
    }
  }

  private calculateUncoveredLinesScore(uncoveredLines: number[]): number {
    // More uncovered lines = higher risk
    const count = uncoveredLines.length;

    if (count === 0) return 0;
    if (count <= 5) return 0.2;
    if (count <= 15) return 0.4;
    if (count <= 30) return 0.6;
    if (count <= 50) return 0.8;
    return 1.0;
  }

  private async calculateComplexityScore(file: string): Promise<number> {
    try {
      const complexity = await this.memory.get<{ cyclomatic: number }>(
        `complexity:${file}`
      );

      if (!complexity) return 0.5;

      // Higher cyclomatic complexity = higher risk
      const cc = complexity.cyclomatic;
      if (cc <= 5) return 0.2;
      if (cc <= 10) return 0.4;
      if (cc <= 20) return 0.6;
      if (cc <= 30) return 0.8;
      return 1.0;
    } catch {
      return 0.5;
    }
  }

  private async calculateDefectHistoryScore(file: string): Promise<number> {
    const history = await this.getDefectHistory(file);
    const count = history.count;

    if (count === 0) return 0.1;
    if (count <= 2) return 0.3;
    if (count <= 5) return 0.5;
    if (count <= 10) return 0.7;
    return 0.9;
  }

  private async calculateChangeFrequencyScore(file: string): Promise<number> {
    const frequency = await this.getChangeFrequency(file);

    // More frequent changes = higher risk
    if (frequency <= 2) return 0.2;
    if (frequency <= 5) return 0.4;
    if (frequency <= 10) return 0.6;
    if (frequency <= 20) return 0.8;
    return 1.0;
  }

  private async calculateCodeAgeScore(file: string): Promise<number> {
    try {
      const metadata = await this.memory.get<{ createdAt: string }>(
        `file-metadata:${file}`
      );

      if (!metadata) return 0.5;

      const ageInDays =
        (Date.now() - new Date(metadata.createdAt).getTime()) / (1000 * 60 * 60 * 24);

      // Very old or very new code has higher risk
      if (ageInDays <= 7) return 0.8; // Very new
      if (ageInDays <= 30) return 0.5;
      if (ageInDays <= 90) return 0.3;
      if (ageInDays <= 365) return 0.4;
      return 0.6; // Very old
    } catch {
      return 0.5;
    }
  }

  private async calculateDependencyScore(file: string): Promise<number> {
    try {
      const deps = await this.memory.get<{ count: number }>(
        `dependencies:${file}`
      );

      if (!deps) return 0.5;

      // More dependencies = higher risk
      const count = deps.count;
      if (count <= 3) return 0.2;
      if (count <= 7) return 0.4;
      if (count <= 15) return 0.6;
      if (count <= 25) return 0.8;
      return 1.0;
    } catch {
      return 0.5;
    }
  }

  private async getDefectHistory(file: string): Promise<{ count: number }> {
    try {
      const history = await this.memory.get<{ defectCount: number }>(
        `defect-history:${file}`
      );
      return { count: history?.defectCount ?? 0 };
    } catch {
      return { count: 0 };
    }
  }

  private async getChangeFrequency(file: string): Promise<number> {
    try {
      const changes = await this.memory.get<{ changesLast90Days: number }>(
        `change-frequency:${file}`
      );
      return changes?.changesLast90Days ?? 5; // Default moderate frequency
    } catch {
      return 5;
    }
  }

  private riskScoreToSeverity(riskScore: number): Severity {
    if (riskScore >= 0.8) return 'critical';
    if (riskScore >= 0.6) return 'high';
    if (riskScore >= 0.3) return 'medium';
    if (riskScore >= 0.1) return 'low';
    return 'info';
  }

  private generateRiskRecommendations(
    file: string,
    overallRisk: number,
    riskLevel: Severity,
    factorScores: FactorScore[]
  ): string[] {
    const recommendations: string[] = [];

    // Find top contributing factors
    const sortedFactors = [...factorScores].sort(
      (a, b) => b.score * b.contribution - a.score * a.contribution
    );
    const topFactors = sortedFactors.slice(0, 3);

    // Generate recommendations based on risk level
    if (riskLevel === 'critical') {
      recommendations.push(
        `CRITICAL: ${file} has a risk score of ${(overallRisk * 100).toFixed(1)}%. Immediate action required.`
      );
    } else if (riskLevel === 'high') {
      recommendations.push(
        `HIGH RISK: ${file} should be prioritized for test coverage improvement.`
      );
    }

    // Factor-specific recommendations
    for (const factor of topFactors) {
      if (factor.score >= 0.6) {
        recommendations.push(this.getFactorRecommendation(factor.name, factor.score));
      }
    }

    // General recommendations based on risk profile
    if (overallRisk >= 0.5) {
      recommendations.push(
        'Consider breaking this file into smaller, more testable modules.'
      );
    }

    if (factorScores.find((f) => f.name === 'defect-history' && f.score >= 0.5)) {
      recommendations.push(
        'This file has a history of defects. Add regression tests for known issues.'
      );
    }

    return recommendations;
  }

  private getFactorRecommendation(factorName: string, score: number): string {
    const severity = score >= 0.8 ? 'Critical' : 'High';

    switch (factorName) {
      case 'uncovered-lines':
        return `${severity}: Many uncovered lines. Focus on adding unit tests for core logic.`;
      case 'complexity':
        return `${severity}: High complexity detected. Consider refactoring before adding tests.`;
      case 'defect-history':
        return `${severity}: Past defects in this area. Add regression tests to prevent recurrence.`;
      case 'change-frequency':
        return `${severity}: Frequently changed code. Ensure comprehensive test coverage.`;
      case 'code-age':
        return `${severity}: Code age indicates risk. Review and update tests accordingly.`;
      case 'dependency-count':
        return `${severity}: Many dependencies. Add integration tests to verify interactions.`;
      default:
        return `${severity}: Factor "${factorName}" indicates elevated risk.`;
    }
  }

  private async storeRiskSnapshot(
    file: string,
    riskScore: number,
    factorScores: FactorScore[]
  ): Promise<void> {
    try {
      const historyKey = `${RiskScorerService.HISTORY_KEY_PREFIX}:${file}`;
      const existing = (await this.memory.get<RiskHistoryEntry[]>(historyKey)) ?? [];

      const entry: RiskHistoryEntry = {
        timestamp: Date.now(),
        riskScore,
        topFactors: factorScores
          .filter((f) => f.score >= 0.5)
          .map((f) => f.name),
      };

      // Keep only recent entries
      const updated = [...existing, entry].slice(-RiskScorerService.MAX_TREND_POINTS);

      await this.memory.set(historyKey, updated, { persist: true });
    } catch {
      // Non-critical operation
    }
  }

  private analyzeTrend(
    dataPoints: RiskTrendPoint[]
  ): 'increasing' | 'decreasing' | 'stable' {
    if (dataPoints.length < 3) return 'stable';

    // Calculate simple linear regression slope
    const n = dataPoints.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = dataPoints[i].riskScore;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    if (slope > 0.01) return 'increasing';
    if (slope < -0.01) return 'decreasing';
    return 'stable';
  }

  private forecastRisk(dataPoints: RiskTrendPoint[]): number {
    if (dataPoints.length === 0) return 0.5;
    if (dataPoints.length === 1) return dataPoints[0].riskScore;

    // Simple exponential moving average for forecast
    const alpha = 0.3;
    let forecast = dataPoints[0].riskScore;

    for (let i = 1; i < dataPoints.length; i++) {
      forecast = alpha * dataPoints[i].riskScore + (1 - alpha) * forecast;
    }

    // Project one step forward
    const trend = this.analyzeTrend(dataPoints);
    if (trend === 'increasing') {
      forecast = Math.min(1, forecast + 0.05);
    } else if (trend === 'decreasing') {
      forecast = Math.max(0, forecast - 0.05);
    }

    return forecast;
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface FactorScore {
  name: string;
  score: number;
  contribution: number;
}

interface RiskHistoryEntry {
  timestamp: number;
  riskScore: number;
  topFactors: string[];
}
