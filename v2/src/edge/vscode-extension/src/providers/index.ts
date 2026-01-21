/**
 * Provider exports for VS Code extension
 *
 * @module vscode-extension/providers
 * @version 0.1.0
 */

export { TestSuggestionProvider } from './TestSuggestionProvider';
export { CoverageDecorationProvider, CoverageLevel } from './CoverageDecorationProvider';
export type { LineCoverage, CoverageSummary } from './CoverageDecorationProvider';
export {
  CoverageGapVisualization,
  createCoverageGapVisualization,
} from './CoverageGapVisualization';
export type {
  CoverageGap,
  HeatMapData,
  HeatMapCell,
  HeatMapStats,
} from './CoverageGapVisualization';
