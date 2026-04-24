/**
 * Unit tests for `aqe upgrade` — pure logic.
 *
 * The goal is to drive detection / recommendation rules via injected probes
 * and env maps so they can be exhaustively exercised without touching real
 * native deps.
 */

import { describe, it, expect } from 'vitest';

import {
  buildRecommendations,
  buildReport,
  detectNatives,
  exitCodeFor,
  readEnvOverrides,
  NATIVE_CATALOG,
  type LoadProbe,
  type NativeCheck,
  type UpgradeReport,
} from '../../src/cli/commands/upgrade.js';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function probeWith(loaded: readonly string[], missing: readonly string[] = []): LoadProbe {
  const allMissing = new Set(missing);
  const allLoaded = new Set(loaded);
  return (name) => {
    if (allLoaded.has(name)) return { ok: true };
    if (allMissing.has(name)) {
      const err = new Error(`Cannot find module '${name}'`) as NodeJS.ErrnoException;
      err.code = 'MODULE_NOT_FOUND';
      return { ok: false, error: err };
    }
    // Default for unlisted packages: treat as missing so we don't accidentally
    // depend on the local machine.
    const err = new Error(`Cannot find module '${name}'`) as NodeJS.ErrnoException;
    err.code = 'MODULE_NOT_FOUND';
    return { ok: false, error: err };
  };
}

const ALL_PACKAGES = NATIVE_CATALOG.map((c) => c.packageName);
const REQUIRED_PACKAGES = NATIVE_CATALOG.filter((c) => c.required).map((c) => c.packageName);

const HAPPY_FLAGS: UpgradeReport['flags'] = {
  useRVFPatternStore: true,
  useSublinearSolver: true,
  useNativeHNSW: true,
  useGraphMAEEmbeddings: true,
  useQEFlashAttention: true,
};

// ----------------------------------------------------------------------------
// detectNatives
// ----------------------------------------------------------------------------

describe('detectNatives', () => {
  it('marks packages that load as "loaded"', () => {
    const results = detectNatives(NATIVE_CATALOG, probeWith(ALL_PACKAGES));
    expect(results.every((r) => r.status === 'loaded')).toBe(true);
  });

  it('marks required packages as "required-missing" when absent', () => {
    const results = detectNatives(NATIVE_CATALOG, probeWith([]));
    for (const r of results) {
      if (r.required) expect(r.status).toBe('required-missing');
      else expect(r.status).toBe('missing');
    }
  });

  it('captures the load error message verbatim', () => {
    const results = detectNatives(NATIVE_CATALOG, probeWith([]));
    for (const r of results) {
      expect(r.loadError).toMatch(/Cannot find module/);
    }
  });
});

// ----------------------------------------------------------------------------
// readEnvOverrides
// ----------------------------------------------------------------------------

describe('readEnvOverrides', () => {
  it('returns an empty list when no RUVECTOR_* env vars are set', () => {
    expect(readEnvOverrides({})).toEqual([]);
  });

  it('picks up known RUVECTOR_* overrides and maps them to flag names', () => {
    const overrides = readEnvOverrides({
      RUVECTOR_USE_RVF_PATTERN_STORE: 'true',
      RUVECTOR_USE_SUBLINEAR_SOLVER: 'false',
      UNRELATED_VAR: 'hello',
    });
    const envVars = overrides.map((o) => o.envVar).sort();
    expect(envVars).toEqual([
      'RUVECTOR_USE_RVF_PATTERN_STORE',
      'RUVECTOR_USE_SUBLINEAR_SOLVER',
    ]);
    const rvf = overrides.find((o) => o.envVar === 'RUVECTOR_USE_RVF_PATTERN_STORE');
    expect(rvf?.flagName).toBe('useRVFPatternStore');
    expect(rvf?.value).toBe('true');
  });
});

// ----------------------------------------------------------------------------
// buildRecommendations
// ----------------------------------------------------------------------------

