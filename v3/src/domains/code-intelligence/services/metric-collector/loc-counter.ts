/**
 * Agentic QE v3 - LOC Counter
 *
 * Counts lines of code using actual tooling (cloc, tokei) with fallback.
 * Part of RM-002 implementation for real metric measurement.
 *
 * Tool priority:
 * 1. cloc - Most accurate, widely available
 * 2. tokei - Faster, Rust-based alternative
 * 3. fallback - Manual counting when tools unavailable
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 5, RM-002
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import {
  LOCMetrics,
  LOCSource,
  ToolAvailability,
  MetricCollectorConfig,
  DEFAULT_METRIC_CONFIG,
} from './interfaces.js';

// ============================================================================
// Main LOC Counting Function
// ============================================================================

/**
 * Count lines of code using available tooling
 * Tries cloc first, then tokei, then falls back to manual counting.
 *
 * @param projectPath - Absolute path to project root
 * @param config - Optional configuration overrides
 * @returns LOCMetrics with accurate counts
 */
export async function countLOC(
  projectPath: string,
  config: Partial<MetricCollectorConfig> = {}
): Promise<LOCMetrics> {
  const mergedConfig = { ...DEFAULT_METRIC_CONFIG, ...config };

  // Try cloc first (most accurate)
  const clocResult = await tryClocCount(projectPath, mergedConfig);
  if (clocResult) {
    return clocResult;
  }

  // Try tokei (faster, Rust-based)
  const tokeiResult = await tryTokeiCount(projectPath, mergedConfig);
  if (tokeiResult) {
    return tokeiResult;
  }

  // Fallback to manual counting
  return manualLOCCount(projectPath, mergedConfig);
}

/**
 * Check which LOC counting tools are available
 */
export function checkLOCTools(): ToolAvailability[] {
  const tools: ToolAvailability[] = [];

  // Check cloc
  try {
    const result = spawnSync('cloc', ['--version'], { encoding: 'utf-8', timeout: 5000 });
    if (result.status === 0) {
      const version = result.stdout.trim().split('\n')[0];
      tools.push({ name: 'cloc', available: true, version });
    } else {
      tools.push({ name: 'cloc', available: false });
    }
  } catch {
    tools.push({ name: 'cloc', available: false });
  }

  // Check tokei
  try {
    const result = spawnSync('tokei', ['--version'], { encoding: 'utf-8', timeout: 5000 });
    if (result.status === 0) {
      const version = result.stdout.trim();
      tools.push({ name: 'tokei', available: true, version });
    } else {
      tools.push({ name: 'tokei', available: false });
    }
  } catch {
    tools.push({ name: 'tokei', available: false });
  }

  return tools;
}

// ============================================================================
// Tool-Specific Implementations
// ============================================================================

/**
 * Try counting with cloc
 */
async function tryClocCount(
  projectPath: string,
  config: MetricCollectorConfig
): Promise<LOCMetrics | null> {
  try {
    const excludeDirs = config.excludeDirs.join(',');
    const command = `cloc --json --exclude-dir=${excludeDirs} "${projectPath}"`;

    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: config.timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer (reduced for memory safety)
    });

    return parseClocOutput(output, config.excludeDirs);
  } catch {
    // cloc not available or failed
    return null;
  }
}

/**
 * Parse cloc JSON output into LOCMetrics
 */
function parseClocOutput(output: string, excludedDirs: string[]): LOCMetrics {
  const data = JSON.parse(output);
  const byLanguage: Record<string, number> = {};
  let total = 0;

  for (const [lang, stats] of Object.entries(data)) {
    // Skip metadata entries
    if (lang === 'header' || lang === 'SUM') {
      continue;
    }

    const langStats = stats as {
      nFiles: number;
      blank: number;
      comment: number;
      code: number;
    };

    // Only count code lines (not blanks or comments)
    byLanguage[lang] = langStats.code;
    total += langStats.code;
  }

  return {
    total,
    byLanguage,
    source: 'cloc',
    excludedDirs,
  };
}

/**
 * Try counting with tokei
 */
async function tryTokeiCount(
  projectPath: string,
  config: MetricCollectorConfig
): Promise<LOCMetrics | null> {
  try {
    // tokei uses -e for exclude patterns
    const excludeArgs = config.excludeDirs.map(dir => `-e "${dir}"`).join(' ');
    const command = `tokei --output json ${excludeArgs} "${projectPath}"`;

    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: config.timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer (reduced for memory safety)
    });

    return parseTokeiOutput(output, config.excludeDirs);
  } catch {
    // tokei not available or failed
    return null;
  }
}

/**
 * Parse tokei JSON output into LOCMetrics
 *
 * Tokei output format:
 * {
 *   "TypeScript": {
 *     "blanks": 100,
 *     "code": 5000,
 *     "comments": 200,
 *     "reports": [...]
 *   },
 *   ...
 * }
 */
function parseTokeiOutput(output: string, excludedDirs: string[]): LOCMetrics {
  const data = JSON.parse(output);
  const byLanguage: Record<string, number> = {};
  let total = 0;

  for (const [lang, stats] of Object.entries(data)) {
    // Skip Total entry if present
    if (lang === 'Total') {
      continue;
    }

    const langStats = stats as {
      blanks: number;
      code: number;
      comments: number;
      reports: unknown[];
    };

    // Only count code lines
    byLanguage[lang] = langStats.code;
    total += langStats.code;
  }

  return {
    total,
    byLanguage,
    source: 'tokei',
    excludedDirs,
  };
}

// ============================================================================
// Fallback Manual Counting
// ============================================================================

/**
 * Language extensions for fallback counting
 */
