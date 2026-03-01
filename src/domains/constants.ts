/**
 * Domain Module Constants
 *
 * Centralizes all magic numbers used across domain coordinators and services.
 * Each domain may have its own specific constants file, but common constants
 * shared across domains are defined here.
 *
 * @see ADR-051: LLM-Powered Analysis
 */

// ============================================================================
// Test Execution Constants
// ============================================================================

export const TEST_EXECUTION_CONSTANTS = {
  /**
   * Default timeout for test execution in milliseconds.
   * 60 seconds covers most test suites.
   */
  DEFAULT_TEST_TIMEOUT_MS: 60000, // 1 minute

  /**
   * Default timeout for individual test files.
   * 30 seconds per file is reasonable.
   */
  DEFAULT_FILE_TIMEOUT_MS: 30000, // 30 seconds

  /**
   * Default viewport width for E2E tests.
   */
  DEFAULT_VIEWPORT_WIDTH: 1280,

  /**
   * Default viewport height for E2E tests.
   */
  DEFAULT_VIEWPORT_HEIGHT: 720,

  /**
   * Maximum number of test results to retain.
   */
  MAX_RESULTS: 1000,

  /**
   * Retention period for test results.
   * 24 hours of history.
   */
  RESULT_RETENTION_MS: 86400000, // 24 hours

  /**
   * Maximum number of tests to track for flaky detection.
   */
  MAX_TESTS_TRACKED: 10000,

  /**
   * Maximum execution history entries per test.
   */
  MAX_EXECUTION_HISTORY: 100,

  /**
   * Cache TTL for flaky analysis results.
   * 1 hour prevents stale analysis.
   */
  ANALYSIS_CACHE_TTL_MS: 3600000, // 1 hour

  /**
   * Maximum number of retry history entries.
   */
  MAX_RETRY_HISTORY: 50,

  /**
   * Maximum actions to record in user flow.
   */
  MAX_ACTIONS_PER_RECORDING: 1000,

  /**
   * Maximum recording duration.
   * 30 minutes prevents runaway recordings.
   */
  MAX_RECORDING_DURATION_MS: 30 * 60 * 1000, // 30 minutes

  /**
   * Maximum workers for parallel test execution.
   */
  MAX_WORKERS: 32,
} as const;

// ============================================================================
// E2E Testing Constants
// ============================================================================

export const E2E_CONSTANTS = {
  /**
   * Default step timeout for E2E tests.
   * 30 seconds per step is reasonable.
   */
  DEFAULT_STEP_TIMEOUT_MS: 30000,

  /**
   * Default retry delay between step attempts.
   */
  RETRY_DELAY_MS: 1000,

  /**
   * Default maximum retries per step.
   */
  DEFAULT_MAX_RETRIES: 3,

  /**
   * Polling interval for element detection.
   */
  POLLING_INTERVAL_MS: 100,

  /**
   * Short timeout for element detection.
   */
  ELEMENT_DETECTION_TIMEOUT_MS: 1000,

  /**
   * Delay after interactions for stability.
   */
  POST_INTERACTION_DELAY_MS: 500,

  /**
   * Default wait time in generated tests.
   */
  DEFAULT_WAIT_MS: 1000,

  /**
   * Accessibility check timeout (longer due to analysis).
   */
  ACCESSIBILITY_TIMEOUT_MS: 60000,

  /**
   * Screenshot quality percentage.
   */
  SCREENSHOT_QUALITY: 80,

  /**
   * Type debounce delay for input fields.
   */
  TYPE_DEBOUNCE_MS: 300,
} as const;

// ============================================================================
// Retry Handler Constants
// ============================================================================

export const RETRY_CONSTANTS = {
  /**
   * Base delay for exponential backoff.
   */
  BASE_DELAY_MS: 1000,

  /**
   * Maximum delay cap for exponential backoff.
   */
  MAX_DELAY_MS: 30000,

  /**
   * Default flaky rate simulation.
   * 30% of tests are flaky in simulation mode.
   */
  DEFAULT_FLAKY_RATE: 0.3,

  /**
   * Default pass rate for flaky tests.
   * 70% chance of passing on retry.
   */
  DEFAULT_FLAKY_PASS_RATE: 0.7,

  /**
   * Default retry pass rate variation.
   * +/- 10% variation.
   */
  RETRY_PASS_RATE_VARIATION: 0.1,

  /**
   * Grace period before sending SIGKILL after SIGTERM.
   */
  SIGKILL_GRACE_PERIOD_MS: 1000,
} as const;

// ============================================================================
// Contract Testing Constants
// ============================================================================

