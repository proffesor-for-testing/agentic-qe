/**
 * CodeAnalyzer - Main Analysis Engine for Real-Time Code Analysis
 *
 * Coordinates the analysis pipeline:
 * 1. FunctionExtractor - Parse TypeScript/JavaScript AST
 * 2. ComplexityCalculator - Calculate cyclomatic complexity
 * 3. TestabilityScorer - Score testability (0-100)
 * 4. PatternMatcher - Match against stored patterns
 *
 * Features:
 * - Real-time analysis on document save (debounced 500ms)
 * - Analysis caching for performance
 * - Integration with @ruvector/edge for embeddings
 * - Pattern storage and learning
 *
 * @module vscode-extension/analysis/CodeAnalyzer
 * @version 0.1.0
 */

import * as ts from 'typescript';
import {
  FunctionExtractor,
  type ExtractedFunction,
  type ExtractorOptions,
} from './FunctionExtractor';
import {
  ComplexityCalculator,
  type ComplexityResult,
  type ComplexitySummary,
  type ComplexityOptions,
} from './ComplexityCalculator';
import {
  TestabilityScorer,
  type TestabilityScore,
  type TestabilityScorerOptions,
} from './TestabilityScorer';
import {
  PatternMatcher,
  type CodePattern,
  type PatternMatch,
  type PatternMatcherOptions,
  type TestSuggestion,
} from './PatternMatcher';

/**
 * Complete analysis result for a function
 */
export interface FunctionAnalysis {
  /**
   * Extracted function information
   */
  function: ExtractedFunction;

  /**
   * Complexity analysis
   */
  complexity: ComplexityResult;

  /**
   * Testability score
   */
  testability: TestabilityScore;

  /**
   * Matching patterns
   */
  patternMatches: PatternMatch[];

  /**
   * Generated test suggestions
   */
  testSuggestions: TestSuggestion[];
}

/**
 * Complete analysis result for a file
 */
export interface FileAnalysisResult {
  /**
   * File path
   */
  filePath: string;

  /**
   * Language (typescript, javascript)
   */
  language: string;

  /**
   * Analysis of each function
   */
  functions: FunctionAnalysis[];

  /**
   * File-level complexity summary
   */
  complexitySummary: ComplexitySummary;

  /**
   * Average testability score
   */
  averageTestability: number;

  /**
   * Total analysis duration in ms
   */
  duration: number;

  /**
   * Number of high-priority issues
   */
  issueCount: {
    critical: number;
    major: number;
    minor: number;
  };

  /**
   * Top suggestions for improvement
   */
  topSuggestions: string[];

  /**
   * Timestamp
   */
  timestamp: number;
}

/**
 * Analysis cache entry
 */
interface CacheEntry {
  result: FileAnalysisResult;
  contentHash: string;
  timestamp: number;
}

/**
 * Debounced analysis request
 */
interface DebouncedRequest {
  resolve: (result: FileAnalysisResult) => void;
  reject: (error: Error) => void;
  code: string;
  filePath: string;
}

/**
 * Analyzer options
 */
export interface CodeAnalyzerOptions {
  /**
   * Debounce delay in ms (default 500)
   */
  debounceMs?: number;

  /**
   * Cache expiry in ms (default 60000 = 1 minute)
   */
  cacheExpiryMs?: number;

  /**
   * Maximum cache size (default 100)
   */
  maxCacheSize?: number;

  /**
   * Function extractor options
   */
  extractorOptions?: ExtractorOptions;

  /**
   * Complexity calculator options
   */
  complexityOptions?: ComplexityOptions;

  /**
   * Testability scorer options
   */
  testabilityOptions?: TestabilityScorerOptions;

  /**
   * Pattern matcher options
   */
  patternMatcherOptions?: PatternMatcherOptions;

  /**
   * Enable pattern learning
   */
  enableLearning?: boolean;

