/**
 * Test: Settings Merge Utilities
 *
 * Verifies that aqe init --auto correctly handles:
 * - Fresh installs (no existing settings)
 * - Updating existing AQE hooks (replace, don't duplicate)
 * - Preserving non-AQE hooks from user config
 * - Handling mixed old/new AQE command variants
 */

import { describe, it, expect } from 'vitest';
import {
  isAqeHookEntry,
  mergeHooksSmart,
  generateAqeEnvVars,
  generateV3SettingsSections,
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

    it('should handle entries without hooks array', () => {
      expect(isAqeHookEntry({})).toBe(false);
      expect(isAqeHookEntry(null)).toBe(false);
      expect(isAqeHookEntry({ hooks: 'not-an-array' })).toBe(false);
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

  describe('generateV3SettingsSections', () => {
    it('should generate statusLine, permissions, v3Configuration, v3Learning', () => {
      const config = {
        learning: { enabled: true, hnswConfig: { M: 8 }, promotionThreshold: 3, qualityThreshold: 0.7 },
        domains: { enabled: ['test-generation'] },
        agents: { maxConcurrent: 10 },
      } as any;

      const sections = generateV3SettingsSections(config);

      expect(sections.statusLine).toBeDefined();
      expect((sections.statusLine as any).enabled).toBe(true);

      expect(sections.permissions).toBeDefined();
      expect((sections.permissions as any).deny).toContain('Bash(rm -rf /)');

      expect(sections.v3Configuration).toBeDefined();
      expect((sections.v3Configuration as any).domains.total).toBe(1);

      expect(sections.v3Learning).toBeDefined();
      expect((sections.v3Learning as any).enabled).toBe(true);
      expect((sections.v3Learning as any).patternPromotion.threshold).toBe(3);
    });
  });
});
