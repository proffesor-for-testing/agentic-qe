/**
 * Tests for ADR-127 / issue #628 — external provider registration.
 *
 * The provider set was a closed enumeration: `BuiltinProviderType`, a `switch`
 * in `ProviderManager.createProvider()`, and a hand-maintained
 * `RUNTIME_CONSTRUCTIBLE_PROVIDERS` allowlist. A downstream integrator could
 * select any provider AQE ships but could not introduce one, forcing a choice
 * between forking the enum and misrepresenting their host as another vendor.
 *
 * These tests cover the registry itself: what it accepts, what it refuses, and
 * what it refuses to *believe* (a factory that returns a non-provider, or a
 * provider claiming an identity other than the one it registered under).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  registerProvider,
  tryRegisterProvider,
  unregisterProvider,
  resetProviderRegistry,
  isRegisteredProvider,
  getRegisteredProvider,
  listRegisteredProviders,
  registeredProviderTypes,
  createRegisteredProvider,
  validateProviderType,
  validateProviderInstance,
  registeredBillingDeclaration,
  type ProviderFactory,
} from '../../../../src/shared/llm/provider-registry';
import { billingModeForType, resolveBillingMode } from '../../../../src/shared/llm/billing-modes';
import type { LLMProvider } from '../../../../src/shared/llm/interfaces';

/** Minimal conforming provider — the shape a downstream host must supply. */
function makeFakeProvider(type: string, overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    type,
    name: `Fake ${type}`,
    isAvailable: async () => true,
    healthCheck: async () => ({ healthy: true, latencyMs: 1, provider: type }),
    generate: async () => {
      throw new Error('not used in these tests');
    },
    embed: async () => {
      throw new Error('not used in these tests');
    },
    complete: async () => {
      throw new Error('not used in these tests');
    },
    getConfig: () => ({}),
    getSupportedModels: () => ['default'],
    getCostPerToken: () => ({ input: 0, output: 0 }),
    dispose: async () => {},
    ...overrides,
  } as unknown as LLMProvider;
}

const factoryFor = (type: string, overrides: Partial<LLMProvider> = {}): ProviderFactory =>
  () => makeFakeProvider(type, overrides);

