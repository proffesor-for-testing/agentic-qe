/**
 * Unit tests for nested-subagent provenance validation (ADR-101)
 *
 * Mirrors ruflo's ADR-147 P2 validation suite: propagation, omission,
 * depth=0 boundary, invalid id, negative / non-integer / >32 depth.
 */

import { describe, it, expect } from 'vitest';
import {
  parseNestingProvenance,
  MAX_NESTING_DEPTH,
} from '../../../../src/cli/commands/hooks-handlers/nesting-provenance';

describe('parseNestingProvenance', () => {
  it('should propagate parentAgentId and depth when both are supplied', () => {
    const result = parseNestingProvenance('qe-fleet-commander', '2');

    expect(result.error).toBeUndefined();
    expect(result.parentAgentId).toBe('qe-fleet-commander');
    expect(result.depth).toBe(2);
  });

  it('should omit both fields when neither is supplied (top-level lead)', () => {
    const result = parseNestingProvenance(undefined, undefined);

    expect(result.error).toBeUndefined();
    expect(result.parentAgentId).toBeUndefined();
    expect(result.depth).toBeUndefined();
  });

  it('should propagate depth=0 as 0, not coerce it to undefined', () => {
    const result = parseNestingProvenance(undefined, '0');

    expect(result.error).toBeUndefined();
    expect(result.depth).toBe(0);
  });

  it('should reject an invalid parentAgentId', () => {
    expect(parseNestingProvenance('bad id with spaces').error).toContain('parent-agent-id');
    expect(parseNestingProvenance('-starts-with-dash').error).toContain('parent-agent-id');
    expect(parseNestingProvenance('a'.repeat(129)).error).toContain('parent-agent-id');
    expect(parseNestingProvenance('semi;colon').error).toContain('parent-agent-id');
  });

  it('should reject negative depth', () => {
    const result = parseNestingProvenance(undefined, '-1');

    expect(result.error).toContain('>= 0');
  });

  it('should reject non-integer depth', () => {
    expect(parseNestingProvenance(undefined, '2.5').error).toContain('integer');
    expect(parseNestingProvenance(undefined, 'two').error).toContain('integer');
  });

  it('should reject depth above the defensive bound and accept the bound itself', () => {
    expect(parseNestingProvenance(undefined, '33').error).toContain('<= 32');
    expect(parseNestingProvenance(undefined, String(MAX_NESTING_DEPTH)).depth).toBe(32);
  });

  it('should accept identifiers with dots, colons, dashes and underscores', () => {
    const result = parseNestingProvenance('qe.fleet:commander_v3-1');

    expect(result.error).toBeUndefined();
    expect(result.parentAgentId).toBe('qe.fleet:commander_v3-1');
  });
});
