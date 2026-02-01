/**
 * Agentic QE v3 - Task MCP Handlers
 * Task submission, status, and management handlers
 *
 * ADR-051: Integrated with Model Router for intelligent tier selection
 * Issue #206: Workflow auto-execution for task types with associated workflows
 */

import { getFleetState, isFleetInitialized } from './core-handlers';
import {
  ToolResult,
  TaskSubmitParams,
  TaskSubmitResult,
  TaskListParams,
  TaskStatusParams,
  TaskStatusResult,
  TaskCancelParams,
} from '../types';
import { TaskType } from '../../coordination/queen-coordinator';
import {
  getTaskRouter,
  type TaskRoutingResult,
  type RoutingLogEntry,
  type RoutingStats,
} from '../services/task-router';
import {
  getReasoningBankService,
  startTaskTrajectory,
  endTaskTrajectory,
  type TaskOutcome,
} from '../services/reasoning-bank-service';
import type { ModelTier } from '../../integrations/agentic-flow';
import type { QEDomain } from '../../learning/qe-patterns.js';

// ============================================================================
// Task Type to Workflow Mapping (Issue #206)
// Maps TaskTypes to their associated workflow IDs for auto-execution
// ============================================================================

const TASK_WORKFLOW_MAP: Partial<Record<TaskType, string>> = {
  'ideation-assessment': 'qcsd-ideation-swarm',
  // Add more mappings as workflows are created:
  // 'generate-tests': 'comprehensive-testing',
  // 'test-accessibility': 'visual-accessibility-workflow',
};

// ============================================================================
// Task Submit Handler
// ============================================================================

