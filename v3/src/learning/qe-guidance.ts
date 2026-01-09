/**
 * Agentic QE v3 - QE Guidance Templates
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Domain-specific guidance templates that provide context-aware
 * recommendations to agents when generating tests or analyzing quality.
 */

import type { QEDomain, QEPatternType, TestFramework, ProgrammingLanguage } from './qe-patterns.js';

// ============================================================================
// Guidance Template Types
// ============================================================================

/**
 * Domain guidance configuration
 */
export interface QEGuidance {
  /** QE domain this guidance applies to */
  readonly domain: QEDomain;

  /** Priority-ordered best practices */
  readonly bestPractices: string[];

  /** Common anti-patterns to avoid */
  readonly antiPatterns: AntiPattern[];

  /** Framework-specific guidance */
  readonly frameworkGuidance: Record<TestFramework, string[]>;

  /** Language-specific guidance */
  readonly languageGuidance: Record<ProgrammingLanguage, string[]>;

  /** Example templates */
  readonly examples: GuidanceExample[];
}

/**
 * Anti-pattern to avoid
 */
export interface AntiPattern {
  /** Name of the anti-pattern */
  readonly name: string;

  /** Description of what to avoid */
  readonly description: string;

  /** Why it's problematic */
  readonly reason: string;

  /** Better alternative */
  readonly alternative: string;

  /** Detection pattern (regex) */
  readonly detection?: string;
}

/**
 * Example for guidance
 */
export interface GuidanceExample {
  /** Example title */
  readonly title: string;

  /** Description */
  readonly description: string;

  /** Code or content */
  readonly content: string;

  /** Language/framework */
  readonly context: {
    language?: ProgrammingLanguage;
    framework?: TestFramework;
  };
}

// ============================================================================
// Domain Guidance Templates
// ============================================================================

/**
 * Test Generation Domain Guidance
 */
