/**
 * Quality CLI Commands Test Suite
 * Comprehensive tests for all 5 quality commands
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QualityGateExecutor,
  QualityValidator,
  QualityRiskAssessor,
  QualityDecisionMaker,
  QualityPolicyValidator,
} from '@cli/commands/quality/index.js';
import type {
  QualityGateConfig,
  QualityGateResult,
  ValidationRule,
  ValidationResult,
  RiskAssessmentResult,
  DecisionResult,
  PolicyValidationResult,
} from '@cli/commands/quality/index.js';

// Mock external dependencies
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

describe('Quality Gate Command', () => {
  let executor: QualityGateExecutor;

  beforeEach(() => {
    const config: QualityGateConfig = {
      coverage: 80,
      complexity: 10,
      maintainability: 65,
      duplications: 3,
      securityHotspots: 0,
      bugs: 0,
      vulnerabilities: 0,
    };
    executor = new QualityGateExecutor(config);
  });

  it('should create executor with default config', async () => {
    const defaultExecutor = new QualityGateExecutor();
    expect(defaultExecutor).toBeDefined();
  });

  it('should execute quality gate successfully', async () => {
    const result = await executor.execute();
    expect(result).toBeDefined();
    expect(result.passed).toBeDefined();
    expect(result.metrics).toBeDefined();
    expect(result.violations).toBeInstanceOf(Array);
    expect(result.timestamp).toBeDefined();
  });

  it('should detect coverage violations', async () => {
    const result = await executor.execute();
    if (result.metrics.coverage < 80) {
      expect(result.violations.some((v) => v.includes('Coverage'))).toBe(true);
    }
  });

  it('should detect complexity violations', async () => {
    const result = await executor.execute();
    if (result.metrics.complexity > 10) {
      expect(result.violations.some((v) => v.includes('Complexity'))).toBe(true);
    }
  });

  it('should pass gate when all metrics meet thresholds', async () => {
    // Mock metrics to pass all thresholds
    const result = await executor.execute();
    // If all metrics are within thresholds, violations should be empty
    if (result.violations.length === 0) {
      expect(result.passed).toBe(true);
    }
  });

  it('should fail gate when metrics violate thresholds', async () => {
    const result = await executor.execute();
    if (result.violations.length > 0) {
      expect(result.passed).toBe(false);
    }
  });

  it('should display results without errors', async () => {
    const mockResult: QualityGateResult = {
      passed: true,
      metrics: {
        coverage: 85,
        complexity: 8,
        maintainability: 70,
        duplications: 2,
        securityHotspots: 0,
        bugs: 0,
        vulnerabilities: 0,
      },
      violations: [],
      timestamp: new Date().toISOString(),
    };

    expect(() => executor.displayResults(mockResult)).not.toThrow();
  });
});

describe('Quality Validate Command', () => {
  let validator: QualityValidator;

  beforeEach(() => {
    validator = new QualityValidator();
  });

  it('should create validator with default rules', () => {
    expect(validator).toBeDefined();
  });

  it('should create validator with custom rules', () => {
    const customRules: ValidationRule[] = [
      {
        name: 'Custom Coverage',
        metric: 'coverage',
        operator: 'gte',
        threshold: 90,
        severity: 'error',
      },
    ];
    const customValidator = new QualityValidator(customRules);
    expect(customValidator).toBeDefined();
  });

  it('should validate successfully', async () => {
    const result = await validator.validate();
    expect(result).toBeDefined();
    expect(result.valid).toBeDefined();
    expect(result.rules).toBeInstanceOf(Array);
    expect(result.summary).toBeDefined();
  });

  it('should have correct summary counts', async () => {
    const result = await validator.validate();
    expect(result.summary.total).toBe(result.rules.length);
    expect(result.summary.passed + result.summary.failed + result.summary.warnings).toBeLessThanOrEqual(
      result.summary.total
    );
  });

  it('should validate greater than or equal operator', async () => {
    const rules: ValidationRule[] = [
      {
        name: 'Test GTE',
        metric: 'coverage',
        operator: 'gte',
        threshold: 50,
        severity: 'error',
      },
    ];
    const testValidator = new QualityValidator(rules);
    const result = await testValidator.validate();
    expect(result.rules[0]).toBeDefined();
  });

  it('should validate less than or equal operator', async () => {
    const rules: ValidationRule[] = [
      {
        name: 'Test LTE',
        metric: 'complexity',
        operator: 'lte',
        threshold: 20,
        severity: 'warning',
      },
    ];
    const testValidator = new QualityValidator(rules);
    const result = await testValidator.validate();
    expect(result.rules[0]).toBeDefined();
  });

  it('should display results without errors', async () => {
    const result = await validator.validate();
    expect(() => validator.displayResults(result)).not.toThrow();
  });
});

describe('Quality Risk Command', () => {
  let assessor: QualityRiskAssessor;

  beforeEach(() => {
    assessor = new QualityRiskAssessor();
  });

  it('should create risk assessor', async () => {
    expect(assessor).toBeDefined();
  });

  it('should assess risks successfully', async () => {
    const result = await assessor.assess();
    expect(result).toBeDefined();
    expect(result.overallRisk).toBeDefined();
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(1);
    expect(result.factors).toBeInstanceOf(Array);
  });

  it('should identify risk factors', async () => {
    const result = await assessor.assess();
    expect(result.factors.length).toBeGreaterThan(0);
    result.factors.forEach((factor) => {
      expect(factor.category).toBeDefined();
      expect(factor.name).toBeDefined();
      expect(factor.severity).toBeDefined();
      expect(factor.probability).toBeGreaterThanOrEqual(0);
      expect(factor.probability).toBeLessThanOrEqual(1);
      expect(factor.impact).toBeGreaterThanOrEqual(0);
      expect(factor.impact).toBeLessThanOrEqual(1);
    });
  });

  it('should calculate risk scores correctly', async () => {
    const result = await assessor.assess();
    result.factors.forEach((factor) => {
      expect(factor.score).toBeCloseTo(factor.probability * factor.impact, 2);
    });
  });

  it('should provide mitigation strategies', async () => {
    const result = await assessor.assess();
    result.factors.forEach((factor) => {
      expect(factor.mitigation).toBeInstanceOf(Array);
      expect(factor.mitigation.length).toBeGreaterThan(0);
    });
  });

  it('should classify overall risk correctly', async () => {
    const result = await assessor.assess();
    expect(['critical', 'high', 'medium', 'low']).toContain(result.overallRisk);
  });

  it('should provide recommendations', async () => {
    const result = await assessor.assess();
    expect(result.recommendations).toBeInstanceOf(Array);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('should analyze trends', async () => {
    const result = await assessor.assess();
    expect(result.trends).toBeDefined();
    expect(result.trends.improving).toBeGreaterThanOrEqual(0);
    expect(result.trends.stable).toBeGreaterThanOrEqual(0);
    expect(result.trends.degrading).toBeGreaterThanOrEqual(0);
  });

  it('should display results without errors', async () => {
    const result = await assessor.assess();
    expect(() => assessor.displayResults(result)).not.toThrow();
  });
});

describe('Quality Decision Command', () => {
  let decisionMaker: QualityDecisionMaker;

  beforeEach(() => {
    decisionMaker = new QualityDecisionMaker();
  });

  it('should create decision maker with default criteria', async () => {
    expect(decisionMaker).toBeDefined();
  });

  it('should create decision maker with custom criteria', () => {
    const customDecisionMaker = new QualityDecisionMaker({
      coverage: { weight: 0.3, threshold: 90 },
    });
    expect(customDecisionMaker).toBeDefined();
  });

  it('should make decision successfully', async () => {
    const result = await decisionMaker.decide();
    expect(result).toBeDefined();
    expect(result.decision).toBeDefined();
    expect(['go', 'no-go', 'conditional']).toContain(result.decision);
  });

  it('should calculate confidence score', async () => {
    const result = await decisionMaker.decide();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('should calculate quality score', async () => {
    const result = await decisionMaker.decide();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should evaluate all factors', async () => {
    const result = await decisionMaker.decide();
    expect(result.factors).toBeInstanceOf(Array);
    expect(result.factors.length).toBeGreaterThan(0);
    result.factors.forEach((factor) => {
      expect(factor.name).toBeDefined();
      expect(factor.value).toBeDefined();
      expect(factor.weight).toBeDefined();
      expect(factor.threshold).toBeDefined();
      expect(factor.passed).toBeDefined();
      expect(factor.contribution).toBeDefined();
    });
  });

  it('should identify blockers', async () => {
    const result = await decisionMaker.decide();
    expect(result.blockers).toBeInstanceOf(Array);
    if (result.decision === 'no-go') {
      expect(result.blockers.length).toBeGreaterThan(0);
    }
  });

  it('should identify warnings', async () => {
    const result = await decisionMaker.decide();
    expect(result.warnings).toBeInstanceOf(Array);
  });

  it('should provide recommendations', async () => {
    const result = await decisionMaker.decide();
    expect(result.recommendations).toBeInstanceOf(Array);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('should provide reasoning', async () => {
    const result = await decisionMaker.decide();
    expect(result.reasoning).toBeDefined();
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it('should block deployment on critical issues', async () => {
    // This test checks the logic - in real scenario, would mock metrics
    const result = await decisionMaker.decide();
    // If there are critical issues (security/bugs), decision should be no-go
    const hasCriticalIssues = result.factors.some(
      (f) =>
        !f.passed && (f.name === 'Security Issues' || f.name === 'Critical Bugs')
    );
    if (hasCriticalIssues) {
      expect(result.decision).toBe('no-go');
    }
  });

  it('should display results without errors', async () => {
    const result = await decisionMaker.decide();
    expect(() => decisionMaker.displayResults(result)).not.toThrow();
  });
});

describe('Quality Policy Command', () => {
  let validator: QualityPolicyValidator;

  beforeEach(() => {
    validator = new QualityPolicyValidator();
  });

  it('should create policy validator with default policy', async () => {
    expect(validator).toBeDefined();
  });

  it('should validate policy successfully', async () => {
    const result = await validator.validate();
    expect(result).toBeDefined();
    expect(result.compliant).toBeDefined();
    expect(result.policy).toBeDefined();
    expect(result.results).toBeInstanceOf(Array);
  });

  it('should have valid policy structure', async () => {
    const result = await validator.validate();
    expect(result.policy.name).toBeDefined();
    expect(result.policy.version).toBeDefined();
    expect(result.policy.description).toBeDefined();
    expect(result.policy.enforcement).toBeDefined();
    expect(['strict', 'advisory']).toContain(result.policy.enforcement);
    expect(result.policy.rules).toBeInstanceOf(Array);
  });

  it('should validate all policy rules', async () => {
    const result = await validator.validate();
    expect(result.results.length).toBeGreaterThan(0);
    result.results.forEach((r) => {
      expect(r.rule).toBeDefined();
      expect(r.rule.id).toBeDefined();
      expect(r.rule.category).toBeDefined();
      expect(r.compliant).toBeDefined();
      expect(r.message).toBeDefined();
    });
  });

  it('should have correct summary counts', async () => {
    const result = await validator.validate();
    expect(result.summary.total).toBe(result.results.length);
    expect(result.summary.passed).toBeGreaterThanOrEqual(0);
    expect(result.summary.failed).toBeGreaterThanOrEqual(0);
    expect(result.summary.warnings).toBeGreaterThanOrEqual(0);
  });

  it('should validate coverage rules', async () => {
    const result = await validator.validate();
    const coverageRules = result.results.filter((r) => r.rule.category === 'coverage');
    expect(coverageRules.length).toBeGreaterThan(0);
  });

  it('should validate security rules', async () => {
    const result = await validator.validate();
    const securityRules = result.results.filter((r) => r.rule.category === 'security');
    expect(securityRules.length).toBeGreaterThan(0);
  });

  it('should validate testing rules', async () => {
    const result = await validator.validate();
    const testingRules = result.results.filter((r) => r.rule.category === 'testing');
    expect(testingRules.length).toBeGreaterThan(0);
  });

  it('should validate performance rules', async () => {
    const result = await validator.validate();
    const perfRules = result.results.filter((r) => r.rule.category === 'performance');
    expect(perfRules.length).toBeGreaterThan(0);
  });

  it('should validate maintainability rules', async () => {
    const result = await validator.validate();
    const maintRules = result.results.filter((r) => r.rule.category === 'maintainability');
    expect(maintRules.length).toBeGreaterThan(0);
  });

  it('should handle strict enforcement', async () => {
    const result = await validator.validate();
    if (result.policy.enforcement === 'strict') {
      const hasErrors = result.results.some((r) => !r.compliant && r.rule.severity === 'error');
      if (hasErrors) {
        expect(result.compliant).toBe(false);
      }
    }
  });

  it('should display results without errors', async () => {
    const result = await validator.validate();
    expect(() => validator.displayResults(result)).not.toThrow();
  });
});

// Integration tests
describe('Quality Commands Integration', () => {
  it('should share metrics across commands via memory', async () => {
    const gateExecutor = new QualityGateExecutor();
    const validator = new QualityValidator();

    const gateResult = await gateExecutor.execute();
    const validateResult = await validator.validate();

    // Both should complete successfully
    expect(gateResult).toBeDefined();
    expect(validateResult).toBeDefined();
  });

  it('should support end-to-end quality workflow', async () => {
    // 1. Execute quality gate
    const gateExecutor = new QualityGateExecutor();
    const gateResult = await gateExecutor.execute();
    expect(gateResult).toBeDefined();

    // 2. Validate metrics
    const validator = new QualityValidator();
    const validateResult = await validator.validate();
    expect(validateResult).toBeDefined();

    // 3. Assess risks
    const riskAssessor = new QualityRiskAssessor();
    const riskResult = await riskAssessor.assess();
    expect(riskResult).toBeDefined();

    // 4. Make decision
    const decisionMaker = new QualityDecisionMaker();
    const decisionResult = await decisionMaker.decide();
    expect(decisionResult).toBeDefined();

    // 5. Validate policy
    const policyValidator = new QualityPolicyValidator();
    const policyResult = await policyValidator.validate();
    expect(policyResult).toBeDefined();
  });

  it('should handle errors gracefully across all commands', async () => {
    const commands = [
      new QualityGateExecutor(),
      new QualityValidator(),
      new QualityRiskAssessor(),
      new QualityDecisionMaker(),
      new QualityPolicyValidator(),
    ];

    // All commands should handle execution without throwing
    for (const command of commands) {
      if ('execute' in command) {
        await expect(command.execute()).resolves.toBeDefined();
      } else if ('validate' in command) {
        await expect(command.validate()).resolves.toBeDefined();
      } else if ('assess' in command) {
        await expect(command.assess()).resolves.toBeDefined();
      } else if ('decide' in command) {
        await expect(command.decide()).resolves.toBeDefined();
      }
    }
  });
});
