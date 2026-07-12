/**
 * Settings Merge Utilities
 *
 * Smart merge logic for .claude/settings.json that:
 * - Detects existing AQE/agentic-qe hooks by command pattern
 * - Replaces old AQE hooks with new ones (no duplicates)
 * - Preserves non-AQE hooks from the user's config
 * - Generates full env vars and v3 settings sections
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';

import type { AQEInitConfig } from './types.js';

/**
 * Create a one-time `.backup` of an existing settings.json before AQE modifies
 * it — mirroring the CLAUDE.md backup convention.
 *
 * The backup captures the pristine, pre-AQE file and is NOT overwritten on
 * subsequent re-inits, so the user's original settings are always recoverable.
 * No-op when the file does not exist yet (fresh install) or a backup already
 * exists. Failures are swallowed — a backup problem must never block init.
 *
 * @returns the backup path when a backup was written, otherwise null.
 */
export function backupSettingsFile(settingsPath: string): string | null {
  if (!existsSync(settingsPath)) return null;
  const backupPath = `${settingsPath}.backup`;
  if (existsSync(backupPath)) return null; // keep the pristine original
  try {
    writeFileSync(backupPath, readFileSync(settingsPath, 'utf-8'), 'utf-8');
    return backupPath;
  } catch {
    return null;
  }
}

// Patterns that identify a hook command as belonging to AQE.
//
// These MUST be specific to AQE's own hooks. They must NOT match hooks that
// other tools install (e.g. ruflo / claude-flow), otherwise re-running
// `aqe init` in a project that already ran `ruflo init` would strip the user's
// ruflo hooks. In particular:
//   - do NOT match on `.claude/helpers/` broadly — ruflo's hook-handler.cjs and
//     auto-memory-hook.mjs live there too (match AQE's own helpers by name)
//   - do NOT match on `ruflo` — those are the user's hooks, preserve them
const AQE_COMMAND_PATTERNS = [
  /\baqe\b/i,
  /\bagentic-qe\b/i,
  /\bnpx\s+agentic-qe\b/i,
  /\bnpx\s+@anthropics\/agentic-qe\b/i,
  /aqe-hook\.cjs/i,
  /brain-checkpoint\.cjs/i,
  /statusline-v3\.cjs/i,
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
 * Merge AQE's environment variables into a user's existing `env` block WITHOUT
 * clobbering values the user already set — including AQE_-prefixed ones.
 *
 * Re-running `aqe init` fills in any missing AQE env vars but leaves every
 * existing value untouched, so a user who intentionally flipped, say,
 * `AQE_LEARNING_ENABLED=false` keeps their choice. Non-AQE env vars are always
 * preserved. Returns a new object; inputs are not mutated.
 */
export function mergeAqeEnv(
  existingEnv: Record<string, string> | undefined,
  aqeEnv: Record<string, string>,
): Record<string, string> {
  // AQE defaults first, then existing values win on any key collision.
  return { ...aqeEnv, ...(existingEnv || {}) };
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
    AQE_V3_AISP_ENABLED: 'true',
    AQE_V3_REASONING_BANK: '.agentic-qe/memory.db',
    AQE_V3_PATTERN_PROMOTION_THRESHOLD: String(config.learning?.promotionThreshold ?? 3),
    AQE_V3_SUCCESS_RATE_THRESHOLD: String(config.learning?.qualityThreshold ?? 0.7),
  };
}

/**
 * Detect whether a `statusLine` block is one AQE generated (vs. a user's own).
 * AQE's status line invokes the statusline-v3.cjs helper (or falls back to the
 * "Agentic QE v3" banner). Anything else is treated as user-owned and preserved.
 */
export function isAqeStatusLine(statusLine: unknown): boolean {
  const cmd = (statusLine as { command?: string })?.command;
  return typeof cmd === 'string' && /statusline-v3\.cjs|Agentic QE v3/.test(cmd);
}

/**
 * Deep-merge `source` (AQE-owned values) onto `target` (whatever the user has):
 * plain-object subtrees merge recursively so a user's extra keys survive, while
 * AQE's values win on conflicting leaves. Arrays and primitives are replaced by
 * the AQE value (these sections are AQE-managed).
 */
function deepMergeOwned(target: unknown, source: unknown): unknown {
  if (!isPlainObject(target) || !isPlainObject(source)) return source;
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    out[key] = deepMergeOwned(out[key], value);
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Apply the generated v3 settings sections onto an existing settings object
 * WITHOUT clobbering configuration the user already set:
 *
 * - `_aqePermissions`: union-merge into `permissions.allow`, preserving the
 *   user's existing allow/deny entries (#362).
 * - `statusLine`: generic Claude Code setting — only written when absent or when
 *   the existing one is AQE's own (so a user's custom status line is preserved).
 * - `includeCoAuthoredBy`: generic Claude Code setting — only written when the
 *   user has not set it explicitly (respects an intentional `false`).
 * - `aqe` / `v3Configuration` / `v3Learning`: AQE-owned sections, deep-merged so
 *   AQE values are refreshed while any user-added keys survive.
 *
 * Mutates and returns `settings`.
 */
export function applyV3Sections(
  settings: Record<string, unknown>,
  sections: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(sections)) {
    if (key === '_aqePermissions') {
      const existingPerms = (settings.permissions as { allow?: string[]; deny?: string[] }) || {};
      const existingAllow = existingPerms.allow || [];
      const merged = [...new Set([...existingAllow, ...(value as string[])])];
      settings.permissions = { ...existingPerms, allow: merged };
    } else if (key === 'statusLine') {
      // Preserve a user's (or another tool's) custom status line.
      if (settings.statusLine === undefined || isAqeStatusLine(settings.statusLine)) {
        settings.statusLine = value;
      }
    } else if (key === 'includeCoAuthoredBy') {
      // Respect an explicit user choice; only set the default when unset.
      if (settings.includeCoAuthoredBy === undefined) {
        settings.includeCoAuthoredBy = value;
      }
    } else {
      // AQE-owned section — deep-merge so user additions are not dropped.
      settings[key] = deepMergeOwned(settings[key], value);
    }
  }
  return settings;
}

/**
 * Generate v3-specific settings sections for settings.json.
 * These sections enable the self-learning system, status line, and permissions.
 */
export function generateV3SettingsSections(config: AQEInitConfig, projectRoot?: string): Record<string, unknown> {
  const domains = config.domains?.enabled || [];
  return {
    aqe: {
      version: config.version ?? '3.0.0',
      initialized: new Date().toISOString(),
      hooksConfigured: true,
    },
    statusLine: {
      type: 'command',
      command: 'sh -c \'node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/statusline-v3.cjs" 2>/dev/null || echo "▊ Agentic QE v3"\'',
      refreshMs: 5000,
      enabled: true,
    },
    // permissions are union-merged in 07-hooks.ts — not set here to avoid overwriting user entries (#362)
    _aqePermissions: [
      'Bash(npx agentic-qe:*)',
      'Bash(npx @anthropics/agentic-qe:*)',
      'mcp__agentic-qe__*',
    ],
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
