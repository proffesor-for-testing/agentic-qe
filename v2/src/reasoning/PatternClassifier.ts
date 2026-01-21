/**
 * PatternClassifier - Classify and recommend patterns for code
 * Phase 2 (v1.1.0) - Pattern Extraction Specialist
 *
 * Classifies patterns by type and calculates similarity scores to:
 * - Categorize extracted patterns
 * - Calculate pattern similarity
 * - Recommend patterns for new code
 * - Support pattern-based test generation
 */

import {
  TestPattern,
  PatternType,
  PatternClassificationResult,
  PatternSimilarity,
  PatternRecommendation,
  SimilarityDetails,
  CodeSignature
} from '../types/pattern.types';
import { Logger } from '../utils/Logger';
import { CodeSignatureGenerator } from './CodeSignatureGenerator';

export class PatternClassifier {
  private logger: Logger;
  private signatureGenerator: CodeSignatureGenerator;
  private patterns: Map<string, TestPattern>;

  constructor() {
    this.logger = Logger.getInstance();
    this.signatureGenerator = new CodeSignatureGenerator();
    this.patterns = new Map();
  }

  /**
   * Load patterns for classification
   */
  loadPatterns(patterns: TestPattern[]): void {
    patterns.forEach(pattern => {
      this.patterns.set(pattern.id, pattern);
    });
    this.logger.info(`Loaded ${patterns.length} patterns for classification`);
  }

  /**
   * Classify a pattern
   */
  async classify(pattern: TestPattern): Promise<PatternClassificationResult> {
    const type = this.inferPatternType(pattern);
    const confidence = this.calculateClassificationConfidence(pattern, type);
    const reasoning = this.generateReasoning(pattern, type);
    const alternatives = this.getAlternativeClassifications(pattern, type);

    return {
      patternId: pattern.id,
      type,
      confidence,
      reasoning,
      alternatives
    };
  }

  /**
   * Calculate similarity between two patterns
   */
  async calculateSimilarity(pattern1Id: string, pattern2Id: string): Promise<PatternSimilarity> {
    const pattern1 = this.patterns.get(pattern1Id);
    const pattern2 = this.patterns.get(pattern2Id);

    if (!pattern1 || !pattern2) {
      throw new Error('Pattern not found');
    }

    const details = await this.calculateSimilarityDetails(pattern1, pattern2);
    const score = this.aggregateSimilarityScore(details);

    return {
      pattern1: pattern1Id,
      pattern2: pattern2Id,
      score,
      details
    };
  }

