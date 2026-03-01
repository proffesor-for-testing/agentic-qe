/**
 * Agentic QE v3 - QX Analysis Tools
 *
 * MCP tools for programmatic Quality Experience analysis.
 * Ported from V2 QXPartnerAgent for consistent, high-quality output.
 *
 * QX Methodology by Lalitkumar Bhamare / Tales of Testing
 * https://talesoftesting.com/quality-experienceqx-co-creating-quality-experience-for-everyone-associated-with-the-product/
 *
 * Tools:
 * - qe/qx/analyze: Comprehensive QX analysis (combines all analysis)
 *
 * Components (used internally):
 * - QXHeuristicsEngine: Applies 23+ programmatic heuristics
 * - OracleDetector: Detects oracle problems
 * - ImpactAnalyzer: Analyzes visible/invisible impacts
 */

// Types
export * from './types';

// Components
export { QXHeuristicsEngine, getHeuristicsByCategory } from './heuristics-engine';
export { OracleDetector } from './oracle-detector';
export { ImpactAnalyzer } from './impact-analyzer';

// Tools
export { QXAnalyzeTool, qxAnalyzeTool } from './analyze';

// Tool Registration
import { qxAnalyzeTool } from './analyze';

/**
 * Get all QX analysis tools for registration
 */
export function getQXAnalysisTools() {
  return [qxAnalyzeTool];
}
