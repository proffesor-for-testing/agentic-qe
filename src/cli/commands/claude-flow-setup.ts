/**
 * Claude Flow Integration Setup
 * ADR-026: 3-Tier Model Routing
 *
 * Sets up Claude Flow integration when available during init.
 * Gracefully handles when Claude Flow is not installed.
 *
 * Features when Claude Flow available:
 * - SONA trajectory tracking for reinforcement learning
 * - 3-tier model routing (haiku/sonnet/opus)
 * - Codebase pretrain analysis for optimal agent configs
 * - Background worker integration
 *
 * When not available:
 * - Uses AQE's standalone learning engine
 * - Rule-based model routing
 * - Local pattern learning
 */

import { existsSync, readFileSync } from 'node:fs';
import { writeFileIfChanged } from '../../init/idempotent-write.js';
import { join } from 'node:path';
import { safeJsonParse } from '../../shared/safe-json.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { RUFLO_PINNED_SPEC } from '../../shared/pinned-tools.js';
import {
  detectClaudeFlow as smartDetectClaudeFlow,
} from '../../adapters/claude-flow/detect.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Claude Flow setup options
 */
export interface ClaudeFlowSetupOptions {
  /** Project root directory */
  projectRoot: string;
  /** Force setup even if not auto-detected */
  force?: boolean;
  /** Only check availability, don't configure */
  checkOnly?: boolean;
  /** Enable debug output */
  debug?: boolean;
}

/**
 * Claude Flow setup result
 */
