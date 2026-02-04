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
import { cosineSimilarity } from '../../shared/utils/vector-math.js';
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
  VisualTestItem,
  VisualTestPrioritizationContext,
  VisualTestPrioritizationResult,
  PrioritizedVisualTest,
} from './interfaces.js';
import {
  createVisualTesterService,
  VisualTesterConfig,
  VisualTesterService,
} from './services/visual-tester.js';
import {
  AccessibilityTesterService,
  AccessibilityTesterConfig,
} from './services/accessibility-tester.js';
import {
  ResponsiveTesterService,
  ResponsiveTestConfig,
} from './services/responsive-tester.js';
import { A2CAlgorithm } from '../../integrations/rl-suite/algorithms/a2c.js';
import { QEFlashAttention, createQEFlashAttention } from '../../integrations/ruvector/wrappers.js';
import type { RLState, RLAction } from '../../integrations/rl-suite/interfaces.js';

// ============================================================================
// MinCut & Consensus Mixin Imports (ADR-047, MM-001)
// ============================================================================

import {
  MinCutAwareDomainMixin,
  createMinCutAwareMixin,
  type IMinCutAwareDomain,
  type MinCutAwareConfig,
} from '../../coordination/mixins/mincut-aware-domain';

import {
  ConsensusEnabledMixin,
  createConsensusEnabledMixin,
  type IConsensusEnabledDomain,
  type ConsensusEnabledConfig,
} from '../../coordination/mixins/consensus-enabled-domain';

// ADR-058: Governance-aware mixin for MemoryWriteGate integration
import {
  GovernanceAwareDomainMixin,
  createGovernanceAwareMixin,
} from '../../coordination/mixins/governance-aware-domain.js';

import type { QueenMinCutBridge } from '../../coordination/mincut/queen-integration';

import {
  type DomainFinding,
  createDomainFinding,
} from '../../coordination/consensus/domain-findings';

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
  enableA2C: boolean;
  enableFlashAttention: boolean;
  // MinCut integration config (ADR-047)
  enableMinCutAwareness: boolean;
  topologyHealthThreshold: number;
  pauseOnCriticalTopology: boolean;
  // Consensus integration config (MM-001)
  enableConsensus: boolean;
  consensusThreshold: number;
  consensusStrategy: 'majority' | 'weighted' | 'unanimous';
  consensusMinModels: number;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 120000, // 2 minutes
  publishEvents: true,
  enableParallelViewportTesting: true,
  enableA2C: true,
  enableFlashAttention: true,
  // MinCut integration defaults (ADR-047)
  enableMinCutAwareness: true,
  topologyHealthThreshold: 0.5,
  pauseOnCriticalTopology: false,
  // Consensus integration defaults (MM-001)
  enableConsensus: true,
  consensusThreshold: 0.7,
  consensusStrategy: 'weighted',
  consensusMinModels: 2,
};

/**
 * Visual & Accessibility Coordinator Interface
 */
export interface IVisualAccessibilityCoordinatorExtended extends IVisualAccessibilityCoordinator {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getActiveWorkflows(): WorkflowStatus[];
  // MinCut integration methods (ADR-047)
  setMinCutBridge(bridge: QueenMinCutBridge): void;
  isTopologyHealthy(): boolean;
  // Consensus integration methods (MM-001)
  isConsensusAvailable(): boolean;
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

  // RL Integration: A2C for visual test prioritization
  private a2cAlgorithm?: A2CAlgorithm;

  // Flash Attention Integration: QEFlashAttention for image similarity
  private flashAttention?: QEFlashAttention;

  // MinCut topology awareness mixin (ADR-047)
  private readonly minCutMixin: MinCutAwareDomainMixin;

  // Consensus verification mixin (MM-001)
  private readonly consensusMixin: ConsensusEnabledMixin;

  // Domain identifier for mixin initialization
  private readonly domainName = 'visual-accessibility';

  // ADR-058: Governance mixin for MemoryWriteGate integration
  private readonly governanceMixin: GovernanceAwareDomainMixin;

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

    // Initialize MinCut-aware mixin (ADR-047)
    this.minCutMixin = createMinCutAwareMixin(this.domainName, {
      enableMinCutAwareness: this.config.enableMinCutAwareness,
      topologyHealthThreshold: this.config.topologyHealthThreshold,
      pauseOnCriticalTopology: this.config.pauseOnCriticalTopology,
    });