export const TEST_GENERATION_GUIDANCE: QEGuidance = {
  domain: 'test-generation',
  bestPractices: [
    'Follow Arrange-Act-Assert (AAA) pattern for clear test structure',
    'One logical assertion per test - test one behavior at a time',
    'Use descriptive test names: should_returnValue_when_condition',
    'Mock external dependencies to isolate unit under test',
    'Test edge cases and boundary conditions, not just happy paths',
    'Keep tests deterministic - avoid time-dependent assertions',
    'Use test data builders or factories for complex objects',
    'Prefer integration tests for workflows, unit tests for logic',
    'Maintain test independence - no shared mutable state between tests',
    'Write failing test first (TDD Red) before implementation',
  ],
  antiPatterns: [
    {
      name: 'God Test',
      description: 'A single test that verifies too many behaviors',
      reason: 'Hard to diagnose failures, brittle, slow to run',
      alternative: 'Split into focused tests, each verifying one behavior',
      detection: 'expect.*expect.*expect.*expect.*expect',
    },
    {
      name: 'Mystery Guest',
      description: 'Test relies on external data files or state not visible in test',
      reason: 'Tests are hard to understand and maintain',
      alternative: 'Make test data explicit within the test or use fixtures',
    },
    {
      name: 'Eager Test',
      description: 'Test that verifies more than needed for the current behavior',
      reason: 'Creates unnecessary coupling, breaks easily',
      alternative: 'Only assert what is necessary for this specific test case',
    },
    {
      name: 'Flaky Assertion',
      description: 'Assertions that depend on timing, order, or external state',
      reason: 'Creates unreliable test suite, erodes trust',
      alternative: 'Use deterministic assertions, mock time/random',
      detection: 'setTimeout|Date\\.now|Math\\.random',
    },
    {
      name: 'Test Code Duplication',
      description: 'Same setup or assertion code repeated across tests',
      reason: 'Maintenance burden, inconsistency risk',
      alternative: 'Extract to beforeEach, helpers, or fixtures',
    },
  ],
  frameworkGuidance: {
    jest: [
      'Use describe blocks to group related tests',
      'Prefer toEqual for deep equality, toBe for primitives',
      'Use jest.mock() at module level for consistent mocking',
      'Use jest.spyOn for partial mocking of objects',
      'Enable --coverage to track test coverage',
    ],
    vitest: [
      'Use vi.mock() for module mocking',
      'Prefer vi.fn() over jest.fn() syntax',
      'Use vitest/ui for interactive test debugging',
      'Enable browser mode for component tests',
      'Use inline snapshots for small expected values',
    ],
    mocha: [
      'Use beforeEach/afterEach for setup/teardown',
      'Combine with chai for assertions',
      'Use sinon for spies, stubs, and mocks',
      'Set appropriate timeouts for async tests',
    ],
    pytest: [
      'Use fixtures for reusable test setup',
      'Use parametrize for data-driven tests',
      'Use conftest.py for shared fixtures',
      'Use pytest.raises for exception testing',
      'Use pytest-cov for coverage reporting',
    ],
    junit: [
      'Use @BeforeEach and @AfterEach for setup/teardown',
      'Use @DisplayName for readable test names',
      'Use @ParameterizedTest for data-driven tests',
      'Use Mockito for mocking dependencies',
    ],
    testng: [
      'Use @BeforeMethod and @AfterMethod appropriately',
      'Use @DataProvider for parameterized tests',
      'Configure test groups for selective execution',
    ],
    playwright: [
      'Use page.locator() for resilient element selection',
      'Use expect(locator) for auto-waiting assertions',
      'Use page.waitForLoadState for navigation',
      'Use test.describe for grouping tests',
      'Use fixtures for reusable browser contexts',
    ],
    cypress: [
      'Use cy.intercept() for API mocking',
      'Avoid conditional testing - use deterministic state',
      'Use data-cy attributes for stable selectors',
      'Use cy.within() for scoped queries',
      'Prefer cy.contains() for text-based selection',
    ],
    selenium: [
      'Use explicit waits over implicit waits',
      'Use Page Object Model for maintainability',
      'Handle stale element references with retry logic',
      'Clean up browser state between tests',
    ],
  },
  languageGuidance: {
    typescript: [
      'Use type assertions in tests for better IDE support',
      'Create typed test fixtures and builders',
      'Use satisfies operator for test data validation',
      'Mock types with ts-mockito or typed mocking libs',
    ],
    javascript: [
      'Use JSDoc comments for test documentation',
      'Consider TypeScript for larger test suites',
      'Use ESLint with testing plugins',
    ],
    python: [
      'Use type hints in test functions',
      'Use dataclasses for test data',
      'Follow PEP 8 naming: test_should_do_something',
    ],
    java: [
      'Use AssertJ for fluent assertions',
      'Use Lombok for test data classes',
      'Follow naming: shouldDoSomething_whenCondition',
    ],
    go: [
      'Use table-driven tests for multiple cases',
      'Use testify for assertions and mocking',
      'Place tests in _test.go files',
    ],
    rust: [
      'Use #[test] attribute for test functions',
      'Use assert!, assert_eq!, assert_ne! macros',
      'Place unit tests in same file with #[cfg(test)]',
    ],
    csharp: [
      'Use xUnit or NUnit for testing',
      'Use FluentAssertions for readable assertions',
      'Use Moq for mocking interfaces',
    ],
    kotlin: [
      'Use kotest for BDD-style testing',
      'Use MockK for Kotlin-first mocking',
      'Use data classes for test fixtures',
    ],
  },
  examples: [
    {
      title: 'Unit Test Template (TypeScript + Vitest)',
      description: 'Standard AAA pattern for unit tests',
      content: `describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', async () => {
      // Arrange
      const userData = { name: 'John', email: 'john@example.com' };
      const mockRepo = { save: vi.fn().mockResolvedValue({ id: '1', ...userData }) };
      const service = new UserService(mockRepo);

      // Act
      const result = await service.createUser(userData);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.name).toBe(userData.name);
      expect(mockRepo.save).toHaveBeenCalledWith(userData);
    });

    it('should throw when email is invalid', async () => {
      // Arrange
      const userData = { name: 'John', email: 'invalid' };
      const service = new UserService(mockRepo);

      // Act & Assert
      await expect(service.createUser(userData))
        .rejects.toThrow('Invalid email');
    });
  });
});`,
      context: { language: 'typescript', framework: 'vitest' },
    },
  ],
};

