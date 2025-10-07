/**
 * CoverageCollector - Real Implementation
 * @module coverage/coverage-collector
 * @description Collects code coverage data during test execution using c8/nyc
 */

import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import type { CoverageMap, FileCoverageData } from 'istanbul-lib-coverage';

export interface CoverageData {
  lines: { total: number; covered: number; percentage: number };
  branches: { total: number; covered: number; percentage: number };
  functions: { total: number; covered: number; percentage: number };
  statements: { total: number; covered: number; percentage: number };
}

export interface FileCoverage {
  path: string;
  coverage: CoverageData;
  uncoveredLines: number[];
  uncoveredBranches: Array<{ line: number; branch: number }>;
}

export interface CoverageCollectorConfig {
  tool?: 'c8' | 'nyc' | 'auto';
  tempDir?: string;
  include?: string[];
  exclude?: string[];
  reporter?: string[];
}

/**
 * Real implementation of CoverageCollector using c8/nyc
 */
export class CoverageCollector {
  private coverage: Map<string, FileCoverage>;
  private config: Required<CoverageCollectorConfig>;
  private isCollecting: boolean;
  private coverageDir: string;

  constructor(config: CoverageCollectorConfig = {}) {
    this.coverage = new Map();
    this.isCollecting = false;
    this.coverageDir = config.tempDir || path.join(process.cwd(), '.coverage-temp');

    this.config = {
      tool: config.tool || 'auto',
      tempDir: this.coverageDir,
      include: config.include || ['src/**/*.ts', 'src/**/*.js'],
      exclude: config.exclude || [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        '**/*.test.ts',
        '**/*.test.js',
        '**/*.spec.ts',
        '**/*.spec.js'
      ],
      reporter: config.reporter || ['json', 'text', 'html']
    };
  }

  /**
   * Starts coverage collection
   */
  async start(): Promise<void> {
    if (this.isCollecting) {
      throw new Error('Coverage collection already in progress');
    }

    // Ensure coverage directory exists
    await fs.ensureDir(this.coverageDir);
    this.isCollecting = true;
  }

  /**
   * Stops coverage collection
   */
  async stop(): Promise<void> {
    if (!this.isCollecting) {
      throw new Error('Coverage collection not in progress');
    }
    this.isCollecting = false;
  }

  /**
   * Executes tests with coverage collection
   */
  async executeWithCoverage(
    testCommand: string,
    args: string[] = []
  ): Promise<{ exitCode: number; coverage: FileCoverage[] }> {
    const tool = this.detectTool();
    const result = await this.runWithCoverageTool(tool, testCommand, args);

    if (result.status === 0 || result.status === null) {
      const coverageData = await this.loadCoverageData();
      return { exitCode: result.status || 0, coverage: coverageData };
    }

    return { exitCode: result.status, coverage: [] };
  }

  /**
   * Detects which coverage tool to use
   */
  private detectTool(): 'c8' | 'nyc' {
    if (this.config.tool !== 'auto') {
      return this.config.tool;
    }

    // Check if project uses ESM (prefer c8) or CommonJS (prefer nyc)
    try {
      const packageJson = require(path.join(process.cwd(), 'package.json'));
      if (packageJson.type === 'module') {
        return 'c8';
      }
    } catch {
      // Ignore error, use default
    }

    // Default to c8 for modern projects
    return 'c8';
  }

