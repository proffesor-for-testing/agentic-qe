/**
 * Security Scan Wizard
 * ADR-041: V3 QE CLI Enhancement
 *
 * Interactive wizard for security scanning with step-by-step configuration.
 * Prompts for target directory, scan types, compliance frameworks, severity level,
 * fix suggestions, and report format.
 */

import { createInterface } from 'readline';
import chalk from 'chalk';
import { existsSync, statSync } from 'fs';
import { join, resolve, relative } from 'path';
import * as readline from 'readline';

// ============================================================================
// Types
// ============================================================================

export interface SecurityWizardOptions {
  /** Non-interactive mode with defaults */
  nonInteractive?: boolean;
  /** Default target directory */
  defaultTarget?: string;
  /** Default scan types */
  defaultScanTypes?: ScanType[];
  /** Default compliance frameworks */
  defaultComplianceFrameworks?: ComplianceFramework[];
  /** Default minimum severity level */
  defaultSeverity?: SeverityLevel;
  /** Default include fix suggestions */
  defaultIncludeFixes?: boolean;
  /** Default generate report */
  defaultGenerateReport?: boolean;
  /** Default report format */
  defaultReportFormat?: ReportFormat;
}

export type ScanType = 'sast' | 'dast' | 'dependency' | 'secret';
export type ComplianceFramework = 'owasp' | 'gdpr' | 'hipaa' | 'soc2' | 'pci-dss' | 'ccpa';
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';
export type ReportFormat = 'json' | 'html' | 'markdown' | 'text';

export interface SecurityWizardResult {
  /** Target directory or file to scan */
  target: string;
  /** Selected scan types */
  scanTypes: ScanType[];
  /** Selected compliance frameworks */
  complianceFrameworks: ComplianceFramework[];
  /** Minimum severity level to report */
  severity: SeverityLevel;
  /** Whether to include fix suggestions */
  includeFixes: boolean;
  /** Whether to generate a report */
  generateReport: boolean;
  /** Report output format (if generateReport is true) */
  reportFormat: ReportFormat;
  /** Whether the wizard was cancelled */
  cancelled: boolean;
}

// ============================================================================
// Scan Type Configuration
// ============================================================================

const SCAN_TYPE_CONFIG: Record<ScanType, { name: string; description: string }> = {
  sast: {
    name: 'Static Application Security Testing',
    description: 'Analyze source code for vulnerabilities without execution',
  },
  dast: {
    name: 'Dynamic Application Security Testing',
    description: 'Test running application for runtime vulnerabilities',
  },
  dependency: {
    name: 'Dependency Scanning',
    description: 'Check dependencies for known CVEs and outdated packages',
  },
  secret: {
    name: 'Secret Detection',
    description: 'Scan for hardcoded secrets, API keys, and credentials',
  },
};

// ============================================================================
// Compliance Framework Configuration
// ============================================================================

const COMPLIANCE_CONFIG: Record<ComplianceFramework, { name: string; description: string }> = {
  owasp: {
    name: 'OWASP Top 10',
    description: 'Top 10 web application security risks',
  },
  gdpr: {
    name: 'GDPR',
    description: 'EU General Data Protection Regulation',
  },
  hipaa: {
    name: 'HIPAA',
    description: 'Health Insurance Portability and Accountability Act',
  },
  soc2: {
    name: 'SOC 2',
    description: 'Service Organization Control 2 compliance',
  },
  'pci-dss': {
    name: 'PCI-DSS',
    description: 'Payment Card Industry Data Security Standard',
  },
  ccpa: {
    name: 'CCPA',
    description: 'California Consumer Privacy Act',
  },
};

// ============================================================================
// Severity Configuration
// ============================================================================

const SEVERITY_CONFIG: Record<SeverityLevel, { priority: number; description: string }> = {
  critical: {
    priority: 1,
    description: 'Immediate action required - severe security risk',
  },
  high: {
    priority: 2,
    description: 'Important - should be addressed soon',
  },
  medium: {
    priority: 3,
    description: 'Notable - plan to address in normal development cycle',
  },
  low: {
    priority: 4,
    description: 'Minor - consider addressing when convenient',
  },
};

// ============================================================================
// Wizard Implementation
// ============================================================================

export class SecurityScanWizard {
  private options: SecurityWizardOptions;
  private cwd: string;

  constructor(options: SecurityWizardOptions = {}) {
    this.options = options;
    this.cwd = process.cwd();
  }

