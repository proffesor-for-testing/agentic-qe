/**
 * Agentic QE v3 - Pretrained Patterns
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Static pretrained pattern definitions that seed the QE ReasoningBank
 * on first initialization when no existing patterns are found.
 */

import type { CreateQEPatternOptions } from './qe-patterns.js';

// ============================================================================
// Pretrained Foundational Patterns
// ============================================================================

/**
 * Foundational QE patterns loaded on first initialization.
 * These cover all 8+ QE domains with seed patterns.
 */
export const PRETRAINED_PATTERNS: CreateQEPatternOptions[] = [
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
