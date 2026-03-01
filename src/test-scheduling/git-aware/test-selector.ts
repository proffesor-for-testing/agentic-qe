/**
 * Git-Aware Test Selector
 *
 * Analyzes git changes and selects only the tests that are
 * affected by those changes. This provides massive speedups
 * in CI by running only relevant tests.
 *
 * INTEGRATION WITH CODE-INTELLIGENCE:
 * When an ImpactAnalyzerService is provided, this selector uses
 * the actual import graph from KnowledgeGraphService for accurate
 * dependency analysis. Without it, falls back to pattern matching.
 */

import { spawn } from 'child_process';
import { resolve, dirname, basename } from 'path';
import type { ChangedFile, TestMapping } from '../interfaces';
import type { IImpactAnalyzerService } from '../../domains/code-intelligence/services/impact-analyzer';

// ============================================================================
// Types
// ============================================================================

export interface TestSelectorConfig {
  /** Working directory (git root) */
  cwd?: string;

  /** Base ref to compare against (default: HEAD~1 or main) */
  baseRef?: string;

  /** Patterns for test files */
  testPatterns?: string[];

  /** Patterns for source files */
  sourcePatterns?: string[];

  /** Custom mapping rules: source pattern -> test pattern */
  mappingRules?: MappingRule[];

  /** Include tests for deleted files? */
  includeDeletedFileTests?: boolean;

  /**
   * ImpactAnalyzerService for accurate import graph analysis.
   * Uses real dependency traversal from KnowledgeGraphService.
   * REQUIRED for accurate test selection in v3.
   */
  impactAnalyzer: IImpactAnalyzerService;
}

export interface MappingRule {
  /** Regex pattern for source files */
  sourcePattern: RegExp;

  /** Function to generate test file paths from source match */
  toTestPaths: (match: RegExpMatchArray, sourceFile: string) => string[];
}

export interface TestSelectionResult {
  /** All changed files */
  changedFiles: ChangedFile[];

  /** Selected test files to run */
  selectedTests: string[];

  /** Mappings that were used */
  mappings: TestMapping[];

  /** Whether to run all tests (fallback) */
  runAllTests: boolean;

  /** Reason if running all tests */
  runAllReason?: string;
}

// ============================================================================
// Default Mapping Rules
// ============================================================================

const DEFAULT_MAPPING_RULES: MappingRule[] = [
  // src/foo/bar.ts -> tests/unit/foo/bar.test.ts
  {
    sourcePattern: /^src\/(.+)\.ts$/,
    toTestPaths: (match, _sourceFile) => {
      const path = match[1];
      return [
        `tests/unit/${path}.test.ts`,
        `tests/unit/${path}.spec.ts`,
        `tests/${path}.test.ts`,
        `tests/${path}.spec.ts`,
        `src/${path}.test.ts`,
        `src/${path}.spec.ts`,
      ];
    },
  },

  // src/foo/bar/index.ts -> tests/unit/foo/bar.test.ts
  {
    sourcePattern: /^src\/(.+)\/index\.ts$/,
    toTestPaths: (match, _sourceFile) => {
      const path = match[1];
      return [
        `tests/unit/${path}.test.ts`,
        `tests/unit/${path}/index.test.ts`,
        `tests/unit/${path}.spec.ts`,
      ];
    },
  },

  // Any changed test file selects itself
  {
    sourcePattern: /\.(test|spec)\.(ts|tsx|js|jsx)$/,
    toTestPaths: (_match, sourceFile) => [sourceFile],
  },

  // Config files run all tests
  {
    sourcePattern: /^(vitest\.config|jest\.config|tsconfig|package\.json)/,
    toTestPaths: () => ['**/*.test.ts', '**/*.spec.ts'],
  },
];

// ============================================================================
// Git-Aware Test Selector
// ============================================================================

export class GitAwareTestSelector {
  private readonly cwd: string;
  private readonly baseRef: string;
  private readonly mappingRules: MappingRule[];
  private readonly impactAnalyzer: IImpactAnalyzerService;

