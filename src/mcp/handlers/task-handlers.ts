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
  type RoutingLogEntry,
  type RoutingStats,
} from '../services/task-router';
import {
  getReasoningBankService,
  startTaskTrajectory,
  endTaskTrajectory,
  type TaskOutcome,
} from '../services/reasoning-bank-service';
import type { ExperienceGuidance } from '../../integrations/agentic-flow/reasoning-bank/index.js';
import type { ModelTier } from '../../integrations/agentic-flow';
import type { QEDomain } from '../../learning/qe-patterns.js';
import type { RealQEPatternSearchResult } from '../../learning/real-qe-reasoning-bank.js';
import { scoreUnjudgedTrajectories } from './trajectory-judge.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { ALL_DOMAINS, invalidPriorityMessage, isDomainName, isPriority, type Priority } from '../../shared/types/index.js';
import { validateIndexPaths, validateIndexTaskPayload } from '../../domains/code-intelligence/index-path-guard.js';
import { routeInferredTask } from './orchestrate-routes.js';
import { getTaskExecutor } from './handler-factory.js';

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

  // #734 D: reject unknown domains instead of accepting work no domain runs.
  // Parity with `aqe task submit --domain`.
  const targetDomains: unknown = params.targetDomains ?? [];
  if (!Array.isArray(targetDomains) || !targetDomains.every(isDomainName)) {
    const unknown = Array.isArray(targetDomains)
      ? targetDomains.filter((d) => !isDomainName(d)).map(String)
      : [String(targetDomains)];
    return {
      success: false,
      error: `Unknown domain: ${unknown.join(', ')}. Valid domains: ${ALL_DOMAINS.join(', ')}`,
    };
  }

  // #1108: reject a priority outside the allowed set. Parity with
  // `aqe task submit --priority`.
  if (params.priority !== undefined && !isPriority(params.priority)) {
    return { success: false, error: invalidPriorityMessage(params.priority) };
  }

  const { queen } = getFleetState();

  // #1075: reject a type that no domain plugin executes. Accepting it would
  // leave the task running forever and hold one of the Queen's slots.
  const executable = queen!.validateTaskExecutable(params.type as TaskType, targetDomains);
  if (!executable.success) {
    return { success: false, error: executable.error.message };
  }

  // #1096: reject a malformed index path list here rather than deep inside
  // indexing. Same order of checks as `aqe task submit`.
  const payloadError = validateIndexTaskPayload(params.type, params.payload);
  if (payloadError) {
    return { success: false, error: payloadError.message };
  }

  try {
    const result = await queen!.submitTask({
      type: params.type as TaskType,
      priority: params.priority || 'p1',
      targetDomains,
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
    if (!taskStatus) {
      return { success: false, error: `Task ${result.value} was accepted but its execution status is unavailable.` };
    }

    return {
      success: true,
      data: {
        taskId: result.value,
        type: params.type,
        priority: params.priority || 'p1',
        status: taskStatus.status,
        error: taskStatus.error,
        assignedDomain: taskStatus.assignedDomain,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to submit task: ${toErrorMessage(error)}`,
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

  // A priority outside the allowed set is an error, not an empty list.
  // Parity with `aqe task list --priority`.
  if (params.priority !== undefined && !isPriority(params.priority)) {
    return { success: false, error: invalidPriorityMessage(params.priority) };
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
      cancellationResultPending: execution.cancellationResultPending,
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
      error: `Failed to list tasks: ${toErrorMessage(error)}`,
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
      cancellationResultPending: execution.cancellationResultPending,
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
      error: `Failed to get task status: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// Task Cancel Handler
// ============================================================================

export async function handleTaskCancel(
  params: TaskCancelParams
): Promise<ToolResult<{ taskId: string; cancelled: boolean; cancellationResultPending: boolean }>> {
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
        cancellationResultPending: queen!.getTaskStatus(params.taskId)?.cancellationResultPending ?? false,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to cancel task: ${toErrorMessage(error)}`,
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
  /** Named levels, or a canonical p0-p3 priority (p0 stays p0). */
  priority?: 'low' | 'medium' | 'high' | 'critical' | Priority;
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

/**
 * #1022: how learned patterns informed task_orchestrate.
 * - 'vector': embedding similarity plus text matching
 * - 'lexical-only': no working embedder (absent, or failed at runtime, #1187);
 *   text matching only, no similarity
 *   scores, and experience guidance unavailable
 * - 'unavailable': the ReasoningBank could not start; no learned guidance
 */
export interface OrchestrateLearningStatus {
  patternSearch: 'vector' | 'lexical-only' | 'unavailable';
  reason?: string;
}

export interface TaskOrchestrateResult {
  taskId: string;
  /** The task type submitted to the domain. */
  type: TaskType;
  /** #1125: the type inferred from the description, when another handler type runs it. */
  inferredType?: TaskType;
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
  /** #1022: how learned patterns informed this orchestration */
  learning: OrchestrateLearningStatus;
}

/**
 * #1022: gather experience guidance and pattern hints for task_orchestrate.
 * Learned guidance is optional: a missing embedder, or a ReasoningBank that
 * cannot start, must not fail the orchestration. The returned status says
 * which kind of matching produced the hints.
 */
async function getOrchestrateLearningContext(
  task: string,
  guidanceDomain: QEDomain | undefined,
  patternDomain: QEDomain | undefined
): Promise<{
  experienceGuidance: ExperienceGuidance | null;
  patternHintMatches: RealQEPatternSearchResult[];
  learning: OrchestrateLearningStatus;
}> {
  let service: Awaited<ReturnType<typeof getReasoningBankService>>;
  try {
    service = await getReasoningBankService();
  } catch (error) {
    return {
      experienceGuidance: null,
      patternHintMatches: [],
      learning: { patternSearch: 'unavailable', reason: toErrorMessage(error) },
    };
  }

  const experienceGuidance = await service.getExperienceGuidance(task, guidanceDomain);

  // Bring HNSW A (qe_patterns) into the routing decision alongside HNSW C
  // (experienceGuidance). Without this, only past trajectories influenced
  // routing — the catalog of consolidated long-term patterns was never
  // consulted for new tasks. Fail-soft: empty array on error.
  const patternHintMatches = await service
    .searchPatternMatches(task, { limit: 5, domain: patternDomain })
    .catch(() => [] as RealQEPatternSearchResult[]);

  const status = service.getPatternSearchStatus();
  return {
    experienceGuidance,
    patternHintMatches,
    learning: { patternSearch: status.mode, ...(status.reason ? { reason: status.reason } : {}) },
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

  // #1096: filePaths feeds task payloads (sourceFiles, index paths), so a
  // non-array value is rejected up front with a clear message.
  if (params.filePaths !== undefined) {
    const filePaths = validateIndexPaths(params.filePaths, 'filePaths', 'Invalid task_orchestrate params');
    if (!filePaths.success) {
      return { success: false, error: filePaths.error.message };
    }
  }

  // #1117: an unrecognised priority used to fall through to p1 (and a
  // requested p0 was downgraded). Reject it up front, as task_submit does.
  if (params.priority !== undefined && mapPriority(params.priority) === undefined) {
    return { success: false, error: invalidOrchestratePriorityMessage(params.priority) };
  }

  const { queen, workflowOrchestrator } = getFleetState();

  try {
    // ADR-051: Route task to optimal model tier BEFORE execution
    // Fix #282: Enrich routing input with inferred domain (same as handleModelRoute)
    const inferredDomain = params.context?.project || inferDomainFromDescription(params.task);
    const inferredIsCritical = params.priority === 'critical' ||
      /\b(security|vulnerability|cve|owasp|critical|production|exploit)\b/i.test(params.task);

    const router = await getTaskRouter();
    const routingResult = await router.routeTask({
      task: params.task,
      codeContext: params.codeContext,
      filePaths: params.filePaths,
      manualTier: params.manualTier,
      isCritical: inferredIsCritical,
      agentType: `qe-${inferredDomain}`,
      domain: inferredDomain,
      metadata: {
        inferredDomain,
        hasCodeContext: !!params.codeContext,
        fileCount: params.filePaths?.length,
      },
    });

    // INTEGRATION FIX: Get ReasoningBank guidance for the task
    const { experienceGuidance, patternHintMatches, learning } = await getOrchestrateLearningContext(
      params.task,
      params.context?.project as QEDomain | undefined,
      (params.context?.project as QEDomain | undefined) ?? (inferredDomain as QEDomain | undefined)
    );

    // Parse task description to determine task type
    const taskType = inferTaskType(params.task);
    const priority = mapPriority(params.priority ?? 'medium') ?? 'p2';

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
        // HNSW A pattern hints (mirrors the submitTask payload below); the
        // workflow branch routes through executeWorkflow, so the same catalog
        // of consolidated long-term patterns should reach it.
        patternHints: patternHintMatches.length > 0
          ? patternHintMatches.map(({ pattern: p, similarity, score, matchType, canReuse }) => ({
              patternId: p.id,
              name: p.name,
              description: p.description,
              confidence: p.confidence,
              similarity,
              score,
              matchType,
              canReuse,
            }))
          : undefined,
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
          learning,
        },
      };
    }

    // No workflow - submit as a regular task.
    // #1125: an inferred type without a handler of its own runs the domain's
    // concrete handler, with a payload built only from the request, or is
    // refused with the input it needs.
    const route = await routeInferredTask(taskType, params);
    if (route.kind === 'needs-input') {
      return { success: false, error: route.error };
    }
    const submitType = route.kind === 'route' ? route.type as TaskType : taskType;
    const targetDomains = route.kind === 'route' ? [route.domain] : [];
    // #1200: a caller-owned task runs through the MCP task executor, as the
    // domain's own tool does; the Queen does not dispatch it.
    const callerExecutor = route.kind === 'route' && route.executionOwner === 'caller' ? getTaskExecutor() : null;

    // #1081: the type must have a domain handler. Otherwise the Queen can
    // only fail the task at dispatch, so reject it here with the reason.
    const executable = queen!.validateTaskExecutable(submitType, targetDomains);
    if (!executable.success) {
      return {
        success: false,
        error: `${executable.error.message}. task_orchestrate inferred '${taskType}' from the description; ` +
          'use task_submit with a supported type and its payload, or the domain\'s MCP tool.',
      };
    }

    // Issue N2: Build domain-appropriate payload.
    // Forward caller-provided filePaths/codeContext into the payload fields
    // that domain plugins expect, so generate-tests doesn't reject with
    // "missing sourceFiles" when called via task_orchestrate.
    const taskPayload: Record<string, unknown> = {
      description: params.task,
      strategy: params.strategy || 'adaptive',
      maxAgents: params.maxAgents,
      context: params.context,
    };

    if (taskType === 'generate-tests') {
      taskPayload.sourceFiles = params.filePaths || [];
      taskPayload.sourceCode = params.codeContext || '';
      taskPayload.language = taskPayload.language || 'typescript';
      taskPayload.testType = taskPayload.testType || 'unit';
    }
    if (taskType === 'index-code') {
      taskPayload.paths = params.filePaths || [];
    }
    if (route.kind === 'route') Object.assign(taskPayload, route.payload);

    const result = await queen!.submitTask({
      type: submitType,
      ...(callerExecutor ? { executionOwner: 'caller' as const } : {}),
      priority,
      targetDomains,
      payload: {
        ...taskPayload,
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
        // HNSW A pattern hints for the executing agent
        patternHints: patternHintMatches.length > 0
          ? patternHintMatches.map(({ pattern: p, similarity, score, matchType, canReuse }) => ({
              patternId: p.id,
              name: p.name,
              description: p.description,
              confidence: p.confidence,
              similarity,
              score,
              matchType,
              canReuse,
            }))
          : undefined,
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
    if (learning.patternSearch !== 'unavailable') {
      await startTaskTrajectory(taskId, params.task, {
        agent: 'queen-coordinator',
        domain: params.context?.project as QEDomain | undefined,
      });
    }

    // Issue N1: Trajectory auto-close is handled by subscribeTrajectoryEvents(),
    // which listens for TaskCompleted/TaskFailed on the event router.
    // No per-task polling needed.

    // #1200: run a caller-owned task after its trajectory started, without
    // waiting: the executor's TaskCompleted / TaskFailed settle it for task_status.
    const execution = callerExecutor ? queen!.getTaskStatus(taskId) : undefined;
    if (callerExecutor && execution) {
      void callerExecutor.execute(execution.task).catch(error => {
        console.error(`[TaskOrchestrate] Task ${taskId} failed to execute: ${toErrorMessage(error)}`);
      });
    }

    // Trajectory judge: opt-in LLM scoring of recent unscored trajectories.
    // Hook-created rows in qe_trajectories never receive feedback unless
    // something goes back and judges them. This catches up by scoring ≤5
    // rows per task_orchestrate call. Opt-in (AQE_TRAJECTORY_JUDGE=1)
    // because it makes paid LLM calls.
    if (process.env.AQE_TRAJECTORY_JUDGE === '1' && process.env.ANTHROPIC_API_KEY) {
      void scoreUnjudgedTrajectories().catch(err => {
        console.warn('[TrajectoryJudge] failed:', err instanceof Error ? err.message : err);
      });
    }

    return {
      success: true,
      data: {
        taskId,
        type: submitType,
        ...(submitType !== taskType ? { inferredType: taskType } : {}),
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
        learning,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to orchestrate task: ${toErrorMessage(error)}`,
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

    // Enrich routing input: infer domain and metadata from task description
    // when the caller doesn't provide them explicitly
    const inferredDomain = params.domain || inferDomainFromDescription(params.task);
    const inferredIsCritical = params.isCritical ??
      /\b(security|vulnerability|cve|owasp|critical|production|exploit)\b/i.test(params.task);

    const result = await router.routeTask({
      task: params.task,
      codeContext: params.codeContext,
      filePaths: params.filePaths,
      manualTier: params.manualTier,
      isCritical: inferredIsCritical,
      agentType: params.agentType || `qe-${inferredDomain}`,
      domain: inferredDomain,
      // Pass metadata to help the complexity analyzer
      metadata: {
        inferredDomain,
        hasCodeContext: !!params.codeContext,
        fileCount: params.filePaths?.length,
      },
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
      error: `Failed to route task: ${toErrorMessage(error)}`,
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
      error: `Failed to get routing metrics: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// Economic Routing Handler (Imp-18, Issue #334)
// ============================================================================

export interface RoutingEconomicsParams {
  /** Task complexity score 0-1 for tier scoring (default: 0.5) */
  taskComplexity?: number;
}

export interface RoutingEconomicsResult {
  tierEfficiency: Array<{
    tier: string;
    qualityScore: number;
    estimatedCostUsd: number;
    qualityPerDollar: number | string;
    economicScore: number;
  }>;
  currentHourlyCostUsd: number;
  currentDailyCostUsd: number;
  budgetRemaining: { hourly: number | null; daily: number | null };
  recommendation: string;
  savingsOpportunity: { usd: number; description: string } | null;
}

/**
 * Handle economic routing report query
 */
export async function handleRoutingEconomics(
  params: RoutingEconomicsParams,
): Promise<ToolResult<RoutingEconomicsResult>> {
  try {
    const { createRoutingFeedbackCollector } = await import('../../routing/routing-feedback.js');
    const { getGlobalCostTracker } = await import('../../shared/llm/cost-tracker.js');

    // Create collector, initialize to load persisted state from DB, then enable economic routing
    const collector = createRoutingFeedbackCollector(100);
    await collector.initialize();
    collector.enableEconomicRouting(
      { ...(params.taskComplexity != null ? {} : {}) },
      getGlobalCostTracker(),
    );

    const report = collector.getEconomicReport();
    if (!report) {
      return { success: false, error: 'Economic routing is not available' };
    }

    // Convert Infinity to string for JSON serialization
    const tierEfficiency = report.tierEfficiency.map(t => ({
      ...t,
      qualityPerDollar: isFinite(t.qualityPerDollar) ? t.qualityPerDollar : 'Infinity',
    }));

    return {
      success: true,
      data: {
        tierEfficiency,
        currentHourlyCostUsd: report.currentHourlyCostUsd,
        currentDailyCostUsd: report.currentDailyCostUsd,
        budgetRemaining: report.budgetRemaining,
        recommendation: report.recommendation,
        savingsOpportunity: report.savingsOpportunity,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get economic routing report: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Infer domain from task description for routing enrichment
 * Maps task descriptions to QE domains so the complexity analyzer
 * can apply domain-specific scoring (e.g., security → complex domain)
 */
function inferDomainFromDescription(description: string): string {
  const lower = description.toLowerCase();

  if (/\b(security|vulnerabilit|cve|owasp|secret|credential|injection|xss|csrf)\b/.test(lower)) {
    return 'security-compliance';
  }
  if (/\b(chaos|resilience|fault.?inject|disaster|failover)\b/.test(lower)) {
    return 'chaos-resilience';
  }
  if (/\b(defect|bug.?predict|risk.?assess|mutation)\b/.test(lower)) {
    return 'defect-intelligence';
  }
  if (/\b(coverage|uncovered|gap.?analy)\b/.test(lower)) {
    return 'coverage-analysis';
  }
  if (/\b(quality|code.?review|maintain|tech.?debt)\b/.test(lower)) {
    return 'quality-assessment';
  }
  if (/\b(contract|api.?compat|breaking.?change|pact)\b/.test(lower)) {
    return 'contract-testing';
  }
  if (/\b(index|knowledge.?graph|semantic|code.?intel)\b/.test(lower)) {
    return 'code-intelligence';
  }
  if (/\b(accessib|a11y|wcag|screen.?read)\b/.test(lower)) {
    return 'visual-accessibility';
  }
  if (/\b(requirement|bdd|acceptance|user.?stor)\b/.test(lower)) {
    return 'requirements-validation';
  }
  if (/\b(generat.*test|test.*generat|write.*test|create.*test)\b/.test(lower)) {
    return 'test-generation';
  }
  if (/\b(run.*test|execut.*test)\b/.test(lower)) {
    return 'test-execution';
  }

  return 'test-generation'; // Default
}

/**
 * Infer task type from description
 */
// #1130: chaos named as the activity of a test run. The lookaheads keep a
// path segment or file name (resilience tests/unit/…, src/fault-injection/…,
// fault-injection.ts) from counting, and "fault injector" names a component.
const CHAOS_ACTIVITY = new RegExp([
  String.raw`\b(?:chaos|resilience)\s+(?:\w+\s+)?(?:tests?|testing|experiments?)\b(?![./\w])`,
  String.raw`\bfault[\s-]?inject(?:ion|ing)\b(?![./\w])`,
  String.raw`\binject(?:s|ing)?\s+(?:\w+\s+)?faults?\b(?![./\w])`,
].join('|'));

function inferTaskType(description: string): TaskType {
  const lower = description.toLowerCase();

  // Check execution first (more specific patterns)
  if (
    /run\s+(?:\w+\s+)*tests?/.test(lower) ||
    /execute\s+(?:\w+\s+)*tests?/.test(lower) ||
    lower.includes('run tests') ||
    lower.includes('execute tests')
  ) {
    // #1130: "run chaos resilience testing" names a chaos run, not a test run.
    // Only a run whose activity is chaos counts; every other description keeps
    // the order below, where chaos wording is the last resort.
    return CHAOS_ACTIVITY.test(lower) ? 'run-chaos' : 'execute-tests';
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
 * Map a task_orchestrate priority to the canonical Priority type.
 * Accepts the named levels and the canonical p0-p3 values; returns
 * undefined for anything else so the caller can reject it (#1117).
 */
function mapPriority(priority: unknown): Priority | undefined {
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
      return isPriority(priority) ? priority : undefined;
  }
}

function invalidOrchestratePriorityMessage(value: unknown): string {
  return `${invalidPriorityMessage(value)} (or critical, high, medium, low)`;
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
      error: `Failed to record task outcome: ${toErrorMessage(error)}`,
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
      error: `Failed to get ReasoningBank stats: ${toErrorMessage(error)}`,
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
      cancellationResultPending: execution.cancellationResultPending,
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
      error: `Failed to get task status: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// Issue N1: Event-driven trajectory auto-close
// Subscribe to TaskCompleted/TaskFailed events so trajectories are closed
// by the event system, not by per-task polling loops.
// Called once during fleet init.
// ============================================================================

/** Subscription IDs for cleanup on fleet dispose */
let trajectorySubscriptionIds: string[] = [];

/**
 * Subscribe to task lifecycle events to auto-close trajectories.
 * Must be called after the CrossDomainEventRouter is initialized.
 */
export function subscribeTrajectoryEvents(router: import('../../coordination/cross-domain-router').CrossDomainEventRouter): void {
  // Unsubscribe any previous subscriptions (idempotent)
  unsubscribeTrajectoryEvents(router);

  const completedId = router.subscribeToEventType('TaskCompleted', async (event) => {
    const { taskId } = event.payload as { taskId: string };
    if (taskId && getFleetState().queen?.getTaskStatus(taskId)?.status !== 'cancelled') {
      await endTaskTrajectory(taskId, true).catch(() => {});
    }
  });

  const failedId = router.subscribeToEventType('TaskFailed', async (event) => {
    const { taskId, error: errorMsg } = event.payload as { taskId: string; error?: string };
    if (taskId && getFleetState().queen?.getTaskStatus(taskId)?.status !== 'cancelled') {
      await endTaskTrajectory(taskId, false, errorMsg).catch(() => {});
    }
  });

  trajectorySubscriptionIds = [completedId, failedId];
}

/**
 * Unsubscribe trajectory event listeners. Called during fleet dispose.
 */
export function unsubscribeTrajectoryEvents(router: import('../../coordination/cross-domain-router').CrossDomainEventRouter): void {
  for (const id of trajectorySubscriptionIds) {
    router.unsubscribe(id);
  }
  trajectorySubscriptionIds = [];
}
