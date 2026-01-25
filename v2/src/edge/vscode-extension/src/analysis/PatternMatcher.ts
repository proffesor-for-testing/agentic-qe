/**
 * PatternMatcher - Match code against stored patterns using vector similarity
 *
 * Integrates with @ruvector/edge to:
 * - Generate code embeddings
 * - Store patterns in HNSW index
 * - Find similar patterns for test suggestions
 * - Learn from test outcomes
 *
 * @module vscode-extension/analysis/PatternMatcher
 * @version 0.1.0
 */

import * as ts from 'typescript';
import type { ExtractedFunction } from './FunctionExtractor';
import type { ComplexityResult } from './ComplexityCalculator';
import type { TestabilityScore } from './TestabilityScorer';

/**
 * Code pattern for storage and matching
 */
export interface CodePattern {
  /**
   * Unique pattern ID
   */
  id: string;

  /**
   * Pattern type
   */
  type: PatternType;

  /**
   * Source code signature (normalized)
   */
  signature: string;

  /**
   * Original source code
   */
  sourceCode: string;

  /**
   * Code characteristics
   */
  characteristics: PatternCharacteristics;

  /**
   * Vector embedding
   */
  embedding: number[];

  /**
   * Metadata
   */
  metadata: PatternMetadata;

  /**
   * Associated test patterns
   */
  testPatterns: TestPattern[];

  /**
   * Success rate (0-1)
   */
  successRate: number;

  /**
   * Usage count
   */
  usageCount: number;

  /**
   * Created timestamp
   */
  createdAt: number;

  /**
   * Last used timestamp
   */
  lastUsedAt: number;
}

/**
 * Pattern types
 */
export type PatternType =
  | 'function'
  | 'async-function'
  | 'method'
  | 'constructor'
  | 'factory'
  | 'handler'
  | 'validator'
  | 'transformer'
  | 'accessor'
  | 'callback';

/**
 * Pattern characteristics
 */
export interface PatternCharacteristics {
  /**
   * Number of parameters
   */
  paramCount: number;

  /**
   * Has return value
   */
  hasReturn: boolean;

  /**
   * Is async
   */
  isAsync: boolean;

  /**
   * Cyclomatic complexity
   */
  complexity: number;

  /**
   * Testability score
   */
  testability: number;

  /**
   * Has side effects
   */
  hasSideEffects: boolean;

  /**
   * Dependency count
   */
  dependencyCount: number;

  /**
   * Parameter types (normalized)
   */
  paramTypes: string[];

  /**
   * Return type (normalized)
   */
  returnType: string;

  /**
   * Control flow patterns
   */
  controlFlow: ControlFlowPattern[];
}

/**
 * Control flow patterns
 */
export type ControlFlowPattern =
  | 'sequential'
  | 'conditional'
  | 'loop'
  | 'try-catch'
  | 'early-return'
  | 'guard-clause'
  | 'switch'
  | 'recursive';

/**
 * Pattern metadata
 */
export interface PatternMetadata {
  /**
   * File path where pattern was found
   */
  filePath?: string;

  /**
   * Framework (react, express, etc.)
   */
  framework?: string;

  /**
   * Domain (api, database, ui, etc.)
   */
  domain?: string;

  /**
   * Language
   */
  language: 'typescript' | 'javascript';

  /**
   * Tags for categorization
   */
  tags: string[];
}

/**
 * Associated test pattern
 */
export interface TestPattern {
  /**
   * Test pattern ID
   */
  id: string;

  /**
   * Test type
   */
  type: 'unit' | 'integration' | 'e2e';

  /**
   * Test template/code
   */
  template: string;

  /**
   * Placeholders in template
   */
  placeholders: string[];

  /**
   * Success rate with this pattern
   */
  successRate: number;

  /**
   * Usage count
   */
  usageCount: number;
}

/**
 * Match result
 */
export interface PatternMatch {
  /**
   * Matched pattern
   */
  pattern: CodePattern;

  /**
   * Similarity score (0-1)
   */
  similarity: number;

  /**
   * Match confidence
   */
  confidence: number;

  /**
   * Match explanation
   */
  explanation: string;

  /**
   * Suggested test templates
   */
  suggestedTests: TestSuggestion[];
}

