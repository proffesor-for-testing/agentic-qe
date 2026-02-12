/**
 * Agentic QE v3 - QE ReasoningBank
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * QE-specific pattern learning system that extends the concept from
 * claude-flow's ReasoningBank with quality engineering domains.
 *
 * Features:
 * - 8 QE domains for pattern classification
 * - HNSW vector indexing (150x faster search)
 * - Pattern quality scoring with outcome tracking
 * - Short-term to long-term promotion (3+ successful uses)
 * - Domain-specific guidance generation
 * - Agent routing via pattern similarity
 */

import { v4 as uuidv4 } from 'uuid';
import type { MemoryBackend, EventBus } from '../kernel/interfaces.js';
import type { Result, DomainName } from '../shared/types/index.js';
import { ok, err } from '../shared/types/index.js';
import {
  QEPattern,
  QEPatternContext,
  QEPatternType,
  QEDomain,
  ProgrammingLanguage,
  TestFramework,
  CreateQEPatternOptions,
  detectQEDomain,
  detectQEDomains,
  mapQEDomainToAQE,
  applyPatternTemplate,
  QE_DOMAIN_LIST,
  PromotionCheck,
  shouldPromotePattern,
} from './qe-patterns.js';
import {
  QEGuidance,
  getGuidance,
  getCombinedGuidance,
  generateGuidanceContext,
  checkAntiPatterns,
} from './qe-guidance.js';
import {
  PatternStore,
  PatternSearchOptions,
  PatternSearchResult,
  createPatternStore,
} from './pattern-store.js';

// ============================================================================
// QEReasoningBank Configuration
// ============================================================================

/**
 * QEReasoningBank configuration
 */
export interface QEReasoningBankConfig {
  /** Enable pattern learning */
  enableLearning: boolean;

  /** Enable guidance generation */
  enableGuidance: boolean;

  /** Enable task routing */
  enableRouting: boolean;

  /** Embedding dimension (must match HNSW config) */
  embeddingDimension: number;

  /** Use ONNX embeddings (when available) */
  useONNXEmbeddings: boolean;

  /** Maximum patterns to consider for routing */
  maxRoutingCandidates: number;

  /** Weights for routing score calculation */
  routingWeights: {
    similarity: number;
    performance: number;
    capabilities: number;
  };

  /** Pattern store configuration */
  patternStore?: Partial<import('./pattern-store.js').PatternStoreConfig>;

  /** Coherence energy threshold for pattern promotion (ADR-052) */
  coherenceThreshold?: number;
}

/**
 * Default configuration
 */
export const DEFAULT_QE_REASONING_BANK_CONFIG: QEReasoningBankConfig = {
  enableLearning: true,
  enableGuidance: true,
  enableRouting: true,
  embeddingDimension: 128,
  useONNXEmbeddings: true, // ADR-051: Enable ONNX embeddings by default
  maxRoutingCandidates: 10,
  routingWeights: {
    similarity: 0.3,
    performance: 0.4,
    capabilities: 0.3,
  },
  coherenceThreshold: 0.4, // ADR-052: Coherence gate threshold
};

// ============================================================================
// Routing Types
// ============================================================================

/**
 * Task routing request
 */
export interface QERoutingRequest {
  /** Task description */
  task: string;

  /** Task type hint */
  taskType?: 'test-generation' | 'analysis' | 'debugging' | 'optimization';

  /** Target domain hint */
  domain?: QEDomain;

  /** Required capabilities */
  capabilities?: string[];

  /** Context for matching */
  context?: Partial<QEPatternContext>;
}

/**
 * Task routing result
 */
export interface QERoutingResult {
  /** Recommended agent type */
  recommendedAgent: string;

  /** Confidence in recommendation (0-1) */
  confidence: number;

  /** Alternative agent recommendations */
  alternatives: Array<{ agent: string; score: number }>;

  /** Detected QE domains */
  domains: QEDomain[];

  /** Relevant patterns found */
  patterns: QEPattern[];

  /** Generated guidance */
  guidance: string[];

  /** Reasoning for the recommendation */
  reasoning: string;
}

/**
 * Pattern learning outcome
 */
export interface LearningOutcome {
  /** Pattern ID that was used */
  patternId: string;

  /** Whether the application was successful */
  success: boolean;

  /** Quality metrics from the outcome */
  metrics?: {
    testsPassed?: number;
    testsFailed?: number;
    coverageImprovement?: number;
    executionTimeMs?: number;
  };

  /** Feedback from the agent or user */
  feedback?: string;
}

/**
 * Pattern promotion blocked event (ADR-052)
 */
export interface PromotionBlockedEvent {
  patternId: string;
  patternName: string;
  reason: 'coherence_violation' | 'insufficient_usage' | 'low_quality';
  energy?: number;
  existingPatternConflicts?: string[];
}

// ============================================================================
// QEReasoningBank Interface
// ============================================================================

/**
 * QEReasoningBank interface
 */
export interface IQEReasoningBank {
  /** Initialize the reasoning bank */
  initialize(): Promise<void>;

  /** Store a new pattern */
  storePattern(options: CreateQEPatternOptions): Promise<Result<QEPattern>>;

  /** Search for patterns */
  searchPatterns(
    query: string | number[],
    options?: PatternSearchOptions
  ): Promise<Result<PatternSearchResult[]>>;

  /** Get pattern by ID */
  getPattern(id: string): Promise<QEPattern | null>;

  /** Record pattern usage outcome */
  recordOutcome(outcome: LearningOutcome): Promise<Result<void>>;

  /** Route a task to optimal agent */
  routeTask(request: QERoutingRequest): Promise<Result<QERoutingResult>>;

  /** Get guidance for a domain */
  getGuidance(domain: QEDomain, context?: Partial<QEPatternContext>): QEGuidance;

  /** Generate guidance context for Claude */
  generateContext(
    domain: QEDomain,
    context?: { framework?: TestFramework; language?: ProgrammingLanguage }
  ): string;

  /** Check for anti-patterns in content */
  checkAntiPatterns(domain: QEDomain, content: string): ReturnType<typeof checkAntiPatterns>;

  /** Get embedding for text */
  embed(text: string): Promise<number[]>;

  /** Seed cross-domain patterns by transferring from populated domains to related ones */
  seedCrossDomainPatterns(): Promise<{ transferred: number; skipped: number }>;

  /** Get statistics */
  getStats(): Promise<QEReasoningBankStats>;

  /** Dispose the reasoning bank */
  dispose(): Promise<void>;
}

/**
 * QEReasoningBank statistics
 */
export interface QEReasoningBankStats {
  /** Total patterns */
  totalPatterns: number;

  /** Patterns by domain */
  byDomain: Record<QEDomain, number>;

  /** Routing requests served */
  routingRequests: number;

  /** Average routing confidence */
  avgRoutingConfidence: number;

  /** Learning outcomes recorded */
  learningOutcomes: number;

  /** Pattern success rate */
  patternSuccessRate: number;

  /** Pattern store stats */
  patternStoreStats: import('./pattern-store.js').PatternStoreStats;
}

// ============================================================================
// QEReasoningBank Implementation
// ============================================================================

