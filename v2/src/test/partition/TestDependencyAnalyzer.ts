/**
 * Test Dependency Analyzer
 *
 * Uses ts-morph to parse actual TypeScript/JavaScript imports
 * and build a real dependency graph for test partitioning.
 *
 * This replaces the fake "random 30% chance" dependency inference
 * with actual AST-based import analysis.
 */

import { Project, SourceFile, ImportDeclaration, Node } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';
import { TestFile } from './types.js';
import { Logger } from '../../utils/Logger.js';

const logger = Logger.getInstance();

export interface DependencyAnalysisResult {
  /** Map of test file path -> list of dependencies */
  dependencies: Map<string, string[]>;
  /** Map of test file path -> list of files that depend on it */
  dependents: Map<string, string[]>;
  /** Shared fixtures/helpers detected */
  sharedFixtures: string[];
  /** Time taken to analyze in ms */
  analysisTimeMs: number;
}

export interface TestFileWithHistory {
  path: string;
  /** Average duration from historical data (ms) */
  avgDuration?: number;
  /** Flakiness rate from historical data (0-1) */
  flakinessRate?: number;
  /** Last N execution times */
  recentDurations?: number[];
}

/**
 * Analyzes test file dependencies using AST parsing
 */
export class TestDependencyAnalyzer {
  private project: Project;
  private testDirectory: string;
  private cachedAnalysis: DependencyAnalysisResult | null = null;

