/**
 * Test: Settings Merge Utilities
 *
 * Verifies that aqe init --auto correctly handles:
 * - Fresh installs (no existing settings)
 * - Updating existing AQE hooks (replace, don't duplicate)
 * - Preserving non-AQE hooks from user config
 * - Handling mixed old/new AQE command variants
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  isAqeHookEntry,
  mergeHooksSmart,
  generateAqeEnvVars,
  generateV3SettingsSections,
  applyV3Sections,
  isAqeStatusLine,
  mergeAqeEnv,
  backupSettingsFile,
} from '../../../src/init/settings-merge.js';

describe('Settings Merge Utilities', () => {
  describe('isAqeHookEntry', () => {
    it('should detect "aqe hooks" commands', () => {
      const entry = {
        matcher: '^Bash$',
        hooks: [{ type: 'command', command: 'aqe hooks pre-command --command "$TOOL_INPUT_command"' }],
      };
      expect(isAqeHookEntry(entry)).toBe(true);
    });

    it('should detect "npx agentic-qe" commands', () => {
      const entry = {
        matcher: '^Task$',
        hooks: [{ type: 'command', command: 'npx agentic-qe hooks pre-task --description "$TOOL_INPUT_prompt" --json' }],
      };
      expect(isAqeHookEntry(entry)).toBe(true);
    });

    it('should detect "npx @anthropics/agentic-qe" commands', () => {
      const entry = {
        hooks: [{ type: 'command', command: 'npx @anthropics/agentic-qe hooks route --task "$PROMPT"' }],
      };
      expect(isAqeHookEntry(entry)).toBe(true);
    });

    it('should NOT detect unrelated hooks', () => {
      const entry = {
        matcher: '^Bash$',
        hooks: [{ type: 'command', command: 'eslint --fix "$TOOL_INPUT_file_path"' }],
      };
      expect(isAqeHookEntry(entry)).toBe(false);
    });

    it('should detect brain-checkpoint.cjs commands', () => {
      const entry = {
        hooks: [{ type: 'command', command: 'node .claude/helpers/brain-checkpoint.cjs verify --json' }],
      };
      expect(isAqeHookEntry(entry)).toBe(true);
    });

    it('should detect .claude/helpers/ commands', () => {
      const entry = {
        hooks: [{ type: 'command', command: 'node .claude/helpers/statusline-v3.cjs 2>/dev/null' }],
      };
      expect(isAqeHookEntry(entry)).toBe(true);
    });

    it('should handle entries without hooks array', () => {
      expect(isAqeHookEntry({})).toBe(false);
      expect(isAqeHookEntry(null)).toBe(false);
      expect(isAqeHookEntry({ hooks: 'not-an-array' })).toBe(false);
    });

    it('should NOT detect ruflo/claude-flow hook-handler.cjs as AQE', () => {
      // ruflo installs hooks into .claude/helpers/ too — these must be preserved.
      const entry = {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: 'sh -c \'exec node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/hook-handler.cjs" pre-bash\'' }],
      };
      expect(isAqeHookEntry(entry)).toBe(false);
    });

    it('should NOT detect ruflo auto-memory-hook.mjs as AQE', () => {
      const entry = {
        hooks: [{ type: 'command', command: 'node .claude/helpers/auto-memory-hook.mjs import' }],
      };
      expect(isAqeHookEntry(entry)).toBe(false);
    });

    it('should NOT detect a bare ruflo command as AQE', () => {
      const entry = {
        hooks: [{ type: 'command', command: 'npx ruflo hooks route' }],
      };
      expect(isAqeHookEntry(entry)).toBe(false);
    });

    it('should detect AQE aqe-hook.cjs commands', () => {
      const entry = {
        hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/aqe-hook.cjs" guard --file "$TOOL_INPUT_file_path" --json' }],
      };
      expect(isAqeHookEntry(entry)).toBe(true);
    });
  });

  describe('mergeHooksSmart', () => {
    const newAqeHooks: Record<string, unknown[]> = {
      PreToolUse: [
        {
          matcher: '^(Write|Edit|MultiEdit)$',
          hooks: [{ type: 'command', command: 'npx agentic-qe hooks guard --file "$TOOL_INPUT_file_path" --json' }],
        },
      ],
      PostToolUse: [
        {
          matcher: '^(Write|Edit|MultiEdit)$',
          hooks: [{ type: 'command', command: 'npx agentic-qe hooks post-edit --file "$TOOL_INPUT_file_path" --success --json' }],
        },
      ],
      SessionStart: [
        {
          hooks: [{ type: 'command', command: 'npx agentic-qe hooks session-start --session-id "$SESSION_ID" --json' }],
        },
      ],
    };

    it('should add hooks to empty existing config', () => {
      const result = mergeHooksSmart({}, newAqeHooks);
      expect(result.PreToolUse).toHaveLength(1);
      expect(result.PostToolUse).toHaveLength(1);
      expect(result.SessionStart).toHaveLength(1);
    });

    it('should replace old AQE hooks with new ones', () => {
      const existingHooks: Record<string, unknown[]> = {
        PreToolUse: [
          {
            matcher: '^(Write|Edit|MultiEdit)$',
            hooks: [{ type: 'command', command: 'aqe hooks pre-edit --file "$TOOL_INPUT_file_path"' }],
          },
        ],
        PostToolUse: [
          {
            matcher: '^(Write|Edit|MultiEdit)$',
            hooks: [{ type: 'command', command: 'aqe hooks post-edit --file "$TOOL_INPUT_file_path" --success "$TOOL_SUCCESS"' }],
          },
        ],
      };

      const result = mergeHooksSmart(existingHooks, newAqeHooks);

      // Old hooks should be gone, new ones in place
      expect(result.PreToolUse).toHaveLength(1);
      const preCmd = (result.PreToolUse[0] as any).hooks[0].command;
      expect(preCmd).toContain('npx agentic-qe hooks guard');

      expect(result.PostToolUse).toHaveLength(1);
      const postCmd = (result.PostToolUse[0] as any).hooks[0].command;
      expect(postCmd).toContain('npx agentic-qe hooks post-edit');
    });

    it('should preserve non-AQE hooks alongside new AQE hooks', () => {
      const existingHooks: Record<string, unknown[]> = {
        PreToolUse: [
          // User's custom eslint hook
          {
            matcher: '^(Write|Edit)$',
            hooks: [{ type: 'command', command: 'eslint --fix "$TOOL_INPUT_file_path"' }],
          },
          // Old AQE hook that should be replaced
          {
            matcher: '^(Write|Edit|MultiEdit)$',
            hooks: [{ type: 'command', command: 'aqe hooks pre-edit --file "$TOOL_INPUT_file_path"' }],
          },
        ],
      };

      const result = mergeHooksSmart(existingHooks, newAqeHooks);

      // Should have 2: new AQE guard + preserved eslint
      expect(result.PreToolUse).toHaveLength(2);

      const commands = result.PreToolUse.map(
        (e: any) => e.hooks[0].command,
      );
      expect(commands).toContain('eslint --fix "$TOOL_INPUT_file_path"');
      expect(commands).toContain('npx agentic-qe hooks guard --file "$TOOL_INPUT_file_path" --json');
    });

    it('should preserve user-defined hook types not managed by AQE', () => {
      const existingHooks: Record<string, unknown[]> = {
        NotificationSend: [
          { hooks: [{ type: 'command', command: 'notify-send "done"' }] },
        ],
      };

      const result = mergeHooksSmart(existingHooks, newAqeHooks);

      expect(result.NotificationSend).toHaveLength(1);
      expect((result.NotificationSend[0] as any).hooks[0].command).toBe('notify-send "done"');
    });

    it('should not duplicate AQE hooks when run multiple times', () => {
      // First run
      const result1 = mergeHooksSmart({}, newAqeHooks);
      // Second run (simulating aqe init --auto again)
      const result2 = mergeHooksSmart(result1, newAqeHooks);
      // Third run
      const result3 = mergeHooksSmart(result2, newAqeHooks);

      expect(result3.PreToolUse).toHaveLength(1);
      expect(result3.PostToolUse).toHaveLength(1);
      expect(result3.SessionStart).toHaveLength(1);
    });

    it('should not duplicate brain-checkpoint hooks when run multiple times', () => {
      const hooksWithBrainCheckpoint: Record<string, unknown[]> = {
        ...newAqeHooks,
        SessionStart: [
          ...newAqeHooks.SessionStart,
          {
            hooks: [{ type: 'command', command: 'node .claude/helpers/brain-checkpoint.cjs verify --json', timeout: 5000, continueOnError: true }],
          },
        ],
        Stop: [
          {
            hooks: [{ type: 'command', command: 'node .claude/helpers/brain-checkpoint.cjs export --json', timeout: 60000, continueOnError: true }],
          },
        ],
      };

      const result1 = mergeHooksSmart({}, hooksWithBrainCheckpoint);
      const result2 = mergeHooksSmart(result1, hooksWithBrainCheckpoint);
      const result3 = mergeHooksSmart(result2, hooksWithBrainCheckpoint);

      expect(result3.SessionStart).toHaveLength(2); // session-start + brain-checkpoint verify
      expect(result3.Stop).toHaveLength(1); // brain-checkpoint export
    });

    it('should preserve ruflo hooks when adding AQE hooks (init after ruflo init)', () => {
      // Reproduces the reported bug: `aqe init` in a project that already ran
      // `ruflo init` must keep ruflo's hooks, not strip them.
      const existingHooks: Record<string, unknown[]> = {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'sh -c \'exec node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/hook-handler.cjs" pre-bash\'' }] },
        ],
        SessionStart: [
          { hooks: [{ type: 'command', command: 'node .claude/helpers/auto-memory-hook.mjs import' }] },
        ],
        SessionEnd: [
          { hooks: [{ type: 'command', command: 'node .claude/helpers/hook-handler.cjs session-end' }] },
        ],
      };

      const result = mergeHooksSmart(existingHooks, newAqeHooks);

      // ruflo PreToolUse hook preserved + AQE guard added
      expect(result.PreToolUse).toHaveLength(2);
      const preCmds = result.PreToolUse.map((e: any) => e.hooks[0].command);
      expect(preCmds.some((c: string) => c.includes('hook-handler.cjs'))).toBe(true);
      expect(preCmds.some((c: string) => c.includes('agentic-qe hooks guard'))).toBe(true);

      // ruflo SessionStart preserved + AQE session-start added
      expect(result.SessionStart).toHaveLength(2);

      // SessionEnd is not an AQE-managed hook type — kept untouched
      expect(result.SessionEnd).toHaveLength(1);
      expect((result.SessionEnd[0] as any).hooks[0].command).toContain('hook-handler.cjs');
    });

    it('should handle mixed old aqe + npx agentic-qe commands', () => {
      const existingHooks: Record<string, unknown[]> = {
        PreToolUse: [
          // Very old format
          { matcher: '^Bash$', hooks: [{ type: 'command', command: 'aqe hooks pre-command --command "$TOOL_INPUT_command"' }] },
          // Slightly newer format
          { matcher: '^Task$', hooks: [{ type: 'command', command: 'npx agentic-qe hooks pre-task --description "$TOOL_INPUT_prompt"' }] },
        ],
        SessionStart: [
          { hooks: [{ type: 'command', command: 'aqe hooks session-start --session-id "$SESSION_ID"' }] },
        ],
      };

      const result = mergeHooksSmart(existingHooks, newAqeHooks);

      // All old AQE hooks should be removed, only new ones remain
      expect(result.PreToolUse).toHaveLength(1);
      expect(result.SessionStart).toHaveLength(1);
    });
  });

  describe('generateAqeEnvVars', () => {
    it('should generate full env vars from config', () => {
      const config = {
        learning: { enabled: true, hnswConfig: { M: 8 }, promotionThreshold: 3, qualityThreshold: 0.7 },
        domains: { enabled: ['test-generation', 'coverage-analysis'] },
        agents: { maxConcurrent: 15 },
      } as any;

      const env = generateAqeEnvVars(config);

      expect(env.AQE_MEMORY_PATH).toBe('.agentic-qe/memory.db');
      expect(env.AQE_V3_MODE).toBe('true');
      expect(env.AQE_V3_HNSW_ENABLED).toBe('true');
      expect(env.AQE_V3_DOMAINS).toBe('test-generation,coverage-analysis');
      expect(env.AQE_V3_SWARM_SIZE).toBe('15');
    });

    it('should handle missing optional fields', () => {
      const config = {
        learning: { enabled: false },
        domains: { enabled: [] },
      } as any;

      const env = generateAqeEnvVars(config);

      expect(env.AQE_LEARNING_ENABLED).toBe('false');
      expect(env.AQE_V3_DOMAINS).toBe('');
      expect(env.AQE_V3_SWARM_SIZE).toBe('15'); // default
    });
  });

  describe('backupSettingsFile', () => {
    let dir: string;
    let settingsPath: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'aqe-settings-backup-'));
      settingsPath = join(dir, 'settings.json');
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('should return null and create nothing on a fresh install (no file)', () => {
      expect(backupSettingsFile(settingsPath)).toBeNull();
      expect(existsSync(`${settingsPath}.backup`)).toBe(false);
    });

    it('should back up the original content before modification', () => {
      const original = '{"env":{"MY":"original"}}';
      writeFileSync(settingsPath, original, 'utf-8');

      const backupPath = backupSettingsFile(settingsPath);

      expect(backupPath).toBe(`${settingsPath}.backup`);
      expect(readFileSync(backupPath as string, 'utf-8')).toBe(original);
    });

    it('should NOT overwrite an existing backup (preserve pristine original)', () => {
      // First init backs up the pristine original.
      writeFileSync(settingsPath, '{"pristine":true}', 'utf-8');
      backupSettingsFile(settingsPath);

      // Simulate a second init: settings.json now holds the AQE-merged version.
      writeFileSync(settingsPath, '{"merged":true}', 'utf-8');
      const second = backupSettingsFile(settingsPath);

      expect(second).toBeNull(); // no re-backup
      expect(readFileSync(`${settingsPath}.backup`, 'utf-8')).toBe('{"pristine":true}');
    });
  });

  describe('mergeAqeEnv', () => {
    const aqeEnv = { AQE_V3_MODE: 'true', AQE_LEARNING_ENABLED: 'true', AQE_V3_SWARM_SIZE: '15' };

    it('should return all AQE vars on a fresh install (no existing env)', () => {
      expect(mergeAqeEnv(undefined, aqeEnv)).toEqual(aqeEnv);
      expect(mergeAqeEnv({}, aqeEnv)).toEqual(aqeEnv);
    });

    it('should preserve a user override of an AQE_ variable', () => {
      const existing = { AQE_LEARNING_ENABLED: 'false' };
      const result = mergeAqeEnv(existing, aqeEnv);
      expect(result.AQE_LEARNING_ENABLED).toBe('false'); // user choice wins
      expect(result.AQE_V3_MODE).toBe('true'); // missing key filled in
      expect(result.AQE_V3_SWARM_SIZE).toBe('15');
    });

    it('should preserve non-AQE user env vars', () => {
      const existing = { MY_VAR: 'keep', NAGUAL_JUDGE_URL: 'http://localhost:11434' };
      const result = mergeAqeEnv(existing, aqeEnv);
      expect(result.MY_VAR).toBe('keep');
      expect(result.NAGUAL_JUDGE_URL).toBe('http://localhost:11434');
      expect(result.AQE_V3_MODE).toBe('true');
    });

    it('should not mutate the input objects', () => {
      const existing = { AQE_V3_MODE: 'false' };
      const source = { ...aqeEnv };
      mergeAqeEnv(existing, source);
      expect(existing).toEqual({ AQE_V3_MODE: 'false' });
      expect(source).toEqual(aqeEnv);
    });
  });

  describe('generateV3SettingsSections', () => {
    it('should generate statusLine, _aqePermissions, v3Configuration, v3Learning', () => {
      const config = {
        learning: { enabled: true, hnswConfig: { M: 8 }, promotionThreshold: 3, qualityThreshold: 0.7 },
        domains: { enabled: ['test-generation'] },
        agents: { maxConcurrent: 10 },
      } as any;

      const sections = generateV3SettingsSections(config);

      expect(sections.statusLine).toBeDefined();
      expect((sections.statusLine as any).enabled).toBe(true);

      expect(sections._aqePermissions).toBeDefined();
      expect(sections._aqePermissions).toContain('mcp__agentic-qe__*');

      expect(sections.v3Configuration).toBeDefined();
      expect((sections.v3Configuration as any).domains.total).toBe(1);

      expect(sections.v3Learning).toBeDefined();
      expect((sections.v3Learning as any).enabled).toBe(true);
      expect((sections.v3Learning as any).patternPromotion.threshold).toBe(3);
    });
  });

  describe('isAqeStatusLine', () => {
    it('should detect AQE statusline-v3.cjs command', () => {
      expect(
        isAqeStatusLine({ command: 'sh -c \'node ".claude/helpers/statusline-v3.cjs" || echo "▊ Agentic QE v3"\'' }),
      ).toBe(true);
    });

    it('should NOT detect a user custom status line', () => {
      expect(isAqeStatusLine({ command: 'my-prompt --powerline' })).toBe(false);
      expect(isAqeStatusLine(undefined)).toBe(false);
      expect(isAqeStatusLine({})).toBe(false);
    });
  });

  describe('applyV3Sections (non-destructive)', () => {
    const config = {
      learning: { enabled: true, hnswConfig: { M: 8 }, promotionThreshold: 3, qualityThreshold: 0.7 },
      domains: { enabled: ['test-generation'] },
      agents: { maxConcurrent: 10 },
    } as any;

    it('should preserve a user-defined custom statusLine', () => {
      const userStatusLine = { type: 'command', command: 'my-prompt --powerline', enabled: true };
      const settings: Record<string, unknown> = { statusLine: userStatusLine };

      applyV3Sections(settings, generateV3SettingsSections(config));

      expect(settings.statusLine).toEqual(userStatusLine);
    });

    it('should update AQE-owned statusLine and set it when absent', () => {
      const fresh: Record<string, unknown> = {};
      applyV3Sections(fresh, generateV3SettingsSections(config));
      expect((fresh.statusLine as any).command).toContain('statusline-v3.cjs');

      const stale: Record<string, unknown> = {
        statusLine: { type: 'command', command: 'node old/statusline-v3.cjs', enabled: false },
      };
      applyV3Sections(stale, generateV3SettingsSections(config));
      expect((stale.statusLine as any).enabled).toBe(true); // refreshed
    });

    it('should respect an explicit includeCoAuthoredBy=false', () => {
      const settings: Record<string, unknown> = { includeCoAuthoredBy: false };
      applyV3Sections(settings, generateV3SettingsSections(config));
      expect(settings.includeCoAuthoredBy).toBe(false);
    });

    it('should set includeCoAuthoredBy default when unset', () => {
      const settings: Record<string, unknown> = {};
      applyV3Sections(settings, generateV3SettingsSections(config));
      expect(settings.includeCoAuthoredBy).toBe(true);
    });

    it('should union-merge permissions without dropping user allow/deny', () => {
      const settings: Record<string, unknown> = {
        permissions: {
          allow: ['Bash(git:*)', 'mcp__ruflo__*'],
          deny: ['Read(./.env)'],
        },
      };

      applyV3Sections(settings, generateV3SettingsSections(config));

      const perms = settings.permissions as { allow: string[]; deny: string[] };
      expect(perms.allow).toContain('Bash(git:*)'); // user entry kept
      expect(perms.allow).toContain('mcp__ruflo__*'); // user entry kept
      expect(perms.allow).toContain('mcp__agentic-qe__*'); // AQE entry added
      expect(perms.deny).toEqual(['Read(./.env)']); // deny preserved untouched
    });

    it('should deep-merge AQE-owned sections and keep user-added keys', () => {
      const settings: Record<string, unknown> = {
        v3Learning: { customUserKey: 'keepme', patternPromotion: { userTuning: 42 } },
      };

      applyV3Sections(settings, generateV3SettingsSections(config));

      const v3l = settings.v3Learning as any;
      expect(v3l.customUserKey).toBe('keepme'); // user extra survives
      expect(v3l.patternPromotion.userTuning).toBe(42); // nested user extra survives
      expect(v3l.patternPromotion.threshold).toBe(3); // AQE value refreshed
      expect(v3l.enabled).toBe(true);
    });

    it('should not touch unrelated top-level user settings', () => {
      const settings: Record<string, unknown> = {
        model: 'claude-opus-4-8',
        someUserSetting: { foo: 'bar' },
      };

      applyV3Sections(settings, generateV3SettingsSections(config));

      expect(settings.model).toBe('claude-opus-4-8');
      expect(settings.someUserSetting).toEqual({ foo: 'bar' });
    });
  });
});