/**
 * QE ReasoningBank - Pattern learning for quality engineering
 *
 * @example
 * ```typescript
 * const bank = new QEReasoningBank(memory);
 * await bank.initialize();
 *
 * // Store a pattern
 * await bank.storePattern({
 *   patternType: 'test-template',
 *   name: 'AAA Unit Test',
 *   description: 'Arrange-Act-Assert pattern for unit tests',
 *   template: { type: 'code', content: '...', variables: [] },
 * });
 *
 * // Route a task
 * const routing = await bank.routeTask({
 *   task: 'Generate unit tests for UserService',
 *   context: { language: 'typescript', framework: 'vitest' },
 * });
 * ```
 */
export class QEReasoningBank implements IQEReasoningBank {
  private readonly config: QEReasoningBankConfig;
  private patternStore: PatternStore;
  private initialized = false;

  // Statistics
  private stats = {
    routingRequests: 0,
    totalRoutingConfidence: 0,
    learningOutcomes: 0,
    successfulOutcomes: 0,
  };

  // Agent capability mapping (QE agents)
  private readonly agentCapabilities: Record<string, {
    domains: QEDomain[];
    capabilities: string[];
    performanceScore: number;
  }> = {
    'qe-test-generator': {
      domains: ['test-generation'],
      capabilities: ['test-generation', 'tdd', 'bdd', 'unit-test', 'integration-test'],
      performanceScore: 0.85,
    },
    'qe-coverage-analyzer': {
      domains: ['coverage-analysis'],
      capabilities: ['coverage-analysis', 'gap-detection', 'risk-scoring'],
      performanceScore: 0.92,
    },
    'qe-coverage-specialist': {
      domains: ['coverage-analysis'],
      capabilities: ['sublinear-analysis', 'branch-coverage', 'mutation-testing'],
      performanceScore: 0.88,
    },
    'qe-test-architect': {
      domains: ['test-generation', 'coverage-analysis'],
      capabilities: ['test-strategy', 'test-pyramid', 'architecture'],
      performanceScore: 0.9,
    },
    'qe-api-contract-validator': {
      domains: ['contract-testing'],
      capabilities: ['contract-testing', 'openapi', 'graphql', 'pact'],
      performanceScore: 0.87,
    },
    'qe-security-auditor': {
      domains: ['security-compliance'],
      capabilities: ['sast', 'dast', 'vulnerability', 'owasp'],
      performanceScore: 0.82,
    },
    'qe-visual-tester': {
      domains: ['visual-accessibility'],
      capabilities: ['screenshot', 'visual-regression', 'percy', 'chromatic'],
      performanceScore: 0.8,
    },
    'qe-a11y-ally': {
      domains: ['visual-accessibility'],
      capabilities: ['wcag', 'aria', 'screen-reader', 'contrast'],
      performanceScore: 0.85,
    },
    'qe-performance-tester': {
      domains: ['chaos-resilience'],
      capabilities: ['load-testing', 'stress-testing', 'k6', 'artillery'],
      performanceScore: 0.83,
    },
    'qe-flaky-investigator': {
      domains: ['test-execution'],
      capabilities: ['flaky-detection', 'test-stability', 'retry'],
      performanceScore: 0.78,
    },
    'qe-chaos-engineer': {
      domains: ['chaos-resilience'],
      capabilities: ['chaos-testing', 'resilience', 'fault-injection'],
      performanceScore: 0.75,
    },
  };

  constructor(
    private readonly memory: MemoryBackend,
    private readonly eventBus?: EventBus,
    config: Partial<QEReasoningBankConfig> = {},
    private readonly coherenceService?: import('../integrations/coherence/coherence-service.js').ICoherenceService
  ) {
    this.config = { ...DEFAULT_QE_REASONING_BANK_CONFIG, ...config };
    this.patternStore = createPatternStore(memory, {
      embeddingDimension: this.config.embeddingDimension,
      ...config.patternStore,
    });
  }

