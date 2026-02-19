/**
 * Agentic QE v3 - Task Executor
 * Bridges Queen tasks to domain service execution
 *
 * This component actually executes domain services when tasks are assigned,
 * completing the execution pipeline with REAL implementations.
 *
 * ADR-051: Now integrates TinyDancer model routing:
 * - Reads routingTier from task payload
 * - Routes Tier 0 tasks to Agent Booster for mechanical transforms
 * - Records outcomes back to TinyDancer for learning
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DomainName, DomainEvent, Result, ok, err } from '../shared/types';
import { toError, toErrorMessage } from '../shared/error-utils.js';
import { safeJsonParse } from '../shared/safe-json.js';
import { FilePath } from '../shared/value-objects/index.js';
import { EventBus, QEKernel, MemoryBackend } from '../kernel/interfaces';
import { TaskType, QueenTask, TaskExecution } from './queen-coordinator';
import { ResultSaver, createResultSaver, SaveOptions } from './result-saver';

// ADR-051: Agent Booster integration for Tier 0 tasks
import {
  createAgentBoosterAdapter,
  type IAgentBoosterAdapter,
  type TransformType,
  type TransformResult,
} from '../integrations/agentic-flow/agent-booster';

// ADR-051: Task Router for outcome recording
import { getTaskRouter, type TaskRouterService } from '../mcp/services/task-router';
import type { QualityFeedbackLoop, RoutingOutcomeInput } from '../feedback/feedback-loop.js';

// CQ-005: Import domain types only (no runtime dependency on domain modules)
import type { CoverageData, FileCoverage } from '../domains/coverage-analysis';
import type { FullScanResult } from '../domains/security-compliance';
import type { TestGeneratorService, GeneratedTests } from '../domains/test-generation';
import type { QualityReport } from '../domains/quality-assessment';

// CQ-005: Use DomainServiceRegistry instead of dynamic imports from domains/
import { DomainServiceRegistry, ServiceKeys } from '../shared/domain-service-registry';

type CoverageAnalyzerService = import('../domains/coverage-analysis').CoverageAnalyzerService;
type SecurityScannerService = import('../domains/security-compliance').SecurityScannerService;
type KnowledgeGraphService = import('../domains/code-intelligence').KnowledgeGraphService;
type QualityAnalyzerService = import('../domains/quality-assessment').QualityAnalyzerService;

// ============================================================================
// CQ-005: Domain Service Resolution via Registry (no coordination -> domains imports)
// Domain modules register their factories in their index.ts files.
// Coordination resolves them from the shared registry at runtime.
// ============================================================================

function resolveCoverageAnalyzerService(memory: MemoryBackend): CoverageAnalyzerService {
  const factory = DomainServiceRegistry.resolve<(m: MemoryBackend) => CoverageAnalyzerService>(
    ServiceKeys.CoverageAnalyzerService
  );
  return factory(memory);
}

function resolveSecurityScannerService(memory: MemoryBackend): SecurityScannerService {
  const factory = DomainServiceRegistry.resolve<(m: MemoryBackend) => SecurityScannerService>(
    ServiceKeys.SecurityScannerService
  );
  return factory(memory);
}

function resolveTestGeneratorService(memory: MemoryBackend): TestGeneratorService {
  const factory = DomainServiceRegistry.resolve<(m: MemoryBackend) => TestGeneratorService>(
    ServiceKeys.createTestGeneratorService
  );
  return factory(memory);
}

function resolveKnowledgeGraphService(memory: MemoryBackend): KnowledgeGraphService {
  const factory = DomainServiceRegistry.resolve<(m: MemoryBackend) => KnowledgeGraphService>(
    ServiceKeys.KnowledgeGraphService
  );
  return factory(memory);
}

function resolveQualityAnalyzerService(memory: MemoryBackend): QualityAnalyzerService {
  const factory = DomainServiceRegistry.resolve<(m: MemoryBackend) => QualityAnalyzerService>(
    ServiceKeys.QualityAnalyzerService
  );
  return factory(memory);
}

// ============================================================================
// Types
// ============================================================================

export interface TaskExecutorConfig {
  timeout: number;
  maxRetries: number;
  enableCaching: boolean;
  /** Enable result persistence to files */
  saveResults: boolean;
  /** Base directory for result files */
  resultsDir: string;
  /** Default language for test generation */
  defaultLanguage: string;
  /** Default framework for test generation */
  defaultFramework: string;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
  domain: DomainName;
  /** Files saved by result saver */
  savedFiles?: string[];
}

/**
 * Istanbul/nyc coverage-final.json file data structure
 * Each file in the coverage report has this structure
 */