export interface ClaudeFlowSetupResult {
  /** Whether Claude Flow is available */
  available: boolean;
  /** Claude Flow version (if available) */
  version?: string;
  /** Available features */
  features: {
    trajectories: boolean;
    modelRouting: boolean;
    pretrain: boolean;
    workers: boolean;
    patternSearch: boolean;
  };
  /** Configuration path (if written) */
  configPath?: string;
  /** Error message (if setup failed) */
  error?: string;
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Check if Claude Flow is available.
 * Uses smart detection that never triggers npm auto-install.
 */
async function detectClaudeFlow(projectRoot: string, debug?: boolean): Promise<{
  available: boolean;
  version?: string;
  method?: 'mcp' | 'cli' | 'npm';
}> {
  const detection = smartDetectClaudeFlow(projectRoot);

  if (debug && detection.available) {
    console.log(`[ClaudeFlow] Detected via ${detection.method}${detection.version ? `: v${detection.version}` : ''}`);
  }

  if (!detection.available) {
    return { available: false };
  }

  // Map detection method to legacy method names for compatibility
  const methodMap: Record<string, 'mcp' | 'cli' | 'npm'> = {
    'mcp-config': 'mcp',
    'local-binary': 'cli',
    'npx-cached': 'cli',
    'npm-dependency': 'npm',
  };

  return {
    available: true,
    version: detection.version,
    method: detection.method ? methodMap[detection.method] : undefined,
  };
}

/**
 * Check available Claude Flow features.
 *
 * When Claude Flow is detected locally, we assume all features are available
 * (they ship as a bundle). Individual feature probing via shell commands is
 * avoided because it is slow, noisy, and can trigger npm auto-install.
 *
 * If a specific feature fails at runtime, the bridges already fall back
 * gracefully to local implementations.
 */
async function detectFeatures(_projectRoot: string): Promise<ClaudeFlowSetupResult['features']> {
  // All features ship together in Claude Flow — no need to probe each one.
  // Runtime bridges handle individual fallbacks if a command is missing.
  return {
    trajectories: true,
    modelRouting: true,
    pretrain: true,
    workers: true,
    patternSearch: true,
  };
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Generate Claude Flow integration configuration
 */
function generateClaudeFlowConfig(projectRoot: string, features: ClaudeFlowSetupResult['features']): object {
  return {
    version: '1.0',
    projectRoot,
    integration: {
      enabled: true,
      features: {
        trajectories: features.trajectories,
        modelRouting: features.modelRouting,
        pretrain: features.pretrain,
        workers: features.workers,
      },
    },
    learning: {
      // Use SONA trajectories when available, fall back to local SQLite
      trajectoryStorage: features.trajectories ? 'claude-flow' : 'local',
      // Enable pattern search via Claude Flow when available
      patternSearch: features.patternSearch ? 'claude-flow' : 'local',
    },
    routing: {
      // Use 3-tier model routing when available
      modelRouting: features.modelRouting ? 'claude-flow' : 'rule-based',
      // Default model preferences
      preferences: {
        simple: 'haiku',
        standard: 'sonnet',
        complex: 'opus',
      },
    },
    pretrain: {
      enabled: features.pretrain,
      depth: 'medium',
      autoRun: true,
    },
    workers: {
      enabled: features.workers,
      autoDispatch: ['optimize', 'consolidate'],
    },
  };
}

/** The `mcpServers.ruflo` entry AQE writes into `.claude/settings.json`. */
export function rufloMcpServerEntry(): { command: string; args: string[]; env: Record<string, string> } {
  return { command: 'npx', args: [RUFLO_PINNED_SPEC, 'mcp'], env: {} };
}

/**
 * `args` (space-joined) that earlier AQE releases wrote as their default ruflo /
 * claude-flow MCP entry (#1413). These are only matched, never written. An entry still
 * equal to one of these, with `command: 'npx'` and no env or extra keys, was written by
 * AQE rather than customised, so init refreshes it.
 * - ruflo 3.5.18: written from 2026-03-17 until #1413. That release depends on
 *   `@claude-flow/cli >=3.0.0-alpha.1`, so it never pinned the server that actually ran.
 * - `@anthropic/claude-flow`: written under the `claude-flow` key before 2026-03-17.
 */
const LEGACY_AQE_RUFLO_ARGS: ReadonlySet<string> = new Set([
  'ruflo@3.5.18 mcp',
  '@anthropic/claude-flow mcp',
]);

/** True when `entry` is exactly an old AQE default from {@link LEGACY_AQE_RUFLO_ARGS}. */
export function isLegacyAqeRufloEntry(entry: unknown): boolean {
  if (!isPlainObject(entry)) return false;
  const { command, args, env, ...rest } = entry;
  if (Object.keys(rest).length > 0 || command !== 'npx') return false;
  if (!Array.isArray(args) || args.length !== 2 || !args.every((arg) => typeof arg === 'string')) return false;
  const envIsEmpty = env === undefined || (isPlainObject(env) && Object.keys(env).length === 0);
  return envIsEmpty && LEGACY_AQE_RUFLO_ARGS.has(args.join(' '));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Update MCP server configuration for Claude
 */
function updateMCPConfig(projectRoot: string): void {
  const claudeSettingsPath = join(projectRoot, '.claude', 'settings.json');

  let settings: Record<string, unknown> = {};
  if (existsSync(claudeSettingsPath)) {
    try {
      settings = safeJsonParse<Record<string, unknown>>(readFileSync(claudeSettingsPath, 'utf-8'));
    } catch {
      // Start fresh
    }
  }

  // Ensure mcpServers section exists
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }

  // Add the ruflo server if not present; refresh entries AQE itself wrote with an old
  // default (#1413). Any other existing value is the user's and is kept as-is.
  const servers = settings.mcpServers as Record<string, unknown>;
  if (!servers['ruflo'] && !servers['claude-flow']) {
    servers['ruflo'] = rufloMcpServerEntry();
  }
  for (const key of ['ruflo', 'claude-flow']) {
    if (isLegacyAqeRufloEntry(servers[key])) {
      servers[key] = rufloMcpServerEntry();
    }
  }

  // Write updated settings — only when something changed (#778).
  writeFileIfChanged(claudeSettingsPath, JSON.stringify(settings, null, 2));
}

// ============================================================================
// Main Setup Function
// ============================================================================

/**
 * Setup Claude Flow integration
 *
 * @example
 * ```typescript
 * const result = await setupClaudeFlowIntegration({
 *   projectRoot: process.cwd(),
 * });
 *
 * if (result.available) {
 *   console.log('Claude Flow enabled:', result.features);
 * } else {
 *   console.log('Running in standalone mode');
 * }
 * ```
 */
export async function setupClaudeFlowIntegration(
  options: ClaudeFlowSetupOptions
): Promise<ClaudeFlowSetupResult> {
  const { projectRoot, force, checkOnly, debug } = options;

  // Step 1: Detect Claude Flow
  const detection = await detectClaudeFlow(projectRoot, debug);

  if (!detection.available && !force) {
    return {
      available: false,
      features: {
        trajectories: false,
        modelRouting: false,
        pretrain: false,
        workers: false,
        patternSearch: false,
      },
    };
  }

  // Step 2: Detect available features
  const features = await detectFeatures(projectRoot);

  if (checkOnly) {
    return {
      available: detection.available,
      version: detection.version,
      features,
    };
  }

  // Step 3: Generate and write configuration
  const aqeDir = join(projectRoot, '.agentic-qe');
  const configPath = join(aqeDir, 'claude-flow-integration.json');

  try {
    const config = generateClaudeFlowConfig(projectRoot, features);
    writeFileIfChanged(configPath, JSON.stringify(config, null, 2));
    if (debug) console.log(`[ClaudeFlow] Config written to: ${configPath}`);
  } catch (error) {
    return {
      available: detection.available,
      version: detection.version,
      features,
      error: `Failed to write config: ${toErrorMessage(error)}`,
    };
  }

  // Step 4: Update MCP configuration
  try {
    updateMCPConfig(projectRoot);
  } catch (error) {
    if (debug) {
      console.log('[ClaudeFlow] MCP config update failed:', toErrorMessage(error));
    }
    // Non-critical, continue
  }

  // Pretrain is handled by ruflo init — skip here to avoid duplicate work and long hangs

  return {
    available: true,
    version: detection.version,
    features,
    configPath,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if Claude Flow integration is configured
 */
export function isClaudeFlowConfigured(projectRoot: string): boolean {
  const configPath = join(projectRoot, '.agentic-qe', 'claude-flow-integration.json');
  return existsSync(configPath);
}

/**
 * Get Claude Flow integration config
 */
export function getClaudeFlowConfig(projectRoot: string): object | null {
  const configPath = join(projectRoot, '.agentic-qe', 'claude-flow-integration.json');
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    return safeJsonParse(readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Remove Claude Flow integration
 */
export function removeClaudeFlowIntegration(projectRoot: string): boolean {
  const configPath = join(projectRoot, '.agentic-qe', 'claude-flow-integration.json');
  if (existsSync(configPath)) {
    try {
      const fs = require('node:fs');
      fs.rmSync(configPath);
      return true;
    } catch {
      return false;
    }
  }
  return true;
}