describe('ADR-127 provider registry', () => {
  beforeEach(() => resetProviderRegistry());
  afterEach(() => resetProviderRegistry());

  describe('registration', () => {
    it('registers a new provider type and makes it discoverable', () => {
      registerProvider('my-host', factoryFor('my-host'));

      expect(isRegisteredProvider('my-host')).toBe(true);
      expect(registeredProviderTypes()).toEqual(['my-host']);
      expect(getRegisteredProvider('my-host')?.type).toBe('my-host');
    });

    it('records provenance, defaulting to the in-process api source', () => {
      registerProvider('my-host', factoryFor('my-host'));
      expect(getRegisteredProvider('my-host')?.source).toBe('api');

      registerProvider('cfg-host', factoryFor('cfg-host'), {
        source: 'config',
        sourceDetail: '.agentic-qe/llm-config.json',
      });
      const registration = getRegisteredProvider('cfg-host');
      expect(registration?.source).toBe('config');
      expect(registration?.sourceDetail).toBe('.agentic-qe/llm-config.json');
    });

    it('replaces a previous registration for the same type', () => {
      registerProvider('my-host', factoryFor('my-host'), { displayName: 'first' });
      registerProvider('my-host', factoryFor('my-host'), { displayName: 'second' });

      expect(listRegisteredProviders()).toHaveLength(1);
      expect(getRegisteredProvider('my-host')?.displayName).toBe('second');
    });

    it('unregisters and resets', () => {
      registerProvider('my-host', factoryFor('my-host'));
      expect(unregisterProvider('my-host')).toBe(true);
      expect(unregisterProvider('my-host')).toBe(false);
      expect(isRegisteredProvider('my-host')).toBe(false);

      registerProvider('a', factoryFor('a'));
      registerProvider('b', factoryFor('b'));
      resetProviderRegistry();
      expect(listRegisteredProviders()).toHaveLength(0);
    });
  });

  describe('refuses to shadow or misname a built-in', () => {
    // The whole point of the feature is honest identity. A registration that
    // could take over 'claude' would let a third party silently answer as
    // Anthropic — the exact misrepresentation issue #628 refused to perform.
    it.each(['claude', 'claude-code', 'codex', 'openai', 'ollama', 'cognitum'])(
      'rejects built-in type %s',
      (builtin) => {
        expect(() => registerProvider(builtin, factoryFor(builtin))).toThrow(
          /built in and cannot be overridden/
        );
      }
    );

    it('rejects the reserved `anthropic` alias', () => {
      // resolveProviderOverrideFromEnv normalizes anthropic -> claude, so a
      // provider registered under it could never be selected by env.
      expect(() => registerProvider('anthropic', factoryFor('anthropic'))).toThrow(/reserved/);
    });

    it.each([
      ['', 'non-empty'],
      ['My-Host', 'lowercase'],
      ['my host', 'must match'],
      ['my_host', 'must match'],
      ['-leading-dash', 'must match'],
    ])('rejects malformed type %j', (type, expected) => {
      expect(validateProviderType(type)).toMatch(expected);
      expect(() => registerProvider(type, factoryFor(type))).toThrow();
    });

    it('rejects a non-function factory', () => {
      expect(() =>
        registerProvider('my-host', undefined as unknown as ProviderFactory)
      ).toThrow(/factory function/);
    });

    it('accepts a well-formed slug', () => {
      expect(validateProviderType('my-host-2')).toBeUndefined();
    });
  });

  describe('tryRegisterProvider reports instead of throwing', () => {
    // Config-driven registration must drop one bad entry, not fail the whole
    // router — the ADR-125 discipline for hand-edited JSON.
    it('returns an error message for a bad entry', () => {
      const error = tryRegisterProvider('claude', factoryFor('claude'));
      expect(error).toMatch(/built in/);
      expect(isRegisteredProvider('claude')).toBe(false);
    });

    it('returns undefined and registers on success', () => {
      expect(tryRegisterProvider('my-host', factoryFor('my-host'))).toBeUndefined();
      expect(isRegisteredProvider('my-host')).toBe(true);
    });
  });

  describe('construction validates the produced instance', () => {
    it('builds a conforming provider', () => {
      registerProvider('my-host', factoryFor('my-host'));
      const provider = createRegisteredProvider('my-host');
      expect(provider.type).toBe('my-host');
      expect(provider.name).toBe('Fake my-host');
    });

    it('passes the registered config through to the factory', () => {
      let seen: unknown;
      registerProvider(
        'my-host',
        (config) => {
          seen = config;
          return makeFakeProvider('my-host');
        },
        { config: { command: ['my-host', 'exec'] } }
      );

      createRegisteredProvider('my-host');
      expect(seen).toEqual({ command: ['my-host', 'exec'] });
    });

    it('throws for an unregistered type', () => {
      expect(() => createRegisteredProvider('nope')).toThrow(/Unknown provider type: nope/);
    });

    it('rejects a factory that returns a non-object', () => {
      registerProvider('my-host', (() => 'not a provider') as unknown as ProviderFactory);
      expect(() => createRegisteredProvider('my-host')).toThrow(/expected an LLMProvider/);
    });

    it('rejects a factory whose product is missing required methods', () => {
      registerProvider('my-host', (() => ({ type: 'my-host', name: 'x' })) as unknown as ProviderFactory);
      expect(() => createRegisteredProvider('my-host')).toThrow(
        /missing required LLMProvider method\(s\)/
      );
    });

    it('rejects a provider that claims an identity it was not registered under', () => {
      // A host registered as 'my-host' that reports type 'claude' would make
      // every downstream attribution — cost rows, health output, court records
      // — name the wrong vendor.
      registerProvider('my-host', factoryFor('claude'));
      expect(() => createRegisteredProvider('my-host')).toThrow(
        /must not claim an identity other than/
      );
    });

    it('validateProviderInstance accepts a conforming instance', () => {
      expect(validateProviderInstance('my-host', makeFakeProvider('my-host'))).toBeUndefined();
    });
  });

  describe('billing declarations are recorded, not trusted', () => {
    it('reports a declared mode with its provenance', () => {
      registerProvider('my-host', factoryFor('my-host'), {
        billingMode: 'subscription',
        source: 'config',
        sourceDetail: '.agentic-qe/llm-config.json',
      });

      expect(registeredBillingDeclaration('my-host')).toEqual({
        mode: 'subscription',
        source: 'config',
        detail: '.agentic-qe/llm-config.json',
      });
    });

    it('defaults an undeclared external provider to metered-api', () => {
      // The conservative direction: assume it costs money and needs a cap,
      // rather than assuming it is free and skipping budget enforcement.
      registerProvider('my-host', factoryFor('my-host'));
      expect(registeredBillingDeclaration('my-host')?.mode).toBe('metered-api');
      expect(billingModeForType('my-host')).toBe('metered-api');
    });

    it('returns undefined for a type that is not registered', () => {
      expect(registeredBillingDeclaration('my-host')).toBeUndefined();
    });

    it('lets an instance-level billingMode win, as for built-ins', () => {
      const provider = makeFakeProvider('my-host', { billingMode: 'local' } as Partial<LLMProvider>);
      expect(resolveBillingMode(provider)).toBe('local');
    });

    it('leaves built-in billing modes untouched', () => {
      expect(billingModeForType('claude-code')).toBe('subscription');
      expect(billingModeForType('cognitum')).toBe('metered-capped');
      expect(billingModeForType('ollama')).toBe('local');
      expect(billingModeForType('openai')).toBe('metered-api');
    });
  });
});
