// Unit tests for the ADR-115 dependency-security primitives.
// Covers the pure, network-free logic: npm-audit parsing, severity gating, and
// the optional-dependency drop guard (the Dependabot failure mode). The npm-
// shelling entrypoints (runConsumerAudit / main) are exercised by the workflows,
// not here — these tests stay hermetic.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs sibling scripts, no type decls
import { parseAudit, blockingFindings, SEVERITY_RANK } from '../../../scripts/dependency-audit.mjs';
// @ts-expect-error — .mjs sibling scripts, no type decls
import { lockVersions, presentOptionals } from '../../../scripts/dependency-update.mjs';

// A minimal slice of the npm v7+ `npm audit --json` schema.
const AUDIT_JSON = JSON.stringify({
  vulnerabilities: {
    '@grpc/grpc-js': {
      severity: 'high',
      range: '1.14.0 - 1.14.3',
      fixAvailable: true, // in-range fix exists
      via: [{ title: 'malformed request crash', url: 'https://github.com/advisories/GHSA-5375-pq7m-f5r2', severity: 'high', range: '>=1.14.0 <1.14.4' }],
    },
    '@opentelemetry/core': {
      severity: 'moderate',
      range: '<2.8.0',
      fixAvailable: { name: '@opentelemetry/core', version: '2.8.0', isSemVerMajor: true }, // breaking
      via: [{ title: 'W3C Baggage unbounded memory', url: 'https://example/otel', severity: 'moderate', range: '<2.8.0' }],
    },
  },
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 1, critical: 0, total: 2 } },
});

describe('parseAudit', () => {
  it('should_flattenVulnerabilities_when_givenNpmV7Schema', () => {
    const { ok, findings, totals } = parseAudit(AUDIT_JSON);
    expect(ok).toBe(true);
    expect(findings).toHaveLength(2);
    expect(totals.high).toBe(1);
  });

  it('should_mapFixAvailableTrue_to_inRange', () => {
    const { findings } = parseAudit(AUDIT_JSON);
    const grpc = findings.find((f: any) => f.name === '@grpc/grpc-js');
    expect(grpc.fixAvailable).toBe('in-range');
  });

  it('should_mapFixAvailableObject_to_breaking', () => {
    const { findings } = parseAudit(AUDIT_JSON);
    const otel = findings.find((f: any) => f.name === '@opentelemetry/core');
    expect(otel.fixAvailable).toBe('breaking');
  });

  it('should_returnNotOk_when_givenUnparsableOutput', () => {
    expect(parseAudit('not json').ok).toBe(false);
  });
});

describe('blockingFindings', () => {
  it('should_excludeModerate_when_gateIsHigh', () => {
    const { findings } = parseAudit(AUDIT_JSON);
    const blocking = blockingFindings(findings, 'high');
    expect(blocking.map((f: any) => f.name)).toEqual(['@grpc/grpc-js']);
  });

  it('should_includeModerate_when_gateIsModerate', () => {
    const { findings } = parseAudit(AUDIT_JSON);
    expect(blockingFindings(findings, 'moderate')).toHaveLength(2);
  });

  it('should_sortHighestSeverityFirst', () => {
    const { findings } = parseAudit(AUDIT_JSON);
    const blocking = blockingFindings(findings, 'low');
    expect(SEVERITY_RANK[blocking[0].severity]).toBeGreaterThanOrEqual(SEVERITY_RANK[blocking[1].severity]);
  });
});

describe('lockVersions', () => {
  it('should_mapPathToResolvedVersion', () => {
    const lock = JSON.stringify({ packages: { 'node_modules/x': { version: '1.0.0' }, 'node_modules/y': { version: '2.0.0' } } });
    const v = lockVersions(lock);
    expect(v.get('node_modules/x')).toBe('1.0.0');
    expect(v.get('node_modules/y')).toBe('2.0.0');
  });
});

describe('optional-dependency drop guard', () => {
  const guard = new Set(['@ruvector/gnn-linux-x64-gnu', 'hnswlib-node', 'rvlite']);

  it('should_detectAllOptionalsPresent_inHealthyLock', () => {
    const versions = lockVersions(JSON.stringify({
      packages: {
        'node_modules/@ruvector/gnn-linux-x64-gnu': { version: '0.1.25' },
        'node_modules/hnswlib-node': { version: '3.0.0' },
        'node_modules/rvlite': { version: '0.2.0' },
      },
    }));
    expect(presentOptionals(versions, guard)).toEqual(guard);
  });

  it('should_surfaceDroppedOptional_when_dependabotStylePruneOccurs', () => {
    // Before: all three optional platform deps present.
    const before = presentOptionals(lockVersions(JSON.stringify({
      packages: {
        'node_modules/@ruvector/gnn-linux-x64-gnu': { version: '0.1.25' },
        'node_modules/hnswlib-node': { version: '3.0.0' },
        'node_modules/rvlite': { version: '0.2.0' },
      },
    })), guard);
    // After: the native @ruvector binary was pruned (the Dependabot bug).
    const after = presentOptionals(lockVersions(JSON.stringify({
      packages: {
        'node_modules/hnswlib-node': { version: '3.0.0' },
        'node_modules/rvlite': { version: '0.2.0' },
      },
    })), guard);

    const dropped = [...before].filter((n) => !after.has(n));
    expect(dropped).toEqual(['@ruvector/gnn-linux-x64-gnu']);
  });

  it('should_matchNestedNodeModulesPaths', () => {
    const versions = lockVersions(JSON.stringify({
      packages: { 'node_modules/ruvector/node_modules/rvlite': { version: '0.2.0' } },
    }));
    expect(presentOptionals(versions, guard).has('rvlite')).toBe(true);
  });
});