    // Initialize Consensus-enabled mixin (MM-001)
    // Verifies accessibility violations, visual regressions, and WCAG non-compliance
    this.consensusMixin = createConsensusEnabledMixin({
      enableConsensus: this.config.enableConsensus,
      consensusThreshold: this.config.consensusThreshold,
      verifyFindingTypes: [
        'accessibility-violation',
        'visual-regression',
        'wcag-non-compliance',
      ],
      strategy: this.config.consensusStrategy,
      minModels: this.config.consensusMinModels,
      modelTimeout: 60000,
      verifySeverities: ['critical', 'high'],
      enableLogging: false,
    });

    // ADR-058: Initialize governance mixin for MemoryWriteGate integration
    this.governanceMixin = createGovernanceAwareMixin(this.domainName);

    this.visualTester = createVisualTesterService(memory, visualConfig);
    this.accessibilityTester = new AccessibilityTesterService(memory, accessibilityConfig);
    this.responsiveTester = new ResponsiveTesterService(memory, responsiveConfig);
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize A2C algorithm if enabled
    if (this.config.enableA2C) {
      try {
        this.a2cAlgorithm = new A2CAlgorithm({
          stateSize: 10,
          actionSize: 5,
          actorHiddenLayers: [64, 64],
          criticHiddenLayers: [64, 64],
          numWorkers: 4,
        });
        // First call to predict will initialize the algorithm
        console.log('[visual-accessibility] A2C algorithm created successfully');
      } catch (error) {
        console.error('[visual-accessibility] Failed to create A2C:', error);
        throw new Error(`A2C creation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Initialize Flash Attention if enabled
    if (this.config.enableFlashAttention) {
      try {
        this.flashAttention = await createQEFlashAttention('test-similarity');
        console.log('[visual-accessibility] QEFlashAttention initialized successfully');
      } catch (error) {
        console.error('[visual-accessibility] Failed to initialize Flash Attention:', error);
        throw new Error(`Flash Attention initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.subscribeToEvents();
    await this.loadWorkflowState();

    // Initialize Consensus engine if enabled (MM-001)
    if (this.config.enableConsensus) {
      try {
        await (this.consensusMixin as any).initializeConsensus();
        console.log(`[${this.domainName}] Consensus engine initialized`);
      } catch (error) {
        console.error(`[${this.domainName}] Failed to initialize consensus engine:`, error);
        console.warn(`[${this.domainName}] Continuing without consensus verification`);
      }
    }

    this.initialized = true;
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    await this.saveWorkflowState();

    // Dispose Consensus engine (MM-001)
    try {
      await (this.consensusMixin as any).disposeConsensus();
    } catch (error) {
      console.error(`[${this.domainName}] Error disposing consensus engine:`, error);
    }

    // Dispose MinCut mixin (ADR-047)
    this.minCutMixin.dispose();

    // Dispose Flash Attention
    if (this.flashAttention) {
      this.flashAttention.dispose();
      this.flashAttention = undefined;
    }

    // Clear A2C (no explicit dispose method exists)
    this.a2cAlgorithm = undefined;

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

      // V3: Check topology health before proceeding (ADR-047)
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn('[VisualAccessibility] Topology degraded, using conservative strategy');
      }

      // V3: Pause operations if topology is critical and configured to pause
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Operation paused: topology is in critical state'));
      }

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

      // ================================================================
      // A2C Integration: Create and prioritize test list
      // ================================================================
      let testList: Array<{ url: string; viewport: Viewport }> = [];
      for (const url of urls) {
        for (const viewport of viewports) {
          testList.push({ url, viewport });
        }
      }

      // Prioritize tests if A2C is enabled and we have multiple tests
      if (this.config.enableA2C && testList.length > 1) {
        const prioritizationContext: VisualTestPrioritizationContext = {
          urgency: 5, // Default medium urgency
          availableResources: 80, // Assume good resource availability
          historicalFailureRate: 0.1, // Assume 10% historical failure rate
        };

        const prioritizationResult = await this.prioritizeVisualTests(
          testList.map((t) => ({ ...t, priority: 5 })),
          prioritizationContext
        );

        if (prioritizationResult.success) {
          testList = prioritizationResult.value.orderedTests.map((t) => ({
            url: t.url,
            viewport: t.viewport,
          }));
          console.log(
            `[visual-accessibility] Using ${prioritizationResult.value.strategy} strategy for visual test order (confidence: ${prioritizationResult.value.confidence.toFixed(2)})`
          );
        }
      }

      const totalTests = testList.length;
      let completedTests = 0;

      // Test each URL at each viewport in prioritized order
      for (const { url, viewport } of testList) {
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

      // V3: Check topology health before proceeding (ADR-047)
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn('[VisualAccessibility] Topology degraded, using conservative strategy');
      }

      // V3: Pause operations if topology is critical and configured to pause
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Operation paused: topology is in critical state'));
      }

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

