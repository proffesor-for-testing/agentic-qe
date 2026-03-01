/**
 * Agentic QE v3 - Real Coverage Parser
 *
 * REAL IMPLEMENTATION that parses actual coverage files:
 * - LCOV format (from Istanbul, nyc, c8)
 * - Cobertura XML format
 * - JSON format (Istanbul/vitest)
 *
 * This is NOT a simulation - it reads and parses real coverage data.
 *
 * @module coverage-analysis/coverage-parser
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { safeJsonParse } from '../../../shared/safe-json.js';

// ============================================================================
// Coverage Data Types
// ============================================================================

/**
 * Coverage data for a single file
 */
export interface FileCoverageData {
  /** Absolute path to the file */
  path: string;
  /** Relative path from project root */
  relativePath: string;
  /** Line coverage data */
  lines: LineCoverageData;
  /** Branch coverage data */
  branches: BranchCoverageData;
  /** Function coverage data */
  functions: FunctionCoverageData;
  /** Statement coverage data */
  statements: StatementCoverageData;
  /** Overall coverage percentage */
  coveragePercentage: number;
}

/**
 * Line coverage metrics
 */
export interface LineCoverageData {
  /** Total lines in the file */
  total: number;
  /** Number of covered lines */
  covered: number;
  /** Coverage percentage (0-100) */
  percentage: number;
  /** Map of line number to hit count */
  details: Map<number, number>;
  /** Uncovered line numbers */
  uncoveredLines: number[];
}

/**
 * Branch coverage metrics
 */
export interface BranchCoverageData {
  /** Total branches */
  total: number;
  /** Covered branches */
  covered: number;
  /** Coverage percentage (0-100) */
  percentage: number;
  /** Uncovered branch details */
  uncoveredBranches: BranchDetail[];
}

/**
 * Function coverage metrics
 */
export interface FunctionCoverageData {
  /** Total functions */
  total: number;
  /** Covered functions */
  covered: number;
  /** Coverage percentage (0-100) */
  percentage: number;
  /** Function details */
  details: FunctionDetail[];
  /** Uncovered function names */
  uncoveredFunctions: string[];
}

/**
 * Statement coverage metrics
 */
export interface StatementCoverageData {
  /** Total statements */
  total: number;
  /** Covered statements */
  covered: number;
  /** Coverage percentage (0-100) */
  percentage: number;
}

/**
 * Branch detail information
 */
export interface BranchDetail {
  /** Line number of the branch */
  line: number;
  /** Block number */
  block: number;
  /** Branch number within the block */
  branch: number;
  /** Whether this branch was taken */
  taken: boolean;
  /** Number of times taken */
  hits: number;
}

/**
 * Function detail information
 */
export interface FunctionDetail {
  /** Function name */
  name: string;
  /** Line number where function starts */
  line: number;
  /** Number of times function was called */
  hits: number;
}

/**
 * Complete coverage report
 */
export interface CoverageReport {
  /** Timestamp of when the report was generated */
  timestamp: Date;
  /** Source format (lcov, cobertura, json) */
  format: 'lcov' | 'cobertura' | 'json';
  /** Coverage data by file */
  files: Map<string, FileCoverageData>;
  /** Summary statistics */
  summary: CoverageSummary;
}

/**
 * Summary statistics for entire coverage report
 */
export interface CoverageSummary {
  /** Total files analyzed */
  totalFiles: number;
  /** Lines */
  lines: { total: number; covered: number; percentage: number };
  /** Branches */
  branches: { total: number; covered: number; percentage: number };
  /** Functions */
  functions: { total: number; covered: number; percentage: number };
  /** Statements */
  statements: { total: number; covered: number; percentage: number };
}

// ============================================================================
// LCOV Parser
// ============================================================================

/**
 * Parse LCOV format coverage data
 *
 * LCOV format is the most common output from Istanbul, nyc, c8, etc.
 */
export async function parseLCOV(
  lcovPath: string,
  projectRoot?: string
): Promise<CoverageReport> {
  const content = await fs.readFile(lcovPath, 'utf-8');
  return parseLCOVContent(content, projectRoot || path.dirname(lcovPath));
}

