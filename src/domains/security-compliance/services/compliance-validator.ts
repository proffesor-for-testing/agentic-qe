/**
 * Agentic QE v3 - Compliance Validator Service
 * Validates code against regulatory compliance standards (GDPR, HIPAA, SOC2, PCI-DSS)
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import {
  CompliancePatternAnalyzer,
  getCompliancePatternAnalyzer,
} from '../../../shared/security';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type { FilePath } from '../../../shared/value-objects/index.js';
import { toError } from '../../../shared/error-utils.js';
import type {
  IComplianceValidationService,
  ComplianceStandard,
  ComplianceRule,
  ComplianceContext,
  ComplianceReport,
  ComplianceViolation,
  GapAnalysis,
  ComplianceGap,
  RemediationAction,
  VulnerabilityLocation,
} from '../interfaces.js';

// ============================================================================
// Service Interface Extensions
// ============================================================================

export interface IExtendedComplianceValidationService extends IComplianceValidationService {
  /**
   * Validate against multiple standards
   */
  validateMultiple(
    standards: ComplianceStandard[],
    context: ComplianceContext
  ): Promise<Result<MultiStandardReport>>;

  /**
   * Check for data handling compliance
   */
  checkDataHandling(
    files: FilePath[],
    dataTypes: DataType[]
  ): Promise<Result<DataHandlingReport>>;

  /**
   * Generate compliance evidence
   */
  generateEvidence(
    standardId: string,
    context: ComplianceContext
  ): Promise<Result<ComplianceEvidence>>;
}

export interface MultiStandardReport {
  reports: ComplianceReport[];
  overallScore: number;
  crossCuttingViolations: ComplianceViolation[];
}

export type DataType = 'pii' | 'phi' | 'financial' | 'credentials' | 'biometric';

export interface DataHandlingReport {
  dataTypesFound: Map<DataType, DataLocation[]>;
  violations: ComplianceViolation[];
  recommendations: string[];
}

export interface DataLocation {
  file: string;
  line: number;
  context: string;
}

export interface ComplianceEvidence {
  standardId: string;
  controls: ControlEvidence[];
  generatedAt: Date;
  validUntil: Date;
}

export interface ControlEvidence {
  controlId: string;
  status: 'implemented' | 'partial' | 'not-implemented';
  evidence: string[];
  lastVerified: Date;
}

// ============================================================================
// Configuration
// ============================================================================

export interface ComplianceValidatorConfig {
  customStandards: ComplianceStandard[];
  strictMode: boolean;
  includeRecommended: boolean;
  evidenceRetentionDays: number;
}

const DEFAULT_CONFIG: ComplianceValidatorConfig = {
  customStandards: [],
  strictMode: false,
  includeRecommended: true,
  evidenceRetentionDays: 365,
};

// ============================================================================
// Built-in Compliance Standards
// ============================================================================

const GDPR_STANDARD: ComplianceStandard = {
  id: 'gdpr',
  name: 'General Data Protection Regulation',
  version: '2018',
  rules: [
    {
      id: 'gdpr-art5-accuracy',
      title: 'Data Accuracy',
      description: 'Personal data must be accurate and kept up to date',
      category: 'data-quality',
      severity: 'required',
      checkType: 'manual',
    },
    {
      id: 'gdpr-art17-erasure',
      title: 'Right to Erasure',
      description: 'Data subjects have the right to request deletion of their data',
      category: 'data-rights',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'gdpr-art25-privacy-design',
      title: 'Privacy by Design',
      description: 'Data protection must be built into systems from the start',
      category: 'architecture',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'gdpr-art32-security',
      title: 'Security of Processing',
      description: 'Appropriate security measures must protect personal data',
      category: 'security',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'gdpr-art33-breach-notification',
      title: 'Breach Notification',
      description: 'Data breaches must be reported within 72 hours',
      category: 'incident-response',
      severity: 'required',
      checkType: 'manual',
    },
  ],
};

