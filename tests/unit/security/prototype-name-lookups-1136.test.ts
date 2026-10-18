/**
 * #1136: lookup tables keyed by a caller-supplied name (agent names, rule
 * versions, profile names, faker paths) matched members every object
 * inherits. `constructor` resolved to the Object function: an agent name
 * "mapped" to it, an acceptance-rule version "existed" and re-ran Object() as
 * the rule, and a CLI profile was accepted. Each now reads own entries only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { faker } from '@faker-js/faker';
import {
  getAgentDomain, getDeprecationWarning, isDeprecatedAgent, resolveAgentName, generateMigrationReport,
} from '../../../src/migration/agent-compat';
import {
  gateFingerprint, pathGateFingerprint, reExecuteGate, reExecutePathGate,
} from '../../../src/validation/gate-reexecute';
import { getAgentRoutingCategory } from '../../../src/shared/llm/router/agent-router-config';
import { createRuVectorCommand } from '../../../src/cli/commands/ruvector-commands';
import { TestDataGeneratorService } from '../../../src/domains/test-generation/services/test-data-generator';

afterEach(() => vi.restoreAllMocks());

describe('V2 agent name mapping (#1136)', () => {
  it('treats `constructor` as an unknown agent name', () => {
    expect(isDeprecatedAgent('constructor')).toBe(false);
    expect(resolveAgentName('constructor')).toBe('constructor');
    expect(getDeprecationWarning('toString')).toBe('');
    expect(getAgentDomain('constructor')).toBeNull();
    expect(generateMigrationReport(['constructor'])).toMatchObject({ needsMigration: [], unknown: ['constructor'] });
  });
});

describe('acceptance and promotion-path rules (#1136)', () => {
  it.each([
    ['gateFingerprint', () => gateFingerprint('constructor'), 'Unknown acceptance rule version'],
    ['reExecuteGate', () => reExecuteGate('constructor', {} as never), 'Unknown acceptance rule version'],
    ['pathGateFingerprint', () => pathGateFingerprint('toString'), 'Unknown promotion-path rule version'],
    ['reExecutePathGate', () => reExecutePathGate('constructor', {} as never), 'Unknown promotion-path rule version'],
  ])('%s refuses a rule version that only Object.prototype has', (_name, run, message) => {
    expect(run).toThrow(message);
  });
});

describe('agent routing category (#1136)', () => {
  it('routes the agent type `constructor` like any unknown type', () => {
    expect(getAgentRoutingCategory('constructor')).toBe(getAgentRoutingCategory('zz-unknown-agent'));
  });
});

describe('aqe ruvector flags --profile (#1136)', () => {
  it('refuses the profile name `constructor`', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code: number) => { throw new Error(`exit ${code}`); }) as never);

    expect(() => createRuVectorCommand().parse(['node', 'ruvector', 'flags', '--profile', 'constructor']))
      .toThrow('exit 1');
    expect(log.mock.calls.flat().join('\n')).toContain('Unknown profile: constructor');
  });
});

describe('test data faker paths (#1136)', () => {
  it('does not call an inherited member such as `toString` as a faker method', () => {
    const generator = Object.create(TestDataGeneratorService.prototype) as {
      callFakerMethod(f: typeof faker, path: string): unknown;
    };
    expect(String(generator.callFakerMethod(faker, 'toString'))).not.toMatch(/^\[object /);
    expect(typeof generator.callFakerMethod(faker, 'person.firstName')).toBe('string');
  });
});
