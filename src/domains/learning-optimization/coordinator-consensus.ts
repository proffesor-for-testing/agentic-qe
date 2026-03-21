/**
 * Learning Optimization - Consensus Verification Methods
 * Extracted from coordinator.ts for CQ-004 (file size reduction)
 *
 * Contains: consensus verification for pattern recommendations, optimization suggestions,
 * cross-domain insights
 */

import { LoggerFactory } from '../../logging/index.js';
import { v4 as uuidv4 } from 'uuid';
import type { DomainName } from '../../shared/types/index.js';
import {
  type DomainFinding,
  createDomainFinding,
} from '../../coordination/consensus/domain-findings.js';
import type { ConsensusEnabledMixin } from '../../coordination/mixins/consensus-enabled-domain';

/**
 * Verify a pattern recommendation using multi-model consensus
 */
const logger = LoggerFactory.create('learning-optimization/consensus');

export async function verifyPatternRecommendation(
  pattern: { id: string; name: string; type: string; domain: DomainName },
  confidence: number,
  consensusMixin: ConsensusEnabledMixin,
  domainName: string
): Promise<boolean> {
  const finding: DomainFinding<typeof pattern> = createDomainFinding({
    id: uuidv4(),
    type: 'pattern-recommendation',
    confidence,
    description: `Verify pattern recommendation: ${pattern.name} (${pattern.type}) for domain ${pattern.domain}`,
    payload: pattern,
    detectedBy: 'learning-optimization-coordinator',
    severity: confidence > 0.9 ? 'high' : 'medium',
  });

  if (consensusMixin.requiresConsensus(finding)) {
    const result = await consensusMixin.verifyFinding(finding);
    if (result.success && result.value.verdict === 'verified') {
      logger.info(`Pattern recommendation '${pattern.name}' verified by consensus`);
      return true;
    }
    logger.warn(`Pattern recommendation '${pattern.name}' NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
    return false;
  }
  return true;
}

/**
 * Verify an optimization suggestion using multi-model consensus
 */
export async function verifyOptimizationSuggestion(
  suggestion: { metric: string; currentValue: number; targetValue: number; strategy: string },
  confidence: number,
  consensusMixin: ConsensusEnabledMixin,
  domainName: string
): Promise<boolean> {
  const finding: DomainFinding<typeof suggestion> = createDomainFinding({
    id: uuidv4(),
    type: 'optimization-suggestion',
    confidence,
    description: `Verify optimization: ${suggestion.metric} from ${suggestion.currentValue} to ${suggestion.targetValue} via ${suggestion.strategy}`,
    payload: suggestion,
    detectedBy: 'learning-optimization-coordinator',
    severity: confidence > 0.85 ? 'high' : 'medium',
  });

  if (consensusMixin.requiresConsensus(finding)) {
    const result = await consensusMixin.verifyFinding(finding);
    if (result.success && result.value.verdict === 'verified') {
      logger.info(`Optimization suggestion for '${suggestion.metric}' verified by consensus`);
      return true;
    }
    logger.warn(`Optimization suggestion for '${suggestion.metric}' NOT verified`);
    return false;
  }
  return true;
}

/**
 * Verify a cross-domain insight using multi-model consensus
 */
export async function verifyCrossDomainInsight(
  insight: { sourceDomain: DomainName; targetDomains: DomainName[]; description: string; impact: string },
  confidence: number,
  consensusMixin: ConsensusEnabledMixin,
  domainName: string
): Promise<boolean> {
  const finding: DomainFinding<typeof insight> = createDomainFinding({
    id: uuidv4(),
    type: 'cross-domain-insight',
    confidence,
    description: `Verify cross-domain insight: ${insight.description}`,
    payload: insight,
    detectedBy: 'learning-optimization-coordinator',
    severity: 'high',
  });

  if (consensusMixin.requiresConsensus(finding)) {
    const result = await consensusMixin.verifyFinding(finding);
    if (result.success && result.value.verdict === 'verified') {
      logger.info(`Cross-domain insight verified by consensus for ${insight.targetDomains.length} target domains`);
      return true;
    }
    logger.warn(`Cross-domain insight NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
    return false;
  }
  return true;
}
