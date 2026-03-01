/**
 * Agentic QE v3 - Devil's Advocate Challenge Strategies
 * ADR-064, Phase 2C: Concrete challenge strategies for different output types
 *
 * Each strategy focuses on a specific class of weakness and knows which
 * target types it can meaningfully critique.
 *
 * @module agents/devils-advocate
 */

import { randomUUID } from 'node:crypto';
import type {
  Challenge, ChallengeStrategy, ChallengeTarget,
  ChallengeTargetType, ChallengeStrategyType,
} from './types.js';

// ============================================================================
// Shared helpers
// ============================================================================

/** Build a Challenge with a generated UUID. */
function ch(params: Omit<Challenge, 'id'>): Challenge {
  return { id: randomUUID(), ...params };
}

/** Check whether any keywords appear in the JSON-serialized output. */
function mentions(output: Record<string, unknown>, keywords: string[]): boolean {
  const s = JSON.stringify(output).toLowerCase();
  return keywords.some(kw => s.includes(kw.toLowerCase()));
}

/** Shallow + one-level-deep key lookup. */
function deepGet(obj: Record<string, unknown>, key: string): unknown {
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const nested = v as Record<string, unknown>;
      if (key in nested) return nested[key];
    }
  }
  return undefined;
}

/** Try to read a finite number from output by key. */
function extractNum(output: Record<string, unknown>, key: string): number | null {
  const v = deepGet(output, key);
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/** Try several candidate keys and return the first finite number found. */
function extractPct(output: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) { const v = extractNum(output, k); if (v !== null) return v; }
  return null;
}

// ============================================================================
// MissingEdgeCaseStrategy
// ============================================================================

/** Checks for missing edge case coverage in test generation and coverage outputs. */
export class MissingEdgeCaseStrategy implements ChallengeStrategy {
  readonly type: ChallengeStrategyType = 'missing-edge-cases';
  readonly applicableTo: readonly ChallengeTargetType[] = ['test-generation', 'coverage-analysis'];

  challenge(target: ChallengeTarget): Challenge[] {
    const out = target.output;
    const cs: Challenge[] = [];

    if (!mentions(out, ['null', 'undefined', 'nil', 'nullable', 'optional'])) {
      cs.push(ch({
        severity: 'high', category: 'missing-edge-case', confidence: 0.85,
        title: 'No null/undefined handling tests detected',
        description: 'No tests or coverage for null/undefined inputs. Null reference errors are among the most common runtime failures.',
        evidence: 'No mentions of null, undefined, nil, nullable, or optional.',
        recommendation: 'Add tests passing null and undefined for every nullable parameter.',
      }));
    }
    if (!mentions(out, ['empty', 'empty array', 'empty list', 'no items', '[]', 'length 0'])) {
      cs.push(ch({
        severity: 'medium', category: 'missing-edge-case', confidence: 0.75,
        title: 'No empty collection tests detected',
        description: 'No coverage for empty collections. Off-by-one and index-out-of-bounds bugs often surface here.',
        evidence: 'No mentions of empty arrays, empty lists, or zero-length collections.',
        recommendation: 'Add tests with empty arrays, empty objects, and empty strings.',
      }));
    }
    if (!mentions(out, ['error', 'exception', 'throw', 'reject', 'failure', 'catch', 'error handling'])) {
      cs.push(ch({
        severity: 'high', category: 'missing-edge-case', confidence: 0.80,
        title: 'No error path tests detected',
        description: 'No tests for error or exception paths. Happy-path-only testing leaves error handling unverified.',
        evidence: 'No mentions of error, exception, throw, reject, or catch.',
        recommendation: 'Add tests that trigger expected errors and verify correct handling.',
      }));
    }

    const testCount = extractNum(out, 'testCount') ?? extractNum(out, 'tests') ?? extractNum(out, 'totalTests');
    const complexity = extractNum(out, 'complexity') ?? extractNum(out, 'cyclomaticComplexity');
    if (testCount !== null && complexity !== null && testCount < complexity) {
      cs.push(ch({
        severity: 'medium', category: 'insufficient-test-count', confidence: 0.65,
        title: 'Test count appears low relative to complexity',
        description: `Found ${testCount} test(s) but complexity is ${complexity}. Test count should meet or exceed cyclomatic complexity for basic path coverage.`,
        evidence: `testCount=${testCount}, complexity=${complexity}`,
        recommendation: 'Add test cases to cover the missing decision paths.',
      }));
    }
    return cs;
  }
}

// ============================================================================
// FalsePositiveDetectionStrategy
// ============================================================================

