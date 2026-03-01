/**
 * Agentic QE v3 - Metric Collector Service
 *
 * Unified service for collecting real code metrics using actual tooling.
 * Implements RM-001, RM-002, and RM-003 from the AQE V3 Improvements Plan.
 *
 * Features:
 * - LOC counting via cloc/tokei with fallback
 * - Test counting via vitest/jest/cargo/pytest/go with fallback
 * - Pattern detection for code quality indicators
 * - Optional caching with configurable TTL
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 5
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import {
  MetricCollector,
  MetricCollectorConfig,
  ProjectMetrics,
  LOCMetrics,
  TestMetrics,
  PatternMetrics,
  PatternCounts,
  ToolAvailability,
  DEFAULT_METRIC_CONFIG,
} from './interfaces.js';
import { countLOC, checkLOCTools } from './loc-counter.js';
import { countTests, detectTestRunner, checkTestRunners } from './test-counter.js';

// ============================================================================
// Export Types and Interfaces
// ============================================================================

export type {
  MetricCollector,
  MetricCollectorConfig,
  ProjectMetrics,
  LOCMetrics,
  TestMetrics,
  PatternMetrics,
  PatternCounts,
  ToolAvailability,
} from './interfaces.js';

export { DEFAULT_METRIC_CONFIG } from './interfaces.js';

// ============================================================================
// Metric Collector Service Implementation
// ============================================================================

/**
 * Interface for the MetricCollector service
 */
export interface IMetricCollectorService extends MetricCollector {
  /** Check available tools on the system */
  checkTools(): ToolAvailability[];

  /** Clear the metrics cache */
  clearCache(): void;

  /** Get cache statistics */
  getCacheStats(): { hits: number; misses: number; size: number };
}

/**
 * MetricCollectorService - Unified service for real metric collection
 *
 * @example
 * ```typescript
 * const collector = new MetricCollectorService();
 * const metrics = await collector.collectAll('/path/to/project');
 * console.log(`Total LOC: ${metrics.loc.total}`);
 * console.log(`Total tests: ${metrics.tests.total}`);
 * ```
 */
export class MetricCollectorService implements IMetricCollectorService {
  private readonly config: MetricCollectorConfig;
  private readonly cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(config: Partial<MetricCollectorConfig> = {}) {
    this.config = { ...DEFAULT_METRIC_CONFIG, ...config };
  }

