/**
 * Agentic QE v3 - Security & Compliance Coordinator
 * Orchestrates security scanning and compliance validation workflows
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Result,
  ok,
  err,
  DomainEvent,
} from '../../shared/types/index.js';
import type {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
} from '../../kernel/interfaces.js';
import { FilePath } from '../../shared/value-objects/index.js';
import {
  SecurityComplianceEvents,
  VulnerabilityPayload,
  CompliancePayload,
  createEvent,
} from '../../shared/events/domain-events.js';
import type {
  ISecurityComplianceCoordinator,
  SecurityAuditOptions,
  SecurityAuditReport,
  SecurityPosture,
  ComplianceReport,
  ComplianceContext,
  SASTResult,
  DASTResult,
  Vulnerability,
} from './interfaces.js';
import {
  SecurityScannerService,
  type ISecurityScannerService,
} from './services/security-scanner.js';
import {
  SecurityAuditorService,
  type ISecurityAuditorService,
} from './services/security-auditor.js';
import {
  ComplianceValidatorService,
  type IExtendedComplianceValidationService,
} from './services/compliance-validator.js';

// ============================================================================
// Coordinator Interface Extension
// ============================================================================

export interface IExtendedSecurityComplianceCoordinator
  extends ISecurityComplianceCoordinator {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getActiveWorkflows(): WorkflowStatus[];

  /**
   * Run targeted security scan
   */
  runSecurityScan(
    files: FilePath[],
    scanType: 'sast' | 'dast' | 'full'
  ): Promise<Result<SASTResult | DASTResult>>;

  /**
   * Run compliance validation for specific standard
   */
  runComplianceValidation(
    standardId: string,
    context: ComplianceContext
  ): Promise<Result<ComplianceReport>>;
}

// ============================================================================
// Workflow Types
// ============================================================================

export interface WorkflowStatus {
  id: string;
  type: 'audit' | 'scan' | 'compliance' | 'posture';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  agentIds: string[];
  progress: number;
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

export interface CoordinatorConfig {
  maxConcurrentWorkflows: number;
  defaultTimeout: number;
  publishEvents: boolean;
  autoTriageVulnerabilities: boolean;
  riskThreshold: number;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 3,
  defaultTimeout: 300000, // 5 minutes
  publishEvents: true,
  autoTriageVulnerabilities: true,
  riskThreshold: 0.7,
};

// ============================================================================
// Security & Compliance Coordinator Implementation
// ============================================================================

export class SecurityComplianceCoordinator
  implements IExtendedSecurityComplianceCoordinator
{
  private readonly config: CoordinatorConfig;
  private readonly securityScanner: ISecurityScannerService;
  private readonly securityAuditor: ISecurityAuditorService;
  private readonly complianceValidator: IExtendedComplianceValidationService;
  private readonly workflows: Map<string, WorkflowStatus> = new Map();
  private initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.securityScanner = new SecurityScannerService(memory);
    this.securityAuditor = new SecurityAuditorService(memory);
    this.complianceValidator = new ComplianceValidatorService(memory);
  }

  // ==========================================================================
  // Lifecycle Methods
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.subscribeToEvents();
    await this.loadWorkflowState();

