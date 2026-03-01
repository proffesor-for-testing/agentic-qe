/**
 * Shared utility functions used by extracted task handlers.
 *
 * These were originally module-level helpers in task-executor.ts and are
 * now co-located with the handlers that use them.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { safeJsonParse } from '../../shared/safe-json.js';
import type { CoverageData, FileCoverage } from '../../domains/coverage-analysis';

// ============================================================================
// Istanbul Coverage JSON Types
// ============================================================================

/**
 * Istanbul/nyc coverage-final.json file data structure
 * Each file in the coverage report has this structure
 */
export interface IstanbulFileCoverage {
  /** Statement map - keyed by statement ID */
  statementMap: Record<string, {
    start: { line: number; column: number };
    end: { line: number; column: number };
  }>;
  /** Statement execution counts - keyed by statement ID */
  s: Record<string, number>;
  /** Branch map - keyed by branch ID */
  branchMap: Record<string, {
    type: string;
    line: number;
    locations: Array<{
      start: { line: number; column: number };
      end: { line: number; column: number };
    }>;
  }>;
  /** Branch execution counts - array of counts per branch */
  b: Record<string, number[]>;
  /** Function map - keyed by function ID */
  fnMap: Record<string, {
    name: string;
    decl: { start: { line: number; column: number }; end: { line: number; column: number } };
    loc: { start: { line: number; column: number }; end: { line: number; column: number } };
    line: number;
  }>;
  /** Function execution counts - keyed by function ID */
  f: Record<string, number>;
  /** Path to the file */
  path: string;
}

// ============================================================================
// Coverage Data Loaders
// ============================================================================

/**
 * Load coverage data from common coverage file formats
 */
export async function loadCoverageData(targetPath: string): Promise<CoverageData | null> {
  // Try various coverage file locations (JS, Python, Java, etc.)
  const coverageLocations = [
    // JavaScript/TypeScript (Istanbul/nyc/vitest)
    path.join(targetPath, 'coverage', 'coverage-final.json'),
    path.join(targetPath, 'coverage', 'lcov.info'),
    path.join(targetPath, '.nyc_output', 'coverage-final.json'),
    path.join(targetPath, 'coverage-final.json'),
    // Python (pytest-cov, coverage.py)
    path.join(targetPath, 'coverage.xml'),
    path.join(targetPath, 'htmlcov', 'status.json'),
    // Cobertura (generic)
    path.join(targetPath, 'cobertura-coverage.xml'),
  ];

  for (const coveragePath of coverageLocations) {
    try {
      const content = await fs.readFile(coveragePath, 'utf-8');

      if (coveragePath.endsWith('.json')) {
        return parseCoverageJson(content);
      } else if (coveragePath.endsWith('.info')) {
        return parseLcovInfo(content);
      } else if (coveragePath.endsWith('.xml')) {
        return parseCoberturaXml(content);
      }
    } catch {
      // File not found, try next
    }
  }

  return null;
}

/**
 * Parse Istanbul/nyc coverage-final.json format
 */
