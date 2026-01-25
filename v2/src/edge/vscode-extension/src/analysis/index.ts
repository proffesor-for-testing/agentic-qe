/**
 * Analysis Module Exports
 *
 * Real-time code analysis engine for the VS Code extension.
 *
 * @module vscode-extension/analysis
 * @version 0.1.0
 */

// Main coordinator
export {
  CodeAnalyzer,
  createAnalyzer,
  type FunctionAnalysis,
  type FileAnalysisResult,
  type CodeAnalyzerOptions,
} from './CodeAnalyzer';

// Function extraction
export {
  FunctionExtractor,
  type ExtractedFunction,
  type ParameterInfo,
  type JSDocInfo,
  type Position,
  type FunctionKind,
  type FunctionModifier,
  type ExtractorOptions,
} from './FunctionExtractor';

// Complexity calculation
export {
  ComplexityCalculator,
  type ComplexityResult,
  type ComplexityBreakdown,
  type ComplexityCategory,
  type ComplexitySummary,
  type ComplexityOptions,
  type ComplexityThresholds,
} from './ComplexityCalculator';

// Testability scoring
export {
  TestabilityScorer,
  type TestabilityScore,
  type TestabilityCategory,
  type TestabilityFactors,
  type FactorScore,
  type AntiPattern,
  type AntiPatternType,
  type TestabilitySuggestion,
  type TestabilityScorerOptions,
} from './TestabilityScorer';

// Pattern matching
export {
  PatternMatcher,
  type CodePattern,
  type PatternType,
  type PatternCharacteristics,
  type PatternMetadata,
  type PatternMatch,
  type TestPattern,
  type TestSuggestion,
  type ControlFlowPattern,
  type PatternMatcherOptions,
} from './PatternMatcher';