/**
 * Coverage Analysis Domain Guidance
 */
export const COVERAGE_ANALYSIS_GUIDANCE: QEGuidance = {
  domain: 'coverage-analysis',
  bestPractices: [
    'Focus on risk-weighted coverage, not just percentage',
    'Prioritize untested critical paths and business logic',
    'Use mutation testing to validate test quality beyond line coverage',
    'Target branch coverage over statement coverage',
    'Use O(log n) sublinear algorithms for large codebases',
    'Track coverage trends over time, not just snapshots',
    'Exclude generated code, config, and third-party from metrics',
    'Set realistic targets: 80% coverage for critical code',
    'Identify coverage gaps by risk, not just location',
    'Use coverage as a guide, not a goal',
  ],
  antiPatterns: [
    {
      name: 'Coverage Chasing',
      description: 'Writing tests just to increase coverage percentage',
      reason: 'Low-quality tests that exercise code without verifying behavior',
      alternative: 'Write tests that verify behavior, measure mutation score',
    },
    {
      name: 'Ignoring Branches',
      description: 'Only tracking line coverage, missing conditional branches',
      reason: 'Miss critical edge cases in conditionals',
      alternative: 'Track branch coverage and ensure all paths tested',
    },
    {
      name: 'Coverage Ratchet Too Tight',
      description: 'Requiring 100% coverage on all code',
      reason: 'Leads to test pollution, hard to maintain',
      alternative: 'Risk-based coverage targets, allow exceptions',
    },
  ],
  frameworkGuidance: {
    jest: ['Use --coverage flag', 'Configure coverageThreshold in jest.config'],
    vitest: ['Use --coverage flag', 'Use c8 or istanbul provider'],
    mocha: ['Use nyc (Istanbul) for coverage'],
    pytest: ['Use pytest-cov plugin', 'Use --cov flag'],
    junit: ['Use JaCoCo for coverage reporting'],
    testng: ['Use JaCoCo with TestNG'],
    playwright: ['Use coverage API for browser code coverage'],
    cypress: ['Use @cypress/code-coverage plugin'],
    selenium: ['Integrate with build tool coverage (Maven/Gradle)'],
  },
  languageGuidance: {
    typescript: ['Use c8 or istanbul for Node.js coverage'],
    javascript: ['Use nyc or c8 for coverage'],
    python: ['Use coverage.py or pytest-cov'],
    java: ['Use JaCoCo or Cobertura'],
    go: ['Use go test -cover', 'Use go tool cover for reports'],
    rust: ['Use cargo-tarpaulin or grcov'],
    csharp: ['Use coverlet or OpenCover'],
    kotlin: ['Use JaCoCo with Kotlin support'],
  },
  examples: [],
};

/**
 * Mutation Testing Domain Guidance
 */
export const MUTATION_TESTING_GUIDANCE: QEGuidance = {
  domain: 'mutation-testing',
  bestPractices: [
    'Use mutation testing to validate test suite quality',
    'Focus on surviving mutants - they indicate weak tests',
    'Target 80%+ mutation score for critical business logic',
    'Run mutation testing on changed files in CI (incremental)',
    'Analyze equivalent mutants to avoid false negatives',
    'Combine with coverage for comprehensive test quality metrics',
    'Prioritize fixing tests that let important mutants survive',
    'Use timeout-based mutation killing for performance',
  ],
  antiPatterns: [
    {
      name: 'Mutation Score Obsession',
      description: 'Trying to kill every mutant regardless of value',
      reason: 'Some mutants are equivalent or in non-critical code',
      alternative: 'Focus on mutants in critical business logic',
    },
    {
      name: 'Running Full Suite',
      description: 'Running mutation testing on entire codebase every time',
      reason: 'Extremely slow, discourages regular use',
      alternative: 'Run incrementally on changed files',
    },
  ],
  frameworkGuidance: {
    jest: ['Use Stryker with @stryker-mutator/jest-runner'],
    vitest: ['Use Stryker with @stryker-mutator/vitest-runner'],
    mocha: ['Use Stryker with @stryker-mutator/mocha-runner'],
    pytest: ['Use mutmut or cosmic-ray'],
    junit: ['Use PITest (PIT) for Java mutation testing'],
    testng: ['Use PITest with TestNG'],
    playwright: ['Limited support - focus on unit tests'],
    cypress: ['Limited support - focus on unit tests'],
    selenium: ['Limited support - focus on unit tests'],
  },
  languageGuidance: {
    typescript: ['Use Stryker for TypeScript mutation testing'],
    javascript: ['Use Stryker for JavaScript'],
    python: ['Use mutmut or cosmic-ray'],
    java: ['Use PITest (most mature Java mutator)'],
    go: ['Use go-mutesting or gremlins'],
    rust: ['Use cargo-mutants'],
    csharp: ['Use Stryker.NET'],
    kotlin: ['Use PITest with Kotlin plugin'],
  },
  examples: [],
};

