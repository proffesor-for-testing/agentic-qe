/**
 * Agentic QE v3 - Quality Gate Service
 * Evaluates quality gates with pass/fail/warn based on thresholds
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, Severity } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import { toError } from '../../../shared/error-utils.js';
import {
  GateEvaluationRequest,
  GateResult,
  GateCheck,
  GateThresholds,
  QualityMetrics,
} from '../interfaces';

/**
 * Interface for the quality gate service
 */
export interface IQualityGateService {
  evaluateGate(request: GateEvaluationRequest): Promise<Result<GateResult, Error>>;
  createGatePreset(name: string, thresholds: GateThresholds): Promise<Result<string, Error>>;
  getGatePreset(name: string): Promise<GateThresholds | undefined>;
  listGatePresets(): Promise<string[]>;
}

/**
 * Configuration for quality gate evaluation
 */
export interface QualityGateConfig {
  strictMode: boolean;
  enableWarnings: boolean;
  defaultSeverities: Record<keyof GateThresholds, Severity>;
}

const DEFAULT_CONFIG: QualityGateConfig = {
  strictMode: false,
  enableWarnings: true,
  defaultSeverities: {
    coverage: 'high',
    testsPassing: 'critical',
    criticalBugs: 'critical',
    codeSmells: 'medium',
    securityVulnerabilities: 'critical',
    technicalDebt: 'medium',
    duplications: 'low',
  },
};

/**
 * Default gate presets
 */
const DEFAULT_PRESETS: Record<string, GateThresholds> = {
  strict: {
    coverage: { min: 90 },
    testsPassing: { min: 100 },
    criticalBugs: { max: 0 },
    codeSmells: { max: 10 },
    securityVulnerabilities: { max: 0 },
    technicalDebt: { max: 2 },
    duplications: { max: 3 },
  },
  standard: {
    coverage: { min: 80 },
    testsPassing: { min: 95 },
    criticalBugs: { max: 0 },
    codeSmells: { max: 20 },
    securityVulnerabilities: { max: 0 },
    technicalDebt: { max: 5 },
    duplications: { max: 5 },
  },
  relaxed: {
    coverage: { min: 60 },
    testsPassing: { min: 90 },
    criticalBugs: { max: 2 },
    codeSmells: { max: 50 },
    securityVulnerabilities: { max: 1 },
    technicalDebt: { max: 10 },
    duplications: { max: 10 },
  },
};

/**
 * Quality Gate Service Implementation
 * Evaluates code quality against configurable thresholds
 */
