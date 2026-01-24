/**
 * Init Phases Index
 * Exports all phase modules for the modular init system
 */

// Phase interface and base class
export {
  BasePhase,
  PhaseRegistry,
  createPhaseRegistry,
  type InitPhase,
  type InitContext,
  type InitOptions,
  type PhaseResult,
  type V2DetectionResult,
  type EnhancementStatus,
} from './phase-interface.js';

// Individual phases - import and re-export
import { DetectionPhase } from './01-detection.js';
import { AnalysisPhase } from './02-analysis.js';
import { ConfigurationPhase } from './03-configuration.js';
import { DatabasePhase } from './04-database.js';
import { LearningPhase } from './05-learning.js';
import { CodeIntelligencePhase } from './06-code-intelligence.js';
import { HooksPhase } from './07-hooks.js';
import { MCPPhase } from './08-mcp.js';
import { AssetsPhase } from './09-assets.js';
import { WorkersPhase } from './10-workers.js';
import { ClaudeMdPhase } from './11-claude-md.js';
import { VerificationPhase } from './12-verification.js';

export { DetectionPhase, type DetectionResult } from './01-detection.js';
export { AnalysisPhase } from './02-analysis.js';
export { ConfigurationPhase } from './03-configuration.js';
export { DatabasePhase, type DatabaseResult } from './04-database.js';
export { LearningPhase, type LearningResult } from './05-learning.js';
export { CodeIntelligencePhase, type CodeIntelligenceResult } from './06-code-intelligence.js';
export { HooksPhase, type HooksResult } from './07-hooks.js';
export { MCPPhase, type MCPResult } from './08-mcp.js';
export { AssetsPhase, type AssetsResult } from './09-assets.js';
export { WorkersPhase, type WorkersResult } from './10-workers.js';
export { ClaudeMdPhase, type ClaudeMdResult } from './11-claude-md.js';
export { VerificationPhase, type VerificationResult } from './12-verification.js';

// Phase instances
export const detectionPhase = new DetectionPhase();
export const analysisPhase = new AnalysisPhase();
export const configurationPhase = new ConfigurationPhase();
export const databasePhase = new DatabasePhase();
export const learningPhase = new LearningPhase();
export const codeIntelligencePhase = new CodeIntelligencePhase();
export const hooksPhase = new HooksPhase();
export const mcpPhase = new MCPPhase();
export const assetsPhase = new AssetsPhase();
export const workersPhase = new WorkersPhase();
export const claudeMdPhase = new ClaudeMdPhase();
export const verificationPhase = new VerificationPhase();

/**
 * Get all default phases in order
 */
export function getDefaultPhases() {
  return [
    detectionPhase,
    analysisPhase,
    configurationPhase,
    databasePhase,
    learningPhase,
    codeIntelligencePhase,
    hooksPhase,
    mcpPhase,
    assetsPhase,
    workersPhase,
    claudeMdPhase,
    verificationPhase,
  ];
}