/**
 * API Testing Domain Guidance
 */
export const API_TESTING_GUIDANCE: QEGuidance = {
  domain: 'api-testing',
  bestPractices: [
    'Use contract testing for API boundaries (Pact, etc.)',
    'Test both successful and error responses',
    'Validate response schemas, not just status codes',
    'Test authentication and authorization flows',
    'Use realistic test data, not just "test" strings',
    'Test rate limiting and pagination',
    'Verify idempotency for applicable operations',
    'Test with different content types (JSON, XML)',
    'Document APIs with OpenAPI/Swagger specs',
    'Use consumer-driven contracts for microservices',
  ],
  antiPatterns: [
    {
      name: 'Testing Implementation',
      description: 'Tests that verify internal implementation details',
      reason: 'Breaks when implementation changes, even if behavior unchanged',
      alternative: 'Test the contract and behavior, not implementation',
    },
    {
      name: 'Hardcoded URLs',
      description: 'API URLs hardcoded in tests',
      reason: 'Fails across environments, hard to maintain',
      alternative: 'Use environment variables or config files',
    },
    {
      name: 'No Schema Validation',
      description: 'Only checking status codes, not response structure',
      reason: 'Miss contract violations that break consumers',
      alternative: 'Validate response against OpenAPI schema',
    },
  ],
  frameworkGuidance: {
    jest: ['Use supertest for HTTP testing'],
    vitest: ['Use supertest or fetch for HTTP testing'],
    mocha: ['Use supertest with chai-http'],
    pytest: ['Use requests or httpx for API testing'],
    junit: ['Use REST Assured for API testing'],
    testng: ['Use REST Assured with TestNG'],
    playwright: ['Use API testing with request context'],
    cypress: ['Use cy.request() for API testing'],
    selenium: ['Integrate with API testing libraries separately'],
  },
  languageGuidance: {
    typescript: ['Use supertest, got, or axios'],
    javascript: ['Use supertest, got, or axios'],
    python: ['Use requests, httpx, or pytest-httpx'],
    java: ['Use REST Assured or OkHttp'],
    go: ['Use net/http/httptest package'],
    rust: ['Use reqwest for HTTP testing'],
    csharp: ['Use RestSharp or HttpClient'],
    kotlin: ['Use Fuel or Ktor client'],
  },
  examples: [],
};

/**
 * Security Testing Domain Guidance
 */
