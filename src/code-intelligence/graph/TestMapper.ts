/**
 * Test Mapper
 *
 * Maps test files to their corresponding source files
 * to build the TESTS relationship in the graph.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface TestMapping {
  /** Path to the test file */
  testFile: string;

  /** Path to the source file being tested */
  sourceFile: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** How the mapping was determined */
  matchType: 'naming' | 'import' | 'proximity' | 'content';
}

export interface TestMapperConfig {
  /**
   * Root directory to scan.
   */
  rootDir: string;

  /**
   * Test file patterns.
   */
  testPatterns: string[];

  /**
   * Test directory names.
   */
  testDirs: string[];

  /**
   * Source directory names.
   */
  sourceDirs: string[];

  /**
   * File extensions to consider.
   */
  extensions: string[];

  /**
   * Directories to exclude.
   */
  excludeDirs: string[];
}

export const DEFAULT_TEST_MAPPER_CONFIG: TestMapperConfig = {
  rootDir: '.',
  testPatterns: [
    '.test.', '.spec.', '_test.', '_spec.',
    '.test-', '.spec-', 'test_', 'spec_',
  ],
  testDirs: ['tests', 'test', '__tests__', 'spec', 'specs'],
  sourceDirs: ['src', 'lib', 'source'],
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'],
  excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage'],
};

export class TestMapper {
  private config: TestMapperConfig;
  private testFiles: string[] = [];
  private sourceFiles: string[] = [];

  constructor(rootDir: string, config: Partial<TestMapperConfig> = {}) {
    this.config = {
      ...DEFAULT_TEST_MAPPER_CONFIG,
      ...config,
      rootDir,
    };
  }

  /**
   * Scan project and map test files to source files.
   */
  async mapTestFiles(): Promise<TestMapping[]> {
    // Scan for all files
    await this.scanDirectory(this.config.rootDir);

    const mappings: TestMapping[] = [];

    for (const testFile of this.testFiles) {
      const mapping = await this.findSourceForTest(testFile);
      if (mapping) {
        mappings.push(mapping);
      }
    }

    return mappings;
  }

