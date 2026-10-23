/**
 * Agentic QE v3 - task_orchestrate MCP handler
 * ADR-051: Integrated with Model Router for intelligent tier selection
 * Issue #206: Workflow auto-execution for task types with associated workflows
 */

import { getFleetState, isFleetInitialized } from './core-handlers';
import type { ToolResult } from '../types';
import type { TaskType } from '../../coordination/queen-coordinator';
import { getTaskRouter } from '../services/task-router';
import { getReasoningBankService, startTaskTrajectory } from '../services/reasoning-bank-service';
import type {
  ExperienceGuidance,
  ExperienceGuidanceStatus,
} from '../../integrations/agentic-flow/reasoning-bank/index.js';
import type { ModelTier } from '../../integrations/agentic-flow';
import type { QEDomain } from '../../learning/qe-patterns.js';
import type { RealQEPatternSearchResult } from '../../learning/real-qe-reasoning-bank.js';
import { scoreUnjudgedTrajectories } from './trajectory-judge.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { invalidPriorityMessage, isPriority, type Priority } from '../../shared/types/index.js';
import { validateIndexPaths } from '../../domains/code-intelligence/index-path-guard.js';
import { routeInferredTask } from './orchestrate-routes.js';
import { getTaskExecutor } from './handler-factory.js';
import { TASK_WORKFLOW_MAP, inferDomainFromDescription, inferTaskType } from './task-inference.js';

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
 *
 * #1204: `experienceGuidance` says the same for similar-experience guidance:
 * 'unavailable' (with the reason) when its embedder failed or is absent.
 * Omitted when experience replay is disabled or the ReasoningBank is down.
 */
export interface OrchestrateLearningStatus {
  patternSearch: 'vector' | 'lexical-only' | 'unavailable';
  reason?: string;
  experienceGuidance?: ExperienceGuidanceStatus;
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

  // #1204: a background embedder retry can finish while this call runs.
  // Report vector matching only if the embedder was usable for the whole
  // call, so hints found by text alone are never labelled vector.
  const patternStatusBefore = service.getPatternSearchStatus();
  const experienceStatusBefore = service.getExperienceGuidanceStatus();

  const experienceGuidance = await service.getExperienceGuidance(task, guidanceDomain);

  // Bring HNSW A (qe_patterns) into the routing decision alongside HNSW C
  // (experienceGuidance). Without this, only past trajectories influenced
  // routing — the catalog of consolidated long-term patterns was never
  // consulted for new tasks. Fail-soft: empty array on error.
  const patternHintMatches = await service
    .searchPatternMatches(task, { limit: 5, domain: patternDomain })
    .catch(() => [] as RealQEPatternSearchResult[]);

  const status = notVectorIfEither(patternStatusBefore, service.getPatternSearchStatus());
  const experienceStatusAfter = service.getExperienceGuidanceStatus();
  const experienceStatus = experienceStatusBefore && experienceStatusAfter
    ? notVectorIfEither(experienceStatusBefore, experienceStatusAfter)
    : experienceStatusAfter;
  return {
    experienceGuidance,
    patternHintMatches,
    learning: {
      patternSearch: status.mode,
      ...(status.reason ? { reason: status.reason } : {}),
      ...(experienceStatus ? { experienceGuidance: experienceStatus } : {}),
    },
  };
}

/** #1204: the status before the call unless it was vector; otherwise the one after. */
function notVectorIfEither<T extends { mode: string }>(before: T, after: T): T {
  return before.mode === 'vector' ? after : before;
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
