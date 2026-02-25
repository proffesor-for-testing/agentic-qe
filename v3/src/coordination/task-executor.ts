/**
 * Agentic QE v3 - Task Executor
 * Bridges Queen tasks to domain service execution
 *
 * This component actually executes domain services when tasks are assigned,
 * completing the execution pipeline with REAL implementations.
 *
 * ADR-051: Now integrates TinyDancer model routing:
 * - Reads routingTier from task payload
 * - Routes Tier 0 tasks to Agent Booster for mechanical transforms
 * - Records outcomes back to TinyDancer for learning
 *
 * Handler implementations are extracted into ./handlers/ modules.
 */

import { v4 as uuidv4 } from 'uuid';
import { DomainName, DomainEvent, Result, ok, err } from '../shared/types';
import { toError, toErrorMessage } from '../shared/error-utils.js';
import { EventBus, QEKernel, MemoryBackend } from '../kernel/interfaces';
import { TaskType, QueenTask, TaskExecution } from './queen-coordinator';
import { ResultSaver, createResultSaver, SaveOptions } from './result-saver';

// ADR-051: Agent Booster integration for Tier 0 tasks
import {
  createAgentBoosterAdapter,
  type IAgentBoosterAdapter,
  type TransformType,
  type TransformResult,
} from '../integrations/agentic-flow/agent-booster';

// ADR-051: Task Router for outcome recording
import { getTaskRouter, type TaskRouterService } from '../mcp/services/task-router';
import type { QualityFeedbackLoop, RoutingOutcomeInput } from '../feedback/feedback-loop.js';

// CQ-005: Import domain types only (no runtime dependency on domain modules)
import type { CoverageData, FileCoverage } from '../domains/coverage-analysis';
import type { FullScanResult } from '../domains/security-compliance';
import type { TestGeneratorService, GeneratedTests } from '../domains/test-generation';
import type { QualityReport } from '../domains/quality-assessment';

// CQ-005: Use DomainServiceRegistry instead of dynamic imports from domains/
import { DomainServiceRegistry, ServiceKeys } from '../shared/domain-service-registry';

// Handler registration functions (extracted from the monolithic registerHandlers)
import {
  registerTestExecutionHandlers,
  registerCoverageHandlers,
  registerSecurityHandlers,
  registerQualityHandlers,
  registerRequirementsHandlers,
  registerCodeIntelligenceHandlers,
  registerMiscHandlers,
} from './handlers/index';
import type { TaskHandlerContext, InstanceTaskHandler } from './handlers/index';

type CoverageAnalyzerService = import('../domains/coverage-analysis').CoverageAnalyzerService;
type SecurityScannerService = import('../domains/security-compliance').SecurityScannerService;
type KnowledgeGraphService = import('../domains/code-intelligence').KnowledgeGraphService;
type QualityAnalyzerService = import('../domains/quality-assessment').QualityAnalyzerService;

// ============================================================================
// CQ-005: Domain Service Resolution via Registry (no coordination -> domains imports)
// Domain modules register their factories in their index.ts files.
// Coordination resolves them from the shared registry at runtime.
// ============================================================================

function resolveCoverageAnalyzerService(memory: MemoryBackend): CoverageAnalyzerService {
  const factory = DomainServiceRegistry.resolve<(m: MemoryBackend) => CoverageAnalyzerService>(
    ServiceKeys.CoverageAnalyzerService
  );
  return factory(memory);
}

function resolveSecurityScannerService(memory: MemoryBackend): SecurityScannerService {
  const factory = DomainServiceRegistry.resolve<(m: MemoryBackend) => SecurityScannerService>(
    ServiceKeys.SecurityScannerService
  );
  return factory(memory);
}

function resolveTestGeneratorService(memory: MemoryBackend): TestGeneratorService {
  const factory = DomainServiceRegistry.resolve<(m: MemoryBackend) => TestGeneratorService>(
    ServiceKeys.createTestGeneratorService
  );
  return factory(memory);
}