  /**
   * Run the interactive wizard
   */
  async run(): Promise<SecurityWizardResult> {
    // Non-interactive mode returns defaults
    if (this.options.nonInteractive) {
      return this.getDefaults();
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // Print header
      this.printHeader();

      // Step 1: Target directory
      const target = await this.promptTarget(rl);
      if (!target) {
        return this.getCancelled();
      }

      // Step 2: Scan types
      const scanTypes = await this.promptScanTypes(rl);
      if (scanTypes.length === 0) {
        return this.getCancelled();
      }

      // Step 3: Compliance frameworks
      const complianceFrameworks = await this.promptComplianceFrameworks(rl);

      // Step 4: Minimum severity level
      const severity = await this.promptSeverity(rl);

      // Step 5: Include fix suggestions
      const includeFixes = await this.promptIncludeFixes(rl);

      // Step 6: Generate report
      const { generateReport, reportFormat } = await this.promptReport(rl);

      // Print summary
      const result: SecurityWizardResult = {
        target,
        scanTypes,
        complianceFrameworks,
        severity,
        includeFixes,
        generateReport,
        reportFormat,
        cancelled: false,
      };

      this.printSummary(result);

      // Confirm
      const confirmed = await this.promptConfirmation(rl);
      if (!confirmed) {
        return this.getCancelled();
      }

      return result;
    } finally {
      rl.close();
    }
  }

  /**
   * Print wizard header
   */
  private printHeader(): void {
    console.log('');
    console.log(chalk.blue('========================================'));
    console.log(chalk.blue.bold('       Security Scan Wizard'));
    console.log(chalk.blue('========================================'));
    console.log(chalk.gray('Comprehensive security scanning with SAST/DAST'));
    console.log(chalk.gray('Press Ctrl+C to cancel at any time'));
    console.log('');
  }

  /**
   * Step 1: Prompt for target directory/file
   */
  private async promptTarget(rl: readline.Interface): Promise<string> {
    console.log(chalk.cyan('Step 1/6: Target Directory'));
    console.log(chalk.gray('Enter the directory or file to scan for security issues'));
    console.log(chalk.gray('Examples: src/, ./lib, package.json'));
    console.log('');

    // Show suggestions
    const suggestions = this.getTargetSuggestions();
    if (suggestions.length > 0) {
      console.log(chalk.yellow('Detected directories:'));
      suggestions.slice(0, 5).forEach((s, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${s}`));
      });
      console.log('');
    }

    const defaultValue = this.options.defaultTarget || '.';
    const input = await this.prompt(rl, `Target directory [${chalk.gray(defaultValue)}]: `);

    const value = input.trim() || defaultValue;

    // Resolve and validate the path
    const resolved = resolve(this.cwd, value);
    if (!existsSync(resolved)) {
      console.log(chalk.yellow(`  Warning: '${value}' does not exist, using current directory.`));
      return this.cwd;
    }

    return resolved;
  }

  /**
   * Step 2: Prompt for scan types (multi-select)
   */
  private async promptScanTypes(rl: readline.Interface): Promise<ScanType[]> {
    console.log('');
    console.log(chalk.cyan('Step 2/6: Scan Types'));
    console.log(chalk.gray('Select scan types to perform (comma-separated numbers or names)'));
    console.log(chalk.gray('Example: 1,2,3 or sast,dependency,secret'));
    console.log('');

    const options: Array<{ key: string; value: ScanType }> = [
      { key: '1', value: 'sast' },
      { key: '2', value: 'dast' },
      { key: '3', value: 'dependency' },
      { key: '4', value: 'secret' },
    ];

    const defaultValue: ScanType[] = this.options.defaultScanTypes || ['sast', 'dependency', 'secret'];

    options.forEach(opt => {
      const config = SCAN_TYPE_CONFIG[opt.value];
      const isDefault = defaultValue.includes(opt.value);
      const marker = isDefault ? chalk.green(' *') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${config.name}`));
      console.log(chalk.gray(`     ${config.description}`));
    });
    console.log('');
    console.log(chalk.gray('  * = included in default selection'));
    console.log('');

    const input = await this.prompt(rl, `Select scan types [${chalk.gray(defaultValue.join(','))}]: `);

    const value = input.trim();
    if (!value) return defaultValue;

    // Parse input - can be numbers or names
    const parts = value.split(',').map(p => p.trim().toLowerCase()).filter(p => p.length > 0);
    const result: ScanType[] = [];

    for (const part of parts) {
      const numInput = parseInt(part, 10);
      if (numInput >= 1 && numInput <= options.length) {
        result.push(options[numInput - 1].value);
      } else {
        const validTypes: ScanType[] = ['sast', 'dast', 'dependency', 'secret'];
        if (validTypes.includes(part as ScanType)) {
          result.push(part as ScanType);
        }
      }
    }

