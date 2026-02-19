/**
 * Agentic QE v3 - CLI File Discovery Utility
 *
 * Shared file discovery for all CLI commands.
 * Supports 12+ programming languages and configurable recursion.
 *
 * Fixes #280: CLI commands previously only found .ts files.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

// ============================================================================
// Source File Extensions by Language
// ============================================================================

const SOURCE_EXTENSIONS = new Set([
  // JavaScript / TypeScript
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  // Python
  '.py', '.pyw',
  // Go
  '.go',
  // Rust
  '.rs',
  // Java / Kotlin
  '.java', '.kt', '.kts',
  // Ruby
  '.rb',
  // C#
  '.cs',
  // PHP
  '.php',
  // Swift
  '.swift',
  // C / C++
  '.c', '.h', '.cpp', '.hpp', '.cc',
  // Scala
  '.scala',
]);

const TEST_PATTERNS = ['.test.', '.spec.', '_test.', '_spec.'];

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'coverage', '.git',
  '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache',
  'target', '.gradle', 'vendor', '.bundle',
  '.next', '.nuxt', '.output',
]);

// ============================================================================
// Public API
// ============================================================================

export interface WalkOptions {
  /** Maximum directory depth (default: 6) */
  maxDepth?: number;
  /** Include test files (default: false for source, true for test discovery) */
  includeTests?: boolean;
  /** Only include test files (for test execution discovery) */
  testsOnly?: boolean;
  /** Additional extensions to include */
  extraExtensions?: string[];
}

/**
 * Walk a directory and discover source files across all supported languages.
 *
 * @param targetPath - Absolute path to file or directory
 * @param options - Walk configuration
 * @returns Array of absolute file paths
 */
export function walkSourceFiles(targetPath: string, options: WalkOptions = {}): string[] {
  const {
    maxDepth = 6,
    includeTests = false,
    testsOnly = false,
    extraExtensions = [],
  } = options;

  if (!existsSync(targetPath)) {
    return [];
  }

  const stat = statSync(targetPath);
  if (stat.isFile()) {
    return [targetPath];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  const extraSet = new Set(extraExtensions.map(e => e.startsWith('.') ? e : `.${e}`));
  const result: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Skip unreadable directories
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        const isSourceExt = SOURCE_EXTENSIONS.has(ext) || extraSet.has(ext);
        if (!isSourceExt) continue;

        // Skip declaration files
        if (entry.name.endsWith('.d.ts')) continue;

        const isTestFile = TEST_PATTERNS.some(p => entry.name.includes(p))
          || entry.name.startsWith('test_');

        if (testsOnly) {
          if (isTestFile) result.push(join(dir, entry.name));
        } else if (includeTests || !isTestFile) {
          result.push(join(dir, entry.name));
        }
      }
    }
  }

  walk(targetPath, 0);
  return result;
}