function resolveKnowledgeGraphService(memory: MemoryBackend): KnowledgeGraphService {
  const factory = DomainServiceRegistry.resolve<(m: MemoryBackend) => KnowledgeGraphService>(
    ServiceKeys.KnowledgeGraphService
  );
  return factory(memory);
}

function resolveQualityAnalyzerService(memory: MemoryBackend): QualityAnalyzerService {
  const factory = DomainServiceRegistry.resolve<(m: MemoryBackend) => QualityAnalyzerService>(
    ServiceKeys.QualityAnalyzerService
  );
  return factory(memory);
}

// ============================================================================
// Types
// ============================================================================

export interface TaskExecutorConfig {
  timeout: number;
  maxRetries: number;
  enableCaching: boolean;
  /** Enable result persistence to files */
  saveResults: boolean;
  /** Base directory for result files */
  resultsDir: string;
  /** Default language for test generation */
  defaultLanguage: string;
  /** Default framework for test generation */
  defaultFramework: string;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
  domain: DomainName;
  /** Files saved by result saver */
  savedFiles?: string[];
}

type TaskHandler = (task: QueenTask, kernel: QEKernel) => Promise<Result<unknown, Error>>;

// ============================================================================
// ADR-051: Model Routing Support
// ============================================================================

/**
 * Model tier to model ID mapping
 * Per ADR-026: 3-tier model routing
 */
function getModelForTier(tier: number): string {
  switch (tier) {
    case 0: return 'agent-booster'; // Special case - WASM transforms
    case 1: return 'claude-3-5-haiku-20241022';
    case 2: return 'claude-sonnet-4-20250514';
    case 3: return 'claude-sonnet-4-20250514'; // Extended thinking
    case 4: return 'claude-opus-4-5-20251101';
    default: return 'claude-sonnet-4-20250514';
  }
}

/**
 * Map task type and code context to transform type for Agent Booster
 * Returns null if no applicable transform is detected
 */
function detectTransformType(task: QueenTask): TransformType | null {
  // Agent Booster transforms only apply to code transformation tasks,
  // NOT to test generation, coverage, security, or other domain tasks
  const nonTransformTasks = [
    'generate-tests', 'analyze-coverage', 'scan-security', 'execute-tests',
    'assess-quality', 'validate-contracts', 'test-accessibility', 'chaos-test',
    'predict-defects', 'validate-requirements', 'index-code',
  ];
  if (nonTransformTasks.includes(task.type)) return null;

  const codeContext = (task.payload as Record<string, unknown>)?.codeContext as string || '';
  const sourceCode = (task.payload as Record<string, unknown>)?.sourceCode as string || '';
  const code = codeContext || sourceCode;

  if (!code) return null;

  // Detect transform opportunities based on code patterns
  if (code.includes('var ') && !code.includes('const ') && !code.includes('let ')) {
    return 'var-to-const';
  }
  if (code.includes('console.log') || code.includes('console.warn') || code.includes('console.error')) {
    return 'remove-console';
  }
  if (code.includes('.then(') && code.includes('.catch(')) {
    return 'promise-to-async';
  }
  if (code.includes('require(') && !code.includes('import ')) {
    return 'cjs-to-esm';
  }
  if (code.includes('function ') && !code.includes('=>')) {
    return 'func-to-arrow';
  }
  // add-types is harder to detect without type analysis

  return null;
}

// ============================================================================
// Task Executor
// ============================================================================

export class DomainTaskExecutor implements TaskHandlerContext {
  private readonly _config: TaskExecutorConfig;
  private readonly resultSaver: ResultSaver;

  // Instance-level service caches to prevent cross-contamination between executor instances
  private coverageAnalyzer: CoverageAnalyzerService | null = null;
  private securityScanner: SecurityScannerService | null = null;
  private testGenerator: TestGeneratorService | null = null;
  private knowledgeGraph: KnowledgeGraphService | null = null;
  private qualityAnalyzer: QualityAnalyzerService | null = null;

