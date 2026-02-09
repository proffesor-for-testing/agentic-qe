/**
 * Unit tests for Devil's Advocate Agent and Challenge Strategies
 * ADR-064, Phase 2C: Validates challenge strategies and DevilsAdvocate agent behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MissingEdgeCaseStrategy,
  FalsePositiveDetectionStrategy,
  CoverageGapCritiqueStrategy,
  SecurityBlindSpotStrategy,
  AssumptionQuestioningStrategy,
  BoundaryValueGapStrategy,
  ErrorHandlingGapStrategy,
  createAllStrategies,
  getApplicableStrategies,
} from '../../src/agents/devils-advocate/strategies.js';
import { DevilsAdvocate } from '../../src/agents/devils-advocate/agent.js';
import type {
  ChallengeTarget,
  ChallengeTargetType,
} from '../../src/agents/devils-advocate/types.js';

// ============================================================================
// Helpers
// ============================================================================

/** Build a minimal ChallengeTarget for testing. */
function makeTarget(
  overrides: Partial<ChallengeTarget> & { type: ChallengeTargetType },
): ChallengeTarget {
  return {
    agentId: overrides.agentId ?? 'test-agent-001',
    domain: overrides.domain ?? 'test-domain',
    output: overrides.output ?? {},
    timestamp: overrides.timestamp ?? Date.now(),
    taskId: overrides.taskId,
    type: overrides.type,
  };
}

// ============================================================================
// MissingEdgeCaseStrategy
// ============================================================================

describe('MissingEdgeCaseStrategy', () => {
  let strategy: MissingEdgeCaseStrategy;

  beforeEach(() => {
    strategy = new MissingEdgeCaseStrategy();
  });

  it('challenges when no error tests found', () => {
    const target = makeTarget({
      type: 'test-generation',
      output: { testCount: 5, tests: ['test_add', 'test_subtract'] },
    });
    const challenges = strategy.challenge(target);
    const errorChallenge = challenges.find(c => c.title.includes('No error path tests'));
    expect(errorChallenge).toBeDefined();
    expect(errorChallenge!.severity).toBe('high');
    expect(errorChallenge!.category).toBe('missing-edge-case');
  });

  it('challenges when test count is low for complexity', () => {
    const target = makeTarget({
      type: 'test-generation',
      output: {
        testCount: 3,
        complexity: 10,
        error: 'handled',
        null: 'checked',
        empty: 'tested',
      },
    });
    const challenges = strategy.challenge(target);
    const countChallenge = challenges.find(c => c.category === 'insufficient-test-count');
    expect(countChallenge).toBeDefined();
    expect(countChallenge!.severity).toBe('medium');
    expect(countChallenge!.description).toContain('3');
    expect(countChallenge!.description).toContain('10');
  });

  it('does not challenge when error keywords are present', () => {
    const target = makeTarget({
      type: 'test-generation',
      output: {
        tests: ['test_throw_error', 'test_null_input', 'test_empty_array'],
        error: true,
        null: true,
        empty: true,
      },
    });
    const challenges = strategy.challenge(target);
    const errorChallenge = challenges.find(c => c.title.includes('No error path tests'));
    expect(errorChallenge).toBeUndefined();
  });
});

// ============================================================================
// FalsePositiveDetectionStrategy
// ============================================================================

describe('FalsePositiveDetectionStrategy', () => {
  let strategy: FalsePositiveDetectionStrategy;

  beforeEach(() => {
    strategy = new FalsePositiveDetectionStrategy();
  });

  it('challenges when >50% findings are low severity', () => {
    const target = makeTarget({
      type: 'security-scan',
      output: {
        findings: [
          { severity: 'low', msg: 'a' },
          { severity: 'low', msg: 'b' },
          { severity: 'info', msg: 'c' },
          { severity: 'high', msg: 'd' },
        ],
      },
    });
    const challenges = strategy.challenge(target);
    const noiseChallenge = challenges.find(c => c.title.includes('High noise ratio'));
    expect(noiseChallenge).toBeDefined();
    expect(noiseChallenge!.severity).toBe('medium');
    expect(noiseChallenge!.category).toBe('false-positive');
  });

  it('does not challenge when low severity findings are <=50%', () => {
    const target = makeTarget({
      type: 'security-scan',
      output: {
        findings: [
          { severity: 'high', msg: 'a' },
          { severity: 'critical', msg: 'b' },
          { severity: 'low', msg: 'c' },
        ],
      },
    });
    const challenges = strategy.challenge(target);
    const noiseChallenge = challenges.find(c => c.title.includes('High noise ratio'));
    expect(noiseChallenge).toBeUndefined();
  });

  it('challenges when confidence clusters near threshold', () => {
    const target = makeTarget({
      type: 'defect-prediction',
      output: {
        defects: [
          { confidence: 0.45, name: 'a' },
          { confidence: 0.50, name: 'b' },
          { confidence: 0.55, name: 'c' },
          { confidence: 0.42, name: 'd' },
        ],
      },
    });
    const challenges = strategy.challenge(target);
    const clusterChallenge = challenges.find(c =>
      c.title.includes('Confidence scores clustered'),
    );
    expect(clusterChallenge).toBeDefined();
    expect(clusterChallenge!.severity).toBe('high');
  });
});

