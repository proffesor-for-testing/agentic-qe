import { randomUUID } from 'node:crypto';

/**
 * Compliance Reporter for Governance Audits
 *
 * Provides comprehensive compliance tracking, violation recording, and audit report
 * generation for the Agentic QE Fleet governance system.
 *
 * Key features:
 * - Violation tracking with severity levels
 * - Compliance score calculation
 * - Audit report generation (JSON/Markdown)
 * - Proof envelope integration for verified reporting
 * - Alert threshold monitoring
 *
 * @module governance/compliance-reporter
 * @see ADR-058-guidance-governance-integration.md
 */

import {
  governanceFlags,
  type GovernanceFeatureFlags,
} from './feature-flags.js';
import {
  ProofEnvelopeIntegration,
  proofEnvelopeIntegration,
  type ProofEnvelope,
} from './proof-envelope-integration.js';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../kernel/unified-memory.js';
import { toErrorMessage } from '../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Violation type categories
 */
export type ViolationType =
  | 'loop_detected'
  | 'contradiction'
  | 'trust_violation'
  | 'budget_exceeded'
  | 'adversarial_detected'
  | 'invariant_violated'
  | 'unauthorized_access'
  | 'chain_tampered'
  | 'schema_violation'
  | 'rate_limit_exceeded';

/**
 * Violation severity levels
 */
export type ViolationSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Compliance violation record
 */
export interface ComplianceViolation {
  /** Unique violation identifier */
  id: string;
  /** Creation timestamp (ms since epoch) */
  timestamp: number;
  /** Type of violation */
  type: ViolationType;
  /** Severity level */
  severity: ViolationSeverity;
  /** Agent that caused the violation (optional) */
  agentId?: string;
  /** Gate that detected the violation */
  gate: string;
  /** Human-readable description */
  description: string;
  /** Additional context data */
  context?: Record<string, unknown>;
  /** Whether the violation has been resolved */
  resolved: boolean;
  /** Resolution description (if resolved) */
  resolution?: string;
  /** Resolution timestamp (if resolved) */
  resolvedAt?: number;
  /** Linked proof envelope ID for verified reporting */
  proofEnvelopeId?: string;
}

/**
 * Filter options for querying violations
 */
export interface ViolationFilter {
  /** Filter by violation type */
  type?: ViolationType;
  /** Filter by severity */
  severity?: ViolationSeverity;
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by gate */
  gate?: string;
  /** Filter by resolved status */
  resolved?: boolean;
  /** Filter by start timestamp */
  startTime?: number;
  /** Filter by end timestamp */
  endTime?: number;
  /** Maximum number of results */
  limit?: number;
}

/**
 * Time window for score calculation
 */
export interface TimeWindow {
  /** Start timestamp */
  start: number;
  /** End timestamp */
  end: number;
}

/**
 * Compliance score breakdown
 */
export interface ComplianceScore {
  /** Overall compliance score (0-100) */
  overall: number;
  /** Score breakdown by gate */
  byGate: Record<string, number>;
  /** Score breakdown by agent */
  byAgent: Record<string, number>;
  /** Score trend indicator */
  trend: 'improving' | 'stable' | 'declining';
  /** Time period for this score */
  period: TimeWindow;
  /** Total violations in period */
  totalViolations: number;
  /** Resolved violations in period */
  resolvedViolations: number;
}

/**
 * Report generation options
 */
export interface ReportOptions {
  /** Time window for the report */
  timeWindow?: TimeWindow;
  /** Include detailed violation list */
  includeViolations?: boolean;
  /** Include agent rankings */
  includeAgentRankings?: boolean;
  /** Include recommendations */
  includeRecommendations?: boolean;
  /** Include trend analysis */
  includeTrendAnalysis?: boolean;
  /** Maximum violations to include in detail */
  maxViolations?: number;
}

/**
 * Compliance report structure
 */
export interface ComplianceReport {
  /** Report generation timestamp */
  generatedAt: number;
  /** Report time window */
  timeWindow: TimeWindow;
  /** Executive summary */
  summary: {
    overallScore: number;
    totalViolations: number;
    criticalViolations: number;
    highViolations: number;
    resolvedViolations: number;
    resolutionRate: number;
    trend: 'improving' | 'stable' | 'declining';
  };
  /** Score breakdown by gate */
  gateScores: Record<string, {
    score: number;
    violations: number;
    trend: 'improving' | 'stable' | 'declining';
  }>;
  /** Agent compliance rankings (if requested) */
  agentRankings?: Array<{
    agentId: string;
    score: number;
    violations: number;
    trend: 'improving' | 'stable' | 'declining';
  }>;
  /** Violation breakdown by type */
  violationsByType: Record<ViolationType, number>;
  /** Violation breakdown by severity */
  violationsBySeverity: Record<ViolationSeverity, number>;
  /** Detailed violations (if requested) */
  violations?: ComplianceViolation[];
  /** Recommendations (if requested) */
  recommendations?: string[];
  /** Trend analysis (if requested) */
  trendAnalysis?: {
    currentPeriodScore: number;
    previousPeriodScore: number;
    change: number;
    violationTrend: 'increasing' | 'stable' | 'decreasing';
  };
}