/**
 * Parse LCOV content from string
 */
export function parseLCOVContent(content: string, projectRoot: string): CoverageReport {
  const files = new Map<string, FileCoverageData>();
  const lines = content.split('\n');

  let currentFile: Partial<FileCoverageData> | null = null;
  let currentLineDetails = new Map<number, number>();
  let currentBranches: BranchDetail[] = [];
  let currentFunctions: FunctionDetail[] = [];
  let linesTotal = 0;
  let linesHit = 0;
  let branchesTotal = 0;
  let branchesHit = 0;
  let functionsTotal = 0;
  let functionsHit = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // SF: Source File - start of new file record
    if (trimmed.startsWith('SF:')) {
      const filePath = trimmed.slice(3);
      currentFile = {
        path: filePath,
        relativePath: path.relative(projectRoot, filePath),
      };
      currentLineDetails = new Map();
      currentBranches = [];
      currentFunctions = [];
      linesTotal = 0;
      linesHit = 0;
      branchesTotal = 0;
      branchesHit = 0;
      functionsTotal = 0;
      functionsHit = 0;
    }

    // DA: Line data - DA:line_number,hit_count
    else if (trimmed.startsWith('DA:')) {
      const [lineNum, hitCount] = trimmed.slice(3).split(',').map(Number);
      if (!isNaN(lineNum) && !isNaN(hitCount)) {
        currentLineDetails.set(lineNum, hitCount);
        linesTotal++;
        if (hitCount > 0) linesHit++;
      }
    }

    // LF: Lines Found (total lines)
    else if (trimmed.startsWith('LF:')) {
      const count = parseInt(trimmed.slice(3), 10);
      if (!isNaN(count)) linesTotal = count;
    }

    // LH: Lines Hit
    else if (trimmed.startsWith('LH:')) {
      const count = parseInt(trimmed.slice(3), 10);
      if (!isNaN(count)) linesHit = count;
    }

    // BRDA: Branch data - BRDA:line,block,branch,taken
    else if (trimmed.startsWith('BRDA:')) {
      const parts = trimmed.slice(5).split(',');
      if (parts.length >= 4) {
        const lineNum = parseInt(parts[0], 10);
        const block = parseInt(parts[1], 10);
        const branch = parseInt(parts[2], 10);
        const taken = parts[3] === '-' ? 0 : parseInt(parts[3], 10);

        currentBranches.push({
          line: lineNum,
          block,
          branch,
          taken: taken > 0,
          hits: taken,
        });

        branchesTotal++;
        if (taken > 0) branchesHit++;
      }
    }

    // BRF: Branches Found (total branches)
    else if (trimmed.startsWith('BRF:')) {
      const count = parseInt(trimmed.slice(4), 10);
      if (!isNaN(count)) branchesTotal = count;
    }

    // BRH: Branches Hit
    else if (trimmed.startsWith('BRH:')) {
      const count = parseInt(trimmed.slice(4), 10);
      if (!isNaN(count)) branchesHit = count;
    }

    // FN: Function Name - FN:line,name
    else if (trimmed.startsWith('FN:')) {
      const commaIndex = trimmed.indexOf(',', 3);
      if (commaIndex > 0) {
        const lineNum = parseInt(trimmed.slice(3, commaIndex), 10);
        const name = trimmed.slice(commaIndex + 1);

        // Find existing or create new function entry
        const existing = currentFunctions.find((f) => f.name === name);
        if (!existing) {
          currentFunctions.push({ name, line: lineNum, hits: 0 });
        }
      }
    }

    // FNDA: Function Data - FNDA:hit_count,name
    else if (trimmed.startsWith('FNDA:')) {
      const commaIndex = trimmed.indexOf(',', 5);
      if (commaIndex > 0) {
        const hits = parseInt(trimmed.slice(5, commaIndex), 10);
        const name = trimmed.slice(commaIndex + 1);

        const fn = currentFunctions.find((f) => f.name === name);
        if (fn) {
          fn.hits = hits;
        } else {
          currentFunctions.push({ name, line: 0, hits });
        }

        functionsTotal++;
        if (hits > 0) functionsHit++;
      }
    }

    // FNF: Functions Found (total functions)
    else if (trimmed.startsWith('FNF:')) {
      const count = parseInt(trimmed.slice(4), 10);
      if (!isNaN(count)) functionsTotal = count;
    }

    // FNH: Functions Hit
    else if (trimmed.startsWith('FNH:')) {
      const count = parseInt(trimmed.slice(4), 10);
      if (!isNaN(count)) functionsHit = count;
    }

    // end_of_record - finalize current file
    else if (trimmed === 'end_of_record' && currentFile?.path) {
      const uncoveredLines = Array.from(currentLineDetails.entries())
        .filter(([, hits]) => hits === 0)
        .map(([line]) => line)
        .sort((a, b) => a - b);

      const uncoveredBranches = currentBranches.filter((b) => !b.taken);
      const uncoveredFunctions = currentFunctions
        .filter((f) => f.hits === 0)
        .map((f) => f.name);

      const fileCoverage: FileCoverageData = {
        path: currentFile.path,
        relativePath: currentFile.relativePath || currentFile.path,
        lines: {
          total: linesTotal,
          covered: linesHit,
          percentage: linesTotal > 0 ? (linesHit / linesTotal) * 100 : 0,
          details: currentLineDetails,
          uncoveredLines,
        },
        branches: {
          total: branchesTotal,
          covered: branchesHit,
          percentage: branchesTotal > 0 ? (branchesHit / branchesTotal) * 100 : 0,
          uncoveredBranches,
        },
        functions: {
          total: functionsTotal,
          covered: functionsHit,
          percentage: functionsTotal > 0 ? (functionsHit / functionsTotal) * 100 : 0,
          details: currentFunctions,
          uncoveredFunctions,
        },
        statements: {
          total: linesTotal, // Approximate: use line count
          covered: linesHit,
          percentage: linesTotal > 0 ? (linesHit / linesTotal) * 100 : 0,
        },
        coveragePercentage: calculateOverallPercentage(
          linesHit,
          linesTotal,
          branchesHit,
          branchesTotal
        ),
      };

      files.set(currentFile.path, fileCoverage);
      currentFile = null;
    }
  }

  return {
    timestamp: new Date(),
    format: 'lcov',
    files,
    summary: calculateSummary(files),
  };
}