  // ADR-051: Lazy-initialized Agent Booster and Task Router (instance-level)
  private agentBooster: IAgentBoosterAdapter | null = null;
  private taskRouter: TaskRouterService | null = null;

  // ADR-023: Quality Feedback Loop for routing outcome recording
  private qualityFeedbackLoop: QualityFeedbackLoop | null = null;

  // Instance-level task handler registry
  private readonly taskHandlers: Map<TaskType, InstanceTaskHandler> = new Map();

  constructor(
    private readonly kernel: QEKernel,
    private readonly eventBus: EventBus,
    config?: Partial<TaskExecutorConfig>
  ) {
    this._config = {
      timeout: config?.timeout ?? 300000,
      maxRetries: config?.maxRetries ?? 3,
      enableCaching: config?.enableCaching ?? true,
      saveResults: config?.saveResults ?? true,
      resultsDir: config?.resultsDir ?? '.agentic-qe',
      defaultLanguage: config?.defaultLanguage ?? 'typescript',
      defaultFramework: config?.defaultFramework ?? 'vitest',
    };
    this.resultSaver = createResultSaver(this._config.resultsDir);
    this.registerHandlers();
  }

  // ============================================================================
  // TaskHandlerContext implementation (used by handler modules)
  // ============================================================================

  /** Expose config to handler modules */
  get config(): { defaultLanguage: string; defaultFramework: string } {
    return this._config;
  }

  /** Register a handler for a given task type */
  registerHandler(type: TaskType, handler: InstanceTaskHandler): void {
    this.taskHandlers.set(type, handler);
  }

  /** Connect QualityFeedbackLoop for routing outcome recording */
  setQualityFeedbackLoop(loop: QualityFeedbackLoop | null): void {
    this.qualityFeedbackLoop = loop;
  }

  // ============================================================================
  // Instance-level service getters (lazy initialization)
  // ============================================================================

  getCoverageAnalyzer(): CoverageAnalyzerService {
    if (!this.coverageAnalyzer) {
      this.coverageAnalyzer = resolveCoverageAnalyzerService(this.kernel.memory);
    }
    return this.coverageAnalyzer;
  }

  getSecurityScanner(): SecurityScannerService {
    if (!this.securityScanner) {
      this.securityScanner = resolveSecurityScannerService(this.kernel.memory);
    }
    return this.securityScanner;
  }

  getTestGenerator(): TestGeneratorService {
    if (!this.testGenerator) {
      this.testGenerator = resolveTestGeneratorService(this.kernel.memory);
    }
    return this.testGenerator;
  }

  getKnowledgeGraph(): KnowledgeGraphService {
    if (!this.knowledgeGraph) {
      this.knowledgeGraph = resolveKnowledgeGraphService(this.kernel.memory);
    }
    return this.knowledgeGraph;
  }

  getQualityAnalyzer(): QualityAnalyzerService {
    if (!this.qualityAnalyzer) {
      this.qualityAnalyzer = resolveQualityAnalyzerService(this.kernel.memory);
    }
    return this.qualityAnalyzer;
  }

  // ============================================================================
  // Handler Registration (delegates to extracted handler modules)
  // ============================================================================

  private registerHandlers(): void {
    registerTestExecutionHandlers(this);
    registerCoverageHandlers(this);
    registerSecurityHandlers(this);
    registerQualityHandlers(this);
    registerRequirementsHandlers(this);
    registerCodeIntelligenceHandlers(this);
    registerMiscHandlers(this);
  }

  // ============================================================================
  // ADR-051: Agent Booster Execution (Tier 0)
  // ============================================================================