  /**
   * Collect all metrics for a project
   */
  async collectAll(projectPath: string): Promise<ProjectMetrics> {
    const cacheKey = `all:${projectPath}`;

    // Check cache first
    if (this.config.enableCache) {
      const cached = this.getFromCache<ProjectMetrics>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Collect all metrics in parallel
    const [loc, tests, patterns] = await Promise.all([
      this.countLOC(projectPath),
      this.countTests(projectPath),
      this.countPatterns(projectPath, this.detectLanguage(projectPath)),
    ]);

    const toolsUsed: string[] = [];
    if (loc.source !== 'fallback') toolsUsed.push(loc.source);
    if (tests.source !== 'fallback') toolsUsed.push(tests.source);

    // Fix #281: Surface accuracy indicator
    // node-native, cloc, tokei are all accurate (read real files)
    // Only 'fallback' (legacy estimation) is approximate
    const locAccuracy = loc.source === 'fallback' ? 'approximate' as const : 'accurate' as const;
    const testAccuracy = tests.source === 'fallback' ? 'approximate' as const : 'accurate' as const;

    const metrics: ProjectMetrics = {
      loc,
      tests,
      patterns,
      collectedAt: new Date(),
      toolsUsed,
      accuracy: {
        loc: locAccuracy,
        tests: testAccuracy,
        overall: (locAccuracy === 'accurate' && testAccuracy === 'accurate') ? 'accurate' : 'approximate',
      },
    };

    // Cache the result
    if (this.config.enableCache) {
      this.setInCache(cacheKey, metrics);
    }

    return metrics;
  }

  /**
   * Count lines of code using actual tooling
   */
  async countLOC(projectPath: string): Promise<LOCMetrics> {
    const cacheKey = `loc:${projectPath}`;

    if (this.config.enableCache) {
      const cached = this.getFromCache<LOCMetrics>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const result = await countLOC(projectPath, this.config);

    if (this.config.enableCache) {
      this.setInCache(cacheKey, result);
    }

    return result;
  }

  /**
   * Count tests using actual test runners
   */
  async countTests(projectPath: string): Promise<TestMetrics> {
    const cacheKey = `tests:${projectPath}`;

    if (this.config.enableCache) {
      const cached = this.getFromCache<TestMetrics>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const result = await countTests(projectPath, this.config);

    if (this.config.enableCache) {
      this.setInCache(cacheKey, result);
    }

    return result;
  }

  /**
   * Count language-specific patterns
   */
  async countPatterns(projectPath: string, language: string): Promise<PatternMetrics> {
    const cacheKey = `patterns:${projectPath}:${language}`;

    if (this.config.enableCache) {
      const cached = this.getFromCache<PatternMetrics>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const result = this.countPatternsInternal(projectPath, language);

    if (this.config.enableCache) {
      this.setInCache(cacheKey, result);
    }

    return result;
  }

  /**
   * Check available tools on the system
   */
  checkTools(): ToolAvailability[] {
    const locTools = checkLOCTools();
    const testTools = checkTestRunners(process.cwd());
    return [...locTools, ...testTools];
  }

  /**
   * Clear the metrics cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; size: number } {
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size: this.cache.size,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Get item from cache if valid
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.config.cacheTTL) {
      this.cacheHits++;
      return entry.data as T;
    }
    this.cacheMisses++;
    return null;
  }

  /**
   * Set item in cache
   */
  private setInCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Detect primary language of a project
   */
  private detectLanguage(projectPath: string): string {
    // Check for language-specific markers
    if (existsSync(join(projectPath, 'Cargo.toml'))) return 'rust';
    if (existsSync(join(projectPath, 'go.mod'))) return 'go';
    if (existsSync(join(projectPath, 'pyproject.toml')) ||
        existsSync(join(projectPath, 'requirements.txt'))) return 'python';
    if (existsSync(join(projectPath, 'package.json'))) {
      // Check if TypeScript
      if (existsSync(join(projectPath, 'tsconfig.json'))) return 'typescript';
      return 'javascript';
    }
    return 'unknown';
  }

  /**
   * Internal pattern counting implementation
   */
  private countPatternsInternal(projectPath: string, language: string): PatternMetrics {
    const byFile: Record<string, PatternCounts> = {};
    let totalUnwraps = 0;
    let totalUnsafe = 0;
    let totalTodos = 0;
    let totalConsole = 0;

    const patterns = this.getPatternsForLanguage(language);

    function walkDirectory(dirPath: string): void {
      if (!existsSync(dirPath)) return;

      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Skip excluded directories
          const excludeDirs = ['node_modules', 'dist', 'coverage', 'build', '.git', 'vendor', 'target'];
          if (excludeDirs.includes(entry.name)) continue;
          walkDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (isSourceFile(ext, language)) {
            const counts = countPatternsInFile(fullPath, patterns);
            if (counts.unwraps > 0 || counts.unsafeBlocks > 0 ||
                counts.todoComments > 0 || counts.consoleStatements > 0) {
              byFile[fullPath] = counts;
              totalUnwraps += counts.unwraps;
              totalUnsafe += counts.unsafeBlocks;
              totalTodos += counts.todoComments;
              totalConsole += counts.consoleStatements;
            }
          }
        }
      }
    }

    walkDirectory(projectPath);

    return {
      unwraps: totalUnwraps,
      unsafeBlocks: totalUnsafe,
      todoComments: totalTodos,
      consoleStatements: totalConsole,
      byFile,
    };
  }

  /**
   * Get regex patterns for a specific language
   */
  private getPatternsForLanguage(language: string): LanguagePatterns {
    switch (language) {
      case 'rust':
        return {
          unwrap: /\.unwrap\s*\(/g,
          unsafe: /\bunsafe\s*\{/g,
          todo: /\/\/\s*(TODO|FIXME|HACK|XXX)[\s:]/gi,
          console: /\b(println!|print!|eprintln!|eprint!|dbg!)\s*\(/g,
        };
      case 'python':
        return {
          unwrap: null, // Not applicable
          unsafe: null, // Not applicable
          todo: /#\s*(TODO|FIXME|HACK|XXX)[\s:]/gi,
          console: /\b(print)\s*\(/g,
        };
      case 'go':
        return {
          unwrap: null, // Not applicable
          unsafe: /\bunsafe\./g,
          todo: /\/\/\s*(TODO|FIXME|HACK|XXX)[\s:]/gi,
          console: /\b(fmt\.Print|fmt\.Printf|fmt\.Println|log\.Print|log\.Printf|log\.Println)\s*\(/g,
        };
      case 'typescript':
      case 'javascript':
      default:
        return {
          unwrap: null, // Not applicable
          unsafe: null, // Not applicable
          todo: /\/\/\s*(TODO|FIXME|HACK|XXX)[\s:]/gi,
          console: /\bconsole\.(log|debug|info|warn|error)\s*\(/g,
        };
    }
  }
}

// ============================================================================
// Helper Types and Functions
// ============================================================================

interface LanguagePatterns {
  unwrap: RegExp | null;
  unsafe: RegExp | null;
  todo: RegExp;
  console: RegExp;
}

/**
 * Check if a file extension matches the target language
 */
function isSourceFile(ext: string, language: string): boolean {
  switch (language) {
    case 'rust':
      return ext === '.rs';
    case 'python':
      return ['.py', '.pyw'].includes(ext);
    case 'go':
      return ext === '.go';
    case 'typescript':
      return ['.ts', '.tsx'].includes(ext);
    case 'javascript':
      return ['.js', '.jsx', '.mjs', '.cjs'].includes(ext);
    default:
      // For unknown language, check common source extensions
      return ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go'].includes(ext);
  }
}

/**
 * Count patterns in a single file
 */
function countPatternsInFile(filePath: string, patterns: LanguagePatterns): PatternCounts {
  try {
    const content = readFileSync(filePath, 'utf-8');

    return {
      unwraps: patterns.unwrap ? (content.match(patterns.unwrap) || []).length : 0,
      unsafeBlocks: patterns.unsafe ? (content.match(patterns.unsafe) || []).length : 0,
      todoComments: (content.match(patterns.todo) || []).length,
      consoleStatements: (content.match(patterns.console) || []).length,
    };
  } catch {
    return {
      unwraps: 0,
      unsafeBlocks: 0,
      todoComments: 0,
      consoleStatements: 0,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new MetricCollectorService instance
 *
 * @param config - Optional configuration overrides
 * @returns MetricCollectorService instance
 *
 * @example
 * ```typescript
 * const collector = createMetricCollector({ enableCache: false });
 * const loc = await collector.countLOC('/path/to/project');
 * ```
 */
export function createMetricCollector(
  config: Partial<MetricCollectorConfig> = {}
): IMetricCollectorService {
  return new MetricCollectorService(config);
}

// ============================================================================
// Re-exports for Convenience
// ============================================================================

export { countLOC, checkLOCTools } from './loc-counter.js';
export { countTests, detectTestRunner, checkTestRunners } from './test-counter.js';
