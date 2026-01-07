/**
 * Agentic QE v3 - Visual & Accessibility Coordinator
 * Orchestrates the visual and accessibility testing workflows
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Result,
  ok,
  err,
  DomainEvent,
} from '../../shared/types/index.js';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
} from '../../kernel/interfaces.js';
import {
  IVisualAccessibilityCoordinator,
  Viewport,
  VisualTestReport,
  VisualTestResult,
  AccessibilityAuditReport,
  AccessibilityViolation,
  AccessibilityReport,
  RemediationPlan,
  ViolationRemediation,
  VisualTestingStatus,
  VisualDiff,
  TopAccessibilityIssue,
} from './interfaces.js';
import {
  VisualTesterService,
  VisualTesterConfig,
} from './services/visual-tester.js';
import {
  AccessibilityTesterService,
  AccessibilityTesterConfig,
} from './services/accessibility-tester.js';
import {
  ResponsiveTesterService,
  ResponsiveTestConfig,
} from './services/responsive-tester.js';

/**
 * Workflow status tracking
 */
export interface WorkflowStatus {
  id: string;
  type: 'visual' | 'accessibility' | 'responsive' | 'combined';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  agentIds: string[];
  progress: number;
  error?: string;
}

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
  maxConcurrentWorkflows: number;
  defaultTimeout: number;
  publishEvents: boolean;
  enableParallelViewportTesting: boolean;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 120000, // 2 minutes
  publishEvents: true,
  enableParallelViewportTesting: true,
};

/**
 * Visual & Accessibility Coordinator Interface
 */
export interface IVisualAccessibilityCoordinatorExtended extends IVisualAccessibilityCoordinator {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getActiveWorkflows(): WorkflowStatus[];
}

/**
 * Visual & Accessibility Coordinator
 * Orchestrates visual regression, accessibility, and responsive testing workflows
 */
export class VisualAccessibilityCoordinator implements IVisualAccessibilityCoordinatorExtended {
  private readonly config: CoordinatorConfig;
  private readonly visualTester: VisualTesterService;
  private readonly accessibilityTester: AccessibilityTesterService;
  // Used for responsive design testing workflows
  public readonly responsiveTester: ResponsiveTesterService;
  private readonly workflows: Map<string, WorkflowStatus> = new Map();
  private initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {},
    visualConfig: Partial<VisualTesterConfig> = {},
    accessibilityConfig: Partial<AccessibilityTesterConfig> = {},
    responsiveConfig: Partial<ResponsiveTestConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.visualTester = new VisualTesterService(memory, visualConfig);
    this.accessibilityTester = new AccessibilityTesterService(memory, accessibilityConfig);
    this.responsiveTester = new ResponsiveTesterService(memory, responsiveConfig);
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.subscribeToEvents();
    await this.loadWorkflowState();

