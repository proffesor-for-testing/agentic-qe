/**
 * Cross-Phase Memory MCP Handlers
 *
 * Integrates cross-phase feedback loops with MCP tools.
 * These handlers enable agents to store and retrieve cross-phase signals.
 *
 * @module cross-phase-handlers
 * @version 1.0.0
 */

import {
  getCrossPhaseMemory,
  CrossPhaseMemoryService,
} from '../../memory/cross-phase-memory.js';
import {
  getCrossPhaseHookExecutor,
  CrossPhaseHookExecutor,
} from '../../hooks/cross-phase-hooks.js';
import {
  FeedbackLoopType,
  CrossPhaseSignal,
  ProductionRiskSignal,
  SFDIPOTWeightSignal,
  TestHealthSignal,
  ACQualitySignal,
  RiskWeight,
  FactorWeight,
  FlakyPattern,
  UntestablePattern,
  GateFailure,
  CoverageGap,
} from '../../types/cross-phase-signals.js';

// =============================================================================
// Service Instances
// =============================================================================

let memoryService: CrossPhaseMemoryService | null = null;
let hookExecutor: CrossPhaseHookExecutor | null = null;
let initialized = false;

async function ensureInitialized(): Promise<{
  memory: CrossPhaseMemoryService;
  hooks: CrossPhaseHookExecutor;
}> {
  if (!initialized) {
    memoryService = getCrossPhaseMemory();
    hookExecutor = getCrossPhaseHookExecutor();

    await memoryService.initialize();
    await hookExecutor.initialize();

    initialized = true;
  }

  return {
    memory: memoryService!,
    hooks: hookExecutor!,
  };
}

// =============================================================================
// Handler Types
// =============================================================================

export interface StoreSignalParams {
  loop: FeedbackLoopType;
  data: Record<string, unknown>;
}

export interface StoreSignalResult {
  success: boolean;
  signalId: string;
  loop: FeedbackLoopType;
  expiresAt: string;
}

export interface QuerySignalsParams {
  loop: FeedbackLoopType;
  maxAge?: string;
  filter?: Record<string, unknown>;
}

export interface QuerySignalsResult {
  success: boolean;
  signals: CrossPhaseSignal[];
  count: number;
}

export interface AgentCompleteParams {
  agentName: string;
  result: Record<string, unknown>;
}

export interface AgentCompleteResult {
  success: boolean;
  hooksExecuted: number;
  signalsStored: number;
}

export interface PhaseEventParams {
  phase: string;
  context?: Record<string, unknown>;
}

export interface PhaseStartResult {
  success: boolean;
  injectedSignals: Record<string, CrossPhaseSignal[]>;
  totalSignals: number;
}

export interface PhaseEndResult {
  success: boolean;
  hooksExecuted: number;
}

export interface CrossPhaseStatsResult {
  success: boolean;
  stats: {
    totalSignals: number;
    byLoop: Record<FeedbackLoopType, number>;
    byNamespace: Record<string, number>;
    oldestSignal: string | null;
    newestSignal: string | null;
  };
}

export interface FormatSignalsParams {
  signals: CrossPhaseSignal[];
}

export interface FormatSignalsResult {
  success: boolean;
  formatted: string;
}

// =============================================================================
// MCP Handlers
// =============================================================================

/**
 * Store a cross-phase signal
 */
export async function handleCrossPhaseStore(params: StoreSignalParams): Promise<StoreSignalResult> {
  const { memory } = await ensureInitialized();

  let signal: CrossPhaseSignal;

  switch (params.loop) {
    case 'strategic':
      signal = await memory.storeRiskSignal(
        (params.data.riskWeights as RiskWeight[]) || [],
        (params.data.recommendations as ProductionRiskSignal['recommendations']) || {
          forRiskAssessor: [],
          forQualityCriteria: [],
        }
      );
      break;

    case 'tactical':
      signal = await memory.storeSFDIPOTSignal(
        (params.data.factorWeights as FactorWeight[]) || [],
        (params.data.featureContext as string) || 'unknown',
        (params.data.recommendations as SFDIPOTWeightSignal['recommendations']) || {
          forProductFactorsAssessor: [],
        }
      );
      break;

    case 'operational':
      signal = await memory.storeTestHealthSignal(
        (params.data.flakyPatterns as FlakyPattern[]) || [],
        (params.data.gateFailures as GateFailure[]) || [],
        (params.data.recommendations as TestHealthSignal['recommendations']) || {
          forTestArchitect: [],
          antiPatterns: [],
        }
      );
      break;

    case 'quality-criteria':
      signal = await memory.storeACQualitySignal(
        (params.data.untestablePatterns as UntestablePattern[]) || [],
        (params.data.coverageGaps as CoverageGap[]) || [],
        (params.data.recommendations as ACQualitySignal['recommendations']) || {
          forRequirementsValidator: [],
          acTemplates: {},
        }
      );
      break;

    default:
      throw new Error(`Unknown loop type: ${params.loop}`);
  }

  return {
    success: true,
    signalId: signal.id,
    loop: params.loop,
    expiresAt: signal.expiresAt,
  };
}