  /**
   * Initialize the reasoning bank
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.patternStore.initialize();

    // Load any pre-trained patterns
    await this.loadPretrainedPatterns();

    this.initialized = true;

    // Run cross-domain transfer after initialization to enrich related domains
    try {
      await this.seedCrossDomainPatterns();
    } catch (error) {
      console.warn('[QEReasoningBank] Cross-domain seeding failed (non-fatal):', error);
    }

    console.log('[QEReasoningBank] Initialized');
  }

  /**
   * Load pre-trained patterns for common QE scenarios
   */
  private async loadPretrainedPatterns(): Promise<void> {
    // Check if we already have patterns
    const stats = await this.patternStore.getStats();
    if (stats.totalPatterns > 0) {
      console.log(`[QEReasoningBank] Found ${stats.totalPatterns} existing patterns`);
      return;
    }

    // Add foundational patterns
    const foundationalPatterns: CreateQEPatternOptions[] = [
      {
        patternType: 'test-template',
        name: 'AAA Unit Test',
        description: 'Arrange-Act-Assert pattern for clear, maintainable unit tests',
        template: {
          type: 'code',
          content: `describe('{{className}}', () => {
  describe('{{methodName}}', () => {
    it('should {{expectedBehavior}}', {{async}} () => {
      // Arrange
      {{arrangeCode}}

      // Act
      {{actCode}}

      // Assert
      {{assertCode}}
    });
  });
});`,
          variables: [
            { name: 'className', type: 'string', required: true, description: 'Class under test' },
            { name: 'methodName', type: 'string', required: true, description: 'Method under test' },
            { name: 'expectedBehavior', type: 'string', required: true, description: 'Expected behavior in plain English' },
            { name: 'async', type: 'string', required: false, defaultValue: '', description: 'async keyword if needed' },
            { name: 'arrangeCode', type: 'code', required: true, description: 'Setup code' },
            { name: 'actCode', type: 'code', required: true, description: 'Action code' },
            { name: 'assertCode', type: 'code', required: true, description: 'Assertion code' },
          ],
        },
        context: {
          testType: 'unit',
          tags: ['unit-test', 'aaa', 'arrange-act-assert', 'best-practice'],
        },
      },
      {
        patternType: 'mock-pattern',
        name: 'Dependency Mock',
        description: 'Pattern for mocking external dependencies in tests',
        template: {
          type: 'code',
          content: `const mock{{DependencyName}} = {
  {{mockMethods}}
};

vi.mock('{{modulePath}}', () => ({
  {{DependencyName}}: vi.fn(() => mock{{DependencyName}}),
}));`,
          variables: [
            { name: 'DependencyName', type: 'string', required: true, description: 'Name of dependency to mock' },
            { name: 'modulePath', type: 'string', required: true, description: 'Module path to mock' },
            { name: 'mockMethods', type: 'code', required: true, description: 'Mock method implementations' },
          ],
        },
        context: {
          framework: 'vitest',
          testType: 'unit',
          tags: ['mock', 'vitest', 'dependency-injection'],
        },
      },
      {
        patternType: 'coverage-strategy',
        name: 'Risk-Based Coverage',
        description: 'Prioritize coverage by code risk and complexity',
        template: {
          type: 'prompt',
          content: `Analyze coverage gaps for {{targetPath}} with focus on:
1. Critical business logic paths
2. Error handling branches
3. Edge cases and boundary conditions
4. High-complexity functions (cyclomatic complexity > 10)

Risk scoring:
- Critical: Business logic, auth, payments
- High: Data validation, external integrations
- Medium: Internal utilities, helpers
- Low: Config, constants`,
          variables: [
            { name: 'targetPath', type: 'string', required: true, description: 'Path to analyze' },
          ],
        },
        context: {
          tags: ['coverage', 'risk-based', 'prioritization'],
        },
      },
      {
        patternType: 'flaky-fix',
        name: 'Timing-Based Flakiness',
        description: 'Fix flaky tests caused by timing issues',
        template: {
          type: 'prompt',
          content: `The test {{testName}} is flaky due to timing issues.

Common fixes:
1. Replace setTimeout with explicit waits
2. Use waitFor or waitForCondition
3. Mock time-dependent functions
4. Increase timeouts for async operations
5. Add retry logic with exponential backoff

Check for:
- Race conditions in async code
- Missing await keywords
- Shared state between tests
- External service dependencies`,
          variables: [
            { name: 'testName', type: 'string', required: true, description: 'Name of flaky test' },
          ],
        },
        context: {
          tags: ['flaky', 'timing', 'async', 'stability'],
        },
      },

      // ================================================================
      // quality-assessment domain seeds
      // ================================================================
      {
        patternType: 'assertion-pattern',
        qeDomain: 'quality-assessment',
        name: 'Quality Gate Checklist',
        description: 'Evaluate deployment readiness against quality gate criteria',
        template: {
          type: 'prompt',
          content: `Quality gate evaluation for {{targetModule}}:

1. Test coverage >= {{coverageThreshold}}%
2. No critical/high severity bugs open
3. All P1 tests passing
4. Performance benchmarks within SLA (p95 < {{latencyThresholdMs}}ms)
5. Security scan clean (no critical CVEs)
6. Code review approved

Fail the gate if ANY criterion is unmet. Report which criteria passed/failed.`,
          variables: [
            { name: 'targetModule', type: 'string', required: true, description: 'Module or service to evaluate' },
            { name: 'coverageThreshold', type: 'number', required: false, defaultValue: 80, description: 'Minimum coverage %' },
            { name: 'latencyThresholdMs', type: 'number', required: false, defaultValue: 500, description: 'P95 latency limit in ms' },
          ],
        },
        context: {
          tags: ['quality-gate', 'deployment', 'readiness', 'sla'],
        },
        confidence: 0.6,
      },
      {
        patternType: 'assertion-pattern',
        qeDomain: 'quality-assessment',
        name: 'Metric Threshold Validator',
        description: 'Validate quality metrics against configurable thresholds',
        template: {
          type: 'code',
          content: `function validateMetrics(metrics: Record<string, number>, thresholds: Record<string, { min?: number; max?: number }>) {
  const violations: string[] = [];
  for (const [metric, value] of Object.entries(metrics)) {
    const threshold = thresholds[metric];
    if (!threshold) continue;
    if (threshold.min !== undefined && value < threshold.min) {
      violations.push(\`\${metric}: \${value} < min \${threshold.min}\`);
    }
    if (threshold.max !== undefined && value > threshold.max) {
      violations.push(\`\${metric}: \${value} > max \${threshold.max}\`);
    }
  }
  return { pass: violations.length === 0, violations };
}`,
          variables: [],
        },
        context: {
          tags: ['metrics', 'threshold', 'validation', 'scoring'],
        },
        confidence: 0.6,
      },

      // ================================================================
      // defect-intelligence domain seeds
      // ================================================================
      {
        patternType: 'error-handling',
        qeDomain: 'defect-intelligence',
        name: 'Root Cause Analysis Workflow',
        description: 'Systematic root cause analysis for test failures and production incidents',
        template: {
          type: 'prompt',
          content: `Root cause analysis for: {{incidentDescription}}

1. **Reproduce**: Confirm the failure is deterministic
2. **Isolate**: Narrow down to the smallest failing component
3. **Timeline**: When did it last pass? What changed since?
4. **Categorize**: Is it a code bug, config issue, data issue, or environment?
5. **Five Whys**: Ask why at least 5 times to reach the root cause
6. **Fix**: Propose fix with test to prevent regression
7. **Verify**: Run the fix and confirm the original failure is resolved`,
          variables: [
            { name: 'incidentDescription', type: 'string', required: true, description: 'Description of the failure or incident' },
          ],
        },
        context: {
          tags: ['root-cause', 'rca', 'debugging', 'incident'],
        },
        confidence: 0.6,
      },
      {
        patternType: 'error-handling',
        qeDomain: 'defect-intelligence',
        name: 'Regression Risk Scorer',
        description: 'Score change risk for regression based on code complexity and history',
        template: {
          type: 'prompt',
          content: `Regression risk assessment for {{changePath}}:

Risk factors (score each 0-3):
- Lines changed: {{linesChanged}} → complexity risk
- Files affected: {{filesAffected}} → blast radius
- Previous bugs in area: historical defect density
- Test coverage of changed code: gap risk
- Dependency depth: cascade risk

Total risk = sum / 15 → Low (<0.3), Medium (0.3-0.6), High (>0.6)`,
          variables: [
            { name: 'changePath', type: 'string', required: true, description: 'File or module changed' },
            { name: 'linesChanged', type: 'number', required: true, description: 'Number of lines changed' },
            { name: 'filesAffected', type: 'number', required: true, description: 'Number of files affected' },
          ],
        },
        context: {
          tags: ['regression', 'risk', 'prediction', 'change-analysis'],
        },
        confidence: 0.6,
      },

      // ================================================================
      // requirements-validation domain seeds
      // ================================================================
      {
        patternType: 'test-template',
        qeDomain: 'requirements-validation',
        name: 'Gherkin BDD Scenario',
        description: 'Behavior-driven development scenario in Given/When/Then format',
        template: {
          type: 'code',
          content: `Feature: {{featureName}}

  Scenario: {{scenarioDescription}}
    Given {{precondition}}
    When {{action}}
    Then {{expectedOutcome}}

  Scenario: {{scenarioDescription}} - error case
    Given {{precondition}}
    When {{errorAction}}
    Then {{errorOutcome}}`,
          variables: [
            { name: 'featureName', type: 'string', required: true, description: 'Feature under test' },
            { name: 'scenarioDescription', type: 'string', required: true, description: 'What the scenario validates' },
            { name: 'precondition', type: 'string', required: true, description: 'Given precondition' },
            { name: 'action', type: 'string', required: true, description: 'When action' },
            { name: 'expectedOutcome', type: 'string', required: true, description: 'Then expected result' },
            { name: 'errorAction', type: 'string', required: true, description: 'When error action' },
            { name: 'errorOutcome', type: 'string', required: true, description: 'Then error result' },
          ],
        },
        context: {
          tags: ['bdd', 'gherkin', 'requirements', 'acceptance'],
        },
        confidence: 0.6,
      },
      {
        patternType: 'test-template',
        qeDomain: 'requirements-validation',
        name: 'Acceptance Criteria Testability Check',
        description: 'Evaluate whether acceptance criteria are testable and complete',
        template: {
          type: 'prompt',
          content: `Testability assessment for: {{requirementId}} - {{requirementTitle}}

Acceptance criteria:
{{acceptanceCriteria}}

Evaluate each criterion:
1. **Observable**: Can we verify the outcome without internal knowledge?
2. **Measurable**: Is there a quantifiable threshold or clear pass/fail?
3. **Atomic**: Does each criterion test exactly one thing?
4. **Achievable**: Can this be tested with available tools?
5. **Complete**: Are edge cases and error paths covered?

Flag any untestable or ambiguous criteria with suggested rewrites.`,
          variables: [
            { name: 'requirementId', type: 'string', required: true, description: 'Requirement identifier' },
            { name: 'requirementTitle', type: 'string', required: true, description: 'Requirement title' },
            { name: 'acceptanceCriteria', type: 'string', required: true, description: 'The acceptance criteria text' },
          ],
        },
        context: {
          tags: ['requirements', 'testability', 'acceptance-criteria', 'validation'],
        },
        confidence: 0.6,
      },

      // ================================================================
      // code-intelligence domain seeds
      // ================================================================
      {
        patternType: 'refactor-safe',
        name: 'Safe Refactoring Checklist',
        description: 'Ensure refactoring preserves behavior with systematic safety checks',
        template: {
          type: 'prompt',
          content: `Safe refactoring checklist for {{targetPath}}:

Before refactoring:
1. Run existing tests — capture baseline results
2. Check coverage of code being refactored
3. Identify all callers and dependents via references

During refactoring:
4. Make one semantic change at a time
5. Keep public API signatures stable (or update all callers)
6. Preserve error handling contracts

After refactoring:
7. Run full test suite — compare to baseline
8. Check for any new uncovered paths
9. Verify no unused imports or dead code introduced`,
          variables: [
            { name: 'targetPath', type: 'string', required: true, description: 'Path to refactor' },
          ],
        },
        context: {
          tags: ['refactor', 'safety', 'code-change', 'impact'],
        },
        confidence: 0.6,
      },
      {
        patternType: 'refactor-safe',
        name: 'Dependency Impact Analysis',
        description: 'Analyze the blast radius of a code change through the dependency graph',
        template: {
          type: 'prompt',
          content: `Impact analysis for changes in {{changedFile}}:

1. Direct dependents: files that import/require {{changedFile}}
2. Transitive dependents: files that depend on direct dependents
3. Test coverage: which tests exercise the changed code?
4. Integration points: does this affect API contracts or events?
5. Risk tier: Critical (auth/payments) > High (business logic) > Medium (utils)

Output: sorted list of affected files with risk scores.`,
          variables: [
            { name: 'changedFile', type: 'string', required: true, description: 'File being changed' },
          ],
        },
        context: {
          tags: ['impact', 'dependency', 'blast-radius', 'analysis'],
        },
        confidence: 0.6,
      },

      // ================================================================
      // security-compliance domain seeds
      // ================================================================
      {
        patternType: 'assertion-pattern',
        qeDomain: 'security-compliance',
        name: 'OWASP Top 10 Security Audit',
        description: 'Check code against OWASP Top 10 vulnerability categories',
        template: {
          type: 'prompt',
          content: `Security audit for {{targetPath}} against OWASP Top 10:

1. **A01 Broken Access Control**: Check authorization on every endpoint
2. **A02 Cryptographic Failures**: No plaintext secrets, proper hashing
3. **A03 Injection**: Parameterized queries, input sanitization
4. **A04 Insecure Design**: Threat modeling, least privilege
5. **A05 Security Misconfiguration**: Default creds, verbose errors
6. **A06 Vulnerable Components**: Check dependencies for CVEs
7. **A07 Auth Failures**: Brute force protection, session management
8. **A08 Data Integrity Failures**: Verify signatures, safe deserialization
9. **A09 Logging Failures**: Audit trail, no sensitive data in logs
10. **A10 SSRF**: Validate/allowlist outbound URLs

Flag findings as Critical/High/Medium/Low with remediation guidance.`,
          variables: [
            { name: 'targetPath', type: 'string', required: true, description: 'Code path to audit' },
          ],
        },
        context: {
          tags: ['owasp', 'security', 'audit', 'vulnerability'],
        },
        confidence: 0.6,
      },
      {
        patternType: 'assertion-pattern',
        qeDomain: 'security-compliance',
        name: 'Input Sanitization Pattern',
        description: 'Validate and sanitize inputs at system boundaries to prevent injection',
        template: {
          type: 'code',
          content: `// Input validation at system boundary
function validateInput(input: unknown, schema: {
  type: 'string' | 'number' | 'boolean';
  maxLength?: number;
  pattern?: RegExp;
  allowedValues?: unknown[];
}): { valid: boolean; sanitized: unknown; errors: string[] } {
  const errors: string[] = [];
  if (typeof input !== schema.type) {
    errors.push(\`Expected \${schema.type}, got \${typeof input}\`);
    return { valid: false, sanitized: null, errors };
  }
  if (schema.type === 'string') {
    let str = input as string;
    if (schema.maxLength && str.length > schema.maxLength) {
      str = str.slice(0, schema.maxLength);
      errors.push('Input truncated to max length');
    }
    if (schema.pattern && !schema.pattern.test(str)) {
      errors.push('Input does not match expected pattern');
      return { valid: false, sanitized: null, errors };
    }
    return { valid: errors.length === 0, sanitized: str, errors };
  }
  return { valid: true, sanitized: input, errors };
}`,
          variables: [],
        },
        context: {
          tags: ['security', 'validation', 'sanitization', 'injection-prevention'],
        },
        confidence: 0.6,
      },

      // ================================================================
      // contract-testing domain seeds
      // ================================================================
      {
        patternType: 'api-contract',
        name: 'OpenAPI Contract Validator',
        description: 'Validate API responses against OpenAPI/Swagger schema',
        template: {
          type: 'code',
          content: `describe('{{apiEndpoint}} contract', () => {
  it('should match the OpenAPI schema for {{operationId}}', async () => {
    const response = await request(app).{{httpMethod}}('{{apiEndpoint}}');
    expect(response.status).toBe({{expectedStatus}});
    expect(response.body).toMatchSchema(openApiSpec.paths['{{apiEndpoint}}'].{{httpMethod}}.responses['{{expectedStatus}}'].content['application/json'].schema);
  });

  it('should return proper error for invalid input', async () => {
    const response = await request(app).{{httpMethod}}('{{apiEndpoint}}').send({{invalidPayload}});
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('errors');
  });
});`,
          variables: [
            { name: 'apiEndpoint', type: 'string', required: true, description: 'API endpoint path' },
            { name: 'operationId', type: 'string', required: true, description: 'OpenAPI operation ID' },
            { name: 'httpMethod', type: 'string', required: true, description: 'HTTP method (get/post/put/delete)' },
            { name: 'expectedStatus', type: 'number', required: true, description: 'Expected HTTP status code' },
            { name: 'invalidPayload', type: 'object', required: true, description: 'Invalid request body for error case' },
          ],
        },
        context: {
          tags: ['api', 'contract', 'openapi', 'schema-validation'],
        },
        confidence: 0.6,
      },
      {
        patternType: 'api-contract',
        name: 'Consumer-Driven Contract Test',
        description: 'Pact-style consumer-driven contract testing between services',
        template: {
          type: 'code',
          content: `// Consumer side contract
const pact = new Pact({
  consumer: '{{consumerName}}',
  provider: '{{providerName}}',
});

describe('{{consumerName}} -> {{providerName}} contract', () => {
  beforeAll(() => pact.setup());
  afterAll(() => pact.finalize());

  it('should receive {{expectedResource}}', async () => {
    await pact.addInteraction({
      state: '{{providerState}}',
      uponReceiving: '{{interactionDescription}}',
      withRequest: { method: '{{httpMethod}}', path: '{{requestPath}}' },
      willRespondWith: {
        status: 200,
        body: like({{expectedShape}}),
      },
    });

    const result = await client.{{clientMethod}}();
    expect(result).toBeDefined();
  });
});`,
          variables: [
            { name: 'consumerName', type: 'string', required: true, description: 'Consumer service name' },
            { name: 'providerName', type: 'string', required: true, description: 'Provider service name' },
            { name: 'expectedResource', type: 'string', required: true, description: 'Resource being consumed' },
            { name: 'providerState', type: 'string', required: true, description: 'Provider state precondition' },
            { name: 'interactionDescription', type: 'string', required: true, description: 'Interaction description' },
            { name: 'httpMethod', type: 'string', required: true, description: 'HTTP method' },
            { name: 'requestPath', type: 'string', required: true, description: 'Request path' },
            { name: 'expectedShape', type: 'object', required: true, description: 'Expected response shape' },
            { name: 'clientMethod', type: 'string', required: true, description: 'Client method to call' },
          ],
        },
        context: {
          tags: ['contract', 'pact', 'consumer-driven', 'microservice'],
        },
        confidence: 0.6,
      },

      // ================================================================
      // visual-accessibility domain seeds
      // ================================================================
      {
        patternType: 'a11y-check',
        name: 'WCAG Contrast and ARIA Check',
        description: 'Validate WCAG 2.2 color contrast ratios and ARIA attribute correctness',
        template: {
          type: 'prompt',
          content: `Accessibility audit for {{componentName}}:

WCAG 2.2 AA Compliance:
1. **Color Contrast**: Text contrast ratio >= 4.5:1 (normal), >= 3:1 (large)
2. **ARIA Roles**: All interactive elements have correct role attributes
3. **ARIA Labels**: Forms and buttons have aria-label or aria-labelledby
4. **Focus Management**: Tab order is logical, focus visible on all interactive elements
5. **Screen Reader**: Content is meaningful when linearized
6. **Keyboard**: All functionality accessible via keyboard alone

Test with: axe-core, pa11y, or lighthouse --accessibility`,
          variables: [
            { name: 'componentName', type: 'string', required: true, description: 'UI component to audit' },
          ],
        },
        context: {
          tags: ['wcag', 'accessibility', 'aria', 'contrast', 'a11y'],
        },
        confidence: 0.6,
      },
      {
        patternType: 'visual-baseline',
        name: 'Visual Regression Baseline',
        description: 'Capture and compare screenshots for visual regression detection',
        template: {
          type: 'code',
          content: `describe('{{pageName}} visual regression', () => {
  it('should match baseline screenshot', async () => {
    await page.goto('{{pageUrl}}');
    await page.waitForLoadState('networkidle');

    const screenshot = await page.screenshot({ fullPage: {{fullPage}} });
    expect(screenshot).toMatchSnapshot('{{pageName}}-baseline.png', {
      maxDiffPixelRatio: {{maxDiffRatio}},
    });
  });

  it('should match baseline at mobile viewport', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('{{pageUrl}}');
    const screenshot = await page.screenshot({ fullPage: {{fullPage}} });
    expect(screenshot).toMatchSnapshot('{{pageName}}-mobile-baseline.png', {
      maxDiffPixelRatio: {{maxDiffRatio}},
    });
  });
});`,
          variables: [
            { name: 'pageName', type: 'string', required: true, description: 'Page name for snapshot naming' },
            { name: 'pageUrl', type: 'string', required: true, description: 'Page URL to capture' },
            { name: 'fullPage', type: 'boolean', required: false, defaultValue: true, description: 'Capture full page' },
            { name: 'maxDiffRatio', type: 'number', required: false, defaultValue: 0.01, description: 'Max pixel diff ratio' },
          ],
        },
        context: {
          tags: ['visual', 'screenshot', 'regression', 'baseline', 'playwright'],
        },
        confidence: 0.6,
      },

      // ================================================================
      // chaos-resilience domain seeds
      // ================================================================
      {
        patternType: 'perf-benchmark',
        name: 'Load Test Scenario',
        description: 'k6-style load test with ramp-up stages and SLA assertions',
        template: {
          type: 'code',
          content: `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '{{rampUpDuration}}', target: {{peakUsers}} },
    { duration: '{{steadyDuration}}', target: {{peakUsers}} },
    { duration: '{{rampDownDuration}}', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<{{p95ThresholdMs}}'],
    http_req_failed: ['rate<{{errorRateThreshold}}'],
  },
};

export default function () {
  const res = http.get('{{targetUrl}}');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < {{p95ThresholdMs}}ms': (r) => r.timings.duration < {{p95ThresholdMs}},
  });
  sleep(1);
}`,
          variables: [
            { name: 'targetUrl', type: 'string', required: true, description: 'Target URL to load test' },
            { name: 'peakUsers', type: 'number', required: true, description: 'Peak concurrent users' },
            { name: 'rampUpDuration', type: 'string', required: false, defaultValue: '2m', description: 'Ramp-up duration' },
            { name: 'steadyDuration', type: 'string', required: false, defaultValue: '5m', description: 'Steady state duration' },
            { name: 'rampDownDuration', type: 'string', required: false, defaultValue: '1m', description: 'Ramp-down duration' },
            { name: 'p95ThresholdMs', type: 'number', required: false, defaultValue: 500, description: 'P95 latency threshold in ms' },
            { name: 'errorRateThreshold', type: 'number', required: false, defaultValue: 0.01, description: 'Max error rate (0-1)' },
          ],
        },
        context: {
          tags: ['load-test', 'k6', 'performance', 'sla'],
        },
        confidence: 0.6,
      },
      {
        patternType: 'perf-benchmark',
        name: 'Circuit Breaker Resilience Test',
        description: 'Test circuit breaker behavior under fault injection',
        template: {
          type: 'prompt',
          content: `Resilience test for {{serviceName}} circuit breaker:

1. **Closed state**: Verify normal requests pass through
2. **Fault injection**: Inject {{faultType}} faults at {{faultRate}}% rate
3. **Trip threshold**: Verify breaker opens after {{failureThreshold}} consecutive failures
4. **Open state**: Verify requests fail fast (no upstream calls)
5. **Half-open probe**: After {{cooldownMs}}ms, verify single probe request
6. **Recovery**: On probe success, verify breaker closes and traffic resumes
7. **Metrics**: Verify circuit state changes are logged and observable`,
          variables: [
            { name: 'serviceName', type: 'string', required: true, description: 'Service with circuit breaker' },
            { name: 'faultType', type: 'string', required: false, defaultValue: 'latency', description: 'Type of fault (latency/error/timeout)' },
            { name: 'faultRate', type: 'number', required: false, defaultValue: 50, description: 'Fault injection rate %' },
            { name: 'failureThreshold', type: 'number', required: false, defaultValue: 5, description: 'Failures to trip breaker' },
            { name: 'cooldownMs', type: 'number', required: false, defaultValue: 30000, description: 'Cooldown before half-open' },
          ],
        },
        context: {
          tags: ['chaos', 'circuit-breaker', 'resilience', 'fault-injection'],
        },
        confidence: 0.6,
      },

      // ================================================================
      // learning-optimization domain seeds
      // ================================================================
      {
        patternType: 'coverage-strategy',
        qeDomain: 'learning-optimization',
        name: 'Cross-Domain Pattern Transfer',
        description: 'Strategy for transferring useful patterns from one QE domain to related domains',
        template: {
          type: 'prompt',
          content: `Pattern transfer from {{sourceDomain}} to {{targetDomain}}:

1. Identify generalizable patterns in source domain (success rate > 70%)
2. Check domain compatibility (related domains get 80% relevance, unrelated 50%)
3. Adapt pattern context: replace domain-specific terms with target equivalents
4. Set transferred pattern confidence to source * compatibility factor
5. Store in target domain with provenance metadata
6. Track transfer outcomes to learn which transfers are valuable`,
          variables: [
            { name: 'sourceDomain', type: 'string', required: true, description: 'Source QE domain' },
            { name: 'targetDomain', type: 'string', required: true, description: 'Target QE domain' },
          ],
        },
        context: {
          tags: ['transfer', 'cross-domain', 'learning', 'pattern-reuse'],
        },
        confidence: 0.6,
      },
      {
        patternType: 'coverage-strategy',
        qeDomain: 'learning-optimization',
        name: 'Pattern Quality Promotion Pipeline',
        description: 'Pipeline for promoting short-term patterns to long-term based on success evidence',
        template: {
          type: 'prompt',
          content: `Pattern promotion evaluation for {{patternName}}:

Criteria (all must pass):
1. Usage count >= 3 successful applications
2. Success rate >= 70%
3. Confidence score >= 0.6
4. Coherence check: no contradiction with existing long-term patterns
5. Age: pattern has existed for at least 24 hours (not rushed)

On promotion:
- Move from short-term to long-term tier
- Boost confidence by 10%
- Enable for cross-domain transfer to related domains
- Mark as reusable for token savings optimization`,
          variables: [
            { name: 'patternName', type: 'string', required: true, description: 'Pattern to evaluate for promotion' },
          ],
        },
        context: {
          tags: ['promotion', 'learning', 'quality', 'pipeline'],
        },
        confidence: 0.6,
      },
    ];

    for (const options of foundationalPatterns) {
      try {
        await this.patternStore.create(options);
      } catch (error) {
        console.warn(`[QEReasoningBank] Failed to load pattern ${options.name}:`, error);
      }
    }

    console.log(`[QEReasoningBank] Loaded ${foundationalPatterns.length} foundational patterns`);
  }