/**
 * Test suggestion
 */
export interface TestSuggestion {
  /**
   * Test title
   */
  title: string;

  /**
   * Test type
   */
  type: 'unit' | 'integration' | 'e2e';

  /**
   * Generated test code
   */
  code: string;

  /**
   * Confidence score
   */
  confidence: number;

  /**
   * Based on pattern ID
   */
  patternId: string;

  /**
   * Explanation
   */
  explanation: string;
}

/**
 * Matcher options
 */
export interface PatternMatcherOptions {
  /**
   * Vector dimension
   */
  dimension?: number;

  /**
   * Minimum similarity threshold
   */
  similarityThreshold?: number;

  /**
   * Maximum results
   */
  maxResults?: number;

  /**
   * Enable pattern learning
   */
  enableLearning?: boolean;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: PatternMatcherOptions = {
  dimension: 384,
  similarityThreshold: 0.5,
  maxResults: 10,
  enableLearning: true,
};

/**
 * PatternMatcher
 *
 * Matches code against stored patterns for test generation.
 */
export class PatternMatcher {
  private options: Required<PatternMatcherOptions>;
  private patterns: Map<string, CodePattern> = new Map();
  private embeddings: Map<string, number[]> = new Map();

  constructor(options: PatternMatcherOptions = {}) {
    this.options = {
      dimension: options.dimension ?? DEFAULT_OPTIONS.dimension!,
      similarityThreshold: options.similarityThreshold ?? DEFAULT_OPTIONS.similarityThreshold!,
      maxResults: options.maxResults ?? DEFAULT_OPTIONS.maxResults!,
      enableLearning: options.enableLearning ?? DEFAULT_OPTIONS.enableLearning!,
    };
  }

  /**
   * Create a pattern from an extracted function
   */
  createPattern(
    func: ExtractedFunction,
    complexity: ComplexityResult,
    testability: TestabilityScore,
    metadata?: Partial<PatternMetadata>
  ): CodePattern {
    const id = this.generatePatternId(func);
    const characteristics = this.extractCharacteristics(func, complexity, testability);
    const signature = this.normalizeSignature(func);
    const embedding = this.generateEmbedding(func);

    const pattern: CodePattern = {
      id,
      type: this.determinePatternType(func),
      signature,
      sourceCode: func.sourceCode,
      characteristics,
      embedding,
      metadata: {
        language: 'typescript',
        tags: this.inferTags(func),
        ...metadata,
      },
      testPatterns: [],
      successRate: 0,
      usageCount: 0,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    return pattern;
  }

  /**
   * Store a pattern for matching
   */
  storePattern(pattern: CodePattern): void {
    this.patterns.set(pattern.id, pattern);
    this.embeddings.set(pattern.id, pattern.embedding);
  }

  /**
   * Find matching patterns for a function
   */
  findMatches(
    func: ExtractedFunction,
    complexity: ComplexityResult,
    testability: TestabilityScore
  ): PatternMatch[] {
    const queryEmbedding = this.generateEmbedding(func);
    const queryCharacteristics = this.extractCharacteristics(func, complexity, testability);
    const matches: PatternMatch[] = [];

    for (const [id, pattern] of this.patterns) {
      const embedding = this.embeddings.get(id);
      if (!embedding) continue;

      // Calculate vector similarity
      const vectorSimilarity = this.cosineSimilarity(queryEmbedding, embedding);

      // Calculate characteristic similarity
      const charSimilarity = this.characteristicSimilarity(
        queryCharacteristics,
        pattern.characteristics
      );

      // Combined similarity (weighted)
      const similarity = vectorSimilarity * 0.6 + charSimilarity * 0.4;

      if (similarity >= this.options.similarityThreshold) {
        const confidence = this.calculateConfidence(
          similarity,
          pattern.successRate,
          pattern.usageCount
        );

        matches.push({
          pattern,
          similarity,
          confidence,
          explanation: this.generateMatchExplanation(func, pattern, similarity),
          suggestedTests: this.generateTestSuggestions(func, pattern),
        });
      }
    }

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);

    // Update usage stats if learning is enabled
    if (this.options.enableLearning) {
      for (const match of matches.slice(0, 3)) {
        match.pattern.usageCount++;
        match.pattern.lastUsedAt = Date.now();
      }
    }

    return matches.slice(0, this.options.maxResults);
  }

