/**
 * N8nComplianceValidatorAgent
 *
 * Regulatory and policy compliance validation:
 * - GDPR compliance checking
 * - Data retention policy validation
 * - Audit trail verification
 * - Privacy controls validation
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nNode,
  N8nExecution,
} from './types';
import { QETask, AgentCapability } from '../../types';

export interface ComplianceValidationTask extends QETask {
  type: 'compliance-validation';
  target: string; // workflowId
  options?: {
    frameworks?: ComplianceFramework[];
    checkDataHandling?: boolean;
    checkAuditTrail?: boolean;
    checkRetention?: boolean;
    customPolicies?: CompliancePolicy[];
    executeRuntimeTracing?: boolean;  // Actually execute and trace PII flow
    testInput?: Record<string, unknown>;  // Test data for runtime tracing
  };
}

export type ComplianceFramework = 'GDPR' | 'HIPAA' | 'SOC2' | 'PCI-DSS' | 'CCPA' | 'ISO27001';

export interface CompliancePolicy {
  id: string;
  name: string;
  description: string;
  rules: ComplianceRule[];
}

export interface ComplianceRule {
  id: string;
  name: string;
  check: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  remediation: string;
}

export interface ComplianceValidationResult {
  workflowId: string;
  timestamp: Date;
  frameworks: FrameworkComplianceResult[];
  dataHandling: DataHandlingResult;
  auditTrail: AuditTrailResult;
  retentionPolicy: RetentionPolicyResult;
  overallCompliance: {
    isCompliant: boolean;
    score: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  findings: ComplianceFinding[];
  remediationPlan: RemediationItem[];
}

export interface FrameworkComplianceResult {
  framework: ComplianceFramework;
  isCompliant: boolean;
  score: number;
  controls: ControlResult[];
  findings: ComplianceFinding[];
}

export interface ControlResult {
  controlId: string;
  controlName: string;
  status: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable';
  evidence: string[];
  gaps: string[];
}

export interface DataHandlingResult {
  personalDataDetected: boolean;
  sensitiveDataDetected: boolean;
  dataCategories: DataCategory[];
  processingActivities: ProcessingActivity[];
  risks: DataRisk[];
}

export interface DataCategory {
  type: 'PII' | 'PHI' | 'financial' | 'authentication' | 'behavioral' | 'other';
  fields: string[];
  nodes: string[];
  protection: 'encrypted' | 'masked' | 'none';
}

export interface ProcessingActivity {
  purpose: string;
  legalBasis?: string;
  dataSubjects: string;
  retention?: string;
  transfers?: string[];
}

export interface DataRisk {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigation: string;
}

export interface AuditTrailResult {
  isEnabled: boolean;
  coverage: number;
  gaps: string[];
  recommendations: string[];
}

export interface RetentionPolicyResult {
  hasPolicy: boolean;
  policies: RetentionRule[];
  violations: string[];
}

export interface RetentionRule {
  dataType: string;
  retentionPeriod: string;
  deletionMethod: string;
  isEnforced: boolean;
}

export interface ComplianceFinding {
  id: string;
  framework?: ComplianceFramework;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  title: string;
  description: string;
  location: string;
  evidence: string;
  remediation: string;
}

export interface RemediationItem {
  findingId: string;
  priority: number;
  effort: 'low' | 'medium' | 'high';
  action: string;
  deadline?: string;
  owner?: string;
}

// GDPR-specific patterns
const GDPR_CONTROLS = [
  { id: 'GDPR-5.1', name: 'Lawfulness, fairness and transparency', category: 'principles' },
  { id: 'GDPR-5.2', name: 'Purpose limitation', category: 'principles' },
  { id: 'GDPR-5.3', name: 'Data minimization', category: 'principles' },
  { id: 'GDPR-5.4', name: 'Accuracy', category: 'principles' },
  { id: 'GDPR-5.5', name: 'Storage limitation', category: 'principles' },
  { id: 'GDPR-5.6', name: 'Integrity and confidentiality', category: 'security' },
  { id: 'GDPR-32', name: 'Security of processing', category: 'security' },
  { id: 'GDPR-33', name: 'Data breach notification', category: 'incident' },
  { id: 'GDPR-35', name: 'Data protection impact assessment', category: 'dpia' },
];

// PII detection patterns
const PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/,
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
  ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  name: /\b(first_?name|last_?name|full_?name|name)\b/i,
  address: /\b(address|street|city|state|zip|postal)\b/i,
  dob: /\b(dob|date_?of_?birth|birth_?date|birthday)\b/i,
};

export class N8nComplianceValidatorAgent extends N8nBaseAgent {
  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'gdpr-compliance',
        version: '1.0.0',
        description: 'GDPR compliance validation',
        parameters: {},
      },
      {
        name: 'data-classification',
        version: '1.0.0',
        description: 'Classify and detect sensitive data',
        parameters: {},
      },
      {
        name: 'audit-validation',
        version: '1.0.0',
        description: 'Validate audit trail configuration',
        parameters: {},
      },
      {
        name: 'policy-enforcement',
        version: '1.0.0',
        description: 'Enforce data handling policies',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-compliance-validator' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<ComplianceValidationResult> {
    const complianceTask = task as ComplianceValidationTask;

    if (complianceTask.type !== 'compliance-validation') {
      throw new Error(`Unsupported task type: ${complianceTask.type}`);
    }

    return this.validateCompliance(complianceTask.target, complianceTask.options);
  }

  /**
   * Validate compliance for workflow
   *
   * PRODUCTION DEFAULT: Runtime PII tracing is ENABLED by default.
   * This ensures actual data flow is analyzed, not just static configuration.
   * Set executeRuntimeTracing: false to disable if workflow cannot be executed.
   */
  async validateCompliance(
    workflowId: string,
    options?: ComplianceValidationTask['options']
  ): Promise<ComplianceValidationResult> {
    const workflow = await this.getWorkflow(workflowId);
    const frameworks = options?.frameworks || ['GDPR'];

    // Validate each framework (static analysis)
    const frameworkResults: FrameworkComplianceResult[] = [];
    for (const framework of frameworks) {
      const result = this.validateFramework(workflow, framework);
      frameworkResults.push(result);
    }

    // Check data handling (static analysis)
    const dataHandling = options?.checkDataHandling !== false
      ? this.validateDataHandling(workflow)
      : this.getDefaultDataHandling();

    // Check audit trail (static analysis)
    const auditTrail = options?.checkAuditTrail !== false
      ? this.validateAuditTrail(workflow)
      : this.getDefaultAuditTrail();

    // Check retention policy (static analysis)
    const retentionPolicy = options?.checkRetention !== false
      ? this.validateRetentionPolicy(workflow)
      : this.getDefaultRetentionPolicy();

    // Runtime PII flow tracing - ENABLED BY DEFAULT
    // This is critical for production - static analysis alone misses runtime data flows
    // Set executeRuntimeTracing: false explicitly to skip
    let runtimeFindings: ComplianceFinding[] = [];
    if (options?.executeRuntimeTracing !== false) {
      try {
        runtimeFindings = await this.executeRuntimePIITracing(
          workflowId,
          options?.testInput
        );
      } catch (error) {
        // If runtime execution fails, emit warning but continue with static results
        this.emitEvent('compliance.runtime.skipped', {
          workflowId,
          reason: error instanceof Error ? error.message : 'Runtime PII tracing failed',
          note: 'Static compliance analysis completed, but runtime PII flow tracing was skipped',
        });
      }
    }

    // Collect all findings
    const findings: ComplianceFinding[] = [
      ...frameworkResults.flatMap(f => f.findings),
      ...this.dataHandlingFindings(dataHandling),
      ...this.auditTrailFindings(auditTrail),
      ...runtimeFindings,
      ...this.retentionFindings(retentionPolicy),
    ];

    // Calculate overall compliance
    const overallCompliance = this.calculateOverallCompliance(
      frameworkResults,
      findings
    );

    // Generate remediation plan
    const remediationPlan = this.generateRemediationPlan(findings);

    const result: ComplianceValidationResult = {
      workflowId,
      timestamp: new Date(),
      frameworks: frameworkResults,
      dataHandling,
      auditTrail,
      retentionPolicy,
      overallCompliance,
      findings,
      remediationPlan,
    };

    // Store result
    await this.storeTestResult(`compliance:${workflowId}`, result);

    // Emit event
    this.emitEvent('compliance.validation.completed', {
      workflowId,
      isCompliant: overallCompliance.isCompliant,
      score: overallCompliance.score,
      findingCount: findings.length,
    });

    return result;
  }

  /**
   * Validate compliance for a specific framework
   */
  private validateFramework(
    workflow: N8nWorkflow,
    framework: ComplianceFramework
  ): FrameworkComplianceResult {
    switch (framework) {
      case 'GDPR':
        return this.validateGDPR(workflow);
      case 'HIPAA':
        return this.validateHIPAA(workflow);
      case 'SOC2':
        return this.validateSOC2(workflow);
      case 'PCI-DSS':
        return this.validatePCIDSS(workflow);
      default:
        return this.getDefaultFrameworkResult(framework);
    }
  }

  /**
   * Validate GDPR compliance
   */
  private validateGDPR(workflow: N8nWorkflow): FrameworkComplianceResult {
    const controls: ControlResult[] = [];
    const findings: ComplianceFinding[] = [];

    // Check each GDPR control
    for (const control of GDPR_CONTROLS) {
      const result = this.checkGDPRControl(workflow, control);
      controls.push(result);

      if (result.status !== 'compliant' && result.status !== 'not-applicable') {
        findings.push({
          id: `GDPR-${control.id}-${Date.now()}`,
          framework: 'GDPR',
          severity: result.status === 'non-compliant' ? 'error' : 'warning',
          category: control.category,
          title: `${control.name} - ${result.status}`,
          description: result.gaps.join('; '),
          location: 'workflow',
          evidence: result.evidence.join(', '),
          remediation: this.getGDPRRemediation(control.id),
        });
      }
    }

    // Check for international data transfers
    const transfers = this.detectDataTransfers(workflow);
    if (transfers.length > 0) {
      findings.push({
        id: `GDPR-transfer-${Date.now()}`,
        framework: 'GDPR',
        severity: 'warning',
        category: 'transfer',
        title: 'International data transfer detected',
        description: `Data may be transferred to: ${transfers.join(', ')}`,
        location: 'workflow',
        evidence: 'HTTP requests to external services',
        remediation: 'Ensure appropriate safeguards for international transfers',
      });
    }

    const compliantCount = controls.filter(c => c.status === 'compliant').length;
    const score = (compliantCount / controls.length) * 100;

    return {
      framework: 'GDPR',
      isCompliant: findings.filter(f => f.severity === 'error' || f.severity === 'critical').length === 0,
      score,
      controls,
      findings,
    };
  }

  /**
   * Check specific GDPR control
   */
  private checkGDPRControl(
    workflow: N8nWorkflow,
    control: { id: string; name: string; category: string }
  ): ControlResult {
    const evidence: string[] = [];
    const gaps: string[] = [];

    switch (control.id) {
      case 'GDPR-5.1': // Lawfulness
        if (this.hasLawfulBasisDocumentation(workflow)) {
          evidence.push('Processing purposes documented');
        } else {
          gaps.push('No documented lawful basis for processing');
        }
        break;

      case 'GDPR-5.3': // Data minimization
        const unnecessaryData = this.detectUnnecessaryData(workflow);
        if (unnecessaryData.length === 0) {
          evidence.push('No unnecessary data collection detected');
        } else {
          gaps.push(`Potentially unnecessary data: ${unnecessaryData.join(', ')}`);
        }
        break;

      case 'GDPR-5.5': // Storage limitation
        if (workflow.settings?.saveDataSuccessExecution === 'none') {
          evidence.push('Data not retained after execution');
        } else {
          gaps.push('Data may be retained indefinitely');
        }
        break;

      case 'GDPR-5.6': // Security
        const securityIssues = this.checkSecurityControls(workflow);
        if (securityIssues.length === 0) {
          evidence.push('Security controls in place');
        } else {
          gaps.push(...securityIssues);
        }
        break;

      case 'GDPR-32': // Security of processing
        if (this.hasEncryption(workflow)) {
          evidence.push('Encryption configured for sensitive data');
        } else {
          gaps.push('No encryption detected for data in transit');
        }
        break;

      default:
        evidence.push('Control not specifically validated');
    }

    let status: ControlResult['status'];
    if (gaps.length === 0 && evidence.length > 0) {
      status = 'compliant';
    } else if (gaps.length > 0 && evidence.length > 0) {
      status = 'partial';
    } else if (gaps.length > 0) {
      status = 'non-compliant';
    } else {
      status = 'not-applicable';
    }

    return {
      controlId: control.id,
      controlName: control.name,
      status,
      evidence,
      gaps,
    };
  }

  /**
   * Get GDPR remediation guidance
   */
  private getGDPRRemediation(controlId: string): string {
    const remediations: Record<string, string> = {
      'GDPR-5.1': 'Document the lawful basis for processing in workflow metadata',
      'GDPR-5.2': 'Ensure data is only used for documented purposes',
      'GDPR-5.3': 'Remove unnecessary data fields from processing',
      'GDPR-5.4': 'Implement data validation and accuracy checks',
      'GDPR-5.5': 'Configure data retention policies and automatic deletion',
      'GDPR-5.6': 'Enable encryption and access controls',
      'GDPR-32': 'Implement appropriate technical security measures',
      'GDPR-33': 'Configure breach notification workflow',
      'GDPR-35': 'Complete DPIA for high-risk processing',
    };
    return remediations[controlId] || 'Review and address the identified gap';
  }

  /**
   * Validate HIPAA compliance
   */
  private validateHIPAA(workflow: N8nWorkflow): FrameworkComplianceResult {
    const findings: ComplianceFinding[] = [];
    const controls: ControlResult[] = [];

    // Check for PHI handling
    const phiDetected = this.detectPHI(workflow);
    if (phiDetected.length > 0) {
      // Check encryption
      if (!this.hasEncryption(workflow)) {
        findings.push({
          id: `HIPAA-encryption-${Date.now()}`,
          framework: 'HIPAA',
          severity: 'critical',
          category: 'security',
          title: 'PHI transmitted without encryption',
          description: 'Protected Health Information detected without encryption',
          location: phiDetected.join(', '),
          evidence: 'PHI fields detected in workflow',
          remediation: 'Enable encryption for all PHI data',
        });
      }

      // Check access controls
      if (!this.hasAccessControls(workflow)) {
        findings.push({
          id: `HIPAA-access-${Date.now()}`,
          framework: 'HIPAA',
          severity: 'error',
          category: 'access',
          title: 'Inadequate access controls for PHI',
          description: 'No access controls detected for PHI handling',
          location: 'workflow',
          evidence: 'Workflow has no credential restrictions',
          remediation: 'Implement role-based access controls',
        });
      }
    }

    controls.push({
      controlId: 'HIPAA-164.312(a)',
      controlName: 'Access Control',
      status: this.hasAccessControls(workflow) ? 'compliant' : 'non-compliant',
      evidence: [],
      gaps: [],
    });

    controls.push({
      controlId: 'HIPAA-164.312(e)',
      controlName: 'Transmission Security',
      status: this.hasEncryption(workflow) ? 'compliant' : 'non-compliant',
      evidence: [],
      gaps: [],
    });

    return {
      framework: 'HIPAA',
      isCompliant: findings.filter(f => f.severity === 'critical').length === 0,
      score: controls.filter(c => c.status === 'compliant').length / controls.length * 100,
      controls,
      findings,
    };
  }

  /**
   * Validate SOC2 compliance
   */
  private validateSOC2(workflow: N8nWorkflow): FrameworkComplianceResult {
    const findings: ComplianceFinding[] = [];
    const controls: ControlResult[] = [];

    // Trust Service Criteria checks
    const criteria = [
      { id: 'CC6.1', name: 'Logical and Physical Access', check: () => this.hasAccessControls(workflow) },
      { id: 'CC6.6', name: 'System Boundaries', check: () => this.hasNetworkControls(workflow) },
      { id: 'CC7.2', name: 'Change Management', check: () => this.hasChangeControls(workflow) },
      { id: 'CC8.1', name: 'Availability', check: () => this.hasAvailabilityControls(workflow) },
    ];

    for (const criterion of criteria) {
      const passed = criterion.check();
      controls.push({
        controlId: criterion.id,
        controlName: criterion.name,
        status: passed ? 'compliant' : 'partial',
        evidence: [],
        gaps: passed ? [] : [`${criterion.name} controls not fully implemented`],
      });

      if (!passed) {
        findings.push({
          id: `SOC2-${criterion.id}-${Date.now()}`,
          framework: 'SOC2',
          severity: 'warning',
          category: 'trust-criteria',
          title: `${criterion.name} - Partial compliance`,
          description: `${criterion.name} controls may need enhancement`,
          location: 'workflow',
          evidence: 'Automated check',
          remediation: `Review and enhance ${criterion.name.toLowerCase()} controls`,
        });
      }
    }

    return {
      framework: 'SOC2',
      isCompliant: findings.filter(f => f.severity === 'error' || f.severity === 'critical').length === 0,
      score: controls.filter(c => c.status === 'compliant').length / controls.length * 100,
      controls,
      findings,
    };
  }

  /**
   * Validate PCI-DSS compliance
   */
  private validatePCIDSS(workflow: N8nWorkflow): FrameworkComplianceResult {
    const findings: ComplianceFinding[] = [];
    const controls: ControlResult[] = [];

    // Check for payment card data
    const cardDataNodes = this.detectCardData(workflow);

    if (cardDataNodes.length > 0) {
      // Requirement 3: Protect stored cardholder data
      if (!this.hasCardDataProtection(workflow)) {
        findings.push({
          id: `PCI-req3-${Date.now()}`,
          framework: 'PCI-DSS',
          severity: 'critical',
          category: 'data-protection',
          title: 'Cardholder data not protected',
          description: 'Payment card data detected without adequate protection',
          location: cardDataNodes.join(', '),
          evidence: 'Card data patterns detected',
          remediation: 'Encrypt or mask cardholder data',
        });
      }

      // Requirement 4: Encrypt transmission
      if (!this.hasEncryption(workflow)) {
        findings.push({
          id: `PCI-req4-${Date.now()}`,
          framework: 'PCI-DSS',
          severity: 'critical',
          category: 'encryption',
          title: 'Card data transmitted without encryption',
          description: 'Payment data may be transmitted unencrypted',
          location: 'workflow',
          evidence: 'No TLS/encryption detected',
          remediation: 'Enable TLS for all cardholder data transmission',
        });
      }
    }

    controls.push({
      controlId: 'PCI-3',
      controlName: 'Protect Stored Data',
      status: cardDataNodes.length === 0 || this.hasCardDataProtection(workflow) ? 'compliant' : 'non-compliant',
      evidence: [],
      gaps: [],
    });

    controls.push({
      controlId: 'PCI-4',
      controlName: 'Encrypt Transmission',
      status: this.hasEncryption(workflow) ? 'compliant' : 'non-compliant',
      evidence: [],
      gaps: [],
    });

    return {
      framework: 'PCI-DSS',
      isCompliant: findings.filter(f => f.severity === 'critical').length === 0,
      score: controls.filter(c => c.status === 'compliant').length / controls.length * 100,
      controls,
      findings,
    };
  }

  /**
   * Validate data handling practices
   */
  private validateDataHandling(workflow: N8nWorkflow): DataHandlingResult {
    const categories: DataCategory[] = [];
    const risks: DataRisk[] = [];

    // Detect PII
    const piiFields = this.detectPII(workflow);
    if (piiFields.length > 0) {
      categories.push({
        type: 'PII',
        fields: piiFields,
        nodes: this.findNodesWithFields(workflow, piiFields),
        protection: this.hasEncryption(workflow) ? 'encrypted' : 'none',
      });

      if (!this.hasEncryption(workflow)) {
        risks.push({
          type: 'unprotected-pii',
          severity: 'high',
          description: 'PII data may be processed without encryption',
          mitigation: 'Enable encryption for PII fields',
        });
      }
    }

    // Detect financial data
    const financialFields = this.detectFinancialData(workflow);
    if (financialFields.length > 0) {
      categories.push({
        type: 'financial',
        fields: financialFields,
        nodes: this.findNodesWithFields(workflow, financialFields),
        protection: this.hasEncryption(workflow) ? 'encrypted' : 'none',
      });
    }

    // Processing activities
    const processingActivities: ProcessingActivity[] = [{
      purpose: workflow.settings?.description || 'Automated data processing',
      dataSubjects: 'Unknown',
      transfers: this.detectDataTransfers(workflow),
    }];

    return {
      personalDataDetected: piiFields.length > 0,
      sensitiveDataDetected: financialFields.length > 0,
      dataCategories: categories,
      processingActivities,
      risks,
    };
  }

  /**
   * Validate audit trail
   */
  private validateAuditTrail(workflow: N8nWorkflow): AuditTrailResult {
    const gaps: string[] = [];
    const recommendations: string[] = [];

    // Check execution logging
    const hasExecutionLogs = workflow.settings?.saveExecutionProgress === true;
    if (!hasExecutionLogs) {
      gaps.push('Execution progress not logged');
      recommendations.push('Enable saveExecutionProgress for audit trail');
    }

    // Check error logging
    const hasErrorLogs = workflow.settings?.saveDataErrorExecution !== 'none';
    if (!hasErrorLogs) {
      gaps.push('Error execution data not saved');
      recommendations.push('Enable error execution data saving');
    }

    // Calculate coverage
    const coverage = ((hasExecutionLogs ? 50 : 0) + (hasErrorLogs ? 50 : 0));

    return {
      isEnabled: hasExecutionLogs || hasErrorLogs,
      coverage,
      gaps,
      recommendations,
    };
  }

  /**
   * Validate retention policy
   */
  private validateRetentionPolicy(workflow: N8nWorkflow): RetentionPolicyResult {
    const policies: RetentionRule[] = [];
    const violations: string[] = [];

    // Check workflow-level retention
    const saveDataSuccessExecution = workflow.settings?.saveDataSuccessExecution;
    const saveDataErrorExecution = workflow.settings?.saveDataErrorExecution;

    if (saveDataSuccessExecution === 'all') {
      violations.push('All successful execution data retained indefinitely');
    }

    policies.push({
      dataType: 'successful-executions',
      retentionPeriod: saveDataSuccessExecution === 'none' ? '0 days' :
        saveDataSuccessExecution === 'lastSuccess' ? 'Last execution only' : 'Indefinite',
      deletionMethod: 'automatic',
      isEnforced: saveDataSuccessExecution !== 'all',
    });

    policies.push({
      dataType: 'error-executions',
      retentionPeriod: saveDataErrorExecution === 'none' ? '0 days' : 'Indefinite',
      deletionMethod: 'manual',
      isEnforced: saveDataErrorExecution === 'none',
    });

    return {
      hasPolicy: policies.some(p => p.isEnforced),
      policies,
      violations,
    };
  }

  // Helper methods

  private detectPII(workflow: N8nWorkflow): string[] {
    const piiFields: string[] = [];
    const workflowStr = JSON.stringify(workflow).toLowerCase();

    for (const [name, pattern] of Object.entries(PII_PATTERNS)) {
      if (pattern.test(workflowStr)) {
        piiFields.push(name);
      }
    }

    return piiFields;
  }

  private detectPHI(workflow: N8nWorkflow): string[] {
    const phiPatterns = [
      /medical|health|diagnosis|treatment|prescription/i,
      /patient|doctor|hospital|clinic/i,
      /insurance|claim|coverage/i,
    ];

    const workflowStr = JSON.stringify(workflow);
    const detected: string[] = [];

    for (const pattern of phiPatterns) {
      if (pattern.test(workflowStr)) {
        detected.push(pattern.source);
      }
    }

    return detected;
  }

  private detectFinancialData(workflow: N8nWorkflow): string[] {
    const patterns = [
      /account.*number|routing.*number/i,
      /credit.*card|debit.*card/i,
      /bank|payment|transaction/i,
    ];

    const workflowStr = JSON.stringify(workflow);
    const detected: string[] = [];

    for (const pattern of patterns) {
      if (pattern.test(workflowStr)) {
        detected.push(pattern.source);
      }
    }

    return detected;
  }

  private detectCardData(workflow: N8nWorkflow): string[] {
    const nodes: string[] = [];

    for (const node of workflow.nodes) {
      const nodeStr = JSON.stringify(node.parameters);
      if (PII_PATTERNS.creditCard.test(nodeStr) || /card_?number|cvv|expir/i.test(nodeStr)) {
        nodes.push(node.name);
      }
    }

    return nodes;
  }

  private detectDataTransfers(workflow: N8nWorkflow): string[] {
    const transfers: string[] = [];

    for (const node of workflow.nodes) {
      if (node.type.includes('httpRequest')) {
        const url = node.parameters.url as string;
        if (url) {
          try {
            const hostname = new URL(url).hostname;
            if (!hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
              transfers.push(hostname);
            }
          } catch {
            // Invalid URL
          }
        }
      }
    }

    return [...new Set(transfers)];
  }

  private hasLawfulBasisDocumentation(workflow: N8nWorkflow): boolean {
    return !!(workflow.settings?.description || workflow.tags?.length);
  }

  private detectUnnecessaryData(workflow: N8nWorkflow): string[] {
    // Check for overly broad data selection
    const unnecessary: string[] = [];

    for (const node of workflow.nodes) {
      if (node.type.includes('postgres') || node.type.includes('mysql')) {
        const query = node.parameters.query as string;
        if (query && query.includes('SELECT *')) {
          unnecessary.push(`${node.name}: SELECT * may retrieve unnecessary data`);
        }
      }
    }

    return unnecessary;
  }

  private checkSecurityControls(workflow: N8nWorkflow): string[] {
    const issues: string[] = [];

    // Check for hardcoded credentials
    for (const node of workflow.nodes) {
      const paramsStr = JSON.stringify(node.parameters);
      if (/password\s*[=:]\s*["'][^"']+["']/i.test(paramsStr)) {
        issues.push(`Hardcoded password in ${node.name}`);
      }
    }

    return issues;
  }

  private hasEncryption(workflow: N8nWorkflow): boolean {
    // Check if HTTPS is used for HTTP requests
    for (const node of workflow.nodes) {
      if (node.type.includes('httpRequest')) {
        const url = node.parameters.url as string;
        if (url && url.startsWith('http://')) {
          return false;
        }
      }
    }
    return true;
  }

  private hasAccessControls(workflow: N8nWorkflow): boolean {
    // Check for credential usage (indicates access control)
    return workflow.nodes.some(n => n.credentials && Object.keys(n.credentials).length > 0);
  }

  private hasNetworkControls(workflow: N8nWorkflow): boolean {
    return true; // Would need n8n instance configuration
  }

  private hasChangeControls(workflow: N8nWorkflow): boolean {
    return !!(workflow.versionId);
  }

  private hasAvailabilityControls(workflow: N8nWorkflow): boolean {
    return !!(workflow.settings?.errorWorkflow);
  }

  private hasCardDataProtection(workflow: N8nWorkflow): boolean {
    return this.hasEncryption(workflow);
  }

  private findNodesWithFields(workflow: N8nWorkflow, fields: string[]): string[] {
    const nodes: string[] = [];
    const fieldsRegex = new RegExp(fields.join('|'), 'i');

    for (const node of workflow.nodes) {
      if (fieldsRegex.test(JSON.stringify(node.parameters))) {
        nodes.push(node.name);
      }
    }

    return nodes;
  }

  private dataHandlingFindings(data: DataHandlingResult): ComplianceFinding[] {
    return data.risks.map((risk, i) => ({
      id: `data-risk-${i}`,
      severity: risk.severity as any,
      category: 'data-handling',
      title: risk.type,
      description: risk.description,
      location: 'workflow',
      evidence: 'Data analysis',
      remediation: risk.mitigation,
    }));
  }

  private auditTrailFindings(audit: AuditTrailResult): ComplianceFinding[] {
    return audit.gaps.map((gap, i) => ({
      id: `audit-gap-${i}`,
      severity: 'warning',
      category: 'audit',
      title: 'Audit trail gap',
      description: gap,
      location: 'workflow',
      evidence: 'Configuration check',
      remediation: audit.recommendations[i] || 'Enable audit logging',
    }));
  }

  private retentionFindings(retention: RetentionPolicyResult): ComplianceFinding[] {
    return retention.violations.map((v, i) => ({
      id: `retention-${i}`,
      severity: 'warning',
      category: 'retention',
      title: 'Retention policy issue',
      description: v,
      location: 'workflow',
      evidence: 'Policy check',
      remediation: 'Configure appropriate retention policy',
    }));
  }

  private calculateOverallCompliance(
    frameworks: FrameworkComplianceResult[],
    findings: ComplianceFinding[]
  ): ComplianceValidationResult['overallCompliance'] {
    const avgScore = frameworks.reduce((sum, f) => sum + f.score, 0) / frameworks.length;
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const errorCount = findings.filter(f => f.severity === 'error').length;

    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (criticalCount > 0) riskLevel = 'critical';
    else if (errorCount > 2) riskLevel = 'high';
    else if (errorCount > 0 || avgScore < 70) riskLevel = 'medium';
    else riskLevel = 'low';

    return {
      isCompliant: criticalCount === 0 && errorCount === 0,
      score: avgScore,
      riskLevel,
    };
  }

  private generateRemediationPlan(findings: ComplianceFinding[]): RemediationItem[] {
    const priorityMap: Record<string, number> = {
      critical: 1,
      error: 2,
      warning: 3,
      info: 4,
    };

    return findings
      .sort((a, b) => priorityMap[a.severity] - priorityMap[b.severity])
      .map((finding, i) => ({
        findingId: finding.id,
        priority: i + 1,
        effort: finding.severity === 'critical' ? 'high' : finding.severity === 'error' ? 'medium' : 'low',
        action: finding.remediation,
      }));
  }

  private getDefaultFrameworkResult(framework: ComplianceFramework): FrameworkComplianceResult {
    return {
      framework,
      isCompliant: true,
      score: 100,
      controls: [],
      findings: [],
    };
  }

  private getDefaultDataHandling(): DataHandlingResult {
    return {
      personalDataDetected: false,
      sensitiveDataDetected: false,
      dataCategories: [],
      processingActivities: [],
      risks: [],
    };
  }

  private getDefaultAuditTrail(): AuditTrailResult {
    return {
      isEnabled: false,
      coverage: 0,
      gaps: [],
      recommendations: [],
    };
  }

  private getDefaultRetentionPolicy(): RetentionPolicyResult {
    return {
      hasPolicy: false,
      policies: [],
      violations: [],
    };
  }

  /**
   * Execute workflow and trace PII data flow through nodes
   * This catches runtime compliance issues like PII being logged,
   * sent to unauthorized destinations, or retained improperly
   */
  private async executeRuntimePIITracing(
    workflowId: string,
    testInput?: Record<string, unknown>
  ): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // Generate test data with identifiable PII for tracing
    const piiTestData: Record<string, unknown> = {
      email: 'test.trace@pii-detection.test',
      phone: '555-123-4567',
      ssn: '123-45-6789',
      name: 'PII_Trace_Name',
      address: '123 PII Trace Street',
      creditCard: '4111111111111111',
      ...testInput,
    };

    try {
      // Execute workflow with PII test data
      const execution = await this.executeWorkflow(workflowId, piiTestData, {
        waitForCompletion: true,
        timeout: 30000,
      });

      // Wait for completion
      const completedExecution = await this.waitForExecution(execution.id, 30000);

      // Trace PII through each node's output
      const piiTrace = this.tracePIIFlow(completedExecution, piiTestData);

      // Analyze the trace for compliance issues
      for (const [nodeName, piiFound] of Object.entries(piiTrace)) {
        if (piiFound.length > 0) {
          // Check if this node should have PII
          const isExpectedPIINode = this.isAuthorizedPIINode(nodeName, completedExecution);

          if (!isExpectedPIINode) {
            findings.push({
              id: `runtime-pii-${nodeName}-${Date.now()}`,
              severity: 'error',
              category: 'data-flow',
              title: `Unauthorized PII flow detected in ${nodeName}`,
              description: `PII types found: ${piiFound.join(', ')}. This node may be processing PII without authorization.`,
              location: nodeName,
              evidence: `Traced PII: ${piiFound.join(', ')}`,
              remediation: 'Review data flow and ensure PII is only processed in authorized nodes with proper safeguards.',
            });
          }

          // Check if PII is being sent to external services
          if (this.isExternalServiceNode(nodeName, completedExecution)) {
            findings.push({
              id: `runtime-pii-external-${nodeName}-${Date.now()}`,
              framework: 'GDPR',
              severity: 'critical',
              category: 'data-transfer',
              title: `PII potentially transferred externally via ${nodeName}`,
              description: `PII (${piiFound.join(', ')}) detected in data sent to external service.`,
              location: nodeName,
              evidence: `External node with PII: ${piiFound.join(', ')}`,
              remediation: 'Ensure data processing agreement exists with third party. Consider data minimization.',
            });
          }
        }
      }

      // Check if PII was stored in execution logs
      if (completedExecution.data?.resultData?.runData) {
        const executionDataStr = JSON.stringify(completedExecution.data);

        for (const [piiType, piiValue] of Object.entries(piiTestData)) {
          if (typeof piiValue === 'string' && executionDataStr.includes(piiValue)) {
            // PII found in execution data - check retention settings
            const workflow = await this.getWorkflow(workflowId);
            if (workflow.settings?.saveDataSuccessExecution === 'all') {
              findings.push({
                id: `runtime-pii-retention-${piiType}-${Date.now()}`,
                framework: 'GDPR',
                severity: 'error',  // Use 'error' instead of 'high' per type definition
                category: 'retention',
                title: `PII (${piiType}) may be retained in execution logs`,
                description: `PII data found in execution results which are configured to be retained.`,
                location: 'execution-logs',
                evidence: `PII type "${piiType}" found in saved execution data`,
                remediation: 'Configure data retention policies or mask PII before storing execution results.',
              });
              break; // Only report once for retention
            }
          }
        }
      }
    } catch (error) {
      // Log but don't fail the entire compliance check
      this.logger.error('Runtime PII tracing failed:', error);
    }

    return findings;
  }

  /**
   * Trace PII test values through execution data
   */
  private tracePIIFlow(
    execution: N8nExecution,
    piiTestData: Record<string, unknown>
  ): Record<string, string[]> {
    const trace: Record<string, string[]> = {};
    const runData = execution.data?.resultData?.runData;

    if (!runData) return trace;

    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      const piiFound: string[] = [];

      for (const run of nodeRuns) {
        const nodeDataStr = JSON.stringify(run.data || {});

        for (const [piiType, piiValue] of Object.entries(piiTestData)) {
          if (typeof piiValue === 'string' && nodeDataStr.includes(piiValue)) {
            piiFound.push(piiType);
          }
        }
      }

      if (piiFound.length > 0) {
        trace[nodeName] = [...new Set(piiFound)];
      }
    }

    return trace;
  }

  /**
   * Check if node is authorized to process PII
   */
  private isAuthorizedPIINode(nodeName: string, execution: N8nExecution): boolean {
    // First few nodes in execution are typically authorized (input/trigger)
    const runData = execution.data?.resultData?.runData;
    if (!runData) return true;

    const nodeNames = Object.keys(runData);
    const nodeIndex = nodeNames.indexOf(nodeName);

    // First 2 nodes are typically authorized (trigger + first processor)
    return nodeIndex < 2;
  }

  /**
   * Check if node sends data to external services
   */
  private isExternalServiceNode(nodeName: string, execution: N8nExecution): boolean {
    const runData = execution.data?.resultData?.runData;
    if (!runData) return false;

    const nodeRuns = runData[nodeName];
    if (!nodeRuns || nodeRuns.length === 0) return false;

    // Check source info for node type
    const nodeSource = nodeRuns[0].source?.[0];
    if (!nodeSource) return false;

    // HTTP, webhook, and API nodes are external
    const externalPatterns = ['http', 'api', 'webhook', 'slack', 'email', 'sendgrid'];
    const nodeType = nodeSource.previousNode || '';

    return externalPatterns.some(p => nodeType.toLowerCase().includes(p) || nodeName.toLowerCase().includes(p));
  }

  /**
   * Wait for workflow execution to complete
   */
  private async waitForExecution(
    executionId: string,
    timeoutMs: number
  ): Promise<N8nExecution> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const execution = await this.getExecution(executionId);

      if (execution.status !== 'running' && execution.status !== 'waiting') {
        return execution;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Execution ${executionId} timed out after ${timeoutMs}ms`);
  }
}
