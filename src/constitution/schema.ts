/**
 * Constitution Schema - TypeScript Type Definitions
 *
 * Defines the structure for quality evaluation constitutions that govern
 * agent behavior and quality criteria in the Agentic QE Fleet.
 *
 * @module constitution/schema
 * @version 1.0.0
 */

/**
 * Priority levels for principles and rules
 */
export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

/**
 * Severity levels for rule violations
 */
export type SeverityLevel = 'error' | 'warning' | 'info';

/**
 * Aggregation methods for metrics
 */
export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'percentile';

/**
 * Condition operators for rule evaluation
 */
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'contains'
  | 'not_contains'
  | 'matches'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists';

/**
 * Action types when rules are triggered
 */
export type ActionType =
  | 'fail'
  | 'warn'
  | 'notify'
  | 'log'
  | 'block'
  | 'require_review'
  | 'auto_fix'
  | 'escalate';

/**
 * Threshold comparison modes
 */
export type ThresholdMode = 'absolute' | 'percentage' | 'relative';

/**
 * Constitution status
 */
export type ConstitutionStatus = 'active' | 'deprecated' | 'draft' | 'archived';

/**
 * Principle definition within a constitution
 * Represents a core quality principle that guides evaluation
 */
export interface Principle {
  /** Unique identifier for the principle */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description of the principle */
  description: string;
  /** Priority level for this principle */
  priority: PriorityLevel;
  /** Category grouping for the principle */
  category: string;
  /** Optional tags for filtering and search */
  tags?: string[];
  /** Whether this principle is mandatory */
  mandatory?: boolean;
  /** Related principle IDs */
  relatedPrinciples?: string[];
}

/**
 * Condition for rule evaluation
 */
export interface RuleCondition {
  /** The field or metric to evaluate */
  field: string;
  /** Comparison operator */
  operator: ConditionOperator;
  /** Value to compare against */
  value: string | number | boolean | string[] | number[];
  /** Optional unit for the value */
  unit?: string;
  /** Nested conditions for complex logic */
  and?: RuleCondition[];
  /** Alternative conditions */
  or?: RuleCondition[];
}

/**
 * Action to take when a rule is triggered
 */
export interface RuleAction {
  /** Type of action to perform */
  type: ActionType;
  /** Message to display or log */
  message: string;
  /** Additional parameters for the action */
  params?: Record<string, unknown>;
  /** Whether to halt further processing */
  stopProcessing?: boolean;
  /** Notification targets */
  notify?: string[];
}

/**
 * Rule definition linking principles to conditions and actions
 */
export interface Rule {
  /** Unique identifier for the rule */
  id: string;
  /** Human-readable name */
  name?: string;
  /** Reference to the principle this rule enforces */
  principleId: string;
  /** Condition that triggers the rule */
  condition: RuleCondition;
  /** Action to take when condition is met */
  action: RuleAction;
  /** Severity of rule violation */
  severity: SeverityLevel;
  /** Whether this rule is enabled */
  enabled?: boolean;
  /** Description of what this rule checks */
  description?: string;
  /** Remediation guidance when rule is violated */
  remediation?: string;
  /** Example of compliant code/configuration */
  examples?: string[];
}

/**
 * Metric definition for quality measurement
 */
export interface MetricDefinition {
  /** Unique identifier for the metric */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this metric measures */
  description?: string;
  /** Unit of measurement */
  unit: string;
  /** How to aggregate multiple values */
  aggregation: AggregationType;
  /** Target value to achieve */
  targetValue?: number;
  /** Value that triggers a warning */
  warningThreshold?: number;
  /** Value that triggers a critical alert */
  criticalThreshold?: number;
  /** Data type of the metric value */
  dataType?: 'number' | 'percentage' | 'duration' | 'count' | 'ratio';
  /** Whether higher values are better */
  higherIsBetter?: boolean;
  /** Formula for computed metrics */
  formula?: string;
  /** Dependencies on other metrics */
  dependencies?: string[];
  /** Percentile for percentile-based metrics */
  percentile?: number;
}

/**
 * Threshold definition for quality gates
 */
export interface Threshold {
  /** Unique identifier for the threshold */
  id: string;
  /** Reference to the metric this threshold applies to */
  metricId: string;
  /** Human-readable name */
  name?: string;
  /** Comparison mode */
  mode: ThresholdMode;
  /** Warning level value */
  warning: number;
  /** Critical level value */
  critical: number;
  /** Target value to aim for */
  target?: number;
  /** Whether to block on threshold violation */
  blocking?: boolean;
  /** Time period for the threshold evaluation */
  period?: string;
  /** Applicable environments */
  environments?: string[];
}

/**
 * Metadata about the constitution
 */
export interface ConstitutionMetadata {
  /** When the constitution was created */
  createdAt: string;
  /** When the constitution was last updated */
  updatedAt: string;
  /** Who created or maintains the constitution */
  author: string;
  /** Applicable agent types */
  applicableTo: string[];
  /** Parent constitution to inherit from */
  inheritsFrom?: string;
  /** Current status of the constitution */
  status: ConstitutionStatus;
  /** Optional expiration date */
  expiresAt?: string;
  /** Changelog entries */
  changelog?: ChangelogEntry[];
  /** Custom properties */
  customProperties?: Record<string, unknown>;
}

/**
 * Changelog entry for constitution version history
 */
export interface ChangelogEntry {
  /** Version number */
  version: string;
  /** Date of change */
  date: string;
  /** Description of changes */
  description: string;
  /** Who made the change */
  author?: string;
}

/**
 * Complete constitution definition
 */
