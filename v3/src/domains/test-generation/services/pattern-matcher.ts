/**
 * Agentic QE v3 - Pattern Matching Service
 * Implements IPatternMatchingService for learning and applying test patterns
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend, VectorSearchResult } from '../../../kernel/interfaces';
import { Pattern, LearnPatternsRequest, LearnedPatterns } from '../interfaces';

/**
 * Interface for the pattern matching service
 */
export interface IPatternMatchingService {
  findMatchingPatterns(
    context: PatternSearchContext
  ): Promise<Result<PatternMatch[], Error>>;
  applyPattern(patternId: string, targetCode: string): Promise<Result<AppliedPattern, Error>>;
  recordPattern(pattern: PatternDefinition): Promise<Result<Pattern, Error>>;
  learnPatterns(request: LearnPatternsRequest): Promise<Result<LearnedPatterns, Error>>;
  getPattern(patternId: string): Promise<Pattern | undefined>;
  listPatterns(filter?: PatternFilter): Promise<Pattern[]>;
}

/**
 * Context for pattern search
 */
export interface PatternSearchContext {
  sourceCode?: string;
  fileType?: string;
  testType?: 'unit' | 'integration' | 'e2e' | 'property';
  framework?: string;
  tags?: string[];
  semanticQuery?: string;
}

/**
 * Pattern match result
 */
export interface PatternMatch {
  pattern: Pattern;
  score: number;
  matchReason: string;
  suggestedApplication: string;
}

/**
 * Applied pattern result
 */
export interface AppliedPattern {
  patternId: string;
  generatedCode: string;
  modifications: PatternModification[];
  confidence: number;
}

/**
 * Pattern modification record
 */
export interface PatternModification {
  location: string;
  original?: string;
  replacement: string;
  reason: string;
}

/**
 * Pattern definition for recording
 */
export interface PatternDefinition {
  name: string;
  structure: string;
  description?: string;
  tags?: string[];
  testType?: 'unit' | 'integration' | 'e2e' | 'property';
  framework?: string;
  examples?: PatternExample[];
}

/**
 * Pattern example
 */
export interface PatternExample {
  input: string;
  output: string;
  context?: string;
}

/**
 * Pattern filter
 */
export interface PatternFilter {
  testType?: 'unit' | 'integration' | 'e2e' | 'property';
  framework?: string;
  tags?: string[];
  minApplicability?: number;
  limit?: number;
}

/**
 * Configuration for the pattern matcher
 */
export interface PatternMatcherConfig {
  maxPatterns: number;
  minMatchScore: number;
  enableVectorSearch: boolean;
  embeddingDimension: number;
  patternNamespace: string;
}

const DEFAULT_CONFIG: PatternMatcherConfig = {
  maxPatterns: 100,
  minMatchScore: 0.5,
  enableVectorSearch: true,
  embeddingDimension: 384,
  patternNamespace: 'test-generation:patterns',
};

/**
 * Pattern Matching Service Implementation
 * Manages test patterns with learning and semantic search capabilities
 */