interface IstanbulFileCoverage {
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

type TaskHandler = (task: QueenTask, kernel: QEKernel) => Promise<Result<unknown, Error>>;
type InstanceTaskHandler = (task: QueenTask) => Promise<Result<unknown, Error>>;

// ============================================================================
// ADR-051: Model Routing Support
// ============================================================================

/**
 * Model tier to model ID mapping
 * Per ADR-026: 3-tier model routing
 */
function getModelForTier(tier: number): string {
  switch (tier) {
    case 0: return 'agent-booster'; // Special case - WASM transforms
    case 1: return 'claude-3-5-haiku-20241022';
    case 2: return 'claude-sonnet-4-20250514';
    case 3: return 'claude-sonnet-4-20250514'; // Extended thinking
    case 4: return 'claude-opus-4-5-20251101';
    default: return 'claude-sonnet-4-20250514';
  }
}

/**
 * Map task type and code context to transform type for Agent Booster
 * Returns null if no applicable transform is detected
 */
function detectTransformType(task: QueenTask): TransformType | null {
  // Agent Booster transforms only apply to code transformation tasks,
  // NOT to test generation, coverage, security, or other domain tasks
  const nonTransformTasks = [
    'generate-tests', 'analyze-coverage', 'scan-security', 'execute-tests',
    'assess-quality', 'validate-contracts', 'test-accessibility', 'chaos-test',
    'predict-defects', 'validate-requirements', 'index-code',
  ];
  if (nonTransformTasks.includes(task.type)) return null;

  const codeContext = (task.payload as Record<string, unknown>)?.codeContext as string || '';
  const sourceCode = (task.payload as Record<string, unknown>)?.sourceCode as string || '';
  const code = codeContext || sourceCode;

  if (!code) return null;

  // Detect transform opportunities based on code patterns
  if (code.includes('var ') && !code.includes('const ') && !code.includes('let ')) {
    return 'var-to-const';
  }
  if (code.includes('console.log') || code.includes('console.warn') || code.includes('console.error')) {
    return 'remove-console';
  }
  if (code.includes('.then(') && code.includes('.catch(')) {
    return 'promise-to-async';
  }
  if (code.includes('require(') && !code.includes('import ')) {
    return 'cjs-to-esm';
  }
  if (code.includes('function ') && !code.includes('=>')) {
    return 'func-to-arrow';
  }
  // add-types is harder to detect without type analysis

  return null;
}

// ============================================================================
// Helper Functions for Real Implementations
// ============================================================================

/**
 * Load coverage data from common coverage file formats
 */
async function loadCoverageData(targetPath: string): Promise<CoverageData | null> {
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
function parseCoverageJson(content: string): CoverageData {
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
function parseLcovInfo(content: string): CoverageData {
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
function parseCoberturaXml(content: string): CoverageData {
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
async function discoverSourceFiles(
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
function generateSecurityRecommendations(vulnerabilities: Array<{ category: string; severity: string }>): string[] {
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

// ============================================================================
// Task Executor
// ============================================================================

export class DomainTaskExecutor {
  private readonly config: TaskExecutorConfig;
  private readonly resultSaver: ResultSaver;

  // Instance-level service caches to prevent cross-contamination between executor instances
  private coverageAnalyzer: CoverageAnalyzerService | null = null;
  private securityScanner: SecurityScannerService | null = null;
  private testGenerator: TestGeneratorService | null = null;
  private knowledgeGraph: KnowledgeGraphService | null = null;
  private qualityAnalyzer: QualityAnalyzerService | null = null;

  // ADR-051: Lazy-initialized Agent Booster and Task Router (instance-level)
  private agentBooster: IAgentBoosterAdapter | null = null;
  private taskRouter: TaskRouterService | null = null;

  // ADR-023: Quality Feedback Loop for routing outcome recording
  private qualityFeedbackLoop: QualityFeedbackLoop | null = null;

  // Instance-level task handler registry
  private readonly taskHandlers: Map<TaskType, InstanceTaskHandler> = new Map();

  constructor(
    private readonly kernel: QEKernel,
    private readonly eventBus: EventBus,
    config?: Partial<TaskExecutorConfig>
  ) {
    this.config = {
      timeout: config?.timeout ?? 300000,
      maxRetries: config?.maxRetries ?? 3,
      enableCaching: config?.enableCaching ?? true,
      saveResults: config?.saveResults ?? true,
      resultsDir: config?.resultsDir ?? '.agentic-qe',
      defaultLanguage: config?.defaultLanguage ?? 'typescript',
      defaultFramework: config?.defaultFramework ?? 'vitest',
    };
    this.resultSaver = createResultSaver(this.config.resultsDir);
    this.registerHandlers();
  }

  /** Connect QualityFeedbackLoop for routing outcome recording */
  setQualityFeedbackLoop(loop: QualityFeedbackLoop | null): void {
    this.qualityFeedbackLoop = loop;
  }

  // ============================================================================
  // Instance-level service getters (lazy initialization)
  // ============================================================================

  private getCoverageAnalyzer(): CoverageAnalyzerService {
    if (!this.coverageAnalyzer) {
      this.coverageAnalyzer = resolveCoverageAnalyzerService(this.kernel.memory);
    }
    return this.coverageAnalyzer;
  }

  private getSecurityScanner(): SecurityScannerService {
    if (!this.securityScanner) {
      this.securityScanner = resolveSecurityScannerService(this.kernel.memory);
    }
    return this.securityScanner;
  }

  private getTestGenerator(): TestGeneratorService {
    if (!this.testGenerator) {
      this.testGenerator = resolveTestGeneratorService(this.kernel.memory);
    }
    return this.testGenerator;
  }

  private getKnowledgeGraph(): KnowledgeGraphService {
    if (!this.knowledgeGraph) {
      this.knowledgeGraph = resolveKnowledgeGraphService(this.kernel.memory);
    }
    return this.knowledgeGraph;
  }

  private getQualityAnalyzer(): QualityAnalyzerService {
    if (!this.qualityAnalyzer) {
      this.qualityAnalyzer = resolveQualityAnalyzerService(this.kernel.memory);
    }
    return this.qualityAnalyzer;
  }

  /**
   * Get or create Agent Booster adapter (instance-level)
   */
  private async getAgentBooster(): Promise<IAgentBoosterAdapter> {
    if (!this.agentBooster) {
      this.agentBooster = await createAgentBoosterAdapter({
        enabled: true,
        fallbackToLLM: true,
        confidenceThreshold: 0.7,
      });
    }
    return this.agentBooster;
  }

  /**
   * Get or create Task Router for outcome recording (instance-level)
   */
  private async getTaskRouterInstance(): Promise<TaskRouterService | null> {
    if (!this.taskRouter) {
      try {
        this.taskRouter = await getTaskRouter();
      } catch {
        // Task router not available - outcome recording will be skipped
        return null;
      }
    }
    return this.taskRouter;
  }

  // ============================================================================
  // Task Handler Registration (instance-level)
  // ============================================================================

  private registerHandlers(): void {
    // Register test generation handler - REAL IMPLEMENTATION
    this.taskHandlers.set('generate-tests', async (task) => {
      const payload = task.payload as {
        sourceCode?: string;
        filePath?: string;
        sourceFiles?: string[];
        language: string;
        framework: string;
        testType: 'unit' | 'integration' | 'e2e';
        coverageGoal: number;
      };

      try {
        const generator = this.getTestGenerator();

        // Determine source files to analyze
        let sourceFiles: string[] = [];
        if (payload.sourceFiles && payload.sourceFiles.length > 0) {
          sourceFiles = payload.sourceFiles;
        } else if (payload.filePath) {
          sourceFiles = [payload.filePath];
        } else if (payload.sourceCode) {
          // Write temporary file for analysis if only source code provided
          // Use correct file extension based on language parameter
          const langExtMap: Record<string, string> = {
            python: '.py', typescript: '.ts', javascript: '.js',
            go: '.go', rust: '.rs', java: '.java', ruby: '.rb',
            kotlin: '.kt', csharp: '.cs', php: '.php', swift: '.swift',
            cpp: '.cpp', c: '.c', scala: '.scala',
          };
          const ext = langExtMap[payload.language?.toLowerCase() || 'typescript'] || '.ts';
          const tempPath = `/tmp/aqe-temp-${uuidv4()}${ext}`;
          await fs.writeFile(tempPath, payload.sourceCode, 'utf-8');
          sourceFiles = [tempPath];
        }

        if (sourceFiles.length === 0) {
          // Return a graceful fallback with warning when no source files provided
          return ok({
            testsGenerated: 0,
            coverageEstimate: 0,
            tests: [],
            patternsUsed: [],
            warning: 'No source files or code provided for test generation. Provide sourceCode, filePath, or sourceFiles in the payload.',
          });
        }

        // Use the real TestGeneratorService
        const framework = (payload.framework || 'vitest') as 'jest' | 'vitest' | 'mocha' | 'pytest';
        const result = await generator.generateTests({
          sourceFiles,
          testType: payload.testType || 'unit',
          framework,
          coverageTarget: payload.coverageGoal || 80,
          patterns: [],
        });

        if (!result.success) {
          return result;
        }

        const generatedTests = result.value;

        return ok({
          testsGenerated: generatedTests.tests.length,
          coverageEstimate: generatedTests.coverageEstimate,
          tests: generatedTests.tests.map(t => ({
            name: t.name,
            file: t.testFile,
            type: t.type,
            sourceFile: t.sourceFile,
            assertions: t.assertions,
            testCode: t.testCode,
          })),
          patternsUsed: generatedTests.patternsUsed,
        });
      } catch (error) {
        return err(toError(error));
      }
    });

    // Register coverage analysis handler - REAL IMPLEMENTATION
    this.taskHandlers.set('analyze-coverage', async (task) => {
      const payload = task.payload as {
        target: string;
        detectGaps: boolean;
        threshold?: number;
      };

      try {
        const analyzer = this.getCoverageAnalyzer();
        const targetPath = payload.target || process.cwd();
        const threshold = payload.threshold || 80;

        // Try to find and read actual coverage files
        let coverageData = await loadCoverageData(targetPath);

        if (!coverageData) {
          // No coverage data found — attempt to collect it by running tests with coverage
          let collected = false;
          try {
            const { execSync } = await import('child_process');
            // Detect test runner from package.json
            let coverageCmd = 'npx vitest run --coverage --reporter=json 2>/dev/null';
            try {
              const pkgContent = await fs.readFile(path.join(targetPath, 'package.json'), 'utf-8');
              const pkg = safeJsonParse<Record<string, unknown>>(pkgContent);
              const deps = { ...(pkg.devDependencies as Record<string, string> || {}), ...(pkg.dependencies as Record<string, string> || {}) };
              if (deps['jest'] || deps['@jest/core']) {
                coverageCmd = 'npx jest --coverage --json 2>/dev/null';
              } else if (deps['mocha'] || deps['nyc']) {
                coverageCmd = 'npx nyc mocha 2>/dev/null';
              }
              // vitest is the default — covers vitest, @vitest/coverage-v8, etc.
            } catch {
              // No package.json — use default vitest
            }

            execSync(coverageCmd, {
              cwd: targetPath,
              timeout: 120000,
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
            });
            collected = true;
          } catch {
            // Test runner failed or not available — that's OK, we'll check for output anyway
          }

          // Re-check for coverage data after collection attempt
          coverageData = await loadCoverageData(targetPath);

          if (!coverageData) {
            return ok({
              lineCoverage: 0,
              branchCoverage: 0,
              functionCoverage: 0,
              statementCoverage: 0,
              totalFiles: 0,
              coverageByFile: [],
              gaps: [],
              algorithm: 'sublinear-O(log n)',
              warning: collected
                ? 'Tests ran but no coverage output was generated. Ensure a coverage provider is configured (e.g., @vitest/coverage-v8, istanbul).'
                : 'No coverage data found and could not run tests automatically. Run: npm test -- --coverage',
            });
          }
        }

        // Analyze coverage using the real CoverageAnalyzerService
        const analysisResult = await analyzer.analyze({
          coverageData,
          threshold,
          includeFileDetails: payload.detectGaps,
        });

        if (!analysisResult.success) {
          return analysisResult;
        }

        const report = analysisResult.value;

        // Find gaps if requested
        let gaps: Array<{ file: string; lines: number[]; risk: string }> = [];
        if (payload.detectGaps) {
          const gapsResult = await analyzer.findGaps(coverageData, threshold);
          if (gapsResult.success) {
            gaps = gapsResult.value.gaps.map(gap => ({
              file: gap.file,
              lines: gap.lines,
              risk: gap.severity,
            }));
          }
        }

        return ok({
          lineCoverage: Math.round(report.summary.line * 10) / 10,
          branchCoverage: Math.round(report.summary.branch * 10) / 10,
          functionCoverage: Math.round(report.summary.function * 10) / 10,
          statementCoverage: Math.round(report.summary.statement * 10) / 10,
          totalFiles: report.summary.files,
          coverageByFile: coverageData.files.map(f => ({
            file: f.path,
            lineCoverage: f.lines.total > 0 ? Math.round((f.lines.covered / f.lines.total) * 1000) / 10 : 0,
            branchCoverage: f.branches.total > 0 ? Math.round((f.branches.covered / f.branches.total) * 1000) / 10 : 0,
            functionCoverage: f.functions.total > 0 ? Math.round((f.functions.covered / f.functions.total) * 1000) / 10 : 0,
          })),
          gaps,
          meetsThreshold: report.meetsThreshold,
          delta: report.delta,
          recommendations: report.recommendations,
          algorithm: 'sublinear-O(log n)',
        });
      } catch (error) {
        return err(toError(error));
      }
    });

    // Register security scan handler - REAL IMPLEMENTATION
    this.taskHandlers.set('scan-security', async (task) => {
      const payload = task.payload as {
        target: string;
        sast: boolean;
        dast: boolean;
        compliance: string[];
        targetUrl?: string;
      };

      try {
        const scanner = this.getSecurityScanner();
        const targetPath = payload.target || process.cwd();

        // Discover files to scan
        const filesToScan = await discoverSourceFiles(targetPath);

        if (filesToScan.length === 0) {
          return ok({
            vulnerabilities: 0,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            informational: 0,
            topVulnerabilities: [],
            recommendations: ['No source files found to scan'],
            scanTypes: {
              sast: payload.sast !== false,
              dast: payload.dast || false,
            },
            warning: `No source files found in ${targetPath}`,
          });
        }

        // Separate files by language capability
        const jstsFiles = filesToScan.filter(f => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));
        const otherFiles = filesToScan.filter(f => !/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));

        // Run basic cross-language security patterns on non-JS/TS files
        const crossLangVulns: Array<{
          title: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
          location: { file: string; line: number }; description: string; category: string;
        }> = [];

        // Run secret/CORS patterns on ALL files (not just otherFiles) to catch JS/TS secrets too
        for (const filePath of filesToScan) {
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            const relPath = filePath.startsWith(targetPath)
              ? filePath.slice(targetPath.length).replace(/^\//, '')
              : filePath;

            // Pattern: Hardcoded secrets/keys
            // Fix #287: Use \w* around keywords to match SECRET_KEY, JWT_SECRET, API_TOKEN, etc.
            const secretPatterns = [
              { regex: /\w*(?:secret|password|passwd|api_key|apikey|private_key|jwt_secret)\w*\s*[=:]\s*['"][^'"]{4,}['"]/gi, title: 'Hardcoded secret', severity: 'critical' as const },
              { regex: /\w*(?:token|auth_token|access_key|secret_key)\w*\s*[=:]\s*['"][^'"]{8,}['"]/gi, title: 'Hardcoded credential', severity: 'critical' as const },
              { regex: /(?:AWS_SECRET|GITHUB_TOKEN|SLACK_TOKEN|OPENAI_API_KEY)\s*[=:]\s*['"][^'"]+['"]/gi, title: 'Hardcoded cloud credential', severity: 'critical' as const },
            ];

            for (const pattern of secretPatterns) {
              for (let i = 0; i < lines.length; i++) {
                // Use matchAll to find ALL secrets on a single line (not just first)
                const matches = [...lines[i].matchAll(pattern.regex)];
                for (const _m of matches) {
                  crossLangVulns.push({
                    title: pattern.title,
                    severity: pattern.severity,
                    location: { file: relPath, line: i + 1 },
                    description: `Potential hardcoded secret found at line ${i + 1}`,
                    category: 'sensitive-data',
                  });
                }
              }
            }

            // Pattern: SQL injection risks
            const sqlPatterns = /(?:execute|query|cursor\.execute)\s*\(\s*(?:f['"]|['"].*%s|['"].*\+\s*\w)/gi;
            for (let i = 0; i < lines.length; i++) {
              if (sqlPatterns.test(lines[i])) {
                crossLangVulns.push({
                  title: 'Potential SQL injection',
                  severity: 'high',
                  location: { file: relPath, line: i + 1 },
                  description: 'String interpolation in SQL query — use parameterized queries',
                  category: 'injection',
                });
              }
              sqlPatterns.lastIndex = 0;
            }

            // Pattern: CORS wildcard (multi-framework)
            const corsPatterns = [
              /allow_origins\s*=\s*\[?\s*['"]?\*['"]?\s*\]?/i,          // Python FastAPI/Flask
              /cors\(\s*\{[^}]*origin:\s*['"]?\*['"]?/i,                 // Express.js cors()
              /Access-Control-Allow-Origin['":\s]+\*/i,                   // Raw header / Nginx / .htaccess
              /@CrossOrigin\(\s*origins?\s*=\s*["']\*["']/i,             // Spring Boot
              /\.Header\(\)\.Set\(["']Access-Control-Allow-Origin["'],\s*["']\*["']/i, // Go
            ];
            for (const corsPattern of corsPatterns) {
              if (corsPattern.test(content)) {
                crossLangVulns.push({
                  title: 'CORS wildcard origin',
                  severity: 'high',
                  location: { file: relPath, line: lines.findIndex(l => corsPattern.test(l)) + 1 },
                  description: 'CORS configured with wildcard (*) origin — restrict to specific domains',
                  category: 'security-misconfiguration',
                });
                break; // One CORS finding per file is enough
              }
            }

            // Pattern: Debug/development mode enabled
            if (/(?:DEBUG|debug)\s*[=:]\s*(?:True|true|1)/i.test(content)) {
              crossLangVulns.push({
                title: 'Debug mode enabled',
                severity: 'medium',
                location: { file: relPath, line: lines.findIndex(l => /DEBUG\s*[=:]\s*(?:True|true|1)/i.test(l)) + 1 },
                description: 'Debug mode should be disabled in production',
                category: 'security-misconfiguration',
              });
            }

            // Pattern: Eval/exec usage
            if (/\b(?:eval|exec)\s*\(/i.test(content)) {
              crossLangVulns.push({
                title: 'Dangerous eval/exec usage',
                severity: 'high',
                location: { file: relPath, line: lines.findIndex(l => /\b(?:eval|exec)\s*\(/.test(l)) + 1 },
                description: 'eval/exec can lead to code injection — avoid using with user input',
                category: 'injection',
              });
            }
          } catch {
            // Skip unreadable files
          }
        }

        // Also check dependency manifests for known vulnerable packages
        const depManifests = ['requirements.txt', 'pyproject.toml', 'Gemfile', 'go.mod', 'Cargo.toml'];
        for (const manifest of depManifests) {
          const manifestPath = path.join(targetPath, manifest);
          try {
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            crossLangVulns.push({
              title: 'Dependency audit recommended',
              severity: 'informational',
              location: { file: manifest, line: 1 },
              description: `Found ${manifest} — run language-specific dependency audit (e.g., pip-audit, npm audit, cargo audit)`,
              category: 'dependencies',
            });

            // Check for known high-severity CVEs in Python dependencies
            if (manifest === 'requirements.txt' || manifest === 'pyproject.toml') {
              const knownCVEs: Array<{ pkg: string; pattern: RegExp; cve: string; severity: 'critical' | 'high'; title: string; description: string }> = [
                { pkg: 'python-jose', pattern: /python-jose/i, cve: 'CVE-2024-33663', severity: 'high', title: 'python-jose ECDSA key confusion (CVE-2024-33663)', description: 'python-jose allows ECDSA key confusion — upgrade to >=3.3.0 or switch to PyJWT' },
                { pkg: 'python-jose', pattern: /python-jose/i, cve: 'CVE-2024-33664', severity: 'high', title: 'python-jose JWT algorithm confusion (CVE-2024-33664)', description: 'python-jose JWT algorithm confusion vulnerability — upgrade or switch to PyJWT' },
                { pkg: 'python-multipart', pattern: /python-multipart/i, cve: 'CVE-2026-24486', severity: 'critical', title: 'python-multipart DoS (CVE-2026-24486)', description: 'python-multipart denial of service via crafted multipart data — upgrade to >=0.0.18' },
              ];

              for (const known of knownCVEs) {
                if (known.pattern.test(manifestContent)) {
                  crossLangVulns.push({
                    title: known.title,
                    severity: known.severity,
                    location: { file: manifest, line: manifestContent.split('\n').findIndex(l => known.pattern.test(l)) + 1 },
                    description: known.description,
                    category: 'dependencies',
                  });
                }
              }
            }
          } catch {
            // Manifest doesn't exist
          }
        }

        // Convert JS/TS file paths to FilePath value objects for the SAST scanner
        const filePathObjects = jstsFiles.map(filePath => FilePath.create(filePath));

        // Run SAST scan on JS/TS files if requested and files exist
        let sastResult = null;
        if (payload.sast !== false && filePathObjects.length > 0) {
          const result = await scanner.scanFiles(filePathObjects);
          if (result.success) {
            sastResult = result.value;
          }
        }

        // Run DAST scan if URL provided and dast is enabled
        let dastResult = null;
        if (payload.dast && payload.targetUrl) {
          const result = await scanner.scanUrl(payload.targetUrl, {
            activeScanning: true,
            maxDepth: 3,
            timeout: 30000,
          });
          if (result.success) {
            dastResult = result.value;
          }
        }

        // Combine results from all scan sources - SAST, DAST, and cross-language patterns
        const crossLangSeverityCounts = {
          critical: crossLangVulns.filter(v => v.severity === 'critical').length,
          high: crossLangVulns.filter(v => v.severity === 'high').length,
          medium: crossLangVulns.filter(v => v.severity === 'medium').length,
          low: crossLangVulns.filter(v => v.severity === 'low').length,
          informational: crossLangVulns.filter(v => v.severity === 'informational').length,
        };

        const summary = {
          critical: (sastResult?.summary?.critical || 0) + (dastResult?.summary?.critical || 0) + crossLangSeverityCounts.critical,
          high: (sastResult?.summary?.high || 0) + (dastResult?.summary?.high || 0) + crossLangSeverityCounts.high,
          medium: (sastResult?.summary?.medium || 0) + (dastResult?.summary?.medium || 0) + crossLangSeverityCounts.medium,
          low: (sastResult?.summary?.low || 0) + (dastResult?.summary?.low || 0) + crossLangSeverityCounts.low,
          informational: (sastResult?.summary?.informational || 0) + (dastResult?.summary?.informational || 0) + crossLangSeverityCounts.informational,
        };

        // Extract top vulnerabilities from all sources
        const allVulns = [
          ...(sastResult?.vulnerabilities || []),
          ...(dastResult?.vulnerabilities || []),
          ...crossLangVulns,
        ];

        const topVulnerabilities = allVulns
          .sort((a, b) => {
            const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };
            return severityOrder[a.severity] - severityOrder[b.severity];
          })
          .slice(0, 10)
          .map(v => ({
            type: v.title,
            severity: v.severity,
            file: v.location.file,
            line: v.location.line,
            description: v.description,
          }));

        // Generate recommendations based on findings
        const recommendations = generateSecurityRecommendations(allVulns);

        return ok({
          vulnerabilities: allVulns.length,
          critical: summary.critical,
          high: summary.high,
          medium: summary.medium,
          low: summary.low,
          informational: summary.informational,
          topVulnerabilities,
          recommendations,
          scanTypes: {
            sast: payload.sast !== false,
            dast: payload.dast || false,
          },
          filesScanned: filesToScan.length,
          jstsFilesScanned: jstsFiles.length,
          otherFilesScanned: otherFiles.length,
          coverage: sastResult?.coverage,
          ...(otherFiles.length > 0 && jstsFiles.length === 0 ? {
            note: 'Non-JS/TS files were scanned with cross-language pattern matching. For deeper analysis, use language-specific security tools.',
          } : {}),
        });
      } catch (error) {
        return err(toError(error));
      }
    });

    // Register code indexing handler - REAL IMPLEMENTATION
    this.taskHandlers.set('index-code', async (task) => {
      const payload = task.payload as {
        target: string;
        incremental: boolean;
        includeTests?: boolean;
        languages?: string[];
      };

      try {
        const kg = this.getKnowledgeGraph();
        const targetPath = payload.target || process.cwd();
        const startTime = Date.now();

        // Discover files to index
        const filesToIndex = await discoverSourceFiles(targetPath, {
          includeTests: payload.includeTests !== false,
          languages: payload.languages,
        });

        if (filesToIndex.length === 0) {
          return ok({
            filesIndexed: 0,
            nodesCreated: 0,
            edgesCreated: 0,
            target: targetPath,
            incremental: payload.incremental || false,
            languages: payload.languages || [],
            duration: Date.now() - startTime,
            warning: `No source files found in ${targetPath}. Searched for: TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, C/C++, and more.`,
          });
        }

        // Use the real KnowledgeGraphService to index files
        const result = await kg.index({
          paths: filesToIndex,
          incremental: payload.incremental || false,
          includeTests: payload.includeTests !== false,
          languages: payload.languages,
        });

        if (!result.success) {
          return result;
        }

        const indexResult = result.value;

        // Detect languages from files
        const detectedLanguages = new Set<string>();
        const extToLang: Record<string, string> = {
          ts: 'typescript', tsx: 'typescript',
          js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
          py: 'python', pyw: 'python',
          go: 'go', rs: 'rust',
          java: 'java', kt: 'kotlin', kts: 'kotlin',
          rb: 'ruby', cs: 'csharp', php: 'php', swift: 'swift',
          c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
          scala: 'scala',
        };
        for (const file of filesToIndex) {
          const ext = path.extname(file).slice(1);
          const lang = extToLang[ext];
          if (lang) detectedLanguages.add(lang);
        }

        return ok({
          filesIndexed: indexResult.filesIndexed,
          nodesCreated: indexResult.nodesCreated,
          edgesCreated: indexResult.edgesCreated,
          target: targetPath,
          incremental: payload.incremental || false,
          languages: Array.from(detectedLanguages),
          duration: indexResult.duration,
          errors: indexResult.errors,
        });
      } catch (error) {
        return err(toError(error));
      }
    });

    // Register quality assessment handler - REAL IMPLEMENTATION
    this.taskHandlers.set('assess-quality', async (task) => {
      const payload = task.payload as {
        runGate: boolean;
        threshold: number;
        metrics: string[];
        sourceFiles?: string[];
        target?: string;
      };

      try {
        const analyzer = this.getQualityAnalyzer();
        const threshold = payload.threshold || 80;

        // Determine source files to analyze
        let sourceFiles: string[] = [];
        if (payload.sourceFiles && payload.sourceFiles.length > 0) {
          sourceFiles = payload.sourceFiles;
        } else if (payload.target) {
          sourceFiles = await discoverSourceFiles(payload.target, { includeTests: false });
        } else {
          sourceFiles = await discoverSourceFiles(process.cwd(), { includeTests: false });
        }

        if (sourceFiles.length === 0) {
          return ok({
            qualityScore: 0,
            passed: false,
            threshold,
            metrics: {
              coverage: 0,
              complexity: 0,
              maintainability: 0,
              testability: 0,
            },
            recommendations: ['No source files found for quality assessment'],
            warning: 'No source files found',
          });
        }

        // Use the real QualityAnalyzerService
        const result = await analyzer.analyzeQuality({
          sourceFiles,
          includeMetrics: payload.metrics || ['coverage', 'complexity', 'maintainability', 'testability'],
        });

        if (!result.success) {
          return result;
        }

        const report = result.value;
        const passed = report.score.overall >= threshold;

        // Convert metrics to the expected format
        const metrics: Record<string, number> = {};
        for (const metric of report.metrics) {
          metrics[metric.name] = metric.value;
        }

        return ok({
          qualityScore: report.score.overall,
          passed,
          threshold,
          metrics: {
            coverage: report.score.coverage,
            complexity: report.score.complexity,
            maintainability: report.score.maintainability,
            security: report.score.security,
            ...metrics,
          },
          recommendations: report.recommendations.map(r => `[${r.type}] ${r.title}: ${r.description}`),
          trends: report.trends.map(t => ({
            metric: t.metric,
            direction: t.direction,
            dataPoints: t.dataPoints.length,
          })),
          filesAnalyzed: sourceFiles.length,
        });
      } catch (error) {
        return err(toError(error));
      }
    });

    // Register test execution handler - runs real tests via child process
    this.taskHandlers.set('execute-tests', async (task) => {
      const payload = task.payload as {
        testFiles: string[];
        parallel: boolean;
        retryCount: number;
      };

      try {
        const { execSync } = await import('child_process');
        const testFiles = payload.testFiles || [];

        if (testFiles.length === 0) {
          return ok({
            total: 0, passed: 0, failed: 0, skipped: 0,
            duration: 0, coverage: 0, failedTests: [],
            warning: 'No test files specified. Provide testFiles array with paths to test files.',
          });
        }

        // Attempt to run tests using common test runners
        const cwd = process.cwd();
        let output: string;
        try {
          // Try vitest first, then jest, then mocha
          output = execSync(
            `npx vitest run ${testFiles.join(' ')} --reporter=json 2>/dev/null || npx jest ${testFiles.join(' ')} --json 2>/dev/null`,
            { cwd, timeout: 120000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
          );
        } catch (execError) {
          // Test runner may exit non-zero when tests fail — that's expected
          output = (execError as { stdout?: string }).stdout || '';
        }

        // Try to parse JSON output from test runner
        try {
          const jsonStart = output.indexOf('{');
          if (jsonStart >= 0) {
            const json = JSON.parse(output.slice(jsonStart));
            // vitest format
            if (json.testResults) {
              const total = json.numTotalTests || 0;
              const passed = json.numPassedTests || 0;
              const failed = json.numFailedTests || 0;
              return ok({ total, passed, failed, skipped: total - passed - failed, duration: 0, coverage: 0, failedTests: [] });
            }
          }
        } catch {
          // JSON parsing failed — return raw info
        }

        return ok({
          total: testFiles.length, passed: 0, failed: 0, skipped: 0,
          duration: 0, coverage: 0, failedTests: [],
          warning: 'Could not parse test runner output. Check that vitest or jest is installed.',
          rawOutput: output.slice(0, 500),
        });
      } catch (error) {
        return err(toError(error));
      }
    });

    // Register defect prediction handler - REAL IMPLEMENTATION
    this.taskHandlers.set('predict-defects', async (task) => {
      const payload = task.payload as {
        target: string;
        minConfidence: number;
      };

      try {
        const targetPath = payload.target || process.cwd();
        const minConfidence = payload.minConfidence || 0.5;

        // Discover actual source files in the target directory
        const sourceFiles = await discoverSourceFiles(targetPath, { includeTests: false });

        if (sourceFiles.length === 0) {
          return ok({
            predictedDefects: [],
            riskScore: 0,
            recommendations: [
              `No source files found in ${targetPath}. Ensure the path contains source code files.`,
            ],
            warning: `No source files found in ${targetPath}`,
            filesAnalyzed: 0,
          });
        }

        // Analyze each file for defect indicators based on real metrics
        const predictedDefects: Array<{ file: string; probability: number; reason: string }> = [];

        for (const filePath of sourceFiles) {
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            const lineCount = lines.length;

            // Calculate complexity indicators from real code
            let probability = 0;
            const reasons: string[] = [];

            // Factor 1: File size (large files are more defect-prone)
            if (lineCount > 500) {
              probability += 0.25;
              reasons.push(`Large file (${lineCount} lines)`);
            } else if (lineCount > 300) {
              probability += 0.15;
              reasons.push(`Medium-large file (${lineCount} lines)`);
            }

            // Factor 2: Cyclomatic complexity indicators
            const branchKeywords = content.match(/\b(if|else|switch|case|for|while|catch|&&|\|\|)\b/g) || [];
            const branchDensity = branchKeywords.length / Math.max(lineCount, 1);
            if (branchDensity > 0.15) {
              probability += 0.25;
              reasons.push(`High branch density (${branchKeywords.length} branches in ${lineCount} lines)`);
            } else if (branchDensity > 0.08) {
              probability += 0.10;
              reasons.push('Moderate branch complexity');
            }

            // Factor 3: Deeply nested code
            const maxIndent = Math.max(...lines.map(l => {
              const match = l.match(/^(\s*)/);
              return match ? match[1].length : 0;
            }));
            if (maxIndent > 20) {
              probability += 0.15;
              reasons.push('Deep nesting detected');
            }

            // Factor 4: TODO/FIXME/HACK comments
            const debtComments = (content.match(/\b(TODO|FIXME|HACK|XXX|WORKAROUND)\b/gi) || []).length;
            if (debtComments > 3) {
              probability += 0.15;
              reasons.push(`${debtComments} technical debt markers`);
            }

            // Factor 5: Long functions (heuristic)
            const functionStarts = (content.match(/\b(function|def|func|async)\b/g) || []).length;
            if (functionStarts > 0 && lineCount / functionStarts > 80) {
              probability += 0.10;
              reasons.push('Potentially long functions');
            }

            probability = Math.min(probability, 0.95);

            if (probability >= minConfidence) {
              // Use relative path for readability
              const relativePath = filePath.startsWith(targetPath)
                ? filePath.slice(targetPath.length).replace(/^\//, '')
                : filePath;
              predictedDefects.push({
                file: relativePath,
                probability: Math.round(probability * 100) / 100,
                reason: reasons.join('; '),
              });
            }
          } catch {
            // Skip files that can't be read
          }
        }

        // Sort by probability descending
        predictedDefects.sort((a, b) => b.probability - a.probability);

        // Calculate overall risk score
        const avgProb = predictedDefects.length > 0
          ? predictedDefects.reduce((sum, d) => sum + d.probability, 0) / predictedDefects.length
          : 0;
        const riskScore = Math.round(avgProb * 100);

        // Generate recommendations from actual findings
        const recommendations: string[] = [];
        if (predictedDefects.length > 0) {
          recommendations.push(`${predictedDefects.length} files flagged for potential defects out of ${sourceFiles.length} analyzed`);
          const topFile = predictedDefects[0];
          recommendations.push(`Highest risk: ${topFile.file} (${Math.round(topFile.probability * 100)}%) — ${topFile.reason}`);
        }
        if (predictedDefects.some(d => d.reason.includes('Large file'))) {
          recommendations.push('Consider splitting large files to reduce complexity');
        }
        if (predictedDefects.some(d => d.reason.includes('technical debt'))) {
          recommendations.push('Address TODO/FIXME comments to reduce technical debt');
        }
        if (predictedDefects.length === 0) {
          recommendations.push('No files exceeded the defect probability threshold — code looks healthy');
        }

        return ok({
          predictedDefects: predictedDefects.slice(0, 20), // Top 20
          riskScore,
          recommendations,
          filesAnalyzed: sourceFiles.length,
        });
      } catch (error) {
        return err(toError(error));
      }
    });

    // Register requirements validation handler
    this.taskHandlers.set('validate-requirements', async (task) => {
      const payload = task.payload as {
        requirementsPath?: string;
        generateBDD: boolean;
      };

      try {
        const targetPath = payload.requirementsPath || process.cwd();
        // Look for requirements files (markdown, feature files, etc.)
        const reqFiles = await discoverSourceFiles(targetPath, {
          includeTests: false,
          languages: [],
        });
        // Scan for requirement-like files
        const reqPatterns = ['.md', '.feature', '.gherkin', '.txt', '.rst'];
        const requirementFiles: string[] = [];
        for (const f of reqFiles) {
          if (reqPatterns.some(ext => f.endsWith(ext))) {
            requirementFiles.push(f);
          }
        }

        return ok({
          requirementsAnalyzed: requirementFiles.length,
          testable: 0,
          ambiguous: 0,
          untestable: 0,
          coverage: 0,
          bddScenarios: [],
          warning: requirementFiles.length === 0
            ? 'No requirement files (.md, .feature, .gherkin) found. Provide requirementsPath or add requirement docs.'
            : 'Requirements validation requires LLM analysis. File inventory returned — use task_orchestrate for deep analysis.',
          files: requirementFiles.map(f => f.startsWith(targetPath) ? f.slice(targetPath.length + 1) : f).slice(0, 20),
        });
      } catch (error) {
        return err(toError(error));
      }
    });

    // Register contract validation handler
    this.taskHandlers.set('validate-contracts', async (task) => {
      const payload = task.payload as {
        contractPath: string;
        checkBreakingChanges: boolean;
      };

      try {
        if (!payload.contractPath) {
          return ok({
            contractPath: '',
            valid: false,
            breakingChanges: [],
            warnings: [],
            coverage: 0,
            error: 'contractPath is required. Provide a path to an OpenAPI spec, JSON Schema, or Protocol Buffer file.',
          });
        }

        // Check if the contract file exists
        try {
          const content = await fs.readFile(payload.contractPath, 'utf-8');
          const isJson = payload.contractPath.endsWith('.json');
          const isYaml = payload.contractPath.endsWith('.yaml') || payload.contractPath.endsWith('.yml');

          // Basic structural validation
          if (isJson) {
            JSON.parse(content); // throws if invalid
          }

          return ok({
            contractPath: payload.contractPath,
            valid: true,
            format: isJson ? 'json' : isYaml ? 'yaml' : 'unknown',
            breakingChanges: [],
            warnings: [],
            linesAnalyzed: content.split('\n').length,
            note: 'Structural validation passed. For semantic contract testing, use consumer-driven contract tests.',
          });
        } catch (readErr) {
          return ok({
            contractPath: payload.contractPath,
            valid: false,
            breakingChanges: [],
            warnings: [],
            error: `Could not read or parse contract file: ${toErrorMessage(readErr)}`,
          });
        }
      } catch (error) {
        return err(toError(error));
      }
    });

    // Register accessibility test handler
    this.taskHandlers.set('test-accessibility', async (task) => {
      const payload = task.payload as {
        url: string;
        standard: string;
      };

      // Accessibility testing requires a browser/DOM — return honest guidance
      return ok({
        url: payload.url || '',
        standard: payload.standard || 'wcag21-aa',
        passed: false,
        violations: [],
        warnings: [],
        score: 0,
        note: 'Accessibility testing requires a browser environment (Puppeteer/Playwright). ' +
              'Use tools like axe-core, pa11y, or Lighthouse CLI for WCAG compliance testing. ' +
              'Example: npx pa11y ' + (payload.url || '<url>'),
      });
    });

    // Register chaos test handler
    this.taskHandlers.set('run-chaos', async (task) => {
      const payload = task.payload as {
        faultType: string;
        target: string;
        duration: number;
        dryRun: boolean;
      };

      // Chaos testing requires infrastructure access — return honest guidance
      return ok({
        faultType: payload.faultType || 'unknown',
        target: payload.target || 'unknown',
        dryRun: payload.dryRun ?? true,
        duration: payload.duration || 0,
        systemBehavior: 'not-executed',
        resilience: null,
        note: 'Chaos engineering requires infrastructure-level fault injection. ' +
              'Use tools like Chaos Monkey, Litmus, or toxiproxy for real resilience testing. ' +
              'For Node.js apps, consider: nock (HTTP faults), testcontainers (dependency failures).',
      });
    });

    // Register learning optimization handler
    this.taskHandlers.set('optimize-learning', async (_task) => {
      // Check actual pattern store state
      try {
        const memUsage = await import('../kernel/unified-memory-hnsw.js');
        return ok({
          patternsLearned: 0,
          modelsUpdated: 0,
          memoryConsolidated: false,
          note: 'Learning optimization runs during the dream cycle (SessionEnd hook). ' +
                'Use "npx agentic-qe hooks session-end --save-state" to trigger pattern consolidation.',
        });
      } catch {
        return ok({
          patternsLearned: 0,
          modelsUpdated: 0,
          memoryConsolidated: false,
          note: 'Learning system not initialized. Run "aqe init --auto" first.',
        });
      }
    });
  }

  // ============================================================================
  // ADR-051: Agent Booster Execution (Tier 0)
  // ============================================================================

  /**
   * Execute task using Agent Booster for mechanical transforms
   * Falls back to normal execution if transform not applicable or low confidence
   */
  private async executeWithAgentBooster(
    task: QueenTask,
    startTime: number,
    domain: DomainName
  ): Promise<TaskResult | null> {
    const transformType = detectTransformType(task);

    if (!transformType) {
      // No applicable transform - return null to trigger fallback
      console.debug(`[TaskExecutor] No applicable Agent Booster transform for task ${task.id}`);
      return null;
    }

    try {
      const booster = await this.getAgentBooster();
      const codeContext = (task.payload as Record<string, unknown>)?.codeContext as string ||
                          (task.payload as Record<string, unknown>)?.sourceCode as string || '';

      const result = await booster.transform(codeContext, transformType);

      if (result.success && result.confidence >= 0.7) {
        console.debug(`[TaskExecutor] Agent Booster transform succeeded: ${transformType}, confidence=${result.confidence}`);

        return {
          taskId: task.id,
          success: true,
          data: {
            transformed: true,
            transformType,
            originalCode: result.originalCode,
            transformedCode: result.transformedCode,
            confidence: result.confidence,
            implementationUsed: result.implementationUsed,
            durationMs: result.durationMs,
            changeCount: result.changeCount,
            tier: 0,
            model: 'agent-booster',
          },
          duration: Date.now() - startTime,
          domain,
        };
      }

      // Low confidence - return null to trigger fallback to Tier 1
      console.debug(`[TaskExecutor] Agent Booster low confidence (${result.confidence}), falling back to Tier 1`);
      return null;
    } catch (error) {
      console.warn(`[TaskExecutor] Agent Booster error, falling back: ${error}`);
      return null;
    }
  }

  // ============================================================================
  // ADR-051: Outcome Recording for TinyDancer Learning
  // ============================================================================

  /**
   * Record task outcome for TinyDancer learning loop
   * Uses fire-and-forget pattern to not block task completion
   */
  private async recordOutcome(
    task: QueenTask,
    tier: number,
    success: boolean,
    durationMs: number
  ): Promise<void> {
    try {
      const router = await this.getTaskRouterInstance();
      if (!router) return;

      // Log outcome for debugging and metrics
      console.debug(
        `[TaskExecutor] Outcome recorded: task=${task.id}, tier=${tier}, ` +
        `model=${getModelForTier(tier)}, success=${success}, duration=${durationMs}ms`
      );

      // ADR-023: Record routing outcome for learning feedback loop
      if (this.qualityFeedbackLoop) {
        const targetDomains = task.targetDomains || [];
        await this.qualityFeedbackLoop.recordRoutingOutcome({
          taskId: task.id,
          taskDescription: task.type,
          recommendedAgent: String(tier),
          usedAgent: String(tier),
          followedRecommendation: true,
          success,
          qualityScore: success ? 0.8 : 0.2,
          durationMs,
          timestamp: new Date(),
          error: success ? undefined : 'Task execution failed',
        });
      }
    } catch (error) {
      // Don't fail task execution if metrics recording fails
      console.warn('[TaskExecutor] Failed to record outcome:', error);
    }
  }

  /**
   * Execute a task and return results
   * ADR-051: Now reads routingTier from payload and routes appropriately
   */
  async execute(task: QueenTask): Promise<TaskResult> {
    const startTime = Date.now();
    const domain = this.getTaskDomain(task.type);

    // ADR-051: Extract routing tier from payload (default to Tier 2 - Sonnet)
    const payload = task.payload as Record<string, unknown>;
    const routingTier = (payload?.routingTier as number) ?? 2;
    const useAgentBooster = (payload?.useAgentBooster as boolean) ?? false;
    const modelId = getModelForTier(routingTier);

    console.debug(
      `[TaskExecutor] Executing task ${task.id}: type=${task.type}, ` +
      `tier=${routingTier}, model=${modelId}, useAgentBooster=${useAgentBooster}`
    );

    try {
      // ADR-051: Tier 0 - Try Agent Booster for mechanical transforms
      if (routingTier === 0 || useAgentBooster) {
        const boosterResult = await this.executeWithAgentBooster(task, startTime, domain);
        if (boosterResult) {
          // Agent Booster succeeded - record outcome and return
          this.recordOutcome(task, 0, true, Date.now() - startTime).catch(() => {});
          await this.publishTaskCompleted(task.id, boosterResult.data, domain);
          return boosterResult;
        }
        // Fall through to normal execution with Tier 1 (Haiku) as fallback
        console.debug(`[TaskExecutor] Agent Booster fallback to Tier 1 for task ${task.id}`);
      }

      const handler = this.taskHandlers.get(task.type);

      if (!handler) {
        const result = {
          taskId: task.id,
          success: false,
          error: `No handler registered for task type: ${task.type}`,
          duration: Date.now() - startTime,
          domain,
        };
        this.recordOutcome(task, routingTier, false, Date.now() - startTime).catch(() => {});
        return result;
      }

      // Execute with timeout
      const result = await Promise.race([
        handler(task),
        this.timeout(task.timeout || this.config.timeout),
      ]);

      if (!result.success) {
        const errorMsg = 'error' in result ? (result.error as Error).message : 'Unknown error';
        await this.publishTaskFailed(task.id, errorMsg, domain);
        // ADR-051: Record failed outcome
        this.recordOutcome(task, routingTier, false, Date.now() - startTime).catch(() => {});
        return {
          taskId: task.id,
          success: false,
          error: errorMsg,
          duration: Date.now() - startTime,
          domain,
        };
      }

      await this.publishTaskCompleted(task.id, result.value, domain);

      // ADR-051: Record successful outcome
      this.recordOutcome(task, routingTier, true, Date.now() - startTime).catch(() => {});

      // Save results to files if enabled
      let savedFiles: string[] | undefined;
      if (this.config.saveResults) {
        try {
          const saveOptions: SaveOptions = {
            language: payload?.language as string || this.config.defaultLanguage,
            framework: payload?.framework as string || this.config.defaultFramework,
            includeSecondary: true,
          };
          const saved = await this.resultSaver.save(task.id, task.type, result.value, saveOptions);
          savedFiles = saved.files.map(f => f.path);
        } catch (saveError) {
          // Log but don't fail the task if saving fails
          console.error(`[TaskExecutor] Failed to save results: ${saveError}`);
        }
      }

      return {
        taskId: task.id,
        success: true,
        data: {
          ...(result.value as object),
          // ADR-051: Include routing metadata in result
          _routing: {
            tier: routingTier,
            model: modelId,
            usedAgentBooster: false,
          },
        },
        duration: Date.now() - startTime,
        domain,
        savedFiles,
      };
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      await this.publishTaskFailed(task.id, errorMessage, domain);
      // ADR-051: Record failed outcome
      this.recordOutcome(task, routingTier, false, Date.now() - startTime).catch(() => {});

      return {
        taskId: task.id,
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
        domain,
      };
    }
  }

  /**
   * Reset cached services - call when disposing fleet/kernel
   * to ensure services don't hold references to disposed memory backends.
   * Instance method replaces the former module-level resetServiceCaches().
   */
  async resetServiceCaches(): Promise<void> {
    this.coverageAnalyzer = null;
    this.securityScanner = null;
    this.testGenerator = null;
    this.knowledgeGraph = null;
    this.qualityAnalyzer = null;

    // ADR-051: Also reset Agent Booster and Task Router
    if (this.agentBooster) {
      try {
        await this.agentBooster.dispose();
      } catch (error) {
        // Non-critical: disposal errors don't affect subsequent operations
        console.debug('[TaskExecutor] Agent Booster disposal error:', error instanceof Error ? error.message : error);
      }
      this.agentBooster = null;
    }
    this.taskRouter = null;
  }

  /**
   * Sync version for backwards compatibility
   */
  resetServiceCachesSync(): void {
    this.coverageAnalyzer = null;
    this.securityScanner = null;
    this.testGenerator = null;
    this.knowledgeGraph = null;
    this.qualityAnalyzer = null;
    this.agentBooster = null;
    this.taskRouter = null;
  }

  private getTaskDomain(taskType: TaskType): DomainName {
    const domainMap: Record<TaskType, DomainName> = {
      'generate-tests': 'test-generation',
      'execute-tests': 'test-execution',
      'analyze-coverage': 'coverage-analysis',
      'assess-quality': 'quality-assessment',
      'predict-defects': 'defect-intelligence',
      'validate-requirements': 'requirements-validation',
      'index-code': 'code-intelligence',
      'scan-security': 'security-compliance',
      'validate-contracts': 'contract-testing',
      'test-accessibility': 'visual-accessibility',
      'run-chaos': 'chaos-resilience',
      'optimize-learning': 'learning-optimization',
      'cross-domain-workflow': 'learning-optimization',
      'protocol-execution': 'learning-optimization',
      'ideation-assessment': 'requirements-validation',
    };
    return domainMap[taskType] || 'learning-optimization';
  }

  private async timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Task execution timed out after ${ms}ms`)), ms);
    });
  }

  private async publishTaskCompleted(taskId: string, result: unknown, domain: DomainName): Promise<void> {
    await this.eventBus.publish({
      id: uuidv4(),
      type: 'TaskCompleted',
      timestamp: new Date(),
      source: domain,
      payload: { taskId, result },
    });
  }

  private async publishTaskFailed(taskId: string, error: string, domain: DomainName): Promise<void> {
    await this.eventBus.publish({
      id: uuidv4(),
      type: 'TaskFailed',
      timestamp: new Date(),
      source: domain,
      payload: { taskId, error },
    });
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTaskExecutor(
  kernel: QEKernel,
  config?: Partial<TaskExecutorConfig>
): DomainTaskExecutor {
  return new DomainTaskExecutor(kernel, kernel.eventBus, config);
}

/**
 * Reset cached services on a specific executor instance.
 * This is the module-level wrapper for backwards compatibility with
 * callers that import resetServiceCaches() directly.
 * It requires the caller to also call resetTaskExecutor() which nullifies
 * the cached executor - so the next getTaskExecutor() creates a fresh instance
 * with clean caches. This function is now a no-op since caches are instance-level.
 *
 * @deprecated Prefer calling executor.resetServiceCaches() on the instance directly.
 */
export async function resetServiceCaches(): Promise<void> {
  // No-op: service caches are now instance-level properties.
  // When the cached executor is nullified by resetTaskExecutor(),
  // the old instance (and its caches) become eligible for GC.
  // The next executor instance starts with fresh null caches.
}

/**
 * Sync version for backwards compatibility
 * @deprecated Prefer calling executor.resetServiceCachesSync() on the instance directly.
 */
export function resetServiceCachesSync(): void {
  // No-op: service caches are now instance-level properties.
}