  /**
   * Get or create Agent Booster adapter (instance-level)
   */
  private async getAgentBooster(): Promise<IAgentBoosterAdapter> {
    if (!this.agentBooster) {
      this.agentBooster = await createAgentBoosterAdapter({
        enabled: true,
        fallbackToLLM: true,
        confidenceThreshold: 0.7,
      });
    }
    return this.agentBooster;
  }

  /**
   * Get or create Task Router for outcome recording (instance-level)
   */
  private async getTaskRouterInstance(): Promise<TaskRouterService | null> {
    if (!this.taskRouter) {
      try {
        this.taskRouter = await getTaskRouter();
      } catch {
        // Task router not available - outcome recording will be skipped
        return null;
      }
    }
    return this.taskRouter;
  }

  /**
   * Execute task using Agent Booster for mechanical transforms
   * Falls back to normal execution if transform not applicable or low confidence
   */
  private async executeWithAgentBooster(
    task: QueenTask,
    startTime: number,
    domain: DomainName
  ): Promise<TaskResult | null> {
    const transformType = detectTransformType(task);

    if (!transformType) {
      // No applicable transform - return null to trigger fallback
      console.debug(`[TaskExecutor] No applicable Agent Booster transform for task ${task.id}`);
      return null;
    }

    try {
      const booster = await this.getAgentBooster();
      const codeContext = (task.payload as Record<string, unknown>)?.codeContext as string ||
                          (task.payload as Record<string, unknown>)?.sourceCode as string || '';

      const result = await booster.transform(codeContext, transformType);

      if (result.success && result.confidence >= 0.7) {
        console.debug(`[TaskExecutor] Agent Booster transform succeeded: ${transformType}, confidence=${result.confidence}`);

        return {
          taskId: task.id,
          success: true,
          data: {
            transformed: true,
            transformType,
            originalCode: result.originalCode,
            transformedCode: result.transformedCode,
            confidence: result.confidence,
            implementationUsed: result.implementationUsed,
            durationMs: result.durationMs,
            changeCount: result.changeCount,
            tier: 0,
            model: 'agent-booster',
          },
          duration: Date.now() - startTime,
          domain,
        };
      }

      // Low confidence - return null to trigger fallback to Tier 1
      console.debug(`[TaskExecutor] Agent Booster low confidence (${result.confidence}), falling back to Tier 1`);
      return null;
    } catch (error) {
      console.warn(`[TaskExecutor] Agent Booster error, falling back: ${error}`);
      return null;
    }
  }

  // ============================================================================
  // ADR-051: Outcome Recording for TinyDancer Learning
  // ============================================================================

  /**
   * Record task outcome for TinyDancer learning loop
   * Uses fire-and-forget pattern to not block task completion
   */
  private async recordOutcome(
    task: QueenTask,
    tier: number,
    success: boolean,
    durationMs: number
  ): Promise<void> {
    try {
      const router = await this.getTaskRouterInstance();
      if (!router) return;

      // Log outcome for debugging and metrics
      console.debug(
        `[TaskExecutor] Outcome recorded: task=${task.id}, tier=${tier}, ` +
        `model=${getModelForTier(tier)}, success=${success}, duration=${durationMs}ms`
      );

      // ADR-023: Record routing outcome for learning feedback loop
      if (this.qualityFeedbackLoop) {
        const targetDomains = task.targetDomains || [];
        await this.qualityFeedbackLoop.recordRoutingOutcome({
          taskId: task.id,
          taskDescription: task.type,
          recommendedAgent: String(tier),
          usedAgent: String(tier),
          followedRecommendation: true,
          success,
          qualityScore: success ? 0.8 : 0.2,
          durationMs,
          timestamp: new Date(),
          error: success ? undefined : 'Task execution failed',
        });
      }
    } catch (error) {
      // Don't fail task execution if metrics recording fails
      console.warn('[TaskExecutor] Failed to record outcome:', error);
    }
  }