const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  TypeScript: ['.ts', '.tsx'],
  JavaScript: ['.js', '.jsx', '.mjs', '.cjs'],
  Python: ['.py', '.pyw'],
  Rust: ['.rs'],
  Go: ['.go'],
  Java: ['.java'],
  'C#': ['.cs'],
  C: ['.c', '.h'],
  'C++': ['.cpp', '.hpp', '.cc', '.cxx'],
  Ruby: ['.rb'],
  PHP: ['.php'],
  Swift: ['.swift'],
  Kotlin: ['.kt', '.kts'],
  Scala: ['.scala'],
  Shell: ['.sh', '.bash', '.zsh'],
  SQL: ['.sql'],
  HTML: ['.html', '.htm'],
  CSS: ['.css', '.scss', '.sass', '.less'],
  JSON: ['.json'],
  YAML: ['.yaml', '.yml'],
  Markdown: ['.md', '.markdown'],
  XML: ['.xml'],
};

/**
 * Map extension to language name
 */
function getLanguageForExtension(ext: string): string | null {
  for (const [lang, extensions] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (extensions.includes(ext.toLowerCase())) {
      return lang;
    }
  }
  return null;
}

/**
 * Manual line counting fallback
 */
function manualLOCCount(
  projectPath: string,
  config: MetricCollectorConfig
): LOCMetrics {
  const byLanguage: Record<string, number> = {};
  let total = 0;

  function walkDirectory(dirPath: string): void {
    if (!existsSync(dirPath)) {
      return;
    }

    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (config.excludeDirs.includes(entry.name)) {
          continue;
        }
        walkDirectory(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        const language = getLanguageForExtension(ext);

        if (language) {
          const lines = countFileLines(fullPath);
          byLanguage[language] = (byLanguage[language] || 0) + lines;
          total += lines;
        }
      }
    }
  }

  walkDirectory(projectPath);

  return {
    total,
    byLanguage,
    source: 'fallback',
    excludedDirs: config.excludeDirs,
  };
}

/**
 * Count code lines in a single file (excluding blanks and comments)
 */
function countFileLines(filePath: string): number {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const ext = extname(filePath).toLowerCase();

    let codeLines = 0;
    let inBlockComment = false;

    // Determine comment patterns based on file type
    const lineCommentPatterns = getLineCommentPatterns(ext);
    const blockCommentStart = getBlockCommentStart(ext);
    const blockCommentEnd = getBlockCommentEnd(ext);

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip blank lines
      if (trimmed === '') {
        continue;
      }

      // Handle block comments
      if (blockCommentStart && inBlockComment) {
        if (blockCommentEnd && trimmed.includes(blockCommentEnd)) {
          inBlockComment = false;
        }
        continue;
      }

      // Check for block comment start
      if (blockCommentStart && trimmed.startsWith(blockCommentStart)) {
        if (blockCommentEnd && !trimmed.includes(blockCommentEnd)) {
          inBlockComment = true;
        }
        continue;
      }

      // Check for line comments
      let isComment = false;
      for (const pattern of lineCommentPatterns) {
        if (trimmed.startsWith(pattern)) {
          isComment = true;
          break;
        }
      }

      if (!isComment) {
        codeLines++;
      }
    }

    return codeLines;
  } catch {
    return 0;
  }
}

/**
 * Get line comment patterns for a file extension
 */
function getLineCommentPatterns(ext: string): string[] {
  switch (ext) {
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
    case '.java':
    case '.c':
    case '.h':
    case '.cpp':
    case '.hpp':
    case '.cc':
    case '.cxx':
    case '.cs':
    case '.go':
    case '.rs':
    case '.swift':
    case '.kt':
    case '.kts':
    case '.scala':
    case '.php':
      return ['//', '/*'];
    case '.py':
    case '.pyw':
    case '.rb':
    case '.sh':
    case '.bash':
    case '.zsh':
    case '.yaml':
    case '.yml':
      return ['#'];
    case '.sql':
      return ['--', '/*'];
    case '.html':
    case '.htm':
    case '.xml':
      return ['<!--'];
    case '.css':
    case '.scss':
    case '.sass':
    case '.less':
      return ['/*'];
    default:
      return ['//'];
  }
}

/**
 * Get block comment start pattern
 */
function getBlockCommentStart(ext: string): string | null {
  switch (ext) {
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
    case '.java':
    case '.c':
    case '.h':
    case '.cpp':
    case '.hpp':
    case '.cc':
    case '.cxx':
    case '.cs':
    case '.go':
    case '.rs':
    case '.swift':
    case '.kt':
    case '.kts':
    case '.scala':
    case '.php':
    case '.css':
    case '.scss':
    case '.sass':
    case '.less':
    case '.sql':
      return '/*';
    case '.py':
    case '.pyw':
      return '"""';
    case '.html':
    case '.htm':
    case '.xml':
      return '<!--';
    default:
      return null;
  }
}

/**
 * Get block comment end pattern
 */
function getBlockCommentEnd(ext: string): string | null {
  switch (ext) {
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
    case '.java':
    case '.c':
    case '.h':
    case '.cpp':
    case '.hpp':
    case '.cc':
    case '.cxx':
    case '.cs':
    case '.go':
    case '.rs':
    case '.swift':
    case '.kt':
    case '.kts':
    case '.scala':
    case '.php':
    case '.css':
    case '.scss':
    case '.sass':
    case '.less':
    case '.sql':
      return '*/';
    case '.py':
    case '.pyw':
      return '"""';
    case '.html':
    case '.htm':
    case '.xml':
      return '-->';
    default:
      return null;
  }
}
