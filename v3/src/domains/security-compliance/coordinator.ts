/**
 * Agentic QE v3 - Security & Compliance Coordinator
 * Orchestrates security scanning and compliance validation workflows
 *
 * V3 Integration:
 * - DQN Algorithm: Optimizes security test prioritization
 * - QEFlashAttention: Fast vulnerability similarity matching
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

// V3 Integration: RL Suite
import { DQNAlgorithm } from '../../integrations/rl-suite/algorithms/dqn.js';
import type { RLState, RLAction, RLExperience, RLPrediction } from '../../integrations/rl-suite/interfaces.js';

// V3 Integration: @ruvector wrappers
import {
  QEFlashAttention,
  createQEFlashAttention,
  type QEAttentionResult,
} from '../../integrations/ruvector/wrappers.js';

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
  // V3: Enable DQN and Flash Attention integrations
  enableDQN: boolean;
  enableFlashAttention: boolean;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 3,
  defaultTimeout: 300000, // 5 minutes
  publishEvents: true,
  autoTriageVulnerabilities: true,
  riskThreshold: 0.7,
  enableDQN: true,
  enableFlashAttention: true,
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

  // V3: DQN and Flash Attention integrations
  private dqnAlgorithm?: DQNAlgorithm;
  private flashAttention?: QEFlashAttention;
  private rlInitialized = false;

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

    // V3: Initialize DQN and Flash Attention
    if (this.config.enableDQN || this.config.enableFlashAttention) {
      await this.initializeRLIntegrations();
    }

    this.initialized = true;
  }

  /**
   * Initialize V3 DQN and Flash Attention integrations
   */
  private async initializeRLIntegrations(): Promise<void> {
    try {
      // Initialize DQN for security test prioritization
      if (this.config.enableDQN) {
        this.dqnAlgorithm = new DQNAlgorithm({
          stateSize: 8,
          actionSize: 5,
          hiddenLayers: [128, 128],
          learningRate: 0.001,
          discountFactor: 0.95,
          explorationRate: 0.1,
        });
        await this.dqnAlgorithm.initialize();
      }

      // Initialize Flash Attention for vulnerability similarity
      if (this.config.enableFlashAttention) {
        this.flashAttention = createQEFlashAttention({
          embeddingDim: 384,
          numHeads: 8,
          maxSequenceLength: 512,
        });
      }

      this.rlInitialized = true;
    } catch (error) {
      console.error('Failed to initialize RL integrations:', error);
      throw error;
    }
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

      // V3: Use DQN to optimize test prioritization
      let prioritizedTests = options.tests || [];
      if (this.config.enableDQN && this.dqnAlgorithm && prioritizedTests.length > 0) {
        prioritizedTests = await this.prioritizeSecurityTests(options, prioritizedTests);
      }

      const optimizedOptions = { ...options, tests: prioritizedTests };

      // Run the audit
      const result = await this.securityAuditor.runAudit(optimizedOptions);

      if (result.success) {
        this.completeWorkflow(workflowId);

        // V3: Use Flash Attention to find similar vulnerabilities
        if (this.config.enableFlashAttention && this.flashAttention && result.value.vulnerabilities) {
          await this.enhanceVulnerabilityAnalysis(result.value.vulnerabilities);
        }

        // V3: Train DQN with audit feedback
        if (this.config.enableDQN && this.dqnAlgorithm) {
          await this.trainDQNWithAuditFeedback(options, result.value);
        }

        // Publish events
        if (this.config.publishEvents) {
          await this.publishSecurityAuditCompleted(result.value);
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
   * Run targeted security scan
   */
  async runSecurityScan(
    files: FilePath[],
    scanType: 'sast' | 'dast' | 'full'
  ): Promise<Result<SASTResult | DASTResult>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'scan');

      // Run scan
      const result = await this.securityScanner.scan(files, { type: scanType });

      if (result.success) {
        this.completeWorkflow(workflowId);
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  /**
   * Validate compliance
   */
  async runComplianceValidation(
    standardId: string,
    context: ComplianceContext
  ): Promise<Result<ComplianceReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'compliance');

      const result = await this.complianceValidator.validate(standardId, context);

      if (result.success) {
        this.completeWorkflow(workflowId);

        // Publish events
        if (this.config.publishEvents) {
          await this.publishComplianceValidationCompleted(result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  /**
   * Assess security posture
   */
  async assessSecurityPosture(): Promise<Result<SecurityPosture>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'posture');

      const result = await this.securityAuditor.assessPosture();

      if (result.success) {
        this.completeWorkflow(workflowId);
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  // ==========================================================================
  // V3: DQN Integration for Security Test Prioritization
  // ==========================================================================

  /**
   * Use DQN to prioritize security tests
   */
  private async prioritizeSecurityTests(
    options: SecurityAuditOptions,
    tests: string[]
  ): Promise<string[]> {
    if (!this.dqnAlgorithm || !this.rlInitialized) {
      return tests;
    }

    try {
      // Score each test based on DQN predictions
      const scored = await Promise.all(
        tests.map(async (test) => {
          const state: RLState = {
            id: `test-${test}`,
            features: this.extractSecurityTestFeatures(options, test),
          };

          const prediction = await this.dqnAlgorithm!.predict(state);
          return {
            test,
            score: prediction.value || 0,
          };
        })
      );

      // Sort by score (descending)
      scored.sort((a, b) => b.score - a.score);
      return scored.map((s) => s.test);
    } catch (error) {
      console.error('Failed to prioritize security tests:', error);
      return tests;
    }
  }

  /**
   * Train DQN with audit feedback
   */
  private async trainDQNWithAuditFeedback(
    options: SecurityAuditOptions,
    report: SecurityAuditReport
  ): Promise<void> {
    if (!this.dqnAlgorithm || !this.rlInitialized) {
      return;
    }

    try {
      const state: RLState = {
        id: `audit-${options.target}-${Date.now()}`,
        features: this.extractAuditFeatures(options),
      };

      const action: RLAction = {
        type: 'run-audit',
        value: report.vulnerabilities.length,
      };

      // Reward based on vulnerability findings
      const reward = this.calculateAuditReward(report);

      const experience: RLExperience = {
        state,
        action,
        reward,
        nextState: state,
        done: true,
      };

      await this.dqnAlgorithm.train([experience]);
      console.log(`[DQN] Trained security audit with reward: ${reward.toFixed(3)}`);
    } catch (error) {
      console.error('Failed to train DQN:', error);
    }
  }

  /**
   * Calculate reward for security audit
   */
  private calculateAuditReward(report: SecurityAuditReport): number {
    let reward = 0.5;

    // Reward finding critical vulnerabilities
    const critical = report.vulnerabilities.filter((v) => v.severity === 'critical').length;
    reward += Math.min(0.3, critical * 0.1);

    // Reward high severity findings
    const high = report.vulnerabilities.filter((v) => v.severity === 'high').length;
    reward += Math.min(0.2, high * 0.05);

    // Penalty for false positives (low confidence)
    const lowConfidence = report.vulnerabilities.filter((v) => v.confidence < 0.5).length;
    reward -= (lowConfidence / report.vulnerabilities.length) * 0.2;

    return Math.max(0, Math.min(1, reward));
  }

  /**
   * Extract features from security test for DQN state
   */
  private extractSecurityTestFeatures(options: SecurityAuditOptions, test: string): number[] {
    return [
      options.target === 'api' ? 1 : 0,
      options.target === 'web' ? 1 : 0,
      options.target === 'mobile' ? 1 : 0,
      test.includes('auth') ? 1 : 0,
      test.includes('sql') ? 1 : 0,
      test.includes('xss') ? 1 : 0,
      test.includes('injection') ? 1 : 0,
      test.length / 100, // Test complexity proxy
    ];
  }

  /**
   * Extract features from audit options for DQN state
   */
  private extractAuditFeatures(options: SecurityAuditOptions): number[] {
    return [
      options.target === 'api' ? 1 : 0,
      options.target === 'web' ? 1 : 0,
      options.depth || 1,
      (options.tests?.length || 0) / 50,
      options.includeDependencies ? 1 : 0,
      options.checkCompliance ? 1 : 0,
      options.severity === 'critical' ? 1 : 0,
      options.severity === 'high' ? 1 : 0,
    ];
  }

  // ==========================================================================
  // V3: Flash Attention Integration for Vulnerability Similarity
  // ==========================================================================

  /**
   * Enhance vulnerability analysis with Flash Attention
   */
  private async enhanceVulnerabilityAnalysis(vulnerabilities: Vulnerability[]): Promise<void> {
    if (!this.flashAttention || !this.rlInitialized || vulnerabilities.length === 0) {
      return;
    }

    try {
      // Create embeddings for each vulnerability
      const embeddings = vulnerabilities.map((v) => this.createVulnerabilityEmbedding(v));

      // Use Flash Attention to compute similarities
      const attentionResult = await this.flashAttention.computeAttention(
        embeddings,
        embeddings,
        embeddings
      );

      // Find similar vulnerabilities
      for (let i = 0; i < vulnerabilities.length; i++) {
        const similarities = attentionResult.attentionWeights[i];
        const similarIndices = similarities
          .map((score, idx) => ({ score, idx }))
          .filter((s) => s.idx !== i && s.score > 0.7)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        if (similarIndices.length > 0) {
          console.log(`[FlashAttention] Found ${similarIndices.length} similar vulnerabilities to ${vulnerabilities[i].id}`);
        }
      }
    } catch (error) {
      console.error('Failed to enhance vulnerability analysis:', error);
    }
  }

  /**
   * Create embedding for vulnerability
   */
  private createVulnerabilityEmbedding(vulnerability: Vulnerability): number[] {
    // Simple embedding based on vulnerability features
    const features: number[] = [];

    // Type encoding
    const typeHash = this.hashCode(vulnerability.type);
    features.push((typeHash % 1000) / 1000);

    // Severity encoding
    const severityMap: Record<string, number> = {
      critical: 1.0,
      high: 0.75,
      medium: 0.5,
      low: 0.25,
    };
    features.push(severityMap[vulnerability.severity] || 0.5);

    // Confidence
    features.push(vulnerability.confidence);

    // Description length
    features.push(Math.min(1, vulnerability.description.length / 500));

    // CWE/CVE encoding
    const cweHash = vulnerability.cwe ? this.hashCode(vulnerability.cwe) : 0;
    features.push((cweHash % 1000) / 1000);

    // Fill with hashed description features
    const descHash = this.hashCode(vulnerability.description.slice(0, 200));
    for (let i = features.length; i < 384; i++) {
      features.push(((descHash * (i + 1)) % 10000) / 10000);
    }

    return features.slice(0, 384);
  }

  /**
   * Simple hash function
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash | 0;
    }
    return Math.abs(hash);
  }

  // ==========================================================================
  // Agent Spawning
  // ==========================================================================

  private async spawnSecurityAuditAgent(
    workflowId: string,
    options: SecurityAuditOptions
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `security-auditor-${workflowId.slice(0, 8)}`,
      domain: 'security-compliance',
      type: 'auditor',
      capabilities: ['security-audit', 'vulnerability-scanning', 'compliance-check'],
      config: {
        workflowId,
        target: options.target,
        depth: options.depth,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  // ==========================================================================
  // Event Publishing
  // ==========================================================================

  private async publishSecurityAuditCompleted(report: SecurityAuditReport): Promise<void> {
    const payload: VulnerabilityPayload = {
      auditId: report.id,
      vulnerabilities: report.vulnerabilities.map((v) => ({
        id: v.id,
        type: v.type,
        severity: v.severity,
        confidence: v.confidence,
      })),
      riskScore: report.riskScore,
      timestamp: new Date().toISOString(),
    };

    const event = createEvent(
      SecurityComplianceEvents.SecurityAuditCompleted,
      'security-compliance',
      payload
    );

    await this.eventBus.publish(event);
  }

  private async publishComplianceValidationCompleted(report: ComplianceReport): Promise<void> {
    const payload: CompliancePayload = {
      standardId: report.standardId,
      compliant: report.compliant,
      score: report.score,
      violations: report.violations,
      timestamp: new Date().toISOString(),
    };

    const event = createEvent(
      SecurityComplianceEvents.ComplianceValidationCompleted,
      'security-compliance',
      payload
    );

    await this.eventBus.publish(event);
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
  // Event Handling
  // ==========================================================================

  private subscribeToEvents(): void {
    this.eventBus.subscribe(
      'test-execution.TestRunCompleted',
      this.handleTestRunCompleted.bind(this)
    );

    this.eventBus.subscribe(
      'code-intelligence.ImpactAnalysisCompleted',
      this.handleImpactAnalysis.bind(this)
    );
  }

  private async handleTestRunCompleted(_event: DomainEvent): Promise<void> {
    // Could trigger security scans based on test results
  }

  private async handleImpactAnalysis(_event: DomainEvent): Promise<void> {
    // Could trigger security scans for changed files
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
}