// ============================================================================
// CoverageGapCritiqueStrategy
// ============================================================================

describe('CoverageGapCritiqueStrategy', () => {
  let strategy: CoverageGapCritiqueStrategy;

  beforeEach(() => {
    strategy = new CoverageGapCritiqueStrategy();
  });

  it('challenges when branch < line coverage by >15pp', () => {
    const target = makeTarget({
      type: 'coverage-analysis',
      output: { lineCoverage: 90, branchCoverage: 60 },
    });
    const challenges = strategy.challenge(target);
    const gapChallenge = challenges.find(c =>
      c.title.includes('Significant gap between line and branch'),
    );
    expect(gapChallenge).toBeDefined();
    expect(gapChallenge!.severity).toBe('high');
    expect(gapChallenge!.description).toContain('90');
    expect(gapChallenge!.description).toContain('60');
  });

  it('no challenge when branch and line are close', () => {
    const target = makeTarget({
      type: 'coverage-analysis',
      output: { lineCoverage: 85, branchCoverage: 80 },
    });
    const challenges = strategy.challenge(target);
    const gapChallenge = challenges.find(c =>
      c.title.includes('Significant gap between line and branch'),
    );
    expect(gapChallenge).toBeUndefined();
  });

  it('challenges when high line coverage but branch missing', () => {
    const target = makeTarget({
      type: 'coverage-analysis',
      output: { lineCoverage: 95 },
    });
    const challenges = strategy.challenge(target);
    const missingBranch = challenges.find(c =>
      c.title.includes('branch coverage is missing'),
    );
    expect(missingBranch).toBeDefined();
    expect(missingBranch!.severity).toBe('high');
  });
});

// ============================================================================
// SecurityBlindSpotStrategy
// ============================================================================

describe('SecurityBlindSpotStrategy', () => {
  let strategy: SecurityBlindSpotStrategy;

  beforeEach(() => {
    strategy = new SecurityBlindSpotStrategy();
  });

  it('challenges missing OWASP categories', () => {
    // Output only mentions injection; all other categories missing
    const target = makeTarget({
      type: 'security-scan',
      output: { scan: 'SQL injection test passed' },
    });
    const challenges = strategy.challenge(target);
    const owaspChallenge = challenges.find(c =>
      c.title.includes('OWASP categories not addressed'),
    );
    expect(owaspChallenge).toBeDefined();
    // With only injection covered, many are missing
    expect(owaspChallenge!.confidence).toBe(0.80);
  });

  it('challenges missing auth testing', () => {
    // Output that mentions nothing auth-related
    const target = makeTarget({
      type: 'security-scan',
      output: { scan: 'xss test complete, injection test complete' },
    });
    const challenges = strategy.challenge(target);
    const authChallenge = challenges.find(c =>
      c.title.includes('No authentication testing detected'),
    );
    expect(authChallenge).toBeDefined();
    expect(authChallenge!.severity).toBe('high');
  });

  it('does not challenge auth when auth keywords present', () => {
    const target = makeTarget({
      type: 'security-scan',
      output: { scan: 'auth login session token jwt injection sql xss' },
    });
    const challenges = strategy.challenge(target);
    const authChallenge = challenges.find(c =>
      c.title.includes('No authentication testing detected'),
    );
    expect(authChallenge).toBeUndefined();
  });
});

// ============================================================================
// AssumptionQuestioningStrategy
// ============================================================================

