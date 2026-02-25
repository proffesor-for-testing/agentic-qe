/**
 * onToolCallBefore Hook
 *
 * Pre-execution safety checks mapped from AQE's PreToolUse hooks:
 * - File guard: prevent .db file overwrites
 * - Pre-edit: detect external modifications
 * - Pre-command: block dangerous bash patterns
 * - Session init: lazy-initialize AQE memory on first call
 *
 * Target latency: <100ms
 *
 * @module hooks/on-tool-call-before
 */

import type { ToolCallContext, PluginHookResult } from '../types/opencode.js';
import type { AQEPluginConfig } from '../config.js';
import type { SessionManager } from '../lifecycle.js';

// =============================================================================
// Dangerous Command Patterns (compiled once)
// =============================================================================

let compiledPatterns: RegExp[] | null = null;

function getCompiledPatterns(config: AQEPluginConfig): RegExp[] {
  if (!compiledPatterns) {
    compiledPatterns = config.safety.dangerousPatterns.map(
      (p) => new RegExp(p, 'i')
    );
  }
  return compiledPatterns;
}

// =============================================================================
// File Guard
// =============================================================================

const DB_EXTENSIONS = ['.db', '.sqlite', '.sqlite3'];

function isDbFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return DB_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function checkFileGuard(
  ctx: ToolCallContext,
  config: AQEPluginConfig
): PluginHookResult | null {
  if (!config.safety.blockDbWrites) return null;

  const writeTools = ['write', 'edit', 'multiedit'];
  if (!writeTools.includes(ctx.toolName.toLowerCase())) return null;

  const filePath = (ctx.input.file_path as string) || (ctx.input.path as string) || '';
  if (!filePath) return null;

  if (isDbFile(filePath)) {
    return {
      cancel: true,
      reason: `[AQE Safety] Blocked write to database file: ${filePath}. ` +
        'Database files contain irreplaceable data. Use AQE memory APIs instead.',
    };
  }

  return null;
}

// =============================================================================
// Pre-Command Safety
// =============================================================================

function checkPreCommand(
  ctx: ToolCallContext,
  config: AQEPluginConfig
): PluginHookResult | null {
  if (!config.safety.blockDangerousCommands) return null;
  if (ctx.toolName.toLowerCase() !== 'bash') return null;

  const command = (ctx.input.command as string) || '';
  if (!command) return null;

  const patterns = getCompiledPatterns(config);
  for (const pattern of patterns) {
    if (pattern.test(command)) {
      return {
        cancel: true,
        reason: `[AQE Safety] Blocked dangerous command matching pattern: ${pattern.source}. ` +
          'This command could cause irreversible damage.',
      };
    }
  }

  return null;
}

// =============================================================================
// Hook Factory
// =============================================================================

export function createOnToolCallBefore(
  config: AQEPluginConfig,
  session: SessionManager
) {
  return async function onToolCallBefore(
    ctx: ToolCallContext
  ): Promise<void | PluginHookResult> {
    if (!config.enabled || !config.hooks.onToolCallBefore) return;

    // Lazy session initialization on first tool call
    await session.ensureInitialized();

    // 1. File guard: block .db writes
    const fileGuardResult = checkFileGuard(ctx, config);
    if (fileGuardResult) return fileGuardResult;

    // 2. Pre-command: block dangerous bash patterns
    const preCommandResult = checkPreCommand(ctx, config);
    if (preCommandResult) return preCommandResult;

    // All checks passed — allow the tool call
    return;
  };
}
