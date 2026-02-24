/**
 * AQE OpenCode Plugin Configuration
 *
 * Zod schema for plugin configuration with sensible defaults.
 * All options can be overridden per-project in opencode.json.
 *
 * @module config
 */

import { z } from 'zod';

export const AQEPluginConfigSchema = z.object({
  /** Master enable/disable switch */
  enabled: z.boolean().default(true),

  /** Per-hook enable/disable toggles */
  hooks: z.object({
    onToolCallBefore: z.boolean().default(true),
    onToolCallAfter: z.boolean().default(true),
    onSessionPromptBefore: z.boolean().default(true),
    onSessionPromptAfter: z.boolean().default(true),
  }).default({}),

  /** Memory/persistence configuration */
  memory: z.object({
    /** Path to SQLite memory database */
    dbPath: z.string().default('.agentic-qe/memory.db'),
    /** Enable HNSW vector search for pattern matching */
    hnswEnabled: z.boolean().default(true),
  }).default({}),

  /** Guidance injection configuration */
  guidance: z.object({
    /** Max tokens for injected guidance (prevents prompt bloat) */
    maxTokens: z.number().min(0).max(10000).default(2000),
    /** Enable model routing hints based on complexity */
    enableRouting: z.boolean().default(true),
    /** Minimum confidence for pattern injection */
    minPatternConfidence: z.number().min(0).max(1).default(0.6),
  }).default({}),

  /** Active QE domains for pattern matching */
  domains: z.array(z.string()).default([
    'test-generation',
    'quality-assessment',
    'security',
    'coverage',
  ]),

  /** Safety configuration */
  safety: z.object({
    /** Block writes to .db files */
    blockDbWrites: z.boolean().default(true),
    /** Block dangerous bash commands */
    blockDangerousCommands: z.boolean().default(true),
    /** Dangerous command patterns (regex strings) */
    dangerousPatterns: z.array(z.string()).default([
      'rm\\s+-rf\\s+/',
      'rm\\s+-rf\\s+\\.',
      'drop\\s+table',
      'delete\\s+from',
      'truncate\\s+',
      'mkfs\\.',
      ':\\(\\)\\{\\s*:\\|:\\s*&\\s*\\}\\s*;\\s*:',
      'dd\\s+if=.*of=/dev/',
      'chmod\\s+-R\\s+777\\s+/',
    ]),
  }).default({}),

  /** Pattern promotion settings */
  patternPromotion: z.object({
    /** Number of successes before promoting a pattern */
    threshold: z.number().min(1).default(3),
    /** Minimum success rate for promotion */
    successRateMin: z.number().min(0).max(1).default(0.7),
  }).default({}),
});

export type AQEPluginConfig = z.infer<typeof AQEPluginConfigSchema>;
