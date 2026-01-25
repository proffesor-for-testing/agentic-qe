/**
 * Agentic QE v3 - Coherence MCP Tools
 * ADR-052: Phase 4 Action A4.1
 *
 * Exports 4 coherence MCP tools for mathematical coherence verification:
 * - CoherenceCheckTool: Check coherence of beliefs/facts
 * - CoherenceAuditTool: Audit QE memory for contradictions
 * - CoherenceConsensusTool: Verify multi-agent consensus
 * - CoherenceCollapseTool: Predict swarm collapse risk
 *
 * All tools use the Prime Radiant engines via CoherenceService.
 */

export {
  CoherenceCheckTool,
  createCoherenceCheckTool,
  type CoherenceCheckParams,
  type CoherenceCheckResult,
} from './check.js';

export {
  CoherenceAuditTool,
  createCoherenceAuditTool,
  type CoherenceAuditParams,
  type CoherenceAuditResult,
} from './audit.js';

export {
  CoherenceConsensusTool,
  createCoherenceConsensusTool,
  type CoherenceConsensusParams,
  type CoherenceConsensusResult,
} from './consensus.js';

export {
  CoherenceCollapseTool,
  createCoherenceCollapseTool,
  type CoherenceCollapseParams,
  type CoherenceCollapseResult,
} from './collapse.js';

// ============================================================================
// Tool Array for Registration
// ============================================================================

import { CoherenceCheckTool } from './check.js';
import { CoherenceAuditTool } from './audit.js';
import { CoherenceConsensusTool } from './consensus.js';
import { CoherenceCollapseTool } from './collapse.js';
import type { MCPToolBase } from '../base.js';

/**
 * All coherence MCP tools
 */
export const COHERENCE_TOOLS: MCPToolBase[] = [
  new CoherenceCheckTool(),
  new CoherenceAuditTool(),
  new CoherenceConsensusTool(),
  new CoherenceCollapseTool(),
];

/**
 * Coherence tool names (ADR-010 naming convention)
 */
export const COHERENCE_TOOL_NAMES = {
  COHERENCE_CHECK: 'qe/coherence/check',
  COHERENCE_AUDIT: 'qe/coherence/audit',
  COHERENCE_CONSENSUS: 'qe/coherence/consensus',
  COHERENCE_COLLAPSE: 'qe/coherence/collapse',
} as const;
