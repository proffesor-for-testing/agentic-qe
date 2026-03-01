/**
 * A2UI QE-Specific Component Catalog
 *
 * Defines Quality Engineering specific components for AQE v3.
 * These components extend the standard A2UI catalog with QE domain visualizations.
 *
 * @module adapters/a2ui/catalog/qe-catalog
 */

import type {
  BoundValue,
  A2UIAccessibility,
  ComponentMetadata,
} from './standard-catalog.js';

// ============================================================================
// QE Domain Types
// ============================================================================

/**
 * Test status values
 */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'running' | 'pending';

/**
 * Vulnerability severity levels
 */
export type VulnerabilitySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Quality gate status
 */
export type QualityGateStatus = 'passed' | 'failed' | 'warning' | 'unknown';

/**
 * WCAG conformance levels
 */
export type WCAGLevel = 'A' | 'AA' | 'AAA';

/**
 * Accessibility impact levels
 */
export type A11yImpact = 'critical' | 'serious' | 'moderate' | 'minor';

// ============================================================================
// Quality Metric Types
// ============================================================================

/**
 * Quality metric for quality gate evaluation
 */
export interface QualityMetric {
  /** Metric name */
  readonly name: string;
  /** Current value */
  readonly value: number;
  /** Target threshold */
  readonly threshold: number;
  /** Whether the metric is passing */
  readonly passing: boolean;
  /** Metric unit (e.g., '%', 'ms', 'count') */
  readonly unit?: string;
  /** Trend direction */
  readonly trend?: 'up' | 'down' | 'stable';
}

/**
 * Test event for timeline visualization
 */
export interface TestEvent {
  /** Event ID */
  readonly id: string;
  /** Test name */
  readonly name: string;
  /** Event status */
  readonly status: TestStatus;
  /** Start time (ISO 8601) */
  readonly startTime: string;
  /** End time (ISO 8601) */
  readonly endTime?: string;
  /** Duration in milliseconds */
  readonly duration?: number;
  /** Error message if failed */
  readonly error?: string;
  /** Test file path */
  readonly file?: string;
  /** Test suite name */
  readonly suite?: string;
}

/**
 * CVSS score information
 */
export interface CVSSScore {
  /** Base score (0-10) */
  readonly base: number;
  /** Vector string */
  readonly vector?: string;
  /** Version (e.g., '3.1') */
  readonly version?: string;
}

/**
 * Vulnerability details
 */
export interface VulnerabilityDetails {
  /** CVE identifier */
  readonly cveId?: string;
  /** CWE identifier */
  readonly cweId?: string;
  /** CVSS score information */
  readonly cvss?: CVSSScore;
  /** Affected component/package */
  readonly affectedComponent?: string;
  /** Affected version range */
  readonly affectedVersions?: string;
  /** Fixed version */
  readonly fixedVersion?: string;
  /** External reference URLs */
  readonly references?: string[];
}

/**
 * Accessibility finding details
 */
export interface A11yFindingDetails {
  /** CSS selector for the element */
  readonly selector?: string;
  /** HTML snippet of the element */
  readonly html?: string;
  /** Suggested fix */
  readonly suggestion?: string;
  /** WCAG success criterion */
  readonly successCriterion?: string;
  /** Help URL */
  readonly helpUrl?: string;
}

// ============================================================================
// QE-Specific Components
// ============================================================================

/**
 * CoverageGauge component - circular gauge showing coverage percentage
 */