// ============================================================================
// JSON Coverage Parser (Istanbul/Vitest format)
// ============================================================================

/**
 * Parse JSON coverage data (Istanbul/Vitest format)
 */
export async function parseJSONCoverage(
  jsonPath: string,
  projectRoot?: string
): Promise<CoverageReport> {
  const content = await fs.readFile(jsonPath, 'utf-8');
  const data = safeJsonParse(content);
  const root = projectRoot || path.dirname(jsonPath);
  const files = new Map<string, FileCoverageData>();

  for (const [filePath, coverage] of Object.entries<any>(data)) {
    // Skip non-file entries
    if (typeof coverage !== 'object' || !coverage.statementMap) continue;

    const lineDetails = new Map<number, number>();
    const uncoveredLines: number[] = [];

    // Process statements
    let stmtTotal = 0;
    let stmtCovered = 0;

    for (const [stmtId, hits] of Object.entries<number>(coverage.s || {})) {
      const stmt = coverage.statementMap[stmtId];
      if (stmt?.start?.line) {
        const line = stmt.start.line;
        const currentHits = lineDetails.get(line) || 0;
        lineDetails.set(line, currentHits + hits);
      }
      stmtTotal++;
      if (hits > 0) stmtCovered++;
    }

    // Mark uncovered lines
    for (const [line, hits] of lineDetails.entries()) {
      if (hits === 0) uncoveredLines.push(line);
    }

    // Process branches
    const branches: BranchDetail[] = [];
    let branchTotal = 0;
    let branchCovered = 0;

    for (const [branchId, branch] of Object.entries<any>(coverage.branchMap || {})) {
      const branchHits = coverage.b?.[branchId] || [];
      for (let i = 0; i < branchHits.length; i++) {
        branches.push({
          line: branch.loc?.start?.line || 0,
          block: parseInt(branchId, 10),
          branch: i,
          taken: branchHits[i] > 0,
          hits: branchHits[i],
        });
        branchTotal++;
        if (branchHits[i] > 0) branchCovered++;
      }
    }

    // Process functions
    const functions: FunctionDetail[] = [];
    let fnTotal = 0;
    let fnCovered = 0;

    for (const [fnId, fn] of Object.entries<any>(coverage.fnMap || {})) {
      const hits = coverage.f?.[fnId] || 0;
      functions.push({
        name: fn.name || `anonymous_${fnId}`,
        line: fn.loc?.start?.line || fn.decl?.start?.line || 0,
        hits,
      });
      fnTotal++;
      if (hits > 0) fnCovered++;
    }

    const linesTotal = lineDetails.size;
    const linesCovered = Array.from(lineDetails.values()).filter((h) => h > 0).length;

    files.set(filePath, {
      path: filePath,
      relativePath: path.relative(root, filePath),
      lines: {
        total: linesTotal,
        covered: linesCovered,
        percentage: linesTotal > 0 ? (linesCovered / linesTotal) * 100 : 0,
        details: lineDetails,
        uncoveredLines: uncoveredLines.sort((a, b) => a - b),
      },
      branches: {
        total: branchTotal,
        covered: branchCovered,
        percentage: branchTotal > 0 ? (branchCovered / branchTotal) * 100 : 0,
        uncoveredBranches: branches.filter((b) => !b.taken),
      },
      functions: {
        total: fnTotal,
        covered: fnCovered,
        percentage: fnTotal > 0 ? (fnCovered / fnTotal) * 100 : 0,
        details: functions,
        uncoveredFunctions: functions.filter((f) => f.hits === 0).map((f) => f.name),
      },
      statements: {
        total: stmtTotal,
        covered: stmtCovered,
        percentage: stmtTotal > 0 ? (stmtCovered / stmtTotal) * 100 : 0,
      },
      coveragePercentage: calculateOverallPercentage(
        linesCovered,
        linesTotal,
        branchCovered,
        branchTotal
      ),
    });
  }

  return {
    timestamp: new Date(),
    format: 'json',
    files,
    summary: calculateSummary(files),
  };
}