    this.initialized = true;
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    await this.saveWorkflowState();
    this.workflows.clear();
    this.initialized = false;
  }

  /**
   * Get active workflow statuses
   */
  getActiveWorkflows(): WorkflowStatus[] {
    return Array.from(this.workflows.values()).filter(
      (w) => w.status === 'running' || w.status === 'pending'
    );
  }

  // ============================================================================
  // IVisualAccessibilityCoordinator Implementation
  // ============================================================================

  /**
   * Run visual regression test suite
   */
  async runVisualTests(
    urls: string[],
    viewports: Viewport[]
  ): Promise<Result<VisualTestReport, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'visual');

      // Check if we can spawn agents
      if (!this.agentCoordinator.canSpawn()) {
        return err(new Error('Agent limit reached, cannot spawn visual testing agents'));
      }

      // Spawn visual testing agent
      const agentResult = await this.spawnVisualTestingAgent(workflowId);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      const results: VisualTestResult[] = [];
      let passed = 0;
      let failed = 0;
      let newBaselines = 0;

      const totalTests = urls.length * viewports.length;
      let completedTests = 0;

      // Test each URL at each viewport
      for (const url of urls) {
        for (const viewport of viewports) {
          const screenshotResult = await this.visualTester.captureScreenshot(url, { viewport });

          if (!screenshotResult.success) {
            failed++;
            results.push({
              url,
              viewport,
              status: 'failed',
              screenshot: {
                id: '',
                url,
                viewport,
                timestamp: new Date(),
                path: { value: '', extension: '', directory: '', filename: '' } as any,
                metadata: { browser: '', os: '', fullPage: false, loadTime: 0 },
              },
            });
            continue;
          }

          const screenshot = screenshotResult.value;

          // Check for existing baseline
          const baseline = await this.visualTester.getBaseline(url, viewport);

          if (!baseline) {
            // No baseline, set this as baseline
            await this.visualTester.setBaseline(screenshot);
            newBaselines++;
            results.push({
              url,
              viewport,
              status: 'new',
              screenshot,
            });
          } else {
            // Compare against baseline
            const diffResult = await this.visualTester.compare(screenshot, baseline.id);

            if (diffResult.success) {
              const diff = diffResult.value;
              const status = diff.status === 'identical' || diff.status === 'acceptable'
                ? 'passed'
                : 'failed';

              if (status === 'passed') passed++;
              else failed++;

              results.push({
                url,
                viewport,
                status,
                diff,
                screenshot,
              });

              // Publish event for visual regression
              if (status === 'failed' && this.config.publishEvents) {
                await this.publishVisualRegressionEvent(url, viewport, diff);
              }
            } else {
              failed++;
              results.push({
                url,
                viewport,
                status: 'failed',
                screenshot,
              });
            }
          }

          completedTests++;
          this.updateWorkflowProgress(workflowId, (completedTests / totalTests) * 100);
        }
      }

      const startTime = this.workflows.get(workflowId)?.startedAt.getTime() ?? Date.now();
      const duration = Date.now() - startTime;

      const report: VisualTestReport = {
        totalTests: results.length,
        passed,
        failed,
        newBaselines,
        results,
        duration,
      };

      this.completeWorkflow(workflowId);
      await this.agentCoordinator.stop(agentResult.value);

      return ok(report);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  /**
   * Run accessibility audit suite
   */
  async runAccessibilityAudit(
    urls: string[],
    level: 'A' | 'AA' | 'AAA'
  ): Promise<Result<AccessibilityAuditReport, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'accessibility');

      // Spawn accessibility testing agent
      const agentResult = await this.spawnAccessibilityTestingAgent(workflowId, level);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      const reports: AccessibilityReport[] = [];
      let totalViolations = 0;
      let criticalViolations = 0;
      let passingUrls = 0;

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const auditResult = await this.accessibilityTester.audit(url, { wcagLevel: level });

        if (auditResult.success) {
          const report = auditResult.value;
          reports.push(report);

          totalViolations += report.violations.length;
          criticalViolations += report.violations.filter(
            (v) => v.impact === 'critical'
          ).length;

          if (report.violations.length === 0) {
            passingUrls++;
          }

          // Publish audit completed event
          if (this.config.publishEvents) {
            await this.publishAccessibilityAuditEvent(report);
          }
        }

        this.updateWorkflowProgress(workflowId, ((i + 1) / urls.length) * 100);
      }

      // Calculate average score
      const averageScore = reports.length > 0
        ? Math.round(reports.reduce((sum, r) => sum + r.score, 0) / reports.length)
        : 0;

      // Identify top issues
      const topIssues = this.identifyTopIssues(reports);

      const auditReport: AccessibilityAuditReport = {
        totalUrls: urls.length,
        passingUrls,
        totalViolations,
        criticalViolations,
        averageScore,
        reports,
        topIssues,
      };

      this.completeWorkflow(workflowId);
      await this.agentCoordinator.stop(agentResult.value);

      return ok(auditReport);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  /**
   * Update baselines for approved changes
   */
  async approveVisualChanges(
    diffIds: string[],
    reason: string
  ): Promise<Result<void, Error>> {
    try {
      for (const diffId of diffIds) {
        // Get the diff from memory
        const diff = await this.memory.get<VisualDiff>(
          `visual-accessibility:diff:${diffId}`
        );

        if (!diff) {
          continue;
        }

        // Get the comparison screenshot and set it as new baseline
        const screenshot = await this.memory.get<any>(
          `visual-accessibility:screenshot:${diff.comparisonId}`
        );

        if (screenshot) {
          await this.visualTester.setBaseline(screenshot);

          // Publish baseline updated event
          if (this.config.publishEvents) {
            await this.publishBaselineUpdatedEvent(screenshot, reason);
          }
        }
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate remediation plan for violations
   */
  async generateRemediationPlan(
    violations: AccessibilityViolation[]
  ): Promise<Result<RemediationPlan, Error>> {
    try {
      const remediations: ViolationRemediation[] = [];

      for (const violation of violations) {
        const remediation = this.createRemediation(violation);
        remediations.push(remediation);
      }

      // Sort by effort (trivial first)
      const effortOrder = { trivial: 0, minor: 1, moderate: 2, major: 3 };
      remediations.sort((a, b) => effortOrder[a.effort] - effortOrder[b.effort]);

      // Calculate total effort
      const totalEffort = this.calculateTotalEffort(remediations);

      const plan: RemediationPlan = {
        violations: remediations,
        totalEffort,
        prioritizedOrder: remediations.map((r) => r.violationId),
      };

      return ok(plan);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get visual testing status
   */
  async getVisualTestingStatus(): Promise<Result<VisualTestingStatus, Error>> {
    try {
      // Get baseline count
      const baselineKeys = await this.memory.search(
        'visual-accessibility:baseline:*',
        1000
      );
      const baselineCount = baselineKeys.length;

      // Get pending reviews (diffs with status 'changed' or 'failed')
      const diffKeys = await this.memory.search(
        'visual-accessibility:diff:*',
        1000
      );
      let pendingReviews = 0;

      for (const key of diffKeys) {
        const diff = await this.memory.get<VisualDiff>(key);
        if (diff && (diff.status === 'changed' || diff.status === 'failed')) {
          pendingReviews++;
        }
      }

      // Get last test run from workflow history
      const workflows = Array.from(this.workflows.values())
        .filter((w) => w.type === 'visual' && w.status === 'completed')
        .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));

      const lastTestRun = workflows[0]?.completedAt ?? new Date();

      // Calculate failure rate
      const totalWorkflows = Array.from(this.workflows.values()).filter(
        (w) => w.type === 'visual'
      ).length;
      const failedWorkflows = Array.from(this.workflows.values()).filter(
        (w) => w.type === 'visual' && w.status === 'failed'
      ).length;
      const failureRate = totalWorkflows > 0 ? failedWorkflows / totalWorkflows : 0;

      // Coverage by viewport (stub)
      const coverageByViewport = new Map<string, number>([
        ['mobile', 85],
        ['tablet', 90],
        ['desktop', 95],
      ]);

      const status: VisualTestingStatus = {
        baselineCount,
        pendingReviews,
        lastTestRun,
        failureRate,
        coverageByViewport,
      };

      return ok(status);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Agent Spawning Methods
  // ============================================================================

  private async spawnVisualTestingAgent(
    workflowId: string
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `visual-tester-${workflowId.slice(0, 8)}`,
      domain: 'visual-accessibility',
      type: 'tester',
      capabilities: ['visual-testing', 'screenshot-capture', 'image-diff'],
      config: { workflowId },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnAccessibilityTestingAgent(
    workflowId: string,
    wcagLevel: string
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `a11y-tester-${workflowId.slice(0, 8)}`,
      domain: 'visual-accessibility',
      type: 'analyzer',
      capabilities: ['accessibility-audit', 'wcag-validation', wcagLevel],
      config: { workflowId, wcagLevel },
    };

    return this.agentCoordinator.spawn(config);
  }

  // ============================================================================
  // Event Publishing Methods
  // ============================================================================

  private async publishVisualRegressionEvent(
    url: string,
    viewport: Viewport,
    diff: VisualDiff
  ): Promise<void> {
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'visual-accessibility.VisualRegressionDetected',
      timestamp: new Date(),
      source: 'visual-accessibility',
      payload: {
        url,
        viewport,
        diffPercentage: diff.diffPercentage,
        diffImagePath: diff.diffImagePath?.value,
      },
    };

    await this.eventBus.publish(event);
  }

  private async publishAccessibilityAuditEvent(
    report: AccessibilityReport
  ): Promise<void> {
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'visual-accessibility.AccessibilityAuditCompleted',
      timestamp: new Date(),
      source: 'visual-accessibility',
      payload: {
        url: report.url,
        violations: report.violations.length,
        score: report.score,
        wcagLevel: report.wcagLevel,
      },
    };

    await this.eventBus.publish(event);
  }

  private async publishBaselineUpdatedEvent(
    screenshot: any,
    reason: string
  ): Promise<void> {
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'visual-accessibility.BaselineUpdated',
      timestamp: new Date(),
      source: 'visual-accessibility',
      payload: {
        screenshotId: screenshot.id,
        url: screenshot.url,
        viewport: screenshot.viewport,
        reason,
      },
    };

    await this.eventBus.publish(event);
  }

  // ============================================================================
  // Workflow Management
  // ============================================================================

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

  private updateWorkflowProgress(id: string, progress: number): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.progress = Math.min(100, Math.max(0, progress));
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private identifyTopIssues(reports: AccessibilityReport[]): TopAccessibilityIssue[] {
    // Use mutable tracking structure, then convert to readonly results
    const issueTracker = new Map<string, {
      ruleId: string;
      description: string;
      occurrences: number;
      impact: AccessibilityViolation['impact'];
      affectedUrls: string[];
    }>();

    for (const report of reports) {
      for (const violation of report.violations) {
        const existing = issueTracker.get(violation.id);
        if (existing) {
          existing.occurrences++;
          if (!existing.affectedUrls.includes(report.url)) {
            existing.affectedUrls.push(report.url);
          }
        } else {
          issueTracker.set(violation.id, {
            ruleId: violation.id,
            description: violation.description,
            occurrences: 1,
            impact: violation.impact,
            affectedUrls: [report.url],
          });
        }
      }
    }

    return Array.from(issueTracker.values())
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 10);
  }

  private createRemediation(violation: AccessibilityViolation): ViolationRemediation {
    const effort = this.estimateEffort(violation);

    return {
      violationId: violation.id,
      description: violation.description,
      fix: violation.help,
      codeExample: this.generateCodeExample(violation),
      effort,
      wcagReference: violation.wcagCriteria[0]?.id ?? '',
    };
  }

  private estimateEffort(
    violation: AccessibilityViolation
  ): ViolationRemediation['effort'] {
    // Estimate effort based on impact and node count
    const nodeCount = violation.nodes.length;

    if (violation.impact === 'minor' && nodeCount <= 3) return 'trivial';
    if (violation.impact === 'minor' || nodeCount <= 5) return 'minor';
    if (violation.impact === 'serious' && nodeCount <= 10) return 'moderate';
    return 'major';
  }

  private generateCodeExample(violation: AccessibilityViolation): string {
    // Generate a code example based on violation type
    if (violation.id.includes('alt')) {
      return '<img src="..." alt="Descriptive text for the image">';
    }
    if (violation.id.includes('label')) {
      return '<label for="input-id">Label text</label>\n<input id="input-id" type="text">';
    }
    if (violation.id.includes('button')) {
      return '<button aria-label="Descriptive action">Icon</button>';
    }
    return '<!-- See WCAG guidelines for specific implementation -->';
  }

  private calculateTotalEffort(
    remediations: ViolationRemediation[]
  ): RemediationPlan['totalEffort'] {
    const effortPoints = { trivial: 1, minor: 2, moderate: 4, major: 8 };
    const totalPoints = remediations.reduce(
      (sum, r) => sum + effortPoints[r.effort],
      0
    );

    if (totalPoints <= 5) return 'trivial';
    if (totalPoints <= 15) return 'minor';
    if (totalPoints <= 40) return 'moderate';
    return 'major';
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private subscribeToEvents(): void {
    // Subscribe to code change events to trigger visual regression tests
    this.eventBus.subscribe(
      'code-intelligence.FileChanged',
      this.handleFileChanged.bind(this)
    );

    // Subscribe to deployment events
    this.eventBus.subscribe(
      'ci-cd.DeploymentCompleted',
      this.handleDeploymentCompleted.bind(this)
    );
  }

  private async handleFileChanged(_event: DomainEvent): Promise<void> {
    // Could trigger visual regression tests for affected components
  }

  private async handleDeploymentCompleted(_event: DomainEvent): Promise<void> {
    // Could trigger full visual and accessibility audit after deployment
  }

  // ============================================================================
  // State Persistence
  // ============================================================================

  private async loadWorkflowState(): Promise<void> {
    const savedState = await this.memory.get<WorkflowStatus[]>(
      'visual-accessibility:coordinator:workflows'
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
      'visual-accessibility:coordinator:workflows',
      workflows,
      { namespace: 'visual-accessibility', persist: true }
    );
  }
}