describe('AssumptionQuestioningStrategy', () => {
  let strategy: AssumptionQuestioningStrategy;

  beforeEach(() => {
    strategy = new AssumptionQuestioningStrategy();
  });

  it('challenges happy-path-only assessment', () => {
    // Output with no failure/error/edge-case keywords
    const target = makeTarget({
      type: 'quality-assessment',
      output: { result: 'All tests pass, code is clean, performance is good' },
    });
    const challenges = strategy.challenge(target);
    const happyPathChallenge = challenges.find(c =>
      c.title.includes('only happy paths'),
    );
    expect(happyPathChallenge).toBeDefined();
    expect(happyPathChallenge!.severity).toBe('high');
    expect(happyPathChallenge!.category).toBe('unstated-assumption');
  });

  it('does not challenge when failure modes are mentioned', () => {
    const target = makeTarget({
      type: 'quality-assessment',
      output: {
        result: 'Tests cover failure, timeout, and retry scenarios. Performance is good.',
      },
    });
    const challenges = strategy.challenge(target);
    const happyPathChallenge = challenges.find(c =>
      c.title.includes('only happy paths'),
    );
    expect(happyPathChallenge).toBeUndefined();
  });
});

// ============================================================================
// BoundaryValueGapStrategy
// ============================================================================

describe('BoundaryValueGapStrategy', () => {
  let strategy: BoundaryValueGapStrategy;

  beforeEach(() => {
    strategy = new BoundaryValueGapStrategy();
  });

  it('challenges missing boundary tests', () => {
    const target = makeTarget({
      type: 'test-generation',
      output: { tests: ['test_basic_add', 'test_basic_subtract'] },
    });
    const challenges = strategy.challenge(target);
    const boundaryChallenge = challenges.find(c =>
      c.title.includes('No boundary value tests'),
    );
    expect(boundaryChallenge).toBeDefined();
    expect(boundaryChallenge!.severity).toBe('high');
    expect(boundaryChallenge!.category).toBe('boundary-value-gap');
  });

  it('does not challenge when boundary keywords are present', () => {
    const target = makeTarget({
      type: 'test-generation',
      output: {
        tests: [
          'test_minimum_value',
          'test_maximum_value',
          'test_zero_input',
          'test_negative_input',
          'test_overflow_handling',
          'test_empty_string_boundary',
        ],
      },
    });
    const challenges = strategy.challenge(target);
    const boundaryChallenge = challenges.find(c =>
      c.title.includes('No boundary value tests'),
    );
    expect(boundaryChallenge).toBeUndefined();
  });
});

// ============================================================================
// ErrorHandlingGapStrategy
// ============================================================================

describe('ErrorHandlingGapStrategy', () => {
  let strategy: ErrorHandlingGapStrategy;

  beforeEach(() => {
    strategy = new ErrorHandlingGapStrategy();
  });

  it('challenges missing timeout/error tests', () => {
    const target = makeTarget({
      type: 'test-generation',
      output: { tests: ['test_happy_path'] },
    });
    const challenges = strategy.challenge(target);
    const timeoutChallenge = challenges.find(c =>
      c.title.includes('No timeout scenario tests'),
    );
    const networkChallenge = challenges.find(c =>
      c.title.includes('No network error scenario tests'),
    );
    expect(timeoutChallenge).toBeDefined();
    expect(timeoutChallenge!.severity).toBe('medium');
    expect(networkChallenge).toBeDefined();
    expect(networkChallenge!.severity).toBe('medium');
  });

  it('does not challenge when timeout and network keywords present', () => {
    const target = makeTarget({
      type: 'test-generation',
      output: {
        tests: ['test timeout handling', 'handles network error gracefully', 'test concurrent access'],
      },
    });
    const challenges = strategy.challenge(target);
    const timeoutChallenge = challenges.find(c =>
      c.title.includes('No timeout scenario tests'),
    );
    const networkChallenge = challenges.find(c =>
      c.title.includes('No network error scenario tests'),
    );
    expect(timeoutChallenge).toBeUndefined();
    expect(networkChallenge).toBeUndefined();
  });
});

// ============================================================================
// Strategy Applicability
// ============================================================================