  /**
   * Debug mode
   */
  debugMode?: boolean;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: CodeAnalyzerOptions = {
  debounceMs: 500,
  cacheExpiryMs: 60000,
  maxCacheSize: 100,
  enableLearning: true,
  debugMode: false,
};

/**
 * CodeAnalyzer
 *
 * Main analysis engine that coordinates all analysis components.
 */
export class CodeAnalyzer {
  private options: Required<CodeAnalyzerOptions>;
  private extractor: FunctionExtractor;
  private complexityCalculator: ComplexityCalculator;
  private testabilityScorer: TestabilityScorer;
  private patternMatcher: PatternMatcher;

  private cache: Map<string, CacheEntry> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingRequests: Map<string, DebouncedRequest[]> = new Map();

  constructor(options: CodeAnalyzerOptions = {}) {
    this.options = {
      debounceMs: options.debounceMs ?? DEFAULT_OPTIONS.debounceMs!,
      cacheExpiryMs: options.cacheExpiryMs ?? DEFAULT_OPTIONS.cacheExpiryMs!,
      maxCacheSize: options.maxCacheSize ?? DEFAULT_OPTIONS.maxCacheSize!,
      extractorOptions: options.extractorOptions ?? {},
      complexityOptions: options.complexityOptions ?? {},
      testabilityOptions: options.testabilityOptions ?? {},
      patternMatcherOptions: options.patternMatcherOptions ?? {},
      enableLearning: options.enableLearning ?? DEFAULT_OPTIONS.enableLearning!,
      debugMode: options.debugMode ?? DEFAULT_OPTIONS.debugMode!,
    };

    this.extractor = new FunctionExtractor(this.options.extractorOptions);
    this.complexityCalculator = new ComplexityCalculator(this.options.complexityOptions);
    this.testabilityScorer = new TestabilityScorer(this.options.testabilityOptions);
    this.patternMatcher = new PatternMatcher(this.options.patternMatcherOptions);
  }

  /**
   * Analyze code with debouncing
   *
   * Multiple calls within debounceMs will be combined into a single analysis.
   */
  analyzeDebounced(code: string, filePath: string): Promise<FileAnalysisResult> {
    return new Promise((resolve, reject) => {
      // Add to pending requests
      const pending = this.pendingRequests.get(filePath) || [];
      pending.push({ resolve, reject, code, filePath });
      this.pendingRequests.set(filePath, pending);

      // Clear existing timer
      const existingTimer = this.debounceTimers.get(filePath);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new timer
      const timer = setTimeout(async () => {
        const requests = this.pendingRequests.get(filePath) || [];
        this.pendingRequests.delete(filePath);
        this.debounceTimers.delete(filePath);

        if (requests.length === 0) return;

        try {
          // Use the latest code
          const latestRequest = requests[requests.length - 1];
          const result = await this.analyze(latestRequest.code, latestRequest.filePath);

          // Resolve all pending promises
          for (const req of requests) {
            req.resolve(result);
          }
        } catch (error) {
          // Reject all pending promises
          for (const req of requests) {
            req.reject(error as Error);
          }
        }
      }, this.options.debounceMs);

      this.debounceTimers.set(filePath, timer);
    });
  }

  /**
   * Analyze code immediately (bypasses debouncing)
   */
  async analyze(code: string, filePath: string): Promise<FileAnalysisResult> {
    const startTime = performance.now();

    // Check cache
    const contentHash = this.hashContent(code);
    const cached = this.cache.get(filePath);

    if (
      cached &&
      cached.contentHash === contentHash &&
      Date.now() - cached.timestamp < this.options.cacheExpiryMs
    ) {
      this.log(`Cache hit for ${filePath}`);
      return cached.result;
    }

    // Determine language from file path
    const language = this.getLanguage(filePath);

    // Extract functions
    const extractedFunctions = this.extractor.extract(code, filePath);
    this.log(`Extracted ${extractedFunctions.length} functions from ${filePath}`);

    // Analyze each function
    const functionAnalyses: FunctionAnalysis[] = [];

    for (const func of extractedFunctions) {
      const analysis = this.analyzeFunction(func);
      functionAnalyses.push(analysis);

      // Store pattern for learning (if enabled)
      if (this.options.enableLearning) {
        const pattern = this.patternMatcher.createPattern(
          func,
          analysis.complexity,
          analysis.testability,
          { filePath, language }
        );
        this.patternMatcher.storePattern(pattern);
      }
    }

    // Calculate file-level summary
    const complexityResults = functionAnalyses.map((a) => ({
      func: a.function,
      result: a.complexity,
    }));
    const complexitySummary = this.complexityCalculator.getSummary(complexityResults);

    // Calculate average testability
    const averageTestability =
      functionAnalyses.length > 0
        ? functionAnalyses.reduce((sum, a) => sum + a.testability.score, 0) /
          functionAnalyses.length
        : 0;

    // Count issues
    const issueCount = this.countIssues(functionAnalyses);

    // Generate top suggestions
    const topSuggestions = this.generateTopSuggestions(functionAnalyses);

    const duration = performance.now() - startTime;

    const result: FileAnalysisResult = {
      filePath,
      language,
      functions: functionAnalyses,
      complexitySummary,
      averageTestability,
      duration,
      issueCount,
      topSuggestions,
      timestamp: Date.now(),
    };

    // Update cache
    this.updateCache(filePath, result, contentHash);

    this.log(
      `Analyzed ${filePath}: ${functionAnalyses.length} functions in ${duration.toFixed(2)}ms`
    );

    return result;
  }