export class PatternMatcherService implements IPatternMatchingService {
  private readonly config: PatternMatcherConfig;
  private readonly patternCache: Map<string, Pattern> = new Map();

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<PatternMatcherConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Find patterns matching the given context
   */
  async findMatchingPatterns(
    context: PatternSearchContext
  ): Promise<Result<PatternMatch[], Error>> {
    try {
      const matches: PatternMatch[] = [];

      // Strategy 1: Semantic search if enabled and query provided
      if (this.config.enableVectorSearch && context.semanticQuery) {
        const semanticMatches = await this.semanticSearch(context.semanticQuery);
        matches.push(...semanticMatches);
      }

      // Strategy 2: Tag-based matching
      if (context.tags && context.tags.length > 0) {
        const tagMatches = await this.matchByTags(context.tags);
        this.mergeMatches(matches, tagMatches);
      }

      // Strategy 3: File type and framework matching
      if (context.fileType || context.framework || context.testType) {
        const metadataMatches = await this.matchByMetadata(context);
        this.mergeMatches(matches, metadataMatches);
      }

      // Strategy 4: Code structure analysis
      if (context.sourceCode) {
        const structureMatches = await this.matchByStructure(context.sourceCode);
        this.mergeMatches(matches, structureMatches);
      }

      // Filter by minimum score and sort by relevance
      const filteredMatches = matches
        .filter((m) => m.score >= this.config.minMatchScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, this.config.maxPatterns);

      return ok(filteredMatches);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Apply a pattern to generate code
   */
  async applyPattern(
    patternId: string,
    targetCode: string
  ): Promise<Result<AppliedPattern, Error>> {
    try {
      const pattern = await this.getPattern(patternId);
      if (!pattern) {
        return err(new Error(`Pattern not found: ${patternId}`));
      }

      // Analyze target code structure
      const codeAnalysis = this.analyzeCodeStructure(targetCode);

      // Apply pattern transformations
      const modifications: PatternModification[] = [];
      let generatedCode = pattern.structure;

      // Replace placeholders in pattern with actual code elements
      const placeholders = this.extractPlaceholders(pattern.structure);
      for (const placeholder of placeholders) {
        const replacement = this.resolvePlaceholder(placeholder, codeAnalysis);
        if (replacement) {
          generatedCode = generatedCode.replace(
            new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'),
            replacement
          );
          modifications.push({
            location: placeholder,
            original: `{{${placeholder}}}`,
            replacement,
            reason: `Resolved from code analysis`,
          });
        }
      }

      // Calculate confidence based on how well the pattern matched
      const confidence = this.calculateApplicationConfidence(
        pattern,
        codeAnalysis,
        modifications
      );

      // Update pattern usage statistics
      await this.recordPatternUsage(patternId);

      return ok({
        patternId,
        generatedCode,
        modifications,
        confidence,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Record a new pattern
   */
  async recordPattern(definition: PatternDefinition): Promise<Result<Pattern, Error>> {
    try {
      const pattern: Pattern = {
        id: uuidv4(),
        name: definition.name,
        structure: definition.structure,
        examples: definition.examples?.length ?? 0,
        applicability: 0.5, // Start with neutral applicability
      };

      // Store pattern in memory
      const patternKey = `${this.config.patternNamespace}:${pattern.id}`;
      await this.memory.set(patternKey, {
        ...pattern,
        description: definition.description,
        tags: definition.tags,
        testType: definition.testType,
        framework: definition.framework,
        examples: definition.examples,
        createdAt: new Date().toISOString(),
        usageCount: 0,
      });

      // Store vector embedding for semantic search if enabled
      if (this.config.enableVectorSearch) {
        const embedding = await this.generatePatternEmbedding(definition);
        await this.memory.storeVector(patternKey, embedding, {
          patternId: pattern.id,
          name: pattern.name,
          tags: definition.tags,
        });
      }

      // Add to local cache
      this.patternCache.set(pattern.id, pattern);

      return ok(pattern);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Learn patterns from existing test files
   */
  async learnPatterns(request: LearnPatternsRequest): Promise<Result<LearnedPatterns, Error>> {
    try {
      const { testFiles, depth } = request;
      const patterns: Pattern[] = [];

      for (const file of testFiles) {
        const filePatterns = await this.extractPatternsFromFile(file, depth);
        patterns.push(...filePatterns);
      }

      // Deduplicate similar patterns
      const uniquePatterns = this.deduplicatePatterns(patterns);

      // Store learned patterns
      for (const pattern of uniquePatterns) {
        await this.recordPattern({
          name: pattern.name,
          structure: pattern.structure,
          tags: ['learned', 'auto-extracted'],
        });
      }

      // Calculate overall confidence based on pattern consistency
      const confidence = this.calculateLearningConfidence(uniquePatterns);

      return ok({
        patterns: uniquePatterns,
        confidence,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get a pattern by ID
   */
  async getPattern(patternId: string): Promise<Pattern | undefined> {
    // Check cache first
    if (this.patternCache.has(patternId)) {
      return this.patternCache.get(patternId);
    }

    // Load from memory
    const patternKey = `${this.config.patternNamespace}:${patternId}`;
    const stored = await this.memory.get<Pattern & { usageCount: number }>(patternKey);

    if (stored) {
      const pattern: Pattern = {
        id: stored.id,
        name: stored.name,
        structure: stored.structure,
        examples: stored.examples,
        applicability: stored.applicability,
      };
      this.patternCache.set(patternId, pattern);
      return pattern;
    }

    return undefined;
  }

  /**
   * List patterns with optional filtering
   */
  async listPatterns(filter?: PatternFilter): Promise<Pattern[]> {
    const patterns: Pattern[] = [];
    const limit = filter?.limit ?? this.config.maxPatterns;

    // Search for patterns in memory
    const keys = await this.memory.search(`${this.config.patternNamespace}:*`, limit * 2);

    for (const key of keys) {
      const stored = await this.memory.get<Pattern & {
        testType?: string;
        framework?: string;
        tags?: string[];
      }>(key);

      if (stored) {
        // Apply filters
        if (filter?.testType && stored.testType !== filter.testType) continue;
        if (filter?.framework && stored.framework !== filter.framework) continue;
        if (filter?.minApplicability && stored.applicability < filter.minApplicability) continue;
        if (filter?.tags && filter.tags.length > 0) {
          const hasTag = filter.tags.some((t) => stored.tags?.includes(t));
          if (!hasTag) continue;
        }

        patterns.push({
          id: stored.id,
          name: stored.name,
          structure: stored.structure,
          examples: stored.examples,
          applicability: stored.applicability,
        });

        if (patterns.length >= limit) break;
      }
    }

    return patterns.sort((a, b) => b.applicability - a.applicability);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async semanticSearch(query: string): Promise<PatternMatch[]> {
    // Stub: Generate embedding for query and search
    const queryEmbedding = await this.generateQueryEmbedding(query);
    const results: VectorSearchResult[] = await this.memory.vectorSearch(
      queryEmbedding,
      10
    );

    const matches: PatternMatch[] = [];
    for (const result of results) {
      const pattern = await this.getPattern(
        (result.metadata as { patternId: string })?.patternId
      );
      if (pattern) {
        matches.push({
          pattern,
          score: result.score,
          matchReason: 'Semantic similarity to query',
          suggestedApplication: `Apply ${pattern.name} pattern to generate tests`,
        });
      }
    }

    return matches;
  }

  private async matchByTags(tags: string[]): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const patterns = await this.listPatterns({ tags });

    for (const pattern of patterns) {
      matches.push({
        pattern,
        score: 0.7, // Tag matching gives moderate score
        matchReason: `Pattern tags match: ${tags.join(', ')}`,
        suggestedApplication: `Apply ${pattern.name} pattern based on tag match`,
      });
    }

    return matches;
  }

  private async matchByMetadata(context: PatternSearchContext): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const patterns = await this.listPatterns({
      testType: context.testType,
      framework: context.framework,
    });

    for (const pattern of patterns) {
      matches.push({
        pattern,
        score: 0.6, // Metadata matching gives moderate score
        matchReason: `Pattern matches ${context.testType || ''} ${context.framework || ''}`.trim(),
        suggestedApplication: `Apply ${pattern.name} pattern for ${context.testType || 'test'} generation`,
      });
    }

    return matches;
  }

  private async matchByStructure(sourceCode: string): Promise<PatternMatch[]> {
    // Stub: Analyze code structure and find matching patterns
    const analysis = this.analyzeCodeStructure(sourceCode);
    const matches: PatternMatch[] = [];

    // Look for patterns that match detected constructs
    const allPatterns = await this.listPatterns();
    for (const pattern of allPatterns) {
      const structureScore = this.calculateStructureMatch(pattern, analysis);
      if (structureScore > 0) {
        matches.push({
          pattern,
          score: structureScore,
          matchReason: `Pattern structure matches code constructs`,
          suggestedApplication: `Apply ${pattern.name} based on code structure analysis`,
        });
      }
    }

    return matches;
  }

  private mergeMatches(target: PatternMatch[], source: PatternMatch[]): void {
    for (const match of source) {
      const existing = target.find((m) => m.pattern.id === match.pattern.id);
      if (existing) {
        // Combine scores
        existing.score = Math.min(1, existing.score + match.score * 0.5);
        existing.matchReason += `, ${match.matchReason}`;
      } else {
        target.push(match);
      }
    }
  }

  private analyzeCodeStructure(code: string): CodeAnalysis {
    // Stub: In production, use AST parsing
    return {
      hasClasses: /class\s+\w+/.test(code),
      hasFunctions: /function\s+\w+|=>\s*{/.test(code),
      hasAsyncCode: /async\s+|await\s+|Promise/.test(code),
      hasExports: /export\s+(default\s+)?/.test(code),
      imports: this.extractImports(code),
      identifiers: this.extractIdentifiers(code),
      complexity: this.estimateComplexity(code),
    };
  }

  private extractImports(code: string): string[] {
    const importRegex = /import\s+(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      imports.push(match[1]);
    }
    return imports;
  }

  private extractIdentifiers(code: string): string[] {
    const identifierRegex = /(?:class|function|const|let|var)\s+(\w+)/g;
    const identifiers: string[] = [];
    let match;
    while ((match = identifierRegex.exec(code)) !== null) {
      identifiers.push(match[1]);
    }
    return identifiers;
  }

  private estimateComplexity(code: string): number {
    // Simple complexity estimation based on control flow statements
    const controlFlowPatterns = [
      /if\s*\(/g,
      /else\s*{/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /switch\s*\(/g,
      /\?\s*:/g, // ternary
    ];

    let complexity = 1;
    for (const pattern of controlFlowPatterns) {
      const matches = code.match(pattern);
      complexity += matches ? matches.length : 0;
    }

    return complexity;
  }

  private extractPlaceholders(structure: string): string[] {
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    const placeholders: string[] = [];
    let match;
    while ((match = placeholderRegex.exec(structure)) !== null) {
      placeholders.push(match[1]);
    }
    return placeholders;
  }

  private resolvePlaceholder(placeholder: string, analysis: CodeAnalysis): string | null {
    // Stub: Resolve placeholders based on code analysis
    switch (placeholder.toLowerCase()) {
      case 'classname':
      case 'modulename':
        return analysis.identifiers[0] || 'Module';
      case 'functionname':
        return analysis.identifiers.find((id) => /^[a-z]/.test(id)) || 'func';
      case 'imports':
        return analysis.imports.map((i) => `import '${i}'`).join('\n');
      default:
        return null;
    }
  }

  private calculateApplicationConfidence(
    pattern: Pattern,
    analysis: CodeAnalysis,
    modifications: PatternModification[]
  ): number {
    // Base confidence from pattern applicability
    let confidence = pattern.applicability;

    // Adjust based on how many placeholders were resolved
    const placeholders = this.extractPlaceholders(pattern.structure);
    const resolvedRatio = modifications.length / Math.max(placeholders.length, 1);
    confidence = confidence * 0.5 + resolvedRatio * 0.5;

    // Adjust based on code complexity match
    if (analysis.complexity > 10) {
      confidence *= 0.9; // Slightly lower confidence for complex code
    }

    return Math.min(1, Math.max(0, confidence));
  }

  private calculateStructureMatch(pattern: Pattern, analysis: CodeAnalysis): number {
    // Stub: Calculate how well pattern structure matches code
    let score = 0;

    // Check for structural similarities
    if (analysis.hasClasses && pattern.structure.includes('class')) score += 0.3;
    if (analysis.hasFunctions && pattern.structure.includes('function')) score += 0.3;
    if (analysis.hasAsyncCode && pattern.structure.includes('async')) score += 0.2;
    if (analysis.hasExports && pattern.structure.includes('export')) score += 0.2;

    return Math.min(1, score);
  }

  private async recordPatternUsage(patternId: string): Promise<void> {
    const patternKey = `${this.config.patternNamespace}:${patternId}`;
    const stored = await this.memory.get<Pattern & { usageCount: number }>(patternKey);

    if (stored) {
      const usageCount = (stored.usageCount || 0) + 1;
      // Increase applicability score based on usage
      const newApplicability = Math.min(1, stored.applicability + 0.01);

      await this.memory.set(patternKey, {
        ...stored,
        usageCount,
        applicability: newApplicability,
        lastUsedAt: new Date().toISOString(),
      });

      // Update cache
      if (this.patternCache.has(patternId)) {
        const cached = this.patternCache.get(patternId)!;
        cached.applicability = newApplicability;
      }
    }
  }

  private async extractPatternsFromFile(
    file: string,
    _depth: 'shallow' | 'deep'
  ): Promise<Pattern[]> {
    // Stub: In production, parse the file and extract test patterns
    // This would identify:
    // - describe/it/test block structures
    // - setup/teardown patterns
    // - assertion patterns
    // - mocking patterns

    return [
      {
        id: uuidv4(),
        name: `Extracted pattern from ${file}`,
        structure: `describe('{{moduleName}}', () => {\n  it('should {{behavior}}', () => {\n    // Test implementation\n  });\n});`,
        examples: 1,
        applicability: 0.5,
      },
    ];
  }

  private deduplicatePatterns(patterns: Pattern[]): Pattern[] {
    const seen = new Map<string, Pattern>();

    for (const pattern of patterns) {
      // Use structure hash as key for deduplication
      const structureKey = this.hashStructure(pattern.structure);
      if (!seen.has(structureKey)) {
        seen.set(structureKey, pattern);
      } else {
        // Merge examples count
        const existing = seen.get(structureKey)!;
        existing.examples += pattern.examples;
      }
    }

    return Array.from(seen.values());
  }

  private hashStructure(structure: string): string {
    // Simple hash for structure comparison
    const normalized = structure.replace(/\s+/g, ' ').trim();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private calculateLearningConfidence(patterns: Pattern[]): number {
    if (patterns.length === 0) return 0;

    // Confidence based on:
    // 1. Number of patterns found
    // 2. Average examples per pattern
    // 3. Structural diversity

    const avgExamples =
      patterns.reduce((sum, p) => sum + p.examples, 0) / patterns.length;
    const countFactor = Math.min(1, patterns.length / 10);
    const examplesFactor = Math.min(1, avgExamples / 5);

    return countFactor * 0.5 + examplesFactor * 0.5;
  }

  private async generatePatternEmbedding(definition: PatternDefinition): Promise<number[]> {
    // Stub: In production, use an embedding model
    // For now, return a simple hash-based "embedding"
    const text = `${definition.name} ${definition.structure} ${definition.tags?.join(' ')}`;
    return this.simpleEmbedding(text);
  }

  private async generateQueryEmbedding(query: string): Promise<number[]> {
    // Stub: In production, use the same embedding model as patterns
    return this.simpleEmbedding(query);
  }

  private simpleEmbedding(text: string): number[] {
    // Stub: Generate a simple pseudo-embedding for testing
    // In production, use an actual embedding model (e.g., sentence-transformers)
    const embedding: number[] = new Array(this.config.embeddingDimension).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length && j < embedding.length; j++) {
        embedding[(i + j) % embedding.length] += word.charCodeAt(j) / 1000;
      }
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
    return embedding.map((v) => v / magnitude);
  }
}

/**
 * Code analysis result
 */
interface CodeAnalysis {
  hasClasses: boolean;
  hasFunctions: boolean;
  hasAsyncCode: boolean;
  hasExports: boolean;
  imports: string[];
  identifiers: string[];
  complexity: number;
}
