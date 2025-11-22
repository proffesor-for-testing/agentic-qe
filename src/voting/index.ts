/**
 * Voting orchestration module exports
 * Phase 2 GOAP implementation - Action C8
 */

export * from './types.js';
export * from './panel-assembly.js';
export * from './consensus.js';
export * from './orchestrator.js';

// Re-export key classes for convenience
export {
  VotingOrchestrator
} from './orchestrator.js';

export {
  PanelAssembler,
  DefaultVotingStrategy,
  DefaultAgentPool
} from './panel-assembly.js';

export {
  ConsensusEngine,
  ConsensusFactory
} from './consensus.js';