  /**
   * Execute a task and return results
   * ADR-051: Now reads routingTier from payload and routes appropriately
   */
  async execute(task: QueenTask): Promise<TaskResult> {
    const startTime = Date.now();
    const domain = this.getTaskDomain(task.type);

    // ADR-051: Extract routing tier from payload (default to Tier 2 - Sonnet)
    const payload = task.payload as Record<string, unknown>;
    const routingTier = (payload?.routingTier as number) ?? 2;
    const useAgentBooster = (payload?.useAgentBooster as boolean) ?? false;
    const modelId = getModelForTier(routingTier);

    console.debug(
      `[TaskExecutor] Executing task ${task.id}: type=${task.type}, ` +
      `tier=${routingTier}, model=${modelId}, useAgentBooster=${useAgentBooster}`
    );

    try {
      // ADR-051: Tier 0 - Try Agent Booster for mechanical transforms
      if (routingTier === 0 || useAgentBooster) {
        const boosterResult = await this.executeWithAgentBooster(task, startTime, domain);
        if (boosterResult) {
          // Agent Booster succeeded - record outcome and return
          this.recordOutcome(task, 0, true, Date.now() - startTime).catch(() => {});
          await this.publishTaskCompleted(task.id, boosterResult.data, domain);
          return boosterResult;
        }
        // Fall through to normal execution with Tier 1 (Haiku) as fallback
        console.debug(`[TaskExecutor] Agent Booster fallback to Tier 1 for task ${task.id}`);
      }

      const handler = this.taskHandlers.get(task.type);

      if (!handler) {
        const result = {
          taskId: task.id,
          success: false,
          error: `No handler registered for task type: ${task.type}`,
          duration: Date.now() - startTime,
          domain,
        };
        this.recordOutcome(task, routingTier, false, Date.now() - startTime).catch(() => {});
        return result;
      }

      // Execute with timeout
      const result = await Promise.race([
        handler(task),
        this.timeout(task.timeout || this._config.timeout),
      ]);

      if (!result.success) {
        const errorMsg = 'error' in result ? (result.error as Error).message : 'Unknown error';
        await this.publishTaskFailed(task.id, errorMsg, domain);
        // ADR-051: Record failed outcome
        this.recordOutcome(task, routingTier, false, Date.now() - startTime).catch(() => {});
        return {
          taskId: task.id,
          success: false,
          error: errorMsg,
          duration: Date.now() - startTime,
          domain,
        };
      }

      await this.publishTaskCompleted(task.id, result.value, domain);

      // ADR-051: Record successful outcome
      this.recordOutcome(task, routingTier, true, Date.now() - startTime).catch(() => {});

      // Save results to files if enabled
      let savedFiles: string[] | undefined;
      if (this._config.saveResults) {
        try {
          const saveOptions: SaveOptions = {
            language: payload?.language as string || this._config.defaultLanguage,
            framework: payload?.framework as string || this._config.defaultFramework,
            includeSecondary: true,
          };
          const saved = await this.resultSaver.save(task.id, task.type, result.value, saveOptions);
          savedFiles = saved.files.map(f => f.path);
        } catch (saveError) {
          // Log but don't fail the task if saving fails
          console.error(`[TaskExecutor] Failed to save results: ${saveError}`);
        }
      }

      return {
        taskId: task.id,
        success: true,
        data: {
          ...(result.value as object),
          // ADR-051: Include routing metadata in result
          _routing: {
            tier: routingTier,
            model: modelId,
            usedAgentBooster: false,
          },
        },
        duration: Date.now() - startTime,
        domain,
        savedFiles,
      };
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      await this.publishTaskFailed(task.id, errorMessage, domain);
      // ADR-051: Record failed outcome
      this.recordOutcome(task, routingTier, false, Date.now() - startTime).catch(() => {});

      return {
        taskId: task.id,
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
        domain,
      };
    }
  }