export const SECURITY_TESTING_GUIDANCE: QEGuidance = {
  domain: 'security-testing',
  bestPractices: [
    'Follow OWASP Top 10 for vulnerability testing',
    'Test authentication bypass scenarios',
    'Test SQL injection in all input fields',
    'Test XSS in all output contexts',
    'Verify CSRF protection on state-changing operations',
    'Test authorization for all endpoints and actions',
    'Scan dependencies for known vulnerabilities (SCA)',
    'Use SAST tools in CI/CD pipeline',
    'Test secrets management and exposure',
    'Validate input sanitization and output encoding',
  ],
  antiPatterns: [
    {
      name: 'Security by Obscurity',
      description: 'Relying on hidden endpoints or non-standard auth',
      reason: 'Security through obscurity always fails',
      alternative: 'Use standard authentication and authorization',
    },
    {
      name: 'Testing Only Happy Path',
      description: 'Only testing valid inputs',
      reason: 'Miss injection and bypass vulnerabilities',
      alternative: 'Test with malicious inputs and edge cases',
    },
  ],
  frameworkGuidance: {
    jest: ['Use for testing security functions and middleware'],
    vitest: ['Use for testing security functions and middleware'],
    mocha: ['Use for testing security functions'],
    pytest: ['Use for testing security functions'],
    junit: ['Use for testing security functions'],
    testng: ['Use for testing security functions'],
    playwright: ['Test for XSS, CSRF in browser context'],
    cypress: ['Test for XSS, CSRF in browser context'],
    selenium: ['Test for XSS, CSRF in browser context'],
  },
  languageGuidance: {
    typescript: ['Use snyk, npm audit for dependency scanning'],
    javascript: ['Use snyk, npm audit for dependency scanning'],
    python: ['Use bandit for SAST, safety for SCA'],
    java: ['Use SpotBugs, FindSecBugs for SAST'],
    go: ['Use gosec for security scanning'],
    rust: ['Use cargo-audit for vulnerability scanning'],
    csharp: ['Use Security Code Scan for SAST'],
    kotlin: ['Use detekt with security rules'],
  },
  examples: [],
};

/**
 * Visual Testing Domain Guidance
 */
export const VISUAL_TESTING_GUIDANCE: QEGuidance = {
  domain: 'visual-testing',
  bestPractices: [
    'Capture screenshots at consistent viewport sizes',
    'Use baseline images for comparison',
    'Handle dynamic content (dates, avatars) with masks',
    'Test across multiple browsers and devices',
    'Use percy or chromatic for visual regression',
    'Maintain baseline images in version control',
    'Set appropriate diff thresholds for noise tolerance',
    'Test responsive breakpoints systematically',
    'Capture full-page and component screenshots',
    'Use stable selectors for screenshot regions',
  ],
  antiPatterns: [
    {
      name: 'Pixel-Perfect Obsession',
      description: 'Zero tolerance for any pixel differences',
      reason: 'Anti-aliasing and rendering differences cause false failures',
      alternative: 'Use appropriate diff thresholds (typically 0.1-5%)',
    },
    {
      name: 'Unmasked Dynamic Content',
      description: 'Not masking timestamps, avatars, ads',
      reason: 'Causes constant baseline updates',
      alternative: 'Mask or mock dynamic content consistently',
    },
  ],
  frameworkGuidance: {
    jest: ['Use jest-image-snapshot'],
    vitest: ['Use vitest-image-snapshot'],
    mocha: ['Use chai-image-snapshot'],
    pytest: ['Use pytest-playwright with screenshots'],
    junit: ['Use ashot for Java screenshot comparison'],
    testng: ['Use ashot with TestNG'],
    playwright: ['Use expect(page).toHaveScreenshot()'],
    cypress: ['Use cypress-image-snapshot or percy'],
    selenium: ['Use ashot or built-in screenshot'],
  },
  languageGuidance: {
    typescript: ['Use playwright or puppeteer for screenshots'],
    javascript: ['Use playwright or puppeteer for screenshots'],
    python: ['Use playwright-python or selenium'],
    java: ['Use ashot with Selenium'],
    go: ['Use chromedp for browser automation'],
    rust: ['Use headless-chrome or fantoccini'],
    csharp: ['Use Selenium with screenshot comparison'],
    kotlin: ['Use Selenium or Playwright with Kotlin'],
  },
  examples: [],
};

/**
 * Accessibility Testing Domain Guidance
 */