export function parseCoverageJson(content: string): CoverageData {
  const data: Record<string, IstanbulFileCoverage> = safeJsonParse(content);
  const files: FileCoverage[] = [];
  let totalLines = 0, coveredLines = 0;
  let totalBranches = 0, coveredBranches = 0;
  let totalFunctions = 0, coveredFunctions = 0;
  let totalStatements = 0, coveredStatements = 0;

  for (const [filePath, fileData] of Object.entries(data)) {
    const fd = fileData;

    // Calculate file-level metrics
    const lineMap = fd.statementMap || {};
    const lineCounts = fd.s || {};
    const branchMap = fd.branchMap || {};
    const branchCounts = fd.b || {};
    const fnCounts = fd.f || {};

    const fileLines = Object.keys(lineCounts).length;
    const fileCoveredLines = Object.values(lineCounts).filter((v) => v > 0).length;
    const fileBranches = Object.values(branchCounts).flat().length;
    const fileCoveredBranches = Object.values(branchCounts).flat().filter((v) => v > 0).length;
    const fileFunctions = Object.keys(fnCounts).length;
    const fileCoveredFunctions = Object.values(fnCounts).filter((v) => v > 0).length;
    const fileStatements = Object.keys(lineMap).length;
    const fileCoveredStatements = Object.values(lineCounts).filter((v) => v > 0).length;

    // Find uncovered lines
    const uncoveredLines: number[] = [];
    for (const [key, count] of Object.entries(lineCounts)) {
      if (count === 0) {
        const stmtInfo = lineMap[key];
        if (stmtInfo?.start?.line) {
          uncoveredLines.push(stmtInfo.start.line);
        }
      }
    }

    // Find uncovered branches
    const uncoveredBranches: number[] = [];
    for (const [branchId, counts] of Object.entries(branchCounts)) {
      const branchInfo = branchMap[branchId];
      counts.forEach((count, idx) => {
        if (count === 0 && branchInfo?.locations?.[idx]?.start?.line) {
          uncoveredBranches.push(branchInfo.locations[idx].start.line);
        }
      });
    }

    files.push({
      path: filePath,
      lines: { covered: fileCoveredLines, total: fileLines },
      branches: { covered: fileCoveredBranches, total: fileBranches },
      functions: { covered: fileCoveredFunctions, total: fileFunctions },
      statements: { covered: fileCoveredStatements, total: fileStatements },
      uncoveredLines: Array.from(new Set(uncoveredLines)).sort((a, b) => a - b),
      uncoveredBranches: Array.from(new Set(uncoveredBranches)).sort((a, b) => a - b),
    });

    totalLines += fileLines;
    coveredLines += fileCoveredLines;
    totalBranches += fileBranches;
    coveredBranches += fileCoveredBranches;
    totalFunctions += fileFunctions;
    coveredFunctions += fileCoveredFunctions;
    totalStatements += fileStatements;
    coveredStatements += fileCoveredStatements;
  }

  return {
    files,
    summary: {
      line: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
      branch: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0,
      function: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0,
      statement: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
      files: files.length,
    },
  };
}

/**
 * Parse LCOV info format
 */
export function parseLcovInfo(content: string): CoverageData {
  const files: FileCoverage[] = [];
  const lines = content.split('\n');

  let currentFile: string | null = null;
  let linesTotal = 0, linesCovered = 0;
  let branchesTotal = 0, branchesCovered = 0;
  let functionsTotal = 0, functionsCovered = 0;
  const uncoveredLines: number[] = [];
  const uncoveredBranches: number[] = [];

  for (const line of lines) {
    if (line.startsWith('SF:')) {
      currentFile = line.slice(3);
    } else if (line.startsWith('LF:')) {
      linesTotal = parseInt(line.slice(3), 10);
    } else if (line.startsWith('LH:')) {
      linesCovered = parseInt(line.slice(3), 10);
    } else if (line.startsWith('BRF:')) {
      branchesTotal = parseInt(line.slice(4), 10);
    } else if (line.startsWith('BRH:')) {
      branchesCovered = parseInt(line.slice(4), 10);
    } else if (line.startsWith('FNF:')) {
      functionsTotal = parseInt(line.slice(4), 10);
    } else if (line.startsWith('FNH:')) {
      functionsCovered = parseInt(line.slice(4), 10);
    } else if (line.startsWith('DA:')) {
      const [lineNum, count] = line.slice(3).split(',').map(s => parseInt(s, 10));
      if (count === 0) {
        uncoveredLines.push(lineNum);
      }
    } else if (line.startsWith('BRDA:')) {
      const parts = line.slice(5).split(',');
      const lineNum = parseInt(parts[0], 10);
      const taken = parts[3];
      if (taken === '0' || taken === '-') {
        uncoveredBranches.push(lineNum);
      }
    } else if (line === 'end_of_record' && currentFile) {
      files.push({
        path: currentFile,
        lines: { covered: linesCovered, total: linesTotal },
        branches: { covered: branchesCovered, total: branchesTotal },
        functions: { covered: functionsCovered, total: functionsTotal },
        statements: { covered: linesCovered, total: linesTotal },
        uncoveredLines: Array.from(new Set(uncoveredLines)),
        uncoveredBranches: Array.from(new Set(uncoveredBranches)),
      });

      // Reset for next file
      currentFile = null;
      linesTotal = linesCovered = 0;
      branchesTotal = branchesCovered = 0;
      functionsTotal = functionsCovered = 0;
      uncoveredLines.length = 0;
      uncoveredBranches.length = 0;
    }
  }

  // Calculate summary
  let totalLines = 0, totalCoveredLines = 0;
  let totalBranches = 0, totalCoveredBranches = 0;
  let totalFunctions = 0, totalCoveredFunctions = 0;

  for (const file of files) {
    totalLines += file.lines.total;
    totalCoveredLines += file.lines.covered;
    totalBranches += file.branches.total;
    totalCoveredBranches += file.branches.covered;
    totalFunctions += file.functions.total;
    totalCoveredFunctions += file.functions.covered;
  }

  return {
    files,
    summary: {
      line: totalLines > 0 ? (totalCoveredLines / totalLines) * 100 : 0,
      branch: totalBranches > 0 ? (totalCoveredBranches / totalBranches) * 100 : 0,
      function: totalFunctions > 0 ? (totalCoveredFunctions / totalFunctions) * 100 : 0,
      statement: totalLines > 0 ? (totalCoveredLines / totalLines) * 100 : 0,
      files: files.length,
    },
  };
}