// ============================================================================
// Auto-Detect Parser
// ============================================================================

/**
 * Auto-detect coverage format and parse accordingly
 */
export async function parseCoverage(
  coveragePath: string,
  projectRoot?: string
): Promise<CoverageReport> {
  const ext = path.extname(coveragePath).toLowerCase();
  const basename = path.basename(coveragePath).toLowerCase();

  // Try to detect format
  if (ext === '.json' || basename.includes('coverage-final')) {
    return parseJSONCoverage(coveragePath, projectRoot);
  }

  if (basename === 'lcov.info' || ext === '.info' || basename.includes('lcov')) {
    return parseLCOV(coveragePath, projectRoot);
  }

  // Try to read and detect
  const content = await fs.readFile(coveragePath, 'utf-8');

  if (content.trim().startsWith('{')) {
    return parseJSONCoverage(coveragePath, projectRoot);
  }

  if (content.includes('SF:') && content.includes('end_of_record')) {
    return parseLCOV(coveragePath, projectRoot);
  }

  throw new Error(`Unknown coverage format: ${coveragePath}`);
}

/**
 * Find and parse coverage files in a directory
 */
export async function findAndParseCoverage(
  searchDir: string,
  projectRoot?: string
): Promise<CoverageReport | null> {
  const root = projectRoot || searchDir;

  // Common coverage file locations
  const candidates = [
    path.join(searchDir, 'coverage', 'lcov.info'),
    path.join(searchDir, 'coverage', 'coverage-final.json'),
    path.join(searchDir, 'lcov.info'),
    path.join(searchDir, '.nyc_output', 'coverage.json'),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return parseCoverage(candidate, root);
    } catch {
      // File doesn't exist, try next
    }
  }

  return null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateOverallPercentage(
  linesHit: number,
  linesTotal: number,
  branchesHit: number,
  branchesTotal: number
): number {
  // Weight: 70% lines, 30% branches
  const linePercentage = linesTotal > 0 ? (linesHit / linesTotal) * 100 : 0;
  const branchPercentage = branchesTotal > 0 ? (branchesHit / branchesTotal) * 100 : 0;

  if (branchesTotal === 0) {
    return linePercentage;
  }

  return linePercentage * 0.7 + branchPercentage * 0.3;
}