export const ACCESSIBILITY_GUIDANCE: QEGuidance = {
  domain: 'accessibility',
  bestPractices: [
    'Follow WCAG 2.1 AA guidelines as minimum',
    'Test with screen readers (NVDA, VoiceOver)',
    'Ensure keyboard navigation works completely',
    'Verify color contrast meets requirements',
    'Test focus management and order',
    'Use automated tools (axe-core) for baseline',
    'Include users with disabilities in testing',
    'Check ARIA attributes are correct and necessary',
    'Test with browser zoom up to 200%',
    'Verify form labels and error messages',
  ],
  antiPatterns: [
    {
      name: 'ARIA Overuse',
      description: 'Adding ARIA attributes instead of semantic HTML',
      reason: 'Native semantics are better supported',
      alternative: 'Use semantic HTML first, ARIA only when needed',
    },
    {
      name: 'Automated-Only Testing',
      description: 'Relying solely on automated accessibility tools',
      reason: 'Catches only ~30% of accessibility issues',
      alternative: 'Combine automated testing with manual and user testing',
    },
  ],
  frameworkGuidance: {
    jest: ['Use jest-axe for accessibility assertions'],
    vitest: ['Use vitest-axe or axe-core directly'],
    mocha: ['Use axe-core with chai assertions'],
    pytest: ['Use axe-selenium-python'],
    junit: ['Use axe-selenium-java'],
    testng: ['Use axe-selenium-java with TestNG'],
    playwright: ['Use @axe-core/playwright'],
    cypress: ['Use cypress-axe'],
    selenium: ['Use axe-webdriverjs or axe-selenium'],
  },
  languageGuidance: {
    typescript: ['Use axe-core with TypeScript types'],
    javascript: ['Use axe-core for automated checks'],
    python: ['Use axe-selenium-python'],
    java: ['Use axe-selenium-java'],
    go: ['Limited support - use browser-based tools'],
    rust: ['Limited support - use browser-based tools'],
    csharp: ['Use Selenium.Axe'],
    kotlin: ['Use axe-selenium-java with Kotlin'],
  },
  examples: [],
};

/**
 * Performance Testing Domain Guidance
 */
export const PERFORMANCE_GUIDANCE: QEGuidance = {
  domain: 'performance',
  bestPractices: [
    'Define clear SLAs and performance budgets',
    'Test under realistic load patterns',
    'Monitor resource usage (CPU, memory, network)',
    'Test both response time and throughput',
    'Include performance tests in CI/CD',
    'Use production-like test environments',
    'Test with realistic data volumes',
    'Profile before optimizing',
    'Test under peak and sustained load',
    'Monitor for memory leaks during extended tests',
  ],
  antiPatterns: [
    {
      name: 'Production Load Testing',
      description: 'Running load tests against production',
      reason: 'Can cause outages and affect real users',
      alternative: 'Use staging environment with production-like data',
    },
    {
      name: 'Single-Metric Focus',
      description: 'Only measuring response time',
      reason: 'Miss throughput, resource, and concurrency issues',
      alternative: 'Track response time, throughput, errors, resources',
    },
  ],
  frameworkGuidance: {
    jest: ['Use for micro-benchmarks only'],
    vitest: ['Use bench() for micro-benchmarks'],
    mocha: ['Use for micro-benchmarks only'],
    pytest: ['Use pytest-benchmark for micro-benchmarks'],
    junit: ['Use JMH for micro-benchmarks'],
    testng: ['Use JMH with TestNG'],
    playwright: ['Use for frontend performance metrics'],
    cypress: ['Use for frontend performance metrics'],
    selenium: ['Limited - use dedicated perf tools'],
  },
  languageGuidance: {
    typescript: ['Use k6, artillery, or autocannon'],
    javascript: ['Use k6, artillery, or autocannon'],
    python: ['Use locust for load testing'],
    java: ['Use JMeter, Gatling, or k6'],
    go: ['Use vegeta or hey for load testing'],
    rust: ['Use criterion for benchmarks, drill for load'],
    csharp: ['Use NBomber or k6'],
    kotlin: ['Use Gatling with Kotlin DSL'],
  },
  examples: [],
};

// ============================================================================
// Guidance Registry
// ============================================================================

/**
 * All domain guidance templates
 */
export const QE_GUIDANCE_REGISTRY: Record<QEDomain, QEGuidance> = {
  'test-generation': TEST_GENERATION_GUIDANCE,
  'coverage-analysis': COVERAGE_ANALYSIS_GUIDANCE,
  'mutation-testing': MUTATION_TESTING_GUIDANCE,
  'api-testing': API_TESTING_GUIDANCE,
  'security-testing': SECURITY_TESTING_GUIDANCE,
  'visual-testing': VISUAL_TESTING_GUIDANCE,
  'accessibility': ACCESSIBILITY_GUIDANCE,
  'performance': PERFORMANCE_GUIDANCE,
};