export const CONTRACT_CONSTANTS = {
  /**
   * Default contract validation timeout.
   */
  DEFAULT_TIMEOUT_MS: 60000, // 1 minute

  /**
   * Short timeout for quick operations.
   */
  QUICK_TIMEOUT_MS: 10000,

  /**
   * Maximum cached contract validations.
   */
  MAX_CACHED_VALIDATIONS: 1000,

  /**
   * Cache TTL for validation results.
   * 1 hour prevents stale validations.
   */
  CACHE_TTL_MS: 3600000, // 1 hour

  /**
   * TTL for stored contracts.
   * 24 hours of retention.
   */
  CONTRACT_TTL_SECONDS: 86400, // 24 hours

  /**
   * TTL for API compatibility migrations.
   * 90 days of retention.
   */
  MIGRATION_TTL_SECONDS: 86400 * 90, // 90 days

  /**
   * Maximum recursion depth for schema validation.
   */
  MAX_RECURSION_DEPTH: 10,

  /**
   * Maximum schema depth for complex contracts.
   */
  MAX_SCHEMA_DEPTH: 20,

  /**
   * Maximum migration steps to generate.
   */
  MAX_MIGRATION_STEPS: 50,

  /**
   * Default search limit for contract queries.
   */
  DEFAULT_SEARCH_LIMIT: 100,

  /**
   * Threshold for high-impact breaking changes.
   */
  HIGH_IMPACT_THRESHOLD: 5,

  /**
   * Threshold for triggering major version bump.
   */
  BREAKING_CHANGE_THRESHOLD: 10,

  /**
   * Default provider load assumption.
   * 50% represents moderate load.
   */
  DEFAULT_PROVIDER_LOAD: 50,

  /**
   * High provider load threshold.
   * Above 80% indicates stress.
   */
  HIGH_PROVIDER_LOAD_THRESHOLD: 80,
} as const;

// ============================================================================
// Quality Assessment Constants
// ============================================================================

export const QUALITY_CONSTANTS = {
  /**
   * Minimum passing rate for quality gate.
   * Below 95% triggers warnings.
   */
  PASSING_RATE_WARNING_THRESHOLD: 95,

  /**
   * Critical passing rate threshold.
   * Below 80% is high severity.
   */
  PASSING_RATE_CRITICAL_THRESHOLD: 80,

  /**
   * Minimum coverage for deployment readiness.
   */
  MIN_COVERAGE_FOR_DEPLOY: 80,

  /**
   * Perfect passing rate for deployment.
   */
  PERFECT_PASSING_RATE: 100,

  /**
   * Quality metric retention period.
   * 7 days of history.
   */
  METRIC_TTL_SECONDS: 86400 * 7, // 7 days

  /**
   * Standard metric retention period.
   * 24 hours of detailed data.
   */
  STANDARD_METRIC_TTL_SECONDS: 86400, // 24 hours

  /**
   * Maximum vulnerability impact on score.
   * High vulns capped at 30% impact.
   */
  MAX_HIGH_VULN_IMPACT: 0.3,

  /**
   * Medium vulnerability impact divisor.
   * Medium vulns have 1/20th impact.
   */
  MEDIUM_VULN_IMPACT: 0.1,

  /**
   * Maximum duplication percentage before penalty.
   * Above 20% indicates excessive duplication.
   */
  MAX_DUPLICATION_PERCENT: 20,
} as const;

// ============================================================================
// Security Compliance Constants
// ============================================================================

export const SECURITY_CONSTANTS = {
  /**
   * Starting score for security assessment.
   */
  BASE_SECURITY_SCORE: 100,

  /**
   * Target compliance score.
   */
  TARGET_COMPLIANCE_SCORE: 100,

  /**
   * HTTP OK status code.
   */
  HTTP_OK: 200,

  /**
   * HTTP Created status code.
   */
  HTTP_CREATED: 201,

  /**
   * HTTP Unauthorized status code.
   */
  HTTP_UNAUTHORIZED: 401,

  /**
   * HTTP Forbidden status code.
   */
  HTTP_FORBIDDEN: 403,

  /**
   * HTTP Too Many Requests status code.
   */
  HTTP_TOO_MANY_REQUESTS: 429,
} as const;

// ============================================================================
// Visual Accessibility Constants
// ============================================================================

export const VISUAL_CONSTANTS = {
  /**
   * Mobile viewport width threshold.
   */
  MOBILE_WIDTH_THRESHOLD: 480,

  /**
   * Small mobile viewport width.
   */
  SMALL_MOBILE_WIDTH: 320,

  /**
   * Tablet viewport width threshold.
   */
  TABLET_WIDTH_THRESHOLD: 768,

  /**
   * Desktop viewport width threshold.
   */
  DESKTOP_WIDTH_THRESHOLD: 1024,

  /**
   * Large desktop viewport width threshold.
   */
  LARGE_DESKTOP_WIDTH_THRESHOLD: 1440,

  /**
   * Starting score for visual tests.
   */
  BASE_VISUAL_SCORE: 100,

  /**
   * Base load time estimate.
   * 800ms baseline for page loads.
   */
  BASE_LOAD_TIME_MS: 800,

  /**
   * Additional load time for long URLs.
   */
  LONG_URL_LOAD_PENALTY_MS: 200,

  /**
   * Additional load time for query parameters.
   */
  QUERY_PARAM_LOAD_PENALTY_MS: 150,

  /**
   * Additional load time for complex pages.
   */
  COMPLEX_PAGE_LOAD_PENALTY_MS: 300,

  /**
   * Load time reduction for API endpoints.
   */
  API_LOAD_BONUS_MS: 200,

  /**
   * Load time reduction for mobile viewports.
   */
  MOBILE_LOAD_BONUS_MS: 100,

  /**
   * Default axe-core timeout.
   */
  AXE_DEFAULT_TIMEOUT_MS: 10000,

  /**
   * Extended axe-core timeout for complex pages.
   */
  AXE_EXTENDED_TIMEOUT_MS: 30000,

  /**
   * Retry delay for visual operations.
   */
  VISUAL_RETRY_DELAY_MS: 200,

  /**
   * Render time variance range.
   */
  RENDER_TIME_VARIANCE_MS: 1000,

  /**
   * Load time variance range.
   */
  LOAD_TIME_VARIANCE_MS: 2000,
} as const;

