/**
 * Coverage Analysis Wizard
 * ADR-041: V3 QE CLI Enhancement
 *
 * Interactive wizard for coverage analysis with step-by-step configuration.
 * Refactored to use Command Pattern for reduced complexity and better reusability.
 */

import chalk from 'chalk';
import { relative } from 'path';
import {
  BaseWizard,
  BaseWizardResult,
  IWizardCommand,
  SingleSelectStep,
  MultiSelectStep,
  BooleanStep,
  NumericStep,
  PathInputStep,
  PatternsInputStep,
  WizardPrompt,
  WizardFormat,
  WizardSuggestions,
} from './core/index.js';

// ============================================================================
// Types
// ============================================================================

export interface CoverageWizardOptions {
  /** Non-interactive mode with defaults */
  nonInteractive?: boolean;
  /** Default target directory */
  defaultTarget?: string;
  /** Default gap detection sensitivity */
  defaultSensitivity?: GapSensitivity;
  /** Default report format */
  defaultFormat?: ReportFormat;
  /** Default priority focus areas */
  defaultPriorityFocus?: PriorityFocus[];
  /** Default risk scoring toggle */
  defaultRiskScoring?: boolean;
  /** Default threshold percentage */
  defaultThreshold?: number;
}

export type GapSensitivity = 'low' | 'medium' | 'high';
export type ReportFormat = 'json' | 'html' | 'markdown' | 'text';
export type PriorityFocus = 'functions' | 'branches' | 'lines' | 'statements';

export interface CoverageWizardResult extends BaseWizardResult {
  /** Target directory or file to analyze */
  target: string;
  /** Gap detection sensitivity level */
  sensitivity: GapSensitivity;
  /** Report output format */
  format: ReportFormat;
  /** Priority focus areas for coverage analysis */
  priorityFocus: PriorityFocus[];
  /** Whether to include risk scoring */
  riskScoring: boolean;
  /** Coverage threshold percentage */
  threshold: number;
  /** Include patterns (comma-separated) */
  includePatterns?: string[];
  /** Exclude patterns (comma-separated) */
  excludePatterns?: string[];
}

// ============================================================================
// Sensitivity Configuration
// ============================================================================

const SENSITIVITY_CONFIG = {
  low: {
    minRisk: 0.7,
    maxGaps: 10,
    description: 'Only critical gaps with high risk scores',
  },
  medium: {
    minRisk: 0.5,
    maxGaps: 20,
    description: 'Moderate gaps including medium risk items',
  },
  high: {
    minRisk: 0.3,
    maxGaps: 50,
    description: 'All gaps including low risk items',
  },
};

// ============================================================================
// Wizard Implementation
// ============================================================================

export class CoverageAnalysisWizard extends BaseWizard<CoverageWizardOptions, CoverageWizardResult> {
  constructor(options: CoverageWizardOptions = {}) {
    super(options);
  }

  protected getTitle(): string {
    return 'Coverage Analysis Wizard';
  }

  protected getSubtitle(): string {
    return 'Analyze code coverage with O(log n) gap detection';
  }

  protected getConfirmationPrompt(): string {
    return 'Proceed with coverage analysis?';
  }

  protected isNonInteractive(): boolean {
    return this.options.nonInteractive ?? false;
  }