  /**
   * Seed cross-domain patterns by transferring generalizable patterns
   * from populated domains to their related domains.
   *
   * Uses the domain compatibility matrix to determine which domains
   * are related and applies a relevance decay to transferred patterns.
   */
  async seedCrossDomainPatterns(): Promise<{ transferred: number; skipped: number }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const stats = await this.patternStore.getStats();
    let transferred = 0;
    let skipped = 0;

    // Domain compatibility matrix (same as TransferSpecialistService)
    const relatedDomains: Record<QEDomain, QEDomain[]> = {
      'test-generation': ['test-execution', 'coverage-analysis', 'requirements-validation'],
      'test-execution': ['test-generation', 'coverage-analysis', 'quality-assessment'],
      'coverage-analysis': ['test-generation', 'test-execution', 'quality-assessment'],
      'quality-assessment': ['test-execution', 'coverage-analysis', 'defect-intelligence'],
      'defect-intelligence': ['quality-assessment', 'code-intelligence'],
      'requirements-validation': ['test-generation', 'quality-assessment'],
      'code-intelligence': ['defect-intelligence', 'security-compliance'],
      'security-compliance': ['code-intelligence', 'quality-assessment'],
      'contract-testing': ['test-generation', 'test-execution'],
      'visual-accessibility': ['quality-assessment'],
      'chaos-resilience': ['test-execution', 'quality-assessment'],
      'learning-optimization': ['test-generation', 'test-execution', 'coverage-analysis', 'quality-assessment', 'defect-intelligence'],
    };