/**
 * Parse Cobertura XML format (Python coverage.py, Java JaCoCo, etc.)
 * Handles both coverage.xml and cobertura-coverage.xml formats.
 * Uses attribute-order-independent extraction to handle output from
 * different tools (coverage.py, JaCoCo, Cobertura) that order attributes differently.
 */
export function parseCoberturaXml(content: string): CoverageData {
  const files: FileCoverage[] = [];

  // Helper: extract a named attribute from an XML element string, order-independent
  function attr(element: string, name: string): string | null {
    const match = element.match(new RegExp(`${name}=["']([^"']*)["']`));
    return match ? match[1] : null;
  }

  // Find all <class ...> elements (handles any attribute order)
  const classRegex = /<class\s[^>]*?>/g;
  let classMatch;
  while ((classMatch = classRegex.exec(content)) !== null) {
    const classTag = classMatch[0];
    const filename = attr(classTag, 'filename');
    if (!filename) continue;

    const lineRate = parseFloat(attr(classTag, 'line-rate') || 'NaN');
    const branchRate = parseFloat(attr(classTag, 'branch-rate') || 'NaN');

    // Find the </class> boundary for this element
    const classStart = classMatch.index;
    const classEnd = content.indexOf('</class>', classStart);
    const classContent = classEnd > classStart
      ? content.slice(classStart, classEnd)
      : '';

    let linesTotal = 0, linesCovered = 0;
    let branchesTotal = 0, branchesCovered = 0;
    let functionsTotal = 0, functionsCovered = 0;
    const uncoveredLines: number[] = [];
    const uncoveredBranches: number[] = [];

    // Parse <line> elements (attribute-order-independent)
    const lineRegex = /<line\s([^>]*?)\/>/g;
    let lineMatch;
    while ((lineMatch = lineRegex.exec(classContent)) !== null) {
      const lineTag = lineMatch[1];
      const lineNum = parseInt(attr(lineTag, 'number') || '0', 10);
      const hits = parseInt(attr(lineTag, 'hits') || '0', 10);
      const isBranch = attr(lineTag, 'branch') === 'true';
      const condCoverage = attr(lineTag, 'condition-coverage');

      linesTotal++;
      if (hits > 0) {
        linesCovered++;
      } else {
        uncoveredLines.push(lineNum);
      }

      if (isBranch) {
        branchesTotal++;
        const condPct = condCoverage ? parseInt(condCoverage, 10) : (hits > 0 ? 100 : 0);
        if (condPct === 100) {
          branchesCovered++;
        } else {
          uncoveredBranches.push(lineNum);
        }
      }
    }

    // Parse <method> elements for function coverage
    const methodRegex = /<method\s([^>]*?)>/g;
    let methodMatch;
    while ((methodMatch = methodRegex.exec(classContent)) !== null) {
      functionsTotal++;
      // Check if method has any line hits (look for <line> within this method)
      const methodStart = methodMatch.index;
      const methodEnd = classContent.indexOf('</method>', methodStart);
      if (methodEnd > methodStart) {
        const methodContent = classContent.slice(methodStart, methodEnd);
        const methodLineRegex = /<line\s([^>]*?)\/>/g;
        let hasHits = false;
        let mLineMatch;
        while ((mLineMatch = methodLineRegex.exec(methodContent)) !== null) {
          if (parseInt(attr(mLineMatch[1], 'hits') || '0', 10) > 0) {
            hasHits = true;
            break;
          }
        }
        if (hasHits) functionsCovered++;
      }
    }

    // If no lines parsed, estimate from rates
    if (linesTotal === 0 && !isNaN(lineRate)) {
      linesTotal = 1;
      linesCovered = lineRate >= 0.5 ? 1 : 0;
    }

    files.push({
      path: filename,
      lines: { covered: linesCovered, total: linesTotal },
      branches: { covered: branchesCovered, total: branchesTotal },
      functions: { covered: functionsCovered, total: functionsTotal },
      statements: { covered: linesCovered, total: linesTotal },
      uncoveredLines,
      uncoveredBranches,
    });
  }

  // Calculate summary
  let totalLines = 0, totalCoveredLines = 0;
  let totalBranches = 0, totalCoveredBranches = 0;
  let totalFunctions = 0, totalCoveredFunctions = 0;

  for (const file of files) {
    totalLines += file.lines.total;
    totalCoveredLines += file.lines.covered;
    totalBranches += file.branches.total;
    totalCoveredBranches += file.branches.covered;
    totalFunctions += file.functions.total;
    totalCoveredFunctions += file.functions.covered;
  }

  // Also try to extract top-level summary from <coverage> element (order-independent)
  const coverageTag = content.match(/<coverage\s[^>]*?>/);
  const summaryLineRate = coverageTag ? parseFloat(attr(coverageTag[0], 'line-rate') || 'NaN') * 100 : NaN;
  const summaryBranchRate = coverageTag ? parseFloat(attr(coverageTag[0], 'branch-rate') || 'NaN') * 100 : NaN;

  return {
    files,
    summary: {
      line: !isNaN(summaryLineRate) ? summaryLineRate : (totalLines > 0 ? (totalCoveredLines / totalLines) * 100 : 0),
      branch: !isNaN(summaryBranchRate) ? summaryBranchRate : (totalBranches > 0 ? (totalCoveredBranches / totalBranches) * 100 : 0),
      function: totalFunctions > 0 ? (totalCoveredFunctions / totalFunctions) * 100 : 0,
      statement: totalLines > 0 ? (totalCoveredLines / totalLines) * 100 : 0,
      files: files.length,
    },
  };
}