// ============================================================================
// Chaos Resilience Constants
// ============================================================================

export const CHAOS_CONSTANTS = {
  /**
   * Default chunk size for file operations.
   * 1MB chunks for memory testing.
   */
  CHUNK_SIZE_BYTES: 1024 * 1024, // 1MB

  /**
   * Default spike interval for load testing.
   * 30 seconds between spikes.
   */
  SPIKE_INTERVAL_MS: 30000,

  /**
   * Duration of load spikes.
   * 5 seconds of elevated load.
   */
  SPIKE_DURATION_MS: 5000,
} as const;

// ============================================================================
// Test Prioritization Constants
// ============================================================================

export const PRIORITIZATION_CONSTANTS = {
  /**
   * Weight for failure probability in prioritization.
   */
  FAILURE_PROBABILITY_WEIGHT: 30,

  /**
   * Weight for flakiness in prioritization.
   */
  FLAKINESS_WEIGHT: 15,

  /**
   * Weight for complexity in prioritization.
   */
  COMPLEXITY_WEIGHT: 10,

  /**
   * Weight for coverage gap in prioritization.
   */
  COVERAGE_GAP_WEIGHT: 20,

  /**
   * Weight for criticality in prioritization.
   */
  CRITICALITY_WEIGHT: 15,

  /**
   * Critical priority score threshold.
   */
  CRITICAL_THRESHOLD: 60,

  /**
   * High priority score threshold.
   */
  HIGH_THRESHOLD: 45,

  /**
   * Standard priority score threshold.
   */
  STANDARD_THRESHOLD: 30,

  /**
   * Low priority score threshold.
   */
  LOW_THRESHOLD: 15,

  /**
   * Priority score mapping.
   */
  PRIORITY_SCORES: {
    critical: 100,
    high: 75,
    standard: 50,
    low: 25,
  } as const,

  /**
   * Recent history window for analysis.
   */
  RECENT_HISTORY_SIZE: 10,

  /**
   * Sample confidence baseline.
   * Confidence reaches 1.0 at 20 samples.
   */
  SAMPLE_CONFIDENCE_BASELINE: 20,
} as const;

// ============================================================================
// Risk Assessment Constants
// ============================================================================

export const RISK_CONSTANTS = {
  /**
   * Maximum test duration for scoring.
   * 1 minute as baseline.
   */
  MAX_DURATION_MS: 60000,

  /**
   * Maximum test age for scoring.
   * 1 week as baseline.
   */
  MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 1 week

  /**
   * One year in days for age calculations.
   */
  DAYS_IN_YEAR: 365,

  /**
   * Maximum dependency count for complexity scoring.
   */
  MAX_DEPENDENCY_COUNT: 10,
} as const;

// ============================================================================
// LLM Analysis Constants (ADR-051)
// ============================================================================

export const LLM_ANALYSIS_CONSTANTS = {
  /**
   * Maximum tokens for LLM responses.
   */
  MAX_TOKENS: 2048,

  /**
   * Truncation length for error messages.
   */
  ERROR_TRUNCATION_LENGTH: 200,

  /**
   * Truncation length for stdout/stderr.
   */
  OUTPUT_TRUNCATION_LENGTH: 500,

  /**
   * Truncation length for detailed output.
   */
  DETAILED_OUTPUT_TRUNCATION_LENGTH: 1000,

  /**
   * Model tier mapping.
   */
  MODEL_TIERS: {
    1: 'claude-3-haiku-20240307',
    2: 'claude-sonnet-4-20250514',
    3: 'claude-sonnet-4-20250514',
    4: 'claude-opus-4-20250514',
  } as const,
} as const;

// Type exports for const assertion inference
export type TestExecutionConstants = typeof TEST_EXECUTION_CONSTANTS;
export type E2EConstants = typeof E2E_CONSTANTS;
export type RetryConstants = typeof RETRY_CONSTANTS;
export type ContractConstants = typeof CONTRACT_CONSTANTS;
export type QualityConstants = typeof QUALITY_CONSTANTS;
export type SecurityConstants = typeof SECURITY_CONSTANTS;
export type VisualConstants = typeof VISUAL_CONSTANTS;
export type ChaosConstants = typeof CHAOS_CONSTANTS;
export type PrioritizationConstants = typeof PRIORITIZATION_CONSTANTS;
export type RiskConstants = typeof RISK_CONSTANTS;
export type LLMAnalysisConstants = typeof LLM_ANALYSIS_CONSTANTS;
