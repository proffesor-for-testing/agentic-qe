/**
 * Agentic QE v3 - Security & Compliance Domain Plugin
 * Integrates the security-compliance domain into the kernel
 */

import type { DomainName, DomainEvent, Result } from '../../shared/types/index.js';
import type {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces.js';
import { BaseDomainPlugin } from '../domain-interface.js';
import { FilePath } from '../../shared/value-objects/index.js';
import type {
  SecurityAuditOptions,
  SecurityAuditReport,
  SecurityPosture,
  ComplianceReport,
  ComplianceStandard,
  SASTResult,
  DASTResult,
  Vulnerability,
  GapAnalysis,
} from './interfaces.js';
import {
  SecurityComplianceCoordinator,
  type IExtendedSecurityComplianceCoordinator,
  type CoordinatorConfig,
} from './coordinator.js';
import {
  SecurityScannerService,
  type ISecurityScannerService,
  type SecurityScannerConfig,
} from './services/security-scanner.js';
import {
  SecurityAuditorService,
  type ISecurityAuditorService,
  type SecurityAuditorConfig,
} from './services/security-auditor.js';
import {
  ComplianceValidatorService,
  type IExtendedComplianceValidationService,
  type ComplianceValidatorConfig,
} from './services/compliance-validator.js';

// ============================================================================
// Plugin Configuration
// ============================================================================

export interface SecurityCompliancePluginConfig {
  coordinator?: Partial<CoordinatorConfig>;
  securityScanner?: Partial<SecurityScannerConfig>;
  securityAuditor?: Partial<SecurityAuditorConfig>;
  complianceValidator?: Partial<ComplianceValidatorConfig>;
}

// ============================================================================
// Extended API
// ============================================================================

/**
 * Public API exposed by the security-compliance domain
 */
export interface SecurityComplianceAPI {
  // Security Audit
  runSecurityAudit(options: SecurityAuditOptions): Promise<Result<SecurityAuditReport>>;
  getSecurityPosture(): Promise<Result<SecurityPosture>>;

  // Security Scanning
  runSASTScan(files: FilePath[]): Promise<Result<SASTResult>>;
  runDASTScan(targetUrl: string): Promise<Result<DASTResult>>;
  triageVulnerabilities(
    vulnerabilities: Vulnerability[]
  ): Promise<Result<{ immediate: Vulnerability[]; shortTerm: Vulnerability[] }>>;

  // Compliance
  runComplianceCheck(standardId: string): Promise<Result<ComplianceReport>>;
  getAvailableStandards(): Promise<ComplianceStandard[]>;
  analyzeComplianceGaps(
    currentReport: ComplianceReport,
    targetStandard: ComplianceStandard
  ): Promise<Result<GapAnalysis>>;
}

/**
 * Extended API with internal access
 */
export interface SecurityComplianceExtendedAPI extends SecurityComplianceAPI {
  getCoordinator(): IExtendedSecurityComplianceCoordinator;
  getSecurityScanner(): ISecurityScannerService;
  getSecurityAuditor(): ISecurityAuditorService;
  getComplianceValidator(): IExtendedComplianceValidationService;
}

// ============================================================================
// Security & Compliance Domain Plugin
// ============================================================================

export class SecurityCompliancePlugin extends BaseDomainPlugin {
  private coordinator: IExtendedSecurityComplianceCoordinator | null = null;
  private securityScanner: ISecurityScannerService | null = null;
  private securityAuditor: ISecurityAuditorService | null = null;
  private complianceValidator: IExtendedComplianceValidationService | null = null;
  private readonly pluginConfig: SecurityCompliancePluginConfig;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: SecurityCompliancePluginConfig = {}
  ) {
    super(eventBus, memory);
    this.pluginConfig = config;
  }

  // ==========================================================================
  // DomainPlugin Interface Implementation
  // ==========================================================================

  get name(): DomainName {
    return 'security-compliance';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Can optionally integrate with code-intelligence for impact analysis
    return [];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    const api: SecurityComplianceExtendedAPI = {
      // Public API methods
      runSecurityAudit: this.runSecurityAudit.bind(this),
      getSecurityPosture: this.getSecurityPosture.bind(this),
      runSASTScan: this.runSASTScan.bind(this),
      runDASTScan: this.runDASTScan.bind(this),
      triageVulnerabilities: this.triageVulnerabilities.bind(this),
      runComplianceCheck: this.runComplianceCheck.bind(this),
      getAvailableStandards: this.getAvailableStandards.bind(this),
      analyzeComplianceGaps: this.analyzeComplianceGaps.bind(this),

      // Internal access methods
      getCoordinator: () => this.coordinator!,
      getSecurityScanner: () => this.securityScanner!,
      getSecurityAuditor: () => this.securityAuditor!,
      getComplianceValidator: () => this.complianceValidator!,
    };

    return api as T;
  }

  // ==========================================================================
  // Lifecycle Methods
  // ==========================================================================

  protected async onInitialize(): Promise<void> {
    // Create services
    this.securityScanner = new SecurityScannerService(
      this.memory,
      this.pluginConfig.securityScanner
    );

    this.securityAuditor = new SecurityAuditorService(
      this.memory,
      this.pluginConfig.securityAuditor
    );

    this.complianceValidator = new ComplianceValidatorService(
      this.memory,
      this.pluginConfig.complianceValidator
    );

    // Create coordinator
    this.coordinator = new SecurityComplianceCoordinator(
      this.eventBus,
      this.memory,
      this.agentCoordinator,
      this.pluginConfig.coordinator
    );

    // Initialize coordinator
    await this.coordinator.initialize();

    // Update health status
    this.updateHealth({
      status: 'healthy',
      agents: { total: 0, active: 0, idle: 0, failed: 0 },
      lastActivity: new Date(),
      errors: [],
    });
  }

  protected async onDispose(): Promise<void> {
    if (this.coordinator) {
      await this.coordinator.dispose();
    }

    this.coordinator = null;
    this.securityScanner = null;
    this.securityAuditor = null;
    this.complianceValidator = null;
  }

  protected subscribeToEvents(): void {
    // Subscribe to code change events for security scanning
    this.eventBus.subscribe(
      'code-intelligence.KnowledgeGraphUpdated',
      this.handleKnowledgeGraphUpdate.bind(this)
    );

    // Subscribe to deployment events for pre-deployment compliance
    this.eventBus.subscribe(
      'quality-assessment.QualityGateEvaluated',
      this.handleQualityGateEvaluated.bind(this)
    );

    // Subscribe to test events for security test tracking
    this.eventBus.subscribe(
      'test-execution.TestRunCompleted',
      this.handleTestRunCompleted.bind(this)
    );
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    // Track activity
    this.updateHealth({
      lastActivity: new Date(),
    });

    // Route to appropriate handler
    switch (event.type) {
      case 'code-intelligence.KnowledgeGraphUpdated':
        await this.handleKnowledgeGraphUpdate(event);
        break;
      case 'quality-assessment.QualityGateEvaluated':
        await this.handleQualityGateEvaluated(event);
        break;
      default:
        break;
    }
  }

  // ==========================================================================
  // API Implementation
  // ==========================================================================

  private async runSecurityAudit(
    options: SecurityAuditOptions
  ): Promise<Result<SecurityAuditReport>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.runSecurityAudit(options);

      if (result.success) {
        this.trackSuccessfulOperation('audit');
      } else {
        this.trackFailedOperation('audit', result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async getSecurityPosture(): Promise<Result<SecurityPosture>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.getSecurityPosture();
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async runSASTScan(files: FilePath[]): Promise<Result<SASTResult>> {
    this.ensureInitialized();

    try {
      const result = await this.securityScanner!.scanFiles(files);

      if (result.success) {
        this.trackSuccessfulOperation('sast-scan');
      } else {
        this.trackFailedOperation('sast-scan', result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async runDASTScan(targetUrl: string): Promise<Result<DASTResult>> {
    this.ensureInitialized();

    try {
      const result = await this.securityScanner!.scanUrl(targetUrl);

      if (result.success) {
        this.trackSuccessfulOperation('dast-scan');
      } else {
        this.trackFailedOperation('dast-scan', result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async triageVulnerabilities(
    vulnerabilities: Vulnerability[]
  ): Promise<Result<{ immediate: Vulnerability[]; shortTerm: Vulnerability[] }>> {
    this.ensureInitialized();

    try {
      const result = await this.securityAuditor!.triageVulnerabilities(vulnerabilities);

      if (result.success) {
        return {
          success: true,
          value: {
            immediate: result.value.immediate,
            shortTerm: result.value.shortTerm,
          },
        };
      }

      return { success: false, error: result.error };
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async runComplianceCheck(
    standardId: string
  ): Promise<Result<ComplianceReport>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.runComplianceCheck(standardId);

      if (result.success) {
        this.trackSuccessfulOperation('compliance-check');
      } else {
        this.trackFailedOperation('compliance-check', result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async getAvailableStandards(): Promise<ComplianceStandard[]> {
    this.ensureInitialized();
    return this.complianceValidator!.getAvailableStandards();
  }

  private async analyzeComplianceGaps(
    currentReport: ComplianceReport,
    targetStandard: ComplianceStandard
  ): Promise<Result<GapAnalysis>> {
    this.ensureInitialized();

    try {
      return await this.complianceValidator!.analyzeGaps(
        currentReport,
        targetStandard
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  private async handleKnowledgeGraphUpdate(event: DomainEvent): Promise<void> {
    // Code was indexed - could trigger incremental security scan
    const payload = event.payload as {
      filesIndexed: number;
    };

    // Store update for potential security review
    await this.memory.set(
      `security:code-update:${Date.now()}`,
      { filesIndexed: payload.filesIndexed, timestamp: new Date() },
      { namespace: 'security-compliance', ttl: 3600 } // 1 hour
    );
  }

  private async handleQualityGateEvaluated(event: DomainEvent): Promise<void> {
    // Quality gate evaluated - check if security checks passed
    const payload = event.payload as {
      gateId: string;
      passed: boolean;
      checks: Array<{ name: string; passed: boolean }>;
    };

    // Track security-related check results
    const securityChecks = payload.checks.filter((c) =>
      c.name.toLowerCase().includes('security')
    );

    if (securityChecks.length > 0) {
      await this.memory.set(
        `security:gate-results:${payload.gateId}`,
        { securityChecks, passed: payload.passed },
        { namespace: 'security-compliance', persist: true }
      );
    }
  }

  private async handleTestRunCompleted(_event: DomainEvent): Promise<void> {
    // Test run completed - could analyze security test coverage
    // This is a hook for tracking security-specific test metrics
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('SecurityCompliancePlugin is not initialized');
    }

    if (
      !this.coordinator ||
      !this.securityScanner ||
      !this.securityAuditor ||
      !this.complianceValidator
    ) {
      throw new Error('SecurityCompliancePlugin services are not available');
    }
  }

  private handleError<T>(error: unknown): Result<T, Error> {
    const err = error instanceof Error ? error : new Error(String(error));

    const currentHealth = this.getHealth();
    this.updateHealth({
      errors: [...currentHealth.errors.slice(-9), err.message],
      status: currentHealth.errors.length >= 5 ? 'degraded' : currentHealth.status,
    });

    return { success: false, error: err };
  }

  private trackSuccessfulOperation(operation: string): void {
    const health = this.getHealth();
    this.updateHealth({
      agents: {
        ...health.agents,
        total: health.agents.total + 1,
        idle: health.agents.idle + 1,
      },
      lastActivity: new Date(),
    });

    // Log operation for metrics
    this.memory.set(
      `security:operation:${operation}:${Date.now()}`,
      { operation, success: true, timestamp: new Date() },
      { namespace: 'security-compliance', ttl: 86400 } // 24 hours
    );
  }

  private trackFailedOperation(operation: string, error: Error): void {
    const health = this.getHealth();
    this.updateHealth({
      agents: {
        ...health.agents,
        failed: health.agents.failed + 1,
      },
      errors: [...health.errors.slice(-9), error.message],
    });

    // Log operation for metrics
    this.memory.set(
      `security:operation:${operation}:${Date.now()}`,
      { operation, success: false, error: error.message, timestamp: new Date() },
      { namespace: 'security-compliance', ttl: 86400 } // 24 hours
    );
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSecurityCompliancePlugin(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: SecurityCompliancePluginConfig
): SecurityCompliancePlugin {
  return new SecurityCompliancePlugin(eventBus, memory, agentCoordinator, config);
}
