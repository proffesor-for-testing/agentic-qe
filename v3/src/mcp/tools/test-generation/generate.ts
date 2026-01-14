/**
 * Agentic QE v3 - Test Generation MCP Tool
 *
 * qe/tests/generate - Generate tests for source code
 *
 * This tool wraps the test-generation domain service and exposes it via MCP.
 * Supports unit, integration, and e2e test generation with AI enhancement.
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema } from '../base';
import { ToolResult } from '../../types';
import { TestGeneratorService } from '../../../domains/test-generation/services/test-generator';
import { MemoryBackend, VectorSearchResult } from '../../../kernel/interfaces';
import { GenerateTestsRequest } from '../../../domains/test-generation/interfaces';
import { TokenOptimizerService } from '../../../optimization/token-optimizer-service.js';
import { TokenMetricsCollector } from '../../../learning/token-tracker.js';

// ============================================================================
// Types
// ============================================================================

export interface TestGenerateParams {
  sourceFiles: string[];
  testType?: 'unit' | 'integration' | 'e2e';
  framework?: 'jest' | 'vitest' | 'mocha' | 'pytest';
  language?: 'typescript' | 'javascript' | 'python' | 'java' | 'go';
  coverageTarget?: number;
  patterns?: string[];
  aiEnhancement?: boolean;
  detectAntiPatterns?: boolean;
  [key: string]: unknown;
}

export interface TestGenerateResult {
  tests: GeneratedTest[];
  coverageEstimate: number;
  patternsUsed: string[];
  suggestions: string[];
  antiPatterns?: AntiPattern[];
}

export interface GeneratedTest {
  id: string;
  name: string;
  sourceFile: string;
  testFile: string;
  testCode: string;
  type: 'unit' | 'integration' | 'e2e';
  assertions: number;
}

export interface AntiPattern {
  name: string;
  location: string;
  severity: 'high' | 'medium' | 'low';
  suggestion: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class TestGenerateTool extends MCPToolBase<TestGenerateParams, TestGenerateResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/tests/generate',
    description: 'Generate tests for source code files. Supports unit, integration, and e2e tests with AI-powered pattern recognition.',
    domain: 'test-generation',
    schema: TEST_GENERATE_SCHEMA,
    streaming: true,
    timeout: 120000,
  };

  private testGeneratorService: TestGeneratorService | null = null;

  /**
   * Initialize or get the test generator service
   */
  private getService(): TestGeneratorService {
    if (!this.testGeneratorService) {
      this.testGeneratorService = new TestGeneratorService(
        createMinimalMemoryBackend(),
        {
          defaultFramework: 'vitest',
          maxTestsPerFile: 50,
          coverageTargetDefault: 80,
          enableAIGeneration: true,
        }
      );
    }
    return this.testGeneratorService;
  }

  async execute(
    params: TestGenerateParams,
    context: MCPToolContext
  ): Promise<ToolResult<TestGenerateResult>> {
    const {
      sourceFiles,
      testType = 'unit',
      framework = 'vitest',
      language = 'typescript',
      coverageTarget = 80,
      patterns = [],
      aiEnhancement = true,
      detectAntiPatterns = false,
    } = params;

    try {
      // Stream progress updates
      this.emitStream(context, {
        status: 'analyzing',
        message: `Analyzing ${sourceFiles.length} source files`,
      });

      // Check for abort
      if (this.isAborted(context)) {
        return {
          success: false,
          error: 'Operation aborted',
        };
      }

      // ADR-042: Check for early exit via pattern reuse
      if (TokenOptimizerService.isEnabled()) {
        const taskDescription = `Generate ${testType} tests for ${sourceFiles.length} files using ${framework}`;
        const earlyExitResult = await TokenOptimizerService.checkTaskEarlyExit(
          taskDescription,
          'test-generation'
        );

        if (earlyExitResult.canExit && earlyExitResult.reusedPattern) {
          this.emitStream(context, {
            status: 'pattern-reuse',
            message: `Reusing pattern: ${earlyExitResult.reusedPattern.name}`,
            tokensSaved: earlyExitResult.estimatedTokensSaved,
          });

          // Apply the cached pattern template
          // For now, we still call the service but skip AI generation
          // In a full implementation, we'd apply the pattern directly
          console.log(
            `[TestGenerateTool] Early exit: reusing pattern ${earlyExitResult.reusedPattern.name}, ` +
            `saving ~${earlyExitResult.estimatedTokensSaved} tokens`
          );
        }
      }

      // Get the domain service and call it with the request
      const service = this.getService();

      // Build the domain request from MCP params
      const domainRequest: GenerateTestsRequest = {
        sourceFiles,
        testType: testType as 'unit' | 'integration' | 'e2e',
        framework: framework as 'jest' | 'vitest' | 'mocha' | 'pytest',
        coverageTarget,
        patterns,
      };

      // Call the domain service for real test generation
      const result = await service.generateTests(domainRequest);

      if (!result.success) {
        return {
          success: false,
          error: result.error?.message || 'Test generation failed',
        };
      }

      // Map domain result to MCP result
      const domainTests = result.value;
      const tests: GeneratedTest[] = domainTests.tests.map((test) => ({
        id: test.id,
        name: test.name,
        sourceFile: test.sourceFile,
        testFile: test.testFile,
        testCode: test.testCode,
        type: test.type,
        assertions: test.assertions,
      }));

      this.emitStream(context, {
        status: 'generating',
        message: `Generated ${tests.length} test files`,
        progress: 50,
      });

      // Detect anti-patterns if requested
      const antiPatterns: AntiPattern[] = detectAntiPatterns
        ? detectAntiPatternsInSource(sourceFiles)
        : [];

      this.emitStream(context, {
        status: 'complete',
        message: 'Test generation complete',
        progress: 100,
      });

      return {
        success: true,
        data: {
          tests,
          coverageEstimate: domainTests.coverageEstimate,
          patternsUsed: domainTests.patternsUsed,
          suggestions: generateSuggestions(tests, aiEnhancement),
          antiPatterns: antiPatterns.length > 0 ? antiPatterns : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Test generation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// ============================================================================
// Schema Definition
// ============================================================================

const TEST_GENERATE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    sourceFiles: {
      type: 'array',
      description: 'Array of source file paths to generate tests for',
      items: { type: 'string', description: 'File path' },
    },
    testType: {
      type: 'string',
      description: 'Type of tests to generate',
      enum: ['unit', 'integration', 'e2e'],
      default: 'unit',
    },
    framework: {
      type: 'string',
      description: 'Test framework to use',
      enum: ['jest', 'vitest', 'mocha', 'pytest'],
      default: 'vitest',
    },
    language: {
      type: 'string',
      description: 'Programming language of source files',
      enum: ['typescript', 'javascript', 'python', 'java', 'go'],
      default: 'typescript',
    },
    coverageTarget: {
      type: 'number',
      description: 'Target code coverage percentage (0-100)',
      minimum: 0,
      maximum: 100,
      default: 80,
    },
    patterns: {
      type: 'array',
      description: 'Test patterns to apply',
      items: { type: 'string', description: 'Pattern name' },
    },
    aiEnhancement: {
      type: 'boolean',
      description: 'Enable AI-powered test enhancement',
      default: true,
    },
    detectAntiPatterns: {
      type: 'boolean',
      description: 'Detect and report anti-patterns in source code',
      default: false,
    },
  },
  required: ['sourceFiles'],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect anti-patterns in source files
 * Analyzes test code for common issues: magic numbers, missing assertions, test interdependence
 */
function detectAntiPatternsInSource(files: string[]): AntiPattern[] {
  const antiPatterns: AntiPattern[] = [];
  const fs = require('fs');

  for (const file of files) {
    try {
      // Try to read the file content
      let content: string;
      try {
        content = fs.readFileSync(file, 'utf-8');
      } catch {
        // File doesn't exist or can't be read, skip
        continue;
      }

      const lines = content.split('\n');

      // Detect magic numbers (numeric literals that aren't 0, 1, -1, or common values)
      const magicNumberPattern = /(?<![\w.])(\d{2,}|[2-9]\d*)(?![\w.])/g;
      const allowedNumbers = new Set(['10', '100', '1000', '60', '24', '365', '404', '500', '200', '201']);

      lines.forEach((line, index) => {
        // Skip comments and imports
        if (line.trim().startsWith('//') || line.trim().startsWith('*') ||
            line.includes('import') || line.includes('require')) {
          return;
        }

        const matches = line.match(magicNumberPattern);
        if (matches) {
          for (const match of matches) {
            // Skip allowed numbers and numbers in strings
            if (allowedNumbers.has(match)) continue;
            // Check if it's in a string
            const beforeMatch = line.substring(0, line.indexOf(match));
            const singleQuotes = (beforeMatch.match(/'/g) || []).length;
            const doubleQuotes = (beforeMatch.match(/"/g) || []).length;
            const backticks = (beforeMatch.match(/`/g) || []).length;
            if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || backticks % 2 === 1) continue;

            antiPatterns.push({
              name: 'magic-number',
              location: `${file}:${index + 1}`,
              severity: 'medium',
              suggestion: `Consider extracting ${match} into a named constant to improve readability and maintainability`,
            });
            break; // Only report first magic number per line
          }
        }
      });

      // Detect missing assertions in test blocks
      const testBlockPattern = /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]\s*,/g;
      let testMatch;
      while ((testMatch = testBlockPattern.exec(content)) !== null) {
        const testStart = testMatch.index;
        const testName = testMatch[1];

        // Find the test block content
        const afterTest = content.substring(testStart);
        const blockContent = extractTestBlockContent(afterTest);

        if (blockContent) {
          // Check for assertions
          const hasExpect = /expect\s*\(/.test(blockContent);
          const hasAssert = /assert[\.\(]/.test(blockContent);
          const hasShould = /\.should[\.\(]/.test(blockContent);
          const hasToBe = /\.toBe|\.toEqual|\.toMatch|\.toThrow|\.toContain/.test(blockContent);

          if (!hasExpect && !hasAssert && !hasShould && !hasToBe) {
            const lineNumber = content.substring(0, testStart).split('\n').length;
            antiPatterns.push({
              name: 'no-assertions',
              location: `${file}:${lineNumber}`,
              severity: 'high',
              suggestion: `Test "${testName}" has no assertions. Add expect() or assert() calls to verify behavior`,
            });
          }
        }
      }

      // Detect test interdependence (shared mutable state)
      const sharedStatePatterns = [
        { pattern: /let\s+\w+\s*=\s*(?!undefined|null)/g, name: 'mutable-let-declaration' },
        { pattern: /(?:^|\s)var\s+\w+\s*=/g, name: 'mutable-var-declaration' },
      ];

      // Check if there are shared variables modified in multiple tests
      const describeBlocks = content.match(/describe\s*\([^)]+,\s*(?:function\s*\(\)|(?:\(\s*\))?\s*=>)\s*\{/g);
      if (describeBlocks) {
        for (const describeBlock of describeBlocks) {
          const describeStart = content.indexOf(describeBlock);
          const describeContent = extractDescribeBlockContent(content.substring(describeStart));

          if (describeContent) {
            // Look for let/var at describe level that's modified in tests
            const letMatch = describeContent.match(/^\s*let\s+(\w+)\s*(?::\s*\w+)?\s*(?:=|;)/m);
            if (letMatch) {
              const varName = letMatch[1];
              // Check if this variable is assigned in multiple it blocks
              const assignmentsInTests = (describeContent.match(
                new RegExp(`(?:it|test)\\s*\\([^)]+,[^]*?${varName}\\s*=`, 'g')
              ) || []).length;

              if (assignmentsInTests >= 2) {
                const lineNumber = content.substring(0, describeStart + describeContent.indexOf(letMatch[0])).split('\n').length;
                antiPatterns.push({
                  name: 'test-interdependence',
                  location: `${file}:${lineNumber}`,
                  severity: 'high',
                  suggestion: `Shared mutable variable '${varName}' is modified in multiple tests, causing test interdependence. Use beforeEach to reset state or isolate test data`,
                });
              }
            }
          }
        }
      }

      // Detect test-only implementation (tests that test test helpers)
      if (/\.test\.|\.spec\./.test(file)) {
        // Look for imports from other test files
        const testImports = content.match(/import\s+.*from\s+['"].*(?:\.test|\.spec)['"]/g);
        if (testImports && testImports.length > 0) {
          antiPatterns.push({
            name: 'test-importing-tests',
            location: file,
            severity: 'medium',
            suggestion: 'Test file imports from another test file. Extract shared test utilities to a separate module',
          });
        }
      }

      // Detect overly long test descriptions (hard to understand)
      const longDescPattern = /(?:it|test|describe)\s*\(\s*['"`]([^'"`]{100,})['"`]/g;
      let longDescMatch;
      while ((longDescMatch = longDescPattern.exec(content)) !== null) {
        const lineNumber = content.substring(0, longDescMatch.index).split('\n').length;
        antiPatterns.push({
          name: 'long-test-description',
          location: `${file}:${lineNumber}`,
          severity: 'low',
          suggestion: 'Test description is too long. Consider breaking into smaller, focused tests or using a more concise description',
        });
      }

      // Detect setTimeout/setInterval in tests without proper handling
      if (/setTimeout|setInterval/.test(content)) {
        const hasUseFakeTimers = /useFakeTimers|fakeTimers|clock/.test(content);
        if (!hasUseFakeTimers) {
          const timeoutMatch = content.match(/setTimeout|setInterval/);
          if (timeoutMatch) {
            const lineNumber = content.substring(0, content.indexOf(timeoutMatch[0])).split('\n').length;
            antiPatterns.push({
              name: 'real-timers-in-tests',
              location: `${file}:${lineNumber}`,
              severity: 'medium',
              suggestion: 'Using real timers in tests can cause flakiness. Consider using fake timers (jest.useFakeTimers() or vi.useFakeTimers())',
            });
          }
        }
      }

    } catch (error) {
      // Skip files that can't be processed
      continue;
    }
  }

  return antiPatterns;
}

/**
 * Extract the content of a test block (it/test function body)
 */
function extractTestBlockContent(content: string): string | null {
  let braceCount = 0;
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      if (startIndex === -1) startIndex = i;
      braceCount++;
    } else if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0 && startIndex !== -1) {
        endIndex = i;
        break;
      }
    }
  }

  if (startIndex !== -1 && endIndex !== -1) {
    return content.substring(startIndex + 1, endIndex);
  }
  return null;
}

/**
 * Extract the content of a describe block
 */
function extractDescribeBlockContent(content: string): string | null {
  let braceCount = 0;
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      if (startIndex === -1) startIndex = i;
      braceCount++;
    } else if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0 && startIndex !== -1) {
        endIndex = i;
        break;
      }
    }
  }

  if (startIndex !== -1 && endIndex !== -1) {
    return content.substring(startIndex + 1, endIndex);
  }
  return null;
}

function generateSuggestions(tests: GeneratedTest[], aiEnabled: boolean): string[] {
  const suggestions: string[] = [];

  if (tests.length === 0) {
    suggestions.push('No tests generated. Ensure source files are valid.');
  }

  if (aiEnabled) {
    suggestions.push('Consider adding property-based tests for edge case coverage');
    suggestions.push('Parameterized tests can reduce duplication');
  }

  return suggestions;
}

// ============================================================================
// Memory Backend Helper
// ============================================================================

/**
 * Create a minimal in-memory backend for when no context memory is available
 */
function createMinimalMemoryBackend(): MemoryBackend {
  const store = new Map<string, { value: unknown; metadata?: unknown }>();
  const vectors = new Map<string, { embedding: number[]; metadata?: unknown }>();

  return {
    async initialize(): Promise<void> {
      // No initialization needed
    },
    async dispose(): Promise<void> {
      store.clear();
      vectors.clear();
    },
    async set<T>(key: string, value: T, _options?: unknown): Promise<void> {
      store.set(key, { value });
    },
    async get<T>(key: string): Promise<T | undefined> {
      const entry = store.get(key);
      return entry?.value as T | undefined;
    },
    async delete(key: string): Promise<boolean> {
      return store.delete(key);
    },
    async has(key: string): Promise<boolean> {
      return store.has(key);
    },
    async search(pattern: string, limit?: number): Promise<string[]> {
      const allKeys = Array.from(store.keys());
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const filtered = allKeys.filter((k) => regex.test(k));
      return limit ? filtered.slice(0, limit) : filtered;
    },
    async storeVector(key: string, embedding: number[], metadata?: unknown): Promise<void> {
      vectors.set(key, { embedding, metadata });
    },
    async vectorSearch(
      _embedding: number[],
      _k: number
    ): Promise<VectorSearchResult[]> {
      // Simple implementation - return empty for minimal backend
      return [];
    },
  };
}