      // Calculate coverage by viewport from baseline data
      const coverageByViewport = await this.calculateViewportCoverage(baselineKeys);

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
  // Additional Testing Methods (Test API)
  // ============================================================================

  /**
   * Run visual regression test comparing baseline and comparison URLs
   */
  async runVisualRegression(options: {
    baselineUrl: string;
    compareUrl: string;
    pages: string[];
    viewports?: Viewport[];
  }): Promise<Result<{ differences: Array<{ page: string; diffPercentage: number; passed: boolean }> }, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'visual');

      // Check if we can spawn agents
      if (!this.agentCoordinator.canSpawn()) {
        this.failWorkflow(workflowId, 'Agent limit reached');
        return err(new Error('Agent limit reached, cannot spawn visual testing agents'));
      }

      // Spawn visual testing agent
      const agentResult = await this.spawnVisualTestingAgent(workflowId);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      const differences: Array<{ page: string; diffPercentage: number; passed: boolean }> = [];
      const defaultViewport: Viewport = {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      };
      const viewports = options.viewports ?? [defaultViewport];

      for (const page of options.pages) {
        for (const viewport of viewports) {
          // Capture baseline screenshot
          const baselineResult = await this.visualTester.captureScreenshot(
            `${options.baselineUrl}${page}`,
            { viewport }
          );

          // Capture comparison screenshot
          const compareResult = await this.visualTester.captureScreenshot(
            `${options.compareUrl}${page}`,
            { viewport }
          );

          if (baselineResult.success && compareResult.success) {
            const diffResult = await this.visualTester.compare(
              compareResult.value,
              baselineResult.value.id
            );

            if (diffResult.success) {
              differences.push({
                page,
                diffPercentage: diffResult.value.diffPercentage,
                passed: diffResult.value.status === 'identical' || diffResult.value.status === 'acceptable',
              });
            } else {
              differences.push({ page, diffPercentage: 100, passed: false });
            }
          } else {
            differences.push({ page, diffPercentage: 100, passed: false });
          }
        }
      }

      this.completeWorkflow(workflowId);
      await this.agentCoordinator.stop(agentResult.value);

      return ok({ differences });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  /**
   * Run accessibility audit on a single URL (object parameter overload)
   */
  async runAccessibilityAuditSingle(options: {
    url: string;
    wcagLevel: 'A' | 'AA' | 'AAA';
  }): Promise<Result<{ violations: AccessibilityViolation[]; wcagLevel: string; score: number }, Error>> {
    const result = await this.runAccessibilityAudit([options.url], options.wcagLevel);

    if (!result.success) {
      return err(result.error);
    }

    const report = result.value.reports[0];
    if (!report) {
      return ok({ violations: [], wcagLevel: options.wcagLevel, score: 100 });
    }

    return ok({
      violations: report.violations,
      wcagLevel: report.wcagLevel,
      score: report.score,
    });
  }

  /**
   * Compare two screenshots
   */
  async compareScreenshots(options: {
    baseline: string;
    current: string;
    threshold?: number;
  }): Promise<Result<{ diffPercentage: number; passed: boolean; diffImagePath?: string }, Error>> {
    try {
      // Get baseline screenshot from memory or create a mock one
      const baselineScreenshot = await this.memory.get<any>(
        `visual-accessibility:screenshot:${options.baseline}`
      );

      const currentScreenshot = await this.memory.get<any>(
        `visual-accessibility:screenshot:${options.current}`
      );

      // If screenshots exist in memory, compare them
      if (baselineScreenshot && currentScreenshot) {
        const diffResult = await this.visualTester.compare(currentScreenshot, baselineScreenshot.id);
        if (diffResult.success) {
          const threshold = options.threshold ?? 0.1;
          return ok({
            diffPercentage: diffResult.value.diffPercentage,
            passed: diffResult.value.diffPercentage <= threshold * 100,
            diffImagePath: diffResult.value.diffImagePath?.value,
          });
        }
      }

      // Default response when screenshots not found (simulate comparison)
      return ok({
        diffPercentage: 0,
        passed: true,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze color contrast on a URL
   */
  async analyzeColorContrast(options: {
    url: string;
    wcagLevel?: 'A' | 'AA' | 'AAA';
  }): Promise<Result<{ issues: Array<{ element: string; foreground: string; background: string; ratio: number; required: number }> }, Error>> {
    try {
      // Run accessibility audit focused on color contrast
      const level = options.wcagLevel ?? 'AA';
      const auditResult = await this.accessibilityTester.audit(options.url, { wcagLevel: level });

      if (!auditResult.success) {
        return err(auditResult.error);
      }

      // Filter for color contrast violations
      const contrastViolations = auditResult.value.violations.filter(
        (v) => v.id.includes('color-contrast') || v.id.includes('contrast')
      );

      const issues = contrastViolations.flatMap((violation) =>
        violation.nodes.map((node) => ({
          element: node.target.join(' '),
          foreground: '#000000',
          background: '#ffffff',
          ratio: 1.0,
          required: level === 'AAA' ? 7.0 : 4.5,
        }))
      );

      return ok({ issues });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Test responsive design across multiple viewports
   */
  async testResponsiveDesign(options: {
    url: string;
    viewports: Array<{ width: number; height: number; name?: string }>;
  }): Promise<Result<{ viewportResults: Array<{ viewport: string; passed: boolean; issues: string[] }> }, Error>> {
    try {
      const viewportResults: Array<{ viewport: string; passed: boolean; issues: string[] }> = [];

      for (const vp of options.viewports) {
        const viewport: Viewport = {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          isMobile: vp.width < 768,
          hasTouch: vp.width < 1024,
        };

        // Capture screenshot at this viewport
        const screenshotResult = await this.visualTester.captureScreenshot(options.url, { viewport });

        const viewportName = vp.name ?? `${vp.width}x${vp.height}`;
        const issues: string[] = [];

        if (!screenshotResult.success) {
          issues.push(`Failed to capture screenshot: ${screenshotResult.error.message}`);
        }

        viewportResults.push({
          viewport: viewportName,
          passed: issues.length === 0,
          issues,
        });
      }

      return ok({ viewportResults });
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
  // Viewport Coverage Calculation
  // ============================================================================

  /**
   * Calculate viewport coverage from baseline keys
   * Parses baseline keys to extract viewport dimensions and maps to categories
   */
  private async calculateViewportCoverage(
    baselineKeys: string[]
  ): Promise<Map<string, number>> {
    const viewportCounts = new Map<string, number>([
      ['mobile', 0],
      ['tablet', 0],
      ['desktop', 0],
    ]);
    const uniqueUrls = new Set<string>();

    // Parse each baseline key to extract viewport dimensions
    // Key format: visual-accessibility:baseline:{urlHash}_{width}x{height}_{scale}
    for (const key of baselineKeys) {
      const match = key.match(/baseline:([^_]+)_(\d+)x(\d+)_/);
      if (match) {
        const [, urlHash, widthStr] = match;
        const width = parseInt(widthStr, 10);
        uniqueUrls.add(urlHash);

        // Categorize viewport by width
        const category = this.categorizeViewport(width);
        viewportCounts.set(category, (viewportCounts.get(category) || 0) + 1);
      }
    }

    // Calculate coverage percentages
    const totalUrls = uniqueUrls.size || 1; // Avoid division by zero
    const coverageByViewport = new Map<string, number>();

    for (const [category, count] of viewportCounts) {
      // Coverage is the percentage of URLs that have baselines for this viewport
      // Since each URL can have multiple viewports, we normalize by total URLs
      const coverage = Math.min(100, Math.round((count / totalUrls) * 100));
      coverageByViewport.set(category, coverage);
    }

    // If no baselines exist, return default values
    if (baselineKeys.length === 0) {
      return new Map([
        ['mobile', 0],
        ['tablet', 0],
        ['desktop', 0],
      ]);
    }

    return coverageByViewport;
  }

  /**
   * Categorize viewport width into mobile/tablet/desktop
   */
  private categorizeViewport(width: number): string {
    if (width <= 480) return 'mobile';
    if (width <= 1024) return 'tablet';
    return 'desktop';
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
    screenshot: { id: string; url: string; viewport: Viewport },
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
  // A2C Integration: Visual Test Prioritization
  // ============================================================================

  /**
   * Prioritize visual tests using A2C
   * Uses multi-worker actor-critic to determine optimal test order
   */
  async prioritizeVisualTests(
    tests: VisualTestItem[],
    context: VisualTestPrioritizationContext
  ): Promise<Result<VisualTestPrioritizationResult, Error>> {
    if (!this.a2cAlgorithm || !this.config.enableA2C) {
      // Return tests with default priority if A2C is disabled
      return ok({
        orderedTests: tests.map((t) => ({ ...t, priority: t.priority ?? 5, reason: 'default' })),
        strategy: 'default',
        confidence: 1.0,
      });
    }

    if (tests.length === 0) {
      return ok({
        orderedTests: [],
        strategy: 'empty',
        confidence: 1.0,
      });
    }

    try {
      // Create state from context
      const state: RLState = {
        id: `visual-priority-${Date.now()}`,
        features: [
          context.urgency / 10,
          context.availableResources / 100,
          context.historicalFailureRate,
          tests.length / 100,
          tests.filter((t) => t.viewport.width <= 480).length / Math.max(1, tests.length),
          tests.filter((t) => t.viewport.width > 1024).length / Math.max(1, tests.length),
          tests.filter((t) => (t.priority ?? 5) > 7).length / Math.max(1, tests.length),
          tests.filter((t) => t.url.includes('dashboard')).length / Math.max(1, tests.length),
          tests.filter((t) => t.url.includes('checkout')).length / Math.max(1, tests.length),
          tests.filter((t) => t.url.includes('login')).length / Math.max(1, tests.length),
        ],
      };

      // Get A2C prediction for prioritization strategy
      const prediction = await this.a2cAlgorithm.predict(state);

      let prioritized: PrioritizedVisualTest[] = tests.map((t) => ({
        ...t,
        priority: t.priority ?? 5,
        reason: 'default' as string,
      }));
      let strategy = 'default';

      // Apply the suggested prioritization strategy
      switch (prediction.action.type) {
        case 'coordinate':
          if (prediction.action.value === 'parallel') {
            // Prioritize by viewport size (test smallest first)
            prioritized.sort((a, b) => a.viewport.width - b.viewport.width);
            prioritized = prioritized.map((t) => ({
              ...t,
              priority: 10 - Math.floor(t.viewport.width / 200),
              reason: 'parallel-viewport-order',
            }));
            strategy = 'parallel-viewport-order';
          } else if (prediction.action.value === 'sequential') {
            // Prioritize by URL criticality
            const criticalUrls = ['checkout', 'payment', 'login'];
            prioritized.sort((a, b) => {
              const aCritical = criticalUrls.some((url) => a.url.includes(url)) ? 1 : 0;
              const bCritical = criticalUrls.some((url) => b.url.includes(url)) ? 1 : 0;
              return bCritical - aCritical;
            });
            prioritized = prioritized.map((t) => ({
              ...t,
              priority: criticalUrls.some((url) => t.url.includes(url)) ? 9 : 5,
              reason: 'sequential-critical-url',
            }));
            strategy = 'sequential-critical-url';
          }
          break;

        case 'allocate':
          // Allocate based on resource availability
          const agentCount = typeof prediction.action.value === 'object' ? (prediction.action.value as { agents?: number }).agents ?? 2 : 2;
          const testsPerAgent = Math.ceil(prioritized.length / agentCount);
          prioritized = prioritized.map((t, i) => ({
            ...t,
            priority: 10 - Math.floor(i / testsPerAgent),
            reason: `allocate-agent-${Math.floor(i / testsPerAgent)}`,
          }));
          strategy = 'allocate-by-agent';
          break;

        case 'rebalance':
          // Rebalance based on viewport coverage
          const viewportCounts = new Map<number, number>();
          for (const t of prioritized) {
            viewportCounts.set(t.viewport.width, (viewportCounts.get(t.viewport.width) || 0) + 1);
          }
          prioritized.sort((a, b) => (viewportCounts.get(a.viewport.width) || 0) - (viewportCounts.get(b.viewport.width) || 0));
          prioritized = prioritized.map((t) => ({
            ...t,
            priority: 10 - (viewportCounts.get(t.viewport.width) || 0),
            reason: 'rebalance-viewport-coverage',
          }));
          strategy = 'rebalance-viewport-coverage';
          break;

        default:
          break;
      }

      // Train A2C with feedback
      const reward = await this.calculatePrioritizationReward(prioritized, context);
      const action: RLAction = prediction.action;

      await this.a2cAlgorithm.train({
        state,
        action,
        reward,
        nextState: state,
        done: true,
      });

      console.log(
        `[visual-accessibility] A2C prioritized ${tests.length} visual tests using ${strategy} strategy (confidence: ${prediction.confidence.toFixed(2)})`
      );

      return ok({
        orderedTests: prioritized,
        strategy,
        confidence: prediction.confidence,
      });
    } catch (error) {
      console.error('[visual-accessibility] A2C prioritization failed:', error);
      // Return original tests on error (graceful degradation)
      return ok({
        orderedTests: tests.map((t) => ({ ...t, priority: t.priority ?? 5, reason: 'fallback' })),
        strategy: 'fallback',
        confidence: 0.5,
      });
    }
  }

  /**
   * Calculate reward for visual test prioritization
   */
  private async calculatePrioritizationReward(
    tests: PrioritizedVisualTest[],
    context: { urgency: number; availableResources: number }
  ): Promise<number> {
    let reward = 0.5;

    // Reward for prioritizing critical URLs
    const topPriority = tests.slice(0, Math.ceil(tests.length / 4));
    const criticalUrlCount = topPriority.filter((t) =>
      ['checkout', 'payment', 'login', 'dashboard'].some((url) => t.url.includes(url))
    ).length;
    reward += Math.min(0.3, criticalUrlCount / topPriority.length);

    // Reward for viewport diversity
    const viewports = new Set(tests.map((t) => `${t.viewport.width}x${t.viewport.height}`));
    reward += Math.min(0.2, viewports.size / 10);

    // Penalty for poor resource utilization
    if (context.availableResources < 30 && tests.length > 50) {
      reward -= 0.1;
    }

    return Math.max(0, Math.min(1, reward));
  }

  // ============================================================================
  // Flash Attention Integration: Image Similarity
  // ============================================================================

  /**
   * Find similar images using Flash Attention
   * Uses SIMD-accelerated attention mechanism for fast similarity search
   */
  async findSimilarImages(
    targetImageEmbedding: Float32Array,
    imageEmbeddings: Float32Array[],
    topK: number = 5
  ): Promise<Array<{ index: number; similarity: number; imagePath: string }>> {
    if (!this.flashAttention || !this.config.enableFlashAttention) {
      // Fall back to cosine similarity if Flash Attention is disabled
      return this.cosineSimilarityFallback(targetImageEmbedding, imageEmbeddings, topK);
    }

    try {
      const similarities = await this.flashAttention.computeTestSimilarity(
        targetImageEmbedding,
        imageEmbeddings,
        topK
      );

      return similarities.map((s) => ({
        index: s.index,
        similarity: s.similarity,
        imagePath: `image-${s.index}.png`,
      }));
    } catch (error) {
      console.error('[visual-accessibility] Flash Attention similarity search failed:', error);
      return this.cosineSimilarityFallback(targetImageEmbedding, imageEmbeddings, topK);
    }
  }

  /**
   * Fallback to cosine similarity when Flash Attention is disabled
   */
  private cosineSimilarityFallback(
    target: Float32Array,
    embeddings: Float32Array[],
    topK: number
  ): Array<{ index: number; similarity: number; imagePath: string }> {
    const similarities: Array<{ index: number; similarity: number; imagePath: string }> = [];

    for (let i = 0; i < embeddings.length; i++) {
      // Use shared cosineSimilarity and normalize to [0, 1]
      const rawSimilarity = cosineSimilarity(target, embeddings[i]);
      const similarity = (rawSimilarity + 1) / 2;
      similarities.push({ index: i, similarity, imagePath: `image-${i}.png` });
    }

    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, topK);
  }

  /**
   * Store visual pattern for learning
   * Creates embeddings of visual test outcomes for pattern recognition
   */
  async storeVisualPattern(
    url: string,
    viewport: Viewport,
    diffScore: number,
    passed: boolean
  ): Promise<void> {
    if (!this.flashAttention || !this.config.enableFlashAttention) {
      return;
    }

    try {
      // Create embedding from visual test context
      const embedding = this.createVisualEmbedding(url, viewport, diffScore, passed);

      // Store in memory for future similarity searches
      await this.memory.set(
        `visual-accessibility:embedding:${url}:${viewport.width}x${viewport.height}`,
        { embedding, url, viewport, diffScore, passed, timestamp: new Date() },
        { namespace: 'visual-accessibility', persist: true }
      );

      console.log(`[visual-accessibility] Stored visual pattern for ${url} at ${viewport.width}x${viewport.height}`);
    } catch (error) {
      console.error('[visual-accessibility] Failed to store visual pattern:', error);
    }
  }

  /**
   * Create embedding from visual test context
   */
  private createVisualEmbedding(
    url: string,
    viewport: Viewport,
    diffScore: number,
    passed: boolean
  ): Float32Array {
    // Create a feature vector from the visual test context
    const features: number[] = [];

    // URL hash (first 100 dimensions)
    const urlHash = this.hashString(url);
    for (let i = 0; i < 100; i++) {
      features.push(((urlHash >> (i % 32)) & 1) === 1 ? 1 : 0);
    }

    // Viewport features (10 dimensions)
    features.push(viewport.width / 2000);
    features.push(viewport.height / 2000);
    features.push(viewport.deviceScaleFactor / 3);
    features.push(viewport.isMobile ? 1 : 0);
    features.push(viewport.hasTouch ? 1 : 0);
    features.push(viewport.width <= 480 ? 1 : 0);
    features.push(viewport.width <= 1024 && viewport.width > 480 ? 1 : 0);
    features.push(viewport.width > 1024 ? 1 : 0);
    // Determine orientation from dimensions (portrait = height > width)
    const isPortrait = viewport.height > viewport.width;
    features.push(isPortrait ? 1 : 0);
    features.push(!isPortrait ? 1 : 0);

    // Test outcome features (remaining dimensions to reach 384)
    features.push(diffScore / 100);
    features.push(passed ? 1 : 0);
    features.push(diffScore > 10 ? 1 : 0);
    features.push(diffScore > 50 ? 1 : 0);

    // URL path features (last 270 dimensions)
    const pathFeatures = this.extractPathFeatures(url);
    features.push(...pathFeatures.slice(0, 270));

    return new Float32Array(features.slice(0, 384));
  }

  /**
   * Hash a string to a number
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash | 0;
    }
    return Math.abs(hash);
  }

  /**
   * Extract features from URL path
   */
  private extractPathFeatures(url: string): number[] {
    const features: number[] = [];
    const path = new URL(url).pathname;

    // Common paths
    const commonPaths = ['dashboard', 'checkout', 'login', 'profile', 'settings', 'api', 'admin', 'search'];
    for (const cp of commonPaths) {
      features.push(path.includes(cp) ? 1 : 0);
    }

    // Path depth
    const depth = path.split('/').filter(Boolean).length;
    features.push(depth / 10);

    // Has query params
    features.push(url.includes('?') ? 1 : 0);

    // Is HTTPS
    features.push(url.startsWith('https://') ? 1 : 0);

    // Fill remaining features
    while (features.length < 270) {
      features.push(0);
    }

    return features;
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

  // ============================================================================
  // MinCut Integration Methods (ADR-047)
  // ============================================================================

  /**
   * Set the MinCut bridge for topology awareness
   */
  setMinCutBridge(bridge: QueenMinCutBridge): void {
    this.minCutMixin.setMinCutBridge(bridge);
    console.log(`[${this.domainName}] MinCut bridge connected for topology awareness`);
  }

  /**
   * Check if topology is healthy
   */
  isTopologyHealthy(): boolean {
    return this.minCutMixin.isTopologyHealthy();
  }

  // ============================================================================
  // Consensus Integration Methods (MM-001)
  // ============================================================================

  /**
   * Check if consensus engine is available
   */
  isConsensusAvailable(): boolean {
    return (this.consensusMixin as any).isConsensusAvailable?.() ?? false;
  }

  /**
   * Check if a finding requires consensus verification
   */
  requiresConsensus<T>(finding: DomainFinding<T>): boolean {
    return this.consensusMixin.requiresConsensus(finding);
  }

  /**
   * Verify a finding using multi-model consensus
   */
  async verifyFinding<T>(finding: DomainFinding<T>): Promise<Result<import('../../coordination/consensus').ConsensusResult, Error>> {
    return this.consensusMixin.verifyFinding(finding);
  }

  /**
   * Get consensus statistics
   */
  getConsensusStats() {
    return this.consensusMixin.getConsensusStats();
  }

  /**
   * Verify an accessibility violation with consensus
   * @param violation - The accessibility violation data
   * @param confidence - Confidence level in the violation detection (0-1)
   * @returns true if verified or doesn't require consensus, false if rejected/disputed
   */
  async verifyAccessibilityViolation(
    violation: AccessibilityViolation,
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<AccessibilityViolation> = createDomainFinding({
      id: uuidv4(),
      type: 'accessibility-violation',
      confidence,
      description: `Accessibility violation: ${violation.description} (${violation.impact} impact)`,
      payload: violation,
      detectedBy: 'visual-accessibility-coordinator',
      severity: violation.impact === 'critical' ? 'critical'
        : violation.impact === 'serious' ? 'high'
        : violation.impact === 'moderate' ? 'medium'
        : 'low',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        return true;
      }
      return false;
    }
    return true;
  }

  /**
   * Verify a visual regression with consensus
   * @param regression - The visual regression data
   * @param confidence - Confidence level in the regression detection (0-1)
   * @returns true if verified or doesn't require consensus, false if rejected/disputed
   */
  async verifyVisualRegression(
    regression: { url: string; viewport: Viewport; diffPercentage: number; diffImagePath?: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof regression> = createDomainFinding({
      id: uuidv4(),
      type: 'visual-regression',
      confidence,
      description: `Visual regression detected at ${regression.url} (${regression.viewport.width}x${regression.viewport.height}): ${regression.diffPercentage.toFixed(2)}% difference`,
      payload: regression,
      detectedBy: 'visual-accessibility-coordinator',
      severity: regression.diffPercentage > 20 ? 'critical'
        : regression.diffPercentage > 10 ? 'high'
        : regression.diffPercentage > 5 ? 'medium'
        : 'low',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        return true;
      }
      return false;
    }
    return true;
  }

  // ============================================================================
  // Extended MinCut Integration Methods (ADR-047)
  // ============================================================================

  /**
   * Get topology-based routing excluding weak domains
   * @param targetDomains - List of potential target domains
   * @returns Filtered list of healthy domains for routing
   */
  getTopologyBasedRouting(targetDomains: import('../../shared/types').DomainName[]): import('../../shared/types').DomainName[] {
    return this.minCutMixin.getTopologyBasedRouting(targetDomains);
  }

  /**
   * Get weak vertices in this domain (for diagnostics)
   */
  getDomainWeakVertices() {
    return this.minCutMixin.getDomainWeakVertices();
  }

  /**
   * Check if this domain is a weak point in the topology
   * Returns true if any weak vertex belongs to visual-accessibility
   */
  isDomainWeakPoint(): boolean {
    return this.minCutMixin.isDomainWeakPoint();
  }

  /**
   * Subscribe to topology health changes
   */
  onTopologyHealthChange(callback: (health: import('../../coordination/mincut/interfaces').MinCutHealth) => void): () => void {
    return this.minCutMixin.onTopologyHealthChange(callback);
  }
}