/** Scrutinizes security scans and defect predictions for false positives. */
export class FalsePositiveDetectionStrategy implements ChallengeStrategy {
  readonly type: ChallengeStrategyType = 'false-positive-detection';
  readonly applicableTo: readonly ChallengeTargetType[] = ['security-scan', 'defect-prediction'];

  challenge(target: ChallengeTarget): Challenge[] {
    const out = target.output;
    const cs: Challenge[] = [];

    const findings = this.extractFindings(out);
    if (findings.length > 0) {
      const lowCount = findings.filter(f => f.severity === 'low' || f.severity === 'info').length;
      const ratio = lowCount / findings.length;
      if (ratio > 0.5) {
        cs.push(ch({
          severity: 'medium', category: 'false-positive', confidence: 0.70,
          title: 'High noise ratio in findings',
          description: `${Math.round(ratio * 100)}% of findings (${lowCount}/${findings.length}) are low/info severity, suggesting excessive false positives.`,
          evidence: `Low/info: ${lowCount}, total: ${findings.length}, ratio: ${ratio.toFixed(2)}`,
          recommendation: 'Triage low-severity findings and tune scan rules to reduce noise.',
        }));
      }
    }

    const scores = this.extractConfidenceScores(out);
    if (scores.length >= 3) {
      const near = scores.filter(c => c >= 0.4 && c <= 0.6);
      const clusterRatio = near.length / scores.length;
      if (clusterRatio > 0.5) {
        cs.push(ch({
          severity: 'high', category: 'false-positive', confidence: 0.75,
          title: 'Confidence scores clustered near decision threshold',
          description: `${Math.round(clusterRatio * 100)}% of scores fall in the 0.4-0.6 range, indicating high uncertainty. Many results may be borderline false positives.`,
          evidence: `Near threshold: ${near.length}/${scores.length}, ratio: ${clusterRatio.toFixed(2)}`,
          recommendation: 'Manually verify findings with confidence 0.4-0.6. Consider raising the threshold.',
        }));
      }
    }

    const generics = ['potential issue', 'possible vulnerability', 'may be vulnerable', 'could be', 'might have', 'generic', 'unspecified'];
    const serialized = JSON.stringify(out).toLowerCase();
    const genericCount = generics.filter(p => serialized.includes(p)).length;
    if (genericCount >= 2) {
      cs.push(ch({
        severity: 'medium', category: 'false-positive', confidence: 0.60,
        title: 'Findings contain vague or generic descriptions',
        description: `Found ${genericCount} generic phrasing patterns. Vague descriptions often indicate unconfirmed issues.`,
        evidence: `Generic patterns matched: ${genericCount}`,
        recommendation: 'Request specific findings with concrete file locations and reproduction steps.',
      }));
    }
    return cs;
  }

  private extractFindings(out: Record<string, unknown>): Array<{ severity?: string }> {
    for (const k of ['findings', 'vulnerabilities', 'issues', 'results', 'defects']) {
      const v = out[k]; if (Array.isArray(v)) return v as Array<{ severity?: string }>;
    }
    return [];
  }

  private extractConfidenceScores(out: Record<string, unknown>): number[] {
    const scores: number[] = [];
    const matches = JSON.stringify(out).match(/"confidence"\s*:\s*([\d.]+)/g);
    if (matches) {
      for (const m of matches) {
        const n = m.match(/([\d.]+)/);
        if (n) { const v = parseFloat(n[1]); if (isFinite(v) && v >= 0 && v <= 1) scores.push(v); }
      }
    }
    return scores;
  }
}

// ============================================================================
// CoverageGapCritiqueStrategy
// ============================================================================

/** Critiques coverage reports for line vs branch discrepancies and untested error handlers. */
export class CoverageGapCritiqueStrategy implements ChallengeStrategy {
  readonly type: ChallengeStrategyType = 'coverage-gap-critique';
  readonly applicableTo: readonly ChallengeTargetType[] = ['coverage-analysis', 'quality-assessment'];

