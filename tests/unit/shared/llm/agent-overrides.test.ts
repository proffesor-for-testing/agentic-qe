/**
 * Tests for issue #568 — stable on-disk per-agent-type LLM provider routing.
 *
 * The `AgentRoutingOverride` data model already existed and
 * `getPreferredModelForAgent()` already resolved per-agent preferences, but
 * nothing connected either to `.agentic-qe/llm-config.json`, so the mechanism
 * was reachable only from an in-process `buildAgentRouterConfig({...})` call.
 * These tests cover the three seams that were missing: on-disk schema + merge,
 * preference resolution, and rule materialization.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { join } from 'path';

import {
  mergeRouterConfig,
  sanitizeAgentOverrides,
  loadRouterConfig,
} from '../../../../src/shared/llm/router/config-store';
import {
  getPreferredModelForAgent,
  setAgentProviderOverrides,
  getAgentProviderOverrides,
  resetAgentProviderOverrides,
  createOverrideRoutingRules,
  DEFAULT_CATEGORY_MODELS,
  getAgentRoutingCategory,
} from '../../../../src/shared/llm/router/agent-router-config';
import {
  DEFAULT_ROUTER_CONFIG,
  ALL_PROVIDER_TYPES,
} from '../../../../src/shared/llm/router/types';

afterEach(() => {
  resetAgentProviderOverrides();
  vi.restoreAllMocks();
});

describe('#568 — codex is a first-class router provider', () => {
  it('lists codex in ALL_PROVIDER_TYPES', () => {
    // codex was already an LLMProviderType with a working provider
    // (shared/llm/providers/codex.ts) and a PROVIDER_ENV_KEYS entry, but its
    // absence here meant detectAvailableProvidersFromEnv() never iterated it,
    // so the provider could not be selected through the router at all.
    expect(ALL_PROVIDER_TYPES).toContain('codex');
  });
});

describe('#568 — sanitizeAgentOverrides', () => {
  it('keeps a valid provider/model entry', () => {
    const { overrides, warnings } = sanitizeAgentOverrides({
      'qe-security-scanner': { provider: 'cognitum', model: 'cognitum-high' },
    });
    expect(overrides).toEqual({
      'qe-security-scanner': { provider: 'cognitum', model: 'cognitum-high' },
    });
    expect(warnings).toHaveLength(0);
  });

  it('drops an entry naming an unknown provider and explains why', () => {
    const { overrides, warnings } = sanitizeAgentOverrides({
      'qe-test-architect': { provider: 'not-a-provider' },
    });
    expect(overrides).toEqual({});
    expect(warnings.join(' ')).toMatch(/not a known provider/i);
  });

  it('strips a leaked apiKey rather than persisting it', () => {
    const { overrides, warnings } = sanitizeAgentOverrides({
      'qe-test-architect': { provider: 'openai', apiKey: 'sk-secret' },
    });
    expect(overrides['qe-test-architect']).toEqual({ provider: 'openai' });
    expect(overrides['qe-test-architect']).not.toHaveProperty('apiKey');
    expect(warnings.join(' ')).toMatch(/apiKey/i);
  });

  it('drops every credential-shaped field, not just apiKey', () => {
    // The entry is built as an ALLOW-LIST, so unknown fields never survive —
    // this asserts that property holds and that the user is told.
    const { overrides, warnings } = sanitizeAgentOverrides({
      'qe-test-architect': {
        provider: 'openai',
        apiKey: 'sk-a', token: 'tok-b', password: 'pw-c',
        secret: 's-d', authorization: 'Bearer e', credentials: 'f',
      },
    });
    expect(overrides['qe-test-architect']).toEqual({ provider: 'openai' });
    for (const leaked of ['apiKey', 'token', 'password', 'secret', 'authorization', 'credentials']) {
      expect(overrides['qe-test-architect']).not.toHaveProperty(leaked);
    }
    expect(warnings.join(' ')).toMatch(/credential-shaped/i);
  });

  it('never echoes a credential value into a warning', () => {
    // A warning that quotes the secret just moves it from the config file into
    // the log file.
    const { warnings } = sanitizeAgentOverrides({
      'qe-test-architect': { provider: 'openai', apiKey: 'sk-SUPERSECRET-VALUE' },
    });
    expect(warnings.join(' ')).not.toContain('sk-SUPERSECRET-VALUE');
  });

  it('ignores a malformed map without throwing', () => {
    // A typo in one project's config must not take down router init.
    expect(() => sanitizeAgentOverrides('nope')).not.toThrow();
    expect(sanitizeAgentOverrides('nope').overrides).toEqual({});
    expect(sanitizeAgentOverrides({ 'qe-x': 42 }).overrides).toEqual({});
  });

  it('returns an empty map for absent input', () => {
    expect(sanitizeAgentOverrides(undefined).overrides).toEqual({});
    expect(sanitizeAgentOverrides(undefined).warnings).toEqual([]);
  });
});

describe('#568 — mergeRouterConfig treats agentOverrides as a keyed map', () => {
  it('merges per-agent entries instead of replacing the whole map', () => {
    // This is the behavior the issue explicitly asked for: keyed-object merge
    // like `providers`, NOT the shallow-replace `fallbackChain` gets. Overriding
    // one agent must not wipe the others.
    const base = {
      ...DEFAULT_ROUTER_CONFIG,
      agentOverrides: {
        'qe-security-scanner': { provider: 'cognitum' as const },
        'qe-mutation-tester': { provider: 'ollama' as const },
      },
    };

    const merged = mergeRouterConfig(base, {
      agentOverrides: { 'qe-mutation-tester': { model: 'qwen3-coder:30b' } },
    });

    expect(merged.agentOverrides).toEqual({
      'qe-security-scanner': { provider: 'cognitum' },
      // existing provider preserved, model added
      'qe-mutation-tester': { provider: 'ollama', model: 'qwen3-coder:30b' },
    });
  });

  it('leaves agentOverrides undefined when neither side declares it', () => {
    const merged = mergeRouterConfig(DEFAULT_ROUTER_CONFIG, {});
    expect(merged.agentOverrides).toBeUndefined();
  });
});

describe('#568 — getPreferredModelForAgent consults the on-disk map first', () => {
  const AGENT = 'qe-security-scanner';

  it('returns the category default when nothing is overridden', () => {
    const category = getAgentRoutingCategory(AGENT);
    expect(getPreferredModelForAgent(AGENT)).toEqual(DEFAULT_CATEGORY_MODELS[category]);
  });

  it('applies provider and model from the override', () => {
    setAgentProviderOverrides({ [AGENT]: { provider: 'cognitum', model: 'cognitum-high' } });
    const preference = getPreferredModelForAgent(AGENT);
    expect(preference.provider).toBe('cognitum');
    expect(preference.model).toBe('cognitum-high');
  });

  it('treats an override as a partial — unset fields keep the category default', () => {
    const category = getAgentRoutingCategory(AGENT);
    const base = DEFAULT_CATEGORY_MODELS[category];

    setAgentProviderOverrides({ [AGENT]: { provider: 'ollama' } });
    const preference = getPreferredModelForAgent(AGENT);

    expect(preference.provider).toBe('ollama');
    // The user wrote one field; they should not have to restate the rest.
    expect(preference.model).toBe(base.model);
    expect(preference.temperature).toBe(base.temperature);
  });

  it('outranks the built-in category rule by default', () => {
    const category = getAgentRoutingCategory(AGENT);
    setAgentProviderOverrides({ [AGENT]: { provider: 'ollama' } });
    expect(getPreferredModelForAgent(AGENT).priority)
      .toBeGreaterThan(DEFAULT_CATEGORY_MODELS[category].priority);
  });

  it('honors an explicit priority when the user sets one', () => {
    setAgentProviderOverrides({ [AGENT]: { provider: 'ollama', priority: 5 } });
    expect(getPreferredModelForAgent(AGENT).priority).toBe(5);
  });

  it('does not leak across agent types', () => {
    setAgentProviderOverrides({ [AGENT]: { provider: 'ollama' } });
    const other = 'qe-test-architect';
    const otherCategory = getAgentRoutingCategory(other);
    expect(getPreferredModelForAgent(other))
      .toEqual(DEFAULT_CATEGORY_MODELS[otherCategory]);
  });

  it('is fully cleared by a subsequent set (not merged)', () => {
    setAgentProviderOverrides({ [AGENT]: { provider: 'ollama' } });
    setAgentProviderOverrides({});
    expect(getAgentProviderOverrides()).toEqual({});
    const category = getAgentRoutingCategory(AGENT);
    expect(getPreferredModelForAgent(AGENT)).toEqual(DEFAULT_CATEGORY_MODELS[category]);
  });
});

describe('#568 — createOverrideRoutingRules materializes rules the router evaluates', () => {
  it('emits nothing when no overrides are installed', () => {
    // Projects without the key must get byte-identical routing to before.
    expect(createOverrideRoutingRules()).toEqual([]);
  });

  it('emits one agent-type-only rule per override', () => {
    setAgentProviderOverrides({
      'qe-security-scanner': { provider: 'cognitum', model: 'cognitum-high' },
      'qe-mutation-tester': { provider: 'ollama' },
    });

    const rules = createOverrideRoutingRules();
    expect(rules).toHaveLength(2);

    const scanner = rules.find(r => r.id === 'agent-override-qe-security-scanner');
    expect(scanner).toBeDefined();
    expect(scanner!.enabled).toBe(true);
    expect(scanner!.action.provider).toBe('cognitum');
    expect(scanner!.action.model).toBe('cognitum-high');
    expect(scanner!.condition.agentType).toEqual(['qe-security-scanner']);
    // Deliberately NOT constrained on requiresReasoning: "route this agent to
    // ollama" means always, not only on reasoning-flagged requests.
    expect(scanner!.condition).not.toHaveProperty('requiresReasoning');
  });

  it('sorts rules highest priority first', () => {
    setAgentProviderOverrides({
      'qe-security-scanner': { provider: 'ollama', priority: 10 },
      'qe-mutation-tester': { provider: 'ollama', priority: 90 },
    });
    const priorities = createOverrideRoutingRules().map(r => r.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });
});

describe('#568 — loadRouterConfig reads agentOverrides off disk', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-568-'));
    fs.mkdirSync(path.join(projectRoot, '.agentic-qe'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  function writeConfig(contents: unknown): void {
    fs.writeFileSync(
      path.join(projectRoot, '.agentic-qe', 'llm-config.json'),
      JSON.stringify(contents, null, 2)
    );
  }

  it('surfaces the documented schema end-to-end', () => {
    // Exactly the shape proposed in the issue.
    writeConfig({
      defaultProvider: 'claude-code',
      agentOverrides: {
        'qe-security-scanner': { provider: 'cognitum' },
        'qe-test-architect': { provider: 'claude-code', model: 'sonnet' },
        'qe-mutation-tester': { provider: 'ollama' },
      },
    });

    const config = loadRouterConfig({ projectRoot, env: {} });

    expect(config.agentOverrides).toEqual({
      'qe-security-scanner': { provider: 'cognitum' },
      'qe-test-architect': { provider: 'claude-code', model: 'sonnet' },
      'qe-mutation-tester': { provider: 'ollama' },
    });
  });

  it('drops invalid entries at load time and warns', () => {
    // Warnings go through the project logger (which must be used instead of a
    // bare console.warn — MCP stdio mode suppresses console output, so a
    // console-only warning is invisible in the most common way AQE runs).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeConfig({ agentOverrides: { 'qe-x': { provider: 'nope' } } });

    const config = loadRouterConfig({ projectRoot, env: {} });

    expect(config.agentOverrides).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it('leaves agentOverrides absent for a config that does not use it', () => {
    writeConfig({ defaultProvider: 'ollama' });
    expect(loadRouterConfig({ projectRoot, env: {} }).agentOverrides).toBeUndefined();
  });
});

describe('#568 — provider switch must not inherit the old provider\'s model id', () => {
  const AGENT = 'qe-mutation-tester';

  it('falls back to the new provider\'s default model when none is named', () => {
    // Inheriting the category model across a provider change would route this
    // agent to ollama asking for `claude-sonnet-4-6` — a model ollama cannot
    // serve. The user wrote "use ollama", not "use ollama with a Claude model".
    setAgentProviderOverrides(
      { [AGENT]: { provider: 'ollama' } },
      { ollama: 'qwen3-coder:30b' }
    );
    const preference = getPreferredModelForAgent(AGENT);
    expect(preference.provider).toBe('ollama');
    expect(preference.model).toBe('qwen3-coder:30b');
  });

  it('still honors an explicitly named model', () => {
    setAgentProviderOverrides(
      { [AGENT]: { provider: 'ollama', model: 'llama3.1' } },
      { ollama: 'qwen3-coder:30b' }
    );
    expect(getPreferredModelForAgent(AGENT).model).toBe('llama3.1');
  });

  it('keeps the category model when the provider is unchanged', () => {
    const category = getAgentRoutingCategory(AGENT);
    const base = DEFAULT_CATEGORY_MODELS[category];
    setAgentProviderOverrides(
      { [AGENT]: { provider: base.provider, temperature: 0.9 } },
      { ollama: 'qwen3-coder:30b' }
    );
    const preference = getPreferredModelForAgent(AGENT);
    expect(preference.model).toBe(base.model);
    expect(preference.temperature).toBe(0.9);
  });

  it('keeps the category model when no provider default is known', () => {
    // Degrade to previous behavior rather than emitting an empty model id.
    setAgentProviderOverrides({ [AGENT]: { provider: 'ollama' } }, {});
    const category = getAgentRoutingCategory(AGENT);
    expect(getPreferredModelForAgent(AGENT).model)
      .toBe(DEFAULT_CATEGORY_MODELS[category].model);
  });
});

describe('#568 — an override must reach a real routing decision', () => {
  it('matches the params a QE domain service actually sends', async () => {
    // Court charge (sherlock prosecutor, CONFIRMED): routing rules match on
    // `agentType`, and the domain services were calling `llmRouter.chat()`
    // WITHOUT it — so a user's on-disk override for `qe-test-architect` parsed
    // fine, produced a rule, and then never fired. Parsing config is not the
    // feature; changing the routing decision is.
    const { RoutingRuleEngine } = await import('../../../../src/shared/llm/router/routing-rules');

    setAgentProviderOverrides({ 'qe-test-architect': { provider: 'ollama' } }, { ollama: 'llama3.1' });
    const engine = new RoutingRuleEngine(createOverrideRoutingRules());

    const match = engine.evaluate({
      messages: [{ role: 'user' as const, content: 'x' }],
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      temperature: 0.3,
      agentType: 'qe-test-architect',
    } as never);

    expect(match).not.toBeNull();
    expect(match!.rule.action.provider).toBe('ollama');
  });

  it('every domain service that calls the router identifies its agent type', async () => {
    // Guard: a new `llmRouter.chat()` call without `agentType` silently opts
    // that service out of all per-agent routing.
    const { readFileSync } = await import('fs');
    const { globSync } = await import('glob');
    const repoRoot = join(__dirname, '..', '..', '..', '..');

    const offenders: string[] = [];
    for (const file of globSync('src/domains/**/*.ts', { cwd: repoRoot, absolute: true })) {
      const src = readFileSync(file, 'utf-8');
      const chatCalls = (src.match(/llmRouter\.chat\(\{/g) || []).length;
      if (chatCalls === 0) continue;
      const tagged = (src.match(/agentType:\s*'qe-/g) || []).length;
      if (tagged < chatCalls) offenders.push(`${file} (${tagged}/${chatCalls} tagged)`);
    }

    expect(offenders, `router calls missing agentType:\n${offenders.join('\n')}`).toEqual([]);
  });
});