  constructor(testDirectory: string = 'tests') {
    this.testDirectory = testDirectory;
    this.project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: false,
    });
  }

  /**
   * Analyze dependencies for all test files in the directory
   */
  public async analyzeTestDependencies(testFiles: string[]): Promise<DependencyAnalysisResult> {
    const startTime = performance.now();

    const dependencies = new Map<string, string[]>();
    const dependents = new Map<string, string[]>();
    const sharedFixtures = new Set<string>();

    // Add all test files to the project
    const sourceFiles: Map<string, SourceFile> = new Map();
    for (const testPath of testFiles) {
      try {
        const absolutePath = path.resolve(testPath);
        if (fs.existsSync(absolutePath)) {
          const sourceFile = this.project.addSourceFileAtPath(absolutePath);
          sourceFiles.set(testPath, sourceFile);
          dependencies.set(testPath, []);
          dependents.set(testPath, []);
        }
      } catch (error) {
        logger.warn(`Failed to parse test file: ${testPath}`, { error });
      }
    }

    // Analyze imports for each test file
    const testFileSet = new Set(testFiles);

    for (const [testPath, sourceFile] of sourceFiles) {
      const imports = this.extractImports(sourceFile, testPath);

      for (const importPath of imports) {
        // Check if this import is another test file
        if (testFileSet.has(importPath)) {
          // Direct test-to-test dependency
          dependencies.get(testPath)!.push(importPath);
          dependents.get(importPath)!.push(testPath);
        } else if (this.isSharedFixture(importPath)) {
          // Shared fixture/helper
          sharedFixtures.add(importPath);

          // Tests sharing the same fixture are implicitly related
          // Find other tests that import the same fixture
          for (const [otherPath, otherSource] of sourceFiles) {
            if (otherPath !== testPath) {
              const otherImports = this.extractImports(otherSource, otherPath);
              if (otherImports.includes(importPath)) {
                // Both tests depend on same fixture - weak coupling
                if (!dependencies.get(testPath)!.includes(otherPath)) {
                  dependencies.get(testPath)!.push(otherPath);
                }
              }
            }
          }
        }
      }
    }

    const result: DependencyAnalysisResult = {
      dependencies,
      dependents,
      sharedFixtures: Array.from(sharedFixtures),
      analysisTimeMs: performance.now() - startTime,
    };

    this.cachedAnalysis = result;

    logger.info('Test dependency analysis complete', {
      testCount: testFiles.length,
      totalDependencies: Array.from(dependencies.values()).reduce((sum, deps) => sum + deps.length, 0),
      sharedFixtures: sharedFixtures.size,
      analysisTimeMs: result.analysisTimeMs.toFixed(2),
    });

    return result;
  }

  /**
   * Extract all imports from a source file, resolving to relative paths
   */
  private extractImports(sourceFile: SourceFile, testPath: string): string[] {
    const imports: string[] = [];
    const testDir = path.dirname(testPath);

    for (const importDecl of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();

      // Skip node_modules imports
      if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
        continue;
      }

      // Resolve relative import to absolute path
      let resolvedPath = this.resolveImportPath(moduleSpecifier, testDir);
      if (resolvedPath) {
        imports.push(resolvedPath);
      }
    }

    // Also check for dynamic imports
    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expression = node.getExpression();
        if (Node.isIdentifier(expression) && expression.getText() === 'require') {
          const args = node.getArguments();
          if (args.length > 0 && Node.isStringLiteral(args[0])) {
            const moduleSpecifier = args[0].getLiteralValue();
            if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/')) {
              const resolvedPath = this.resolveImportPath(moduleSpecifier, testDir);
              if (resolvedPath) {
                imports.push(resolvedPath);
              }
            }
          }
        }
      }
    });

    return imports;
  }

  /**
   * Resolve an import path to a normalized file path
   */
  private resolveImportPath(moduleSpecifier: string, fromDir: string): string | null {
    // Handle .js extension in imports (ESM style)
    let cleanSpecifier = moduleSpecifier.replace(/\.js$/, '');

    // Try different extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
    const basePath = path.resolve(fromDir, cleanSpecifier);

    for (const ext of extensions) {
      const fullPath = basePath + ext;
      if (fs.existsSync(fullPath)) {
        // Return path relative to project root
        return path.relative(process.cwd(), fullPath);
      }

      // Also try index files
      const indexPath = path.join(basePath, `index${ext}`);
      if (fs.existsSync(indexPath)) {
        return path.relative(process.cwd(), indexPath);
      }
    }

    return null;
  }

  /**
   * Check if a path looks like a shared fixture/helper
   */
  private isSharedFixture(importPath: string): boolean {
    const lowerPath = importPath.toLowerCase();
    return (
      lowerPath.includes('fixture') ||
      lowerPath.includes('helper') ||
      lowerPath.includes('mock') ||
      lowerPath.includes('stub') ||
      lowerPath.includes('factory') ||
      lowerPath.includes('setup') ||
      lowerPath.includes('utils') ||
      lowerPath.includes('__mocks__')
    );
  }

  /**
   * Convert analysis result to TestFile array for partitioner
   */
  public toTestFiles(
    testPaths: string[],
    analysis: DependencyAnalysisResult,
    history?: Map<string, TestFileWithHistory>
  ): TestFile[] {
    return testPaths.map(testPath => {
      const historyData = history?.get(testPath);

      return {
        path: testPath,
        estimatedDuration: historyData?.avgDuration ?? this.estimateDuration(testPath),
        dependencies: analysis.dependencies.get(testPath) ?? [],
        dependents: analysis.dependents.get(testPath) ?? [],
        flakinessScore: historyData?.flakinessRate ?? 0,
        priority: this.inferPriority(testPath),
        tags: this.inferTags(testPath),
      };
    });
  }

  /**
   * Estimate test duration based on file size and complexity
   */
  private estimateDuration(testPath: string): number {
    try {
      const absolutePath = path.resolve(testPath);
      if (!fs.existsSync(absolutePath)) {
        return 100; // Default 100ms
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      const lines = content.split('\n').length;
      const testCount = (content.match(/\b(it|test)\s*\(/g) || []).length;
      const describeCount = (content.match(/\bdescribe\s*\(/g) || []).length;

      // Estimate: 50ms base + 20ms per test + 5ms per 100 lines
      return 50 + (testCount * 20) + (lines / 100 * 5);
    } catch {
      return 100;
    }
  }

  /**
   * Infer priority from file path
   */
  private inferPriority(testPath: string): 'low' | 'medium' | 'high' | 'critical' {
    const lowerPath = testPath.toLowerCase();

    if (lowerPath.includes('critical') || lowerPath.includes('smoke')) {
      return 'critical';
    }
    if (lowerPath.includes('integration') || lowerPath.includes('e2e')) {
      return 'high';
    }
    if (lowerPath.includes('unit')) {
      return 'medium';
    }
    return 'medium';
  }

  /**
   * Infer tags from file path
   */
  private inferTags(testPath: string): string[] {
    const tags: string[] = [];
    const pathParts = testPath.toLowerCase().split(/[/\\]/);

    // Extract directory names as tags
    for (const part of pathParts) {
      if (part === 'tests' || part === 'test' || part === '__tests__') continue;
      if (part.endsWith('.ts') || part.endsWith('.js')) continue;
      if (part.length > 0 && part.length < 30) {
        tags.push(part);
      }
    }

    // Add test type tags
    if (testPath.includes('unit')) tags.push('unit');
    if (testPath.includes('integration')) tags.push('integration');
    if (testPath.includes('e2e')) tags.push('e2e');

    return [...new Set(tags)]; // Dedupe
  }

  /**
   * Clear cached analysis
   */
  public clearCache(): void {
    this.cachedAnalysis = null;
    this.project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: false,
    });
  }
}