  /**
   * Add a test pattern to a code pattern
   */
  addTestPattern(patternId: string, testPattern: TestPattern): void {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.testPatterns.push(testPattern);
    }
  }

  /**
   * Record test outcome for learning
   */
  recordOutcome(
    patternId: string,
    testPatternId: string,
    success: boolean
  ): void {
    if (!this.options.enableLearning) return;

    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    const testPattern = pattern.testPatterns.find((t) => t.id === testPatternId);
    if (testPattern) {
      const total = testPattern.usageCount + 1;
      const successes = testPattern.successRate * testPattern.usageCount + (success ? 1 : 0);
      testPattern.successRate = successes / total;
      testPattern.usageCount = total;
    }

    // Update overall pattern success rate
    pattern.successRate = this.calculateAverageSuccessRate(pattern.testPatterns);
  }

  /**
   * Generate embedding for a function
   */
  generateEmbedding(func: ExtractedFunction): number[] {
    // Create feature vector from function characteristics
    const features: number[] = [];

    // Structural features
    features.push(this.normalizeFeature(func.parameters.length, 0, 10));
    features.push(func.isAsync ? 1 : 0);
    features.push(func.isExported ? 1 : 0);
    features.push(func.isGenerator ? 1 : 0);

    // Kind encoding (one-hot)
    const kinds = ['function', 'arrow-function', 'method', 'constructor', 'getter', 'setter'];
    for (const kind of kinds) {
      features.push(func.kind === kind ? 1 : 0);
    }

    // Token-based embedding
    const tokens = this.tokenize(func.sourceCode);
    const tokenEmbedding = this.createTokenEmbedding(tokens, this.options.dimension - features.length);
    features.push(...tokenEmbedding);

    // Normalize to unit vector
    return this.normalizeVector(features);
  }

  /**
   * Export patterns for persistence
   */
  exportPatterns(): CodePattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Import patterns from persistence
   */
  importPatterns(patterns: CodePattern[]): void {
    for (const pattern of patterns) {
      this.patterns.set(pattern.id, pattern);
      this.embeddings.set(pattern.id, pattern.embedding);
    }
  }