export interface CoverageGaugeComponent {
  readonly type: 'qe:coverageGauge';
  /** Current coverage percentage (0-100) */
  readonly coverage: BoundValue<number>;
  /** Target coverage percentage */
  readonly target?: number;
  /** Whether to show the percentage label */
  readonly showLabel?: boolean;
  /** Gauge size */
  readonly size?: 'small' | 'medium' | 'large';
  /** Color scheme */
  readonly colorScheme?: 'default' | 'traffic-light' | 'monochrome';
  /** Label text (defaults to 'Coverage') */
  readonly label?: BoundValue<string>;
  /** Coverage type (line, branch, function, statement) */
  readonly coverageType?: 'line' | 'branch' | 'function' | 'statement' | 'overall';
  /** Animation on value change */
  readonly animated?: boolean;
  /** Show trend indicator */
  readonly showTrend?: boolean;
  /** Previous coverage value for trend calculation */
  readonly previousCoverage?: BoundValue<number>;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * TestStatusBadge component - badge showing test pass/fail/skip status
 */
export interface TestStatusBadgeComponent {
  readonly type: 'qe:testStatusBadge';
  /** Test status */
  readonly status: BoundValue<TestStatus>;
  /** Count of tests with this status */
  readonly count?: BoundValue<number>;
  /** Duration in milliseconds */
  readonly duration?: BoundValue<number>;
  /** Badge size */
  readonly size?: 'small' | 'medium' | 'large';
  /** Whether to show the count */
  readonly showCount?: boolean;
  /** Whether to show the duration */
  readonly showDuration?: boolean;
  /** Whether to show an icon */
  readonly showIcon?: boolean;
  /** Click action */
  readonly onClick?: string;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * VulnerabilityCard component - card displaying security finding details
 */
export interface VulnerabilityCardComponent {
  readonly type: 'qe:vulnerabilityCard';
  /** Vulnerability severity */
  readonly severity: BoundValue<VulnerabilitySeverity>;
  /** Vulnerability title */
  readonly title: BoundValue<string>;
  /** CVE identifier */
  readonly cveId?: BoundValue<string>;
  /** Vulnerability description */
  readonly description?: BoundValue<string>;
  /** Additional vulnerability details */
  readonly details?: BoundValue<VulnerabilityDetails>;
  /** Remediation guidance */
  readonly remediation?: BoundValue<string>;
  /** Whether the card is expandable */
  readonly expandable?: boolean;
  /** Whether the card is expanded by default */
  readonly expanded?: BoundValue<boolean>;
  /** Action button label */
  readonly actionLabel?: string;
  /** Action to trigger */
  readonly onAction?: string;
  /** Dismiss action */
  readonly onDismiss?: string;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * QualityGateIndicator component - traffic light indicator for quality gates
 */
export interface QualityGateIndicatorComponent {
  readonly type: 'qe:qualityGateIndicator';
  /** Overall gate status */
  readonly status: BoundValue<QualityGateStatus>;
  /** Individual quality metrics */
  readonly metrics: BoundValue<QualityMetric[]>;
  /** Gate name */
  readonly name?: BoundValue<string>;
  /** Whether to show individual metrics */
  readonly showMetrics?: boolean;
  /** Whether to show metric values */
  readonly showValues?: boolean;
  /** Indicator style */
  readonly style?: 'traffic-light' | 'badge' | 'detailed';
  /** Click action for details */
  readonly onClick?: string;
  /** Timestamp of last evaluation */
  readonly lastEvaluated?: BoundValue<string>;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * A11yFindingCard component - card for accessibility violations
 */
export interface A11yFindingCardComponent {
  readonly type: 'qe:a11yFindingCard';
  /** WCAG conformance level */
  readonly wcagLevel: BoundValue<WCAGLevel>;
  /** Rule/guideline violated */
  readonly rule: BoundValue<string>;
  /** Affected element selector or description */
  readonly element?: BoundValue<string>;
  /** Impact level */
  readonly impact: BoundValue<A11yImpact>;
  /** Finding description */
  readonly description?: BoundValue<string>;
  /** Additional finding details */
  readonly details?: BoundValue<A11yFindingDetails>;
  /** Whether the card is expandable */
  readonly expandable?: boolean;
  /** Whether the card is expanded by default */
  readonly expanded?: BoundValue<boolean>;
  /** Fix suggestion */
  readonly suggestion?: BoundValue<string>;
  /** Link to more information */
  readonly helpUrl?: BoundValue<string>;
  /** Action to trigger */
  readonly onAction?: string;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * TestTimeline component - horizontal timeline of test execution
 */
export interface TestTimelineComponent {
  readonly type: 'qe:testTimeline';
  /** Test execution events */
  readonly events: BoundValue<TestEvent[]>;
  /** Total duration in milliseconds */
  readonly duration?: BoundValue<number>;
  /** Timeline start time (ISO 8601) */
  readonly startTime?: BoundValue<string>;
  /** Timeline end time (ISO 8601) */
  readonly endTime?: BoundValue<string>;
  /** Whether to show event labels */
  readonly showLabels?: boolean;
  /** Whether to show duration labels */
  readonly showDuration?: boolean;
  /** Timeline orientation */
  readonly orientation?: 'horizontal' | 'vertical';
  /** Event click action */
  readonly onEventClick?: string;
  /** Zoom level (1-10) */
  readonly zoom?: BoundValue<number>;
  /** Filter by status */
  readonly filterStatus?: TestStatus[];
  /** Group by suite */
  readonly groupBySuite?: boolean;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * DefectDensityChart component - visualization of defect density metrics
 */
export interface DefectDensityChartComponent {
  readonly type: 'qe:defectDensityChart';
  /** Defects per module/area */
  readonly data: BoundValue<Array<{ name: string; defects: number; lines: number }>>;
  /** Chart type */
  readonly chartType?: 'bar' | 'heatmap' | 'treemap';
  /** Title */
  readonly title?: BoundValue<string>;
  /** Color scheme */
  readonly colorScheme?: 'default' | 'severity' | 'monochrome';
  /** Whether to show values */
  readonly showValues?: boolean;
  /** Click action for module */
  readonly onModuleClick?: string;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * FlakySummary component - summary of flaky test analysis
 */
export interface FlakySummaryComponent {
  readonly type: 'qe:flakySummary';
  /** Number of flaky tests detected */
  readonly flakyCount: BoundValue<number>;
  /** Total test count */
  readonly totalTests: BoundValue<number>;
  /** Most flaky tests */
  readonly topFlaky?: BoundValue<Array<{ name: string; flakyRate: number }>>;
  /** Whether to show the top flaky list */
  readonly showTopFlaky?: boolean;
  /** Number of top flaky tests to show */
  readonly topCount?: number;
  /** Click action for flaky test */
  readonly onTestClick?: string;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

// ============================================================================
// QE Component Types Union
// ============================================================================

/**
 * All QE-specific component type names
 */
export type QEComponentType =
  | 'qe:coverageGauge'
  | 'qe:testStatusBadge'
  | 'qe:vulnerabilityCard'
  | 'qe:qualityGateIndicator'
  | 'qe:a11yFindingCard'
  | 'qe:testTimeline'
  | 'qe:defectDensityChart'
  | 'qe:flakySummary';

/**
 * Union of all QE-specific component definitions
 */
export type QEComponent =
  | CoverageGaugeComponent
  | TestStatusBadgeComponent
  | VulnerabilityCardComponent
  | QualityGateIndicatorComponent
  | A11yFindingCardComponent
  | TestTimelineComponent
  | DefectDensityChartComponent
  | FlakySummaryComponent;

// ============================================================================
// QE Catalog Definition
// ============================================================================

/**
 * QE-specific component metadata
 */
export interface QEComponentMetadata extends ComponentMetadata {
  /** QE domain this component belongs to */
  readonly qeDomain: string;
  /** Whether the component displays real-time data */
  readonly realTime: boolean;
  /** Related QE domains */
  readonly relatedDomains?: string[];
}

/**
 * QE-specific A2UI catalog with metadata for all QE components
 */
export const QE_CATALOG: Record<QEComponentType, QEComponentMetadata> = {
  'qe:coverageGauge': {
    type: 'qe:coverageGauge',
    displayName: 'Coverage Gauge',
    description: 'Circular gauge showing code coverage percentage with target threshold',
    category: 'display',
    requiredProps: ['coverage'],
    optionalProps: [
      'target',
      'showLabel',
      'size',
      'colorScheme',
      'label',
      'coverageType',
      'animated',
      'showTrend',
      'previousCoverage',
      'accessibility',
    ],
    hasChildren: false,
    supportsAccessibility: true,
    qeDomain: 'coverage-analysis',
    realTime: true,
    relatedDomains: ['test-execution', 'quality-assessment'],
  },
  'qe:testStatusBadge': {
    type: 'qe:testStatusBadge',
    displayName: 'Test Status Badge',
    description: 'Badge showing test execution status with count and duration',
    category: 'display',
    requiredProps: ['status'],
    optionalProps: ['count', 'duration', 'size', 'showCount', 'showDuration', 'showIcon', 'onClick', 'accessibility'],
    hasChildren: false,
    supportsAccessibility: true,
    qeDomain: 'test-execution',
    realTime: true,
    relatedDomains: ['test-generation', 'quality-assessment'],
  },
  'qe:vulnerabilityCard': {
    type: 'qe:vulnerabilityCard',
    displayName: 'Vulnerability Card',
    description: 'Card displaying security vulnerability details with remediation guidance',
    category: 'container',
    requiredProps: ['severity', 'title'],
    optionalProps: [
      'cveId',
      'description',
      'details',
      'remediation',
      'expandable',
      'expanded',
      'actionLabel',
      'onAction',
      'onDismiss',
      'accessibility',
    ],
    hasChildren: false,
    supportsAccessibility: true,
    qeDomain: 'security-compliance',
    realTime: false,
    relatedDomains: ['quality-assessment', 'defect-intelligence'],
  },
  'qe:qualityGateIndicator': {
    type: 'qe:qualityGateIndicator',
    displayName: 'Quality Gate Indicator',
    description: 'Traffic light indicator showing quality gate pass/fail status with metrics',
    category: 'display',
    requiredProps: ['status', 'metrics'],
    optionalProps: ['name', 'showMetrics', 'showValues', 'style', 'onClick', 'lastEvaluated', 'accessibility'],
    hasChildren: false,
    supportsAccessibility: true,
    qeDomain: 'quality-assessment',
    realTime: true,
    relatedDomains: ['coverage-analysis', 'test-execution', 'security-compliance'],
  },
  'qe:a11yFindingCard': {
    type: 'qe:a11yFindingCard',
    displayName: 'Accessibility Finding Card',
    description: 'Card for displaying WCAG accessibility violations with fix suggestions',
    category: 'container',
    requiredProps: ['wcagLevel', 'rule', 'impact'],
    optionalProps: [
      'element',
      'description',
      'details',
      'expandable',
      'expanded',
      'suggestion',
      'helpUrl',
      'onAction',
      'accessibility',
    ],
    hasChildren: false,
    supportsAccessibility: true,
    qeDomain: 'accessibility-testing',
    realTime: false,
    relatedDomains: ['quality-assessment', 'ui-testing'],
  },
  'qe:testTimeline': {
    type: 'qe:testTimeline',
    displayName: 'Test Timeline',
    description: 'Timeline visualization of test execution with status and duration',
    category: 'display',
    requiredProps: ['events'],
    optionalProps: [
      'duration',
      'startTime',
      'endTime',
      'showLabels',
      'showDuration',
      'orientation',
      'onEventClick',
      'zoom',
      'filterStatus',
      'groupBySuite',
      'accessibility',
    ],
    hasChildren: false,
    supportsAccessibility: true,
    qeDomain: 'test-execution',
    realTime: true,
    relatedDomains: ['test-generation', 'quality-assessment'],
  },
  'qe:defectDensityChart': {
    type: 'qe:defectDensityChart',
    displayName: 'Defect Density Chart',
    description: 'Visualization of defect density metrics by module or area',
    category: 'display',
    requiredProps: ['data'],
    optionalProps: ['chartType', 'title', 'colorScheme', 'showValues', 'onModuleClick', 'accessibility'],
    hasChildren: false,
    supportsAccessibility: true,
    qeDomain: 'defect-intelligence',
    realTime: false,
    relatedDomains: ['quality-assessment', 'coverage-analysis'],
  },
  'qe:flakySummary': {
    type: 'qe:flakySummary',
    displayName: 'Flaky Test Summary',
    description: 'Summary of flaky test analysis with top offenders',
    category: 'display',
    requiredProps: ['flakyCount', 'totalTests'],
    optionalProps: ['topFlaky', 'showTopFlaky', 'topCount', 'onTestClick', 'accessibility'],
    hasChildren: false,
    supportsAccessibility: true,
    qeDomain: 'test-execution',
    realTime: false,
    relatedDomains: ['test-generation', 'learning-optimization'],
  },
};

/**
 * List of all QE component type names
 */
export const QE_COMPONENT_TYPES: QEComponentType[] = [
  'qe:coverageGauge',
  'qe:testStatusBadge',
  'qe:vulnerabilityCard',
  'qe:qualityGateIndicator',
  'qe:a11yFindingCard',
  'qe:testTimeline',
  'qe:defectDensityChart',
  'qe:flakySummary',
];

/**
 * QE components by domain
 */
export const QE_COMPONENTS_BY_DOMAIN: Record<string, QEComponentType[]> = {
  'coverage-analysis': ['qe:coverageGauge'],
  'test-execution': ['qe:testStatusBadge', 'qe:testTimeline', 'qe:flakySummary'],
  'security-compliance': ['qe:vulnerabilityCard'],
  'quality-assessment': ['qe:qualityGateIndicator'],
  'accessibility-testing': ['qe:a11yFindingCard'],
  'defect-intelligence': ['qe:defectDensityChart'],
};

/**
 * Valid QE domains
 */
export const QE_DOMAINS = [
  'test-generation',
  'test-execution',
  'coverage-analysis',
  'quality-assessment',
  'defect-intelligence',
  'learning-optimization',
  'security-compliance',
  'chaos-resilience',
  'accessibility-testing',
  'ui-testing',
  'performance-testing',
  'api-testing',
] as const;

export type QEDomain = (typeof QE_DOMAINS)[number];

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a type is a QE component type
 */
export function isQEComponentType(type: unknown): type is QEComponentType {
  return typeof type === 'string' && QE_COMPONENT_TYPES.includes(type as QEComponentType);
}

/**
 * Check if a type has the QE prefix
 */
export function hasQEPrefix(type: string): boolean {
  return type.startsWith('qe:');
}

/**
 * Check if a status is a valid TestStatus
 */
export function isTestStatus(status: unknown): status is TestStatus {
  const validStatuses: TestStatus[] = ['passed', 'failed', 'skipped', 'running', 'pending'];
  return typeof status === 'string' && validStatuses.includes(status as TestStatus);
}

/**
 * Check if a severity is a valid VulnerabilitySeverity
 */
export function isVulnerabilitySeverity(severity: unknown): severity is VulnerabilitySeverity {
  const validSeverities: VulnerabilitySeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
  return typeof severity === 'string' && validSeverities.includes(severity as VulnerabilitySeverity);
}

/**
 * Check if a status is a valid QualityGateStatus
 */
export function isQualityGateStatus(status: unknown): status is QualityGateStatus {
  const validStatuses: QualityGateStatus[] = ['passed', 'failed', 'warning', 'unknown'];
  return typeof status === 'string' && validStatuses.includes(status as QualityGateStatus);
}

/**
 * Check if a level is a valid WCAGLevel
 */
export function isWCAGLevel(level: unknown): level is WCAGLevel {
  const validLevels: WCAGLevel[] = ['A', 'AA', 'AAA'];
  return typeof level === 'string' && validLevels.includes(level as WCAGLevel);
}

/**
 * Check if an impact is a valid A11yImpact
 */
export function isA11yImpact(impact: unknown): impact is A11yImpact {
  const validImpacts: A11yImpact[] = ['critical', 'serious', 'moderate', 'minor'];
  return typeof impact === 'string' && validImpacts.includes(impact as A11yImpact);
}

/**
 * Check if a domain is a valid QE domain
 */
export function isQEDomain(domain: unknown): domain is QEDomain {
  return typeof domain === 'string' && QE_DOMAINS.includes(domain as QEDomain);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get QE component metadata by type
 */
export function getQEComponentMetadata(type: QEComponentType): QEComponentMetadata | undefined {
  return QE_CATALOG[type];
}

/**
 * Get QE components by domain
 */
export function getQEComponentsByDomain(domain: string): QEComponentType[] {
  return QE_COMPONENTS_BY_DOMAIN[domain] || [];
}

/**
 * Get QE domain for a component type
 */
export function getQEDomain(type: QEComponentType): string | undefined {
  const metadata = getQEComponentMetadata(type);
  return metadata?.qeDomain;
}

/**
 * Check if a QE component supports real-time updates
 */
export function isRealTimeComponent(type: QEComponentType): boolean {
  const metadata = getQEComponentMetadata(type);
  return metadata?.realTime ?? false;
}

/**
 * Get related domains for a QE component
 */
export function getRelatedDomains(type: QEComponentType): string[] {
  const metadata = getQEComponentMetadata(type);
  return metadata?.relatedDomains ?? [];
}

/**
 * Get severity color for vulnerability
 */
export function getSeverityColor(severity: VulnerabilitySeverity): string {
  const colors: Record<VulnerabilitySeverity, string> = {
    critical: '#dc2626', // red-600
    high: '#ea580c', // orange-600
    medium: '#ca8a04', // yellow-600
    low: '#2563eb', // blue-600
    info: '#6b7280', // gray-500
  };
  return colors[severity];
}

/**
 * Get status color for test status
 */
export function getTestStatusColor(status: TestStatus): string {
  const colors: Record<TestStatus, string> = {
    passed: '#16a34a', // green-600
    failed: '#dc2626', // red-600
    skipped: '#ca8a04', // yellow-600
    running: '#2563eb', // blue-600
    pending: '#6b7280', // gray-500
  };
  return colors[status];
}

/**
 * Get status color for quality gate
 */
export function getQualityGateColor(status: QualityGateStatus): string {
  const colors: Record<QualityGateStatus, string> = {
    passed: '#16a34a', // green-600
    failed: '#dc2626', // red-600
    warning: '#ca8a04', // yellow-600
    unknown: '#6b7280', // gray-500
  };
  return colors[status];
}

/**
 * Get impact color for accessibility finding
 */
export function getA11yImpactColor(impact: A11yImpact): string {
  const colors: Record<A11yImpact, string> = {
    critical: '#dc2626', // red-600
    serious: '#ea580c', // orange-600
    moderate: '#ca8a04', // yellow-600
    minor: '#2563eb', // blue-600
  };
  return colors[impact];
}

/**
 * Get icon name for test status
 */
export function getTestStatusIcon(status: TestStatus): string {
  const icons: Record<TestStatus, string> = {
    passed: 'check-circle',
    failed: 'x-circle',
    skipped: 'minus-circle',
    running: 'loader',
    pending: 'clock',
  };
  return icons[status];
}

/**
 * Get icon name for quality gate status
 */
export function getQualityGateIcon(status: QualityGateStatus): string {
  const icons: Record<QualityGateStatus, string> = {
    passed: 'shield-check',
    failed: 'shield-x',
    warning: 'shield-alert',
    unknown: 'shield-question',
  };
  return icons[status];
}

/**
 * Get icon name for vulnerability severity
 */
export function getSeverityIcon(severity: VulnerabilitySeverity): string {
  const icons: Record<VulnerabilitySeverity, string> = {
    critical: 'alert-octagon',
    high: 'alert-triangle',
    medium: 'alert-circle',
    low: 'info',
    info: 'info',
  };
  return icons[severity];
}

/**
 * Calculate coverage status based on target
 */
export function getCoverageStatus(coverage: number, target: number): 'above' | 'at' | 'below' {
  if (coverage > target) return 'above';
  if (coverage === target) return 'at';
  return 'below';
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Calculate flaky rate as percentage
 */
export function calculateFlakyRate(flakyCount: number, totalTests: number): number {
  if (totalTests === 0) return 0;
  return (flakyCount / totalTests) * 100;
}
