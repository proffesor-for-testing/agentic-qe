/**
 * `aqe upgrade` — read-only advisory
 *
 * Detects which optional native bindings load on this platform and prints a
 * report with recommendations. Does NOT modify feature flags, env vars, or
 * config files — it only tells the user what they'd gain by installing the
 * missing optional deps.
 *
 * Related: issue #383 item 2.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'node:module';
import { platform, arch } from 'node:os';

import { getRuVectorFeatureFlags } from '../../integrations/ruvector/feature-flags.js';

// ============================================================================
// Public types
// ============================================================================

export type LoadStatus = 'loaded' | 'missing' | 'required-missing';

export interface NativeCheck {
  /** npm package name as it appears in package.json */
  readonly packageName: string;
  /** Human-readable role */
  readonly role: string;
  /** What the fallback looks like when missing (not applicable for required deps) */
  readonly fallback: string;
  /** Feature flag(s) this native affects (informational) */
  readonly affectsFlags: readonly string[];
  /** Whether missing is fatal or just degrades performance */
  readonly required: boolean;
}

export interface NativeResult extends NativeCheck {
  readonly status: LoadStatus;
  /** Error message if the load failed (missing means MODULE_NOT_FOUND; other errors get surfaced). */
  readonly loadError?: string;
}

export interface EnvOverride {
  readonly envVar: string;
  readonly value: string;
  readonly flagName: string;
}

export interface Recommendation {
  readonly severity: 'info' | 'warn' | 'error';
  readonly message: string;
  /** Copy-paste install command, when relevant. */
  readonly action?: string;
}

export interface UpgradeReport {
  readonly aqeVersion: string;
  readonly platform: {
    readonly os: string;
    readonly arch: string;
    readonly node: string;
  };
  readonly natives: readonly NativeResult[];
  readonly flags: {
    readonly useRVFPatternStore: boolean;
    readonly useSublinearSolver: boolean;
    readonly useNativeHNSW: boolean;
    readonly useGraphMAEEmbeddings: boolean;
    readonly useQEFlashAttention: boolean;
  };
  readonly envOverrides: readonly EnvOverride[];
  readonly recommendations: readonly Recommendation[];
  readonly summary: {
    readonly requiredOk: boolean;
    readonly optionalMissingCount: number;
    readonly optionalLoadedCount: number;
  };
}

// ============================================================================
// Native catalog
// ============================================================================

/**
 * The set of packages `aqe upgrade` inspects. Order controls the report
 * rendering order.
 */
export const NATIVE_CATALOG: readonly NativeCheck[] = [
  {
    packageName: 'better-sqlite3',
    role: 'SQLite storage (required — memory.db, patterns, audit)',
    fallback: 'n/a — required',
    affectsFlags: [],
    required: true,
  },
  {
    packageName: 'web-tree-sitter',
    role: 'Tree-sitter WASM parser runtime (required — code intelligence)',
    fallback: 'n/a — required',
    affectsFlags: [],
    required: true,
  },
  {
    packageName: 'hnswlib-node',
    role: 'Canonical HNSW vector index (default since ADR-090)',
    fallback: 'ProgressiveHnswBackend (JS) — correct but slower on large codebases',
    affectsFlags: ['useNativeHNSW'],
    required: false,
  },
  {
    packageName: '@ruvector/rvf-node',
    role: 'Persistent HNSW pattern store + RVF brain export format',
    fallback: 'SQLite-backed HNSW + JSONL brain export',
    affectsFlags: ['useRVFPatternStore'],
    required: false,
  },
  {
    packageName: '@ruvector/solver-node',
    role: 'Sublinear PageRank on the pattern citation graph',
    fallback: 'TypeScript power iteration — O(n·m) (practical cap ≈ 50K nodes)',
    affectsFlags: ['useSublinearSolver'],
    required: false,
  },
  {
    packageName: '@ruvector/attention',
    role: 'Flash Attention with SIMD acceleration',
    fallback: 'Plain attention — 2.5–7× slower on large sequences',
    affectsFlags: ['useQEFlashAttention'],
    required: false,
  },
  {
    packageName: '@ruvector/gnn',
    role: 'GraphMAE native acceleration',
    fallback: 'TypeScript GraphMAE — correct but slower',
    affectsFlags: ['useGraphMAEEmbeddings'],
    required: false,
  },
];

// ============================================================================
// Detection
// ============================================================================

export type LoadProbe = (packageName: string) => { ok: true } | { ok: false; error: Error };