/**
 * Query cross-phase signals by loop type
 */
export async function handleCrossPhaseQuery(params: QuerySignalsParams): Promise<QuerySignalsResult> {
  const { memory } = await ensureInitialized();

  let signals: CrossPhaseSignal[];

  switch (params.loop) {
    case 'strategic':
      signals = await memory.queryRiskSignals();
      break;

    case 'tactical':
      const featureFilter = params.filter?.featureContext as string | undefined;
      signals = await memory.querySFDIPOTSignals(featureFilter);
      break;

    case 'operational':
      signals = await memory.queryTestHealthSignals();
      break;

    case 'quality-criteria':
      signals = await memory.queryACQualitySignals();
      break;

    default:
      throw new Error(`Unknown loop type: ${params.loop}`);
  }

  // Apply max age filter if specified
  if (params.maxAge) {
    const maxAgeMs = parseMaxAge(params.maxAge);
    const cutoff = Date.now() - maxAgeMs;
    signals = signals.filter(s => new Date(s.timestamp).getTime() > cutoff);
  }

  return {
    success: true,
    signals,
    count: signals.length,
  };
}

/**
 * Trigger agent completion hooks
 * Call this when an agent completes its task to store cross-phase signals
 */
export async function handleAgentComplete(params: AgentCompleteParams): Promise<AgentCompleteResult> {
  const { hooks } = await ensureInitialized();

  let signalsStored = 0;

  // Listen for signal storage events
  const listener = () => { signalsStored++; };
  hooks.on('signal-stored', listener);

  try {
    await hooks.onAgentComplete(params.agentName, params.result);
  } finally {
    hooks.off('signal-stored', listener);
  }

  return {
    success: true,
    hooksExecuted: 1,
    signalsStored,
  };
}

/**
 * Trigger phase start hooks and get injected signals
 * Call this at the start of a QCSD phase to get relevant cross-phase learning
 */
export async function handlePhaseStart(params: PhaseEventParams): Promise<PhaseStartResult> {
  const { hooks } = await ensureInitialized();

  const injectedSignals = await hooks.onPhaseStart(params.phase, params.context || {});

  const totalSignals = Object.values(injectedSignals).reduce(
    (sum, signals) => sum + signals.length,
    0
  );

  return {
    success: true,
    injectedSignals,
    totalSignals,
  };
}

/**
 * Trigger phase end hooks
 * Call this at the end of a QCSD phase to store accumulated signals
 */
export async function handlePhaseEnd(params: PhaseEventParams): Promise<PhaseEndResult> {
  const { hooks } = await ensureInitialized();

  await hooks.onPhaseEnd(params.phase, params.context || {});

  return {
    success: true,
    hooksExecuted: 1,
  };
}

/**
 * Get cross-phase memory statistics
 */
export async function handleCrossPhaseStats(): Promise<CrossPhaseStatsResult> {
  const { memory } = await ensureInitialized();

  const stats = await memory.getStats();

  return {
    success: true,
    stats,
  };
}

/**
 * Format signals for injection into agent prompts
 */
export async function handleFormatSignals(params: FormatSignalsParams): Promise<FormatSignalsResult> {
  const { hooks } = await ensureInitialized();

  const formatted = hooks.formatSignalsForInjection(params.signals);

  return {
    success: true,
    formatted,
  };
}

/**
 * Run cleanup of expired signals
 */
export async function handleCrossPhaseCleanup(): Promise<{
  success: boolean;
  deleted: number;
  namespaces: Record<string, number>;
}> {
  const { memory } = await ensureInitialized();

  const result = await memory.cleanupExpired();

  return {
    success: true,
    deleted: result.deleted,
    namespaces: result.namespaces,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function parseMaxAge(maxAge: string): number {
  const match = maxAge.match(/^(\d+)(d|h|m|s)$/);
  if (!match) return 0;

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case 'd': return num * 24 * 60 * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'm': return num * 60 * 1000;
    case 's': return num * 1000;
    default: return 0;
  }
}

// =============================================================================
// Reset (for testing)
// =============================================================================

export function resetCrossPhaseHandlers(): void {
  memoryService = null;
  hookExecutor = null;
  initialized = false;
}