  /**
   * Runs tests with coverage tool
   */
  private async runWithCoverageTool(
    tool: 'c8' | 'nyc',
    testCommand: string,
    args: string[]
  ): Promise<SpawnSyncReturns<Buffer>> {
    const coverageArgs = this.buildCoverageArgs(tool);
    const [command, ...commandArgs] = testCommand.split(' ');

    const fullArgs = [
      ...coverageArgs,
      command,
      ...commandArgs,
      ...args
    ];

    return spawnSync('npx', [tool, ...fullArgs], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });
  }

  /**
   * Builds coverage tool arguments
   */
  private buildCoverageArgs(tool: 'c8' | 'nyc'): string[] {
    const args: string[] = [];

    if (tool === 'c8') {
      args.push(
        '--reporter=json',
        '--reporter=text',
        '--reporter=html',
        `--temp-directory=${this.coverageDir}`,
        `--report-dir=${this.coverageDir}/reports`
      );

      // Add include patterns
      this.config.include.forEach(pattern => {
        args.push(`--include=${pattern}`);
      });

      // Add exclude patterns
      this.config.exclude.forEach(pattern => {
        args.push(`--exclude=${pattern}`);
      });
    } else {
      // nyc configuration
      args.push(
        '--reporter=json',
        '--reporter=text',
        '--reporter=html',
        `--temp-dir=${this.coverageDir}`,
        `--report-dir=${this.coverageDir}/reports`
      );

      // Include/exclude patterns
      this.config.include.forEach(pattern => {
        args.push(`--include=${pattern}`);
      });

      this.config.exclude.forEach(pattern => {
        args.push(`--exclude=${pattern}`);
      });
    }

    return args;
  }

  /**
   * Loads coverage data from JSON file
   */
  private async loadCoverageData(): Promise<FileCoverage[]> {
    const coverageFiles = [
      path.join(this.coverageDir, 'coverage-final.json'),
      path.join(this.coverageDir, 'reports', 'coverage-final.json')
    ];

    let coverageJson: CoverageMap | null = null;

    for (const file of coverageFiles) {
      if (await fs.pathExists(file)) {
        const data = await fs.readJson(file);
        coverageJson = data as CoverageMap;
        break;
      }
    }

    if (!coverageJson) {
      throw new Error('Coverage data not found. Ensure tests ran with coverage enabled.');
    }

    return this.parseCoverageMap(coverageJson);
  }

  /**
   * Parses Istanbul coverage map
   */
  private parseCoverageMap(coverageMap: CoverageMap): FileCoverage[] {
    const fileCoverages: FileCoverage[] = [];

    // Handle both old and new Istanbul formats
    const files = (coverageMap as any).default || coverageMap;

    for (const [filePath, fileData] of Object.entries(files)) {
      const data = fileData as FileCoverageData;
      const fileCoverage = this.parseFileCoverage(filePath, data);
      fileCoverages.push(fileCoverage);
      this.coverage.set(filePath, fileCoverage);
    }

    return fileCoverages;
  }

  /**
   * Parses file coverage data
   */
  private parseFileCoverage(filePath: string, data: FileCoverageData): FileCoverage {
    // Calculate line coverage
    const lineMap = data.statementMap || data.s || {};
    const lineCounts = data.s || {};
    const totalLines = Object.keys(lineMap).length;
    const coveredLines = Object.values(lineCounts).filter(count => count > 0).length;

    // Calculate branch coverage
    const branchMap = data.branchMap || data.b || {};
    const branchCounts = data.b || {};
    let totalBranches = 0;
    let coveredBranches = 0;

    for (const [branchId, branches] of Object.entries(branchCounts)) {
      if (Array.isArray(branches)) {
        totalBranches += branches.length;
        coveredBranches += branches.filter(count => count > 0).length;
      }
    }

    // Calculate function coverage
    const functionMap = data.fnMap || data.f || {};
    const functionCounts = data.f || {};
    const totalFunctions = Object.keys(functionMap).length;
    const coveredFunctions = Object.values(functionCounts).filter(count => count > 0).length;

    // Calculate statement coverage
    const statementCounts = data.s || {};
    const totalStatements = Object.keys(statementCounts).length;
    const coveredStatements = Object.values(statementCounts).filter(count => count > 0).length;

    // Find uncovered lines
    const uncoveredLines: number[] = [];
    for (const [id, count] of Object.entries(lineCounts)) {
      if (count === 0 && lineMap[id]) {
        const location = lineMap[id] as any;
        if (location.start?.line) {
          uncoveredLines.push(location.start.line);
        }
      }
    }

    // Find uncovered branches
    const uncoveredBranches: Array<{ line: number; branch: number }> = [];
    for (const [branchId, branches] of Object.entries(branchCounts)) {
      if (Array.isArray(branches)) {
        branches.forEach((count, idx) => {
          if (count === 0 && branchMap[branchId]) {
            const branch = branchMap[branchId] as any;
            if (branch.locations?.[idx]?.start?.line) {
              uncoveredBranches.push({
                line: branch.locations[idx].start.line,
                branch: idx
              });
            }
          }
        });
      }
    }

    return {
      path: filePath,
      coverage: {
        lines: {
          total: totalLines,
          covered: coveredLines,
          percentage: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0
        },
        branches: {
          total: totalBranches,
          covered: coveredBranches,
          percentage: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0
        },
        functions: {
          total: totalFunctions,
          covered: coveredFunctions,
          percentage: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0
        },
        statements: {
          total: totalStatements,
          covered: coveredStatements,
          percentage: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0
        }
      },
      uncoveredLines: uncoveredLines.sort((a, b) => a - b),
      uncoveredBranches: uncoveredBranches.sort((a, b) => a.line - b.line)
    };
  }

  /**
   * Collects coverage for a specific file
   */
  async collect(filePath: string): Promise<FileCoverage> {
    const existing = this.coverage.get(filePath);
    if (existing) {
      return existing;
    }

    // If not in collected data, return empty coverage
    const emptyCoverage: FileCoverage = {
      path: filePath,
      coverage: {
        lines: { total: 0, covered: 0, percentage: 0 },
        branches: { total: 0, covered: 0, percentage: 0 },
        functions: { total: 0, covered: 0, percentage: 0 },
        statements: { total: 0, covered: 0, percentage: 0 }
      },
      uncoveredLines: [],
      uncoveredBranches: []
    };

    this.coverage.set(filePath, emptyCoverage);
    return emptyCoverage;
  }

  /**
   * Gets all collected coverage data
   */
  getData(): FileCoverage[] {
    return Array.from(this.coverage.values());
  }

  /**
   * Gets total coverage summary
   */
  getTotalCoverage(): CoverageData {
    const coverages = this.getData();

    if (coverages.length === 0) {
      return {
        lines: { total: 0, covered: 0, percentage: 0 },
        branches: { total: 0, covered: 0, percentage: 0 },
        functions: { total: 0, covered: 0, percentage: 0 },
        statements: { total: 0, covered: 0, percentage: 0 }
      };
    }

    const totals = coverages.reduce(
      (acc, fc) => ({
        lines: {
          total: acc.lines.total + fc.coverage.lines.total,
          covered: acc.lines.covered + fc.coverage.lines.covered
        },
        branches: {
          total: acc.branches.total + fc.coverage.branches.total,
          covered: acc.branches.covered + fc.coverage.branches.covered
        },
        functions: {
          total: acc.functions.total + fc.coverage.functions.total,
          covered: acc.functions.covered + fc.coverage.functions.covered
        },
        statements: {
          total: acc.statements.total + fc.coverage.statements.total,
          covered: acc.statements.covered + fc.coverage.statements.covered
        }
      }),
      {
        lines: { total: 0, covered: 0 },
        branches: { total: 0, covered: 0 },
        functions: { total: 0, covered: 0 },
        statements: { total: 0, covered: 0 }
      }
    );

    return {
      lines: {
        total: totals.lines.total,
        covered: totals.lines.covered,
        percentage: totals.lines.total > 0
          ? (totals.lines.covered / totals.lines.total) * 100
          : 0
      },
      branches: {
        total: totals.branches.total,
        covered: totals.branches.covered,
        percentage: totals.branches.total > 0
          ? (totals.branches.covered / totals.branches.total) * 100
          : 0
      },
      functions: {
        total: totals.functions.total,
        covered: totals.functions.covered,
        percentage: totals.functions.total > 0
          ? (totals.functions.covered / totals.functions.total) * 100
          : 0
      },
      statements: {
        total: totals.statements.total,
        covered: totals.statements.covered,
        percentage: totals.statements.total > 0
          ? (totals.statements.covered / totals.statements.total) * 100
          : 0
      }
    };
  }

  /**
   * Merges coverage from multiple sources
   */
  async mergeCoverage(otherCoverages: FileCoverage[]): Promise<void> {
    for (const coverage of otherCoverages) {
      this.coverage.set(coverage.path, coverage);
    }
  }

  /**
   * Resets coverage data
   */
  reset(): void {
    this.coverage.clear();
  }

  /**
   * Cleans up temporary coverage files
   */
  async cleanup(): Promise<void> {
    if (await fs.pathExists(this.coverageDir)) {
      await fs.remove(this.coverageDir);
    }
  }
}
