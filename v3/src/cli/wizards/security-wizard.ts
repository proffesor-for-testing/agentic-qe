/**
 * Security Scan Wizard
 * ADR-041: V3 QE CLI Enhancement
 *
 * Interactive wizard for security scanning with step-by-step configuration.
 * Refactored to use Command Pattern for reduced complexity and better reusability.
 */

import chalk from 'chalk';
import { createInterface } from 'readline';
import * as readline from 'readline';
import {
  BaseWizard,
  BaseWizardResult,
  IWizardCommand,
  WizardContext,
  CommandResult,
  BaseWizardCommand,
  SingleSelectStep,
  MultiSelectStep,
  BooleanStep,
  PathInputStep,
  WizardPrompt,
  WizardFormat,
  WizardSuggestions,
} from './core/index.js';

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

export interface SecurityWizardResult extends BaseWizardResult {
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
// Custom Report Step
// ============================================================================

/**
 * Custom step for report generation with conditional format selection
 */
class ReportStep extends BaseWizardCommand<{ generateReport: boolean; reportFormat: ReportFormat }> {
  readonly id = 'report';
  readonly stepNumber: string;
  readonly title = 'Report Generation';
  readonly description = 'Generate a detailed security report';

  private defaultGenerate: boolean;
  private defaultFormat: ReportFormat;

  constructor(stepNumber: string, defaultGenerate: boolean, defaultFormat: ReportFormat) {
    super({ generateReport: defaultGenerate, reportFormat: defaultFormat });
    this.stepNumber = stepNumber;
    this.defaultGenerate = defaultGenerate;
    this.defaultFormat = defaultFormat;
  }

