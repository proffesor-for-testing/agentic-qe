/**
 * Cross-Phase Hook Executor
 *
 * Runtime executor for cross-phase memory hooks.
 * Reads hook configuration and executes actions on triggers.
 *
 * @module cross-phase-hooks
 * @version 1.0.0
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import {
  getCrossPhaseMemory,
  CrossPhaseMemoryService,
  CROSS_PHASE_NAMESPACES,
  CrossPhaseNamespace,
} from '../memory/cross-phase-memory.js';
import {
  CrossPhaseSignal,
  ProductionRiskSignal,
  SFDIPOTWeightSignal,
  TestHealthSignal,
  ACQualitySignal,
  FeedbackLoopType,
  RiskWeight,
  FactorWeight,
  FlakyPattern,
  UntestablePattern,
} from '../types/cross-phase-signals.js';

// =============================================================================
// Types
// =============================================================================

interface HookConfig {
  version: string;
  enabled: boolean;
  hooks: Record<string, HookDefinition>;
  cleanup: CleanupConfig;
  monitoring: MonitoringConfig;
  routing: RoutingConfig;
}

interface HookDefinition {
  description: string;
  trigger: HookTrigger;
  actions: HookAction[];
}

interface HookTrigger {
  event: 'agent-complete' | 'phase-start' | 'phase-end' | 'manual';
  agent?: string;
  phase?: string;
  conditions?: string[];
}

interface HookAction {
  type: 'store-signal' | 'query-signals' | 'notify-agent' | 'invoke-agent' | 'update-signal' | 'conditional' | 'delete-expired' | 'report';
  loop?: FeedbackLoopType;
  namespace?: string;
  extract?: Record<string, string>;
  target?: string;
  message?: string;
  injectInto?: string[];
  maxAge?: string;
  filterBy?: string;
  condition?: string;
  action?: HookAction;
  merge?: Record<string, string>;
  input?: Record<string, unknown>;
  priority?: string;
  destination?: string;
  namespaces?: string | string[];
}

interface CleanupConfig {
  enabled: boolean;
  schedule: string;
  actions: HookAction[];
}

interface MonitoringConfig {
  enabled: boolean;
  metrics: MetricDefinition[];
}

interface MetricDefinition {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  labels: string[];
}

interface RoutingConfig {
  authorized_receivers: Record<FeedbackLoopType, string[]>;
  injection_format: string;
}

// =============================================================================
// Hook Executor
// =============================================================================

export class CrossPhaseHookExecutor {
  private config: HookConfig | null = null;
  private memory: CrossPhaseMemoryService;
  private configPath: string;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  constructor(configPath?: string) {
    this.configPath = configPath || join(process.cwd(), '.claude/hooks/cross-phase-memory.yaml');
    this.memory = getCrossPhaseMemory();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  async initialize(): Promise<boolean> {
    if (!existsSync(this.configPath)) {
      console.warn(`[CrossPhaseHooks] Config not found: ${this.configPath}`);
      return false;
    }

    try {
      const content = readFileSync(this.configPath, 'utf-8');
      this.config = parseYaml(content) as HookConfig;

      if (!this.config.enabled) {
        console.log('[CrossPhaseHooks] Hooks disabled in config');
        return false;
      }

      await this.memory.initialize();
      console.log(`[CrossPhaseHooks] Initialized with ${Object.keys(this.config.hooks).length} hooks`);
      return true;
    } catch (err) {
      console.error('[CrossPhaseHooks] Failed to load config:', err);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  async onAgentComplete(agentName: string, result: Record<string, unknown>): Promise<void> {
    if (!this.config) return;

    const matchingHooks = Object.entries(this.config.hooks).filter(
      ([_, hook]) =>
        hook.trigger.event === 'agent-complete' &&
        hook.trigger.agent === agentName
    );

    for (const [hookName, hook] of matchingHooks) {
      if (this.checkConditions(hook.trigger.conditions, result)) {
        console.log(`[CrossPhaseHooks] Executing hook: ${hookName}`);
        await this.executeActions(hook.actions, result);
      }
    }
  }

  async onPhaseStart(phaseName: string, context: Record<string, unknown> = {}): Promise<Record<string, CrossPhaseSignal[]>> {
    if (!this.config) return {};

    const injectedSignals: Record<string, CrossPhaseSignal[]> = {};

    const matchingHooks = Object.entries(this.config.hooks).filter(
      ([_, hook]) =>
        hook.trigger.event === 'phase-start' &&
        hook.trigger.phase === phaseName
    );

    for (const [hookName, hook] of matchingHooks) {
      console.log(`[CrossPhaseHooks] Executing phase-start hook: ${hookName}`);

      for (const action of hook.actions) {
        if (action.type === 'query-signals' && action.injectInto) {
          const signals = await this.querySignalsForInjection(
            action.namespace as CrossPhaseNamespace,
            action.maxAge,
            action.filterBy ? context[action.filterBy] as string : undefined
          );

          for (const agentName of action.injectInto) {
            if (!injectedSignals[agentName]) {
              injectedSignals[agentName] = [];
            }
            injectedSignals[agentName].push(...signals);
          }
        }
      }
    }

    return injectedSignals;
  }

  async onPhaseEnd(phaseName: string, result: Record<string, unknown>): Promise<void> {
    if (!this.config) return;

    const matchingHooks = Object.entries(this.config.hooks).filter(
      ([_, hook]) =>
        hook.trigger.event === 'phase-end' &&
        hook.trigger.phase === phaseName
    );

    for (const [hookName, hook] of matchingHooks) {
      console.log(`[CrossPhaseHooks] Executing phase-end hook: ${hookName}`);
      await this.executeActions(hook.actions, result);
    }
  }

  // ---------------------------------------------------------------------------
  // Action Execution
  // ---------------------------------------------------------------------------

  private async executeActions(actions: HookAction[], context: Record<string, unknown>): Promise<void> {
    for (const action of actions) {
      try {
        await this.executeAction(action, context);
      } catch (err) {
        console.error(`[CrossPhaseHooks] Action failed:`, err);
      }
    }
  }

  private async executeAction(action: HookAction, context: Record<string, unknown>): Promise<void> {
    switch (action.type) {
      case 'store-signal':
        await this.executeStoreSignal(action, context);
        break;

      case 'query-signals':
        // Handled in onPhaseStart for injection
        break;

      case 'notify-agent':
        await this.executeNotifyAgent(action, context);
        break;

      case 'invoke-agent':
        await this.executeInvokeAgent(action, context);
        break;

      case 'conditional':
        if (action.condition && action.action) {
          if (this.evaluateCondition(action.condition, context)) {
            await this.executeAction(action.action, context);
          }
        }
        break;

      case 'delete-expired':
        await this.memory.cleanupExpired();
        break;

      default:
        console.warn(`[CrossPhaseHooks] Unknown action type: ${action.type}`);
    }
  }

  private async executeStoreSignal(action: HookAction, context: Record<string, unknown>): Promise<void> {
    if (!action.loop || !action.namespace || !action.extract) return;

    const extracted = this.extractFromContext(action.extract, context);

    switch (action.loop) {
      case 'strategic':
        await this.memory.storeRiskSignal(
          (extracted.riskWeights as RiskWeight[]) || [],
          (extracted.recommendations as ProductionRiskSignal['recommendations']) || { forRiskAssessor: [], forQualityCriteria: [] }
        );
        break;

      case 'tactical':
        await this.memory.storeSFDIPOTSignal(
          (extracted.factorWeights as FactorWeight[]) || [],
          (extracted.featureContext as string) || 'unknown',
          (extracted.recommendations as SFDIPOTWeightSignal['recommendations']) || { forProductFactorsAssessor: [] }
        );
        break;

      case 'operational':
        await this.memory.storeTestHealthSignal(
          (extracted.flakyPatterns as FlakyPattern[]) || [],
          (extracted.gateFailures as TestHealthSignal['gateFailures']) || [],
          (extracted.recommendations as TestHealthSignal['recommendations']) || { forTestArchitect: [], antiPatterns: [] }
        );
        break;

      case 'quality-criteria':
        await this.memory.storeACQualitySignal(
          (extracted.untestablePatterns as UntestablePattern[]) || [],
          (extracted.coverageGaps as ACQualitySignal['coverageGaps']) || [],
          (extracted.recommendations as ACQualitySignal['recommendations']) || { forRequirementsValidator: [], acTemplates: {} }
        );
        break;
    }

    this.emit('signal-stored', { loop: action.loop, namespace: action.namespace });
  }

  private async executeNotifyAgent(action: HookAction, context: Record<string, unknown>): Promise<void> {
    if (!action.target || !action.message) return;

    console.log(`[CrossPhaseHooks] Notify ${action.target}: ${action.message}`);
    this.emit('agent-notification', {
      target: action.target,
      message: action.message,
      priority: action.priority || 'normal',
      context,
    });
  }

  private async executeInvokeAgent(action: HookAction, context: Record<string, unknown>): Promise<void> {
    if (!action.target) return;

    console.log(`[CrossPhaseHooks] Invoke agent: ${action.target}`);
    this.emit('agent-invocation', {
      agent: action.target,
      input: { ...context, ...(action.input || {}) },
    });
  }

  // ---------------------------------------------------------------------------
  // Signal Injection
  // ---------------------------------------------------------------------------

  private async querySignalsForInjection(
    namespace: CrossPhaseNamespace,
    maxAge?: string,
    filter?: string
  ): Promise<CrossPhaseSignal[]> {
    const signals = await this.memory.queryByNamespace(namespace);

    // Filter by age
    let filtered = signals;
    if (maxAge) {
      const maxAgeMs = this.parseMaxAge(maxAge);
      const cutoff = Date.now() - maxAgeMs;
      filtered = filtered.filter(s => new Date(s.timestamp).getTime() > cutoff);
    }

    return filtered;
  }

  formatSignalsForInjection(signals: CrossPhaseSignal[]): string {
    if (signals.length === 0) return '';

    // Format signals for agent prompt injection
    let output = '## CROSS-PHASE LEARNING SIGNALS\n\n';
    output += 'The following signals have been automatically injected from previous phases.\n';
    output += 'Apply these learnings to your analysis.\n\n';

    for (const signal of signals) {
      output += `### Signal: ${signal.id}\n`;
      output += `- **From:** ${signal.source} phase\n`;
      output += `- **Loop:** ${signal.loopType}\n`;
      output += `- **Timestamp:** ${signal.timestamp}\n\n`;

      const recommendations = this.getRecommendations(signal);
      if (recommendations.length > 0) {
        output += '**Recommendations:**\n';
        for (const rec of recommendations) {
          output += `- ${rec}\n`;
        }
        output += '\n';
      }
    }

    return output;
  }

  private getRecommendations(signal: CrossPhaseSignal): string[] {
    switch (signal.loopType) {
      case 'strategic':
        return [
          ...(signal as ProductionRiskSignal).recommendations.forRiskAssessor,
          ...(signal as ProductionRiskSignal).recommendations.forQualityCriteria,
        ];
      case 'tactical':
        return (signal as SFDIPOTWeightSignal).recommendations.forProductFactorsAssessor;
      case 'operational':
        return [
          ...(signal as TestHealthSignal).recommendations.forTestArchitect,
          ...(signal as TestHealthSignal).recommendations.antiPatterns,
        ];
      case 'quality-criteria':
        return (signal as ACQualitySignal).recommendations.forRequirementsValidator;
      default:
        return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private checkConditions(conditions: string[] | undefined, context: Record<string, unknown>): boolean {
    if (!conditions || conditions.length === 0) return true;

    return conditions.every(condition => this.evaluateCondition(condition, context));
  }

  private evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
    try {
      // Simple path evaluation (e.g., "result.defects.length > 0")
      const parts = condition.split(/\s*(>|<|>=|<=|==|!=)\s*/);
      if (parts.length !== 3) return false;

      const [path, op, value] = parts;
      const actual = this.getValueFromPath(context, path);
      const expected = isNaN(Number(value)) ? value : Number(value);

      // Cast actual to number for comparison operations
      const actualNum = typeof actual === 'number' ? actual : Number(actual);
      const expectedNum = typeof expected === 'number' ? expected : Number(expected);

      switch (op) {
        case '>': return actualNum > expectedNum;
        case '<': return actualNum < expectedNum;
        case '>=': return actualNum >= expectedNum;
        case '<=': return actualNum <= expectedNum;
        case '==': return actual == expected;
        case '!=': return actual != expected;
        default: return false;
      }
    } catch {
      return false;
    }
  }

  private getValueFromPath(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((curr: unknown, key) => {
      if (curr && typeof curr === 'object' && key in curr) {
        return (curr as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  private extractFromContext(extract: Record<string, string>, context: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, path] of Object.entries(extract)) {
      result[key] = this.getValueFromPath(context, path);
    }

    return result;
  }

  private parseMaxAge(maxAge: string): number {
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

  // ---------------------------------------------------------------------------
  // Event Emitter
  // ---------------------------------------------------------------------------

  on(event: string, callback: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data: unknown) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  async runCleanup(): Promise<void> {
    if (!this.config?.cleanup.enabled) return;

    console.log('[CrossPhaseHooks] Running cleanup...');
    const result = await this.memory.cleanupExpired();
    console.log(`[CrossPhaseHooks] Cleanup complete: ${result.deleted} signals deleted`);
  }
}

// =============================================================================
// Singleton
// =============================================================================

let executor: CrossPhaseHookExecutor | null = null;

export function getCrossPhaseHookExecutor(configPath?: string): CrossPhaseHookExecutor {
  if (!executor) {
    executor = new CrossPhaseHookExecutor(configPath);
  }
  return executor;
}

export function resetCrossPhaseHookExecutor(): void {
  executor = null;
}

export default CrossPhaseHookExecutor;
