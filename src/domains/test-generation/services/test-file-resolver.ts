/**
 * Test File Path Resolver (ADR-079)
 * Resolves correct test file output paths per language convention.
 */

import * as path from 'path';
import type { SupportedLanguage } from '../../../shared/types/test-frameworks.js';

/**
 * Test file placement strategy
 */
export type TestPlacementStrategy =
  | 'alongside'       // test file next to source (e.g., foo.test.ts)
  | 'tests-directory'  // tests/ mirror directory
  | 'maven-mirror'     // src/test/java mirror of src/main/java
  | 'test-project'     // separate test project (C#)
  | 'inline';          // tests inside source file (Rust)

/**
 * Test file convention for a language
 */
export interface TestFileConvention {
  strategy: TestPlacementStrategy;
  testPrefix: string;      // e.g., 'test_' for Python
  testSuffix: string;      // e.g., '.test' for TS, 'Test' for Java
  testExtension: string;   // e.g., '.ts', '.java'
  testDirectory?: string;  // e.g., 'tests', 'src/test/java'
}

/**
 * Per-language test file conventions
 */
export const TEST_FILE_CONVENTIONS: Record<SupportedLanguage, TestFileConvention> = {
  typescript: {
    strategy: 'alongside',
    testPrefix: '',
    testSuffix: '.test',
    testExtension: '.ts',
  },
  javascript: {
    strategy: 'alongside',
    testPrefix: '',
    testSuffix: '.test',
    testExtension: '.js',
  },
  python: {
    strategy: 'tests-directory',
    testPrefix: 'test_',
    testSuffix: '',
    testExtension: '.py',
    testDirectory: 'tests',
  },
  java: {
    strategy: 'maven-mirror',
    testPrefix: '',
    testSuffix: 'Test',
    testExtension: '.java',
    testDirectory: 'src/test/java',
  },
  csharp: {
    strategy: 'test-project',
    testPrefix: '',
    testSuffix: 'Tests',
    testExtension: '.cs',
    testDirectory: 'tests',
  },
  go: {
    strategy: 'alongside',
    testPrefix: '',
    testSuffix: '_test',
    testExtension: '.go',
  },
  rust: {
    strategy: 'inline',
    testPrefix: '',
    testSuffix: '',
    testExtension: '.rs',
  },
  swift: {
    strategy: 'tests-directory',
    testPrefix: '',
    testSuffix: 'Tests',
    testExtension: '.swift',
    testDirectory: 'Tests',
  },
  kotlin: {
    strategy: 'maven-mirror',
    testPrefix: '',
    testSuffix: 'Test',
    testExtension: '.kt',
    testDirectory: 'src/test/kotlin',
  },
  dart: {
    strategy: 'tests-directory',
    testPrefix: '',
    testSuffix: '_test',
    testExtension: '.dart',
    testDirectory: 'test',
  },
};

/**
 * Resolve the test file path for a given source file
 */
export function resolveTestFilePath(
  sourceFile: string,
  language: SupportedLanguage,
  projectRoot?: string
): string {
  const convention = TEST_FILE_CONVENTIONS[language];
  const parsed = path.parse(sourceFile);
  const baseName = parsed.name;
  const dir = parsed.dir;

  switch (convention.strategy) {
    case 'alongside': {
      // Test file next to source: foo.ts -> foo.test.ts, foo.go -> foo_test.go
      const testName = `${convention.testPrefix}${baseName}${convention.testSuffix}${convention.testExtension}`;
      return path.join(dir, testName);
    }

    case 'tests-directory': {
      // Mirror in tests/ directory: src/utils.py -> tests/test_utils.py
      const testDir = convention.testDirectory || 'tests';
      const root = projectRoot || '.';

      // Try to make path relative to project root
      let relativePath: string;
      try {
        relativePath = path.relative(root, dir);
      } catch {
        relativePath = dir;
      }

      // Remove common source directories from relative path
      const cleanPath = relativePath
        .replace(/^src[\/\\]?/, '')
        .replace(/^lib[\/\\]?/, '')
        .replace(/^Sources[\/\\]?/, '');

      const testName = `${convention.testPrefix}${baseName}${convention.testSuffix}${convention.testExtension}`;
      return path.join(root, testDir, cleanPath, testName);
    }

    case 'maven-mirror': {
      // Maven convention: src/main/java/com/foo/Bar.java -> src/test/java/com/foo/BarTest.java
      const root = projectRoot || '.';
      const testDir = convention.testDirectory || 'src/test/java';

      let relativePath: string;
      try {
        relativePath = path.relative(root, sourceFile);
      } catch {
        relativePath = sourceFile;
      }

      // Replace src/main/java with src/test/java (or src/main/kotlin with src/test/kotlin)
      const testPath = relativePath
        .replace(/^src[\/\\]main[\/\\]java[\/\\]?/, `${testDir}${path.sep}`)
        .replace(/^src[\/\\]main[\/\\]kotlin[\/\\]?/, `${testDir}${path.sep}`);

      const testParsed = path.parse(testPath);
      const testName = `${convention.testPrefix}${testParsed.name}${convention.testSuffix}${convention.testExtension}`;
      return path.join(root, testParsed.dir, testName);
    }

    case 'test-project': {
      // Separate test project: src/MyApp/User.cs -> tests/MyApp.Tests/UserTests.cs
      const root = projectRoot || '.';
      const testDir = convention.testDirectory || 'tests';

      let relativePath: string;
      try {
        relativePath = path.relative(root, dir);
      } catch {
        relativePath = dir;
      }

      const cleanPath = relativePath.replace(/^src[\/\\]?/, '');
      const testName = `${convention.testPrefix}${baseName}${convention.testSuffix}${convention.testExtension}`;
      return path.join(root, testDir, cleanPath, testName);
    }

    case 'inline': {
      // Rust: tests go inside the source file itself
      return sourceFile;
    }

    default:
      return path.join(dir, `${baseName}.test${parsed.ext}`);
  }
}

/**
 * Get the test file convention for a language
 */
export function getTestFileConvention(language: SupportedLanguage): TestFileConvention {
  return TEST_FILE_CONVENTIONS[language];
}
