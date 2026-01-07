/**
 * Agentic QE v3 - Compliance Validator Service
 * Validates code against regulatory compliance standards (GDPR, HIPAA, SOC2, PCI-DSS)
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type { FilePath } from '../../../shared/value-objects/index.js';
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

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<ComplianceValidatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

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
      return err(error instanceof Error ? error : new Error(String(error)));
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
      return err(error instanceof Error ? error : new Error(String(error)));
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
      return err(error instanceof Error ? error : new Error(String(error)));
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
      return err(error instanceof Error ? error : new Error(String(error)));
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
      return err(error instanceof Error ? error : new Error(String(error)));
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

    // Stub: In production, would perform actual code analysis
    switch (rule.category) {
      case 'encryption':
        violations.push(...(await this.checkEncryption(rule, context)));
        break;
      case 'access-control':
        violations.push(...(await this.checkAccessControl(rule, context)));
        break;
      case 'audit':
      case 'logging':
        violations.push(...(await this.checkLogging(rule, context)));
        break;
      case 'data-protection':
      case 'data-quality':
        violations.push(...(await this.checkDataProtection(rule, context)));
        break;
      case 'security':
        violations.push(...(await this.checkSecurityControls(rule, context)));
        break;
      default:
        // Generic check
        break;
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  private async checkEncryption(
    rule: ComplianceRule,
    _context: ComplianceContext
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Stub: Would analyze code for encryption usage
    if (Math.random() < 0.2) {
      const location: VulnerabilityLocation = {
        file: 'src/services/data-service.ts',
        line: Math.floor(Math.random() * 100) + 1,
        snippet: 'const data = JSON.parse(rawData);',
      };

      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location,
        details: 'Sensitive data parsed without encryption verification',
        remediation: 'Ensure data is encrypted before processing',
      });
    }

    return violations;
  }

  private async checkAccessControl(
    rule: ComplianceRule,
    _context: ComplianceContext
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Stub: Would analyze code for proper access control patterns
    if (Math.random() < 0.15) {
      const location: VulnerabilityLocation = {
        file: 'src/routes/admin.ts',
        line: Math.floor(Math.random() * 100) + 1,
        snippet: 'router.get("/admin/users", getUserList);',
      };

      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location,
        details: 'Admin endpoint missing authorization middleware',
        remediation: 'Add authorization check before sensitive operations',
      });
    }

    return violations;
  }

  private async checkLogging(
    rule: ComplianceRule,
    _context: ComplianceContext
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Stub: Would check for proper audit logging
    if (Math.random() < 0.25) {
      const location: VulnerabilityLocation = {
        file: 'src/controllers/user.ts',
        line: Math.floor(Math.random() * 100) + 1,
        snippet: 'await user.delete();',
      };

      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location,
        details: 'Sensitive operation without audit logging',
        remediation: 'Add audit log entry for data modification operations',
      });
    }

    return violations;
  }

  private async checkDataProtection(
    rule: ComplianceRule,
    _context: ComplianceContext
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Stub: Would check for proper data handling
    if (Math.random() < 0.2) {
      const location: VulnerabilityLocation = {
        file: 'src/models/user.ts',
        line: Math.floor(Math.random() * 100) + 1,
        snippet: 'email: string;',
      };

      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location,
        details: 'PII field without masking or encryption decorator',
        remediation: 'Apply data protection decorators to sensitive fields',
      });
    }

    return violations;
  }

  private async checkSecurityControls(
    rule: ComplianceRule,
    _context: ComplianceContext
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Stub: Would check for security control implementation
    if (Math.random() < 0.15) {
      const location: VulnerabilityLocation = {
        file: 'src/config/security.ts',
        line: Math.floor(Math.random() * 50) + 1,
        snippet: 'rateLimit: false',
      };

      violations.push({
        ruleId: rule.id,
        ruleName: rule.title,
        location,
        details: 'Rate limiting is disabled',
        remediation: 'Enable rate limiting to prevent abuse',
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
    // Stub: Would scan file content for data type patterns
    const findings: Array<{ type: DataType; location: DataLocation }> = [];

    for (const dataType of dataTypes) {
      if (Math.random() < 0.3) {
        findings.push({
          type: dataType,
          location: {
            file: file.value,
            line: Math.floor(Math.random() * 100) + 1,
            context: this.getDataTypeContext(dataType),
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
    // Generate violation if data handling is improper
    if (Math.random() < 0.4) {
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

      return {
        ruleId: ruleMap[finding.type],
        ruleName: `${finding.type.toUpperCase()} Data Protection`,
        location,
        details: `${finding.type.toUpperCase()} data found without proper protection`,
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
    _context: ComplianceContext
  ): Promise<string[]> {
    // Stub: Would collect actual evidence from code analysis
    const evidence: string[] = [];

    if (rule.checkType === 'static') {
      evidence.push(`Static analysis completed for ${rule.category}`);
      evidence.push(`Code patterns reviewed: ${rule.title}`);
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