  async execute(context: WizardContext): Promise<CommandResult<{ generateReport: boolean; reportFormat: ReportFormat }>> {
    if (context.nonInteractive) {
      return this.success({ generateReport: this.defaultGenerate, reportFormat: this.defaultFormat });
    }

    WizardPrompt.printStepHeader(this.stepNumber, this.title, this.description);

    // First, ask if they want to generate a report
    const generateStr = this.defaultGenerate ? 'Y/n' : 'y/N';
    const generateInput = await WizardPrompt.prompt(
      context.rl,
      `Generate report? [${chalk.gray(generateStr)}]: `
    );

    const generateValue = generateInput.trim().toLowerCase();
    let generateReport: boolean;

    if (generateValue === '') {
      generateReport = this.defaultGenerate;
    } else if (generateValue === 'n' || generateValue === 'no') {
      generateReport = false;
    } else if (generateValue === 'y' || generateValue === 'yes') {
      generateReport = true;
    } else {
      generateReport = this.defaultGenerate;
    }

    // If not generating report, return default format
    if (!generateReport) {
      return this.success({ generateReport: false, reportFormat: this.defaultFormat });
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

    formatOptions.forEach(opt => {
      const marker = opt.value === this.defaultFormat ? chalk.green(' (default)') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${opt.description}`));
    });
    console.log('');

    const formatInput = await WizardPrompt.prompt(
      context.rl,
      `Select format [${chalk.gray(this.defaultFormat)}]: `
    );

    const formatValue = formatInput.trim().toLowerCase();
    let reportFormat: ReportFormat;

    if (!formatValue) {
      reportFormat = this.defaultFormat;
    } else {
      const numInput = parseInt(formatValue, 10);
      if (numInput >= 1 && numInput <= formatOptions.length) {
        reportFormat = formatOptions[numInput - 1].value;
      } else {
        const validFormats: ReportFormat[] = ['json', 'html', 'markdown', 'text'];
        if (validFormats.includes(formatValue as ReportFormat)) {
          reportFormat = formatValue as ReportFormat;
        } else {
          console.log(chalk.yellow(`  Invalid input, using default: ${this.defaultFormat}`));
          reportFormat = this.defaultFormat;
        }
      }
    }

    return this.success({ generateReport, reportFormat });
  }
}

// ============================================================================
// Wizard Implementation
// ============================================================================

export class SecurityScanWizard extends BaseWizard<SecurityWizardOptions, SecurityWizardResult> {
  constructor(options: SecurityWizardOptions = {}) {
    super(options);
  }

  protected getTitle(): string {
    return 'Security Scan Wizard';
  }

  protected getSubtitle(): string {
    return 'Comprehensive security scanning with SAST/DAST';
  }

  protected getConfirmationPrompt(): string {
    return 'Proceed with security scan?';
  }

  protected isNonInteractive(): boolean {
    return this.options.nonInteractive ?? false;
  }

  protected getCommands(): IWizardCommand<unknown>[] {
    return [
      // Step 1: Target directory
      new PathInputStep({
        id: 'target',
        stepNumber: '1/6',
        title: 'Target Directory',
        description: 'Enter the directory or file to scan for security issues',
        examples: 'src/, ./lib, package.json',
        defaultValue: this.options.defaultTarget || '.',
        suggestionsProvider: WizardSuggestions.getSecurityTargets,
        validatePath: true,
      }),

      // Step 2: Scan types
      new MultiSelectStep<ScanType>({
        id: 'scanTypes',
        stepNumber: '2/6',
        title: 'Scan Types',
        description: 'Select scan types to perform (comma-separated numbers or names)',
        instructions: 'Example: 1,2,3 or sast,dependency,secret',
        options: Object.entries(SCAN_TYPE_CONFIG).map(([value, config], index) => ({
          key: String(index + 1),
          value: value as ScanType,
          label: value,
          description: `${config.name}\n     ${config.description}`,
        })),
        defaultValue: this.options.defaultScanTypes || ['sast', 'dependency', 'secret'],
        validValues: ['sast', 'dast', 'dependency', 'secret'],
      }),

      // Step 3: Compliance frameworks
      new MultiSelectStep<ComplianceFramework>({
        id: 'complianceFrameworks',
        stepNumber: '3/6',
        title: 'Compliance Frameworks',
        description: 'Select compliance frameworks to check against (comma-separated)',
        instructions: 'Leave blank to skip compliance checking',
        options: Object.entries(COMPLIANCE_CONFIG).map(([value, config], index) => ({
          key: String(index + 1),
          value: value as ComplianceFramework,
          label: value,
          description: `${config.name} - ${config.description}`,
        })),
        defaultValue: this.options.defaultComplianceFrameworks || ['owasp'],
        validValues: ['owasp', 'gdpr', 'hipaa', 'soc2', 'pci-dss', 'ccpa'],
        allowEmpty: true,
      }),

      // Step 4: Severity level
      new SingleSelectStep<SeverityLevel>({
        id: 'severity',
        stepNumber: '4/6',
        title: 'Minimum Severity Level',
        description: 'Select the minimum severity level to report. Issues below this level will be filtered out.',
        options: Object.entries(SEVERITY_CONFIG).map(([value, config], index) => ({
          key: String(index + 1),
          value: value as SeverityLevel,
          label: value,
          description: config.description,
        })),
        defaultValue: this.options.defaultSeverity || 'medium',
        validValues: ['critical', 'high', 'medium', 'low'],
      }),

      // Step 5: Include fix suggestions
      new BooleanStep({
        id: 'includeFixes',
        stepNumber: '5/6',
        title: 'Include fix suggestions',
        description: 'Include automated fix suggestions for detected vulnerabilities',
        additionalInfo: 'Fixes may include code patches, dependency updates, or configuration changes',
        defaultValue: this.options.defaultIncludeFixes ?? true,
      }),

      // Step 6: Report generation
      new ReportStep(
        '6/6',
        this.options.defaultGenerateReport ?? true,
        this.options.defaultReportFormat || 'json'
      ),
    ];
  }

  protected buildResult(results: Record<string, unknown>): SecurityWizardResult {
    const reportResult = results.report as { generateReport: boolean; reportFormat: ReportFormat };
    return {
      target: results.target as string,
      scanTypes: results.scanTypes as ScanType[],
      complianceFrameworks: results.complianceFrameworks as ComplianceFramework[],
      severity: results.severity as SeverityLevel,
      includeFixes: results.includeFixes as boolean,
      generateReport: reportResult.generateReport,
      reportFormat: reportResult.reportFormat,
      cancelled: false,
    };
  }

  protected printSummary(result: SecurityWizardResult): void {
    WizardPrompt.printSummaryHeader();

    const relativePath = WizardFormat.relativePath(result.target, this.cwd);
    WizardPrompt.printSummaryField('Target', relativePath);
    WizardPrompt.printSummaryField('Scan Types', result.scanTypes.join(', '));

    if (result.complianceFrameworks.length > 0) {
      WizardPrompt.printSummaryField('Compliance', result.complianceFrameworks.join(', '));
    } else {
      console.log(chalk.white(`  Compliance:       ${chalk.gray('(none)')}`));
    }

    WizardPrompt.printSummaryField('Min Severity', result.severity);
    WizardPrompt.printSummaryField('Include Fixes', WizardFormat.yesNo(result.includeFixes));
    WizardPrompt.printSummaryField('Generate Report', WizardFormat.yesNo(result.generateReport));

    if (result.generateReport) {
      WizardPrompt.printSummaryField('Report Format', result.reportFormat);
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

  protected getDefaults(): SecurityWizardResult {
    return {
      target: this.options.defaultTarget || this.cwd,
      scanTypes: this.options.defaultScanTypes || ['sast', 'dependency', 'secret'],
      complianceFrameworks: this.options.defaultComplianceFrameworks || ['owasp'],
      severity: this.options.defaultSeverity || 'medium',
      includeFixes: this.options.defaultIncludeFixes ?? true,
      generateReport: this.options.defaultGenerateReport ?? true,
      reportFormat: this.options.defaultReportFormat || 'json',
      cancelled: false,
    };
  }

  protected getCancelled(): SecurityWizardResult {
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
