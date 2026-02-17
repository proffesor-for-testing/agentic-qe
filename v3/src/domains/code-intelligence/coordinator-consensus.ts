/**
 * Code Intelligence - Consensus Verification Methods
 * Extracted from coordinator.ts for CQ-004 (file size reduction)
 *
 * Contains: consensus verification for code patterns, impact analysis, dependency mapping
 */

import { v4 as uuidv4 } from 'uuid';
import {
  type DomainFinding,
  createDomainFinding,
} from '../../coordination/consensus/domain-findings';
import type { ConsensusEnabledMixin } from '../../coordination/mixins/consensus-enabled-domain';

/**
 * Verify a code pattern detection using multi-model consensus
 */
export async function verifyCodePatternDetection(
  pattern: { id: string; name: string; type: string; location: string },
  confidence: number,
  consensusMixin: ConsensusEnabledMixin,
  domainName: string
): Promise<boolean> {
  const finding: DomainFinding<typeof pattern> = createDomainFinding({
    id: uuidv4(),
    type: 'code-pattern-detection',
    confidence,
    description: `Verify code pattern: ${pattern.name} (${pattern.type}) at ${pattern.location}`,
    payload: pattern,
    detectedBy: 'code-intelligence-coordinator',
    severity: confidence > 0.9 ? 'high' : 'medium',
  });

  if (consensusMixin.requiresConsensus(finding)) {
    const result = await consensusMixin.verifyFinding(finding);
    if (result.success && result.value.verdict === 'verified') {
      console.log(`[${domainName}] Code pattern '${pattern.name}' verified by consensus`);
      return true;
    }
    console.warn(`[${domainName}] Code pattern '${pattern.name}' NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
    return false;
  }
  return true;
}

/**
 * Verify an impact analysis using multi-model consensus
 */
export async function verifyImpactAnalysis(
  impact: { changedFiles: string[]; riskLevel: string; impactedTests: string[] },
  confidence: number,
  consensusMixin: ConsensusEnabledMixin,
  domainName: string
): Promise<boolean> {
  const finding: DomainFinding<typeof impact> = createDomainFinding({
    id: uuidv4(),
    type: 'impact-analysis',
    confidence,
    description: `Verify impact analysis: ${impact.changedFiles.length} files, risk=${impact.riskLevel}, ${impact.impactedTests.length} tests`,
    payload: impact,
    detectedBy: 'code-intelligence-coordinator',
    severity: impact.riskLevel === 'critical' || impact.riskLevel === 'high' ? 'high' : 'medium',
  });

  if (consensusMixin.requiresConsensus(finding)) {
    const result = await consensusMixin.verifyFinding(finding);
    if (result.success && result.value.verdict === 'verified') {
      console.log(`[${domainName}] Impact analysis verified by consensus (risk=${impact.riskLevel})`);
      return true;
    }
    console.warn(`[${domainName}] Impact analysis NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
    return false;
  }
  return true;
}

/**
 * Verify a dependency mapping using multi-model consensus
 */
export async function verifyDependencyMapping(
  dependency: { source: string; targets: string[]; type: string },
  confidence: number,
  consensusMixin: ConsensusEnabledMixin,
  domainName: string
): Promise<boolean> {
  const finding: DomainFinding<typeof dependency> = createDomainFinding({
    id: uuidv4(),
    type: 'dependency-mapping',
    confidence,
    description: `Verify dependency: ${dependency.source} -> ${dependency.targets.length} targets (${dependency.type})`,
    payload: dependency,
    detectedBy: 'code-intelligence-coordinator',
    severity: confidence > 0.85 ? 'high' : 'medium',
  });

  if (consensusMixin.requiresConsensus(finding)) {
    const result = await consensusMixin.verifyFinding(finding);
    if (result.success && result.value.verdict === 'verified') {
      console.log(`[${domainName}] Dependency mapping verified by consensus`);
      return true;
    }
    console.warn(`[${domainName}] Dependency mapping NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
    return false;
  }
  return true;
}