describe('Strategy applicability', () => {
  it('each strategy only runs on its target types', () => {
    const strategies = createAllStrategies();

    // MissingEdgeCaseStrategy: test-generation, coverage-analysis
    const missing = strategies.find(s => s.type === 'missing-edge-cases')!;
    expect(missing.applicableTo).toContain('test-generation');
    expect(missing.applicableTo).toContain('coverage-analysis');
    expect(missing.applicableTo).not.toContain('security-scan');

    // FalsePositiveDetectionStrategy: security-scan, defect-prediction
    const fp = strategies.find(s => s.type === 'false-positive-detection')!;
    expect(fp.applicableTo).toContain('security-scan');
    expect(fp.applicableTo).toContain('defect-prediction');
    expect(fp.applicableTo).not.toContain('test-generation');

    // CoverageGapCritiqueStrategy: coverage-analysis, quality-assessment
    const cov = strategies.find(s => s.type === 'coverage-gap-critique')!;
    expect(cov.applicableTo).toContain('coverage-analysis');
    expect(cov.applicableTo).toContain('quality-assessment');
    expect(cov.applicableTo).not.toContain('security-scan');

    // SecurityBlindSpotStrategy: security-scan only
    const sec = strategies.find(s => s.type === 'security-blind-spots')!;
    expect(sec.applicableTo).toContain('security-scan');
    expect(sec.applicableTo).toHaveLength(1);

    // AssumptionQuestioningStrategy: requirements, quality-assessment
    const aq = strategies.find(s => s.type === 'assumption-questioning')!;
    expect(aq.applicableTo).toContain('requirements');
    expect(aq.applicableTo).toContain('quality-assessment');
    expect(aq.applicableTo).not.toContain('test-generation');

    // BoundaryValueGapStrategy: test-generation, contract-validation
    const bv = strategies.find(s => s.type === 'boundary-value-gaps')!;
    expect(bv.applicableTo).toContain('test-generation');
    expect(bv.applicableTo).toContain('contract-validation');
    expect(bv.applicableTo).not.toContain('security-scan');

    // ErrorHandlingGapStrategy: test-generation only
    const eh = strategies.find(s => s.type === 'error-handling-gaps')!;
    expect(eh.applicableTo).toContain('test-generation');
    expect(eh.applicableTo).toHaveLength(1);
  });

  it('getApplicableStrategies filters correctly', () => {
    const all = createAllStrategies();
    const forSecurity = getApplicableStrategies(all, 'security-scan');

    // Should include: false-positive-detection, security-blind-spots
    const types = forSecurity.map(s => s.type);
    expect(types).toContain('false-positive-detection');
    expect(types).toContain('security-blind-spots');
    expect(types).not.toContain('missing-edge-cases');
    expect(types).not.toContain('error-handling-gaps');
  });
});

// ============================================================================
// DevilsAdvocate Agent
// ============================================================================