/**
 * Alert configuration
 */
export interface Alert {
  /** Alert ID */
  id: string;
  /** Gate that triggered the alert */
  gate: string;
  /** Alert message */
  message: string;
  /** Severity */
  severity: ViolationSeverity;
  /** Timestamp */
  timestamp: number;
  /** Current score */
  currentScore: number;
  /** Threshold that was crossed */
  threshold: number;
}

/**
 * Compliance statistics
 */
export interface ComplianceStats {
  /** Total violations recorded */
  totalViolations: number;
  /** Total resolved violations */
  resolvedViolations: number;
  /** Resolution rate (0-1) */
  resolutionRate: number;
  /** Violations by type */
  byType: Record<ViolationType, number>;
  /** Violations by severity */
  bySeverity: Record<ViolationSeverity, number>;
  /** Violations by gate */
  byGate: Record<string, number>;
  /** Violations by agent */
  byAgent: Record<string, number>;
  /** Average time to resolution (ms) */
  avgResolutionTime: number;
  /** Violations with proof */
  violationsWithProof: number;
  /** Current compliance score */
  currentScore: number;
}

/**
 * Feature flags for compliance reporter
 */
export interface ComplianceReporterFlags {
  enabled: boolean;
  autoRecordViolations: boolean;
  retentionDays: number;
  alertOnCritical: boolean;
  generateDailyReport: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default compliance reporter flags
 */
export const DEFAULT_COMPLIANCE_REPORTER_FLAGS: ComplianceReporterFlags = {
  enabled: true,
  autoRecordViolations: true,
  retentionDays: 90,
  alertOnCritical: true,
  generateDailyReport: false,
};

/**
 * Severity weights for score calculation
 */
const SEVERITY_WEIGHTS: Record<ViolationSeverity, number> = {
  low: 1,
  medium: 3,
  high: 7,
  critical: 15,
};

/**
 * Default score if no violations
 */
const DEFAULT_SCORE = 100;

/**
 * Score decay rate per weighted violation point
 */
const SCORE_DECAY_RATE = 0.5;

/**
 * Trend threshold (percent change to consider improving/declining)
 */
const TREND_THRESHOLD = 5;

// ============================================================================
// Compliance Reporter Implementation
// ============================================================================

/**
 * Compliance Reporter class
 *
 * Tracks governance violations, calculates compliance scores, and generates
 * audit reports with optional proof envelope integration.
 */
export class ComplianceReporter {
  private violations: Map<string, ComplianceViolation> = new Map();
  private alertThresholds: Map<string, number> = new Map();
  private proofIntegration: ProofEnvelopeIntegration;
  private flags: ComplianceReporterFlags;
  private initialized = false;
  private scoreHistory: ComplianceScore[] = [];
  private alertListeners: Set<(alert: Alert) => void> = new Set();

  // KV persistence
  private db: UnifiedMemoryManager | null = null;
  private persistCount = 0;
  private static readonly NAMESPACE = 'compliance-audit';
  private static readonly TTL_SECONDS = 2592000; // 30 days
  private static readonly PERSIST_INTERVAL = 10;

  /**
   * Create a new ComplianceReporter instance
   *
   * @param proofIntegration - Optional proof envelope integration
   * @param flags - Optional feature flags
   */
  constructor(
    proofIntegration?: ProofEnvelopeIntegration,
    flags?: Partial<ComplianceReporterFlags>
  ) {
    this.proofIntegration = proofIntegration ?? proofEnvelopeIntegration;
    this.flags = { ...DEFAULT_COMPLIANCE_REPORTER_FLAGS, ...flags };
  }

  /**
   * Initialize the compliance reporter
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize KV persistence
    try {
      this.db = getUnifiedMemory();
      if (!this.db.isInitialized()) await this.db.initialize();
      await this.loadFromKv();
    } catch (error) {
      console.warn('[ComplianceReporter] DB init failed, using memory-only:', toErrorMessage(error));
      this.db = null;
    }

    // Initialize proof envelope integration if not already
    if (!this.proofIntegration.isInitialized()) {
      await this.proofIntegration.initialize();
    }

    // Set default alert thresholds for common gates
    this.alertThresholds.set('continueGate', 70);
    this.alertThresholds.set('memoryWriteGate', 70);
    this.alertThresholds.set('trustAccumulator', 70);
    this.alertThresholds.set('budgetMeter', 60);
    this.alertThresholds.set('adversarialDefense', 80);

    this.initialized = true;
  }

  /**
   * Check if the reporter is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current feature flags
   */
  getFlags(): ComplianceReporterFlags {
    return { ...this.flags };
  }

  /**
   * Update feature flags
   */
  updateFlags(flags: Partial<ComplianceReporterFlags>): void {
    this.flags = { ...this.flags, ...flags };
  }

