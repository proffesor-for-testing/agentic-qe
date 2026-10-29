/**
 * Agentic QE v3 - Ranking domains by measured success (#1147)
 *
 * Pure: no reads or writes. Both learning dashboards (the MCP
 * `qe/learning/optimize` tool and the domain coordinator) rank domains with
 * this one rule:
 * - a domain with no measured outcome has no rate and is left out;
 * - a domain whose measured runs all failed (0%) is not top-performing;
 * - the rest are ordered by measured success rate, highest first.
 */

import type { DomainName } from '../../shared/types/index.js';
import type { Experience } from './interfaces.js';
import { partitionByRewardSource } from './reward-source.js';

export interface DomainSuccessRate {
  readonly domain: DomainName;
  /** Measured success rate, or null when the domain has no measured outcome. */
  readonly successRate: number | null;
}

export interface TopPerformingDomains {
  readonly topPerformingDomains: DomainName[];
  /** Domains with at least one measured outcome (ranked or not). */
  readonly measuredDomains: number;
}

/** Measured success rate of a domain's experiences; null when none is measured. */
export function measuredSuccessRate(experiences: readonly Experience[]): number | null {
  const { measured } = partitionByRewardSource(experiences);
  if (measured.length === 0) return null;
  return measured.filter((e) => e.result.success).length / measured.length;
}

export function rankTopPerformingDomains(
  rates: readonly DomainSuccessRate[],
  limit = 3
): TopPerformingDomains {
  const measured = rates.filter(
    (r): r is DomainSuccessRate & { successRate: number } => r.successRate !== null
  );
  const topPerformingDomains = measured
    .filter((r) => r.successRate > 0)
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, limit)
    .map((r) => r.domain);
  return { topPerformingDomains, measuredDomains: measured.length };
}