    if (result.length === 0) {
      console.log(chalk.yellow(`  Invalid input, using default: ${defaultValue.join(',')}`));
      return defaultValue;
    }

    // Remove duplicates
    return [...new Set(result)];
  }

  /**
   * Step 3: Prompt for compliance frameworks (multi-select)
   */
  private async promptComplianceFrameworks(rl: readline.Interface): Promise<ComplianceFramework[]> {
    console.log('');
    console.log(chalk.cyan('Step 3/6: Compliance Frameworks'));
    console.log(chalk.gray('Select compliance frameworks to check against (comma-separated)'));
    console.log(chalk.gray('Leave blank to skip compliance checking'));
    console.log('');

    const options: Array<{ key: string; value: ComplianceFramework }> = [
      { key: '1', value: 'owasp' },
      { key: '2', value: 'gdpr' },
      { key: '3', value: 'hipaa' },
      { key: '4', value: 'soc2' },
      { key: '5', value: 'pci-dss' },
      { key: '6', value: 'ccpa' },
    ];

    const defaultValue: ComplianceFramework[] = this.options.defaultComplianceFrameworks || ['owasp'];

    options.forEach(opt => {
      const config = COMPLIANCE_CONFIG[opt.value];
      const isDefault = defaultValue.includes(opt.value);
      const marker = isDefault ? chalk.green(' *') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${config.name} - ${config.description}`));
    });
    console.log('');
    console.log(chalk.gray('  * = included in default selection'));
    console.log('');

    const input = await this.prompt(
      rl,
      `Select frameworks [${chalk.gray(defaultValue.join(','))}]: `
    );

    const value = input.trim();
    if (!value) return defaultValue;

    // Handle 'none' or empty explicitly
    if (value.toLowerCase() === 'none' || value === '-') {
      return [];
    }

    // Parse input - can be numbers or names
    const parts = value.split(',').map(p => p.trim().toLowerCase()).filter(p => p.length > 0);
    const result: ComplianceFramework[] = [];

    for (const part of parts) {
      const numInput = parseInt(part, 10);
      if (numInput >= 1 && numInput <= options.length) {
        result.push(options[numInput - 1].value);
      } else {
        const validFrameworks: ComplianceFramework[] = ['owasp', 'gdpr', 'hipaa', 'soc2', 'pci-dss', 'ccpa'];
        if (validFrameworks.includes(part as ComplianceFramework)) {
          result.push(part as ComplianceFramework);
        }
      }
    }

    if (result.length === 0) {
      console.log(chalk.yellow(`  Invalid input, using default: ${defaultValue.join(',')}`));
      return defaultValue;
    }

    // Remove duplicates
    return [...new Set(result)];
  }

  /**
   * Step 4: Prompt for minimum severity level
   */
  private async promptSeverity(rl: readline.Interface): Promise<SeverityLevel> {
    console.log('');
    console.log(chalk.cyan('Step 4/6: Minimum Severity Level'));
    console.log(chalk.gray('Select the minimum severity level to report'));
    console.log(chalk.gray('Issues below this level will be filtered out'));
    console.log('');

    const options: Array<{ key: string; value: SeverityLevel }> = [
      { key: '1', value: 'critical' },
      { key: '2', value: 'high' },
      { key: '3', value: 'medium' },
      { key: '4', value: 'low' },
    ];

    const defaultValue = this.options.defaultSeverity || 'medium';

    options.forEach(opt => {
      const config = SEVERITY_CONFIG[opt.value];
      const marker = opt.value === defaultValue ? chalk.green(' (default)') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${config.description}`));
    });
    console.log('');

    const input = await this.prompt(rl, `Select severity level [${chalk.gray(defaultValue)}]: `);

    const value = input.trim().toLowerCase();
    if (!value) return defaultValue;

    // Check if input is a number
    const numInput = parseInt(value, 10);
    if (numInput >= 1 && numInput <= options.length) {
      return options[numInput - 1].value;
    }

    // Check if input is a valid severity
    const validLevels: SeverityLevel[] = ['critical', 'high', 'medium', 'low'];
    if (validLevels.includes(value as SeverityLevel)) {
      return value as SeverityLevel;
    }

    console.log(chalk.yellow(`  Invalid input, using default: ${defaultValue}`));
    return defaultValue;
  }

  /**
   * Step 5: Prompt for include fix suggestions
   */
  private async promptIncludeFixes(rl: readline.Interface): Promise<boolean> {
    console.log('');
    console.log(chalk.cyan('Step 5/6: Fix Suggestions'));
    console.log(chalk.gray('Include automated fix suggestions for detected vulnerabilities'));
    console.log(chalk.gray('Fixes may include code patches, dependency updates, or configuration changes'));
    console.log('');

    const defaultValue = this.options.defaultIncludeFixes !== undefined
      ? this.options.defaultIncludeFixes
      : true;

    const defaultStr = defaultValue ? 'Y/n' : 'y/N';
    const input = await this.prompt(rl, `Include fix suggestions? [${chalk.gray(defaultStr)}]: `);

    const value = input.trim().toLowerCase();

    if (value === '') {
      return defaultValue;
    }

    if (value === 'n' || value === 'no') {
      return false;
    }
    if (value === 'y' || value === 'yes') {
      return true;
    }

    return defaultValue;
  }

  /**
   * Step 6: Prompt for report generation
   */
  private async promptReport(
    rl: readline.Interface
  ): Promise<{ generateReport: boolean; reportFormat: ReportFormat }> {
    console.log('');
    console.log(chalk.cyan('Step 6/6: Report Generation'));
    console.log(chalk.gray('Generate a detailed security report'));
    console.log('');

    const defaultGenerate = this.options.defaultGenerateReport !== undefined
      ? this.options.defaultGenerateReport
      : true;

    const generateStr = defaultGenerate ? 'Y/n' : 'y/N';
    const generateInput = await this.prompt(
      rl,
      `Generate report? [${chalk.gray(generateStr)}]: `
    );

    const generateValue = generateInput.trim().toLowerCase();
    let generateReport: boolean;

    if (generateValue === '') {
      generateReport = defaultGenerate;
    } else if (generateValue === 'n' || generateValue === 'no') {
      generateReport = false;
    } else if (generateValue === 'y' || generateValue === 'yes') {
      generateReport = true;
    } else {
      generateReport = defaultGenerate;
    }

    // If not generating report, return default format
    if (!generateReport) {
      return {
        generateReport: false,
        reportFormat: this.options.defaultReportFormat || 'json',
      };
    }

    // Prompt for format
    console.log('');
    console.log(chalk.gray('Select report output format:'));

    const formatOptions: Array<{ key: string; value: ReportFormat; description: string }> = [
      { key: '1', value: 'json', description: 'JSON - Machine-readable, good for CI/CD' },
      { key: '2', value: 'html', description: 'HTML - Interactive visual report' },
      { key: '3', value: 'markdown', description: 'Markdown - Documentation-friendly' },
      { key: '4', value: 'text', description: 'Text - Simple console output' },
    ];

    const defaultFormat = this.options.defaultReportFormat || 'json';

    formatOptions.forEach(opt => {
      const marker = opt.value === defaultFormat ? chalk.green(' (default)') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${opt.description}`));
    });
    console.log('');

    const formatInput = await this.prompt(
      rl,
      `Select format [${chalk.gray(defaultFormat)}]: `
    );

    const formatValue = formatInput.trim().toLowerCase();
    let reportFormat: ReportFormat;

    if (!formatValue) {
      reportFormat = defaultFormat;
    } else {
      // Check if input is a number
      const numInput = parseInt(formatValue, 10);
      if (numInput >= 1 && numInput <= formatOptions.length) {
        reportFormat = formatOptions[numInput - 1].value;
      } else {
        // Check if input is a valid format
        const validFormats: ReportFormat[] = ['json', 'html', 'markdown', 'text'];
        if (validFormats.includes(formatValue as ReportFormat)) {
          reportFormat = formatValue as ReportFormat;
        } else {
          console.log(chalk.yellow(`  Invalid input, using default: ${defaultFormat}`));
          reportFormat = defaultFormat;
        }
      }
    }

    return { generateReport, reportFormat };
  }

  /**
   * Prompt for final confirmation
   */
  private async promptConfirmation(rl: readline.Interface): Promise<boolean> {
    console.log('');
    const input = await this.prompt(
      rl,
      `${chalk.green('Proceed with security scan?')} [${chalk.gray('Y/n')}]: `
    );

    const value = input.trim().toLowerCase();
    if (value === 'n' || value === 'no') {
      console.log(chalk.yellow('\nWizard cancelled.'));
      return false;
    }
    return true;
  }

  /**
   * Print configuration summary
   */
  private printSummary(result: SecurityWizardResult): void {
    console.log('');
    console.log(chalk.blue('========================================'));
    console.log(chalk.blue.bold('       Configuration Summary'));
    console.log(chalk.blue('========================================'));
    console.log('');

    const relativePath = relative(this.cwd, result.target) || '.';
    console.log(chalk.white(`  Target:             ${chalk.cyan(relativePath)}`));
    console.log(chalk.white(`  Scan Types:         ${chalk.cyan(result.scanTypes.join(', '))}`));

    if (result.complianceFrameworks.length > 0) {
      console.log(chalk.white(`  Compliance:         ${chalk.cyan(result.complianceFrameworks.join(', '))}`));
    } else {
      console.log(chalk.white(`  Compliance:         ${chalk.gray('(none)')}`));
    }

    console.log(chalk.white(`  Min Severity:       ${chalk.cyan(result.severity)}`));
    console.log(chalk.white(`  Include Fixes:      ${chalk.cyan(result.includeFixes ? 'Yes' : 'No')}`));
    console.log(chalk.white(`  Generate Report:    ${chalk.cyan(result.generateReport ? 'Yes' : 'No')}`));

    if (result.generateReport) {
      console.log(chalk.white(`  Report Format:      ${chalk.cyan(result.reportFormat)}`));
    }

    // Show scan type details
    console.log('');
    console.log(chalk.gray('  Scan details:'));
    result.scanTypes.forEach(type => {
      const config = SCAN_TYPE_CONFIG[type];
      console.log(chalk.gray(`    - ${config.name}`));
    });

    console.log('');
  }

  /**
   * Generic prompt helper
   */
  private prompt(rl: readline.Interface, question: string): Promise<string> {
    return new Promise(resolve => {
      rl.question(question, answer => {
        resolve(answer);
      });
    });
  }

  /**
   * Get target directory suggestions
   */
  private getTargetSuggestions(): string[] {
    const suggestions: string[] = [];

    // Check for common source directories
    const commonDirs = ['src', 'lib', 'app', 'packages', 'api'];
    for (const dir of commonDirs) {
      const dirPath = join(this.cwd, dir);
      if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
        suggestions.push(dir);
      }
    }

    // Check for security-relevant files
    const securityFiles = [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      '.env',
      '.env.example',
      'docker-compose.yml',
      'Dockerfile',
    ];
    for (const file of securityFiles) {
      const filePath = join(this.cwd, file);
      if (existsSync(filePath)) {
        suggestions.push(file);
      }
    }

    return suggestions;
  }

  /**
   * Get default result for non-interactive mode
   */
  private getDefaults(): SecurityWizardResult {
    return {
      target: this.options.defaultTarget || this.cwd,
      scanTypes: this.options.defaultScanTypes || ['sast', 'dependency', 'secret'],
      complianceFrameworks: this.options.defaultComplianceFrameworks || ['owasp'],
      severity: this.options.defaultSeverity || 'medium',
      includeFixes: this.options.defaultIncludeFixes !== undefined
        ? this.options.defaultIncludeFixes
        : true,
      generateReport: this.options.defaultGenerateReport !== undefined
        ? this.options.defaultGenerateReport
        : true,
      reportFormat: this.options.defaultReportFormat || 'json',
      cancelled: false,
    };
  }

  /**
   * Get cancelled result
   */
  private getCancelled(): SecurityWizardResult {
    return {
      target: '.',
      scanTypes: ['sast', 'dependency', 'secret'],
      complianceFrameworks: ['owasp'],
      severity: 'medium',
      includeFixes: true,
      generateReport: true,
      reportFormat: 'json',
      cancelled: true,
    };
  }
}

/**
 * Factory function to create and run the security scan wizard
 */
export async function runSecurityScanWizard(
  options: SecurityWizardOptions = {}
): Promise<SecurityWizardResult> {
  const wizard = new SecurityScanWizard(options);
  return wizard.run();
}

/**
 * Get scan type configuration for programmatic access
 */
export function getScanTypeConfig(scanType: ScanType): {
  name: string;
  description: string;
} {
  return SCAN_TYPE_CONFIG[scanType];
}

/**
 * Get compliance framework configuration for programmatic access
 */
export function getComplianceConfig(framework: ComplianceFramework): {
  name: string;
  description: string;
} {
  return COMPLIANCE_CONFIG[framework];
}

/**
 * Get severity configuration for programmatic access
 */
export function getSeverityConfig(severity: SeverityLevel): {
  priority: number;
  description: string;
} {
  return SEVERITY_CONFIG[severity];
}

/**
 * Export types for external use
 */
export type { SecurityWizardOptions as Options };