  // ============================================================================
  // Violation Tracking
  // ============================================================================

  /**
   * Record a new compliance violation
   *
   * @param violation - Violation details (id and timestamp will be generated)
   * @returns Violation ID
   */
  recordViolation(
    violation: Omit<ComplianceViolation, 'id' | 'timestamp' | 'resolved'>
  ): string {
    const id = this.generateViolationId();
    const timestamp = Date.now();

    const fullViolation: ComplianceViolation = {
      ...violation,
      id,
      timestamp,
      resolved: false,
    };

    this.violations.set(id, fullViolation);

    // Create proof envelope if enabled
    if (governanceFlags.getFlags().proofEnvelope.enabled) {
      try {
        const envelope = this.proofIntegration.createSignedEnvelope(
          violation.agentId ?? 'system',
          'violation_recorded',
          {
            violationId: id,
            type: violation.type,
            severity: violation.severity,
            gate: violation.gate,
            description: violation.description,
          }
        );
        this.proofIntegration.appendToChain(envelope);
        fullViolation.proofEnvelopeId = envelope.id;
      } catch {
        // Proof envelope creation failed, continue without it
      }
    }

    // Check for critical alerts
    if (this.flags.alertOnCritical && violation.severity === 'critical') {
      this.triggerAlert(violation.gate, 'Critical violation detected', 'critical');
    }

    // Persist snapshot on interval
    this.persistSnapshot();

    // Clean up old violations based on retention
    this.cleanupOldViolations();

    return id;
  }

  /**
   * Resolve a violation
   *
   * @param violationId - ID of the violation to resolve
   * @param resolution - Resolution description
   */
  resolveViolation(violationId: string, resolution: string): void {
    const violation = this.violations.get(violationId);
    if (!violation) {
      throw new Error(`Violation not found: ${violationId}`);
    }

    violation.resolved = true;
    violation.resolution = resolution;
    violation.resolvedAt = Date.now();

    // Create proof envelope for resolution
    if (governanceFlags.getFlags().proofEnvelope.enabled) {
      try {
        const envelope = this.proofIntegration.createSignedEnvelope(
          violation.agentId ?? 'system',
          'violation_resolved',
          {
            violationId,
            resolution,
          }
        );
        this.proofIntegration.appendToChain(envelope);
      } catch {
        // Proof envelope creation failed, continue without it
      }
    }
  }

  /**
   * Get a violation by ID
   *
   * @param id - Violation ID
   * @returns Violation or null if not found
   */
  getViolation(id: string): ComplianceViolation | null {
    return this.violations.get(id) ?? null;
  }

