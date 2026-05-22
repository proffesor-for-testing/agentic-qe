/**
 * Unit tests for src/shared/llm/router/config-store.ts (ADR-043 wiring).
 *
 * Uses a temp-dir as the "project root" to keep .agentic-qe/llm-config.json
 * writes off the real repo.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  loadRouterConfig,
  loadRouterConfigFile,
  saveRouterConfigFile,
  mergeRouterConfig,
  applyEnvProviderDetection,
  detectAvailableProvidersFromEnv,
  shouldEnableRouter,
  getRouterConfigPath,
  ROUTER_CONFIG_FILENAME,
} from '../../../../../src/shared/llm/router/config-store';
import { DEFAULT_ROUTER_CONFIG } from '../../../../../src/shared/llm/router/types';

// A clean env that has no provider keys at all — tests opt in.
const EMPTY_ENV: NodeJS.ProcessEnv = {};

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-router-cfg-'));
});

afterEach(() => {
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe('getRouterConfigPath', () => {
  it('puts the file under .agentic-qe/ in the given project root', () => {
    const p = getRouterConfigPath(tmpRoot);
    expect(p).toBe(path.join(tmpRoot, '.agentic-qe', ROUTER_CONFIG_FILENAME));
  });
});

describe('loadRouterConfigFile', () => {
  it('returns {} when the file does not exist', () => {
    expect(loadRouterConfigFile(tmpRoot)).toEqual({});
  });

  it('returns {} when the file is empty', () => {
    fs.mkdirSync(path.join(tmpRoot, '.agentic-qe'), { recursive: true });
    fs.writeFileSync(getRouterConfigPath(tmpRoot), '');
    expect(loadRouterConfigFile(tmpRoot)).toEqual({});
  });

  it('parses a well-formed config', () => {
    fs.mkdirSync(path.join(tmpRoot, '.agentic-qe'), { recursive: true });
    fs.writeFileSync(
      getRouterConfigPath(tmpRoot),
      JSON.stringify({ defaultProvider: 'gemini', mode: 'cost-optimized' })
    );
    const loaded = loadRouterConfigFile(tmpRoot);
    expect(loaded.defaultProvider).toBe('gemini');
    expect(loaded.mode).toBe('cost-optimized');
  });

  it('throws on malformed JSON rather than silently dropping config', () => {
    fs.mkdirSync(path.join(tmpRoot, '.agentic-qe'), { recursive: true });
    fs.writeFileSync(getRouterConfigPath(tmpRoot), '{ not valid json');
    expect(() => loadRouterConfigFile(tmpRoot)).toThrow();
  });
});

describe('saveRouterConfigFile', () => {
  it('creates .agentic-qe/ if missing and writes the file', () => {
    saveRouterConfigFile({ defaultProvider: 'gemini' }, tmpRoot);
    const onDisk = loadRouterConfigFile(tmpRoot);
    expect(onDisk.defaultProvider).toBe('gemini');
  });

  it('strips apiKey fields defensively', () => {
    saveRouterConfigFile(
      {
        defaultProvider: 'gemini',
        providers: {
          gemini: { enabled: true, apiKey: 'sk-secret', defaultModel: 'gemini-pro' } as any,
        },
      },
      tmpRoot
    );
    const onDisk = loadRouterConfigFile(tmpRoot);
    expect((onDisk.providers?.gemini as any)?.apiKey).toBeUndefined();
    expect(onDisk.providers?.gemini?.enabled).toBe(true);
    expect((onDisk.providers?.gemini as any)?.defaultModel).toBe('gemini-pro');
  });

  it('writes atomically (no .tmp file left behind on success)', () => {
    saveRouterConfigFile({ defaultProvider: 'openai' }, tmpRoot);
    const dirEntries = fs.readdirSync(path.join(tmpRoot, '.agentic-qe'));
    const tmpFiles = dirEntries.filter((f) => f.includes('.tmp-'));
    expect(tmpFiles).toEqual([]);
  });
});

describe('mergeRouterConfig', () => {
  it('overrides top-level scalars', () => {
    const merged = mergeRouterConfig(DEFAULT_ROUTER_CONFIG, { mode: 'manual' });
    expect(merged.mode).toBe('manual');
  });

  it('shallow-merges provider entries (does not wipe defaults)', () => {
    const merged = mergeRouterConfig(DEFAULT_ROUTER_CONFIG, {
      providers: { gemini: { enabled: true } } as any,
    });
    // enabled flipped, but defaultModel from DEFAULT preserved
    expect(merged.providers?.gemini?.enabled).toBe(true);
    expect((merged.providers?.gemini as any)?.defaultModel).toBe('gemini-pro');
  });

  it('preserves base providers not mentioned in the override', () => {
    const merged = mergeRouterConfig(DEFAULT_ROUTER_CONFIG, {
      providers: { gemini: { enabled: true } } as any,
    });
    expect(merged.providers?.claude?.enabled).toBe(true);
    expect(merged.providers?.openai?.enabled).toBe(true);
  });
});

describe('detectAvailableProvidersFromEnv', () => {
  it('detects gemini via any of GOOGLE_AI_API_KEY / GEMINI_API_KEY / GOOGLE_API_KEY', () => {
    expect(detectAvailableProvidersFromEnv({ GOOGLE_AI_API_KEY: 'x' })).toContain('gemini');
    expect(detectAvailableProvidersFromEnv({ GEMINI_API_KEY: 'x' })).toContain('gemini');
    expect(detectAvailableProvidersFromEnv({ GOOGLE_API_KEY: 'x' })).toContain('gemini');
  });

  it('detects claude via ANTHROPIC_API_KEY or CLAUDE_API_KEY', () => {
    expect(detectAvailableProvidersFromEnv({ ANTHROPIC_API_KEY: 'x' })).toContain('claude');
    expect(detectAvailableProvidersFromEnv({ CLAUDE_API_KEY: 'x' })).toContain('claude');
  });

  it('detects openai via OPENAI_API_KEY', () => {
    expect(detectAvailableProvidersFromEnv({ OPENAI_API_KEY: 'x' })).toContain('openai');
  });

  it('detects openrouter via OPENROUTER_API_KEY', () => {
    expect(detectAvailableProvidersFromEnv({ OPENROUTER_API_KEY: 'x' })).toContain('openrouter');
  });

  it('treats empty/whitespace strings as absent', () => {
    expect(detectAvailableProvidersFromEnv({ ANTHROPIC_API_KEY: '' })).not.toContain('claude');
    expect(detectAvailableProvidersFromEnv({ ANTHROPIC_API_KEY: '   ' })).not.toContain('claude');
  });

  it('always includes local providers that ProviderManager can construct (ollama)', () => {
    const detected = detectAvailableProvidersFromEnv(EMPTY_ENV);
    expect(detected).toContain('ollama');
  });

  it('excludes onnx until ProviderManager has a constructor case for it', () => {
    // onnx is in the type system (ExtendedProviderType) but
    // ProviderManager.createProvider() has no case. We exclude it from
    // the available set to keep boot logs clean.
    const detected = detectAvailableProvidersFromEnv(EMPTY_ENV);
    expect(detected).not.toContain('onnx');
  });

  it('excludes remote providers with no key in env', () => {
    const detected = detectAvailableProvidersFromEnv(EMPTY_ENV);
    expect(detected).not.toContain('claude');
    expect(detected).not.toContain('gemini');
    expect(detected).not.toContain('openai');
    expect(detected).not.toContain('openrouter');
  });
});

describe('applyEnvProviderDetection', () => {
  it('force-enables gemini when GOOGLE_API_KEY is set, overriding default disabled', () => {
    expect(DEFAULT_ROUTER_CONFIG.providers?.gemini?.enabled).toBe(false);
    const out = applyEnvProviderDetection(DEFAULT_ROUTER_CONFIG, { GOOGLE_API_KEY: 'x' });
    expect(out.providers?.gemini?.enabled).toBe(true);
  });

  it('leaves providers untouched when no key is present', () => {
    const out = applyEnvProviderDetection(DEFAULT_ROUTER_CONFIG, EMPTY_ENV);
    expect(out.providers?.gemini?.enabled).toBe(false);
  });

  it('preserves defaultModel on a force-enabled provider', () => {
    const out = applyEnvProviderDetection(DEFAULT_ROUTER_CONFIG, { GEMINI_API_KEY: 'x' });
    expect((out.providers?.gemini as any)?.defaultModel).toBe('gemini-pro');
  });
});

describe('loadRouterConfig (full path)', () => {
  it('returns defaults when no disk, no env, no override', () => {
    const cfg = loadRouterConfig({ projectRoot: tmpRoot, env: EMPTY_ENV });
    expect(cfg.defaultProvider).toBe('claude');
    expect(cfg.providers?.gemini?.enabled).toBe(false);
  });

  it('disk config overrides defaults', () => {
    saveRouterConfigFile({ defaultProvider: 'openai' }, tmpRoot);
    const cfg = loadRouterConfig({ projectRoot: tmpRoot, env: EMPTY_ENV });
    expect(cfg.defaultProvider).toBe('openai');
  });

  it('env detection enables providers regardless of disk', () => {
    saveRouterConfigFile({ providers: { gemini: { enabled: false } } as any }, tmpRoot);
    const cfg = loadRouterConfig({ projectRoot: tmpRoot, env: { GOOGLE_API_KEY: 'x' } });
    expect(cfg.providers?.gemini?.enabled).toBe(true);
  });

  it('explicit override beats env and disk', () => {
    saveRouterConfigFile({ defaultProvider: 'openai' }, tmpRoot);
    const cfg = loadRouterConfig({
      projectRoot: tmpRoot,
      env: { GOOGLE_API_KEY: 'x' },
      override: { defaultProvider: 'gemini' },
    });
    expect(cfg.defaultProvider).toBe('gemini');
  });
});

describe('shouldEnableRouter', () => {
  it('false when no env keys and no disk providers enabled', () => {
    expect(shouldEnableRouter({ projectRoot: tmpRoot, env: EMPTY_ENV })).toBe(false);
  });

  it('true when any provider key is in env', () => {
    expect(
      shouldEnableRouter({ projectRoot: tmpRoot, env: { OPENAI_API_KEY: 'x' } })
    ).toBe(true);
    expect(
      shouldEnableRouter({ projectRoot: tmpRoot, env: { GOOGLE_API_KEY: 'x' } })
    ).toBe(true);
  });

  it('true when disk config explicitly enables a provider, even without env keys', () => {
    saveRouterConfigFile(
      { providers: { gemini: { enabled: true } } as any },
      tmpRoot
    );
    expect(shouldEnableRouter({ projectRoot: tmpRoot, env: EMPTY_ENV })).toBe(true);
  });
});