  /**
   * Check if a file is a test file.
   */
  isTestFile(filePath: string): boolean {
    const fileName = path.basename(filePath);
    const dirPath = path.dirname(filePath);

    // Check if in test directory
    for (const testDir of this.config.testDirs) {
      // Check if test dir appears in path (with separators on both sides)
      if (dirPath.includes(`/${testDir}/`) || dirPath.includes(`\\${testDir}\\`)) {
        return true;
      }
      // Check if path ends with test directory (e.g., /tests or \tests)
      if (dirPath.endsWith(`/${testDir}`) || dirPath.endsWith(`\\${testDir}`)) {
        return true;
      }
      // Check if path starts with test directory (e.g., /tests/... or tests/...)
      if (dirPath === `/${testDir}` || dirPath === testDir) {
        return true;
      }
    }

    // Check filename patterns
    for (const pattern of this.config.testPatterns) {
      if (fileName.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the source file name from a test file name.
   */
  getSourceFileName(testFileName: string): string {
    let result = testFileName;

    // Remove test patterns from filename
    for (const pattern of this.config.testPatterns) {
      result = result.replace(pattern, '.');
    }

    // Clean up double dots
    result = result.replace(/\.+/g, '.');

    return result;
  }

  /**
   * Find the source file for a given test file.
   */
  private async findSourceForTest(testFile: string): Promise<TestMapping | null> {
    const testFileName = path.basename(testFile);
    const testDir = path.dirname(testFile);
    const expectedSourceName = this.getSourceFileName(testFileName);

    // Strategy 1: Naming convention (highest confidence)
    const namingMatch = await this.findByNaming(testDir, expectedSourceName);
    if (namingMatch) {
      return {
        testFile,
        sourceFile: namingMatch,
        confidence: 0.95,
        matchType: 'naming',
      };
    }

    // Strategy 2: Mirror directory structure
    const mirrorMatch = await this.findByMirrorStructure(testFile, expectedSourceName);
    if (mirrorMatch) {
      return {
        testFile,
        sourceFile: mirrorMatch,
        confidence: 0.85,
        matchType: 'proximity',
      };
    }

    // Strategy 3: Import analysis
    const importMatch = await this.findByImports(testFile);
    if (importMatch) {
      return {
        testFile,
        sourceFile: importMatch,
        confidence: 0.80,
        matchType: 'import',
      };
    }

    // Strategy 4: Content similarity (subject mentions)
    const contentMatch = await this.findByContent(testFile, expectedSourceName);
    if (contentMatch) {
      return {
        testFile,
        sourceFile: contentMatch,
        confidence: 0.60,
        matchType: 'content',
      };
    }

    return null;
  }

  /**
   * Find source file by naming convention.
   */
  private async findByNaming(
    testDir: string,
    expectedSourceName: string
  ): Promise<string | null> {
    // Check same directory (for co-located tests)
    for (const sourceFile of this.sourceFiles) {
      if (path.basename(sourceFile) === expectedSourceName) {
        // Prefer files in same directory or parent
        const sourceDir = path.dirname(sourceFile);
        if (testDir === sourceDir || testDir.startsWith(sourceDir)) {
          return sourceFile;
        }
      }
    }

    return null;
  }

  /**
   * Find source file by mirror directory structure.
   * E.g., tests/utils/helper.test.ts → src/utils/helper.ts
   */
  private async findByMirrorStructure(
    testFile: string,
    expectedSourceName: string
  ): Promise<string | null> {
    const relativePath = path.relative(this.config.rootDir, testFile);
    const parts = relativePath.split(path.sep);

    // Find test directory in path
    let testDirIndex = -1;
    for (let i = 0; i < parts.length; i++) {
      if (this.config.testDirs.includes(parts[i])) {
        testDirIndex = i;
        break;
      }
    }

    if (testDirIndex === -1) return null;

    // Try each source directory
    for (const sourceDir of this.config.sourceDirs) {
      const newParts = [...parts];
      newParts[testDirIndex] = sourceDir;
      newParts[newParts.length - 1] = expectedSourceName;

      const candidatePath = path.join(this.config.rootDir, ...newParts);

      if (this.sourceFiles.includes(candidatePath)) {
        return candidatePath;
      }
    }

    return null;
  }

  /**
   * Find source file by analyzing imports in the test file.
   */
  private async findByImports(testFile: string): Promise<string | null> {
    try {
      const content = await fs.readFile(testFile, 'utf-8');

      // Look for relative imports
      const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
      let match: RegExpExecArray | null;

      const candidates: string[] = [];

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        const testDir = path.dirname(testFile);
        const resolvedPath = path.resolve(testDir, importPath);

        // Try with extensions
        for (const ext of this.config.extensions) {
          const withExt = resolvedPath + ext;
          if (this.sourceFiles.includes(withExt)) {
            candidates.push(withExt);
          }
        }

        // Try index file
        for (const ext of this.config.extensions) {
          const indexPath = path.join(resolvedPath, `index${ext}`);
          if (this.sourceFiles.includes(indexPath)) {
            candidates.push(indexPath);
          }
        }
      }

      // Return the first non-test import (most likely the subject under test)
      for (const candidate of candidates) {
        if (!this.isTestFile(candidate)) {
          return candidate;
        }
      }
    } catch {
      // File read error - skip
    }

    return null;
  }

  /**
   * Find source file by content similarity.
   */
  private async findByContent(
    testFile: string,
    expectedSourceName: string
  ): Promise<string | null> {
    try {
      const content = await fs.readFile(testFile, 'utf-8');

      // Extract potential class/function names being tested
      const describePattern = /describe\s*\(\s*['"]([^'"]+)['"]/g;
      const testPattern = /it\s*\(\s*['"](?:should\s+)?([^'"]+)['"]/g;

      const subjectNames: string[] = [];

      let match: RegExpExecArray | null;
      while ((match = describePattern.exec(content)) !== null) {
        subjectNames.push(match[1]);
      }

      // Find source files that match the described subjects
      for (const sourceFile of this.sourceFiles) {
        const sourceName = path.basename(sourceFile).replace(/\.[^.]+$/, '');

        for (const subject of subjectNames) {
          if (subject.toLowerCase().includes(sourceName.toLowerCase()) ||
              sourceName.toLowerCase().includes(subject.toLowerCase())) {
            return sourceFile;
          }
        }
      }
    } catch {
      // File read error - skip
    }

    return null;
  }

  /**
   * Scan directory for test and source files.
   */
  private async scanDirectory(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (!this.config.excludeDirs.includes(entry.name)) {
          await this.scanDirectory(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (this.config.extensions.includes(ext)) {
          if (this.isTestFile(fullPath)) {
            this.testFiles.push(fullPath);
          } else {
            this.sourceFiles.push(fullPath);
          }
        }
      }
    }
  }

  /**
   * Get all detected test files.
   */
  getTestFiles(): string[] {
    return [...this.testFiles];
  }

  /**
   * Get all detected source files.
   */
  getSourceFiles(): string[] {
    return [...this.sourceFiles];
  }

  /**
   * Clear cached file lists.
   */
  clear(): void {
    this.testFiles = [];
    this.sourceFiles = [];
  }
}
