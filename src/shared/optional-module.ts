/**
 * Graceful optional-module loading (plan 05 / A9; ADR-150 pattern).
 *
 * AQE has many native/optional deps (@ruvector/{gnn,attention,sona,...},
 * hnswlib-node, rvlite) declared in `optionalDependencies`, so a platform without
 * a prebuilt binary (or a Dependabot-pruned lockfile) must DEGRADE, not crash.
 *
 * The hazard (AQE #528 lesson): the ad-hoc `try { require(x) } catch {}` scattered
 * across the wrappers swallows EVERY error — so a binary that is PRESENT but fails
 * to load (ABI mismatch, corrupt .node) is silently reported "unavailable",
 * masking a real failure. This helper degrades ONLY on genuine absence
 * (MODULE_NOT_FOUND) and RE-THROWS any other load error.
 */
import { createRequire } from 'node:module';

export interface OptionalModuleAvailable<T> {
  available: true;
  degraded: false;
  module: T;
}
export interface OptionalModuleDegraded {
  available: false;
  degraded: true;
  name: string;
  reason: string;
}
export type OptionalModuleResult<T> = OptionalModuleAvailable<T> | OptionalModuleDegraded;

const ABSENT_CODES = new Set(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND']);

/** True iff `err` means the module is genuinely NOT INSTALLED (vs. failed to load). */
export function isModuleAbsent(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code && ABSENT_CODES.has(e.code)) return true;
  // Some loaders throw a plain Error; fall back to the canonical message shape.
  return typeof e?.message === 'string' && /Cannot find module/.test(e.message);
}

const defaultRequire = createRequire(import.meta.url);

/**
 * Load an optional module. Returns `{available:true, module}` when present,
 * `{available:false, degraded:true}` when genuinely absent, and RE-THROWS on any
 * other load error (so real failures are never masked). Inject `req` for testing.
 */
export function loadOptionalModule<T = unknown>(
  name: string,
  req: NodeRequire = defaultRequire,
): OptionalModuleResult<T> {
  try {
    return { available: true, degraded: false, module: req(name) as T };
  } catch (err) {
    if (isModuleAbsent(err)) {
      return { available: false, degraded: true, name, reason: `optional module "${name}" not installed (running degraded)` };
    }
    throw err; // present but broken — do NOT mask a real failure (#528)
  }
}

/** Convenience: the module if available, else `undefined` (degradation is silent here). */
export function optionalModule<T = unknown>(name: string, req?: NodeRequire): T | undefined {
  const r = loadOptionalModule<T>(name, req);
  return r.available ? r.module : undefined;
}