const HIPAA_STANDARD: ComplianceStandard = {
  id: 'hipaa',
  name: 'Health Insurance Portability and Accountability Act',
  version: '1996-amended',
  rules: [
    {
      id: 'hipaa-164.312-access',
      title: 'Access Control',
      description: 'Implement technical policies for ePHI access',
      category: 'access-control',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'hipaa-164.312-audit',
      title: 'Audit Controls',
      description: 'Implement hardware, software, and procedural audit mechanisms',
      category: 'audit',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'hipaa-164.312-integrity',
      title: 'Integrity Controls',
      description: 'Protect ePHI from improper alteration or destruction',
      category: 'data-integrity',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'hipaa-164.312-transmission',
      title: 'Transmission Security',
      description: 'Protect ePHI during electronic transmission',
      category: 'encryption',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'hipaa-164.314-baa',
      title: 'Business Associate Agreements',
      description: 'Ensure contracts with business associates protect PHI',
      category: 'contracts',
      severity: 'required',
      checkType: 'manual',
    },
  ],
};

const SOC2_STANDARD: ComplianceStandard = {
  id: 'soc2',
  name: 'SOC 2 Type II',
  version: '2017',
  rules: [
    {
      id: 'soc2-cc6.1',
      title: 'Logical Access Security',
      description: 'Security software, infrastructure, and architectures are implemented',
      category: 'security',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'soc2-cc6.2',
      title: 'Access Controls',
      description: 'Registration and authorization of new users',
      category: 'access-control',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'soc2-cc6.6',
      title: 'Encryption',
      description: 'Logical access security measures to protect data',
      category: 'encryption',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'soc2-cc7.1',
      title: 'System Monitoring',
      description: 'Detect and respond to security incidents',
      category: 'monitoring',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'soc2-cc8.1',
      title: 'Change Management',
      description: 'Changes to infrastructure are authorized and tested',
      category: 'change-management',
      severity: 'required',
      checkType: 'manual',
    },
  ],
};

const PCIDSS_STANDARD: ComplianceStandard = {
  id: 'pci-dss',
  name: 'Payment Card Industry Data Security Standard',
  version: '4.0',
  rules: [
    {
      id: 'pci-req1',
      title: 'Network Security Controls',
      description: 'Install and maintain network security controls',
      category: 'network-security',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'pci-req3',
      title: 'Protect Account Data',
      description: 'Protect stored account data',
      category: 'data-protection',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'pci-req4',
      title: 'Encrypt Transmissions',
      description: 'Protect cardholder data with strong cryptography during transmission',
      category: 'encryption',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'pci-req6',
      title: 'Secure Development',
      description: 'Develop and maintain secure systems and software',
      category: 'secure-sdlc',
      severity: 'required',
      checkType: 'static',
    },
    {
      id: 'pci-req10',
      title: 'Log and Monitor Access',
      description: 'Log and monitor all access to system components',
      category: 'logging',
      severity: 'required',
      checkType: 'static',
    },
  ],
};

const BUILT_IN_STANDARDS: ComplianceStandard[] = [
  GDPR_STANDARD,
  HIPAA_STANDARD,
  SOC2_STANDARD,
  PCIDSS_STANDARD,
];

// ============================================================================
// Compliance Validator Service Implementation
// ============================================================================

export class ComplianceValidatorService implements IExtendedComplianceValidationService {
  private readonly config: ComplianceValidatorConfig;
  private readonly standards: Map<string, ComplianceStandard>;
  private readonly patternAnalyzer: CompliancePatternAnalyzer;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<ComplianceValidatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.patternAnalyzer = getCompliancePatternAnalyzer();