describe('DevilsAdvocate', () => {
  let agent: DevilsAdvocate;

  beforeEach(() => {
    agent = new DevilsAdvocate();
  });

  it('review with applicable target type produces challenges', () => {
    const target = makeTarget({
      type: 'test-generation',
      output: { tests: ['test_add'] },
    });
    const result = agent.review(target);
    expect(result.challenges.length).toBeGreaterThan(0);
    expect(result.targetType).toBe('test-generation');
    expect(result.targetAgentId).toBe('test-agent-001');
  });

  it('review with inapplicable target produces no challenges when no strategies apply', () => {
    // Create agent with only security-blind-spots enabled
    const restrictedAgent = new DevilsAdvocate({
      enabledStrategies: ['security-blind-spots'],
    });
    // Target type 'requirements' has no overlap with security-blind-spots
    const target = makeTarget({
      type: 'requirements',
      output: { requirements: ['req-1'] },
    });
    const result = restrictedAgent.review(target);
    expect(result.challenges).toHaveLength(0);
  });

  it('challenges filtered by minConfidence', () => {
    // Set a very high minConfidence to filter out most challenges
    const strictAgent = new DevilsAdvocate({ minConfidence: 0.99 });
    const target = makeTarget({
      type: 'test-generation',
      output: { tests: ['test_add'] },
    });
    const result = strictAgent.review(target);
    // Most challenges have confidence < 0.99, so most should be filtered
    expect(result.challenges.length).toBeLessThan(
      new DevilsAdvocate().review(target).challenges.length,
    );
  });

  it('challenges filtered by minSeverity', () => {
    // Only include 'critical' severity challenges
    const criticalOnly = new DevilsAdvocate({ minSeverity: 'critical' });
    const target = makeTarget({
      type: 'security-scan',
      output: { scan: 'basic scan results' },
    });
    const result = criticalOnly.review(target);
    for (const challenge of result.challenges) {
      expect(challenge.severity).toBe('critical');
    }
  });

  it('challenges limited by maxChallengesPerReview', () => {
    const limitedAgent = new DevilsAdvocate({ maxChallengesPerReview: 2 });
    const target = makeTarget({
      type: 'test-generation',
      output: { tests: ['test_basic'] },
    });
    const result = limitedAgent.review(target);
    expect(result.challenges.length).toBeLessThanOrEqual(2);
  });

  it('challenges sorted by severity (critical first)', () => {
    const target = makeTarget({
      type: 'security-scan',
      output: { scan: 'basic scan with no useful keywords at all' },
    });
    const result = agent.review(target);
    if (result.challenges.length >= 2) {
      const severityOrder = ['critical', 'high', 'medium', 'low', 'informational'];
      for (let i = 1; i < result.challenges.length; i++) {
        const prevIdx = severityOrder.indexOf(result.challenges[i - 1].severity);
        const currIdx = severityOrder.indexOf(result.challenges[i].severity);
        expect(prevIdx).toBeLessThanOrEqual(currIdx);
      }
    }
  });

  it('overall score decreases with more/higher severity challenges', () => {
    // A target that produces many challenges
    const badTarget = makeTarget({
      type: 'test-generation',
      output: { tests: ['test_simple'] },
    });
    // A target that mentions many keywords to suppress challenges
    const goodTarget = makeTarget({
      type: 'test-generation',
      output: {
        tests: [
          'test_null_handling',
          'test_empty_array',
          'test_error_throwing',
          'test_timeout_deadline',
          'test_network_error_connection_refused',
          'test_concurrent_race_condition',
          'test_memory_exhaustion',
          'test_minimum_boundary',
          'test_zero_negative',
          'test_overflow_underflow',
          'test_empty_string_max_length',
        ],
        testCount: 20,
        complexity: 5,
      },
    });
    const badResult = agent.review(badTarget);
    // Create a new agent for the good review so stats dont interact
    const agent2 = new DevilsAdvocate();
    const goodResult = agent2.review(goodTarget);
    expect(badResult.overallScore).toBeLessThan(goodResult.overallScore);
  });

  it('score is 1.0 when no challenges found', () => {
    const restrictedAgent = new DevilsAdvocate({
      enabledStrategies: ['security-blind-spots'],
    });
    const target = makeTarget({
      type: 'requirements',
      output: {},
    });
    const result = restrictedAgent.review(target);
    expect(result.overallScore).toBe(1.0);
  });

  it('stats track total reviews and challenges', () => {
    const target = makeTarget({
      type: 'test-generation',
      output: { tests: ['test'] },
    });
    agent.review(target);
    agent.review(target);
    const stats = agent.getStats();
    expect(stats.totalReviews).toBe(2);
    expect(stats.totalChallenges).toBeGreaterThan(0);
    expect(stats.averageChallengesPerReview).toBe(
      stats.totalChallenges / stats.totalReviews,
    );
  });

  it('stats track challenges by severity', () => {
    const target = makeTarget({
      type: 'test-generation',
      output: { tests: ['test_basic'] },
    });
    agent.review(target);
    const stats = agent.getStats();
    const totalBySeverity =
      stats.challengesBySeverity.critical +
      stats.challengesBySeverity.high +
      stats.challengesBySeverity.medium +
      stats.challengesBySeverity.low +
      stats.challengesBySeverity.informational;
    expect(totalBySeverity).toBe(stats.totalChallenges);
  });

  it('reset stats clears all counters', () => {
    const target = makeTarget({
      type: 'test-generation',
      output: { tests: ['test'] },
    });
    agent.review(target);
    expect(agent.getStats().totalReviews).toBe(1);

    agent.resetStats();
    const stats = agent.getStats();
    expect(stats.totalReviews).toBe(0);
    expect(stats.totalChallenges).toBe(0);
    expect(stats.challengesBySeverity.critical).toBe(0);
    expect(stats.challengesBySeverity.high).toBe(0);
    expect(stats.challengesBySeverity.medium).toBe(0);
    expect(stats.challengesBySeverity.low).toBe(0);
    expect(stats.challengesBySeverity.informational).toBe(0);
    expect(stats.averageChallengesPerReview).toBe(0);
    expect(stats.averageScore).toBe(1);
  });

  it('getStrategiesFor returns only applicable strategies', () => {
    const forTestGen = agent.getStrategiesFor('test-generation');
    const types = forTestGen.map(s => s.type);
    expect(types).toContain('missing-edge-cases');
    expect(types).toContain('boundary-value-gaps');
    expect(types).toContain('error-handling-gaps');
    expect(types).not.toContain('security-blind-spots');
    expect(types).not.toContain('false-positive-detection');
  });

  it('disabled strategies are excluded', () => {
    // Only enable 'missing-edge-cases'
    const limitedAgent = new DevilsAdvocate({
      enabledStrategies: ['missing-edge-cases'],
    });
    const forTestGen = limitedAgent.getStrategiesFor('test-generation');
    const types = forTestGen.map(s => s.type);
    expect(types).toContain('missing-edge-cases');
    expect(types).not.toContain('boundary-value-gaps');
    expect(types).not.toContain('error-handling-gaps');
  });
});
