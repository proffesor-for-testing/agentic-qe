/**
 * Agentic QE v3 - Pattern Matching Service
 * Implements IPatternMatchingService for learning and applying test patterns
 *
 * Uses TypeScript Compiler API for real AST parsing and pattern extraction
 * Uses NomicEmbedder for semantic embeddings when available
 */

import { v4 as uuidv4 } from 'uuid';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend, VectorSearchResult } from '../../../kernel/interfaces';
import { Pattern, LearnPatternsRequest, LearnedPatterns } from '../interfaces';
import { NomicEmbedder, IEmbeddingProvider, EMBEDDING_CONFIG } from '../../../shared/embeddings';
import { toError } from '../../../shared/error-utils.js';

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
  /** Optional embedder instance (defaults to NomicEmbedder with fallback) */
  embedder?: IEmbeddingProvider;
}

const DEFAULT_CONFIG: PatternMatcherConfig = {
  maxPatterns: 100,
  minMatchScore: 0.5,
  enableVectorSearch: true,
  embeddingDimension: EMBEDDING_CONFIG.DIMENSIONS,
  patternNamespace: 'test-generation:patterns',
};

/**
 * Pattern Matching Service Implementation
 * Manages test patterns with learning and semantic search capabilities
 */
export class PatternMatcherService implements IPatternMatchingService {
  private readonly config: PatternMatcherConfig;
  private readonly patternCache: Map<string, Pattern> = new Map();
  private readonly tsParser: TypeScriptASTParser;
  private readonly embedder: IEmbeddingProvider;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<PatternMatcherConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tsParser = new TypeScriptASTParser();
    // Use provided embedder or create NomicEmbedder with fallback enabled
    this.embedder = config.embedder ?? new NomicEmbedder({ enableFallback: true });
  }

  /**
   * Match testable patterns from a source file
   * Uses TypeScript AST to identify functions, classes, and methods that need tests
   */
  async matchTestablePatterns(filePath: string): Promise<Result<TestablePattern[], Error>> {
    try {
      // Read file content
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        return err(new Error(`Cannot read file: ${filePath}`));
      }

      return this.matchTestablePatternsFromCode(content, filePath);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Match testable patterns from source code string
   */
  async matchTestablePatternsFromCode(
    sourceCode: string,
    fileName: string = 'module.ts'
  ): Promise<Result<TestablePattern[], Error>> {
    try {
      const patterns: TestablePattern[] = [];
      const sourceFile = this.tsParser.parseSource(sourceCode, fileName);

      // Extract functions and generate test suggestions
      const functions = this.tsParser.extractFunctions(sourceFile);
      for (const fn of functions) {
        patterns.push(this.createFunctionPattern(fn));
      }

      // Extract classes and their methods
      const classes = this.tsParser.extractClasses(sourceFile);
      for (const cls of classes) {
        // Add class-level pattern
        patterns.push(this.createClassPattern(cls));

        // Add method-level patterns for each public method
        for (const method of cls.methods) {
          patterns.push(this.createMethodPattern(cls.name, method));
        }
      }

      return ok(patterns);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Create a testable pattern for a function
   */
  private createFunctionPattern(fn: FunctionInfo): TestablePattern {
    const suggestedTests = this.suggestTestsForFunction(fn);

    return {
      type: 'function',
      name: fn.name,
      complexity: fn.complexity,
      lines: { start: fn.startLine, end: fn.endLine },
      branches: this.estimateBranches(fn.complexity),
      suggestedTests,
      context: {
        parameters: fn.parameters,
        returnType: fn.returnType,
        isAsync: fn.isAsync,
      },
    };
  }

  /**
   * Create a testable pattern for a class
   */
  private createClassPattern(cls: ClassInfo): TestablePattern {
    const totalComplexity = cls.methods.reduce((sum, m) => sum + m.complexity, 0);
    const suggestedTests = this.suggestTestsForClass(cls);

    return {
      type: 'class',
      name: cls.name,
      complexity: totalComplexity,
      lines: { start: cls.startLine, end: cls.endLine },
      branches: this.estimateBranches(totalComplexity),
      suggestedTests,
      context: {
        dependencies: cls.properties
          .filter((p) => !p.isPrivate)
          .map((p) => p.name),
      },
    };
  }

  /**
   * Create a testable pattern for a class method
   */
  private createMethodPattern(className: string, method: FunctionInfo): TestablePattern {
    const suggestedTests = this.suggestTestsForMethod(className, method);

    return {
      type: 'method',
      name: `${className}.${method.name}`,
      complexity: method.complexity,
      lines: { start: method.startLine, end: method.endLine },
      branches: this.estimateBranches(method.complexity),
      suggestedTests,
      context: {
        parameters: method.parameters,
        returnType: method.returnType,
        isAsync: method.isAsync,
      },
    };
  }

  /**
   * Suggest tests for a function based on its signature and complexity
   */
  private suggestTestsForFunction(fn: FunctionInfo): SuggestedTest[] {
    const tests: SuggestedTest[] = [];

    // Happy path test
    tests.push({
      description: `handles valid input correctly`,
      type: 'happy-path',
      priority: 'high',
      testCode: this.generateHappyPathTest(fn.name, fn.parameters, fn.isAsync),
    });

    // Parameter validation tests
    for (const param of fn.parameters) {
      if (!param.optional) {
        tests.push({
          description: `handles missing ${param.name} parameter`,
          type: 'error-handling',
          priority: 'high',
        });
      }

      // Type-specific tests
      if (param.type?.includes('string')) {
        tests.push({
          description: `handles empty string for ${param.name}`,
          type: 'boundary',
          priority: 'medium',
        });
      }

      if (param.type?.includes('number')) {
        tests.push({
          description: `handles zero value for ${param.name}`,
          type: 'boundary',
          priority: 'medium',
        });
        tests.push({
          description: `handles negative value for ${param.name}`,
          type: 'edge-case',
          priority: 'medium',
        });
      }

      if (param.type?.includes('[]') || param.type?.includes('Array')) {
        tests.push({
          description: `handles empty array for ${param.name}`,
          type: 'boundary',
          priority: 'medium',
        });
      }
    }

    // Async-specific tests
    if (fn.isAsync) {
      tests.push({
        description: `handles async rejection`,
        type: 'error-handling',
        priority: 'high',
      });
    }

    // Complexity-based tests
    if (fn.complexity > 5) {
      tests.push({
        description: `handles complex branching logic`,
        type: 'edge-case',
        priority: 'medium',
      });
    }

    return tests;
  }

  /**
   * Suggest tests for a class
   */
  private suggestTestsForClass(cls: ClassInfo): SuggestedTest[] {
    const tests: SuggestedTest[] = [];

    // Constructor test
    if (cls.hasConstructor) {
      tests.push({
        description: `instantiates correctly`,
        type: 'happy-path',
        priority: 'high',
      });
    }

    // Public methods coverage
    const publicMethods = cls.methods.filter(
      (m) => !m.name.startsWith('_') && !m.name.startsWith('#')
    );
    if (publicMethods.length > 0) {
      tests.push({
        description: `all public methods are callable`,
        type: 'happy-path',
        priority: 'high',
      });
    }

    // State management test
    if (cls.properties.some((p) => !p.isReadonly)) {
      tests.push({
        description: `maintains correct state after operations`,
        type: 'edge-case',
        priority: 'medium',
      });
    }

    return tests;
  }

  /**
   * Suggest tests for a class method
   */
  private suggestTestsForMethod(_className: string, method: FunctionInfo): SuggestedTest[] {
    // Reuse function test suggestions with method-specific context
    const tests = this.suggestTestsForFunction(method);

    // Add method-specific tests
    tests.push({
      description: `correctly modifies instance state`,
      type: 'edge-case',
      priority: 'medium',
    });

    return tests;
  }

  /**
   * Generate a happy path test code snippet
   */
  private generateHappyPathTest(
    fnName: string,
    params: ParameterInfo[],
    isAsync: boolean
  ): string {
    const paramList = params.map((p) => this.generateMockValue(p)).join(', ');
    const call = `${fnName}(${paramList})`;
    const assertion = isAsync ? `await ${call}` : call;

    return `it('should handle valid input correctly', ${isAsync ? 'async ' : ''}() => {
  const result = ${assertion};
  expect(result).toBeDefined();
});`;
  }

  /**
   * Lookup table for type-based mock value generation.
   * Each entry is [typeSubstring, mockValue].
   * Order matters: first match wins.
   */
  private static readonly MOCK_VALUE_TABLE: ReadonlyArray<[string, string]> = [
    ['string', "'test-{{name}}'"],
    ['number', '42'],
    ['boolean', 'true'],
    ['[]', '[]'],
    ['array', '[]'],
    ['object', '{}'],
    ['{', '{}'],
    ['function', '() => {}'],
    ['promise', 'Promise.resolve()'],
    ['date', 'new Date()'],
    ['null', 'null'],
    ['undefined', 'undefined'],
  ];

  /**
   * Generate a mock value for a parameter based on its type
   */
  private generateMockValue(param: ParameterInfo): string {
    if (param.defaultValue) {
      return param.defaultValue;
    }

    const type = param.type?.toLowerCase() || 'unknown';

    for (const [typeKey, template] of PatternMatcherService.MOCK_VALUE_TABLE) {
      if (type.includes(typeKey)) {
        return template.replace('{{name}}', param.name);
      }
    }

    // Bug #295 fix: Return a safe inline value instead of an undefined variable reference
    return `{} /* TODO: provide ${param.name}: ${param.type || 'unknown'} */`;
  }

  /**
   * Estimate number of branches from cyclomatic complexity
   */
  private estimateBranches(complexity: number): number {
    // Branches = complexity - 1 (assuming one path is the default)
    return Math.max(0, complexity - 1);
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
      return err(toError(error));
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
      return err(toError(error));
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
      return err(toError(error));
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
      return err(toError(error));
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
    // Generate embedding for query and search using NomicEmbedder
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
    // Analyze code structure using TypeScript AST and find matching patterns
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
    // Use real TypeScript AST parsing for accurate analysis
    const parser = new TypeScriptASTParser();
    const sourceFile = parser.parseSource(code);
    const functions = parser.extractFunctions(sourceFile);
    const classes = parser.extractClasses(sourceFile);

    // Calculate total complexity from all functions and methods
    let totalComplexity = functions.reduce((sum, fn) => sum + fn.complexity, 0);
    for (const cls of classes) {
      totalComplexity += cls.methods.reduce((sum, m) => sum + m.complexity, 0);
    }

    return {
      hasClasses: classes.length > 0,
      hasFunctions: functions.length > 0,
      hasAsyncCode: functions.some((f) => f.isAsync) ||
        classes.some((c) => c.methods.some((m) => m.isAsync)),
      hasExports: functions.some((f) => f.isExported) ||
        classes.some((c) => c.isExported),
      imports: this.extractImports(code),
      identifiers: this.extractIdentifiers(code),
      complexity: totalComplexity || this.estimateComplexity(code),
      functions,
      classes,
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

  /**
   * Control flow patterns that each contribute +1 to cyclomatic complexity
   */
  private static readonly COMPLEXITY_PATTERNS: ReadonlyArray<RegExp> = [
    /if\s*\(/g,
    /else\s*{/g,
    /for\s*\(/g,
    /while\s*\(/g,
    /switch\s*\(/g,
    /\?\s*:/g, // ternary
  ];

  private estimateComplexity(code: string): number {
    return PatternMatcherService.COMPLEXITY_PATTERNS.reduce(
      (complexity, pattern) => complexity + (code.match(pattern)?.length ?? 0),
      1
    );
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
    // Resolve placeholders based on code analysis results
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
    // Calculate how well pattern structure matches code using AST analysis
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
    depth: 'shallow' | 'deep'
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    try {
      // Read the file content
      let content: string;
      try {
        content = fs.readFileSync(file, 'utf-8');
      } catch {
        // File doesn't exist or can't be read, return empty
        return patterns;
      }

      // Parse with TypeScript AST
      const parser = new TypeScriptASTParser();
      const sourceFile = parser.parseSource(content, path.basename(file));

      // Extract test patterns from describe/it/test blocks
      const testPatterns = this.extractTestBlockPatterns(sourceFile, content);
      patterns.push(...testPatterns);

      // Deep analysis extracts more detailed patterns
      if (depth === 'deep') {
        // Extract setup/teardown patterns
        const setupPatterns = this.extractSetupTeardownPatterns(sourceFile, content);
        patterns.push(...setupPatterns);

        // Extract assertion patterns
        const assertionPatterns = this.extractAssertionPatterns(content);
        patterns.push(...assertionPatterns);

        // Extract mocking patterns
        const mockPatterns = this.extractMockingPatterns(content);
        patterns.push(...mockPatterns);
      }
    } catch {
      // If parsing fails, return a basic pattern
      patterns.push({
        id: uuidv4(),
        name: `Basic pattern from ${path.basename(file)}`,
        structure: `describe('{{moduleName}}', () => {\n  it('should {{behavior}}', () => {\n    // Test implementation\n  });\n});`,
        examples: 1,
        applicability: 0.5,
      });
    }

    return patterns;
  }

  /**
   * Extract test block patterns (describe/it/test)
   */
  private extractTestBlockPatterns(
    _sourceFile: ts.SourceFile,
    content: string
  ): Pattern[] {
    const patterns: Pattern[] = [];

    // Find describe blocks with their nested structure
    const describeRegex = /describe\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(?:function\s*\(\s*\)|(?:\(\s*\))?\s*=>)\s*\{/g;
    let match;

    while ((match = describeRegex.exec(content)) !== null) {
      const startIndex = match.index;
      const blockContent = this.extractBlockContent(content, startIndex + match[0].length - 1);

      if (blockContent) {
        // Analyze the structure of tests within this describe block
        const itCount = (blockContent.match(/\bit\s*\(/g) || []).length;
        const testCount = (blockContent.match(/\btest\s*\(/g) || []).length;
        const hasBeforeEach = /beforeEach\s*\(/.test(blockContent);
        const hasAfterEach = /afterEach\s*\(/.test(blockContent);

        // Create a structural pattern
        let structure = `describe('{{moduleName}}', () => {\n`;
        if (hasBeforeEach) structure += `  beforeEach(() => {\n    // Setup\n  });\n\n`;
        if (hasAfterEach) structure += `  afterEach(() => {\n    // Teardown\n  });\n\n`;

        for (let i = 0; i < Math.max(itCount, testCount); i++) {
          structure += `  it('should {{behavior${i > 0 ? i + 1 : ''}}}', () => {\n    // Test implementation\n  });\n`;
        }
        structure += '});';

        patterns.push({
          id: uuidv4(),
          name: `Test block pattern: ${match[1]}`,
          structure,
          examples: 1,
          applicability: 0.6,
        });
      }
    }

    return patterns;
  }

  /**
   * Extract setup/teardown patterns (beforeEach, afterEach, etc.)
   */
  private extractSetupTeardownPatterns(
    _sourceFile: ts.SourceFile,
    content: string
  ): Pattern[] {
    const patterns: Pattern[] = [];

    // beforeEach pattern
    if (/beforeEach\s*\(/.test(content)) {
      const beforeEachMatch = content.match(/beforeEach\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{([^}]*)\}/);
      if (beforeEachMatch) {
        patterns.push({
          id: uuidv4(),
          name: 'beforeEach setup pattern',
          structure: `beforeEach(async () => {\n  {{setupCode}}\n});`,
          examples: 1,
          applicability: 0.7,
        });
      }
    }

    // afterEach pattern
    if (/afterEach\s*\(/.test(content)) {
      patterns.push({
        id: uuidv4(),
        name: 'afterEach teardown pattern',
        structure: `afterEach(async () => {\n  {{teardownCode}}\n});`,
        examples: 1,
        applicability: 0.7,
      });
    }

    // beforeAll pattern
    if (/beforeAll\s*\(/.test(content)) {
      patterns.push({
        id: uuidv4(),
        name: 'beforeAll setup pattern',
        structure: `beforeAll(async () => {\n  {{setupCode}}\n});`,
        examples: 1,
        applicability: 0.6,
      });
    }

    return patterns;
  }

  /**
   * Extract assertion patterns from test code
   */
  private extractAssertionPatterns(content: string): Pattern[] {
    const patterns: Pattern[] = [];
    const assertionTypes = new Set<string>();

    // Detect assertion styles
    if (/expect\([^)]+\)\.toBe\(/.test(content)) assertionTypes.add('toBe');
    if (/expect\([^)]+\)\.toEqual\(/.test(content)) assertionTypes.add('toEqual');
    if (/expect\([^)]+\)\.toThrow\(/.test(content)) assertionTypes.add('toThrow');
    if (/expect\([^)]+\)\.toHaveBeenCalled/.test(content)) assertionTypes.add('toHaveBeenCalled');
    if (/expect\([^)]+\)\.resolves/.test(content)) assertionTypes.add('resolves');
    if (/expect\([^)]+\)\.rejects/.test(content)) assertionTypes.add('rejects');

    if (assertionTypes.size > 0) {
      const assertionStructures = Array.from(assertionTypes).map((type) => {
        switch (type) {
          case 'toBe':
            return 'expect({{actual}}).toBe({{expected}})';
          case 'toEqual':
            return 'expect({{actual}}).toEqual({{expected}})';
          case 'toThrow':
            return 'expect(() => {{call}}).toThrow({{error}})';
          case 'toHaveBeenCalled':
            return 'expect({{mock}}).toHaveBeenCalledWith({{args}})';
          case 'resolves':
            return 'await expect({{promise}}).resolves.toEqual({{expected}})';
          case 'rejects':
            return 'await expect({{promise}}).rejects.toThrow({{error}})';
          default:
            return `expect({{actual}}).${type}({{expected}})`;
        }
      });

      patterns.push({
        id: uuidv4(),
        name: 'Assertion patterns',
        structure: assertionStructures.join('\n'),
        examples: assertionTypes.size,
        applicability: 0.8,
      });
    }

    return patterns;
  }

  /**
   * Extract mocking patterns from test code
   */
  private extractMockingPatterns(content: string): Pattern[] {
    const patterns: Pattern[] = [];

    // jest.mock pattern
    if (/jest\.mock\(/.test(content)) {
      patterns.push({
        id: uuidv4(),
        name: 'Jest module mock pattern',
        structure: `jest.mock('{{modulePath}}', () => ({\n  {{mockImplementation}}\n}));`,
        examples: 1,
        applicability: 0.7,
      });
    }

    // jest.fn pattern
    if (/jest\.fn\(/.test(content)) {
      patterns.push({
        id: uuidv4(),
        name: 'Jest function mock pattern',
        structure: `const {{mockName}} = jest.fn().mockReturnValue({{returnValue}});`,
        examples: 1,
        applicability: 0.7,
      });
    }

    // vi.mock pattern (vitest)
    if (/vi\.mock\(/.test(content)) {
      patterns.push({
        id: uuidv4(),
        name: 'Vitest module mock pattern',
        structure: `vi.mock('{{modulePath}}', () => ({\n  {{mockImplementation}}\n}));`,
        examples: 1,
        applicability: 0.7,
      });
    }

    // vi.fn pattern (vitest)
    if (/vi\.fn\(/.test(content)) {
      patterns.push({
        id: uuidv4(),
        name: 'Vitest function mock pattern',
        structure: `const {{mockName}} = vi.fn().mockReturnValue({{returnValue}});`,
        examples: 1,
        applicability: 0.7,
      });
    }

    // spyOn pattern
    if (/(?:jest|vi)\.spyOn\(/.test(content)) {
      patterns.push({
        id: uuidv4(),
        name: 'SpyOn pattern',
        structure: `const spy = {{framework}}.spyOn({{object}}, '{{method}}').mockImplementation({{impl}});`,
        examples: 1,
        applicability: 0.6,
      });
    }

    return patterns;
  }

  /**
   * Extract a complete block of code starting from an opening brace
   */
  private extractBlockContent(content: string, startIndex: number): string | null {
    let braceCount = 0;
    let endIndex = startIndex;
    let started = false;

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      if (char === '{') {
        braceCount++;
        started = true;
      } else if (char === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          endIndex = i;
          break;
        }
      }
    }

    if (endIndex > startIndex) {
      return content.substring(startIndex, endIndex + 1);
    }
    return null;
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

  /**
   * Generate embedding for a pattern definition
   * Uses NomicEmbedder for semantic embeddings (falls back to pseudo-embeddings if Ollama unavailable)
   */
  private async generatePatternEmbedding(definition: PatternDefinition): Promise<number[]> {
    const text = this.formatPatternForEmbedding(definition);
    return this.embedder.embed(text);
  }

  /**
   * Generate embedding for a search query
   * Uses the same embedder as patterns for consistent similarity matching
   */
  private async generateQueryEmbedding(query: string): Promise<number[]> {
    return this.embedder.embed(query);
  }

  /**
   * Format a pattern definition for embedding generation
   * Creates a semantic-rich text representation
   */
  private formatPatternForEmbedding(definition: PatternDefinition): string {
    const parts = [
      `Pattern: ${definition.name}`,
      definition.description ? `Description: ${definition.description}` : '',
      `Structure: ${definition.structure}`,
      definition.tags?.length ? `Tags: ${definition.tags.join(', ')}` : '',
      definition.testType ? `Test type: ${definition.testType}` : '',
      definition.framework ? `Framework: ${definition.framework}` : '',
    ].filter(Boolean);

    return parts.join('\n');
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
  functions?: FunctionInfo[];
  classes?: ClassInfo[];
}

/**
 * Information about a function extracted from AST
 */
interface FunctionInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string | undefined;
  isAsync: boolean;
  isExported: boolean;
  complexity: number;
  startLine: number;
  endLine: number;
  body?: string;
}

/**
 * Information about a class extracted from AST
 */
interface ClassInfo {
  name: string;
  methods: FunctionInfo[];
  properties: PropertyInfo[];
  isExported: boolean;
  hasConstructor: boolean;
  startLine: number;
  endLine: number;
}

/**
 * Information about a parameter
 */
interface ParameterInfo {
  name: string;
  type: string | undefined;
  optional: boolean;
  defaultValue: string | undefined;
}

/**
 * Information about a class property
 */
interface PropertyInfo {
  name: string;
  type: string | undefined;
  isPrivate: boolean;
  isReadonly: boolean;
}

/**
 * Testable pattern extracted from code analysis
 */
export interface TestablePattern {
  type: 'function' | 'class' | 'method' | 'module';
  name: string;
  complexity: number;
  lines: { start: number; end: number };
  branches: number;
  suggestedTests: SuggestedTest[];
  context: {
    parameters?: ParameterInfo[];
    returnType?: string;
    dependencies?: string[];
    isAsync?: boolean;
  };
}

/**
 * Suggested test for a pattern
 */
interface SuggestedTest {
  description: string;
  type: 'happy-path' | 'edge-case' | 'error-handling' | 'boundary';
  priority: 'high' | 'medium' | 'low';
  testCode?: string;
}

/**
 * TypeScript AST Parser Helper
 * Provides utilities for parsing TypeScript files and extracting patterns
 */
class TypeScriptASTParser {
  private sourceFile: ts.SourceFile | null = null;
  private sourceCode: string = '';

  /**
   * Parse a TypeScript file and return the source file AST
   */
  parseFile(filePath: string, content?: string): ts.SourceFile {
    if (content) {
      this.sourceCode = content;
    } else {
      this.sourceCode = fs.readFileSync(filePath, 'utf-8');
    }

    this.sourceFile = ts.createSourceFile(
      path.basename(filePath),
      this.sourceCode,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    return this.sourceFile;
  }

  /**
   * Parse source code string directly
   */
  parseSource(source: string, fileName: string = 'module.ts'): ts.SourceFile {
    this.sourceCode = source;
    this.sourceFile = ts.createSourceFile(
      fileName,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    return this.sourceFile;
  }

  /**
   * Extract all functions from the AST
   */
  extractFunctions(sourceFile: ts.SourceFile): FunctionInfo[] {
    const functions: FunctionInfo[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        functions.push(this.extractFunctionInfo(node, sourceFile));
      } else if (ts.isVariableStatement(node)) {
        // Handle arrow functions assigned to variables
        for (const declaration of node.declarationList.declarations) {
          if (
            ts.isVariableDeclaration(declaration) &&
            declaration.initializer &&
            (ts.isArrowFunction(declaration.initializer) ||
              ts.isFunctionExpression(declaration.initializer))
          ) {
            const name = declaration.name.getText(sourceFile);
            functions.push(
              this.extractArrowFunctionInfo(
                name,
                declaration.initializer,
                sourceFile,
                node
              )
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return functions;
  }

  /**
   * Extract all classes from the AST
   */
  extractClasses(sourceFile: ts.SourceFile): ClassInfo[] {
    const classes: ClassInfo[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name) {
        classes.push(this.extractClassInfo(node, sourceFile));
      }
      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return classes;
  }

  /**
   * Extract information from a function declaration
   */
  private extractFunctionInfo(
    node: ts.FunctionDeclaration,
    sourceFile: ts.SourceFile
  ): FunctionInfo {
    const name = node.name?.getText(sourceFile) || 'anonymous';
    const parameters = this.extractParameters(node.parameters, sourceFile);
    const returnType = node.type?.getText(sourceFile);
    const isAsync = node.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.AsyncKeyword
    ) ?? false;
    const isExported = node.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword
    ) ?? false;

    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile)
    );
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(
      node.getEnd()
    );

    const complexity = this.calculateCyclomaticComplexity(node);

    return {
      name,
      parameters,
      returnType,
      isAsync,
      isExported,
      complexity,
      startLine: startLine + 1,
      endLine: endLine + 1,
      body: node.body?.getText(sourceFile),
    };
  }

  /**
   * Extract information from an arrow function or function expression
   */
  private extractArrowFunctionInfo(
    name: string,
    node: ts.ArrowFunction | ts.FunctionExpression,
    sourceFile: ts.SourceFile,
    parentNode: ts.Node
  ): FunctionInfo {
    const parameters = this.extractParameters(node.parameters, sourceFile);
    const returnType = node.type?.getText(sourceFile);
    const isAsync = node.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.AsyncKeyword
    ) ?? false;

    // Check if parent is exported
    const isExported = ts.isVariableStatement(parentNode) &&
      (parentNode.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);

    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile)
    );
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(
      node.getEnd()
    );

    const complexity = this.calculateCyclomaticComplexity(node);

    return {
      name,
      parameters,
      returnType,
      isAsync,
      isExported,
      complexity,
      startLine: startLine + 1,
      endLine: endLine + 1,
      body: node.body?.getText(sourceFile),
    };
  }

  /**
   * Extract class information
   */
  private extractClassInfo(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile
  ): ClassInfo {
    const name = node.name?.getText(sourceFile) || 'AnonymousClass';
    const methods: FunctionInfo[] = [];
    const properties: PropertyInfo[] = [];
    let hasConstructor = false;

    const isExported = node.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword
    ) ?? false;

    for (const member of node.members) {
      if (ts.isMethodDeclaration(member)) {
        const methodName = member.name.getText(sourceFile);
        const parameters = this.extractParameters(member.parameters, sourceFile);
        const returnType = member.type?.getText(sourceFile);
        const isAsync = member.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.AsyncKeyword
        ) ?? false;

        const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(
          member.getStart(sourceFile)
        );
        const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(
          member.getEnd()
        );

        methods.push({
          name: methodName,
          parameters,
          returnType,
          isAsync,
          isExported: false,
          complexity: this.calculateCyclomaticComplexity(member),
          startLine: startLine + 1,
          endLine: endLine + 1,
          body: member.body?.getText(sourceFile),
        });
      } else if (ts.isConstructorDeclaration(member)) {
        hasConstructor = true;
      } else if (ts.isPropertyDeclaration(member)) {
        const propName = member.name.getText(sourceFile);
        const propType = member.type?.getText(sourceFile);
        const isPrivate = member.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.PrivateKeyword
        ) ?? false;
        const isReadonly = member.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ReadonlyKeyword
        ) ?? false;

        properties.push({
          name: propName,
          type: propType,
          isPrivate,
          isReadonly,
        });
      }
    }

    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile)
    );
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(
      node.getEnd()
    );

    return {
      name,
      methods,
      properties,
      isExported,
      hasConstructor,
      startLine: startLine + 1,
      endLine: endLine + 1,
    };
  }

  /**
   * Extract parameter information
   */
  private extractParameters(
    params: ts.NodeArray<ts.ParameterDeclaration>,
    sourceFile: ts.SourceFile
  ): ParameterInfo[] {
    return params.map((param) => ({
      name: param.name.getText(sourceFile),
      type: param.type?.getText(sourceFile),
      optional: param.questionToken !== undefined,
      defaultValue: param.initializer?.getText(sourceFile),
    }));
  }

  /**
   * Calculate cyclomatic complexity of a node
   */
  calculateCyclomaticComplexity(node: ts.Node): number {
    let complexity = 1;

    const visit = (n: ts.Node): void => {
      switch (n.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.CaseClause:
        case ts.SyntaxKind.CatchClause:
        case ts.SyntaxKind.ConditionalExpression:
        case ts.SyntaxKind.QuestionQuestionToken:
          complexity++;
          break;
        case ts.SyntaxKind.BinaryExpression:
          const binary = n as ts.BinaryExpression;
          if (
            binary.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            binary.operatorToken.kind === ts.SyntaxKind.BarBarToken
          ) {
            complexity++;
          }
          break;
      }
      ts.forEachChild(n, visit);
    };

    ts.forEachChild(node, visit);
    return complexity;
  }
}