  challenge(target: ChallengeTarget): Challenge[] {
    const out = target.output;
    const cs: Challenge[] = [];
    const line = extractPct(out, ['lineCoverage', 'line', 'lines', 'linePercent']);
    const branch = extractPct(out, ['branchCoverage', 'branch', 'branches', 'branchPercent']);

    if (line !== null && line > 90 && branch === null) {
      cs.push(ch({
        severity: 'high', category: 'incomplete-coverage', confidence: 0.85,
        title: 'High line coverage claimed but branch coverage is missing',
        description: `Line coverage is ${line}% but branch coverage is absent. Line coverage alone can miss untested conditional branches.`,
        evidence: `lineCoverage=${line}%, branchCoverage=not reported`,
        recommendation: 'Include branch coverage. Run tooling with branch analysis enabled.',
      }));
    }
    if (line !== null && branch !== null && line - branch > 15) {
      cs.push(ch({
        severity: 'high', category: 'incomplete-coverage', confidence: 0.80,
        title: 'Significant gap between line and branch coverage',
        description: `Line (${line}%) exceeds branch (${branch}%) by ${(line - branch).toFixed(1)}pp. Many conditional paths remain untested.`,
        evidence: `lineCoverage=${line}%, branchCoverage=${branch}%`,
        recommendation: 'Focus testing on conditional branches. Aim for branch within 10% of line coverage.',
      }));
    }

    const uncoveredMentions = mentions(out, ['uncovered catch', 'untested error', 'uncovered error handler', 'missed catch block']);
    const uncoveredCount = extractNum(out, 'uncoveredBlocks') ?? extractNum(out, 'missedBranches');
    if (uncoveredMentions || (uncoveredCount !== null && uncoveredCount > 0)) {
      cs.push(ch({
        severity: 'medium', category: 'incomplete-coverage', confidence: 0.70,
        title: 'Untested error handlers detected',
        description: 'Error handlers (catch blocks, fallback paths) are not exercised by any test.' + (uncoveredCount !== null ? ` Count: ${uncoveredCount}.` : ''),
        evidence: uncoveredCount !== null ? `uncoveredBlocks/missedBranches=${uncoveredCount}` : 'References to uncovered error handling found.',
        recommendation: 'Write tests that trigger error conditions to exercise catch blocks and fallback logic.',
      }));
    }
    return cs;
  }
}

// ============================================================================
// SecurityBlindSpotStrategy
// ============================================================================

const OWASP_TERMS: Record<string, string[]> = {
  'injection': ['injection', 'sql', 'ldap', 'os command', 'parameterized'],
  'broken-authentication': ['authentication', 'auth', 'login', 'session', 'credential'],
  'sensitive-data-exposure': ['sensitive data', 'encryption', 'pii', 'data exposure', 'plaintext'],
  'xxe': ['xxe', 'xml external', 'xml entity', 'xml parsing'],
  'broken-access-control': ['access control', 'authorization', 'privilege', 'rbac', 'permission'],
  'security-misconfiguration': ['misconfiguration', 'default config', 'hardening', 'headers'],
  'xss': ['xss', 'cross-site scripting', 'script injection', 'html injection'],
  'insecure-deserialization': ['deserialization', 'deserialize', 'serialization', 'marshal'],
  'vulnerable-components': ['cve', 'dependency', 'outdated', 'vulnerable component', 'npm audit'],
  'insufficient-logging': ['logging', 'monitoring', 'audit log', 'log injection'],
};

/** Identifies blind spots in security scan results against OWASP Top 10. */
export class SecurityBlindSpotStrategy implements ChallengeStrategy {
  readonly type: ChallengeStrategyType = 'security-blind-spots';
  readonly applicableTo: readonly ChallengeTargetType[] = ['security-scan'];

  challenge(target: ChallengeTarget): Challenge[] {
    const cs: Challenge[] = [];
    const s = JSON.stringify(target.output).toLowerCase();
    const categories = Object.keys(OWASP_TERMS);
    const covered: string[] = []; const missing: string[] = [];

    for (const cat of categories) {
      (OWASP_TERMS[cat].some(t => s.includes(t)) ? covered : missing).push(cat);
    }
    if (missing.length > 0) {
      const pct = Math.round((covered.length / categories.length) * 100);
      const sev = missing.length > 5 ? 'critical' as const : missing.length > 3 ? 'high' as const : 'medium' as const;
      cs.push(ch({
        severity: sev, category: 'security-blind-spot', confidence: 0.80,
        title: `${missing.length} OWASP categories not addressed`,
        description: `Scan covers ${pct}% of OWASP Top 10 (${covered.length}/${categories.length}). Missing: ${missing.join(', ')}.`,
        evidence: `Covered: [${covered.join(', ')}]. Missing: [${missing.join(', ')}].`,
        recommendation: 'Expand the scan to cover all OWASP Top 10 categories.',
      }));
    }
    if (!['auth', 'login', 'session', 'token', 'jwt'].some(t => s.includes(t))) {
      cs.push(ch({
        severity: 'high', category: 'security-blind-spot', confidence: 0.75,
        title: 'No authentication testing detected',
        description: 'No references to authentication, session management, or token handling. Auth flaws are among the most exploited vulnerabilities.',
        evidence: 'No mentions of auth, login, session, token, or JWT.',
        recommendation: 'Add auth testing: brute force, session fixation, token expiry, credential storage.',
      }));
    }
    if (!['injection', 'sql', 'command injection', 'parameterized', 'sanitiz'].some(t => s.includes(t))) {
      cs.push(ch({
        severity: 'critical', category: 'security-blind-spot', confidence: 0.85,
        title: 'No injection testing detected',
        description: 'No references to injection testing (SQL, command, LDAP). Injection remains the top web vulnerability.',
        evidence: 'No mentions of injection, SQL, parameterized queries, or sanitization.',
        recommendation: 'Run injection tests against all user-input entry points.',
      }));
    }
    return cs;
  }
}

