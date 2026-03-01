/**
 * Agentic QE v3 - Agents Layer
 * Specialized QE agents (Devil's Advocate, Claim Verifier)
 *
 * Re-exported as namespaces to avoid name collisions with generic names
 * like "Evidence", "Claim", "Challenge" etc.
 *
 * @module agents
 *
 * @example
 * ```typescript
 * import { DevilsAdvocate, ClaimVerifier } from '@agentic-qe/v3/agents';
 *
 * const da = DevilsAdvocate.createDevilsAdvocate();
 * const cv = ClaimVerifier.createClaimVerifierService();
 * ```
 */

export * as DevilsAdvocate from './devils-advocate/index.js';
export * as ClaimVerifier from './claim-verifier/index.js';