  /**
   * Reset cached services - call when disposing fleet/kernel
   * to ensure services don't hold references to disposed memory backends.
   * Instance method replaces the former module-level resetServiceCaches().
   */
  async resetServiceCaches(): Promise<void> {
    this.coverageAnalyzer = null;
    this.securityScanner = null;
    this.testGenerator = null;
    this.knowledgeGraph = null;
    this.qualityAnalyzer = null;

    // ADR-051: Also reset Agent Booster and Task Router
    if (this.agentBooster) {
      try {
        await this.agentBooster.dispose();
      } catch (error) {
        // Non-critical: disposal errors don't affect subsequent operations
        console.debug('[TaskExecutor] Agent Booster disposal error:', error instanceof Error ? error.message : error);
      }
      this.agentBooster = null;
    }
    this.taskRouter = null;
  }

  /**
   * Sync version for backwards compatibility
   */
  resetServiceCachesSync(): void {
    this.coverageAnalyzer = null;
    this.securityScanner = null;
    this.testGenerator = null;
    this.knowledgeGraph = null;
    this.qualityAnalyzer = null;
    this.agentBooster = null;
    this.taskRouter = null;
  }

  private getTaskDomain(taskType: TaskType): DomainName {
    const domainMap: Record<TaskType, DomainName> = {
      'generate-tests': 'test-generation',
      'execute-tests': 'test-execution',
      'analyze-coverage': 'coverage-analysis',
      'assess-quality': 'quality-assessment',
      'predict-defects': 'defect-intelligence',
      'validate-requirements': 'requirements-validation',
      'index-code': 'code-intelligence',
      'scan-security': 'security-compliance',
      'validate-contracts': 'contract-testing',
      'test-accessibility': 'visual-accessibility',
      'run-chaos': 'chaos-resilience',
      'optimize-learning': 'learning-optimization',
      'cross-domain-workflow': 'learning-optimization',
      'protocol-execution': 'learning-optimization',
      'ideation-assessment': 'requirements-validation',
    };
    return domainMap[taskType] || 'learning-optimization';
  }

  private async timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Task execution timed out after ${ms}ms`)), ms);
    });
  }

  private async publishTaskCompleted(taskId: string, result: unknown, domain: DomainName): Promise<void> {
    await this.eventBus.publish({
      id: uuidv4(),
      type: 'TaskCompleted',
      timestamp: new Date(),
      source: domain,
      payload: { taskId, result },
    });
  }

  private async publishTaskFailed(taskId: string, error: string, domain: DomainName): Promise<void> {
    await this.eventBus.publish({
      id: uuidv4(),
      type: 'TaskFailed',
      timestamp: new Date(),
      source: domain,
      payload: { taskId, error },
    });
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTaskExecutor(
  kernel: QEKernel,
  config?: Partial<TaskExecutorConfig>
): DomainTaskExecutor {
  return new DomainTaskExecutor(kernel, kernel.eventBus, config);
}

/**
 * Reset cached services on a specific executor instance.
 * This is the module-level wrapper for backwards compatibility with
 * callers that import resetServiceCaches() directly.
 * It requires the caller to also call resetTaskExecutor() which nullifies
 * the cached executor - so the next getTaskExecutor() creates a fresh instance
 * with clean caches. This function is now a no-op since caches are instance-level.
 *
 * @deprecated Prefer calling executor.resetServiceCaches() on the instance directly.
 */
export async function resetServiceCaches(): Promise<void> {
  // No-op: service caches are now instance-level properties.
  // When the cached executor is nullified by resetTaskExecutor(),
  // the old instance (and its caches) become eligible for GC.
  // The next executor instance starts with fresh null caches.
}

/**
 * Sync version for backwards compatibility
 * @deprecated Prefer calling executor.resetServiceCachesSync() on the instance directly.
 */
export function resetServiceCachesSync(): void {
  // No-op: service caches are now instance-level properties.
}