  /**
   * Analyze a single function
   */
  analyzeFunction(func: ExtractedFunction): FunctionAnalysis {
    // Calculate complexity
    const complexity = this.complexityCalculator.calculate(func);

    // Score testability
    const testability = this.testabilityScorer.score(func);

    // Find matching patterns
    const patternMatches = this.patternMatcher.findMatches(func, complexity, testability);

    // Collect test suggestions
    const testSuggestions: TestSuggestion[] = [];
    for (const match of patternMatches.slice(0, 3)) {
      testSuggestions.push(...match.suggestedTests);
    }

    // Deduplicate suggestions by title
    const uniqueSuggestions = this.deduplicateSuggestions(testSuggestions);

    return {
      function: func,
      complexity,
      testability,
      patternMatches,
      testSuggestions: uniqueSuggestions.slice(0, 5),
    };
  }

  /**
   * Analyze raw function code (convenience method)
   */
  analyzeCode(code: string): FunctionAnalysis[] {
    const functions = this.extractor.extract(code, 'temp.ts');
    return functions.map((func) => this.analyzeFunction(func));
  }

  /**
   * Get functions that need attention (low testability or high complexity)
   */
  getFunctionsNeedingAttention(
    result: FileAnalysisResult,
    thresholds?: { minTestability?: number; maxComplexity?: number }
  ): FunctionAnalysis[] {
    const minTestability = thresholds?.minTestability ?? 60;
    const maxComplexity = thresholds?.maxComplexity ?? 10;

    return result.functions.filter(
      (f) =>
        f.testability.score < minTestability ||
        f.complexity.cyclomaticComplexity > maxComplexity
    );
  }

