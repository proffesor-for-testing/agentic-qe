/**
 * Reasoning module - Pattern extraction, analysis, and similarity matching
 * Phase 2 (v1.1.0) - Pattern Extraction Specialist
 * Enhanced (v1.3.3+) - Vector Similarity and Quality Scoring
 */

// Pattern extraction and classification
export { PatternExtractor } from './PatternExtractor';
export { CodeSignatureGenerator } from './CodeSignatureGenerator';
export { TestTemplateCreator } from './TestTemplateCreator';
export { PatternClassifier } from './PatternClassifier';

// Pattern storage and retrieval (Enhanced in v1.3.3+)
export { QEReasoningBank } from './QEReasoningBank';
export type { TestPattern, PatternMatch } from './QEReasoningBank';

// Vector similarity (NEW in v1.3.3+)
export { VectorSimilarity } from './VectorSimilarity';
export type { SimilarityResult, TFIDFConfig } from './VectorSimilarity';

// Pattern quality scoring (NEW in v1.3.3+)
export { PatternQualityScorer } from './PatternQualityScorer';
export type { QualityComponents, ScoredPattern } from './PatternQualityScorer';

export * from '../types/pattern.types';