// ============================================================================
// Guidance Provider Functions
// ============================================================================

/**
 * Get guidance for a specific domain
 */
export function getGuidance(domain: QEDomain): QEGuidance {
  return QE_GUIDANCE_REGISTRY[domain];
}

/**
 * Get framework-specific guidance
 */
export function getFrameworkGuidance(
  domain: QEDomain,
  framework: TestFramework
): string[] {
  const guidance = QE_GUIDANCE_REGISTRY[domain];
  return guidance.frameworkGuidance[framework] || [];
}

/**
 * Get language-specific guidance
 */
export function getLanguageGuidance(
  domain: QEDomain,
  language: ProgrammingLanguage
): string[] {
  const guidance = QE_GUIDANCE_REGISTRY[domain];
  return guidance.languageGuidance[language] || [];
}

/**
 * Get combined guidance for a specific context
 */
export function getCombinedGuidance(
  domain: QEDomain,
  context: {
    framework?: TestFramework;
    language?: ProgrammingLanguage;
    includeAntiPatterns?: boolean;
  }
): string[] {
  const guidance = QE_GUIDANCE_REGISTRY[domain];
  const combined: string[] = [...guidance.bestPractices];

  if (context.framework) {
    const frameworkGuide = guidance.frameworkGuidance[context.framework];
    if (frameworkGuide) {
      combined.push(...frameworkGuide.map((g) => `[${context.framework}] ${g}`));
    }
  }

  if (context.language) {
    const langGuide = guidance.languageGuidance[context.language];
    if (langGuide) {
      combined.push(...langGuide.map((g) => `[${context.language}] ${g}`));
    }
  }

  if (context.includeAntiPatterns) {
    for (const ap of guidance.antiPatterns) {
      combined.push(`[AVOID] ${ap.name}: ${ap.description}`);
    }
  }

  return combined;
}

/**
 * Check content against anti-patterns
 */
export function checkAntiPatterns(
  domain: QEDomain,
  content: string
): AntiPattern[] {
  const guidance = QE_GUIDANCE_REGISTRY[domain];
  const detected: AntiPattern[] = [];

  for (const antiPattern of guidance.antiPatterns) {
    if (antiPattern.detection) {
      const regex = new RegExp(antiPattern.detection, 'gi');
      if (regex.test(content)) {
        detected.push(antiPattern);
      }
    }
  }

  return detected;
}

/**
 * Generate Claude-visible guidance context
 */
export function generateGuidanceContext(
  domain: QEDomain,
  context: {
    framework?: TestFramework;
    language?: ProgrammingLanguage;
    taskDescription?: string;
  }
): string {
  const guidance = QE_GUIDANCE_REGISTRY[domain];
  const lines: string[] = [];

  lines.push(`## QE Guidance: ${domain}`);
  lines.push('');
  lines.push('### Best Practices');
  for (const practice of guidance.bestPractices.slice(0, 5)) {
    lines.push(`- ${practice}`);
  }

  if (context.framework) {
    const frameworkGuide = guidance.frameworkGuidance[context.framework];
    if (frameworkGuide && frameworkGuide.length > 0) {
      lines.push('');
      lines.push(`### ${context.framework} Tips`);
      for (const tip of frameworkGuide.slice(0, 3)) {
        lines.push(`- ${tip}`);
      }
    }
  }

  if (context.language) {
    const langGuide = guidance.languageGuidance[context.language];
    if (langGuide && langGuide.length > 0) {
      lines.push('');
      lines.push(`### ${context.language} Tips`);
      for (const tip of langGuide.slice(0, 3)) {
        lines.push(`- ${tip}`);
      }
    }
  }

  lines.push('');
  lines.push('### Anti-Patterns to Avoid');
  for (const ap of guidance.antiPatterns.slice(0, 3)) {
    lines.push(`- **${ap.name}**: ${ap.description}`);
  }

  return lines.join('\n');
}