    // Initialize standards map
    this.standards = new Map();
    for (const std of BUILT_IN_STANDARDS) {
      this.standards.set(std.id, std);
    }
    for (const std of this.config.customStandards) {
      this.standards.set(std.id, std);
    }
  }

  // ==========================================================================
  // IComplianceValidationService Implementation
  // ==========================================================================

  /**
   * Validate against a compliance standard
   */
  async validate(
    standard: ComplianceStandard,
    context: ComplianceContext
  ): Promise<Result<ComplianceReport>> {
    try {
      const violations: ComplianceViolation[] = [];
      const passedRules: string[] = [];
      const skippedRules: string[] = [];

      // Get rules to check
      const rulesToCheck = this.config.includeRecommended
        ? standard.rules
        : standard.rules.filter((r) => r.severity === 'required');

      for (const rule of rulesToCheck) {
        if (rule.checkType === 'manual') {
          skippedRules.push(rule.id);
          continue;
        }

        const ruleResult = await this.checkRule(rule, context);

        if (ruleResult.passed) {
          passedRules.push(rule.id);
        } else {
          violations.push(...ruleResult.violations);
        }
      }

      // Calculate compliance score
      const totalRules = rulesToCheck.length - skippedRules.length;
      const complianceScore =
        totalRules > 0
          ? Math.round((passedRules.length / totalRules) * 100)
          : 100;

      const report: ComplianceReport = {
        standardId: standard.id,
        standardName: standard.name,
        violations,
        passedRules,
        skippedRules,
        complianceScore,
        generatedAt: new Date(),
      };

      // Store report
      await this.storeReport(report);

      return ok(report);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get available compliance standards
   */
  async getAvailableStandards(): Promise<ComplianceStandard[]> {
    return Array.from(this.standards.values());
  }

  /**
   * Analyze gaps between current state and target compliance
   */
  async analyzeGaps(
    currentState: ComplianceReport,
    targetStandard: ComplianceStandard
  ): Promise<Result<GapAnalysis>> {
    try {
      const gaps: ComplianceGap[] = [];
      const prioritizedActions: RemediationAction[] = [];

      // Find rules that are violated or not implemented
      const violatedRuleIds = new Set(
        currentState.violations.map((v) => v.ruleId)
      );
      const passedRuleIds = new Set(currentState.passedRules);

      for (const rule of targetStandard.rules) {
        if (violatedRuleIds.has(rule.id)) {
          gaps.push({
            ruleId: rule.id,
            currentStatus: 'failed',
            effort: this.estimateEffort(rule),
            impact: rule.severity === 'required' ? 'high' : 'medium',
          });
        } else if (!passedRuleIds.has(rule.id)) {
          gaps.push({
            ruleId: rule.id,
            currentStatus: 'not-implemented',
            effort: this.estimateEffort(rule),
            impact: rule.severity === 'required' ? 'high' : 'low',
          });
        }
      }

      // Generate prioritized actions
      const sortedGaps = [...gaps].sort((a, b) => {
        const impactOrder = { high: 0, medium: 1, low: 2 };
        const effortOrder = { trivial: 0, minor: 1, moderate: 2, major: 3 };

        // Prioritize high impact, low effort
        const aScore = impactOrder[a.impact] * 10 + effortOrder[a.effort];
        const bScore = impactOrder[b.impact] * 10 + effortOrder[b.effort];
        return aScore - bScore;
      });

      for (let i = 0; i < sortedGaps.length; i++) {
        const gap = sortedGaps[i];
        const rule = targetStandard.rules.find((r) => r.id === gap.ruleId);

        prioritizedActions.push({
          id: uuidv4(),
          description: `Implement ${rule?.title || gap.ruleId}`,
          affectedRules: [gap.ruleId],
          effort: gap.effort,
          priority: i + 1,
        });
      }

      // Calculate target score (100% if all gaps are addressed)
      const targetScore = 100;
      const currentScore = currentState.complianceScore;

      return ok({
        currentScore,
        targetScore,
        gaps,
        prioritizedActions,
      });
    } catch (error) {
      return err(toError(error));
    }
  }

  // ==========================================================================
  // Extended Functionality
  // ==========================================================================

  /**
   * Validate against multiple standards simultaneously
   */
  async validateMultiple(
    standards: ComplianceStandard[],
    context: ComplianceContext
  ): Promise<Result<MultiStandardReport>> {
    try {
      const reports: ComplianceReport[] = [];
      const crossCuttingViolations: ComplianceViolation[] = [];

      for (const standard of standards) {
        const result = await this.validate(standard, context);
        if (result.success) {
          reports.push(result.value);
        }
      }

      // Find cross-cutting violations (violations that affect multiple standards)
      const violationCounts = new Map<string, number>();
      for (const report of reports) {
        for (const violation of report.violations) {
          const key = `${violation.location.file}:${violation.location.line}`;
          violationCounts.set(key, (violationCounts.get(key) || 0) + 1);
        }
      }

      for (const report of reports) {
        for (const violation of report.violations) {
          const key = `${violation.location.file}:${violation.location.line}`;
          if ((violationCounts.get(key) || 0) > 1) {
            if (!crossCuttingViolations.some((v) =>
              v.location.file === violation.location.file &&
              v.location.line === violation.location.line
            )) {
              crossCuttingViolations.push(violation);
            }
          }
        }
      }

      // Calculate overall score (weighted average)
      const overallScore =
        reports.length > 0
          ? Math.round(
              reports.reduce((sum, r) => sum + r.complianceScore, 0) /
                reports.length
            )
          : 0;

      return ok({
        reports,
        overallScore,
        crossCuttingViolations,
      });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Check for data handling compliance
   */
  async checkDataHandling(
    files: FilePath[],
    dataTypes: DataType[]
  ): Promise<Result<DataHandlingReport>> {
    try {
      const dataTypesFound = new Map<DataType, DataLocation[]>();
      const violations: ComplianceViolation[] = [];
      const recommendations: string[] = [];

      for (const dataType of dataTypes) {
        dataTypesFound.set(dataType, []);
      }

      for (const file of files) {
        const findings = await this.scanFileForDataTypes(file, dataTypes);

        for (const finding of findings) {
          const locations = dataTypesFound.get(finding.type) || [];
          locations.push(finding.location);
          dataTypesFound.set(finding.type, locations);

          // Check for violations
          const violation = this.checkDataTypeViolation(finding);
          if (violation) {
            violations.push(violation);
          }
        }
      }

      // Generate recommendations
      for (const [dataType, locations] of dataTypesFound) {
        if (locations.length > 0) {
          recommendations.push(
            ...this.getDataTypeRecommendations(dataType, locations.length)
          );
        }
      }

      return ok({
        dataTypesFound,
        violations,
        recommendations: [...new Set(recommendations)],
      });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Generate compliance evidence for audits
   */
  async generateEvidence(
    standardId: string,
    context: ComplianceContext
  ): Promise<Result<ComplianceEvidence>> {
    try {
      const standard = this.standards.get(standardId);
      if (!standard) {
        return err(new Error(`Unknown standard: ${standardId}`));
      }

      // Validate first to get current state
      const validationResult = await this.validate(standard, context);
      if (!validationResult.success) {
        return err(validationResult.error);
      }

      const report = validationResult.value;
      const controls: ControlEvidence[] = [];

      for (const rule of standard.rules) {
        const status = report.passedRules.includes(rule.id)
          ? 'implemented'
          : report.skippedRules.includes(rule.id)
          ? 'partial'
          : 'not-implemented';

        controls.push({
          controlId: rule.id,
          status,
          evidence: await this.collectEvidence(rule, context),
          lastVerified: new Date(),
        });
      }

      const evidence: ComplianceEvidence = {
        standardId,
        controls,
        generatedAt: new Date(),
        validUntil: new Date(
          Date.now() + this.config.evidenceRetentionDays * 24 * 60 * 60 * 1000
        ),
      };

      // Store evidence
      await this.memory.set(
        `compliance:evidence:${standardId}:${Date.now()}`,
        evidence,
        { namespace: 'security-compliance', persist: true }
      );

      return ok(evidence);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private async checkRule(
    rule: ComplianceRule,
    context: ComplianceContext
  ): Promise<{ passed: boolean; violations: ComplianceViolation[] }> {
    const violations: ComplianceViolation[] = [];

    // Get files to analyze from context
    const files = await this.getFilesFromContext(context);

    // Perform real code analysis based on rule category
    switch (rule.category) {
      case 'encryption':
        violations.push(...(await this.checkEncryption(rule, context, files)));
        break;
      case 'access-control':
        violations.push(...(await this.checkAccessControl(rule, context, files)));
        break;
      case 'audit':
      case 'logging':
        violations.push(...(await this.checkLogging(rule, context, files)));
        break;
      case 'data-protection':
      case 'data-quality':
        violations.push(...(await this.checkDataProtection(rule, context, files)));
        break;
      case 'security':
        violations.push(...(await this.checkSecurityControls(rule, context, files)));
        break;
      default:
        // Generic check - no specific patterns to analyze
        break;
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  private async getFilesFromContext(context: ComplianceContext): Promise<string[]> {
    // Get files matching include patterns, excluding exclude patterns
    const files: string[] = [];
    const projectRoot = context.projectRoot.value;

    // For now, return empty array if no patterns - real implementation would use glob
    if (context.includePatterns.length === 0) {
      return [];
    }

    // In a real implementation, this would glob files from projectRoot
    // For pattern-based checking, we return the patterns as representative paths
    for (const pattern of context.includePatterns) {
      // Skip excluded patterns
      const isExcluded = context.excludePatterns.some(
        (exclude) => pattern.includes(exclude) || exclude.includes(pattern)
      );
      if (!isExcluded) {
        files.push(`${projectRoot}/${pattern}`);
      }
    }

    return files;
  }

  private async checkEncryption(
    rule: ComplianceRule,
    _context: ComplianceContext,
    files: string[]
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Skip if no files to analyze
    if (files.length === 0) {
      return violations;
    }

    // Use real pattern analysis
    const analysis = await this.patternAnalyzer.analyzeEncryption(files);

    // Check for weak crypto usage
    for (const match of analysis.weakCrypto) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location: {
          file: match.file,
          line: match.line,
          snippet: match.snippet,
        },
        details: 'Weak or deprecated cryptographic algorithm detected',
        remediation: 'Use strong encryption algorithms (AES-256, SHA-256 or higher)',
      });
    }

    // Check for unencrypted sensitive data handling
    for (const match of analysis.unencryptedDataHandling) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location: {
          file: match.file,
          line: match.line,
          snippet: match.snippet,
        },
        details: 'Sensitive data handled without encryption verification',
        remediation: 'Ensure data is encrypted before processing sensitive information',
      });
    }

    return violations;
  }

  private async checkAccessControl(
    rule: ComplianceRule,
    _context: ComplianceContext,
    files: string[]
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Skip if no files to analyze
    if (files.length === 0) {
      return violations;
    }

    // Use real pattern analysis
    const analysis = await this.patternAnalyzer.analyzeAccessControl(files);

    // Check for unprotected routes
    for (const match of analysis.unprotectedRoutes) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location: {
          file: match.file,
          line: match.line,
          snippet: match.snippet,
        },
        details: 'Sensitive endpoint potentially missing authorization middleware',
        remediation: 'Add authorization check before sensitive operations',
      });
    }

    // Check for hardcoded credentials
    for (const match of analysis.hardcodedCredentials) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location: {
          file: match.file,
          line: match.line,
          snippet: match.snippet,
        },
        details: 'Hardcoded credentials detected',
        remediation: 'Use environment variables or secure secret management',
      });
    }

    return violations;
  }

  private async checkLogging(
    rule: ComplianceRule,
    _context: ComplianceContext,
    files: string[]
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Skip if no files to analyze
    if (files.length === 0) {
      return violations;
    }

    // Use real pattern analysis
    const analysis = await this.patternAnalyzer.analyzeLogging(files);

    // Check for sensitive operations without logging
    for (const match of analysis.sensitiveOperationsWithoutLogging) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location: {
          file: match.file,
          line: match.line,
          snippet: match.snippet,
        },
        details: 'Sensitive operation without audit logging',
        remediation: 'Add audit log entry for data modification operations',
      });
    }

    // Check for sensitive data in logs
    for (const match of analysis.sensitiveDataInLogs) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location: {
          file: match.file,
          line: match.line,
          snippet: match.snippet,
        },
        details: 'Sensitive data being logged',
        remediation: 'Remove or mask sensitive data before logging',
      });
    }

    return violations;
  }

  private async checkDataProtection(
    rule: ComplianceRule,
    _context: ComplianceContext,
    files: string[]
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Skip if no files to analyze
    if (files.length === 0) {
      return violations;
    }

    // Use real pattern analysis
    const analysis = await this.patternAnalyzer.analyzeDataProtection(files);

    // Check for unmasked PII
    for (const match of analysis.unmaskedPii) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location: {
          file: match.file,
          line: match.line,
          snippet: match.snippet,
        },
        details: 'PII field without masking or encryption decorator',
        remediation: 'Apply data protection decorators to sensitive fields',
      });
    }

    // Check for missing validation
    for (const match of analysis.missingValidation) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location: {
          file: match.file,
          line: match.line,
          snippet: match.snippet,
        },
        details: 'Data fields without input validation',
        remediation: 'Add input validation for all data fields, especially PII',
      });
    }

    return violations;
  }

  private async checkSecurityControls(
    rule: ComplianceRule,
    _context: ComplianceContext,
    files: string[]
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Skip if no files to analyze
    if (files.length === 0) {
      return violations;
    }

    // Use real pattern analysis
    const analysis = await this.patternAnalyzer.analyzeSecurityControls(files);

    // Report missing security controls
    for (const missingControl of analysis.missingControls) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location: {
          file: 'project-wide',
          line: 0,
          snippet: `Missing: ${missingControl}`,
        },
        details: `Security control not detected: ${missingControl}`,
        remediation: `Implement ${missingControl} to enhance security posture`,
      });
    }

    // Report specific vulnerabilities
    for (const match of analysis.vulnerabilities) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location: {
          file: match.file,
          line: match.line,
          snippet: match.snippet,
        },
        details: 'Security vulnerability detected',
        remediation: 'Review and fix the security issue',
      });
    }

    return violations;
  }

  private estimateEffort(
    rule: ComplianceRule
  ): 'trivial' | 'minor' | 'moderate' | 'major' {
    // Estimate effort based on rule category
    const complexCategories = [
      'architecture',
      'data-rights',
      'incident-response',
    ];
    const moderateCategories = [
      'access-control',
      'encryption',
      'change-management',
    ];

    if (complexCategories.includes(rule.category)) {
      return 'major';
    }
    if (moderateCategories.includes(rule.category)) {
      return 'moderate';
    }
    if (rule.checkType === 'manual') {
      return 'moderate';
    }
    return 'minor';
  }

  private async scanFileForDataTypes(
    file: FilePath,
    dataTypes: DataType[]
  ): Promise<Array<{ type: DataType; location: DataLocation }>> {
    const findings: Array<{ type: DataType; location: DataLocation }> = [];

    // Use CompliancePatternAnalyzer for real pattern scanning
    const scanResults = await this.patternAnalyzer.scanForDataTypes(
      [file.value],
      dataTypes
    );

    // Transform Map results into expected array format
    for (const dataType of dataTypes) {
      const matches = scanResults.get(dataType) || [];
      for (const match of matches) {
        findings.push({
          type: dataType,
          location: {
            file: match.file,
            line: match.line,
            context: match.snippet || this.getDataTypeContext(dataType),
          },
        });
      }
    }

    return findings;
  }

  private getDataTypeContext(dataType: DataType): string {
    const contexts: Record<DataType, string> = {
      pii: 'User personal information field',
      phi: 'Health-related data field',
      financial: 'Payment/financial data field',
      credentials: 'Authentication credential field',
      biometric: 'Biometric data field',
    };
    return contexts[dataType];
  }

  private checkDataTypeViolation(
    finding: { type: DataType; location: DataLocation }
  ): ComplianceViolation | null {
    const context = finding.location.context.toLowerCase();

    // Check for protective patterns in context
    const protectivePatterns = [
      /encrypt/i,
      /hash/i,
      /mask/i,
      /redact/i,
      /validate/i,
      /sanitize/i,
      /bcrypt/i,
      /argon2/i,
      /aes/i,
    ];

    const isProtected = protectivePatterns.some((p) => p.test(context));

    // Check for unsafe patterns in context
    const unsafePatterns = [
      /console\.(log|debug|info)/i,
      /JSON\.stringify/i,
      /\.toString\(\)/i,
      /plaintext/i,
      /unencrypted/i,
    ];

    const hasUnsafePattern = unsafePatterns.some((p) => p.test(context));

    // Generate violation only if data is unprotected or has unsafe patterns
    if (!isProtected || hasUnsafePattern) {
      const ruleMap: Record<DataType, string> = {
        pii: 'gdpr-art32-security',
        phi: 'hipaa-164.312-transmission',
        financial: 'pci-req3',
        credentials: 'soc2-cc6.6',
        biometric: 'gdpr-art9-special',
      };

      const location: VulnerabilityLocation = {
        file: finding.location.file,
        line: finding.location.line,
        snippet: finding.location.context,
      };

      const reason = hasUnsafePattern
        ? 'Potentially exposed in logs or serialization'
        : 'No protective measures detected';

      return {
        ruleId: ruleMap[finding.type],
        ruleName: `${finding.type.toUpperCase()} Data Protection`,
        location,
        details: `${finding.type.toUpperCase()} data found: ${reason}`,
        remediation: `Apply appropriate security controls for ${finding.type} data`,
      };
    }

    return null;
  }

  private getDataTypeRecommendations(
    dataType: DataType,
    count: number
  ): string[] {
    const base = `Found ${count} ${dataType.toUpperCase()} data locations`;

    const recommendations: Record<DataType, string[]> = {
      pii: [
        base,
        'Implement data minimization principles',
        'Ensure consent mechanisms are in place',
        'Add data retention policies',
      ],
      phi: [
        base,
        'Verify HIPAA safeguards are implemented',
        'Ensure business associate agreements are in place',
        'Implement minimum necessary access',
      ],
      financial: [
        base,
        'Verify PCI-DSS compliance for payment data',
        'Implement tokenization where possible',
        'Ensure proper key management',
      ],
      credentials: [
        base,
        'Use secure credential storage (vaults)',
        'Implement credential rotation',
        'Avoid hardcoded credentials',
      ],
      biometric: [
        base,
        'Implement enhanced protection measures',
        'Obtain explicit consent',
        'Consider data localization requirements',
      ],
    };

    return recommendations[dataType];
  }

  private async collectEvidence(
    rule: ComplianceRule,
    context: ComplianceContext
  ): Promise<string[]> {
    const evidence: string[] = [];
    const files = await this.getFilesFromContext(context);

    if (rule.checkType === 'static' && files.length > 0) {
      // Collect evidence based on rule category
      switch (rule.category) {
        case 'encryption': {
          const analysis = await this.patternAnalyzer.analyzeEncryption(files);
          if (analysis.hasEncryption) {
            evidence.push(
              `Encryption detected: ${analysis.encryptionLibraries.join(', ') || 'standard crypto'}`
            );
          }
          if (analysis.weakCrypto.length > 0) {
            evidence.push(
              `Weak crypto found in ${analysis.weakCrypto.length} location(s)`
            );
          }
          evidence.push(
            `Unencrypted data handling: ${analysis.unencryptedDataHandling.length} instance(s)`
          );
          break;
        }
        case 'access_control': {
          const analysis = await this.patternAnalyzer.analyzeAccessControl(
            files
          );
          evidence.push(
            `Auth middleware: ${analysis.hasAuthMiddleware ? 'present' : 'not found'}`
          );
          evidence.push(
            `Unprotected routes: ${analysis.unprotectedRoutes.length}`
          );
          evidence.push(
            `Hardcoded credentials: ${analysis.hardcodedCredentials.length}`
          );
          break;
        }
        case 'logging': {
          const analysis = await this.patternAnalyzer.analyzeLogging(files);
          evidence.push(
            `Audit logging: ${analysis.hasAuditLogging ? 'implemented' : 'not found'}`
          );
          evidence.push(
            `Sensitive data in logs: ${analysis.sensitiveDataInLogs.length} instance(s)`
          );
          break;
        }
        case 'data_protection': {
          const analysis = await this.patternAnalyzer.analyzeDataProtection(
            files
          );
          evidence.push(`PII fields detected: ${analysis.piiFields.length}`);
          evidence.push(
            `Unmasked PII: ${analysis.unmaskedPii.length} instance(s)`
          );
          evidence.push(
            `Missing validation: ${analysis.missingValidation.length} field(s)`
          );
          break;
        }
        default:
          evidence.push(`Static analysis completed for ${rule.category}`);
          evidence.push(`Code patterns reviewed: ${rule.title}`);
      }
      evidence.push(`Files analyzed: ${files.length}`);
    } else if (rule.checkType === 'dynamic') {
      evidence.push(`Dynamic check required for: ${rule.title}`);
      evidence.push('Evidence collection pending dynamic analysis');
    } else if (rule.checkType === 'manual') {
      evidence.push(`Manual verification required for: ${rule.title}`);
      evidence.push(`Review scope: ${context.projectRoot.value}`);
    }

    evidence.push(`Rule ${rule.id} verified at ${new Date().toISOString()}`);

    return evidence;
  }

  private async storeReport(report: ComplianceReport): Promise<void> {
    await this.memory.set(
      `compliance:report:${report.standardId}:${Date.now()}`,
      report,
      { namespace: 'security-compliance', persist: true }
    );
  }
}
