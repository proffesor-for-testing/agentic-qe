/**
 * Coordination Patterns for Agentic QE Fleet
 *
 * This module provides coordination patterns for distributed agent swarms:
 *
 * 1. **Blackboard Pattern** - Asynchronous information sharing via hints
 * 2. **Consensus Gating** - Quorum-based decision making
 * 3. **GOAP (Goal-Oriented Action Planning)** - A* pathfinding for task sequences
 * 4. **OODA Loop** - Observe-Orient-Decide-Act for rapid adaptation
 */

export { BlackboardCoordination } from './BlackboardCoordination';
export { ConsensusGating } from './ConsensusGating';
export { GOAPCoordination } from './GOAPCoordination';
export { OODACoordination } from './OODACoordination';

export type { BlackboardHint } from './BlackboardCoordination';
export type { ConsensusProposal, ConsensusState } from './ConsensusGating';
export type { WorldState, Goal, Action, Plan } from './GOAPCoordination';
export type { Observation, Orientation, Decision, Action as OODAAction, OODALoop } from './OODACoordination';