export async function handleTaskSubmit(
  params: TaskSubmitParams
): Promise<ToolResult<TaskSubmitResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const result = await queen!.submitTask({
      type: params.type as TaskType,
      priority: params.priority || 'p1',
      targetDomains: params.targetDomains || [],
      payload: params.payload || {},
      timeout: params.timeout || 300000,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error.message,
      };
    }

    // Get task status for response
    const taskStatus = queen!.getTaskStatus(result.value);

    return {
      success: true,
      data: {
        taskId: result.value,
        type: params.type,
        priority: params.priority || 'p1',
        status: taskStatus?.status === 'running' ? 'pending' : 'queued',
        assignedDomain: taskStatus?.assignedDomain,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to submit task: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Task List Handler
// ============================================================================

export async function handleTaskList(
  params: TaskListParams
): Promise<ToolResult<TaskStatusResult[]>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const tasks = queen!.listTasks({
      status: params.status,
      priority: params.priority,
      domain: params.domain,
    });

    // Apply limit if specified (use typeof check to handle limit: 0)
    const limitedTasks = typeof params.limit === 'number' ? tasks.slice(0, params.limit) : tasks;

    const results: TaskStatusResult[] = limitedTasks.map((execution) => ({
      taskId: execution.taskId,
      type: execution.task.type,
      status: execution.status,
      priority: execution.task.priority,
      assignedDomain: execution.assignedDomain,
      assignedAgents: execution.assignedAgents,
      result: execution.result,
      error: execution.error,
      createdAt: execution.task.createdAt.toISOString(),
      startedAt: execution.startedAt?.toISOString(),
      completedAt: execution.completedAt?.toISOString(),
      duration: execution.completedAt && execution.startedAt
        ? execution.completedAt.getTime() - execution.startedAt.getTime()
        : undefined,
    }));

    return {
      success: true,
      data: results,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Task Status Handler
// ============================================================================

export async function handleTaskStatus(
  params: TaskStatusParams
): Promise<ToolResult<TaskStatusResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const execution = queen!.getTaskStatus(params.taskId);

    if (!execution) {
      return {
        success: false,
        error: `Task not found: ${params.taskId}`,
      };
    }

    const result: TaskStatusResult = {
      taskId: execution.taskId,
      type: execution.task.type,
      status: execution.status,
      priority: execution.task.priority,
      assignedDomain: execution.assignedDomain,
      assignedAgents: execution.assignedAgents,
      result: params.detailed ? execution.result : undefined,
      error: execution.error,
      createdAt: execution.task.createdAt.toISOString(),
      startedAt: execution.startedAt?.toISOString(),
      completedAt: execution.completedAt?.toISOString(),
      duration: execution.completedAt && execution.startedAt
        ? execution.completedAt.getTime() - execution.startedAt.getTime()
        : undefined,
    };

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get task status: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Task Cancel Handler
// ============================================================================

export async function handleTaskCancel(
  params: TaskCancelParams
): Promise<ToolResult<{ taskId: string; cancelled: boolean }>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const result = await queen!.cancelTask(params.taskId);

    if (!result.success) {
      return {
        success: false,
        error: result.error.message,
      };
    }

    return {
      success: true,
      data: {
        taskId: params.taskId,
        cancelled: true,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to cancel task: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Task Orchestrate Handler (High-level)
// ADR-051: Now integrated with Model Router for intelligent tier selection
// ============================================================================

export interface TaskOrchestrateParams {
  task: string;
  strategy?: 'parallel' | 'sequential' | 'adaptive';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  maxAgents?: number;
  /** Manual tier override (0-4) */
  manualTier?: ModelTier;
  /** Code context for complexity analysis */
  codeContext?: string;
  /** File paths involved */
  filePaths?: string[];
  context?: {
    project?: string;
    branch?: string;
    environment?: string;
    requirements?: string[];
  };
}

export interface TaskOrchestrateResult {
  taskId: string;
  type: TaskType;
  priority: 'p0' | 'p1' | 'p2' | 'p3';
  strategy: string;
  status: string;
  message: string;
  /** ADR-051: Model routing decision */
  routing: {
    tier: ModelTier;
    tierName: string;
    modelId: string;
    executionStrategy: string;
    complexity: number;
    confidence: number;
    useAgentBooster: boolean;
    rationale: string;
    decisionTimeMs: number;
  };
}

export async function handleTaskOrchestrate(
  params: TaskOrchestrateParams
): Promise<ToolResult<TaskOrchestrateResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen, workflowOrchestrator } = getFleetState();

  try {
    // ADR-051: Route task to optimal model tier BEFORE execution
    const router = await getTaskRouter();
    const routingResult = await router.routeTask({
      task: params.task,
      codeContext: params.codeContext,
      filePaths: params.filePaths,
      manualTier: params.manualTier,
      isCritical: params.priority === 'critical',
      domain: params.context?.project,
    });

    // INTEGRATION FIX: Get ReasoningBank guidance for the task
    const reasoningBankService = await getReasoningBankService();
    const experienceGuidance = await reasoningBankService.getExperienceGuidance(
      params.task,
      params.context?.project as QEDomain | undefined
    );

    // Parse task description to determine task type
    const taskType = inferTaskType(params.task);
    const priority = mapPriority(params.priority || 'medium');

    // Issue #206: Check if this task type has an associated workflow
    const workflowId = TASK_WORKFLOW_MAP[taskType];

    if (workflowId && workflowOrchestrator) {
      // Execute the associated workflow directly
      console.log(`[TaskOrchestrate] Task type '${taskType}' has workflow '${workflowId}' - executing workflow`);

      // Detect URL in task description for live website analysis
      const urlMatch = params.task.match(/https?:\/\/[^\s]+/i);
      const detectedUrl = urlMatch ? urlMatch[0] : undefined;

      if (detectedUrl) {
        console.log(`[TaskOrchestrate] Detected URL for analysis: ${detectedUrl}`);
      }

      // Build workflow input from task params and context
      const workflowInput: Record<string, unknown> = {
        // Pass through context fields as workflow input
        targetId: params.context?.project || detectedUrl || `task-${Date.now()}`,
        targetType: detectedUrl ? 'website' : 'epic',
        description: params.task,
        acceptanceCriteria: params.context?.requirements || [],
        // Pass URL if detected (enables website content extraction)
        url: detectedUrl,
        // Include routing info for downstream processing
        routing: {
          tier: routingResult.decision.tier,
          modelId: routingResult.modelId,
          executionStrategy: routingResult.executionStrategy,
          complexity: routingResult.decision.complexityAnalysis.overall,
        },
      };

      const workflowResult = await workflowOrchestrator.executeWorkflow(workflowId, workflowInput);

      if (!workflowResult.success) {
        return {
          success: false,
          error: `Workflow execution failed: ${workflowResult.error.message}`,
        };
      }

      return {
        success: true,
        data: {
          taskId: workflowResult.value, // This is the workflow execution ID
          type: taskType,
          priority,
          strategy: params.strategy || 'adaptive',
          status: 'workflow-started',
          message: `Workflow '${workflowId}' started for task: ${params.task}`,
          routing: {
            tier: routingResult.decision.tier,
            tierName: routingResult.tierInfo.name,
            modelId: routingResult.modelId,
            executionStrategy: routingResult.executionStrategy,
            complexity: routingResult.decision.complexityAnalysis.overall,
            confidence: routingResult.decision.confidence,
            useAgentBooster: routingResult.useAgentBooster,
            rationale: routingResult.decision.rationale,
            decisionTimeMs: routingResult.decision.metadata.decisionTimeMs,
          },
        },
      };
    }

    // No workflow - submit as a regular task
    const result = await queen!.submitTask({
      type: taskType,
      priority,
      targetDomains: [],
      payload: {
        description: params.task,
        strategy: params.strategy || 'adaptive',
        maxAgents: params.maxAgents,
        context: params.context,
        // ADR-051: Include routing decision in payload for downstream processing
        routing: {
          tier: routingResult.decision.tier,
          modelId: routingResult.modelId,
          executionStrategy: routingResult.executionStrategy,
          useAgentBooster: routingResult.useAgentBooster,
          agentBoosterTransform: routingResult.decision.agentBoosterTransform,
          complexity: routingResult.decision.complexityAnalysis.overall,
          confidence: routingResult.decision.confidence,
        },
        // INTEGRATION FIX: Include experience guidance if available
        experienceGuidance: experienceGuidance ? {
          strategy: experienceGuidance.recommendedStrategy,
          actions: experienceGuidance.suggestedActions,
          confidence: experienceGuidance.confidence,
          tokenSavings: experienceGuidance.estimatedTokenSavings,
        } : undefined,
      },
      timeout: 600000, // 10 minutes for orchestrated tasks
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error.message,
      };
    }

    // INTEGRATION FIX: Start trajectory tracking for learning
    const taskId = result.value;
    await startTaskTrajectory(taskId, params.task, {
      agent: 'queen-coordinator',
      domain: params.context?.project as QEDomain | undefined,
    });

    return {
      success: true,
      data: {
        taskId,
        type: taskType,
        priority,
        strategy: params.strategy || 'adaptive',
        status: 'submitted',
        message: `Task orchestrated: ${params.task}${experienceGuidance ? ' (with experience guidance)' : ''}`,
        // ADR-051: Include routing info in response
        routing: {
          tier: routingResult.decision.tier,
          tierName: routingResult.tierInfo.name,
          modelId: routingResult.modelId,
          executionStrategy: routingResult.executionStrategy,
          complexity: routingResult.decision.complexityAnalysis.overall,
          confidence: routingResult.decision.confidence,
          useAgentBooster: routingResult.useAgentBooster,
          rationale: routingResult.decision.rationale,
          decisionTimeMs: routingResult.decision.metadata.decisionTimeMs,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to orchestrate task: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Model Route Handler (ADR-051)
// Direct access to routing decisions without task submission
// ============================================================================

export interface ModelRouteParams {
  /** Task description to analyze */
  task: string;
  /** Optional code context for complexity analysis */
  codeContext?: string;
  /** Optional file paths */
  filePaths?: string[];
  /** Manual tier override */
  manualTier?: ModelTier;
  /** Mark as critical task */
  isCritical?: boolean;
  /** Agent type making the request */
  agentType?: string;
  /** Domain context */
  domain?: string;
}

export interface ModelRouteResult {
  tier: ModelTier;
  tierName: string;
  modelId: string;
  executionStrategy: string;
  useAgentBooster: boolean;
  agentBoosterTransform?: string;
  complexity: {
    overall: number;
    code: number;
    reasoning: number;
    scope: number;
  };
  confidence: number;
  rationale: string;
  warnings: string[];
  budget: {
    allowed: boolean;
    wasDowngraded: boolean;
    estimatedCostUsd: number;
  };
  decisionTimeMs: number;
}

/**
 * Handle model routing query - returns routing decision without submitting task
 */
export async function handleModelRoute(
  params: ModelRouteParams
): Promise<ToolResult<ModelRouteResult>> {
  try {
    const router = await getTaskRouter();
    const result = await router.routeTask({
      task: params.task,
      codeContext: params.codeContext,
      filePaths: params.filePaths,
      manualTier: params.manualTier,
      isCritical: params.isCritical,
      agentType: params.agentType,
      domain: params.domain,
    });

    return {
      success: true,
      data: {
        tier: result.decision.tier,
        tierName: result.tierInfo.name,
        modelId: result.modelId,
        executionStrategy: result.executionStrategy,
        useAgentBooster: result.useAgentBooster,
        agentBoosterTransform: result.decision.agentBoosterTransform,
        complexity: {
          overall: result.decision.complexityAnalysis.overall,
          code: result.decision.complexityAnalysis.codeComplexity,
          reasoning: result.decision.complexityAnalysis.reasoningComplexity,
          scope: result.decision.complexityAnalysis.scopeComplexity,
        },
        confidence: result.decision.confidence,
        rationale: result.decision.rationale,
        warnings: result.decision.warnings,
        budget: {
          allowed: result.decision.budgetDecision.allowed,
          wasDowngraded: result.decision.budgetDecision.wasDowngraded,
          estimatedCostUsd: result.decision.budgetDecision.estimatedCostUsd,
        },
        decisionTimeMs: result.decision.metadata.decisionTimeMs,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to route task: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Routing Metrics Handler (ADR-051)
// ============================================================================

export interface RoutingMetricsParams {
  /** Include routing log entries */
  includeLog?: boolean;
  /** Max log entries to return */
  logLimit?: number;
}

export interface RoutingMetricsResult {
  stats: RoutingStats;
  log?: RoutingLogEntry[];
  modelRouterMetrics: {
    totalDecisions: number;
    avgDecisionTimeMs: number;
    agentBoosterStats: {
      eligible: number;
      used: number;
      successRate: number;
    };
    budgetStats: {
      totalSpentUsd: number;
      budgetUtilization: number;
      downgradeCount: number;
    };
  };
}

/**
 * Handle routing metrics query
 */
export async function handleRoutingMetrics(
  params: RoutingMetricsParams
): Promise<ToolResult<RoutingMetricsResult>> {
  try {
    const router = await getTaskRouter();
    const stats = router.getRoutingStats();
    const metrics = router.getMetrics();

    const result: RoutingMetricsResult = {
      stats,
      modelRouterMetrics: {
        totalDecisions: metrics.totalDecisions,
        avgDecisionTimeMs: metrics.avgDecisionTimeMs,
        agentBoosterStats: metrics.agentBoosterStats,
        budgetStats: metrics.budgetStats,
      },
    };

    if (params.includeLog) {
      result.log = router.getRoutingLog(params.logLimit || 100);
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get routing metrics: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Infer task type from description
 */
function inferTaskType(description: string): TaskType {
  const lower = description.toLowerCase();

  // Check execution first (more specific patterns)
  if (
    /run\s+(?:\w+\s+)*tests?/.test(lower) ||
    /execute\s+(?:\w+\s+)*tests?/.test(lower) ||
    lower.includes('run tests') ||
    lower.includes('execute tests')
  ) {
    return 'execute-tests';
  }
  // Then check generation
  if (lower.includes('generate test') || lower.includes('create test') || lower.includes('write test')) {
    return 'generate-tests';
  }
  if (lower.includes('coverage') || lower.includes('uncovered')) {
    return 'analyze-coverage';
  }
  if (lower.includes('quality') || lower.includes('code quality')) {
    return 'assess-quality';
  }
  if (lower.includes('defect') || lower.includes('bug') || lower.includes('predict')) {
    return 'predict-defects';
  }
  if (lower.includes('requirement') || lower.includes('bdd') || lower.includes('acceptance')) {
    return 'validate-requirements';
  }
  if (lower.includes('index') || lower.includes('knowledge graph') || lower.includes('semantic')) {
    return 'index-code';
  }
  if (lower.includes('security') || lower.includes('vulnerability') || lower.includes('owasp')) {
    return 'scan-security';
  }
  if (lower.includes('contract') || lower.includes('api contract') || lower.includes('pact')) {
    return 'validate-contracts';
  }
  if (lower.includes('accessibility') || lower.includes('a11y') || lower.includes('wcag')) {
    return 'test-accessibility';
  }
  if (lower.includes('chaos') || lower.includes('resilience') || lower.includes('fault')) {
    return 'run-chaos';
  }
  if (lower.includes('learn') || lower.includes('optimize') || lower.includes('improve')) {
    return 'optimize-learning';
  }
  // QCSD Ideation phase - quality criteria, testability, risk assessment
  if (
    lower.includes('ideation') ||
    lower.includes('quality criteria') ||
    lower.includes('htsm') ||
    lower.includes('qcsd') ||
    lower.includes('testability') ||
    lower.includes('pi planning') ||
    lower.includes('sprint planning')
  ) {
    return 'ideation-assessment';
  }

  // Default to test generation
  return 'generate-tests';
}

/**
 * Map priority string to Priority type
 */
function mapPriority(priority: string): 'p0' | 'p1' | 'p2' | 'p3' {
  switch (priority) {
    case 'critical':
      return 'p0';
    case 'high':
      return 'p1';
    case 'medium':
      return 'p2';
    case 'low':
      return 'p3';
    default:
      return 'p1';
  }
}

// ============================================================================
// ReasoningBank Integration (ADR-051)
// Record task outcomes for learning and pattern discovery
// ============================================================================

export interface TaskOutcomeRecordParams {
  /** Task ID */
  taskId: string;
  /** Task description */
  task: string;
  /** Task type */
  taskType: string;
  /** Whether the task succeeded */
  success: boolean;
  /** Execution time in ms */
  executionTimeMs: number;
  /** Agent that executed the task */
  agentId?: string;
  /** Domain */
  domain?: string;
  /** Model tier used */
  modelTier?: number;
  /** Quality score (0-1) */
  qualityScore?: number;
  /** Error message if failed */
  error?: string;
  /** Additional metrics */
  metrics?: {
    tokensUsed?: number;
    testsGenerated?: number;
    testsPassed?: number;
    coverageImprovement?: number;
  };
}

export interface TaskOutcomeRecordResult {
  recorded: boolean;
  patternStored: boolean;
  message: string;
}

/**
 * Record a task outcome for ReasoningBank learning
 * ADR-051: Enables cross-session learning from task execution
 */
export async function handleTaskOutcomeRecord(
  params: TaskOutcomeRecordParams
): Promise<ToolResult<TaskOutcomeRecordResult>> {
  try {
    const service = await getReasoningBankService();

    const outcome: TaskOutcome = {
      taskId: params.taskId,
      task: params.task,
      taskType: params.taskType,
      success: params.success,
      executionTimeMs: params.executionTimeMs,
      agentId: params.agentId,
      domain: params.domain,
      modelTier: params.modelTier,
      qualityScore: params.qualityScore,
      error: params.error,
      metrics: params.metrics,
    };

    await service.recordTaskOutcome(outcome);

    const patternStored = params.success && (params.qualityScore || 0.5) >= 0.6;

    return {
      success: true,
      data: {
        recorded: true,
        patternStored,
        message: patternStored
          ? `Outcome recorded and pattern stored for task ${params.taskId}`
          : `Outcome recorded for task ${params.taskId}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to record task outcome: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// ReasoningBank Stats Handler
// ============================================================================

export interface ReasoningBankStatsResult {
  service: {
    tasksRecorded: number;
    successfulTasks: number;
    failedTasks: number;
    successRate: number;
    patternsStored: number;
    routingRequests: number;
  };
  patterns: {
    totalPatterns: number;
    byDomain: Record<string, number>;
    byTier: Record<string, number>;
    learningOutcomes: number;
    patternSuccessRate: number;
  };
  embeddings: {
    cacheSize: number;
    dimension: number;
    transformerAvailable: boolean;
  };
  performance: {
    avgRoutingLatencyMs: number;
    p95RoutingLatencyMs: number;
  };
}

/**
 * Get ReasoningBank statistics
 * ADR-051: Provides visibility into learning system
 */
export async function handleReasoningBankStats(): Promise<ToolResult<ReasoningBankStatsResult>> {
  try {
    const service = await getReasoningBankService();
    const stats = await service.getStats();

    return {
      success: true,
      data: {
        service: stats.service,
        patterns: {
          totalPatterns: stats.reasoningBank.totalPatterns,
          byDomain: stats.reasoningBank.byDomain,
          byTier: stats.reasoningBank.byTier,
          learningOutcomes: stats.reasoningBank.learningOutcomes,
          patternSuccessRate: stats.reasoningBank.patternSuccessRate,
        },
        embeddings: {
          cacheSize: stats.reasoningBank.embeddingCacheSize,
          dimension: stats.reasoningBank.embeddingDimension,
          transformerAvailable: stats.reasoningBank.transformerAvailable,
        },
        performance: {
          avgRoutingLatencyMs: stats.reasoningBank.avgRoutingLatencyMs,
          p95RoutingLatencyMs: stats.reasoningBank.p95RoutingLatencyMs,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get ReasoningBank stats: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Task Complete Handler with Learning
// Records outcome when task status is queried and complete
// ============================================================================

// Track tasks we've already recorded to avoid duplicates
const recordedTasks = new Set<string>();

/**
 * Enhanced task status that records outcomes for learning
 * ADR-051: Automatically records completed task outcomes
 * INTEGRATION FIX: Now synchronous to ensure learning occurs
 */
export async function handleTaskStatusWithLearning(
  params: TaskStatusParams
): Promise<ToolResult<TaskStatusResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const execution = queen!.getTaskStatus(params.taskId);

    if (!execution) {
      return {
        success: false,
        error: `Task not found: ${params.taskId}`,
      };
    }

    const result: TaskStatusResult = {
      taskId: execution.taskId,
      type: execution.task.type,
      status: execution.status,
      priority: execution.task.priority,
      assignedDomain: execution.assignedDomain,
      assignedAgents: execution.assignedAgents,
      result: params.detailed ? execution.result : undefined,
      error: execution.error,
      createdAt: execution.task.createdAt.toISOString(),
      startedAt: execution.startedAt?.toISOString(),
      completedAt: execution.completedAt?.toISOString(),
      duration: execution.completedAt && execution.startedAt
        ? execution.completedAt.getTime() - execution.startedAt.getTime()
        : undefined,
    };

    // INTEGRATION FIX: Record outcome for completed tasks synchronously (only once)
    if (
      (execution.status === 'completed' || execution.status === 'failed') &&
      !recordedTasks.has(params.taskId)
    ) {
      recordedTasks.add(params.taskId);

      try {
        const service = await getReasoningBankService();
        const duration = result.duration || 0;
        const success = execution.status === 'completed';

        // Safely extract payload properties (typed as Record<string, unknown>)
        const payload = execution.task.payload || {};
        const taskDescription = typeof payload.description === 'string'
          ? payload.description
          : execution.task.type;
        const routing = payload.routing as { tier?: number } | undefined;

        // INTEGRATION FIX: End trajectory tracking first
        const trajectory = await endTaskTrajectory(
          params.taskId,
          success,
          execution.error
        );

        // Calculate quality score from trajectory if available
        const qualityScore = trajectory?.metrics.averageQuality ?? (success ? 0.7 : 0.3);

        // INTEGRATION FIX: Record outcome synchronously (await to ensure learning)
        await service.recordTaskOutcome({
          taskId: params.taskId,
          task: taskDescription,
          taskType: execution.task.type,
          success,
          executionTimeMs: duration,
          agentId: execution.assignedAgents?.[0],
          domain: execution.assignedDomain,
          modelTier: routing?.tier,
          qualityScore,
          error: execution.error,
          metrics: {
            // Extract any metrics from result if available
            testsGenerated: typeof execution.result === 'object' && execution.result
              ? (execution.result as Record<string, unknown>).testsGenerated as number | undefined
              : undefined,
            testsPassed: typeof execution.result === 'object' && execution.result
              ? (execution.result as Record<string, unknown>).testsPassed as number | undefined
              : undefined,
          },
        });

        console.error(
          `[TaskHandler] Recorded learning outcome: task=${params.taskId} ` +
          `success=${success} quality=${qualityScore.toFixed(2)} ` +
          `trajectorySteps=${trajectory?.steps.length ?? 0}`
        );
      } catch (err) {
        // Log but don't fail the response - learning is important but not blocking
        console.error('[TaskHandler] Failed to record outcome:', err);
      }
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get task status: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