    // For each domain that has patterns, transfer to related domains
    for (const [sourceDomainStr, targetDomains] of Object.entries(relatedDomains)) {
      const sourceDomain = sourceDomainStr as QEDomain;
      const sourceCount = stats.byDomain[sourceDomain] || 0;
      if (sourceCount === 0) continue;

      // Get source domain patterns
      const sourceResult = await this.searchPatterns('', {
        domain: sourceDomain,
        limit: 50,
      });

      if (!sourceResult.success) continue;

      for (const targetDomain of targetDomains) {
        // Only transfer to domains that have few patterns (less than source)
        const targetCount = stats.byDomain[targetDomain] || 0;
        if (targetCount >= sourceCount) {
          skipped++;
          continue;
        }

        // Transfer each source pattern to the target domain
        for (const { pattern: sourcePattern } of sourceResult.value) {
          // Check if a similar pattern already exists in target domain
          const existingCheck = await this.searchPatterns(sourcePattern.name, {
            domain: targetDomain,
            limit: 1,
          });

          if (existingCheck.success && existingCheck.value.length > 0) {
            const bestMatch = existingCheck.value[0];
            if (bestMatch.score > 0.8) {
              skipped++;
              continue; // Similar pattern already exists
            }
          }

          // Create transferred pattern with reduced confidence
          const transferredConfidence = Math.max(0.3, (sourcePattern.confidence || 0.5) * 0.8);
          const transferResult = await this.storePattern({
            patternType: sourcePattern.patternType,
            qeDomain: targetDomain,
            name: `${sourcePattern.name} (from ${sourceDomain})`,
            description: `${sourcePattern.description} [Transferred from ${sourceDomain} domain]`,
            template: sourcePattern.template,
            context: {
              ...sourcePattern.context,
              relatedDomains: [sourceDomain, targetDomain],
              tags: [
                ...sourcePattern.context.tags,
                'cross-domain-transfer',
                `source:${sourceDomain}`,
              ],
            },
            confidence: transferredConfidence,
          });

          if (transferResult.success) {
            transferred++;
          } else {
            skipped++;
          }
        }
      }
    }

