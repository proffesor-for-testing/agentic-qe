/**
 * ADR-123 — config-store changes: honor explicit `enabled: false` against env
 * key presence (issue #557), and the AQE_LLM_PROVIDER override.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  loadRouterConfig,
  saveRouterConfigFile,
  applyEnvProviderDetection,
  collectExplicitlyDisabled,
  resolveProviderOverrideFromEnv,
} from '../../../../../src/shared/llm/router/config-store';
import { DEFAULT_ROUTER_CONFIG } from '../../../../../src/shared/llm/router/types';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-adr123-cfg-'));
});

afterEach(() => {
  if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('applyEnvProviderDetection honors explicit disable (ADR-123)', () => {
  it('should_notForceEnable_when_providerExplicitlyDisabled', () => {
    // Claude explicitly turned off on disk, but the key is exported.
    const base = {
      ...DEFAULT_ROUTER_CONFIG,
      providers: {
        ...DEFAULT_ROUTER_CONFIG.providers,
        claude: { enabled: false },
      },
    };
    const env = { ANTHROPIC_API_KEY: 'sk-ant-present' };

    const result = applyEnvProviderDetection(base, env, new Set(['claude']));

    expect(result.providers?.claude?.enabled).toBe(false);
  });

  it('should_stillForceEnable_when_notExplicitlyDisabled', () => {
    // Key present + provider not in the explicit-disable set → convenience on.
    const base = {
      ...DEFAULT_ROUTER_CONFIG,
      providers: {
        ...DEFAULT_ROUTER_CONFIG.providers,
        openrouter: { enabled: false },
      },
    };
    const env = { OPENROUTER_API_KEY: 'or-key' };

    const result = applyEnvProviderDetection(base, env, new Set());

    expect(result.providers?.openrouter?.enabled).toBe(true);
  });
});

describe('collectExplicitlyDisabled', () => {
  it('should_collectOnlyProvidersSetToFalse', () => {
    const disabled = collectExplicitlyDisabled({
      providers: {
        claude: { enabled: false },
        openai: { enabled: true },
        gemini: {},
      },
    });
    expect(disabled.has('claude')).toBe(true);
    expect(disabled.has('openai')).toBe(false);
    expect(disabled.has('gemini')).toBe(false);
  });
});

describe('loadRouterConfig end-to-end (ADR-123)', () => {
  it('should_keepClaudeDisabled_when_diskSaysFalse_even_withKeyInEnv', () => {
    saveRouterConfigFile({ providers: { claude: { enabled: false } } }, tmpRoot);

    const config = loadRouterConfig({
      projectRoot: tmpRoot,
      env: { ANTHROPIC_API_KEY: 'sk-ant-present' },
    });

    expect(config.providers?.claude?.enabled).toBe(false);
  });
});

describe('resolveProviderOverrideFromEnv (AQE_LLM_PROVIDER)', () => {
  it('should_resolveClaudeCode', () => {
    expect(resolveProviderOverrideFromEnv({ AQE_LLM_PROVIDER: 'claude-code' })).toBe('claude-code');
  });

  it('should_aliasAnthropicToClaude', () => {
    expect(resolveProviderOverrideFromEnv({ AQE_LLM_PROVIDER: 'anthropic' })).toBe('claude');
  });

  it('should_ignoreUnknownProvider', () => {
    expect(resolveProviderOverrideFromEnv({ AQE_LLM_PROVIDER: 'bogus' })).toBeUndefined();
  });

  it('should_returnUndefined_when_unset', () => {
    expect(resolveProviderOverrideFromEnv({})).toBeUndefined();
  });
});

describe('AQE_LLM_PROVIDER pins the default provider (ADR-123)', () => {
  it('should_setDefaultProviderAndEnableIt', () => {
    const config = loadRouterConfig({
      projectRoot: tmpRoot,
      env: { AQE_LLM_PROVIDER: 'claude-code' },
    });

    expect(config.defaultProvider).toBe('claude-code');
    expect(config.providers?.['claude-code']?.enabled).toBe(true);
  });
});