describe('buildRecommendations', () => {
  it('emits a positive info line when nothing is missing', () => {
    const natives = detectNatives(NATIVE_CATALOG, probeWith(ALL_PACKAGES));
    const recs = buildRecommendations({ natives, flags: HAPPY_FLAGS, envOverrides: [] });
    expect(recs.some((r) => r.severity === 'info' && /no action/i.test(r.message))).toBe(true);
    expect(recs.every((r) => r.severity !== 'error')).toBe(true);
  });

  it('reports error severity for missing required deps with an install action', () => {
    // Load only optionals, miss the required ones.
    const optionals = NATIVE_CATALOG.filter((c) => !c.required).map((c) => c.packageName);
    const natives = detectNatives(NATIVE_CATALOG, probeWith(optionals));
    const recs = buildRecommendations({ natives, flags: HAPPY_FLAGS, envOverrides: [] });

    for (const required of REQUIRED_PACKAGES) {
      const match = recs.find(
        (r) => r.severity === 'error' && r.message.includes(required),
      );
      expect(match).toBeDefined();
      expect(match?.action).toBe(`npm install ${required}`);
    }
  });

  it('emits warn severity per missing optional with install action', () => {
    // Load only required, miss all optionals.
    const natives = detectNatives(NATIVE_CATALOG, probeWith(REQUIRED_PACKAGES));
    const recs = buildRecommendations({ natives, flags: HAPPY_FLAGS, envOverrides: [] });

    const optionalCatalog = NATIVE_CATALOG.filter((c: NativeCheck) => !c.required);
    for (const opt of optionalCatalog) {
      const match = recs.find(
        (r) => r.severity === 'warn' && r.message.includes(opt.packageName),
      );
      expect(match, `missing warning for ${opt.packageName}`).toBeDefined();
      expect(match?.action).toBe(`npm install ${opt.packageName}`);
    }
  });

  it('warns when RUVECTOR_* forces a flag on but the native is missing', () => {
    const natives = detectNatives(NATIVE_CATALOG, probeWith(REQUIRED_PACKAGES));
    const recs = buildRecommendations({
      natives,
      flags: HAPPY_FLAGS,
      envOverrides: [
        { envVar: 'RUVECTOR_USE_RVF_PATTERN_STORE', value: 'true', flagName: 'useRVFPatternStore' },
      ],
    });

    const conflict = recs.find(
      (r) =>
        r.severity === 'warn' &&
        r.message.includes('RUVECTOR_USE_RVF_PATTERN_STORE') &&
        r.message.includes('silently fall back'),
    );
    expect(conflict).toBeDefined();
  });

  it('does not emit a conflict warning when the flag override value is "false"', () => {
    const natives = detectNatives(NATIVE_CATALOG, probeWith(REQUIRED_PACKAGES));
    const recs = buildRecommendations({
      natives,
      flags: HAPPY_FLAGS,
      envOverrides: [
        { envVar: 'RUVECTOR_USE_RVF_PATTERN_STORE', value: 'false', flagName: 'useRVFPatternStore' },
      ],
    });
    const conflict = recs.find((r) => r.message.includes('silently fall back'));
    expect(conflict).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------
// buildReport + exitCodeFor
// ----------------------------------------------------------------------------

describe('buildReport', () => {
  it('summarises required vs optional counts', () => {
    const report = buildReport({
      aqeVersion: '9.9.9',
      probe: probeWith(REQUIRED_PACKAGES),
      env: {},
      flags: HAPPY_FLAGS,
    });
    const optionalCount = NATIVE_CATALOG.filter((c) => !c.required).length;
    expect(report.summary.requiredOk).toBe(true);
    expect(report.summary.optionalLoadedCount).toBe(0);
    expect(report.summary.optionalMissingCount).toBe(optionalCount);
  });

  it('reports requiredOk=false when a required dep fails to load', () => {
    // Only load optionals.
    const optionals = NATIVE_CATALOG.filter((c) => !c.required).map((c) => c.packageName);
    const report = buildReport({
      aqeVersion: '9.9.9',
      probe: probeWith(optionals),
      env: {},
      flags: HAPPY_FLAGS,
    });
    expect(report.summary.requiredOk).toBe(false);
  });

  it('carries aqeVersion, platform + node through to the report', () => {
    const report = buildReport({
      aqeVersion: '9.9.9',
      probe: probeWith(ALL_PACKAGES),
      env: {},
      flags: HAPPY_FLAGS,
    });
    expect(report.aqeVersion).toBe('9.9.9');
    expect(report.platform.os).toBeTruthy();
    expect(report.platform.arch).toBeTruthy();
    expect(report.platform.node).toMatch(/^v/);
  });
});

describe('exitCodeFor', () => {
  const reportOk = (): UpgradeReport => buildReport({
    aqeVersion: 'x',
    probe: probeWith(ALL_PACKAGES),
    env: {},
    flags: HAPPY_FLAGS,
  });

  const reportOptionalMissing = (): UpgradeReport => buildReport({
    aqeVersion: 'x',
    probe: probeWith(REQUIRED_PACKAGES),
    env: {},
    flags: HAPPY_FLAGS,
  });

  const reportRequiredMissing = (): UpgradeReport => buildReport({
    aqeVersion: 'x',
    probe: probeWith([]),
    env: {},
    flags: HAPPY_FLAGS,
  });

  it('returns 0 when everything is loaded (strict or not)', () => {
    expect(exitCodeFor(reportOk(), false)).toBe(0);
    expect(exitCodeFor(reportOk(), true)).toBe(0);
  });

  it('returns 0 when optionals missing and strict=false', () => {
    expect(exitCodeFor(reportOptionalMissing(), false)).toBe(0);
  });

  it('returns 1 when optionals missing and strict=true', () => {
    expect(exitCodeFor(reportOptionalMissing(), true)).toBe(1);
  });

  it('returns 2 when required is missing (regardless of strict)', () => {
    expect(exitCodeFor(reportRequiredMissing(), false)).toBe(2);
    expect(exitCodeFor(reportRequiredMissing(), true)).toBe(2);
  });
});
