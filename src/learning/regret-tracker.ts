/**
 * Agentic QE v3 - Regret Tracker
 * Task 2.4: Regret Tracking and Learning Health Dashboard
 *
 * Tracks cumulative regret per domain over time to determine whether
 * QE agents are actually learning. Uses log-log regression on the
 * regret curve to classify growth rate:
 *
 * - Sublinear: R(n) ~ n^alpha where alpha < 1 (learning is happening)
 * - Linear:    R(n) ~ n (stagnation, needs intervention)
 * - Superlinear: R(n) ~ n^alpha where alpha > 1 (getting worse)
 *
 * @module learning/regret-tracker
 */

import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('regret-tracker');

// ============================================================================
// Constants
// ============================================================================

/** Minimum data points required for reliable growth rate classification */
const MIN_DATA_POINTS_FOR_CLASSIFICATION = 50;

/** Slope threshold below which growth is classified as sublinear */
const SUBLINEAR_THRESHOLD = 0.9;

/** Slope threshold above which growth is classified as superlinear */
const SUPERLINEAR_THRESHOLD = 1.1;

// ============================================================================
// Types
// ============================================================================

/** A single point on the regret curve */
export interface RegretPoint {
  /** Number of decisions made so far */
  decisionCount: number;
  /** Cumulative regret at this point */
  cumulativeRegret: number;
  /** Timestamp when this decision was recorded */
  timestamp: number;
}

/** Growth rate classification for a domain's regret curve */
export type GrowthRate = 'sublinear' | 'linear' | 'superlinear' | 'insufficient_data';

/** Health summary for a single domain */
export interface DomainHealthSummary {
  /** Domain identifier */
  domain: string;
  /** Total number of decisions recorded */
  totalDecisions: number;
  /** Current cumulative regret */
  cumulativeRegret: number;
  /** Growth rate classification */
  growthRate: GrowthRate;
  /** Whether stagnation has been detected */
  stagnating: boolean;
  /** Log-log slope (undefined if insufficient data) */
  slope: number | undefined;
  /** Average regret per decision (recent window) */
  recentAvgRegret: number;
}

/** Alert emitted when a domain's regret growth rate changes */
export interface RegretAlert {
  /** Domain that triggered the alert */
  domain: string;
  /** Previous growth rate */
  previousRate: GrowthRate;
  /** New growth rate */
  newRate: GrowthRate;
  /** Timestamp of the alert */
  timestamp: number;
  /** Human-readable message */
  message: string;
}

/** Internal per-domain state */
interface DomainState {
  /** All regret data points for this domain */
  points: RegretPoint[];
  /** Running cumulative regret total */
  cumulativeRegret: number;
  /** Total decisions recorded */
  decisionCount: number;
  /** Last classified growth rate (for transition alerts) */
  lastGrowthRate: GrowthRate;
}

/** Callback for regret alerts */
export type RegretAlertCallback = (alert: RegretAlert) => void;

// ============================================================================
// Linear Regression Helper
// ============================================================================

/**
 * Compute the slope of a simple linear regression (y = mx + b).
 *
 * Uses the ordinary least squares formula:
 *   m = (n * sum(xy) - sum(x) * sum(y)) / (n * sum(x^2) - (sum(x))^2)
 *
 * @param xs - Independent variable values
 * @param ys - Dependent variable values
 * @returns Slope of the regression line
 */
export function linearRegressionSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-10) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

// ============================================================================
// RegretTracker
// ============================================================================

/**
 * Tracks cumulative regret per domain to assess whether QE agents
 * are learning over time. Regret_i = optimal_reward - actual_reward.
 * R(n) = sum of regret_i for i=1..n. Sublinear R(n) ~ n^alpha (alpha < 1)
 * indicates learning; linear or superlinear indicates stagnation.
 */
export class RegretTracker {
  /** Per-domain regret tracking state */
  private domains: Map<string, DomainState> = new Map();

  /** Alert callbacks */
  private alertCallbacks: RegretAlertCallback[] = [];

  /** Historical alerts for review */
  private alerts: RegretAlert[] = [];

  /** Maximum number of alerts to retain */
  private readonly maxAlerts: number;

  /** Window size for recent average regret calculation */
  private readonly recentWindow: number;

