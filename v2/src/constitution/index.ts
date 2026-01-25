/**
 * Constitution Module - Main Entry Point
 *
 * Provides the complete constitution framework for the Agentic QE Fleet,
 * enabling quality evaluation criteria definition and validation.
 *
 * @module constitution
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   loadConstitution,
 *   validateConstitution,
 *   getConstitutionForAgent,
 *   Constitution,
 *   Principle,
 *   Rule
 * } from './constitution';
 *
 * // Load a specific constitution
 * const constitution = loadConstitution('./path/to/constitution.json');
 *
 * // Get constitution for an agent type
 * const agentConstitution = getConstitutionForAgent('test-generator');
 *
 * // Validate a constitution object
 * const result = validateConstitution(myConstitution);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */

// Export all types from schema
export type {
  // Core types
  Constitution,
  Principle,
  Rule,
  MetricDefinition,
  Threshold,
  ConstitutionMetadata,

  // Sub-types
  RuleCondition,
  RuleAction,
  ChangelogEntry,

  // Result types
  ValidationResult,
  ValidationError,
  ValidationWarning,
  EvaluationResult,
  EvaluationContext,
  RuleEvaluationResult,
  MetricValue,
  ThresholdViolation,

  // Option types
  LoadOptions,
  MergeOptions,
  AgentConstitutionMapping,

  // Enum types
  PriorityLevel,
  SeverityLevel,
  AggregationType,
  ConditionOperator,
  ActionType,
  ThresholdMode,
  ConstitutionStatus
} from './schema';

// Export type guards
export {
  isConstitution,
  isPrinciple,
  isRule,
  isMetricDefinition
} from './schema';

// Export loader class and functions
export {
  ConstitutionLoader,
  getDefaultLoader,
  loadConstitution,
  loadConstitutions,
  mergeConstitutions,
  validateConstitution,
  getConstitutionForAgent,
  getBaseConstitutionsPath,
  listAvailableConstitutions
} from './loader';

// Re-export for convenience
import {
  ConstitutionLoader,
  getBaseConstitutionsPath,
  listAvailableConstitutions
} from './loader';
import { Constitution } from './schema';
import * as path from 'path';

/**
 * Load the default constitution
 *
 * @returns The default base constitution
 */
export function loadDefaultConstitution(): Constitution {
  const loader = new ConstitutionLoader();
  const basePath = getBaseConstitutionsPath();
  return loader.loadConstitution(
    path.join(basePath, 'default.constitution.json')
  );
}

/**
 * Load the test generation constitution
 *
 * @returns The test generation constitution (merged with default)
 */
export function loadTestGenerationConstitution(): Constitution {
  const loader = new ConstitutionLoader();
  const basePath = getBaseConstitutionsPath();
  return loader.loadConstitution(
    path.join(basePath, 'test-generation.constitution.json'),
    { resolveInheritance: true }
  );
}

/**
 * Load the code review constitution
 *
 * @returns The code review constitution (merged with default)
 */
export function loadCodeReviewConstitution(): Constitution {
  const loader = new ConstitutionLoader();
  const basePath = getBaseConstitutionsPath();
  return loader.loadConstitution(
    path.join(basePath, 'code-review.constitution.json'),
    { resolveInheritance: true }
  );
}

/**
 * Load the performance testing constitution
 *
 * @returns The performance testing constitution (merged with default)
 */
export function loadPerformanceConstitution(): Constitution {
  const loader = new ConstitutionLoader();
  const basePath = getBaseConstitutionsPath();
  return loader.loadConstitution(
    path.join(basePath, 'performance.constitution.json'),
    { resolveInheritance: true }
  );
}

/**
 * Get all available base constitutions
 *
 * @returns Map of constitution ID to Constitution object
 */
export function loadAllBaseConstitutions(): Map<string, Constitution> {
  const loader = new ConstitutionLoader();
  const basePath = getBaseConstitutionsPath();
  return loader.loadConstitutions(basePath, { resolveInheritance: true });
}

/**
 * Constitution module version
 */
export const CONSTITUTION_VERSION = '1.0.0';

/**
 * Supported constitution schema version
 */
export const SCHEMA_VERSION = 'draft-07';

/**
 * Default constitution IDs
 */
export const DEFAULT_CONSTITUTIONS = {
  DEFAULT: 'default',
  TEST_GENERATION: 'test-generation',
  CODE_REVIEW: 'code-review',
  PERFORMANCE: 'performance'
} as const;

/**
 * Agent type to default constitution mapping
 */
export const AGENT_CONSTITUTION_MAP: Record<string, string> = {
  'test-generator': 'test-generation',
  'qe-test-generator': 'test-generation',
  'code-reviewer': 'code-review',
  'qe-code-reviewer': 'code-review',
  'quality-analyzer': 'code-review',
  'performance-tester': 'performance',
  'qe-performance-tester': 'performance',
  // Other agents fall back to default
  'coverage-analyzer': 'default',
  'security-scanner': 'default',
  'quality-gate': 'default',
  'flaky-test-hunter': 'default',
  'requirements-validator': 'default',
  'production-intelligence': 'default',
  'deployment-readiness': 'default',
  'regression-risk-analyzer': 'default',
  'test-data-architect': 'default',
  'api-contract-validator': 'default'
};

/**
 * Get the recommended constitution ID for an agent type
 *
 * @param agentType - The agent type
 * @returns The recommended constitution ID
 */
export function getRecommendedConstitutionId(agentType: string): string {
  return AGENT_CONSTITUTION_MAP[agentType] || 'default';
}

/**
 * Summary information about the constitution module
 */
export function getConstitutionModuleInfo(): {
  version: string;
  schemaVersion: string;
  availableConstitutions: string[];
  basePath: string;
} {
  return {
    version: CONSTITUTION_VERSION,
    schemaVersion: SCHEMA_VERSION,
    availableConstitutions: listAvailableConstitutions(),
    basePath: getBaseConstitutionsPath()
  };
}