  /**
   * Get pattern by ID
   */
  getPattern(id: string): CodePattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.patterns.clear();
    this.embeddings.clear();
  }

  /**
   * Get pattern count
   */
  get size(): number {
    return this.patterns.size;
  }

  // --- Private methods ---

  /**
   * Generate unique pattern ID
   */
  private generatePatternId(func: ExtractedFunction): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const nameHash = this.hashString(func.name);
    return `pat-${nameHash}-${timestamp}-${random}`;
  }

  /**
   * Determine pattern type from function
   */
  private determinePatternType(func: ExtractedFunction): PatternType {
    const name = func.name.toLowerCase();
    const code = func.sourceCode.toLowerCase();

    if (func.kind === 'constructor') return 'constructor';
    if (name.startsWith('get') || func.kind === 'getter') return 'accessor';
    if (name.startsWith('set') || func.kind === 'setter') return 'accessor';
    if (name.startsWith('create') || name.startsWith('make') || name.startsWith('build')) {
      return 'factory';
    }
    if (name.startsWith('handle') || name.startsWith('on') || name.includes('handler')) {
      return 'handler';
    }
    if (name.startsWith('validate') || name.startsWith('is') || name.startsWith('check')) {
      return 'validator';
    }
    if (name.startsWith('transform') || name.startsWith('convert') || name.startsWith('map')) {
      return 'transformer';
    }
    if (code.includes('callback') || func.parameters.some((p) => p.type?.includes('=>'))) {
      return 'callback';
    }
    if (func.isAsync) return 'async-function';
    if (func.kind === 'method') return 'method';

    return 'function';
  }

  /**
   * Extract characteristics from function
   */
  private extractCharacteristics(
    func: ExtractedFunction,
    complexity: ComplexityResult,
    testability: TestabilityScore
  ): PatternCharacteristics {
    const controlFlow = this.detectControlFlowPatterns(func);
    const hasSideEffects = this.detectSideEffects(func.sourceCode);

    return {
      paramCount: func.parameters.length,
      hasReturn: !!func.returnType && func.returnType !== 'void',
      isAsync: func.isAsync,
      complexity: complexity.cyclomaticComplexity,
      testability: testability.score,
      hasSideEffects,
      dependencyCount: func.dependencies.length,
      paramTypes: func.parameters.map((p) => this.normalizeType(p.type)),
      returnType: this.normalizeType(func.returnType),
      controlFlow,
    };
  }

  /**
   * Detect control flow patterns
   */
  private detectControlFlowPatterns(func: ExtractedFunction): ControlFlowPattern[] {
    const patterns: ControlFlowPattern[] = [];
    const code = func.sourceCode;

    if (/if\s*\(/.test(code)) patterns.push('conditional');
    if (/for\s*\(|while\s*\(|do\s*\{/.test(code)) patterns.push('loop');
    if (/try\s*\{/.test(code)) patterns.push('try-catch');
    if (/return\s+[^;]+;.*return/s.test(code)) patterns.push('early-return');
    if (/^\s*(if\s*\([^)]+\)\s*return|if\s*\([^)]+\)\s*throw)/m.test(code)) {
      patterns.push('guard-clause');
    }
    if (/switch\s*\(/.test(code)) patterns.push('switch');

    // Check for recursion
    const funcName = func.name;
    if (new RegExp(`\\b${funcName}\\s*\\(`).test(code)) {
      patterns.push('recursive');
    }

    if (patterns.length === 0) patterns.push('sequential');

    return patterns;
  }

  /**
   * Detect if code has side effects
   */
  private detectSideEffects(code: string): boolean {
    const sideEffectPatterns = [
      /console\./,
      /document\./,
      /window\./,
      /localStorage/,
      /sessionStorage/,
      /fetch\(/,
      /\.emit\(/,
      /\.dispatch\(/,
      /fs\./,
      /\.write/,
      /\.save/,
      /\.delete/,
      /\.remove/,
      /\.update/,
      /\.insert/,
    ];

    return sideEffectPatterns.some((p) => p.test(code));
  }

  /**
   * Normalize function signature
   */
  private normalizeSignature(func: ExtractedFunction): string {
    const params = func.parameters.map((p) => this.normalizeType(p.type)).join(', ');
    const returnType = this.normalizeType(func.returnType);
    const asyncPrefix = func.isAsync ? 'async ' : '';
    return `${asyncPrefix}(${params}) => ${returnType}`;
  }

  /**
   * Normalize type string
   */
  private normalizeType(type: string | undefined): string {
    if (!type) return 'any';

    // Simplify complex types
    return type
      .replace(/\s+/g, ' ')
      .replace(/Array<([^>]+)>/g, '$1[]')
      .replace(/Promise<([^>]+)>/g, 'Promise')
      .replace(/\b[A-Z][a-zA-Z]+\b/g, 'T') // Replace specific types with T
      .trim();
  }

  /**
   * Infer tags from function
   */
  private inferTags(func: ExtractedFunction): string[] {
    const tags: string[] = [];
    const name = func.name.toLowerCase();
    const code = func.sourceCode.toLowerCase();

    // Common patterns
    if (name.startsWith('test') || name.startsWith('it')) tags.push('test');
    if (name.includes('mock')) tags.push('mock');
    if (name.includes('api') || code.includes('fetch')) tags.push('api');
    if (code.includes('database') || code.includes('query')) tags.push('database');
    if (code.includes('react') || code.includes('usestate')) tags.push('react');
    if (code.includes('express') || code.includes('req.')) tags.push('express');
    if (func.isAsync) tags.push('async');
    if (func.kind === 'method') tags.push('method');

    return tags;
  }

  /**
   * Calculate cosine similarity between vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      // Pad or truncate to match
      const maxLen = Math.max(a.length, b.length);
      a = this.padVector(a, maxLen);
      b = this.padVector(b, maxLen);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Calculate characteristic similarity
   */
  private characteristicSimilarity(
    a: PatternCharacteristics,
    b: PatternCharacteristics
  ): number {
    let score = 0;
    let maxScore = 0;

    // Parameter count similarity
    const paramDiff = Math.abs(a.paramCount - b.paramCount);
    score += Math.max(0, 1 - paramDiff * 0.2);
    maxScore += 1;

    // Boolean matches
    if (a.hasReturn === b.hasReturn) score += 1;
    maxScore += 1;

    if (a.isAsync === b.isAsync) score += 1;
    maxScore += 1;

    if (a.hasSideEffects === b.hasSideEffects) score += 1;
    maxScore += 1;

    // Complexity similarity
    const complexityDiff = Math.abs(a.complexity - b.complexity);
    score += Math.max(0, 1 - complexityDiff * 0.1);
    maxScore += 1;

    // Testability similarity
    const testabilityDiff = Math.abs(a.testability - b.testability);
    score += Math.max(0, 1 - testabilityDiff * 0.02);
    maxScore += 1;

    // Control flow pattern overlap
    const cfOverlap = this.arrayOverlap(a.controlFlow, b.controlFlow);
    score += cfOverlap;
    maxScore += 1;

    return score / maxScore;
  }

  /**
   * Calculate confidence from similarity and historical data
   */
  private calculateConfidence(
    similarity: number,
    successRate: number,
    usageCount: number
  ): number {
    // Base confidence from similarity
    let confidence = similarity;

    // Adjust for success rate (if we have data)
    if (usageCount > 0) {
      const successWeight = Math.min(usageCount / 10, 0.3); // Max 30% weight
      confidence = confidence * (1 - successWeight) + successRate * successWeight;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Generate match explanation
   */
  private generateMatchExplanation(
    func: ExtractedFunction,
    pattern: CodePattern,
    similarity: number
  ): string {
    const parts: string[] = [];

    parts.push(`${Math.round(similarity * 100)}% similar to pattern "${pattern.type}"`);

    const matchingFeatures: string[] = [];
    if (func.isAsync === pattern.characteristics.isAsync) {
      matchingFeatures.push(func.isAsync ? 'async function' : 'sync function');
    }
    if (func.parameters.length === pattern.characteristics.paramCount) {
      matchingFeatures.push(`${func.parameters.length} parameters`);
    }

    if (matchingFeatures.length > 0) {
      parts.push(`Matching features: ${matchingFeatures.join(', ')}`);
    }

    if (pattern.usageCount > 0) {
      parts.push(`Used ${pattern.usageCount} times with ${Math.round(pattern.successRate * 100)}% success`);
    }

    return parts.join('. ');
  }

  /**
   * Generate test suggestions from pattern
   */
  private generateTestSuggestions(
    func: ExtractedFunction,
    pattern: CodePattern
  ): TestSuggestion[] {
    const suggestions: TestSuggestion[] = [];

    // Use existing test patterns if available
    for (const testPattern of pattern.testPatterns) {
      const code = this.adaptTestTemplate(testPattern.template, func);
      suggestions.push({
        title: `${testPattern.type} test: ${func.name}`,
        type: testPattern.type,
        code,
        confidence: testPattern.successRate,
        patternId: pattern.id,
        explanation: `Based on ${testPattern.usageCount} previous uses`,
      });
    }

    // Generate basic suggestions if no patterns
    if (suggestions.length === 0) {
      suggestions.push(...this.generateBasicTestSuggestions(func, pattern));
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return suggestions.slice(0, 3);
  }

  /**
   * Generate basic test suggestions
   */
  private generateBasicTestSuggestions(
    func: ExtractedFunction,
    pattern: CodePattern
  ): TestSuggestion[] {
    const suggestions: TestSuggestion[] = [];
    const isAsync = func.isAsync;
    const funcName = func.name;
    const params = func.parameters.map((p) => this.generateMockValue(p.type)).join(', ');

    // Happy path test
    suggestions.push({
      title: `Should ${this.describeFunction(func)} correctly`,
      type: 'unit',
      code: this.generateHappyPathTest(func),
      confidence: 0.7,
      patternId: pattern.id,
      explanation: 'Basic happy path test',
    });

    // Edge case test
    if (pattern.characteristics.paramCount > 0) {
      suggestions.push({
        title: `Should handle edge cases for ${funcName}`,
        type: 'unit',
        code: this.generateEdgeCaseTest(func),
        confidence: 0.6,
        patternId: pattern.id,
        explanation: 'Edge case handling test',
      });
    }

    // Error test
    suggestions.push({
      title: `Should handle errors in ${funcName}`,
      type: 'unit',
      code: this.generateErrorTest(func),
      confidence: 0.5,
      patternId: pattern.id,
      explanation: 'Error handling test',
    });

    return suggestions;
  }

  /**
   * Generate happy path test
   */
  private generateHappyPathTest(func: ExtractedFunction): string {
    const isAsync = func.isAsync;
    const funcName = func.name;
    const params = func.parameters.map((p) => this.generateMockValue(p.type)).join(', ');

    return `describe('${funcName}', () => {
  it('should ${this.describeFunction(func)} correctly', ${isAsync ? 'async ' : ''}() => {
    // Arrange
    ${func.parameters.map((p) => `const ${p.name} = ${this.generateMockValue(p.type)};`).join('\n    ')}

    // Act
    const result = ${isAsync ? 'await ' : ''}${funcName}(${func.parameters.map((p) => p.name).join(', ')});

    // Assert
    expect(result).toBeDefined();
    ${func.returnType && func.returnType !== 'void' ? '// @template: Add specific assertions based on expected return value' : ''}
  });
});`;
  }

  /**
   * Generate edge case test
   */
  private generateEdgeCaseTest(func: ExtractedFunction): string {
    const isAsync = func.isAsync;
    const funcName = func.name;

    return `describe('${funcName} edge cases', () => {
  it('should handle empty input', ${isAsync ? 'async ' : ''}() => {
    ${this.generateEmptyInputTest(func)}
  });

  it('should handle boundary values', ${isAsync ? 'async ' : ''}() => {
    ${this.generateBoundaryTest(func)}
  });
});`;
  }

  /**
   * Generate error test
   */
  private generateErrorTest(func: ExtractedFunction): string {
    const isAsync = func.isAsync;
    const funcName = func.name;

    if (isAsync) {
      return `describe('${funcName} error handling', () => {
  it('should reject on invalid input', async () => {
    await expect(${funcName}(null)).rejects.toThrow();
  });
});`;
    }

    return `describe('${funcName} error handling', () => {
  it('should throw on invalid input', () => {
    expect(() => ${funcName}(null)).toThrow();
  });
});`;
  }

  /**
   * Generate empty input test
   */
  private generateEmptyInputTest(func: ExtractedFunction): string {
    const isAsync = func.isAsync;
    const funcName = func.name;
    const emptyParams = func.parameters.map((p) => this.generateEmptyValue(p.type)).join(', ');

    return `const result = ${isAsync ? 'await ' : ''}${funcName}(${emptyParams});
    expect(result).toBeDefined();`;
  }

  /**
   * Generate boundary test
   */
  private generateBoundaryTest(func: ExtractedFunction): string {
    const isAsync = func.isAsync;
    const funcName = func.name;
    const boundaryParams = func.parameters.map((p) => this.generateBoundaryValue(p.type)).join(', ');

    return `const result = ${isAsync ? 'await ' : ''}${funcName}(${boundaryParams});
    expect(result).toBeDefined();`;
  }

  /**
   * Describe what a function does (for test names)
   */
  private describeFunction(func: ExtractedFunction): string {
    const name = func.name;

    // Common prefixes
    if (name.startsWith('get')) return `retrieve ${name.substring(3).toLowerCase()}`;
    if (name.startsWith('set')) return `set ${name.substring(3).toLowerCase()}`;
    if (name.startsWith('create')) return `create ${name.substring(6).toLowerCase()}`;
    if (name.startsWith('delete')) return `delete ${name.substring(6).toLowerCase()}`;
    if (name.startsWith('update')) return `update ${name.substring(6).toLowerCase()}`;
    if (name.startsWith('validate')) return `validate ${name.substring(8).toLowerCase()}`;
    if (name.startsWith('is')) return `check if ${name.substring(2).toLowerCase()}`;
    if (name.startsWith('has')) return `check if has ${name.substring(3).toLowerCase()}`;
    if (name.startsWith('handle')) return `handle ${name.substring(6).toLowerCase()}`;

    return `execute ${name.toLowerCase()}`;
  }

  /**
   * Adapt test template to specific function
   */
  private adaptTestTemplate(template: string, func: ExtractedFunction): string {
    let code = template;

    // Replace placeholders
    code = code.replace(/\{functionName\}/g, func.name);
    code = code.replace(/\{className\}/g, func.parentClass || 'TestClass');
    code = code.replace(/\{parameters\}/g, func.parameters.map((p) => p.name).join(', '));
    code = code.replace(/\{mockParams\}/g, func.parameters.map((p) => this.generateMockValue(p.type)).join(', '));
    code = code.replace(/\{async\}/g, func.isAsync ? 'async ' : '');
    code = code.replace(/\{await\}/g, func.isAsync ? 'await ' : '');

    return code;
  }

  /**
   * Generate mock value for type
   */
  private generateMockValue(type: string | undefined): string {
    if (!type) return '{}';

    const normalized = type.toLowerCase();

    if (normalized.includes('string')) return "'test-value'";
    if (normalized.includes('number')) return '42';
    if (normalized.includes('boolean')) return 'true';
    if (normalized.includes('[]') || normalized.includes('array')) return '[]';
    if (normalized.includes('date')) return 'new Date()';
    if (normalized.includes('void') || normalized.includes('undefined')) return 'undefined';
    if (normalized.includes('null')) return 'null';
    if (normalized.includes('=>') || normalized.includes('function')) return 'jest.fn()';

    return '{}';
  }

  /**
   * Generate empty value for type
   */
  private generateEmptyValue(type: string | undefined): string {
    if (!type) return 'undefined';

    const normalized = type.toLowerCase();

    if (normalized.includes('string')) return "''";
    if (normalized.includes('number')) return '0';
    if (normalized.includes('boolean')) return 'false';
    if (normalized.includes('[]') || normalized.includes('array')) return '[]';
    if (normalized.includes('object')) return '{}';

    return 'undefined';
  }

  /**
   * Generate boundary value for type
   */
  private generateBoundaryValue(type: string | undefined): string {
    if (!type) return 'null';

    const normalized = type.toLowerCase();

    if (normalized.includes('string')) return 'String.fromCharCode(0)';
    if (normalized.includes('number')) return 'Number.MAX_SAFE_INTEGER';
    if (normalized.includes('[]') || normalized.includes('array')) {
      return 'new Array(1000).fill(0)';
    }

    return 'null';
  }

  /**
   * Tokenize source code
   */
  private tokenize(code: string): string[] {
    return code
      .replace(/[^\w\s]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  /**
   * Create token-based embedding
   */
  private createTokenEmbedding(tokens: string[], dimension: number): number[] {
    const embedding = new Array(dimension).fill(0);

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const hash = this.hashString(token);

      for (let j = 0; j < dimension; j++) {
        const contribution = Math.sin(hash * (j + 1)) / Math.sqrt(i + 1);
        embedding[j] += contribution;
      }
    }

    return embedding;
  }

  /**
   * Hash string to number
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Normalize vector to unit length
   */
  private normalizeVector(vec: number[]): number[] {
    const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return vec;
    return vec.map((v) => v / magnitude);
  }

  /**
   * Pad vector to target length
   */
  private padVector(vec: number[], length: number): number[] {
    if (vec.length >= length) return vec.slice(0, length);
    return [...vec, ...new Array(length - vec.length).fill(0)];
  }

  /**
   * Calculate array overlap (Jaccard similarity)
   */
  private arrayOverlap<T>(a: T[], b: T[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Calculate average success rate
   */
  private calculateAverageSuccessRate(testPatterns: TestPattern[]): number {
    if (testPatterns.length === 0) return 0;

    const totalWeight = testPatterns.reduce((sum, p) => sum + p.usageCount, 0);
    if (totalWeight === 0) return 0;

    const weightedSum = testPatterns.reduce(
      (sum, p) => sum + p.successRate * p.usageCount,
      0
    );

    return weightedSum / totalWeight;
  }

  /**
   * Normalize a feature value
   */
  private normalizeFeature(value: number, min: number, max: number): number {
    if (max === min) return 0;
    return (value - min) / (max - min);
  }
}