export class QualityGateService implements IQualityGateService {
  private readonly config: QualityGateConfig;
  private readonly presets: Map<string, GateThresholds> = new Map();

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<QualityGateConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize with default presets
    for (const [name, thresholds] of Object.entries(DEFAULT_PRESETS)) {
      this.presets.set(name, thresholds);
    }
  }

  /**
   * Evaluate a quality gate against provided metrics
   */
  async evaluateGate(request: GateEvaluationRequest): Promise<Result<GateResult, Error>> {
    try {
      const { gateName, metrics, thresholds } = request;

      if (!metrics) {
        return err(new Error('No metrics provided for gate evaluation'));
      }

      const checks: GateCheck[] = [];
      const failedChecks: string[] = [];

      // Evaluate each threshold
      checks.push(...this.evaluateMinThresholds(metrics, thresholds));
      checks.push(...this.evaluateMaxThresholds(metrics, thresholds));

      // Collect failed checks
      for (const check of checks) {
        if (!check.passed) {
          failedChecks.push(check.name);
        }
      }

      // Calculate overall score (0-100)
      const overallScore = this.calculateOverallScore(checks);

      // Determine pass/fail based on critical checks
      const passed = this.determineGateStatus(checks);

      const result: GateResult = {
        gateName,
        passed,
        checks,
        overallScore,
        failedChecks,
      };

      // Store evaluation result in memory
      await this.storeEvaluationResult(result);

      return ok(result);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Create a custom gate preset
   */
  async createGatePreset(
    name: string,
    thresholds: GateThresholds
  ): Promise<Result<string, Error>> {
    try {
      const presetId = `preset-${name}-${uuidv4().slice(0, 8)}`;

      this.presets.set(name, thresholds);

      // Persist to memory
      await this.memory.set(
        `quality-gate:preset:${name}`,
        { id: presetId, name, thresholds, createdAt: new Date().toISOString() },
        { namespace: 'quality-assessment', persist: true }
      );

      return ok(presetId);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get a gate preset by name
   */
  async getGatePreset(name: string): Promise<GateThresholds | undefined> {
    // Check in-memory first
    if (this.presets.has(name)) {
      return this.presets.get(name);
    }

    // Check persistent storage
    const stored = await this.memory.get<{ thresholds: GateThresholds }>(
      `quality-gate:preset:${name}`
    );

    if (stored) {
      this.presets.set(name, stored.thresholds);
      return stored.thresholds;
    }

    return undefined;
  }

  /**
   * List all available gate presets
   */
  async listGatePresets(): Promise<string[]> {
    const presetKeys = await this.memory.search('quality-gate:preset:*', 100);
    const names = new Set(Array.from(this.presets.keys()));

    for (const key of presetKeys) {
      const name = key.replace('quality-gate:preset:', '');
      names.add(name);
    }

    return Array.from(names);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private evaluateMinThresholds(
    metrics: QualityMetrics,
    thresholds: GateThresholds
  ): GateCheck[] {
    const checks: GateCheck[] = [];

    // Coverage (min)
    if (thresholds.coverage?.min !== undefined) {
      checks.push(this.createCheck(
        'coverage',
        metrics.coverage,
        thresholds.coverage.min,
        'min',
        this.config.defaultSeverities.coverage
      ));
    }

    // Tests Passing (min)
    if (thresholds.testsPassing?.min !== undefined) {
      checks.push(this.createCheck(
        'testsPassing',
        metrics.testsPassing,
        thresholds.testsPassing.min,
        'min',
        this.config.defaultSeverities.testsPassing
      ));
    }

    return checks;
  }

  private evaluateMaxThresholds(
    metrics: QualityMetrics,
    thresholds: GateThresholds
  ): GateCheck[] {
    const checks: GateCheck[] = [];

    // Critical Bugs (max)
    if (thresholds.criticalBugs?.max !== undefined) {
      checks.push(this.createCheck(
        'criticalBugs',
        metrics.criticalBugs,
        thresholds.criticalBugs.max,
        'max',
        this.config.defaultSeverities.criticalBugs
      ));
    }

    // Code Smells (max)
    if (thresholds.codeSmells?.max !== undefined) {
      checks.push(this.createCheck(
        'codeSmells',
        metrics.codeSmells,
        thresholds.codeSmells.max,
        'max',
        this.config.defaultSeverities.codeSmells
      ));
    }

    // Security Vulnerabilities (max)
    if (thresholds.securityVulnerabilities?.max !== undefined) {
      checks.push(this.createCheck(
        'securityVulnerabilities',
        metrics.securityVulnerabilities,
        thresholds.securityVulnerabilities.max,
        'max',
        this.config.defaultSeverities.securityVulnerabilities
      ));
    }

    // Technical Debt (max, in hours)
    if (thresholds.technicalDebt?.max !== undefined) {
      checks.push(this.createCheck(
        'technicalDebt',
        metrics.technicalDebt,
        thresholds.technicalDebt.max,
        'max',
        this.config.defaultSeverities.technicalDebt
      ));
    }

    // Duplications (max, percentage)
    if (thresholds.duplications?.max !== undefined) {
      checks.push(this.createCheck(
        'duplications',
        metrics.duplications,
        thresholds.duplications.max,
        'max',
        this.config.defaultSeverities.duplications
      ));
    }

    return checks;
  }

  private createCheck(
    name: string,
    value: number,
    threshold: number,
    type: 'min' | 'max',
    severity: Severity
  ): GateCheck {
    const passed = type === 'min'
      ? value >= threshold
      : value <= threshold;

    return {
      name,
      passed,
      value,
      threshold,
      severity,
    };
  }

  private calculateOverallScore(checks: GateCheck[]): number {
    if (checks.length === 0) return 100;

    // Weight by severity
    const severityWeights: Record<Severity, number> = {
      critical: 3,
      high: 2,
      medium: 1.5,
      low: 1,
      info: 0.5,
    };

    let totalWeight = 0;
    let passedWeight = 0;

    for (const check of checks) {
      const weight = severityWeights[check.severity];
      totalWeight += weight;
      if (check.passed) {
        passedWeight += weight;
      }
    }

    return totalWeight > 0
      ? Math.round((passedWeight / totalWeight) * 100)
      : 100;
  }

  private determineGateStatus(checks: GateCheck[]): boolean {
    // In strict mode, all checks must pass
    if (this.config.strictMode) {
      return checks.every((c) => c.passed);
    }

    // Otherwise, only critical and high severity checks must pass
    return checks
      .filter((c) => c.severity === 'critical' || c.severity === 'high')
      .every((c) => c.passed);
  }

  private async storeEvaluationResult(result: GateResult): Promise<void> {
    const key = `quality-gate:evaluation:${result.gateName}:${Date.now()}`;

    await this.memory.set(
      key,
      {
        ...result,
        evaluatedAt: new Date().toISOString(),
      },
      { namespace: 'quality-assessment', ttl: 86400 * 30 } // 30 days
    );
  }
}