    console.log(
      `[QEReasoningBank] Cross-domain transfer complete: ${transferred} transferred, ${skipped} skipped`
    );

    return { transferred, skipped };
  }

  /**
   * Store a new pattern
   */
  async storePattern(options: CreateQEPatternOptions): Promise<Result<QEPattern>> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.config.enableLearning) {
      return err(new Error('Pattern learning is disabled'));
    }

    // Generate embedding if not provided
    if (!options.embedding) {
      const embedding = await this.embed(
        `${options.name} ${options.description} ${options.context?.tags?.join(' ') || ''}`
      );
      options = { ...options, embedding };
    }

    return this.patternStore.create(options);
  }

  /**
   * Search for patterns
   *
   * Empty string queries return all patterns sorted by quality score.
   * Non-empty string queries use HNSW vector similarity search.
   * Array queries (pre-computed embeddings) use HNSW directly.
   */
  async searchPatterns(
    query: string | number[],
    options?: PatternSearchOptions
  ): Promise<Result<PatternSearchResult[]>> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Generate embedding for text query
    let searchQuery: string | number[] = query;
    let useVectorSearch = true;

    if (typeof query === 'string') {
      if (query.trim() === '') {
        // Empty query = return all patterns sorted by quality score
        // Skip vector search (zero vector produces meaningless results)
        useVectorSearch = false;
        searchQuery = '';
      } else {
        searchQuery = await this.embed(query);
      }
    }

    return this.patternStore.search(searchQuery, {
      ...options,
      useVectorSearch,
    });
  }

  /**
   * Get pattern by ID
   */
  async getPattern(id: string): Promise<QEPattern | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.patternStore.get(id);
  }

  /**
   * Record pattern usage outcome
   */
  async recordOutcome(outcome: LearningOutcome): Promise<Result<void>> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.config.enableLearning) {
      return ok(undefined);
    }

    const result = await this.patternStore.recordUsage(
      outcome.patternId,
      outcome.success
    );

    // Write to qe_pattern_usage table for analytics/feedback loop
    try {
      const { getUnifiedMemory } = await import('../kernel/unified-memory.js');
      const db = getUnifiedMemory().getDatabase();
      db.prepare(`
        INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json, feedback)
        VALUES (?, ?, ?, ?)
      `).run(
        outcome.patternId,
        outcome.success ? 1 : 0,
        outcome.metrics ? JSON.stringify(outcome.metrics) : null,
        outcome.feedback || null
      );
    } catch {
      // Non-critical — don't fail if analytics insert fails
    }

    if (result.success) {
      this.stats.learningOutcomes++;
      if (outcome.success) {
        this.stats.successfulOutcomes++;
      }

      // Check if pattern should be promoted (with coherence gate)
      const pattern = await this.getPattern(outcome.patternId);
      if (pattern && await this.checkPatternPromotionWithCoherence(pattern)) {
        await this.promotePattern(outcome.patternId);
        console.log(`[QEReasoningBank] Pattern promoted to long-term: ${pattern.name}`);
      }
    }

    return result;
  }

  /**
   * Check if a pattern should be promoted with coherence gate (ADR-052)
   *
   * This method implements a two-stage promotion check:
   * 1. Basic criteria (usage and quality) - cheap to check
   * 2. Coherence criteria (only if basic passes) - expensive, requires coherence service
   *
   * @param pattern - Pattern to evaluate for promotion
   * @returns true if pattern should be promoted, false otherwise
   */
  private async checkPatternPromotionWithCoherence(pattern: QEPattern): Promise<boolean> {
    // 1. Check basic criteria first (cheap)
    const basicCheck = shouldPromotePattern(pattern);
    if (!basicCheck.meetsUsageCriteria || !basicCheck.meetsQualityCriteria) {
      return false;
    }

    // 2. Check coherence with existing long-term patterns (expensive, only if basic passes)
    if (this.coherenceService && this.coherenceService.isInitialized()) {
      const longTermPatterns = await this.getLongTermPatterns();

      // Create coherence check with candidate pattern added to long-term set
      const allPatterns = [...longTermPatterns, pattern];
      const coherenceNodes = allPatterns.map(p => ({
        id: p.id,
        embedding: p.embedding || [],
        weight: p.confidence,
        metadata: { name: p.name, domain: p.qeDomain },
      }));

      const coherenceResult = await this.coherenceService.checkCoherence(coherenceNodes);

      if (coherenceResult.energy >= (this.config.coherenceThreshold || 0.4)) {
        // Promotion blocked due to coherence violation
        const event: PromotionBlockedEvent = {
          patternId: pattern.id,
          patternName: pattern.name,
          reason: 'coherence_violation',
          energy: coherenceResult.energy,
          existingPatternConflicts: coherenceResult.contradictions?.map(c => c.nodeIds).flat(),
        };

        // Publish event if eventBus is available
        if (this.eventBus) {
          await this.eventBus.publish({
            id: `pattern-promotion-blocked-${pattern.id}`,
            type: 'pattern:promotion_blocked',
            timestamp: new Date(),
            source: 'learning-optimization',
            payload: event,
          });
        }

        console.log(
          `[QEReasoningBank] Pattern promotion blocked due to coherence violation: ` +
          `${pattern.name} (energy: ${coherenceResult.energy.toFixed(3)})`
        );

        return false;
      }
    }

    return true;
  }

  /**
   * Get all long-term patterns for coherence checking
   *
   * @returns Array of long-term patterns
   */
  private async getLongTermPatterns(): Promise<QEPattern[]> {
    const result = await this.searchPatterns('', { tier: 'long-term', limit: 1000 });
    return result.success ? result.value.map(r => r.pattern) : [];
  }

  /**
   * Promote a pattern to long-term storage
   *
   * @param patternId - Pattern ID to promote
   */
  private async promotePattern(patternId: string): Promise<void> {
    const result = await this.patternStore.promote(patternId);
    if (result.success) {
      console.log(`[QEReasoningBank] Promoted pattern ${patternId} to long-term`);
      if (this.eventBus) {
        await this.eventBus.publish({
          id: `pattern-promoted-${patternId}`,
          type: 'pattern:promoted',
          timestamp: new Date(),
          source: 'learning-optimization',
          payload: { patternId, newTier: 'long-term' },
        });
      }
    } else {
      console.error(`[QEReasoningBank] Failed to promote pattern ${patternId}: ${result.error.message}`);
    }
  }

  /**
   * Route a task to optimal agent
   */
  async routeTask(request: QERoutingRequest): Promise<Result<QERoutingResult>> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.config.enableRouting) {
      return err(new Error('Task routing is disabled'));
    }

    this.stats.routingRequests++;

    try {
      // 1. Detect domains from task description
      const detectedDomains = request.domain
        ? [request.domain]
        : detectQEDomains(request.task);

      if (detectedDomains.length === 0) {
        detectedDomains.push('test-generation'); // Default
      }

      // 2. Search for similar patterns
      const embedding = await this.embed(request.task);
      const patternResults = await this.patternStore.search(embedding, {
        limit: this.config.maxRoutingCandidates,
        domain: detectedDomains[0],
        useVectorSearch: true,
      });

      const patterns = patternResults.success
        ? patternResults.value.map((r) => r.pattern)
        : [];

      // 3. Calculate agent scores
      const agentScores: Array<{ agent: string; score: number; reasoning: string[] }> = [];

      for (const [agentType, profile] of Object.entries(this.agentCapabilities)) {
        let score = 0;
        const reasoning: string[] = [];

        // Domain match (0-0.4)
        const domainMatch = detectedDomains.filter((d) =>
          profile.domains.includes(d)
        ).length;
        const domainScore =
          domainMatch > 0 ? (domainMatch / detectedDomains.length) * 0.4 : 0;
        score += domainScore * this.config.routingWeights.similarity;
        if (domainScore > 0) {
          reasoning.push(`Domain match: ${(domainScore * 100).toFixed(0)}%`);
        }

        // Capability match (0-0.3)
        if (request.capabilities && request.capabilities.length > 0) {
          const capMatch = request.capabilities.filter((c) =>
            profile.capabilities.some(
              (pc) => pc.toLowerCase().includes(c.toLowerCase())
            )
          ).length;
          const capScore =
            capMatch > 0 ? (capMatch / request.capabilities.length) * 0.3 : 0;
          score += capScore * this.config.routingWeights.capabilities;
          if (capScore > 0) {
            reasoning.push(`Capability match: ${(capScore * 100).toFixed(0)}%`);
          }
        } else {
          score += 0.15 * this.config.routingWeights.capabilities;
        }

        // Historical performance (0-0.3)
        score += profile.performanceScore * 0.3 * this.config.routingWeights.performance;
        reasoning.push(`Performance score: ${(profile.performanceScore * 100).toFixed(0)}%`);

        // Pattern similarity boost
        const agentPatterns = patterns.filter((p) =>
          profile.domains.includes(p.qeDomain)
        );
        if (agentPatterns.length > 0) {
          const patternBoost = Math.min(0.1, agentPatterns.length * 0.02);
          score += patternBoost;
          reasoning.push(`Pattern matches: ${agentPatterns.length}`);
        }

        agentScores.push({ agent: agentType, score, reasoning });
      }

      // Sort by score
      agentScores.sort((a, b) => b.score - a.score);

      const recommended = agentScores[0];
      const alternatives = agentScores.slice(1, 4);

      // Generate guidance
      const guidance: string[] = [];
      if (this.config.enableGuidance && detectedDomains.length > 0) {
        const domainGuidance = getCombinedGuidance(detectedDomains[0], {
          framework: request.context?.framework,
          language: request.context?.language,
          includeAntiPatterns: true,
        });
        guidance.push(...domainGuidance.slice(0, 5));
      }

      // Update stats
      this.stats.totalRoutingConfidence += recommended.score;

      const result: QERoutingResult = {
        recommendedAgent: recommended.agent,
        confidence: recommended.score,
        alternatives: alternatives.map((a) => ({ agent: a.agent, score: a.score })),
        domains: detectedDomains,
        patterns,
        guidance,
        reasoning: recommended.reasoning.join('; '),
      };

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get guidance for a domain
   */
  getGuidance(domain: QEDomain, _context?: Partial<QEPatternContext>): QEGuidance {
    return getGuidance(domain);
  }

  /**
   * Generate guidance context for Claude
   */
  generateContext(
    domain: QEDomain,
    context?: { framework?: TestFramework; language?: ProgrammingLanguage }
  ): string {
    return generateGuidanceContext(domain, context || {});
  }

  /**
   * Check for anti-patterns
   */
  checkAntiPatterns(domain: QEDomain, content: string) {
    return checkAntiPatterns(domain, content);
  }

  /**
   * Generate embedding for text
   *
   * Uses ONNX transformer embeddings when available, with hash-based fallback
   * for ARM64 or when transformers module cannot be loaded.
   */
  async embed(text: string): Promise<number[]> {
    // Try ONNX embeddings if enabled
    if (this.config.useONNXEmbeddings) {
      try {
        const { computeRealEmbedding } = await import('./real-embeddings.js');
        const embedding = await computeRealEmbedding(text);
        // Resize to configured dimension if needed (384 -> 128)
        if (embedding.length !== this.config.embeddingDimension) {
          return this.resizeEmbedding(embedding, this.config.embeddingDimension);
        }
        return embedding;
      } catch (error) {
        // ARM64 ONNX compatibility issue or module not available
        // Fall through to hash-based embedding silently
        if (process.env.DEBUG) {
          console.warn(
            '[QEReasoningBank] ONNX embeddings unavailable, using hash fallback:',
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    }

    // Hash-based fallback (always works, including ARM64)
    return this.hashEmbedding(text);
  }

  /**
   * Resize embedding to target dimension using averaging or truncation
   */
  private resizeEmbedding(embedding: number[], targetDim: number): number[] {
    if (embedding.length === targetDim) {
      return embedding;
    }

    if (embedding.length > targetDim) {
      // Average adjacent values to reduce dimension
      const ratio = embedding.length / targetDim;
      const result = new Array(targetDim).fill(0);
      for (let i = 0; i < targetDim; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.floor((i + 1) * ratio);
        let sum = 0;
        for (let j = start; j < end; j++) {
          sum += embedding[j];
        }
        result[i] = sum / (end - start);
      }
      // Normalize
      const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
      if (magnitude > 0) {
        for (let i = 0; i < targetDim; i++) {
          result[i] /= magnitude;
        }
      }
      return result;
    } else {
      // Interpolate to increase dimension (less common)
      const result = new Array(targetDim).fill(0);
      const ratio = (embedding.length - 1) / (targetDim - 1);
      for (let i = 0; i < targetDim; i++) {
        const pos = i * ratio;
        const lower = Math.floor(pos);
        const upper = Math.min(lower + 1, embedding.length - 1);
        const weight = pos - lower;
        result[i] = embedding[lower] * (1 - weight) + embedding[upper] * weight;
      }
      // Normalize
      const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
      if (magnitude > 0) {
        for (let i = 0; i < targetDim; i++) {
          result[i] /= magnitude;
        }
      }
      return result;
    }
  }

  /**
   * Simple hash-based embedding fallback
   */
  private hashEmbedding(text: string): number[] {
    const dimension = this.config.embeddingDimension;
    const embedding = new Array(dimension).fill(0);
    const normalized = text.toLowerCase().trim();

    // Use multiple hash passes for better distribution
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < normalized.length; i++) {
        const charCode = normalized.charCodeAt(i);
        const idx = (charCode * (i + 1) * (pass + 1)) % dimension;
        embedding[idx] += Math.sin(charCode * (pass + 1)) / (i + 1);
      }
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );

    if (magnitude > 0) {
      for (let i = 0; i < dimension; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<QEReasoningBankStats> {
    if (!this.initialized) {
      await this.initialize();
    }

    const patternStoreStats = await this.patternStore.getStats();

    const byDomain: Record<QEDomain, number> = {} as Record<QEDomain, number>;
    for (const domain of QE_DOMAIN_LIST) {
      byDomain[domain] = patternStoreStats.byDomain[domain] || 0;
    }

    return {
      totalPatterns: patternStoreStats.totalPatterns,
      byDomain,
      routingRequests: this.stats.routingRequests,
      avgRoutingConfidence:
        this.stats.routingRequests > 0
          ? this.stats.totalRoutingConfidence / this.stats.routingRequests
          : 0,
      learningOutcomes: this.stats.learningOutcomes,
      patternSuccessRate:
        this.stats.learningOutcomes > 0
          ? this.stats.successfulOutcomes / this.stats.learningOutcomes
          : 0,
      patternStoreStats,
    };
  }

  /**
   * Dispose the reasoning bank
   */
  async dispose(): Promise<void> {
    await this.patternStore.dispose();
    this.initialized = false;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new QEReasoningBank instance
 */
export function createQEReasoningBank(
  memory: MemoryBackend,
  eventBus?: EventBus,
  config?: Partial<QEReasoningBankConfig>,
  coherenceService?: import('../integrations/coherence/coherence-service.js').ICoherenceService
): QEReasoningBank {
  return new QEReasoningBank(memory, eventBus, config, coherenceService);
}

// ============================================================================
// Convenience Exports
// ============================================================================

export {
  detectQEDomain,
  detectQEDomains,
  mapQEDomainToAQE,
  applyPatternTemplate,
} from './qe-patterns.js';

export type {
  QEPattern,
  QEPatternType,
  QEDomain,
  QEPatternContext,
  ProgrammingLanguage,
  TestFramework,
  CreateQEPatternOptions,
} from './qe-patterns.js';

export {
  getGuidance,
  getCombinedGuidance,
  generateGuidanceContext,
} from './qe-guidance.js';

export type { QEGuidance } from './qe-guidance.js';