// ============================================================================
// AssumptionQuestioningStrategy
// ============================================================================

/** Questions unstated assumptions in requirements and quality assessments. */
export class AssumptionQuestioningStrategy implements ChallengeStrategy {
  readonly type: ChallengeStrategyType = 'assumption-questioning';
  readonly applicableTo: readonly ChallengeTargetType[] = ['requirements', 'quality-assessment'];

  challenge(target: ChallengeTarget): Challenge[] {
    const out = target.output;
    const cs: Challenge[] = [];

    if (!mentions(out, ['performance', 'scalability', 'availability', 'latency', 'throughput', 'capacity', 'reliability'])) {
      cs.push(ch({
        severity: 'medium', category: 'unstated-assumption', confidence: 0.70,
        title: 'No non-functional requirements addressed',
        description: 'No mention of performance, scalability, or availability. Functional correctness alone does not guarantee production readiness.',
        evidence: 'No NFR keywords found in output.',
        recommendation: 'Define target latency, throughput, availability SLAs, and capacity limits.',
      }));
    }
    if (!mentions(out, ['failure', 'error', 'edge case', 'boundary', 'exception', 'timeout', 'retry', 'fallback', 'degraded'])) {
      cs.push(ch({
        severity: 'high', category: 'unstated-assumption', confidence: 0.75,
        title: 'Assessment appears to cover only happy paths',
        description: 'No references to failure modes, error conditions, or degraded operation. Only the ideal success scenario was considered.',
        evidence: 'No mentions of failure, error, edge case, timeout, retry, or fallback.',
        recommendation: 'Assess behavior under failure: network errors, timeouts, partial failures, invalid inputs.',
      }));
    }
    if (!mentions(out, ['environment', 'production', 'staging', 'configuration', 'env var', 'config', 'deployment'])) {
      cs.push(ch({
        severity: 'low', category: 'unstated-assumption', confidence: 0.55,
        title: 'No environment or configuration context specified',
        description: 'No mention of which environment or configuration the assessment applies to. Results may not transfer across environments.',
        evidence: 'No environment/configuration keywords found.',
        recommendation: 'Specify target environment and note environment-specific assumptions.',
      }));
    }
    return cs;
  }
}

// ============================================================================
// BoundaryValueGapStrategy
// ============================================================================

/** Checks for missing boundary value tests in test generation and contract validation. */
export class BoundaryValueGapStrategy implements ChallengeStrategy {
  readonly type: ChallengeStrategyType = 'boundary-value-gaps';
  readonly applicableTo: readonly ChallengeTargetType[] = ['test-generation', 'contract-validation'];

  challenge(target: ChallengeTarget): Challenge[] {
    const out = target.output;
    const cs: Challenge[] = [];

    if (!mentions(out, ['minimum', 'maximum', 'min value', 'max value', 'boundary', 'limit'])) {
      cs.push(ch({
        severity: 'high', category: 'boundary-value-gap', confidence: 0.80,
        title: 'No boundary value tests detected',
        description: 'No tests for min/max values. Off-by-one errors and overflow bugs surface at boundaries.',
        evidence: 'No mentions of minimum, maximum, boundary, or limit.',
        recommendation: 'Add tests for min valid, max valid, one below min, one above max.',
      }));
    }
    if (!mentions(out, ['zero', 'negative', '-1', 'minus'])) {
      cs.push(ch({
        severity: 'medium', category: 'boundary-value-gap', confidence: 0.75,
        title: 'No zero or negative value tests detected',
        description: 'No tests for zero or negative inputs. Division by zero and sign errors are common.',
        evidence: 'No mentions of zero, negative, -1, or minus.',
        recommendation: 'Add tests with zero, negative one, and large negative values.',
      }));
    }
    if (!mentions(out, ['overflow', 'underflow', 'max_safe_integer', 'number.max', 'int_max', 'large number'])) {
      cs.push(ch({
        severity: 'medium', category: 'boundary-value-gap', confidence: 0.65,
        title: 'No overflow/underflow tests detected',
        description: 'No tests for numeric overflow or underflow. Can cause silent data corruption.',
        evidence: 'No mentions of overflow, underflow, or MAX_SAFE_INTEGER.',
        recommendation: 'Add tests with MAX_SAFE_INTEGER, MIN_SAFE_INTEGER, Infinity, -Infinity, NaN.',
      }));
    }
    if (!mentions(out, ['empty string', 'long string', 'max length', 'truncat', 'string length'])) {
      cs.push(ch({
        severity: 'low', category: 'boundary-value-gap', confidence: 0.60,
        title: 'No string length boundary tests detected',
        description: 'No tests for string length boundaries. Empty/long strings can reveal buffer and validation gaps.',
        evidence: 'No mentions of empty string, long string, max length, or truncation.',
        recommendation: 'Add tests with empty, single-char, max-length, and over-length strings.',
      }));
    }
    return cs;
  }
}