/** Default probe — uses a CJS require relative to this module's location. */
export function createDefaultLoadProbe(): LoadProbe {
  const req = createRequire(import.meta.url);
  return (packageName: string) => {
    try {
      req(packageName);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
  };
}

export function detectNatives(
  catalog: readonly NativeCheck[],
  probe: LoadProbe,
): NativeResult[] {
  return catalog.map<NativeResult>((check) => {
    const result = probe(check.packageName);
    if (result.ok) {
      return { ...check, status: 'loaded' };
    }
    const missingModule = isModuleNotFound(result.error);
    const status: LoadStatus = check.required
      ? 'required-missing'
      : missingModule
        ? 'missing'
        : 'missing';
    return { ...check, status, loadError: result.error.message };
  });
}

function isModuleNotFound(err: Error): boolean {
  return (err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND';
}

// ============================================================================
// Environment overrides
// ============================================================================

/**
 * Map of RUVECTOR_* env vars → feature flag names that aqe upgrade cares about.
 * Only includes flags tied to optional natives — the full list is in
 * feature-flags.ts.
 */
const ENV_VAR_TO_FLAG: Record<string, string> = {
  RUVECTOR_USE_RVF_PATTERN_STORE: 'useRVFPatternStore',
  RUVECTOR_USE_SUBLINEAR_SOLVER: 'useSublinearSolver',
  RUVECTOR_USE_NATIVE_HNSW: 'useNativeHNSW',
  RUVECTOR_USE_GNN_INDEX: 'useQEGNNIndex',
  RUVECTOR_USE_FLASH_ATTENTION: 'useQEFlashAttention',
  RUVECTOR_USE_GRAPH_MAE_EMBEDDINGS: 'useGraphMAEEmbeddings',
};

export function readEnvOverrides(env: NodeJS.ProcessEnv): EnvOverride[] {
  const out: EnvOverride[] = [];
  for (const [envVar, flagName] of Object.entries(ENV_VAR_TO_FLAG)) {
    const v = env[envVar];
    if (v !== undefined) out.push({ envVar, value: v, flagName });
  }
  return out;
}

// ============================================================================
// Recommendation rules
// ============================================================================

interface RecommendationInput {
  readonly natives: readonly NativeResult[];
  readonly flags: UpgradeReport['flags'];
  readonly envOverrides: readonly EnvOverride[];
}

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const recs: Recommendation[] = [];
  const nativeByName = new Map(input.natives.map((n) => [n.packageName, n]));

  // Missing required deps are a hard error.
  for (const n of input.natives) {
    if (n.status === 'required-missing') {
      recs.push({
        severity: 'error',
        message: `Required dependency missing: ${n.packageName} — ${n.role}`,
        action: `npm install ${n.packageName}`,
      });
    }
  }

  // Missing optional deps: suggest install, note fallback.
  for (const n of input.natives) {
    if (n.status === 'missing' && !n.required) {
      recs.push({
        severity: 'warn',
        message: `Optional native missing: ${n.packageName} — falls back to ${n.fallback}`,
        action: `npm install ${n.packageName}`,
      });
    }
  }

  // Env override conflicts: user forced a flag ON but the native isn't loadable.
  const flagByName: Record<string, boolean | undefined> = { ...input.flags };
  for (const override of input.envOverrides) {
    const natives = input.natives.filter((n) => n.affectsFlags.includes(override.flagName));
    const anyLoaded = natives.some((n) => n.status === 'loaded');
    const wantsOn = override.value === 'true' || override.value === '1';

    if (wantsOn && natives.length > 0 && !anyLoaded) {
      const missing = natives.map((n) => n.packageName).join(', ');
      recs.push({
        severity: 'warn',
        message:
          `${override.envVar}=${override.value} requests flag ${override.flagName}=true, ` +
          `but required native(s) not loaded: ${missing}. The flag will silently fall back.`,
        action: natives[0] ? `npm install ${natives[0].packageName}` : undefined,
      });
    }
  }
  void flagByName; // reserved for future rules
  void nativeByName;

  // All optionals loaded → positive-confirmation info line.
  const optionalMissing = input.natives.filter(
    (n) => !n.required && n.status === 'missing',
  );
  if (optionalMissing.length === 0 && input.natives.every((n) => n.status !== 'required-missing')) {
    recs.push({
      severity: 'info',
      message: 'All recommended native bindings are loaded — no action required.',
    });
  }

  return recs;
}

// ============================================================================
// Report builder
// ============================================================================

export interface BuildReportInput {
  readonly aqeVersion: string;
  readonly probe: LoadProbe;
  readonly env: NodeJS.ProcessEnv;
  readonly flags: UpgradeReport['flags'];
}

export function buildReport(input: BuildReportInput): UpgradeReport {
  const natives = detectNatives(NATIVE_CATALOG, input.probe);
  const envOverrides = readEnvOverrides(input.env);
  const recommendations = buildRecommendations({
    natives,
    flags: input.flags,
    envOverrides,
  });

  const optionalLoadedCount = natives.filter((n) => !n.required && n.status === 'loaded').length;
  const optionalMissingCount = natives.filter((n) => !n.required && n.status === 'missing').length;
  const requiredOk = natives.filter((n) => n.required).every((n) => n.status === 'loaded');

  return {
    aqeVersion: input.aqeVersion,
    platform: {
      os: platform(),
      arch: arch(),
      node: process.version,
    },
    natives,
    flags: input.flags,
    envOverrides,
    recommendations,
    summary: {
      requiredOk,
      optionalMissingCount,
      optionalLoadedCount,
    },
  };
}

// ============================================================================
// Exit-code policy
// ============================================================================

export function exitCodeFor(report: UpgradeReport, strict: boolean): number {
  if (!report.summary.requiredOk) return 2;
  if (strict && report.summary.optionalMissingCount > 0) return 1;
  return 0;
}

// ============================================================================
// Rendering
// ============================================================================

export function renderReportHuman(report: UpgradeReport): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  push('');
  push(chalk.bold.blue('  aqe upgrade — native binding report'));
  push(chalk.gray('  ──────────────────────────────────────'));
  push('');
  push(`  AQE:       ${chalk.cyan(report.aqeVersion)}`);
  push(`  Platform:  ${chalk.cyan(`${report.platform.os} ${report.platform.arch}`)}`);
  push(`  Node:      ${chalk.cyan(report.platform.node)}`);

  push('');
  push(chalk.blue('  Native bindings:'));
  for (const n of report.natives) {
    const status = statusBadge(n.status);
    push(`    ${status} ${chalk.bold(n.packageName.padEnd(28))} ${chalk.gray(n.role)}`);
    if (n.status !== 'loaded' && n.loadError) {
      // Node's MODULE_NOT_FOUND error message carries a multi-line "Require
      // stack:" trailer that adds no signal here — keep the first line only.
      push(`        ${chalk.gray(n.loadError.split('\n')[0])}`);
    }
  }

  push('');
  push(chalk.blue('  Flag state (after env overrides):'));
  const flagEntries = Object.entries(report.flags);
  for (const [name, value] of flagEntries) {
    const badge = value ? chalk.green('on ') : chalk.yellow('off');
    push(`    ${badge}  ${name}`);
  }

  if (report.envOverrides.length > 0) {
    push('');
    push(chalk.blue('  Env overrides in effect:'));
    for (const o of report.envOverrides) {
      push(`    ${chalk.cyan(o.envVar)}=${chalk.cyan(o.value)}  ${chalk.gray(`→ ${o.flagName}`)}`);
    }
  }

  push('');
  push(chalk.blue('  Recommendations:'));
  if (report.recommendations.length === 0) {
    push(chalk.gray('    (none)'));
  } else {
    for (const rec of report.recommendations) {
      const prefix = recommendationPrefix(rec.severity);
      push(`    ${prefix} ${rec.message}`);
      if (rec.action) push(`        ${chalk.gray('→')} ${chalk.cyan(rec.action)}`);
    }
  }

  push('');
  const okBadge = report.summary.requiredOk ? chalk.green('OK') : chalk.red('FAIL');
  push(
    `  Summary:   required ${okBadge}    ` +
      `optional loaded ${chalk.cyan(report.summary.optionalLoadedCount)} / ` +
      `${chalk.cyan(report.summary.optionalLoadedCount + report.summary.optionalMissingCount)}`,
  );
  push('');

  return lines.join('\n');
}