    this.initialized = true;
  }

  async dispose(): Promise<void> {
    await this.saveWorkflowState();
    this.workflows.clear();
    this.initialized = false;
  }

  getActiveWorkflows(): WorkflowStatus[] {
    return Array.from(this.workflows.values()).filter(
      (w) => w.status === 'running' || w.status === 'pending'
    );
  }

  // ==========================================================================
  // ISecurityComplianceCoordinator Implementation
  // ==========================================================================

  /**
   * Run comprehensive security audit
   */
  async runSecurityAudit(
    options: SecurityAuditOptions
  ): Promise<Result<SecurityAuditReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'audit');

      // Check agent availability
      if (!this.agentCoordinator.canSpawn()) {
        return err(
          new Error('Agent limit reached, cannot spawn security audit agents')
        );
      }

      // Spawn security audit agent
      const agentResult = await this.spawnSecurityAuditAgent(workflowId, options);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      // Run the audit
      const result = await this.securityAuditor.runAudit(options);

      if (result.success) {
        this.completeWorkflow(workflowId);

        // Publish events
        if (this.config.publishEvents) {
          await this.publishAuditCompleted(result.value);

          // Publish individual vulnerability events for critical/high
          for (const vuln of this.extractHighSeverityVulns(result.value)) {
            await this.publishVulnerabilityDetected(vuln);
          }
        }

        // Auto-triage if enabled
        if (this.config.autoTriageVulnerabilities) {
          const allVulns = this.extractAllVulnerabilities(result.value);
          if (allVulns.length > 0) {
            await this.securityAuditor.triageVulnerabilities(allVulns);
          }
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      // Stop agent
      await this.agentCoordinator.stop(agentResult.value);

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  /**
   * Run compliance check against a standard
   */
  async runComplianceCheck(standardId: string): Promise<Result<ComplianceReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'compliance');

      // Get the standard
      const standards = await this.complianceValidator.getAvailableStandards();
      const standard = standards.find((s) => s.id === standardId);

      if (!standard) {
        return err(new Error(`Unknown compliance standard: ${standardId}`));
      }

      // Spawn compliance agent
      const agentResult = await this.spawnComplianceAgent(workflowId, standardId);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      // Default context
      const context: ComplianceContext = {
        projectRoot: FilePath.create('.'),
        includePatterns: ['src/**/*', 'lib/**/*'],
        excludePatterns: ['node_modules/**', 'dist/**', 'test/**'],
      };

      // Run validation
      const result = await this.complianceValidator.validate(standard, context);

      if (result.success) {
        this.completeWorkflow(workflowId);

        if (this.config.publishEvents) {
          await this.publishComplianceValidated(result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      await this.agentCoordinator.stop(agentResult.value);

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  /**
   * Get security posture summary
   */
  async getSecurityPosture(): Promise<Result<SecurityPosture>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'posture');

      // Get posture from auditor
      const postureResult = await this.securityAuditor.getSecurityPosture();

      if (!postureResult.success) {
        this.failWorkflow(workflowId, postureResult.error.message);
        return err(postureResult.error);
      }

      const postureSummary = postureResult.value;

      // Get compliance status for all standards
      const complianceStatus = new Map<string, number>();
      const standards = await this.complianceValidator.getAvailableStandards();

      for (const standard of standards.slice(0, 3)) {
        // Top 3 standards
        const context: ComplianceContext = {
          projectRoot: FilePath.create('.'),
          includePatterns: ['src/**/*'],
          excludePatterns: ['node_modules/**'],
        };

        const compResult = await this.complianceValidator.validate(
          standard,
          context
        );
        if (compResult.success) {
          complianceStatus.set(standard.id, compResult.value.complianceScore);
        }
      }

      const posture: SecurityPosture = {
        overallScore: postureSummary.overallScore,
        trend: postureSummary.trend,
        criticalVulnerabilities: postureSummary.criticalIssues,
        complianceStatus,
        lastAuditDate: postureSummary.lastAuditDate,
      };

      this.completeWorkflow(workflowId);

      return ok(posture);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  // ==========================================================================
  // Extended Methods
  // ==========================================================================

  /**
   * Run targeted security scan
   */
  async runSecurityScan(
    files: FilePath[],
    scanType: 'sast' | 'dast' | 'full'
  ): Promise<Result<SASTResult | DASTResult>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'scan');

      // Spawn scanning agent
      const agentResult = await this.spawnScanningAgent(workflowId, scanType);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      let result: Result<SASTResult | DASTResult>;

      switch (scanType) {
        case 'sast':
          result = await this.securityScanner.scanFiles(files);
          break;
        case 'dast':
          // DAST requires a URL, return error if only files provided
          return err(
            new Error('DAST scanning requires a target URL, not files')
          );
        case 'full':
          const fullResult = await this.securityScanner.runFullScan(files);
          if (fullResult.success) {
            result = ok(fullResult.value.sastResult);
          } else {
            result = err(fullResult.error);
          }
          break;
        default:
          result = err(new Error(`Unknown scan type: ${scanType}`));
      }

      if (result.success) {
        this.completeWorkflow(workflowId);

        if (this.config.publishEvents) {
          const vulnerabilities =
            'vulnerabilities' in result.value ? result.value.vulnerabilities : [];
          for (const vuln of vulnerabilities.filter(
            (v) => v.severity === 'critical' || v.severity === 'high'
          )) {
            await this.publishVulnerabilityDetected(vuln);
          }
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      await this.agentCoordinator.stop(agentResult.value);

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  /**
   * Run compliance validation for specific standard
   */
  async runComplianceValidation(
    standardId: string,
    context: ComplianceContext
  ): Promise<Result<ComplianceReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'compliance');

      const standards = await this.complianceValidator.getAvailableStandards();
      const standard = standards.find((s) => s.id === standardId);

      if (!standard) {
        return err(new Error(`Unknown compliance standard: ${standardId}`));
      }

      const agentResult = await this.spawnComplianceAgent(workflowId, standardId);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      const result = await this.complianceValidator.validate(standard, context);

      if (result.success) {
        this.completeWorkflow(workflowId);

        if (this.config.publishEvents) {
          await this.publishComplianceValidated(result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      await this.agentCoordinator.stop(agentResult.value);

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  // ==========================================================================
  // Agent Spawning
  // ==========================================================================

  private async spawnSecurityAuditAgent(
    workflowId: string,
    options: SecurityAuditOptions
  ): Promise<Result<string, Error>> {
    const capabilities = ['security-audit'];
    if (options.includeSAST) capabilities.push('sast');
    if (options.includeDAST) capabilities.push('dast');
    if (options.includeDependencies) capabilities.push('dependency-scan');
    if (options.includeSecrets) capabilities.push('secret-scan');

    const config: AgentSpawnConfig = {
      name: `security-audit-${workflowId.slice(0, 8)}`,
      domain: 'security-compliance',
      type: 'analyzer',
      capabilities,
      config: {
        workflowId,
        options,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnComplianceAgent(
    workflowId: string,
    standardId: string
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `compliance-${standardId}-${workflowId.slice(0, 8)}`,
      domain: 'security-compliance',
      type: 'validator',
      capabilities: ['compliance-validation', standardId],
      config: {
        workflowId,
        standardId,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnScanningAgent(
    workflowId: string,
    scanType: string
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `security-scan-${scanType}-${workflowId.slice(0, 8)}`,
      domain: 'security-compliance',
      type: 'analyzer',
      capabilities: ['security-scanning', scanType],
      config: {
        workflowId,
        scanType,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  // ==========================================================================
  // Event Publishing
  // ==========================================================================

  private async publishAuditCompleted(report: SecurityAuditReport): Promise<void> {
    const event = createEvent(
      SecurityComplianceEvents.SecurityAuditCompleted,
      'security-compliance',
      {
        auditId: report.auditId,
        timestamp: report.timestamp.toISOString(),
        riskScore: report.overallRiskScore,
        recommendations: report.recommendations,
      }
    );

    await this.eventBus.publish(event);
  }

  private async publishVulnerabilityDetected(vuln: Vulnerability): Promise<void> {
    const payload: VulnerabilityPayload = {
      vulnId: vuln.id,
      cve: vuln.cveId,
      severity: vuln.severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
      file: vuln.location.file,
      line: vuln.location.line,
      description: vuln.description,
      remediation: vuln.remediation.description,
    };

    const event = createEvent(
      SecurityComplianceEvents.VulnerabilityDetected,
      'security-compliance',
      payload
    );

    await this.eventBus.publish(event);
  }

  private async publishComplianceValidated(report: ComplianceReport): Promise<void> {
    const payload: CompliancePayload = {
      standard: report.standardId,
      passed: report.complianceScore >= 80,
      violations: report.violations.length,
      findings: report.violations.slice(0, 5).map((v) => v.details),
    };

    const event = createEvent(
      SecurityComplianceEvents.ComplianceValidated,
      'security-compliance',
      payload
    );

    await this.eventBus.publish(event);
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  private subscribeToEvents(): void {
    // Listen for code changes to trigger security scans
    this.eventBus.subscribe(
      'code-intelligence.ImpactAnalysisCompleted',
      this.handleImpactAnalysis.bind(this)
    );

    // Listen for deployment events to ensure compliance
    this.eventBus.subscribe(
      'quality-assessment.DeploymentApproved',
      this.handleDeploymentApproval.bind(this)
    );
  }

  private async handleImpactAnalysis(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      changedFiles: string[];
      riskLevel: string;
    };

    // Auto-scan high-risk changes
    if (
      payload.riskLevel === 'critical' ||
      payload.riskLevel === 'high'
    ) {
      const files = payload.changedFiles.map((f) => FilePath.create(f));
      await this.runSecurityScan(files, 'sast');
    }
  }

  private async handleDeploymentApproval(_event: DomainEvent): Promise<void> {
    // Could trigger compliance re-validation before deployment
    // This is a hook for organizations that require compliance checks
    // before each deployment
  }

  // ==========================================================================
  // Workflow Management
  // ==========================================================================

  private startWorkflow(id: string, type: WorkflowStatus['type']): void {
    const activeWorkflows = this.getActiveWorkflows();
    if (activeWorkflows.length >= this.config.maxConcurrentWorkflows) {
      throw new Error(
        `Maximum concurrent workflows (${this.config.maxConcurrentWorkflows}) reached`
      );
    }

    this.workflows.set(id, {
      id,
      type,
      status: 'running',
      startedAt: new Date(),
      agentIds: [],
      progress: 0,
    });
  }

  private completeWorkflow(id: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'completed';
      workflow.completedAt = new Date();
      workflow.progress = 100;
    }
  }

  private failWorkflow(id: string, error: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'failed';
      workflow.completedAt = new Date();
      workflow.error = error;
    }
  }

  private addAgentToWorkflow(workflowId: string, agentId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.agentIds.push(agentId);
    }
  }

  // ==========================================================================
  // State Persistence
  // ==========================================================================

  private async loadWorkflowState(): Promise<void> {
    const savedState = await this.memory.get<WorkflowStatus[]>(
      'security-compliance:coordinator:workflows'
    );

    if (savedState) {
      for (const workflow of savedState) {
        if (workflow.status === 'running') {
          workflow.status = 'failed';
          workflow.error = 'Coordinator restarted';
          workflow.completedAt = new Date();
        }
        this.workflows.set(workflow.id, workflow);
      }
    }
  }

  private async saveWorkflowState(): Promise<void> {
    const workflows = Array.from(this.workflows.values());
    await this.memory.set(
      'security-compliance:coordinator:workflows',
      workflows,
      { namespace: 'security-compliance', persist: true }
    );
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private extractHighSeverityVulns(report: SecurityAuditReport): Vulnerability[] {
    const vulns: Vulnerability[] = [];

    if (report.sastResults) {
      vulns.push(
        ...report.sastResults.vulnerabilities.filter(
          (v) => v.severity === 'critical' || v.severity === 'high'
        )
      );
    }

    if (report.dastResults) {
      vulns.push(
        ...report.dastResults.vulnerabilities.filter(
          (v) => v.severity === 'critical' || v.severity === 'high'
        )
      );
    }

    if (report.dependencyResults) {
      vulns.push(
        ...report.dependencyResults.vulnerabilities.filter(
          (v) => v.severity === 'critical' || v.severity === 'high'
        )
      );
    }

    return vulns;
  }

  private extractAllVulnerabilities(report: SecurityAuditReport): Vulnerability[] {
    const vulns: Vulnerability[] = [];

    if (report.sastResults) {
      vulns.push(...report.sastResults.vulnerabilities);
    }

    if (report.dastResults) {
      vulns.push(...report.dastResults.vulnerabilities);
    }

    if (report.dependencyResults) {
      vulns.push(...report.dependencyResults.vulnerabilities);
    }

    return vulns;
  }
}
