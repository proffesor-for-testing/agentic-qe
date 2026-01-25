/**
 * CoverageReporter - Real Implementation
 * @module coverage/coverage-reporter
 * @description Generates coverage reports in various formats (HTML, JSON, LCOV, Text)
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import type { CoverageData, FileCoverage } from './coverage-collector';

export interface ReportConfig {
  format?: 'html' | 'json' | 'lcov' | 'text' | 'cobertura';
  outputDir?: string;
  includeDetails?: boolean;
  projectName?: string;
  timestamp?: boolean;
}

export interface CoverageReport {
  format: string;
  content: string;
  timestamp: number;
  summary: CoverageData;
}

/**
 * Real implementation of CoverageReporter
 */
export class CoverageReporter {
  private config: Required<ReportConfig>;

  constructor(config: ReportConfig = {}) {
    this.config = {
      format: config.format ?? 'json',
      outputDir: config.outputDir ?? './coverage',
      includeDetails: config.includeDetails ?? true,
      projectName: config.projectName ?? 'Project',
      timestamp: config.timestamp ?? true
    };
  }

  /**
   * Generates a coverage report
   */
  async generate(coverageData: FileCoverage[]): Promise<CoverageReport> {
    const summary = this.calculateSummary(coverageData);
    let content: string;

    switch (this.config.format) {
      case 'html':
        content = await this.generateHTML(coverageData, summary);
        break;
      case 'json':
        content = await this.generateJSON(coverageData, summary);
        break;
      case 'lcov':
        content = await this.generateLCOV(coverageData);
        break;
      case 'text':
        content = await this.generateText(coverageData, summary);
        break;
      case 'cobertura':
        content = await this.generateCobertura(coverageData, summary);
        break;
      default:
        content = await this.generateJSON(coverageData, summary);
    }

    return {
      format: this.config.format,
      content,
      timestamp: Date.now(),
      summary
    };
  }