  constructor(options?: { maxAlerts?: number; recentWindow?: number }) {
    this.maxAlerts = options?.maxAlerts ?? 100;
    this.recentWindow = options?.recentWindow ?? 20;
  }

  // ==========================================================================
  // Core Recording
  // ==========================================================================

  /**
   * Record a decision outcome for regret tracking.
   *
   * @param domain - The QE domain (e.g. 'test-generation', 'coverage-analysis')
   * @param reward - The actual reward received (0 to 1)
   * @param optimalReward - The best possible reward (0 to 1)
   */
  recordDecision(domain: string, reward: number, optimalReward: number): void {
    const state = this.getOrCreateDomainState(domain);
    const regret = Math.max(0, optimalReward - reward);

    state.cumulativeRegret += regret;
    state.decisionCount++;

    state.points.push({
      decisionCount: state.decisionCount,
      cumulativeRegret: state.cumulativeRegret,
      timestamp: Date.now(),
    });

    // Check for growth rate transitions after enough data
    if (state.decisionCount >= MIN_DATA_POINTS_FOR_CLASSIFICATION) {
      const currentRate = this.classifyGrowthRate(state.points);
      if (
        state.lastGrowthRate !== 'insufficient_data' &&
        currentRate !== state.lastGrowthRate
      ) {
        this.emitAlert(domain, state.lastGrowthRate, currentRate);
      }
      state.lastGrowthRate = currentRate;
    }
  }

  // ==========================================================================
  // Regret Queries
  // ==========================================================================

  /**
   * Get the current cumulative regret for a domain.
   *
   * @param domain - Domain identifier
   * @returns Cumulative regret, or 0 if domain not tracked
   */
  getCumulativeRegret(domain: string): number {
    const state = this.domains.get(domain);
    return state?.cumulativeRegret ?? 0;
  }

  /**
   * Get the full regret curve for a domain.
   *
   * @param domain - Domain identifier
   * @returns Array of regret data points, or empty array if not tracked
   */
  getRegretCurve(domain: string): RegretPoint[] {
    const state = this.domains.get(domain);
    if (!state) return [];
    return [...state.points];
  }

  /**
   * Classify the growth rate of cumulative regret for a domain.
   *
   * Uses log-log linear regression: if R(n) ~ n^alpha, then
   * log(R) ~ alpha * log(n), so the slope of log(R) vs log(n)
   * gives us alpha.
   *
   * @param domain - Domain identifier
   * @returns Growth rate classification
   */
  getRegretGrowthRate(domain: string): GrowthRate {
    const state = this.domains.get(domain);
    if (!state) return 'insufficient_data';
    return this.classifyGrowthRate(state.points);
  }

  /**
   * Detect whether a domain is stagnating (linear or superlinear regret growth).
   *
   * @param domain - Domain identifier
   * @returns true if the domain shows stagnation
   */
  detectStagnation(domain: string): boolean {
    const rate = this.getRegretGrowthRate(domain);
    return rate === 'linear' || rate === 'superlinear';
  }

  // ==========================================================================
  // Health Dashboard
  // ==========================================================================

  /**
   * Get a health summary for all tracked domains.
   *
   * @returns Array of domain health summaries, sorted by domain name
   */
  getHealthSummary(): DomainHealthSummary[] {
    const summaries: DomainHealthSummary[] = [];

    for (const [domain, state] of this.domains) {
      const growthRate = this.classifyGrowthRate(state.points);
      const slope = this.computeLogLogSlope(state.points);

      // Compute recent average regret
      const recentAvgRegret = this.computeRecentAvgRegret(state);

      summaries.push({
        domain,
        totalDecisions: state.decisionCount,
        cumulativeRegret: state.cumulativeRegret,
        growthRate,
        stagnating: growthRate === 'linear' || growthRate === 'superlinear',
        slope,
        recentAvgRegret,
      });
    }

    // Sort alphabetically by domain
    summaries.sort((a, b) => a.domain.localeCompare(b.domain));
    return summaries;
  }

  // ==========================================================================
  // Alert System
  // ==========================================================================

  /**
   * Register a callback for regret growth rate transition alerts.
   *
   * @param callback - Function to call when a growth rate transition occurs
   */
  onAlert(callback: RegretAlertCallback): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get all historical alerts.
   *
   * @returns Array of past alerts
   */
  getAlerts(): RegretAlert[] {
    return [...this.alerts];
  }