  constructor(private readonly config: TestSelectorConfig) {
    if (!config.impactAnalyzer) {
      throw new Error(
        'GitAwareTestSelector requires impactAnalyzer. ' +
        'Use ImpactAnalyzerService from code-intelligence domain. ' +
        'NO FALLBACK TO PATTERN MATCHING - use real dependency analysis.'
      );
    }
    this.cwd = config.cwd || process.cwd();
    this.baseRef = config.baseRef || 'HEAD~1';
    this.mappingRules = config.mappingRules || DEFAULT_MAPPING_RULES;
    this.impactAnalyzer = config.impactAnalyzer;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Get tests affected by changes since base ref
   */
  async selectAffectedTests(): Promise<TestSelectionResult> {
    try {
      const changedFiles = await this.getChangedFiles();

      if (changedFiles.length === 0) {
        return {
          changedFiles: [],
          selectedTests: [],
          mappings: [],
          runAllTests: false,
        };
      }

      const { selectedTests, mappings, runAllTests, runAllReason } =
        await this.mapChangesToTests(changedFiles);

      return {
        changedFiles,
        selectedTests: [...new Set(selectedTests)], // Dedupe
        mappings,
        runAllTests,
        runAllReason,
      };
    } catch (error) {
      // If git fails, run all tests
      return {
        changedFiles: [],
        selectedTests: [],
        mappings: [],
        runAllTests: true,
        runAllReason: `Git error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get tests for a specific list of changed files
   */
  async selectTestsForFiles(files: string[]): Promise<TestSelectionResult> {
    const changedFiles: ChangedFile[] = files.map((path) => ({
      path,
      changeType: 'modified',
    }));

    const { selectedTests, mappings, runAllTests, runAllReason } =
      await this.mapChangesToTests(changedFiles);

    return {
      changedFiles,
      selectedTests: [...new Set(selectedTests)],
      mappings,
      runAllTests,
      runAllReason,
    };
  }

  /**
   * Get changed files since base ref
   */
  async getChangedFiles(): Promise<ChangedFile[]> {
    const output = await this.git([
      'diff',
      '--name-status',
      this.baseRef,
      'HEAD',
    ]);

    const lines = output.trim().split('\n').filter(Boolean);
    const changedFiles: ChangedFile[] = [];

    for (const line of lines) {
      const [status, ...pathParts] = line.split('\t');
      const path = pathParts.join('\t'); // Handle paths with tabs

      let changeType: ChangedFile['changeType'];
      let previousPath: string | undefined;

      switch (status[0]) {
        case 'A':
          changeType = 'added';
          break;
        case 'M':
          changeType = 'modified';
          break;
        case 'D':
          changeType = 'deleted';
          break;
        case 'R':
          changeType = 'renamed';
          previousPath = path;
          break;
        default:
          changeType = 'modified';
      }

      changedFiles.push({
        path: changeType === 'renamed' ? pathParts[1] || path : path,
        changeType,
        previousPath,
      });
    }

    return changedFiles;
  }

  /**
   * Get the merge base between current branch and main
   */
  async getMergeBase(targetBranch = 'main'): Promise<string> {
    try {
      const output = await this.git(['merge-base', 'HEAD', targetBranch]);
      return output.trim();
    } catch {
      // If main doesn't exist, try master
      const output = await this.git(['merge-base', 'HEAD', 'master']);
      return output.trim();
    }
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private async mapChangesToTests(changedFiles: ChangedFile[]): Promise<{
    selectedTests: string[];
    mappings: TestMapping[];
    runAllTests: boolean;
    runAllReason?: string;
  }> {
    const selectedTests: string[] = [];
    const mappings: TestMapping[] = [];
    let runAllTests = false;
    let runAllReason: string | undefined;

    // Check for config file changes first - these require full test run
    for (const file of changedFiles) {
      if (this.isConfigFile(file.path)) {
        return {
          selectedTests: [],
          mappings: [],
          runAllTests: true,
          runAllReason: `Config file changed: ${file.path}`,
        };
      }
    }

    // Use ImpactAnalyzer for real import graph analysis
    // NO FALLBACK - we require accurate dependency traversal
    const changedPaths = changedFiles
      .filter((f) => f.changeType !== 'deleted' || this.config.includeDeletedFileTests)
      .map((f) => f.path);

    if (changedPaths.length === 0) {
      return { selectedTests: [], mappings: [], runAllTests: false };
    }

    const impactResult = await this.impactAnalyzer.getImpactedTests(changedPaths);

    if (!impactResult.success) {
      // Impact analyzer failed - run all tests to be safe
      // Type assertion needed for TS control flow narrowing
      const failureResult = impactResult as { success: false; error: Error };
      const errorMsg = failureResult.error instanceof Error
        ? failureResult.error.message
        : String(failureResult.error);
      return {
        selectedTests: [],
        mappings: [],
        runAllTests: true,
        runAllReason: `Impact analysis failed: ${errorMsg}`,
      };
    }

    if (impactResult.value.length === 0) {
      // No impacted tests found - could be pure refactor or no test coverage
      return { selectedTests: [], mappings: [], runAllTests: false };
    }

    selectedTests.push(...impactResult.value);

    // Create mappings with high confidence for graph-based analysis
    for (const changedFile of changedFiles) {
      if (changedFile.changeType === 'deleted' && !this.config.includeDeletedFileTests) {
        continue;
      }

      // Filter tests that relate to this file based on naming
      const relatedTests = impactResult.value.filter((test) =>
        test.includes(basename(changedFile.path, '.ts').replace(/\.(tsx?|jsx?)$/, ''))
      );

      if (relatedTests.length > 0) {
        mappings.push({
          sourceFile: changedFile.path,
          testFiles: relatedTests,
          confidence: 0.95, // High confidence for graph-based analysis
        });
      }
    }

    return { selectedTests, mappings, runAllTests, runAllReason };
  }

  /**
   * Check if a file is a config file that should trigger full test run
   */
  private isConfigFile(path: string): boolean {
    return /^(vitest\.config|jest\.config|tsconfig|package\.json)/.test(path);
  }

  private async findTestsHeuristically(sourcePath: string): Promise<string[]> {
    const baseName = basename(sourcePath, '.ts').replace(/\.(tsx?|jsx?)$/, '');
    const dir = dirname(sourcePath);

    // Try common patterns
    const candidates = [
      `${dir}/${baseName}.test.ts`,
      `${dir}/${baseName}.spec.ts`,
      `${dir}/__tests__/${baseName}.test.ts`,
      `tests/${dir}/${baseName}.test.ts`,
      `tests/unit/${dir.replace('src/', '')}/${baseName}.test.ts`,
    ];

    return this.filterExistingFiles(candidates);
  }

  private async filterExistingFiles(files: string[]): Promise<string[]> {
    const fs = await import('fs/promises');
    const existing: string[] = [];

    for (const file of files) {
      try {
        const fullPath = resolve(this.cwd, file);
        await fs.access(fullPath);
        existing.push(file);
      } catch (error) {
        // Non-critical: file doesn't exist or inaccessible
        console.debug('[TestSelector] File access check failed:', error instanceof Error ? error.message : error);
      }
    }

    return existing;
  }

  private git(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn('git', args, { cwd: this.cwd });

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`git ${args.join(' ')} failed: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a git-aware test selector
 *
 * INTEGRATION REQUIRED: impactAnalyzer must be provided.
 * Use ImpactAnalyzerService from code-intelligence domain.
 */
export function createTestSelector(config: TestSelectorConfig): GitAwareTestSelector {
  return new GitAwareTestSelector(config);
}

/**
 * Quick function to get affected tests
 *
 * INTEGRATION REQUIRED: impactAnalyzer must be provided.
 * This function demonstrates proper dependency injection.
 */
export async function getAffectedTests(
  impactAnalyzer: IImpactAnalyzerService,
  baseRef?: string,
  cwd?: string
): Promise<string[]> {
  const selector = createTestSelector({ impactAnalyzer, baseRef, cwd });
  const result = await selector.selectAffectedTests();

  if (result.runAllTests) {
    // Return empty to signal "run all"
    return [];
  }

  return result.selectedTests;
}