  protected getCommands(): IWizardCommand<unknown>[] {
    return [
      // Step 1: Target directory
      new PathInputStep({
        id: 'target',
        stepNumber: '1/7',
        title: 'Target Directory',
        description: 'Enter the directory or file to analyze for coverage',
        examples: 'src/, ./lib, coverage/lcov.info',
        defaultValue: this.options.defaultTarget || '.',
        suggestionsProvider: WizardSuggestions.getCoverageTargets,
        validatePath: true,
      }),

      // Step 2: Gap detection sensitivity
      new SingleSelectStep<GapSensitivity>({
        id: 'sensitivity',
        stepNumber: '2/7',
        title: 'Gap Detection Sensitivity',
        description: 'Select how sensitive the gap detection should be',
        options: [
          { key: '1', value: 'low', label: 'low', description: SENSITIVITY_CONFIG.low.description },
          { key: '2', value: 'medium', label: 'medium', description: SENSITIVITY_CONFIG.medium.description },
          { key: '3', value: 'high', label: 'high', description: SENSITIVITY_CONFIG.high.description },
        ],
        defaultValue: this.options.defaultSensitivity || 'medium',
        validValues: ['low', 'medium', 'high'],
      }),

      // Step 3: Report format
      new SingleSelectStep<ReportFormat>({
        id: 'format',
        stepNumber: '3/7',
        title: 'Report Format',
        description: 'Select the output format for the coverage report',
        options: [
          { key: '1', value: 'json', label: 'json', description: 'JSON - Machine-readable, good for CI/CD pipelines' },
          { key: '2', value: 'html', label: 'html', description: 'HTML - Interactive, visual report with charts' },
          { key: '3', value: 'markdown', label: 'markdown', description: 'Markdown - Documentation-friendly format' },
          { key: '4', value: 'text', label: 'text', description: 'Text - Simple console output' },
        ],
        defaultValue: this.options.defaultFormat || 'json',
        validValues: ['json', 'html', 'markdown', 'text'],
      }),

      // Step 4: Priority focus areas
      new MultiSelectStep<PriorityFocus>({
        id: 'priorityFocus',
        stepNumber: '4/7',
        title: 'Priority Focus Areas',
        description: 'Select coverage metrics to prioritize (comma-separated or numbers)',
        instructions: 'Example: 1,2 or functions,branches',
        options: [
          { key: '1', value: 'functions', label: 'functions', description: 'Functions - Focus on function coverage' },
          { key: '2', value: 'branches', label: 'branches', description: 'Branches - Focus on branch/decision coverage' },
          { key: '3', value: 'lines', label: 'lines', description: 'Lines - Focus on line coverage' },
          { key: '4', value: 'statements', label: 'statements', description: 'Statements - Focus on statement coverage' },
        ],
        defaultValue: this.options.defaultPriorityFocus || ['functions', 'branches'],
        validValues: ['functions', 'branches', 'lines', 'statements'],
      }),

      // Step 5: Risk scoring
      new BooleanStep({
        id: 'riskScoring',
        stepNumber: '5/7',
        title: 'Enable risk scoring',
        description: 'Enable risk scoring to prioritize coverage gaps by potential impact',
        additionalInfo: 'Risk scores consider code complexity, change frequency, and criticality',
        defaultValue: this.options.defaultRiskScoring ?? true,
      }),

      // Step 6: Threshold percentage
      new NumericStep({
        id: 'threshold',
        stepNumber: '6/7',
        title: 'Coverage threshold %',
        description: 'Set the minimum coverage percentage required. Files below this threshold will be flagged.',
        presets: [
          { key: '1', value: 60, label: '60% - Legacy/maintenance projects' },
          { key: '2', value: 70, label: '70% - Standard projects' },
          { key: '3', value: 80, label: '80% - Quality-focused projects' },
          { key: '4', value: 90, label: '90% - Critical/high-reliability projects' },
        ],
        defaultValue: this.options.defaultThreshold || 80,
        min: 0,
        max: 100,
      }),

      // Step 7: File patterns
      new PatternsInputStep({
        id: 'patterns',
        stepNumber: '7/7',
        title: 'File Patterns (Optional)',
        description: 'Specify patterns to include or exclude from analysis. Leave blank to analyze all files.',
      }),
    ];
  }

  protected buildResult(results: Record<string, unknown>): CoverageWizardResult {
    const patterns = results.patterns as { include?: string[]; exclude?: string[] } | undefined;
    return {
      target: results.target as string,
      sensitivity: results.sensitivity as GapSensitivity,
      format: results.format as ReportFormat,
      priorityFocus: results.priorityFocus as PriorityFocus[],
      riskScoring: results.riskScoring as boolean,
      threshold: results.threshold as number,
      includePatterns: patterns?.include,
      excludePatterns: patterns?.exclude,
      cancelled: false,
    };
  }

  protected printSummary(result: CoverageWizardResult): void {
    WizardPrompt.printSummaryHeader();

    const relativePath = WizardFormat.relativePath(result.target, this.cwd);
    WizardPrompt.printSummaryField('Target', relativePath);
    WizardPrompt.printSummaryField('Sensitivity', result.sensitivity);
    WizardPrompt.printSummaryField('Report Format', result.format);
    WizardPrompt.printSummaryField('Priority Focus', result.priorityFocus.join(', '));
    WizardPrompt.printSummaryField('Risk Scoring', WizardFormat.enabledDisabled(result.riskScoring));
    WizardPrompt.printSummaryField('Threshold', WizardFormat.percentage(result.threshold));

    if (result.includePatterns && result.includePatterns.length > 0) {
      WizardPrompt.printSummaryField('Include', result.includePatterns.join(', '));
    }
    if (result.excludePatterns && result.excludePatterns.length > 0) {
      WizardPrompt.printSummaryField('Exclude', result.excludePatterns.join(', '));
    }

    // Show derived settings
    const config = SENSITIVITY_CONFIG[result.sensitivity];
    WizardPrompt.printDerivedSettings({
      'Min risk score': String(config.minRisk),
      'Max gaps shown': String(config.maxGaps),
    });
  }

  protected getDefaults(): CoverageWizardResult {
    return {
      target: this.options.defaultTarget || this.cwd,
      sensitivity: this.options.defaultSensitivity || 'medium',
      format: this.options.defaultFormat || 'json',
      priorityFocus: this.options.defaultPriorityFocus || ['functions', 'branches'],
      riskScoring: this.options.defaultRiskScoring ?? true,
      threshold: this.options.defaultThreshold || 80,
      cancelled: false,
    };
  }

  protected getCancelled(): CoverageWizardResult {
    return {
      target: '.',
      sensitivity: 'medium',
      format: 'json',
      priorityFocus: ['functions', 'branches'],
      riskScoring: true,
      threshold: 80,
      cancelled: true,
    };
  }
}

/**
 * Factory function to create and run the coverage wizard
 */
export async function runCoverageAnalysisWizard(
  options: CoverageWizardOptions = {}
): Promise<CoverageWizardResult> {
  const wizard = new CoverageAnalysisWizard(options);
  return wizard.run();
}

/**
 * Get sensitivity configuration for programmatic access
 */
export function getSensitivityConfig(sensitivity: GapSensitivity): {
  minRisk: number;
  maxGaps: number;
  description: string;
} {
  return SENSITIVITY_CONFIG[sensitivity];
}

/**
 * Export types for external use
 */
export type { CoverageWizardOptions as Options };