/**
 * Discover source files in a directory
 */
export async function discoverSourceFiles(
  targetPath: string,
  options: { includeTests?: boolean; languages?: string[] } = {}
): Promise<string[]> {
  const files: string[] = [];
  const { includeTests = true, languages } = options;

  // Determine file extensions to include
  // Default: scan ALL common source languages unless explicitly filtered
  let extensions = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',  // JavaScript/TypeScript
    '.py', '.pyw',                                   // Python
    '.go',                                           // Go
    '.rs',                                           // Rust
    '.java', '.kt', '.kts',                          // Java/Kotlin
    '.rb',                                           // Ruby
    '.cs',                                           // C#
    '.php',                                          // PHP
    '.swift',                                        // Swift
    '.c', '.h', '.cpp', '.hpp', '.cc',               // C/C++
    '.scala',                                        // Scala
  ];
  if (languages && languages.length > 0) {
    extensions = [];
    for (const lang of languages) {
      if (lang === 'typescript') extensions.push('.ts', '.tsx');
      if (lang === 'javascript') extensions.push('.js', '.jsx', '.mjs', '.cjs');
      if (lang === 'python') extensions.push('.py', '.pyw');
      if (lang === 'go') extensions.push('.go');
      if (lang === 'rust') extensions.push('.rs');
      if (lang === 'java') extensions.push('.java');
      if (lang === 'kotlin') extensions.push('.kt', '.kts');
      if (lang === 'ruby') extensions.push('.rb');
      if (lang === 'csharp' || lang === 'c#') extensions.push('.cs');
      if (lang === 'php') extensions.push('.php');
      if (lang === 'swift') extensions.push('.swift');
      if (lang === 'c' || lang === 'cpp' || lang === 'c++') extensions.push('.c', '.h', '.cpp', '.hpp', '.cc');
      if (lang === 'scala') extensions.push('.scala');
    }
  }

  async function walkDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip common non-source directories
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', 'coverage', '.nyc_output',
             '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache', 'target',
             '.gradle', 'vendor', '.bundle'].includes(entry.name)) {
            continue;
          }
          await walkDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);

          // Check extension
          if (!extensions.includes(ext)) continue;

          // Skip test files if not including tests
          if (!includeTests) {
            const isTestFile = entry.name.includes('.test.') ||
                              entry.name.includes('.spec.') ||
                              entry.name.endsWith('_test.ts') ||
                              entry.name.endsWith('_test.js') ||
                              fullPath.includes('/__tests__/') ||
                              fullPath.includes('/test/') ||
                              fullPath.includes('/tests/');
            if (isTestFile) continue;
          }

          files.push(fullPath);
        }
      }
    } catch {
      // Directory not accessible
    }
  }

  // Check if targetPath is a file or directory
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isFile()) {
      return [targetPath];
    }
    await walkDir(targetPath);
  } catch {
    // Path doesn't exist
  }

  return files;
}

