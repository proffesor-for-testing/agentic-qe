/**
 * Agentic QE v3 - Coordination Mixins
 * Reusable mixins for domain coordinator capabilities
 *
 * Mixins provide cross-cutting capabilities that can be composed into
 * domain coordinators without inheritance hierarchies.
 */

// ============================================================================
// MinCut-Aware Domain Mixin
// ============================================================================

export {
  MinCutAwareDomainMixin,
  createMinCutAwareMixin,
  isMinCutAwareDomain,
  DEFAULT_MINCUT_AWARE_CONFIG,
} from './mincut-aware-domain';

export type {
  IMinCutAwareDomain,
  MinCutAwareConfig,
} from './mincut-aware-domain';

// ============================================================================
// Consensus Enabled Domain Mixin (CONSENSUS-MIXIN-001)
// ============================================================================

export {
  // Main mixin class
  ConsensusEnabledMixin,

  // Factory function
  createConsensusEnabledMixin,

  // TypeScript mixin helper
  withConsensusEnabled,

  // Configuration
  DEFAULT_CONSENSUS_ENABLED_CONFIG,
} from './consensus-enabled-domain';

export type {
  // Interfaces
  IConsensusEnabledDomain,
  ConsensusEnabledConfig,

  // Type helpers
  Constructor,
} from './consensus-enabled-domain';

// ============================================================================
// Re-export Domain Finding Types (used by consensus mixin)
// ============================================================================

export {
  createDomainFinding,
  isHighStakesFinding,
  generateFindingId,
} from '../consensus/domain-findings';

// Types already exported from ../consensus - avoid duplicate exports
// Re-export only what's unique to mixins
export type {
  DomainFinding,
  FindingSeverity,
  SecurityFindingPayload,
  DefectPredictionPayload,
  ContractViolationPayload,
} from '../consensus/domain-findings';
