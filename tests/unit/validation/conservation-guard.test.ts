/**
 * Tests for the conservation guard diff core (ADR-114). Durable: assert the
 * additive-passes / removal-breaks / deprecation-exempts contract, independent
 * of implementation details.
 */

import { describe, it, expect } from 'vitest';
import { diffSurface, aggregate, formatReport } from '../../../src/validation/conservation-guard';

describe('diffSurface', () => {
  it('passes when a surface only gains entries (additive change)', () => {
    const d = diffSurface('cli', ['a', 'b'], ['a', 'b', 'c']);
    expect(d.added).toEqual(['c']);
    expect(d.removedBreaking).toEqual([]);
    expect(d.clean).toBe(true);
  });

  it('flags a removal/rename as breaking', () => {
    const d = diffSurface('cli', ['a', 'b'], ['a']);
    expect(d.removedBreaking).toEqual(['b']);
    expect(d.clean).toBe(false);
  });

  it('exempts a removal that is in the deprecation registry', () => {
    const d = diffSurface('cli', ['a', 'b'], ['a'], ['b']);
    expect(d.removedBreaking).toEqual([]);
    expect(d.removedDeprecated).toEqual(['b']);
    expect(d.clean).toBe(true);
  });

  it('treats a rename as a removal + an addition (breaking on the old name)', () => {
    const d = diffSurface('cli', ['old-name'], ['new-name']);
    expect(d.removedBreaking).toEqual(['old-name']);
    expect(d.added).toEqual(['new-name']);
    expect(d.clean).toBe(false);
  });

  it('is clean for an identical surface', () => {
    expect(diffSurface('cli', ['a', 'b'], ['b', 'a']).clean).toBe(true);
  });
});

describe('aggregate', () => {
  it('is clean only when every surface is clean', () => {
    const ok = aggregate([diffSurface('cli', ['a'], ['a']), diffSurface('schema', ['x'], ['x', 'y'])]);
    expect(ok.clean).toBe(true);
    expect(ok.breakingCount).toBe(0);

    const bad = aggregate([diffSurface('cli', ['a', 'b'], ['a']), diffSurface('schema', ['x'], ['x'])]);
    expect(bad.clean).toBe(false);
    expect(bad.breakingCount).toBe(1);
  });
});

describe('formatReport', () => {
  it('names breaking removals so the CI log is actionable', () => {
    const out = formatReport(aggregate([diffSurface('mcp', ['tool_a', 'tool_b'], ['tool_a'])]));
    expect(out).toMatch(/BREAKING/);
    expect(out).toContain('tool_b');
  });
});