/**
 * Generate security recommendations based on findings
 */
export function generateSecurityRecommendations(vulnerabilities: Array<{ category: string; severity: string }>): string[] {
  const recommendations = new Set<string>();

  const categoryRecommendations: Record<string, string> = {
    'injection': 'Use parameterized queries and input validation to prevent injection attacks',
    'xss': 'Sanitize user input and use Content-Security-Policy headers',
    'sensitive-data': 'Never hardcode secrets; use environment variables or secret managers',
    'access-control': 'Implement proper authentication and authorization checks',
    'security-misconfiguration': 'Review and harden security configurations',
    'insecure-deserialization': 'Avoid deserializing untrusted data; use safe alternatives',
    'broken-auth': 'Use strong authentication mechanisms and secure session management',
    'dependencies': 'Keep dependencies updated and regularly audit for vulnerabilities',
  };

  // Add category-specific recommendations
  for (const vuln of vulnerabilities) {
    const rec = categoryRecommendations[vuln.category];
    if (rec) {
      recommendations.add(rec);
    }
  }

  // Add severity-based general recommendations
  const hasCritical = vulnerabilities.some(v => v.severity === 'critical');
  const hasHigh = vulnerabilities.some(v => v.severity === 'high');

  if (hasCritical) {
    recommendations.add('CRITICAL: Address critical vulnerabilities immediately before deployment');
  }
  if (hasHigh) {
    recommendations.add('Prioritize fixing high-severity issues in the next sprint');
  }

  if (recommendations.size === 0 && vulnerabilities.length === 0) {
    recommendations.add('No vulnerabilities found - maintain current security practices');
  }

  return Array.from(recommendations);
}