function statusBadge(status: LoadStatus): string {
  switch (status) {
    case 'loaded':
      return chalk.green('✓');
    case 'missing':
      return chalk.yellow('…');
    case 'required-missing':
      return chalk.red('✗');
  }
}

function recommendationPrefix(severity: Recommendation['severity']): string {
  switch (severity) {
    case 'info':
      return chalk.green('✓');
    case 'warn':
      return chalk.yellow('!');
    case 'error':
      return chalk.red('✗');
  }
}

// ============================================================================
// Commander wiring
// ============================================================================

interface UpgradeCliOptions {
  json?: boolean;
  strict?: boolean;
}

export function createUpgradeCommand(cleanupAndExit: (code: number) => Promise<never>): Command {
  const cmd = new Command('upgrade')
    .description('Detect optional native bindings and recommend install / flag changes (read-only)')
    .option('--json', 'Emit the report as JSON to stdout', false)
    .option('--strict', 'Exit non-zero if any recommended optional native is missing', false)
    .action(async (options: UpgradeCliOptions) => {
      const aqeVersion = resolveAqeVersion();
      const rvFlags = getRuVectorFeatureFlags();

      const report = buildReport({
        aqeVersion,
        probe: createDefaultLoadProbe(),
        env: process.env,
        flags: {
          useRVFPatternStore: rvFlags.useRVFPatternStore,
          useSublinearSolver: rvFlags.useSublinearSolver,
          useNativeHNSW: rvFlags.useNativeHNSW,
          useGraphMAEEmbeddings: rvFlags.useGraphMAEEmbeddings,
          useQEFlashAttention: rvFlags.useQEFlashAttention,
        },
      });

      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      } else {
        process.stdout.write(renderReportHuman(report));
      }

      await cleanupAndExit(exitCodeFor(report, options.strict === true));
    });

  return cmd;
}

// ============================================================================
// Helpers
// ============================================================================

function resolveAqeVersion(): string {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req('../../../package.json') as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