// ============================================================================
// ErrorHandlingGapStrategy
// ============================================================================

/** Checks for missing error scenario tests in test generation output. */
export class ErrorHandlingGapStrategy implements ChallengeStrategy {
  readonly type: ChallengeStrategyType = 'error-handling-gaps';
  readonly applicableTo: readonly ChallengeTargetType[] = ['test-generation'];

  challenge(target: ChallengeTarget): Challenge[] {
    const out = target.output;
    const cs: Challenge[] = [];

    if (!mentions(out, ['timeout', 'timed out', 'deadline', 'abort'])) {
      cs.push(ch({
        severity: 'medium', category: 'error-handling-gap', confidence: 0.70,
        title: 'No timeout scenario tests detected',
        description: 'No tests for timeout conditions. External service calls can hang without proper timeouts.',
        evidence: 'No mentions of timeout, timed out, deadline, or abort.',
        recommendation: 'Add tests simulating timeouts for network calls and I/O operations.',
      }));
    }
    if (!mentions(out, ['network error', 'connection refused', 'econnrefused', 'dns', 'socket', 'offline'])) {
      cs.push(ch({
        severity: 'medium', category: 'error-handling-gap', confidence: 0.65,
        title: 'No network error scenario tests detected',
        description: 'No tests for network failures. Connection errors should be handled gracefully.',
        evidence: 'No mentions of network error, connection refused, DNS, or socket.',
        recommendation: 'Add tests simulating connection refused, DNS failure, and connection reset.',
      }));
    }
    if (!mentions(out, ['memory', 'disk', 'resource exhaustion', 'out of memory', 'oom', 'file descriptor'])) {
      cs.push(ch({
        severity: 'low', category: 'error-handling-gap', confidence: 0.50,
        title: 'No resource exhaustion tests detected',
        description: 'No tests for resource exhaustion. Memory pressure and disk limits cause subtle production failures.',
        evidence: 'No mentions of memory, disk, OOM, or file descriptor.',
        recommendation: 'Add tests for degradation under resource pressure.',
      }));
    }
    if (!mentions(out, ['concurrent', 'race condition', 'deadlock', 'parallel', 'thread safety'])) {
      cs.push(ch({
        severity: 'medium', category: 'error-handling-gap', confidence: 0.60,
        title: 'No concurrency error tests detected',
        description: 'No tests for concurrent access. Race conditions and deadlocks are hard to debug in production.',
        evidence: 'No mentions of concurrent, race condition, deadlock, or parallel.',
        recommendation: 'Add tests for simultaneous reads/writes, competing updates, and lock contention.',
      }));
    }
    return cs;
  }
}

// ============================================================================
// Strategy Registry
// ============================================================================

/** Create all built-in challenge strategies. */
export function createAllStrategies(): ChallengeStrategy[] {
  return [
    new MissingEdgeCaseStrategy(),
    new FalsePositiveDetectionStrategy(),
    new CoverageGapCritiqueStrategy(),
    new SecurityBlindSpotStrategy(),
    new AssumptionQuestioningStrategy(),
    new BoundaryValueGapStrategy(),
    new ErrorHandlingGapStrategy(),
  ];
}

/** Get strategies applicable to a given target type. */
export function getApplicableStrategies(
  strategies: readonly ChallengeStrategy[],
  targetType: ChallengeTargetType,
): ChallengeStrategy[] {
  return strategies.filter(s => s.applicableTo.includes(targetType));
}