  /**
   * Get test suggestions for the entire file
   */
  getTestSuggestions(result: FileAnalysisResult): TestSuggestion[] {
    const suggestions: TestSuggestion[] = [];

    for (const func of result.functions) {
      // Prioritize functions without existing test patterns
      if (func.patternMatches.length === 0) {
        suggestions.push(...func.testSuggestions);
      }
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return suggestions.slice(0, 10);
  }

  /**
   * Record test outcome for pattern learning
   */
  recordTestOutcome(
    patternId: string,
    testPatternId: string,
    success: boolean
  ): void {
    if (this.options.enableLearning) {
      this.patternMatcher.recordOutcome(patternId, testPatternId, success);
    }
  }

  /**
   * Export patterns for persistence
   */
  exportPatterns(): CodePattern[] {
    return this.patternMatcher.exportPatterns();
  }

  /**
   * Import patterns from persistence
   */
  importPatterns(patterns: CodePattern[]): void {
    this.patternMatcher.importPatterns(patterns);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear all patterns
   */
  clearPatterns(): void {
    this.patternMatcher.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.options.maxCacheSize,
      hitRate: 0, // Could track this if needed
    };
  }

  /**
   * Get pattern statistics
   */
  getPatternStats(): { count: number; learned: number } {
    return {
      count: this.patternMatcher.size,
      learned: this.patternMatcher.size, // All patterns are learned
    };
  }

  /**
   * Cancel pending debounced analysis
   */
  cancelPending(filePath?: string): void {
    if (filePath) {
      const timer = this.debounceTimers.get(filePath);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(filePath);
      }
      this.pendingRequests.delete(filePath);
    } else {
      // Cancel all
      for (const timer of this.debounceTimers.values()) {
        clearTimeout(timer);
      }
      this.debounceTimers.clear();
      this.pendingRequests.clear();
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.cancelPending();
    this.clearCache();
  }

  // --- Private methods ---

  /**
   * Count issues across all functions
   */
  private countIssues(
    analyses: FunctionAnalysis[]
  ): { critical: number; major: number; minor: number } {
    let critical = 0;
    let major = 0;
    let minor = 0;

    for (const analysis of analyses) {
      for (const ap of analysis.testability.antiPatterns) {
        switch (ap.severity) {
          case 'critical':
            critical++;
            break;
          case 'major':
            major++;
            break;
          case 'minor':
            minor++;
            break;
        }
      }
    }

    return { critical, major, minor };
  }

  /**
   * Generate top suggestions for the file
   */
  private generateTopSuggestions(analyses: FunctionAnalysis[]): string[] {
    const suggestions: Array<{ text: string; priority: number }> = [];

    // Add complexity hotspots
    const complexFunctions = analyses
      .filter((a) => a.complexity.category === 'high' || a.complexity.category === 'very-high')
      .sort((a, b) => b.complexity.cyclomaticComplexity - a.complexity.cyclomaticComplexity);

    if (complexFunctions.length > 0) {
      const names = complexFunctions.slice(0, 3).map((f) => f.function.name);
      suggestions.push({
        text: `Reduce complexity in: ${names.join(', ')}`,
        priority: 1,
      });
    }

    // Add testability issues
    const poorTestability = analyses
      .filter((a) => a.testability.category === 'poor' || a.testability.category === 'very-poor')
      .sort((a, b) => a.testability.score - b.testability.score);

    if (poorTestability.length > 0) {
      const names = poorTestability.slice(0, 3).map((f) => f.function.name);
      suggestions.push({
        text: `Improve testability for: ${names.join(', ')}`,
        priority: 2,
      });
    }

    // Add anti-pattern warnings
    const criticalAntiPatterns = analyses.flatMap((a) =>
      a.testability.antiPatterns
        .filter((ap) => ap.severity === 'critical')
        .map((ap) => ({ type: ap.type, func: a.function.name }))
    );

    if (criticalAntiPatterns.length > 0) {
      const types = [...new Set(criticalAntiPatterns.map((ap) => ap.type))];
      suggestions.push({
        text: `Critical issues found: ${types.join(', ')}`,
        priority: 0,
      });
    }

    // Sort by priority and return top 5
    return suggestions
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 5)
      .map((s) => s.text);
  }

  /**
   * Deduplicate suggestions by title
   */
  private deduplicateSuggestions(suggestions: TestSuggestion[]): TestSuggestion[] {
    const seen = new Set<string>();
    const unique: TestSuggestion[] = [];

    for (const suggestion of suggestions) {
      if (!seen.has(suggestion.title)) {
        seen.add(suggestion.title);
        unique.push(suggestion);
      }
    }

    return unique;
  }

  /**
   * Update cache with LRU eviction
   */
  private updateCache(
    filePath: string,
    result: FileAnalysisResult,
    contentHash: string
  ): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.options.maxCacheSize) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this.cache) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(filePath, {
      result,
      contentHash,
      timestamp: Date.now(),
    });
  }

  /**
   * Hash content for cache invalidation
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Get language from file path
   */
  private getLanguage(filePath: string): string {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      return 'typescript';
    }
    return 'javascript';
  }

  /**
   * Log message (debug mode only)
   */
  private log(message: string): void {
    if (this.options.debugMode) {
      console.log(`[CodeAnalyzer] ${message}`);
    }
  }
}

/**
 * Create a default CodeAnalyzer instance
 */
export function createAnalyzer(options?: CodeAnalyzerOptions): CodeAnalyzer {
  return new CodeAnalyzer(options);
}
