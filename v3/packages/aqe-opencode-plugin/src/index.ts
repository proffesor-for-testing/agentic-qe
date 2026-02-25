/**
 * AQE OpenCode Plugin
 *
 * Maps AQE lifecycle hooks to OpenCode's plugin system.
 * Provides file safety guards, pattern learning, model routing,
 * and session metrics tracking.
 *
 * Hook mapping from AQE (.claude/settings.json) to OpenCode:
 * - PreToolUse (guard, pre-edit, pre-command) -> onToolCallBefore
 * - PostToolUse (post-edit, post-command, pattern capture) -> onToolCallAfter
 * - UserPromptSubmit (route, ReasoningBank match) -> onSessionPromptBefore
 * - SessionStart/Stop (memory init, dream consolidation) -> lifecycle.ts
 *
 * @module aqe-opencode-plugin
 * @version 0.1.0
 */

import { definePlugin } from './types/opencode.js';
import { AQEPluginConfigSchema } from './config.js';
import { getSessionManager } from './lifecycle.js';
import { createOnToolCallBefore } from './hooks/on-tool-call-before.js';
import { createOnToolCallAfter } from './hooks/on-tool-call-after.js';
import { createOnSessionPromptBefore } from './hooks/on-session-prompt-before.js';
import { createOnSessionPromptAfter } from './hooks/on-session-prompt-after.js';

import type { AQEPluginConfig } from './config.js';
import type {
  ToolCallContext,
  ToolResult,
  SessionPromptContext,
  SessionResponse,
  PluginHookResult,
  PromptModification,
} from './types/opencode.js';

// =============================================================================
// Plugin Definition
// =============================================================================

/**
 * Resolved config is populated by OpenCode at plugin load time.
 * Falls back to schema defaults if not set.
 */
let resolvedConfig: AQEPluginConfig | null = null;

function getConfig(): AQEPluginConfig {
  if (!resolvedConfig) {
    resolvedConfig = AQEPluginConfigSchema.parse({});
  }
  return resolvedConfig;
}

export default definePlugin({
  name: 'aqe-opencode-plugin',
  version: '0.1.0',
  config: AQEPluginConfigSchema,

  async onToolCallBefore(ctx: ToolCallContext): Promise<void | PluginHookResult> {
    const config = getConfig();
    const session = getSessionManager(config);
    const handler = createOnToolCallBefore(config, session);
    return handler(ctx);
  },

  async onToolCallAfter(ctx: ToolCallContext, result: ToolResult): Promise<void> {
    const config = getConfig();
    const session = getSessionManager(config);
    const handler = createOnToolCallAfter(config, session);
    return handler(ctx, result);
  },

  async onSessionPromptBefore(ctx: SessionPromptContext): Promise<void | PromptModification> {
    const config = getConfig();
    const session = getSessionManager(config);
    const handler = createOnSessionPromptBefore(config, session);
    return handler(ctx);
  },

  async onSessionPromptAfter(ctx: SessionPromptContext, response: SessionResponse): Promise<void> {
    const config = getConfig();
    const session = getSessionManager(config);
    const handler = createOnSessionPromptAfter(config, session);
    return handler(ctx, response);
  },
});

// =============================================================================
// Named Exports
// =============================================================================

export { AQEPluginConfigSchema } from './config.js';
export type { AQEPluginConfig } from './config.js';
export { SessionManager, getSessionManager, resetSessionManager } from './lifecycle.js';
export type {
  SessionMetrics,
  SessionState,
  MemoryConnection,
  PatternMatch,
  DreamQueueItem,
} from './lifecycle.js';
export { createOnToolCallBefore } from './hooks/on-tool-call-before.js';
export { createOnToolCallAfter } from './hooks/on-tool-call-after.js';
export { createOnSessionPromptBefore } from './hooks/on-session-prompt-before.js';
export { createOnSessionPromptAfter } from './hooks/on-session-prompt-after.js';
export { definePlugin } from './types/opencode.js';
export type {
  ToolCallContext,
  ToolResult,
  SessionPromptContext,
  SessionResponse,
  SessionMeta,
  PluginHookResult,
  PromptModification,
  PluginDefinition,
} from './types/opencode.js';

// WS4: Provider degradation & context management
export { evaluateDegradation, resolveModelTier } from './degradation/graceful-degradation.js';
export type { DegradationResult, SkillTierInfo, SkillTierLookup } from './degradation/graceful-degradation.js';
export { ContextBudgetManager } from './context/budget-manager.js';
export type { BudgetReport, CompressionOptions } from './context/budget-manager.js';
export { LSPBridge, NullLSPBridge } from './lsp/lsp-bridge.js';
export type {
  SymbolInfo,
  SymbolKind,
  DiagnosticInfo,
  DiagnosticSeverity,
  ReferenceInfo,
  ReferenceKind,
  ImpactAnalysisResult,
} from './lsp/lsp-bridge.js';
export {
  formatCoverageReport,
  formatTestResults,
  formatSecurityFindings,
  formatQualityAssessment,
  formatGenericOutput,
} from './adapters/output-formatter.js';
export type {
  CoverageReport,
  TestResults,
  SecurityFindings,
  QualityAssessment,
  FormatOptions,
} from './adapters/output-formatter.js';
