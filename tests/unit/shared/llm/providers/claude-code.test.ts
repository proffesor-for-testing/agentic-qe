/**
 * ADR-123 — Claude Code (subscription) provider unit tests.
 *
 * The LOAD-BEARING guarantee: the spawned CLI must NOT inherit any API-billing
 * key, or it silently reverts to per-token API billing (issue #557). If this
 * test regresses, the provider is billing the wrong account.
 */

import { describe, it, expect } from 'vitest';
import {
  ClaudeCodeProvider,
  API_BILLING_ENV_VARS,
  DEFAULT_CLAUDE_CODE_CONFIG,
} from '../../../../../src/shared/llm/providers/claude-code';

describe('ClaudeCodeProvider.childEnv (env-strip)', () => {
  it('should_stripEveryApiBillingKey_when_presentInParentEnv', () => {
    const parent = {
      ANTHROPIC_API_KEY: 'sk-ant-should-be-removed',
      CLAUDE_API_KEY: 'also-removed',
      ANTHROPIC_AUTH_TOKEN: 'token-removed',
      PATH: '/usr/bin',
      HOME: '/home/user',
    };

    const child = ClaudeCodeProvider.childEnv(parent);

    for (const key of API_BILLING_ENV_VARS) {
      expect(child[key]).toBeUndefined();
    }
    // Non-billing env is preserved so the CLI still works.
    expect(child.PATH).toBe('/usr/bin');
    expect(child.HOME).toBe('/home/user');
  });

  it('should_notMutateTheParentEnv', () => {
    const parent = { ANTHROPIC_API_KEY: 'sk-ant-x', PATH: '/bin' };

    ClaudeCodeProvider.childEnv(parent);

    // The caller's env is untouched (we cloned).
    expect(parent.ANTHROPIC_API_KEY).toBe('sk-ant-x');
  });
});

describe('ClaudeCodeProvider metadata', () => {
  it('should_declareSubscriptionBilling', () => {
    const provider = new ClaudeCodeProvider();
    expect(provider.type).toBe('claude-code');
    expect(provider.billingMode).toBe('subscription');
  });

  it('should_reportZeroPerTokenCost', () => {
    const provider = new ClaudeCodeProvider();
    expect(provider.getCostPerToken()).toEqual({ input: 0, output: 0 });
  });

  it('should_mapCanonicalModelIdsToCliAliases', () => {
    const provider = new ClaudeCodeProvider() as unknown as {
      toCliModel(m: string): string;
    };
    expect(provider.toCliModel('claude-opus-4-7')).toBe('opus');
    expect(provider.toCliModel('claude-sonnet-4-6')).toBe('sonnet');
    expect(provider.toCliModel('claude-haiku-4-5-20251001')).toBe('haiku');
    // Unknown ids pass through untouched.
    expect(provider.toCliModel('custom-model')).toBe('custom-model');
  });

  it('should_disableMutatingToolsByDefault', () => {
    expect(DEFAULT_CLAUDE_CODE_CONFIG.disallowedTools).toContain('Bash');
    expect(DEFAULT_CLAUDE_CODE_CONFIG.disallowedTools).toContain('Write');
  });

  it('should_rejectEmbeddings', async () => {
    const provider = new ClaudeCodeProvider();
    await expect(provider.embed('text')).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' });
  });
});

describe.skipIf(process.platform === 'win32')('ClaudeCodeProvider parse errors (#1150)', () => {
  it('should_notLeakAPartialToken_when_theErrorExcerptCutsThroughIt', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1150-claude-'));
    try {
      // Non-JSON output whose 200-character excerpt ends inside a token.
      const out = 'n'.repeat(189) + ' ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8 tail';
      const bin = path.join(dir, 'fake-claude.sh');
      fs.writeFileSync(bin, `#!/bin/sh\ncat > /dev/null\nprintf '%s' '${out}'\n`, { mode: 0o755 });
      const provider = new ClaudeCodeProvider({ binaryPath: bin, timeoutMs: 10000 });

      const error = await provider.generate('hello').then(() => null, (e: unknown) => e as Error);

      expect(error?.message).toContain('Could not parse claude -p JSON output');
      expect(error?.message).not.toContain('ghp_A1b2');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