  /**
   * Generates HTML report
   */
  async generateHTML(coverageData: FileCoverage[], summary: CoverageData): Promise<string> {
    const timestamp = new Date().toISOString();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Coverage Report - ${this.config.projectName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 10px; font-size: 28px; }
    .timestamp { color: #666; font-size: 14px; margin-bottom: 30px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }
    .metric { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px; color: white; }
    .metric.low { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
    .metric.medium { background: linear-gradient(135deg, #ffc837 0%, #ff8008 100%); }
    .metric.high { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
    .metric h3 { font-size: 14px; opacity: 0.9; margin-bottom: 8px; font-weight: 500; }
    .metric .value { font-size: 36px; font-weight: bold; margin-bottom: 4px; }
    .metric .detail { font-size: 14px; opacity: 0.8; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; }
    th { background: #f8f9fa; font-weight: 600; color: #333; }
    tr:hover { background: #f8f9fa; }
    .bar { height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden; position: relative; }
    .bar-fill { height: 100%; transition: width 0.3s ease; }
    .bar-fill.low { background: linear-gradient(90deg, #f5576c 0%, #f093fb 100%); }
    .bar-fill.medium { background: linear-gradient(90deg, #ff8008 0%, #ffc837 100%); }
    .bar-fill.high { background: linear-gradient(90deg, #00f2fe 0%, #4facfe 100%); }
    .percentage { font-weight: bold; }
    .percentage.low { color: #f5576c; }
    .percentage.medium { color: #ff8008; }
    .percentage.high { color: #4facfe; }
    .file-path { color: #666; font-size: 13px; }
    .uncovered-info { color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Coverage Report - ${this.config.projectName}</h1>
    <div class="timestamp">Generated: ${timestamp}</div>

    <div class="summary">
      <div class="metric ${this.getCoverageClass(summary.lines.percentage)}">
        <h3>Lines</h3>
        <div class="value">${summary.lines.percentage.toFixed(1)}%</div>
        <div class="detail">${summary.lines.covered} / ${summary.lines.total}</div>
      </div>
      <div class="metric ${this.getCoverageClass(summary.branches.percentage)}">
        <h3>Branches</h3>
        <div class="value">${summary.branches.percentage.toFixed(1)}%</div>
        <div class="detail">${summary.branches.covered} / ${summary.branches.total}</div>
      </div>
      <div class="metric ${this.getCoverageClass(summary.functions.percentage)}">
        <h3>Functions</h3>
        <div class="value">${summary.functions.percentage.toFixed(1)}%</div>
        <div class="detail">${summary.functions.covered} / ${summary.functions.total}</div>
      </div>
      <div class="metric ${this.getCoverageClass(summary.statements.percentage)}">
        <h3>Statements</h3>
        <div class="value">${summary.statements.percentage.toFixed(1)}%</div>
        <div class="detail">${summary.statements.covered} / ${summary.statements.total}</div>
      </div>
    </div>

    <h2>File Coverage</h2>
    <table>
      <thead>
        <tr>
          <th>File</th>
          <th>Lines</th>
          <th>Branches</th>
          <th>Functions</th>
          <th>Statements</th>
        </tr>
      </thead>
      <tbody>
        ${coverageData.map(file => this.generateFileRow(file)).join('\n')}
      </tbody>
    </table>
  </div>
</body>
</html>`;

    return html;
  }

  /**
   * Generates a table row for a file
   */
  private generateFileRow(file: FileCoverage): string {
    const relativePath = path.relative(process.cwd(), file.path);

    return `
        <tr>
          <td>
            <div class="file-path">${this.escapeHtml(relativePath)}</div>
            ${file.uncoveredLines.length > 0 ? `<div class="uncovered-info">${file.uncoveredLines.length} uncovered lines</div>` : ''}
          </td>
          <td>
            <div class="percentage ${this.getCoverageClass(file.coverage.lines.percentage)}">
              ${file.coverage.lines.percentage.toFixed(1)}%
            </div>
            <div class="bar">
              <div class="bar-fill ${this.getCoverageClass(file.coverage.lines.percentage)}"
                   style="width: ${file.coverage.lines.percentage}%"></div>
            </div>
          </td>
          <td>
            <div class="percentage ${this.getCoverageClass(file.coverage.branches.percentage)}">
              ${file.coverage.branches.percentage.toFixed(1)}%
            </div>
            <div class="bar">
              <div class="bar-fill ${this.getCoverageClass(file.coverage.branches.percentage)}"
                   style="width: ${file.coverage.branches.percentage}%"></div>
            </div>
          </td>
          <td>
            <div class="percentage ${this.getCoverageClass(file.coverage.functions.percentage)}">
              ${file.coverage.functions.percentage.toFixed(1)}%
            </div>
            <div class="bar">
              <div class="bar-fill ${this.getCoverageClass(file.coverage.functions.percentage)}"
                   style="width: ${file.coverage.functions.percentage}%"></div>
            </div>
          </td>
          <td>
            <div class="percentage ${this.getCoverageClass(file.coverage.statements.percentage)}">
              ${file.coverage.statements.percentage.toFixed(1)}%
            </div>
            <div class="bar">
              <div class="bar-fill ${this.getCoverageClass(file.coverage.statements.percentage)}"
                   style="width: ${file.coverage.statements.percentage}%"></div>
            </div>
          </td>
        </tr>`;
  }

  /**
   * Gets coverage class based on percentage
   */
  private getCoverageClass(percentage: number): 'low' | 'medium' | 'high' {
    if (percentage < 50) return 'low';
    if (percentage < 80) return 'medium';
    return 'high';
  }

  /**
   * Escapes HTML entities
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Generates JSON report
   */
  async generateJSON(coverageData: FileCoverage[], summary: CoverageData): Promise<string> {
    const report = {
      timestamp: new Date().toISOString(),
      projectName: this.config.projectName,
      summary,
      files: coverageData.map(file => ({
        path: path.relative(process.cwd(), file.path),
        coverage: file.coverage,
        uncoveredLines: file.uncoveredLines,
        uncoveredBranches: file.uncoveredBranches
      }))
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Generates LCOV report
   */
  async generateLCOV(coverageData: FileCoverage[]): Promise<string> {
    const lines: string[] = [];

    for (const file of coverageData) {
      const relativePath = path.relative(process.cwd(), file.path);

      lines.push(`SF:${relativePath}`);

      // Function coverage
      if (file.coverage.functions.total > 0) {
        lines.push(`FNF:${file.coverage.functions.total}`);
        lines.push(`FNH:${file.coverage.functions.covered}`);
      }

      // Line coverage
      if (file.coverage.lines.total > 0) {
        lines.push(`LF:${file.coverage.lines.total}`);
        lines.push(`LH:${file.coverage.lines.covered}`);
      }

      // Branch coverage
      if (file.coverage.branches.total > 0) {
        lines.push(`BRF:${file.coverage.branches.total}`);
        lines.push(`BRH:${file.coverage.branches.covered}`);
      }

      lines.push('end_of_record');
    }

    return lines.join('\n');
  }

  /**
   * Generates text report
   */
  async generateText(coverageData: FileCoverage[], summary: CoverageData): Promise<string> {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push(`Coverage Report - ${this.config.projectName}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('='.repeat(80));
    lines.push('');

    lines.push('Summary:');
    lines.push(`  Lines:      ${summary.lines.percentage.toFixed(2)}% (${summary.lines.covered}/${summary.lines.total})`);
    lines.push(`  Branches:   ${summary.branches.percentage.toFixed(2)}% (${summary.branches.covered}/${summary.branches.total})`);
    lines.push(`  Functions:  ${summary.functions.percentage.toFixed(2)}% (${summary.functions.covered}/${summary.functions.total})`);
    lines.push(`  Statements: ${summary.statements.percentage.toFixed(2)}% (${summary.statements.covered}/${summary.statements.total})`);
    lines.push('');

    lines.push('File Coverage:');
    lines.push('-'.repeat(80));

    for (const file of coverageData) {
      const relativePath = path.relative(process.cwd(), file.path);
      lines.push(`\n${relativePath}`);
      lines.push(`  Lines:      ${file.coverage.lines.percentage.toFixed(2)}%`);
      lines.push(`  Branches:   ${file.coverage.branches.percentage.toFixed(2)}%`);
      lines.push(`  Functions:  ${file.coverage.functions.percentage.toFixed(2)}%`);
      lines.push(`  Statements: ${file.coverage.statements.percentage.toFixed(2)}%`);

      if (file.uncoveredLines.length > 0) {
        lines.push(`  Uncovered lines: ${file.uncoveredLines.slice(0, 10).join(', ')}${file.uncoveredLines.length > 10 ? '...' : ''}`);
      }
    }

    lines.push('');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Generates Cobertura XML report
   */
  async generateCobertura(coverageData: FileCoverage[], summary: CoverageData): Promise<string> {
    const timestamp = Date.now();
    const lineRate = (summary.lines.percentage / 100).toFixed(4);
    const branchRate = (summary.branches.percentage / 100).toFixed(4);

    const xml: string[] = [
      '<?xml version="1.0" ?>',
      `<coverage line-rate="${lineRate}" branch-rate="${branchRate}" timestamp="${timestamp}" version="1.0">`,
      '  <sources>',
      `    <source>${process.cwd()}</source>`,
      '  </sources>',
      '  <packages>'
    ];

    const packages = new Map<string, FileCoverage[]>();

    for (const file of coverageData) {
      const packageName = path.dirname(file.path).replace(/\//g, '.');
      if (!packages.has(packageName)) {
        packages.set(packageName, []);
      }
      packages.get(packageName)!.push(file);
    }

    for (const [packageName, files] of packages.entries()) {
      const pkgLineRate = this.calculatePackageRate(files, 'lines');
      const pkgBranchRate = this.calculatePackageRate(files, 'branches');

      xml.push(`    <package name="${packageName}" line-rate="${pkgLineRate}" branch-rate="${pkgBranchRate}">`);
      xml.push('      <classes>');

      for (const file of files) {
        const className = path.basename(file.path, path.extname(file.path));
        const fileLineRate = (file.coverage.lines.percentage / 100).toFixed(4);
        const fileBranchRate = (file.coverage.branches.percentage / 100).toFixed(4);

        xml.push(`        <class name="${className}" filename="${file.path}" line-rate="${fileLineRate}" branch-rate="${fileBranchRate}">`);
        xml.push('          <methods />');
        xml.push('          <lines>');

        // Add line information
        for (const line of file.uncoveredLines) {
          xml.push(`            <line number="${line}" hits="0" />`);
        }

        xml.push('          </lines>');
        xml.push('        </class>');
      }

      xml.push('      </classes>');
      xml.push('    </package>');
    }

    xml.push('  </packages>');
    xml.push('</coverage>');

    return xml.join('\n');
  }

  /**
   * Calculates package-level coverage rate
   */
  private calculatePackageRate(files: FileCoverage[], metric: 'lines' | 'branches'): string {
    let total = 0;
    let covered = 0;

    for (const file of files) {
      total += file.coverage[metric].total;
      covered += file.coverage[metric].covered;
    }

    return total > 0 ? (covered / total).toFixed(4) : '0.0000';
  }

  /**
   * Calculates coverage summary
   */
  private calculateSummary(coverageData: FileCoverage[]): CoverageData {
    if (coverageData.length === 0) {
      return {
        lines: { total: 0, covered: 0, percentage: 0 },
        branches: { total: 0, covered: 0, percentage: 0 },
        functions: { total: 0, covered: 0, percentage: 0 },
        statements: { total: 0, covered: 0, percentage: 0 }
      };
    }

    const totals = coverageData.reduce(
      (acc, file) => ({
        lines: {
          total: acc.lines.total + file.coverage.lines.total,
          covered: acc.lines.covered + file.coverage.lines.covered
        },
        branches: {
          total: acc.branches.total + file.coverage.branches.total,
          covered: acc.branches.covered + file.coverage.branches.covered
        },
        functions: {
          total: acc.functions.total + file.coverage.functions.total,
          covered: acc.functions.covered + file.coverage.functions.covered
        },
        statements: {
          total: acc.statements.total + file.coverage.statements.total,
          covered: acc.statements.covered + file.coverage.statements.covered
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
        percentage: totals.lines.total > 0 ? (totals.lines.covered / totals.lines.total) * 100 : 0
      },
      branches: {
        total: totals.branches.total,
        covered: totals.branches.covered,
        percentage: totals.branches.total > 0 ? (totals.branches.covered / totals.branches.total) * 100 : 0
      },
      functions: {
        total: totals.functions.total,
        covered: totals.functions.covered,
        percentage: totals.functions.total > 0 ? (totals.functions.covered / totals.functions.total) * 100 : 0
      },
      statements: {
        total: totals.statements.total,
        covered: totals.statements.covered,
        percentage: totals.statements.total > 0 ? (totals.statements.covered / totals.statements.total) * 100 : 0
      }
    };
  }

  /**
   * Writes report to file
   */
  async writeToFile(report: CoverageReport, filename?: string): Promise<string> {
    await fs.ensureDir(this.config.outputDir);

    const ext = this.getFileExtension(report.format);
    const actualFilename = filename || `coverage-report.${ext}`;
    const filePath = path.join(this.config.outputDir, actualFilename);

    await fs.writeFile(filePath, report.content, 'utf8');

    return filePath;
  }

  /**
   * Gets file extension for format
   */
  private getFileExtension(format: string): string {
    const extensions: Record<string, string> = {
      html: 'html',
      json: 'json',
      lcov: 'lcov',
      text: 'txt',
      cobertura: 'xml'
    };

    return extensions[format] || 'txt';
  }
}