  /**
   * Get violations with optional filtering
   *
   * @param filter - Filter options
   * @returns Array of matching violations
   */
  getViolations(filter?: ViolationFilter): ComplianceViolation[] {
    let results = Array.from(this.violations.values());

    if (filter) {
      if (filter.type !== undefined) {
        results = results.filter(v => v.type === filter.type);
      }
      if (filter.severity !== undefined) {
        results = results.filter(v => v.severity === filter.severity);
      }
      if (filter.agentId !== undefined) {
        results = results.filter(v => v.agentId === filter.agentId);
      }
      if (filter.gate !== undefined) {
        results = results.filter(v => v.gate === filter.gate);
      }
      if (filter.resolved !== undefined) {
        results = results.filter(v => v.resolved === filter.resolved);
      }
      if (filter.startTime !== undefined) {
        results = results.filter(v => v.timestamp >= filter.startTime!);
      }
      if (filter.endTime !== undefined) {
        results = results.filter(v => v.timestamp <= filter.endTime!);
      }
      if (filter.limit !== undefined) {
        results = results.slice(0, filter.limit);
      }
    }

    // Sort by timestamp descending (most recent first)
    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  // ============================================================================
  // Compliance Scoring
  // ============================================================================

  /**
   * Calculate compliance score for a time window
   *
   * @param timeWindow - Optional time window (defaults to last 24 hours)
   * @returns Compliance score breakdown
   */
  calculateScore(timeWindow?: TimeWindow): ComplianceScore {
    const now = Date.now();
    const window: TimeWindow = timeWindow ?? {
      start: now - 24 * 60 * 60 * 1000, // Last 24 hours
      end: now,
    };

    const violations = this.getViolations({
      startTime: window.start,
      endTime: window.end,
    });

    // Calculate overall score
    const overall = this.calculateOverallScore(violations);

    // Calculate score by gate
    const byGate: Record<string, number> = {};
    const gateViolations = this.groupBy(violations, 'gate');
    for (const [gate, gateViols] of Object.entries(gateViolations)) {
      byGate[gate] = this.calculateOverallScore(gateViols);
    }

    // Calculate score by agent
    const byAgent: Record<string, number> = {};
    const agentViolations = this.groupBy(violations, 'agentId');
    for (const [agentId, agentViols] of Object.entries(agentViolations)) {
      if (agentId !== 'undefined') {
        byAgent[agentId] = this.calculateOverallScore(agentViols);
      }
    }

    // Calculate trend
    const trend = this.calculateTrend(window);

    const resolvedCount = violations.filter(v => v.resolved).length;

    const score: ComplianceScore = {
      overall,
      byGate,
      byAgent,
      trend,
      period: window,
      totalViolations: violations.length,
      resolvedViolations: resolvedCount,
    };

    // Store in history
    this.scoreHistory.push(score);
    if (this.scoreHistory.length > 100) {
      this.scoreHistory.shift();
    }

    return score;
  }

  /**
   * Get score history for multiple periods
   *
   * @param periods - Number of periods to retrieve
   * @returns Array of compliance scores
   */
  getScoreHistory(periods: number): ComplianceScore[] {
    return this.scoreHistory.slice(-periods);
  }

  // ============================================================================
  // Reporting
  // ============================================================================

  /**
   * Generate a compliance report
   *
   * @param options - Report generation options
   * @returns Compliance report
   */
  generateReport(options: ReportOptions = {}): ComplianceReport {
    const now = Date.now();
    const timeWindow: TimeWindow = options.timeWindow ?? {
      start: now - 24 * 60 * 60 * 1000,
      end: now,
    };

    const violations = this.getViolations({
      startTime: timeWindow.start,
      endTime: timeWindow.end,
    });

    const score = this.calculateScore(timeWindow);

    // Count violations by type
    const violationsByType: Record<ViolationType, number> = {
      loop_detected: 0,
      contradiction: 0,
      trust_violation: 0,
      budget_exceeded: 0,
      adversarial_detected: 0,
      invariant_violated: 0,
      unauthorized_access: 0,
      chain_tampered: 0,
      schema_violation: 0,
      rate_limit_exceeded: 0,
    };
    for (const v of violations) {
      violationsByType[v.type]++;
    }

    // Count violations by severity
    const violationsBySeverity: Record<ViolationSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    for (const v of violations) {
      violationsBySeverity[v.severity]++;
    }

    // Build gate scores
    const gateScores: ComplianceReport['gateScores'] = {};
    const gateViolations = this.groupBy(violations, 'gate');
    for (const [gate, gateViols] of Object.entries(gateViolations)) {
      gateScores[gate] = {
        score: this.calculateOverallScore(gateViols),
        violations: gateViols.length,
        trend: this.calculateGateTrend(gate, timeWindow),
      };
    }

    // Calculate resolution rate
    const resolvedCount = violations.filter(v => v.resolved).length;
    const resolutionRate = violations.length > 0 ? resolvedCount / violations.length : 1;

    const report: ComplianceReport = {
      generatedAt: now,
      timeWindow,
      summary: {
        overallScore: score.overall,
        totalViolations: violations.length,
        criticalViolations: violationsBySeverity.critical,
        highViolations: violationsBySeverity.high,
        resolvedViolations: resolvedCount,
        resolutionRate,
        trend: score.trend,
      },
      gateScores,
      violationsByType,
      violationsBySeverity,
    };

    // Include agent rankings if requested
    if (options.includeAgentRankings) {
      const agentViolations = this.groupBy(violations, 'agentId');
      report.agentRankings = Object.entries(agentViolations)
        .filter(([agentId]) => agentId !== 'undefined')
        .map(([agentId, agentViols]) => ({
          agentId,
          score: this.calculateOverallScore(agentViols),
          violations: agentViols.length,
          trend: this.calculateAgentTrend(agentId, timeWindow),
        }))
        .sort((a, b) => b.score - a.score);
    }

    // Include detailed violations if requested
    if (options.includeViolations) {
      const maxViolations = options.maxViolations ?? 50;
      report.violations = violations.slice(0, maxViolations);
    }

    // Include recommendations if requested
    if (options.includeRecommendations) {
      report.recommendations = this.generateRecommendations(violations, score);
    }

    // Include trend analysis if requested
    if (options.includeTrendAnalysis) {
      report.trendAnalysis = this.calculateTrendAnalysis(timeWindow);
    }

    return report;
  }

  /**
   * Export report to specified format
   *
   * @param report - Compliance report
   * @param format - Output format
   * @returns Formatted report string
   */
  exportReport(report: ComplianceReport, format: 'json' | 'markdown'): string {
    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    // Generate markdown report
    return this.generateMarkdownReport(report);
  }

  // ============================================================================
  // Proof Integration
  // ============================================================================

  /**
   * Attach a proof envelope to a violation
   *
   * @param violationId - Violation ID
   * @param proofEnvelopeId - Proof envelope ID
   */
  attachProof(violationId: string, proofEnvelopeId: string): void {
    const violation = this.violations.get(violationId);
    if (!violation) {
      throw new Error(`Violation not found: ${violationId}`);
    }

    // Verify proof envelope exists
    const envelope = this.proofIntegration.getEnvelopeById(proofEnvelopeId);
    if (!envelope) {
      throw new Error(`Proof envelope not found: ${proofEnvelopeId}`);
    }

    violation.proofEnvelopeId = proofEnvelopeId;
  }

  /**
   * Get all violations that have associated proof envelopes
   *
   * @returns Array of violations with proof
   */
  getViolationsWithProof(): ComplianceViolation[] {
    return Array.from(this.violations.values())
      .filter(v => v.proofEnvelopeId !== undefined);
  }

  /**
   * Get proof envelope for a violation
   *
   * @param violationId - Violation ID
   * @returns Proof envelope or null
   */
  getViolationProof(violationId: string): ProofEnvelope | null {
    const violation = this.violations.get(violationId);
    if (!violation?.proofEnvelopeId) return null;
    return this.proofIntegration.getEnvelopeById(violation.proofEnvelopeId);
  }

  // ============================================================================
  // Alerts
  // ============================================================================

  /**
   * Set alert threshold for a gate
   *
   * @param gate - Gate name
   * @param threshold - Score threshold (0-100, alert when score drops below)
   */
  setAlertThreshold(gate: string, threshold: number): void {
    if (threshold < 0 || threshold > 100) {
      throw new Error('Threshold must be between 0 and 100');
    }
    this.alertThresholds.set(gate, threshold);
  }

  /**
   * Get alert threshold for a gate
   *
   * @param gate - Gate name
   * @returns Threshold or undefined
   */
  getAlertThreshold(gate: string): number | undefined {
    return this.alertThresholds.get(gate);
  }

  /**
   * Check all alert thresholds and return triggered alerts
   *
   * @returns Array of triggered alerts
   */
  checkAlerts(): Alert[] {
    const alerts: Alert[] = [];
    const score = this.calculateScore();

    for (const [gate, threshold] of this.alertThresholds) {
      const gateScore = score.byGate[gate];
      if (gateScore !== undefined && gateScore < threshold) {
        const alert: Alert = {
          id: this.generateAlertId(),
          gate,
          message: `Compliance score for ${gate} (${gateScore.toFixed(1)}) dropped below threshold (${threshold})`,
          severity: gateScore < threshold * 0.5 ? 'critical' : 'high',
          timestamp: Date.now(),
          currentScore: gateScore,
          threshold,
        };
        alerts.push(alert);
        this.notifyAlertListeners(alert);
      }
    }

    return alerts;
  }

  /**
   * Subscribe to alert notifications
   *
   * @param listener - Alert listener function
   * @returns Unsubscribe function
   */
  onAlert(listener: (alert: Alert) => void): () => void {
    this.alertListeners.add(listener);
    return () => this.alertListeners.delete(listener);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get comprehensive compliance statistics
   *
   * @returns Compliance statistics
   */
  getComplianceStats(): ComplianceStats {
    const allViolations = Array.from(this.violations.values());
    const resolvedViolations = allViolations.filter(v => v.resolved);

    // Count by type
    const byType: Record<ViolationType, number> = {
      loop_detected: 0,
      contradiction: 0,
      trust_violation: 0,
      budget_exceeded: 0,
      adversarial_detected: 0,
      invariant_violated: 0,
      unauthorized_access: 0,
      chain_tampered: 0,
      schema_violation: 0,
      rate_limit_exceeded: 0,
    };
    for (const v of allViolations) {
      byType[v.type]++;
    }

    // Count by severity
    const bySeverity: Record<ViolationSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    for (const v of allViolations) {
      bySeverity[v.severity]++;
    }

    // Count by gate
    const byGate: Record<string, number> = {};
    for (const v of allViolations) {
      byGate[v.gate] = (byGate[v.gate] || 0) + 1;
    }

    // Count by agent
    const byAgent: Record<string, number> = {};
    for (const v of allViolations) {
      if (v.agentId) {
        byAgent[v.agentId] = (byAgent[v.agentId] || 0) + 1;
      }
    }

    // Calculate average resolution time
    let totalResolutionTime = 0;
    let resolutionCount = 0;
    for (const v of resolvedViolations) {
      if (v.resolvedAt) {
        totalResolutionTime += v.resolvedAt - v.timestamp;
        resolutionCount++;
      }
    }
    const avgResolutionTime = resolutionCount > 0 ? totalResolutionTime / resolutionCount : 0;

    // Count violations with proof
    const violationsWithProof = allViolations.filter(v => v.proofEnvelopeId).length;

    return {
      totalViolations: allViolations.length,
      resolvedViolations: resolvedViolations.length,
      resolutionRate: allViolations.length > 0 ? resolvedViolations.length / allViolations.length : 1,
      byType,
      bySeverity,
      byGate,
      byAgent,
      avgResolutionTime,
      violationsWithProof,
      currentScore: this.calculateScore().overall,
    };
  }

  // ============================================================================
  // Maintenance
  // ============================================================================

  /**
   * Clear all violations (for testing)
   */
  clearViolations(): void {
    this.violations.clear();
    this.scoreHistory = [];
  }

  /**
   * Reset the reporter (for testing)
   */
  reset(): void {
    this.violations.clear();
    this.alertThresholds.clear();
    this.scoreHistory = [];
    this.alertListeners.clear();
    this.initialized = false;
  }

  // ============================================================================
  // KV Persistence
  // ============================================================================

  /**
   * Load violations and score history from KV store
   */
  private async loadFromKv(): Promise<void> {
    if (!this.db) return;
    const data = await this.db.kvGet<{
      violations: Record<string, ComplianceViolation>;
      scoreHistory: ComplianceScore[];
    }>('snapshot', ComplianceReporter.NAMESPACE);
    if (data) {
      if (data.violations) {
        for (const [key, violation] of Object.entries(data.violations)) {
          this.violations.set(key, violation);
        }
      }
      if (data.scoreHistory) {
        this.scoreHistory = data.scoreHistory;
      }
    }
  }

  /**
   * Persist violations and score history to KV store on interval
   */
  private persistSnapshot(): void {
    if (!this.db) return;
    this.persistCount++;
    if (this.persistCount % ComplianceReporter.PERSIST_INTERVAL !== 0) return;
    try {
      // Keep last 500 violations and last 100 score history entries
      const violationEntries = Array.from(this.violations.entries()).slice(-500);
      const snapshot = {
        violations: Object.fromEntries(violationEntries),
        scoreHistory: this.scoreHistory.slice(-100),
      };
      this.db.kvSet('snapshot', snapshot, ComplianceReporter.NAMESPACE, ComplianceReporter.TTL_SECONDS).catch(() => {});
    } catch (error) {
      console.warn('[ComplianceReporter] Persist failed:', toErrorMessage(error));
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Generate a unique violation ID
   */
  private generateViolationId(): string {
    return `viol_${randomUUID()}`;
  }

  /**
   * Generate a unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${randomUUID()}`;
  }

  /**
   * Calculate overall score from violations
   */
  private calculateOverallScore(violations: ComplianceViolation[]): number {
    if (violations.length === 0) return DEFAULT_SCORE;

    // Calculate weighted violation points
    let weightedPoints = 0;
    for (const v of violations) {
      // Resolved violations count for half
      const multiplier = v.resolved ? 0.5 : 1;
      weightedPoints += SEVERITY_WEIGHTS[v.severity] * multiplier;
    }

    // Apply exponential decay
    const score = DEFAULT_SCORE * Math.exp(-SCORE_DECAY_RATE * weightedPoints / 10);
    return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
  }

  /**
   * Calculate trend based on previous scores
   */
  private calculateTrend(currentWindow: TimeWindow): 'improving' | 'stable' | 'declining' {
    // Get previous period
    const duration = currentWindow.end - currentWindow.start;
    const previousWindow: TimeWindow = {
      start: currentWindow.start - duration,
      end: currentWindow.start,
    };

    const previousViolations = this.getViolations({
      startTime: previousWindow.start,
      endTime: previousWindow.end,
    });
    const currentViolations = this.getViolations({
      startTime: currentWindow.start,
      endTime: currentWindow.end,
    });

    const previousScore = this.calculateOverallScore(previousViolations);
    const currentScore = this.calculateOverallScore(currentViolations);

    const change = currentScore - previousScore;

    if (change > TREND_THRESHOLD) return 'improving';
    if (change < -TREND_THRESHOLD) return 'declining';
    return 'stable';
  }

  /**
   * Calculate trend for a specific gate
   */
  private calculateGateTrend(
    gate: string,
    currentWindow: TimeWindow
  ): 'improving' | 'stable' | 'declining' {
    const duration = currentWindow.end - currentWindow.start;
    const previousWindow: TimeWindow = {
      start: currentWindow.start - duration,
      end: currentWindow.start,
    };

    const previousViolations = this.getViolations({
      gate,
      startTime: previousWindow.start,
      endTime: previousWindow.end,
    });
    const currentViolations = this.getViolations({
      gate,
      startTime: currentWindow.start,
      endTime: currentWindow.end,
    });

    const previousScore = this.calculateOverallScore(previousViolations);
    const currentScore = this.calculateOverallScore(currentViolations);

    const change = currentScore - previousScore;

    if (change > TREND_THRESHOLD) return 'improving';
    if (change < -TREND_THRESHOLD) return 'declining';
    return 'stable';
  }

  /**
   * Calculate trend for a specific agent
   */
  private calculateAgentTrend(
    agentId: string,
    currentWindow: TimeWindow
  ): 'improving' | 'stable' | 'declining' {
    const duration = currentWindow.end - currentWindow.start;
    const previousWindow: TimeWindow = {
      start: currentWindow.start - duration,
      end: currentWindow.start,
    };

    const previousViolations = this.getViolations({
      agentId,
      startTime: previousWindow.start,
      endTime: previousWindow.end,
    });
    const currentViolations = this.getViolations({
      agentId,
      startTime: currentWindow.start,
      endTime: currentWindow.end,
    });

    const previousScore = this.calculateOverallScore(previousViolations);
    const currentScore = this.calculateOverallScore(currentViolations);

    const change = currentScore - previousScore;

    if (change > TREND_THRESHOLD) return 'improving';
    if (change < -TREND_THRESHOLD) return 'declining';
    return 'stable';
  }

  /**
   * Calculate detailed trend analysis
   */
  private calculateTrendAnalysis(
    timeWindow: TimeWindow
  ): ComplianceReport['trendAnalysis'] {
    const duration = timeWindow.end - timeWindow.start;
    const previousWindow: TimeWindow = {
      start: timeWindow.start - duration,
      end: timeWindow.start,
    };

    const currentViolations = this.getViolations({
      startTime: timeWindow.start,
      endTime: timeWindow.end,
    });
    const previousViolations = this.getViolations({
      startTime: previousWindow.start,
      endTime: previousWindow.end,
    });

    const currentScore = this.calculateOverallScore(currentViolations);
    const previousScore = this.calculateOverallScore(previousViolations);

    const violationChange = currentViolations.length - previousViolations.length;
    let violationTrend: 'increasing' | 'stable' | 'decreasing';
    if (violationChange > 2) {
      violationTrend = 'increasing';
    } else if (violationChange < -2) {
      violationTrend = 'decreasing';
    } else {
      violationTrend = 'stable';
    }

    return {
      currentPeriodScore: currentScore,
      previousPeriodScore: previousScore,
      change: currentScore - previousScore,
      violationTrend,
    };
  }

  /**
   * Generate recommendations based on violations
   */
  private generateRecommendations(
    violations: ComplianceViolation[],
    score: ComplianceScore
  ): string[] {
    const recommendations: string[] = [];

    // Check for critical violations
    const criticalCount = violations.filter(v => v.severity === 'critical').length;
    if (criticalCount > 0) {
      recommendations.push(
        `URGENT: ${criticalCount} critical violation(s) require immediate attention.`
      );
    }

    // Check for unresolved violations
    const unresolvedCount = violations.filter(v => !v.resolved).length;
    if (unresolvedCount > 5) {
      recommendations.push(
        `${unresolvedCount} violations remain unresolved. Consider allocating resources for resolution.`
      );
    }

    // Check for low gate scores
    for (const [gate, gateScore] of Object.entries(score.byGate)) {
      if (gateScore < 70) {
        recommendations.push(
          `${gate} compliance score is ${gateScore.toFixed(1)}. Review ${gate} configuration and add monitoring.`
        );
      }
    }

    // Check for problematic agents
    for (const [agentId, agentScore] of Object.entries(score.byAgent)) {
      if (agentScore < 60) {
        recommendations.push(
          `Agent ${agentId} has low compliance score (${agentScore.toFixed(1)}). Consider retraining or restricting permissions.`
        );
      }
    }

    // Check for repeated violation types
    const typeCounts = new Map<ViolationType, number>();
    for (const v of violations) {
      typeCounts.set(v.type, (typeCounts.get(v.type) || 0) + 1);
    }
    for (const [type, count] of typeCounts) {
      if (count >= 5) {
        recommendations.push(
          `${type} violations occurred ${count} times. Investigate root cause and add preventive measures.`
        );
      }
    }

    // Check overall trend
    if (score.trend === 'declining') {
      recommendations.push(
        'Overall compliance trend is declining. Schedule a governance review meeting.'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Compliance is within acceptable parameters. Continue monitoring.');
    }

    return recommendations;
  }

  /**
   * Generate markdown-formatted report
   */
  private generateMarkdownReport(report: ComplianceReport): string {
    const lines: string[] = [];
    const dateStr = new Date(report.generatedAt).toISOString();

    lines.push('# Compliance Report');
    lines.push('');
    lines.push(`**Generated:** ${dateStr}`);
    lines.push(`**Period:** ${new Date(report.timeWindow.start).toISOString()} to ${new Date(report.timeWindow.end).toISOString()}`);
    lines.push('');

    // Executive Summary
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Overall Score | ${report.summary.overallScore.toFixed(1)} |`);
    lines.push(`| Total Violations | ${report.summary.totalViolations} |`);
    lines.push(`| Critical Violations | ${report.summary.criticalViolations} |`);
    lines.push(`| High Violations | ${report.summary.highViolations} |`);
    lines.push(`| Resolution Rate | ${(report.summary.resolutionRate * 100).toFixed(1)}% |`);
    lines.push(`| Trend | ${report.summary.trend} |`);
    lines.push('');

    // Gate Scores
    lines.push('## Gate Compliance Scores');
    lines.push('');
    lines.push(`| Gate | Score | Violations | Trend |`);
    lines.push(`|------|-------|------------|-------|`);
    for (const [gate, data] of Object.entries(report.gateScores)) {
      lines.push(`| ${gate} | ${data.score.toFixed(1)} | ${data.violations} | ${data.trend} |`);
    }
    lines.push('');

    // Violations by Type
    lines.push('## Violations by Type');
    lines.push('');
    lines.push(`| Type | Count |`);
    lines.push(`|------|-------|`);
    for (const [type, count] of Object.entries(report.violationsByType)) {
      if (count > 0) {
        lines.push(`| ${type} | ${count} |`);
      }
    }
    lines.push('');

    // Violations by Severity
    lines.push('## Violations by Severity');
    lines.push('');
    lines.push(`| Severity | Count |`);
    lines.push(`|----------|-------|`);
    for (const [severity, count] of Object.entries(report.violationsBySeverity)) {
      lines.push(`| ${severity} | ${count} |`);
    }
    lines.push('');

    // Agent Rankings (if included)
    if (report.agentRankings && report.agentRankings.length > 0) {
      lines.push('## Agent Compliance Rankings');
      lines.push('');
      lines.push(`| Agent | Score | Violations | Trend |`);
      lines.push(`|-------|-------|------------|-------|`);
      for (const agent of report.agentRankings) {
        lines.push(`| ${agent.agentId} | ${agent.score.toFixed(1)} | ${agent.violations} | ${agent.trend} |`);
      }
      lines.push('');
    }

    // Trend Analysis (if included)
    if (report.trendAnalysis) {
      lines.push('## Trend Analysis');
      lines.push('');
      lines.push(`- **Current Period Score:** ${report.trendAnalysis.currentPeriodScore.toFixed(1)}`);
      lines.push(`- **Previous Period Score:** ${report.trendAnalysis.previousPeriodScore.toFixed(1)}`);
      lines.push(`- **Change:** ${report.trendAnalysis.change > 0 ? '+' : ''}${report.trendAnalysis.change.toFixed(1)}`);
      lines.push(`- **Violation Trend:** ${report.trendAnalysis.violationTrend}`);
      lines.push('');
    }

    // Recommendations (if included)
    if (report.recommendations && report.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    }

    // Detailed Violations (if included)
    if (report.violations && report.violations.length > 0) {
      lines.push('## Recent Violations');
      lines.push('');
      for (const v of report.violations.slice(0, 10)) {
        const status = v.resolved ? 'RESOLVED' : 'OPEN';
        const time = new Date(v.timestamp).toISOString();
        lines.push(`### ${v.id}`);
        lines.push('');
        lines.push(`- **Type:** ${v.type}`);
        lines.push(`- **Severity:** ${v.severity}`);
        lines.push(`- **Gate:** ${v.gate}`);
        lines.push(`- **Status:** ${status}`);
        lines.push(`- **Time:** ${time}`);
        if (v.agentId) {
          lines.push(`- **Agent:** ${v.agentId}`);
        }
        lines.push(`- **Description:** ${v.description}`);
        if (v.proofEnvelopeId) {
          lines.push(`- **Proof:** ${v.proofEnvelopeId}`);
        }
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('*Report generated by Agentic QE Compliance Reporter*');

    return lines.join('\n');
  }

  /**
   * Group violations by a field
   */
  private groupBy(
    violations: ComplianceViolation[],
    field: keyof ComplianceViolation
  ): Record<string, ComplianceViolation[]> {
    const groups: Record<string, ComplianceViolation[]> = {};
    for (const v of violations) {
      const key = String(v[field]);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(v);
    }
    return groups;
  }

  /**
   * Clean up violations older than retention period
   */
  private cleanupOldViolations(): void {
    const cutoff = Date.now() - this.flags.retentionDays * 24 * 60 * 60 * 1000;

    for (const [id, violation] of this.violations) {
      if (violation.timestamp < cutoff) {
        this.violations.delete(id);
      }
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(gate: string, message: string, severity: ViolationSeverity): void {
    const alert: Alert = {
      id: this.generateAlertId(),
      gate,
      message,
      severity,
      timestamp: Date.now(),
      currentScore: 0,
      threshold: 0,
    };
    this.notifyAlertListeners(alert);
  }

  /**
   * Notify all alert listeners
   */
  private notifyAlertListeners(alert: Alert): void {
    for (const listener of this.alertListeners) {
      try {
        listener(alert);
      } catch {
        // Listener error, continue
      }
    }
  }
}

// ============================================================================
// Singleton and Factory
// ============================================================================

/**
 * Singleton instance
 */
export const complianceReporter = new ComplianceReporter();

/**
 * Factory function for creating new instances
 *
 * @param proofIntegration - Optional proof envelope integration
 * @param flags - Optional feature flags
 * @returns New ComplianceReporter instance
 */
export function createComplianceReporter(
  proofIntegration?: ProofEnvelopeIntegration,
  flags?: Partial<ComplianceReporterFlags>
): ComplianceReporter {
  return new ComplianceReporter(proofIntegration, flags);
}

/**
 * Helper to check if compliance reporter is enabled
 */
export function isComplianceReporterEnabled(): boolean {
  return governanceFlags.getFlags().global.enableAllGates;
}