  // ==========================================================================
  // Accessors
  // ==========================================================================

  /**
   * Get list of all tracked domains.
   */
  getTrackedDomains(): string[] {
    return [...this.domains.keys()].sort();
  }

  /**
   * Get the total number of decisions across all domains.
   */
  getTotalDecisions(): number {
    let total = 0;
    for (const state of this.domains.values()) {
      total += state.decisionCount;
    }
    return total;
  }

  /**
   * Reset tracking data for a specific domain (or all domains).
   *
   * @param domain - Domain to reset, or undefined to reset all
   */
  reset(domain?: string): void {
    if (domain) {
      this.domains.delete(domain);
    } else {
      this.domains.clear();
      this.alerts = [];
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Get or create domain tracking state.
   */
  private getOrCreateDomainState(domain: string): DomainState {
    let state = this.domains.get(domain);
    if (!state) {
      state = {
        points: [],
        cumulativeRegret: 0,
        decisionCount: 0,
        lastGrowthRate: 'insufficient_data',
      };
      this.domains.set(domain, state);
    }
    return state;
  }

  /**
   * Classify the growth rate of a regret curve using log-log regression.
   *
   * @param points - Regret data points
   * @returns Growth rate classification
   */
  private classifyGrowthRate(points: RegretPoint[]): GrowthRate {
    if (points.length < MIN_DATA_POINTS_FOR_CLASSIFICATION) {
      return 'insufficient_data';
    }

    const slope = this.computeLogLogSlope(points);
    if (slope === undefined) return 'insufficient_data';

    if (slope < SUBLINEAR_THRESHOLD) return 'sublinear';
    if (slope <= SUPERLINEAR_THRESHOLD) return 'linear';
    return 'superlinear';
  }

  /**
   * Compute the slope of log(regret) vs log(n) for the regret curve.
   *
   * Filters out points where cumulative regret is zero (log(0) is undefined).
   *
   * @param points - Regret data points
   * @returns Slope value, or undefined if insufficient valid data
   */
  private computeLogLogSlope(points: RegretPoint[]): number | undefined {
    if (points.length < MIN_DATA_POINTS_FOR_CLASSIFICATION) {
      return undefined;
    }

    // Filter to points with positive regret and positive decision count
    const validPoints = points.filter(
      p => p.cumulativeRegret > 0 && p.decisionCount > 0
    );

    if (validPoints.length < 2) return undefined;

    const logN = validPoints.map(p => Math.log(p.decisionCount));
    const logR = validPoints.map(p => Math.log(p.cumulativeRegret));

    return linearRegressionSlope(logN, logR);
  }

  /**
   * Compute the average per-decision regret over the recent window.
   */
  private computeRecentAvgRegret(state: DomainState): number {
    if (state.points.length < 2) return 0;

    const windowSize = Math.min(this.recentWindow, state.points.length);
    const recentPoints = state.points.slice(-windowSize);

    // Recent regret = difference in cumulative regret over the window
    const firstPoint = recentPoints[0];
    const lastPoint = recentPoints[recentPoints.length - 1];
    const regretInWindow = lastPoint.cumulativeRegret - firstPoint.cumulativeRegret;
    const decisionsInWindow = lastPoint.decisionCount - firstPoint.decisionCount;

    if (decisionsInWindow <= 0) return 0;
    return regretInWindow / decisionsInWindow;
  }

  /**
   * Emit a growth rate transition alert.
   */
  private emitAlert(
    domain: string,
    previousRate: GrowthRate,
    newRate: GrowthRate
  ): void {
    const alert: RegretAlert = {
      domain,
      previousRate,
      newRate,
      timestamp: Date.now(),
      message: `Domain "${domain}" regret growth changed from ${previousRate} to ${newRate}`,
    };

    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.shift();
    }

    logger.info('Regret growth rate transition', {
      domain,
      previousRate,
      newRate,
    });

    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (err) {
        logger.error('Alert callback error', err instanceof Error ? err : undefined);
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new RegretTracker instance.
 *
 * @param options - Optional configuration
 * @returns New RegretTracker
 */
export function createRegretTracker(options?: {
  maxAlerts?: number;
  recentWindow?: number;
}): RegretTracker {
  return new RegretTracker(options);
}
