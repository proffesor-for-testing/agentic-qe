/**
 * Service exports for VS Code extension
 *
 * @module vscode-extension/services
 * @version 0.1.0
 */

export { EdgeAgentService } from './EdgeAgentService';
export type {
  PatternType,
  PatternDomain,
  PatternMatch,
  StoredPattern,
  EdgeAgentStats,
  AnalysisResult,
  PatternEmbedding,
} from './EdgeAgentService';

export { AnalysisService } from './AnalysisService';
export type {
  FileAnalysis,
  FunctionInfo,
  TestSuggestion,
} from './AnalysisService';

export { AQEPatternBridge, createAQEPatternBridge } from './AQEPatternBridge';
export type {
  QEPattern,
  AQEPatternBridgeConfig,
  PatternSyncResult,
} from './AQEPatternBridge';