  /**
   * Recommend patterns for given code
   */
  async recommendPatterns(
    sourceCode: string,
    limit: number = 5
  ): Promise<PatternRecommendation[]> {
    // Generate signature for target code
    const signature = await this.signatureGenerator.generate(sourceCode);

    const recommendations: PatternRecommendation[] = [];

    // Calculate applicability for each pattern
    for (const pattern of this.patterns.values()) {
      const applicability = this.calculateApplicability(signature, pattern);
      const score = applicability * pattern.confidence;

      recommendations.push({
        patternId: pattern.id,
        patternName: pattern.name,
        score,
        reason: this.generateRecommendationReason(signature, pattern, applicability),
        targetCode: sourceCode,
        applicability
      });
    }

    // Sort by score and return top recommendations
    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Find similar patterns
   */
  async findSimilarPatterns(
    patternId: string,
    threshold: number = 0.7,
    limit: number = 5
  ): Promise<PatternSimilarity[]> {
    const targetPattern = this.patterns.get(patternId);
    if (!targetPattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    const similarities: PatternSimilarity[] = [];

    for (const pattern of this.patterns.values()) {
      if (pattern.id === patternId) continue;

      const similarity = await this.calculateSimilarity(patternId, pattern.id);
      if (similarity.score >= threshold) {
        similarities.push(similarity);
      }
    }

    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Infer pattern type from pattern characteristics
   */
  private inferPatternType(pattern: TestPattern): PatternType {
    const name = pattern.name.toLowerCase();
    const examples = pattern.examples.join(' ').toLowerCase();

    // Check for specific keywords
    if (name.includes('edge') || name.includes('null') || name.includes('undefined')) {
      return PatternType.EDGE_CASE;
    }
    if (name.includes('boundary') || name.includes('range') || examples.includes('>=')) {
      return PatternType.BOUNDARY_CONDITION;
    }
    if (name.includes('error') || examples.includes('throw') || examples.includes('catch')) {
      return PatternType.ERROR_HANDLING;
    }
    if (name.includes('mock') || examples.includes('mock') || examples.includes('stub')) {
      return PatternType.MOCK_PATTERN;
    }
    if (name.includes('async') || examples.includes('async') || examples.includes('await')) {
      return PatternType.ASYNC_PATTERN;
    }
    if (examples.includes('expect(')) {
      return PatternType.ASSERTION_PATTERN;
    }
    if (name.includes('setup') || name.includes('teardown') || name.includes('before') || name.includes('after')) {
      return PatternType.SETUP_TEARDOWN;
    }

    // Default to assertion pattern
    return PatternType.ASSERTION_PATTERN;
  }

  /**
   * Calculate classification confidence
   */
  private calculateClassificationConfidence(pattern: TestPattern, type: PatternType): number {
    let confidence = 0.5; // Base confidence

    const name = pattern.name.toLowerCase();
    const examples = pattern.examples.join(' ').toLowerCase();

    // Increase confidence based on evidence
    const typeKeywords = this.getTypeKeywords(type);
    const matchCount = typeKeywords.filter(kw =>
      name.includes(kw) || examples.includes(kw)
    ).length;

    confidence += (matchCount / typeKeywords.length) * 0.4;

    // Adjust by pattern frequency
    if (pattern.frequency > 5) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  /**
   * Get keywords for pattern type
   */
  private getTypeKeywords(type: PatternType): string[] {
    const keywordMap: Record<PatternType, string[]> = {
      [PatternType.EDGE_CASE]: ['edge', 'null', 'undefined', 'empty', 'zero', 'max', 'min'],
      [PatternType.BOUNDARY_CONDITION]: ['boundary', 'range', 'limit', 'threshold', '>=', '<='],
      [PatternType.ERROR_HANDLING]: ['error', 'throw', 'catch', 'try', 'reject'],
      [PatternType.INTEGRATION]: ['integration', 'api', 'database', 'external'],
      [PatternType.ASYNC_PATTERN]: ['async', 'await', 'promise', 'then', 'callback'],
      [PatternType.MOCK_PATTERN]: ['mock', 'stub', 'spy', 'jest.fn', 'sinon'],
      [PatternType.ASSERTION_PATTERN]: ['expect', 'assert', 'should', 'toBe', 'toEqual'],
      [PatternType.SETUP_TEARDOWN]: ['setup', 'teardown', 'before', 'after', 'beforeEach'],
      [PatternType.DATA_DRIVEN]: ['each', 'table', 'cases', 'data'],
      [PatternType.PARAMETERIZED]: ['parameterized', 'test.each', 'describe.each']
    };
    return keywordMap[type] || [];
  }

  /**
   * Generate reasoning for classification
   */
  private generateReasoning(pattern: TestPattern, type: PatternType): string {
    const keywords = this.getTypeKeywords(type);
    const name = pattern.name.toLowerCase();

    const matchedKeywords = keywords.filter(kw => name.includes(kw));

    if (matchedKeywords.length > 0) {
      return `Pattern classified as ${type} based on keywords: ${matchedKeywords.join(', ')}`;
    }

    return `Pattern classified as ${type} based on structural analysis`;
  }

  /**
   * Get alternative classifications
   */
  private getAlternativeClassifications(
    pattern: TestPattern,
    primaryType: PatternType
  ): Array<{ type: PatternType; confidence: number }> {
    const alternatives: Array<{ type: PatternType; confidence: number }> = [];
    const types = Object.values(PatternType).filter(t => t !== primaryType);

    for (const type of types) {
      const confidence = this.calculateClassificationConfidence(pattern, type);
      if (confidence > 0.3) {
        alternatives.push({ type, confidence });
      }
    }

    return alternatives.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  /**
   * Calculate detailed similarity metrics
   */
  private async calculateSimilarityDetails(
    pattern1: TestPattern,
    pattern2: TestPattern
  ): Promise<SimilarityDetails> {
    const structuralSimilarity = this.calculateStructuralSimilarity(pattern1, pattern2);
    const semanticSimilarity = this.calculateSemanticSimilarity(pattern1, pattern2);
    const typeCompatibility = this.calculateTypeCompatibility(pattern1, pattern2);
    const commonPatterns = this.findCommonPatterns(pattern1, pattern2);

    return {
      structuralSimilarity,
      semanticSimilarity,
      typeCompatibility,
      commonPatterns
    };
  }

  /**
   * Calculate structural similarity
   */
  private calculateStructuralSimilarity(pattern1: TestPattern, pattern2: TestPattern): number {
    // Compare template structures
    const params1 = pattern1.template.parameters.length;
    const params2 = pattern2.template.parameters.length;

    const paramSimilarity = 1 - Math.abs(params1 - params2) / Math.max(params1, params2, 1);
    const categoryMatch = pattern1.category === pattern2.category ? 1 : 0;
    const frameworkMatch = pattern1.framework === pattern2.framework ? 1 : 0.7;

    return (paramSimilarity + categoryMatch + frameworkMatch) / 3;
  }

  /**
   * Calculate semantic similarity
   */
  private calculateSemanticSimilarity(pattern1: TestPattern, pattern2: TestPattern): number {
    // Compare names and descriptions
    const name1Words = pattern1.name.toLowerCase().split(/\s+/);
    const name2Words = pattern2.name.toLowerCase().split(/\s+/);

    const commonWords = name1Words.filter(w => name2Words.includes(w));
    const totalWords = new Set([...name1Words, ...name2Words]).size;

    return commonWords.length / Math.max(totalWords, 1);
  }

  /**
   * Calculate type compatibility
   */
  private calculateTypeCompatibility(pattern1: TestPattern, pattern2: TestPattern): number {
    if (pattern1.type === pattern2.type) return 1.0;

    // Check if types are related
    const relatedTypes: Record<PatternType, PatternType[]> = {
      [PatternType.EDGE_CASE]: [PatternType.BOUNDARY_CONDITION],
      [PatternType.BOUNDARY_CONDITION]: [PatternType.EDGE_CASE],
      [PatternType.ERROR_HANDLING]: [PatternType.ASYNC_PATTERN],
      [PatternType.ASYNC_PATTERN]: [PatternType.ERROR_HANDLING, PatternType.INTEGRATION],
      [PatternType.MOCK_PATTERN]: [PatternType.INTEGRATION],
      [PatternType.INTEGRATION]: [PatternType.ASYNC_PATTERN, PatternType.MOCK_PATTERN],
      [PatternType.ASSERTION_PATTERN]: [],
      [PatternType.SETUP_TEARDOWN]: [],
      [PatternType.DATA_DRIVEN]: [PatternType.PARAMETERIZED],
      [PatternType.PARAMETERIZED]: [PatternType.DATA_DRIVEN]
    };

    const related = relatedTypes[pattern1.type] || [];
    return related.includes(pattern2.type) ? 0.5 : 0.0;
  }

  /**
   * Find common patterns
   */
  private findCommonPatterns(pattern1: TestPattern, pattern2: TestPattern): string[] {
    const common: string[] = [];

    if (pattern1.type === pattern2.type) {
      common.push(`same-type:${pattern1.type}`);
    }

    if (pattern1.framework === pattern2.framework) {
      common.push(`same-framework:${pattern1.framework}`);
    }

    if (pattern1.category === pattern2.category) {
      common.push(`same-category:${pattern1.category}`);
    }

    return common;
  }

  /**
   * Aggregate similarity score
   */
  private aggregateSimilarityScore(details: SimilarityDetails): number {
    const weights = {
      structural: 0.4,
      semantic: 0.3,
      typeCompatibility: 0.3
    };

    return (
      details.structuralSimilarity * weights.structural +
      details.semanticSimilarity * weights.semantic +
      details.typeCompatibility * weights.typeCompatibility
    );
  }

  /**
   * Calculate applicability of pattern to code
   */
  private calculateApplicability(signature: CodeSignature, pattern: TestPattern): number {
    let score = 0.5; // Base score

    // Check for matching patterns in signature
    const matchingPatterns = signature.patterns.filter(p =>
      p.type === pattern.type
    );
    if (matchingPatterns.length > 0) {
      score += 0.3;
    }

    // Check applicability conditions
    const conditions = pattern.applicabilityConditions;
    const signatureInfo = `${signature.functionSignature} ${signature.nodeTypes.join(' ')}`.toLowerCase();

    const matchedConditions = conditions.filter(condition =>
      signatureInfo.includes(condition.toLowerCase())
    );

    score += (matchedConditions.length / Math.max(conditions.length, 1)) * 0.2;

    return Math.min(score, 1.0);
  }

  /**
   * Generate recommendation reason
   */
  private generateRecommendationReason(
    signature: CodeSignature,
    pattern: TestPattern,
    applicability: number
  ): string {
    const reasons: string[] = [];

    if (applicability > 0.8) {
      reasons.push('Highly applicable based on code signature');
    } else if (applicability > 0.6) {
      reasons.push('Moderately applicable');
    } else {
      reasons.push('Potentially applicable');
    }

    if (signature.patterns.some(p => p.type === pattern.type)) {
      reasons.push(`Matching ${pattern.type} pattern detected`);
    }

    if (signature.complexity > 5) {
      reasons.push('High complexity suggests comprehensive testing needed');
    }

    return reasons.join('. ') + '.';
  }

  /**
   * Get all loaded patterns
   */
  getPatterns(): TestPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get pattern by ID
   */
  getPattern(id: string): TestPattern | undefined {
    return this.patterns.get(id);
  }
}