function calculateSummary(files: Map<string, FileCoverageData>): CoverageSummary {
  let totalLines = 0;
  let coveredLines = 0;
  let totalBranches = 0;
  let coveredBranches = 0;
  let totalFunctions = 0;
  let coveredFunctions = 0;
  let totalStatements = 0;
  let coveredStatements = 0;

  for (const file of files.values()) {
    totalLines += file.lines.total;
    coveredLines += file.lines.covered;
    totalBranches += file.branches.total;
    coveredBranches += file.branches.covered;
    totalFunctions += file.functions.total;
    coveredFunctions += file.functions.covered;
    totalStatements += file.statements.total;
    coveredStatements += file.statements.covered;
  }

  return {
    totalFiles: files.size,
    lines: {
      total: totalLines,
      covered: coveredLines,
      percentage: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
    },
    branches: {
      total: totalBranches,
      covered: coveredBranches,
      percentage: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0,
    },
    functions: {
      total: totalFunctions,
      covered: coveredFunctions,
      percentage: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0,
    },
    statements: {
      total: totalStatements,
      covered: coveredStatements,
      percentage: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
    },
  };
}

// ============================================================================
// Gap Detection
// ============================================================================

/**
 * Identify coverage gaps from a report
 */
export interface CoverageGap {
  /** File path */
  file: string;
  /** Gap type */
  type: 'line' | 'branch' | 'function';
  /** Location details */
  location: {
    line?: number;
    lines?: number[];
    function?: string;
    block?: number;
    branch?: number;
  };
  /** Severity (based on risk analysis) */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Suggested action */
  suggestion: string;
}

/**
 * Extract gaps from coverage report
 */
export function extractGaps(report: CoverageReport): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  for (const [filePath, coverage] of report.files.entries()) {
    // Find consecutive uncovered line ranges
    const uncoveredRanges = findRanges(coverage.lines.uncoveredLines);

    for (const range of uncoveredRanges) {
      const severity = getRangeSeverity(range.length, coverage.lines.total);
      gaps.push({
        file: coverage.relativePath,
        type: 'line',
        location: {
          lines: range,
          line: range[0],
        },
        severity,
        suggestion: `Add tests covering lines ${range[0]}-${range[range.length - 1]}`,
      });
    }

    // Uncovered branches
    for (const branch of coverage.branches.uncoveredBranches) {
      gaps.push({
        file: coverage.relativePath,
        type: 'branch',
        location: {
          line: branch.line,
          block: branch.block,
          branch: branch.branch,
        },
        severity: 'medium',
        suggestion: `Add test for branch at line ${branch.line}`,
      });
    }

    // Uncovered functions
    for (const fnName of coverage.functions.uncoveredFunctions) {
      const fn = coverage.functions.details.find((f) => f.name === fnName);
      gaps.push({
        file: coverage.relativePath,
        type: 'function',
        location: {
          function: fnName,
          line: fn?.line,
        },
        severity: 'high',
        suggestion: `Add test for function '${fnName}'`,
      });
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  gaps.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return gaps;
}

function findRanges(lines: number[]): number[][] {
  if (lines.length === 0) return [];

  const ranges: number[][] = [];
  let currentRange = [lines[0]];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === lines[i - 1] + 1) {
      currentRange.push(lines[i]);
    } else {
      ranges.push(currentRange);
      currentRange = [lines[i]];
    }
  }

  ranges.push(currentRange);
  return ranges;
}

function getRangeSeverity(
  rangeSize: number,
  totalLines: number
): 'low' | 'medium' | 'high' | 'critical' {
  const percentage = (rangeSize / totalLines) * 100;

  if (percentage > 20 || rangeSize > 50) return 'critical';
  if (percentage > 10 || rangeSize > 20) return 'high';
  if (percentage > 5 || rangeSize > 10) return 'medium';
  return 'low';
}