export interface Constitution {
  /** Unique identifier for the constitution */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic version string */
  version: string;
  /** Description of the constitution's purpose */
  description: string;
  /** Core principles */
  principles: Principle[];
  /** Evaluation rules */
  rules: Rule[];
  /** Metric definitions */
  metrics: MetricDefinition[];
  /** Quality thresholds */
  thresholds: Threshold[];
  /** Constitution metadata */
  metadata: ConstitutionMetadata;
}

/**
 * Result of constitution validation
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** List of validation errors */
  errors: ValidationError[];
  /** List of validation warnings */
  warnings: ValidationWarning[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** JSON path to the error location */
  path: string;
  /** Error message */
  message: string;
  /** Error code */
  code: string;
  /** Expected value or type */
  expected?: string;
  /** Actual value received */
  actual?: string;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  /** JSON path to the warning location */
  path: string;
  /** Warning message */
  message: string;
  /** Warning code */
  code: string;
  /** Suggested improvement */
  suggestion?: string;
}

/**
 * Options for loading constitutions
 */
export interface LoadOptions {
  /** Whether to validate after loading */
  validate?: boolean;
  /** Whether to resolve inheritance */
  resolveInheritance?: boolean;
  /** Custom schema path */
  schemaPath?: string;
  /** Strict mode for validation */
  strict?: boolean;
}

/**
 * Options for merging constitutions
 */
export interface MergeOptions {
  /** Strategy for array merging */
  arrayStrategy?: 'replace' | 'concat' | 'merge';
  /** Whether to preserve base metadata */
  preserveMetadata?: boolean;
  /** Deep merge objects */
  deepMerge?: boolean;
}

/**
 * Agent type to constitution mapping
 */
export interface AgentConstitutionMapping {
  /** Agent type identifier */
  agentType: string;
  /** Primary constitution ID */
  constitutionId: string;
  /** Additional constitution IDs to apply */
  additionalConstitutions?: string[];
  /** Override settings */
  overrides?: Partial<Constitution>;
}

/**
 * Constitution evaluation context
 */
export interface EvaluationContext {
  /** Agent performing the evaluation */
  agentId: string;
  /** Agent type */
  agentType: string;
  /** Target being evaluated */
  target: string;
  /** Environment context */
  environment: string;
  /** Additional context data */
  data: Record<string, unknown>;
  /** Timestamp of evaluation */
  timestamp: string;
}

/**
 * Result of constitution evaluation
 */
export interface EvaluationResult {
  /** Overall pass/fail status */
  passed: boolean;
  /** Constitution that was evaluated */
  constitutionId: string;
  /** Individual rule results */
  ruleResults: RuleEvaluationResult[];
  /** Metric values collected */
  metricValues: MetricValue[];
  /** Threshold violations */
  thresholdViolations: ThresholdViolation[];
  /** Overall score (0-100) */
  score: number;
  /** Evaluation context */
  context: EvaluationContext;
  /** Duration of evaluation in ms */
  duration: number;
}

/**
 * Result of individual rule evaluation
 */
export interface RuleEvaluationResult {
  /** Rule ID */
  ruleId: string;
  /** Whether rule passed */
  passed: boolean;
  /** Actual value that was evaluated */
  actualValue: unknown;
  /** Message from the rule */
  message?: string;
  /** Action that was triggered */
  actionTaken?: ActionType;
}

/**
 * Collected metric value
 */
export interface MetricValue {
  /** Metric ID */
  metricId: string;
  /** Collected value */
  value: number;
  /** Unit of measurement */
  unit: string;
  /** Timestamp of collection */
  timestamp: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Threshold violation details
 */
export interface ThresholdViolation {
  /** Threshold ID */
  thresholdId: string;
  /** Metric ID */
  metricId: string;
  /** Actual value */
  actualValue: number;
  /** Threshold value that was violated */
  thresholdValue: number;
  /** Severity level */
  severity: 'warning' | 'critical';
  /** Whether this is blocking */
  blocking: boolean;
}

/**
 * Type guard to check if an object is a valid Constitution
 */
export function isConstitution(obj: unknown): obj is Constitution {
  if (!obj || typeof obj !== 'object') return false;
  const c = obj as Partial<Constitution>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.version === 'string' &&
    typeof c.description === 'string' &&
    Array.isArray(c.principles) &&
    Array.isArray(c.rules) &&
    Array.isArray(c.metrics) &&
    Array.isArray(c.thresholds) &&
    c.metadata !== undefined
  );
}

/**
 * Type guard to check if an object is a valid Principle
 */
export function isPrinciple(obj: unknown): obj is Principle {
  if (!obj || typeof obj !== 'object') return false;
  const p = obj as Partial<Principle>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.description === 'string' &&
    ['critical', 'high', 'medium', 'low'].includes(p.priority as string) &&
    typeof p.category === 'string'
  );
}

/**
 * Type guard to check if an object is a valid Rule
 */
export function isRule(obj: unknown): obj is Rule {
  if (!obj || typeof obj !== 'object') return false;
  const r = obj as Partial<Rule>;
  return (
    typeof r.id === 'string' &&
    typeof r.principleId === 'string' &&
    r.condition !== undefined &&
    r.action !== undefined &&
    ['error', 'warning', 'info'].includes(r.severity as string)
  );
}

/**
 * Type guard to check if an object is a valid MetricDefinition
 */
export function isMetricDefinition(obj: unknown): obj is MetricDefinition {
  if (!obj || typeof obj !== 'object') return false;
  const m = obj as Partial<MetricDefinition>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.unit === 'string' &&
    ['sum', 'avg', 'min', 'max', 'count', 'percentile'].includes(m.aggregation as string)
  );
}
