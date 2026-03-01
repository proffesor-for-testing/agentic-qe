/**
 * Settings Merge Utilities
 *
 * Smart merge logic for .claude/settings.json that:
 * - Detects existing AQE/agentic-qe hooks by command pattern
 * - Replaces old AQE hooks with new ones (no duplicates)
 * - Preserves non-AQE hooks from the user's config
 * - Generates full env vars and v3 settings sections
 */

import type { AQEInitConfig } from './types.js';

// Patterns that identify a hook command as belonging to AQE
const AQE_COMMAND_PATTERNS = [
  /\baqe\b/i,
  /\bagentic-qe\b/i,
  /\bnpx\s+agentic-qe\b/i,
  /\bnpx\s+@anthropics\/agentic-qe\b/i,
];

type HookEntry = {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string; timeout?: number; continueOnError?: boolean }>;
};

/**
 * Check if a single hook entry belongs to AQE (any variant).
 * Matches commands containing 'aqe' or 'agentic-qe' in any form.
 */
export function isAqeHookEntry(entry: unknown): boolean {
  const hookEntry = entry as HookEntry;
  if (!hookEntry?.hooks || !Array.isArray(hookEntry.hooks)) return false;

  return hookEntry.hooks.some((h) => {
    if (!h.command || typeof h.command !== 'string') return false;
    return AQE_COMMAND_PATTERNS.some((pattern) => pattern.test(h.command!));
  });
}

/**
 * Smart merge of hooks: removes all existing AQE hooks, preserves user hooks,
 * then adds the new AQE hooks.
 *
 * For each hook type (PreToolUse, PostToolUse, etc.):
 * 1. Filter out any existing entries whose commands match AQE patterns
 * 2. Append the new AQE hook entries
 * 3. Preserve any hook types not in the new config
 */
export function mergeHooksSmart(
  existingHooks: Record<string, unknown[]>,
  newAqeHooks: Record<string, unknown[]>,
): Record<string, unknown[]> {
  const merged: Record<string, unknown[]> = {};

  // Process hook types that have new AQE entries
  for (const [hookType, newEntries] of Object.entries(newAqeHooks)) {
    const existing = existingHooks[hookType] || [];

    // Keep only non-AQE entries from existing config
    const userEntries = Array.isArray(existing)
      ? existing.filter((entry) => !isAqeHookEntry(entry))
      : [];

    // New AQE hooks go after user hooks (except PreToolUse guard which should be first)
    merged[hookType] = [...newEntries, ...userEntries];
  }

  // Preserve hook types that are not in our new config (user's custom hook types)
  for (const [hookType, hookArray] of Object.entries(existingHooks)) {
    if (!merged[hookType]) {
      // This hook type isn't one we manage — keep it as-is
      merged[hookType] = hookArray;
    }
  }

  return merged;
}

/**
 * Generate the full set of AQE environment variables for settings.json.
 */
export function generateAqeEnvVars(config: AQEInitConfig): Record<string, string> {
  const domains = config.domains?.enabled || [];

  return {
    AQE_MEMORY_PATH: '.agentic-qe/memory.db',
    AQE_MEMORY_ENABLED: 'true',
    AQE_LEARNING_ENABLED: config.learning?.enabled ? 'true' : 'false',
    AQE_V3_MODE: 'true',
    AQE_V3_DDD_ENABLED: 'true',
    AQE_V3_DOMAINS: domains.join(','),
    AQE_V3_SWARM_SIZE: String(config.agents?.maxConcurrent ?? 15),
    AQE_V3_TOPOLOGY: 'hierarchical',
    AQE_V3_SUBLINEAR_ENABLED: 'true',
    AQE_V3_HNSW_ENABLED: config.learning?.hnswConfig ? 'true' : 'false',
    AQE_V3_HOOKS_ENABLED: 'true',
    AQE_V3_HOOK_BRIDGE: '.claude/hooks/v3-qe-bridge.sh',
    AQE_V3_DOMAIN_WORKERS: '.claude/hooks/v3-domain-workers.json',
    AQE_V3_AISP_ENABLED: 'true',
    AQE_V3_REASONING_BANK: '.agentic-qe/memory.db',
    AQE_V3_PATTERN_PROMOTION_THRESHOLD: String(config.learning?.promotionThreshold ?? 3),
    AQE_V3_SUCCESS_RATE_THRESHOLD: String(config.learning?.qualityThreshold ?? 0.7),
  };
}

/**
 * Generate v3-specific settings sections for settings.json.
 * These sections enable the self-learning system, status line, and permissions.
 */
export function generateV3SettingsSections(config: AQEInitConfig): Record<string, unknown> {
  const domains = config.domains?.enabled || [];

  return {
    aqe: {
      version: config.version ?? '3.0.0',
      initialized: new Date().toISOString(),
      hooksConfigured: true,
    },
    statusLine: {
      type: 'command',
      command: 'node .claude/helpers/statusline-v3.cjs 2>/dev/null || .claude/statusline-v3.sh 2>/dev/null || echo "▊ Agentic QE v3"',
      refreshMs: 5000,
      enabled: true,
    },
    permissions: {
      allow: [
        'Bash(npx claude-flow:*)',
        'Bash(npx @claude-flow/cli:*)',
        'mcp__claude-flow__:*',
        'mcp__agentic_qe__*',
      ],
      deny: [
        'Bash(rm -rf /)',
      ],
    },
    includeCoAuthoredBy: true,
    v3Configuration: {
      domains: {
        total: domains.length,
        names: domains,
      },
      swarm: {
        totalAgents: config.agents?.maxConcurrent ?? 15,
        topology: 'hierarchical',
        coordination: 'queen-led',
      },
    },
    v3Learning: {
      enabled: config.learning?.enabled ?? true,
      reasoningBank: {
        dbPath: '.agentic-qe/memory.db',
        enableHNSW: !!config.learning?.hnswConfig,
      },
      patternPromotion: {
        threshold: config.learning?.promotionThreshold ?? 3,
        successRateMin: config.learning?.qualityThreshold ?? 0.7,
      },
    },
  };
}
