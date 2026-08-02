import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

interface HookCommand {
  type: string;
  command: string;
  timeout: number;
}

interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
}

describe('Codex hooks configuration contract', () => {
  const config = JSON.parse(readFileSync(join(REPO_ROOT, '.codex/hooks.json'), 'utf8')) as {
    hooks: Record<string, HookGroup[]>;
  };

  it('should_defineRequiredEventsAndMatchers_when_packaged', () => {
    expect(Object.keys(config.hooks)).toEqual([
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PreCompact',
      'SubagentStart',
      'SubagentStop',
      'Stop',
    ]);
    expect(config.hooks.SessionStart.map((group) => group.matcher)).toEqual([
      'startup|resume|clear|compact',
    ]);
    expect(config.hooks.PreToolUse.map((group) => group.matcher)).toEqual([
      '^Bash$',
      '^(apply_patch|Edit|Write)$',
    ]);
    expect(config.hooks.PostToolUse.map((group) => group.matcher)).toEqual([
      '^Bash$',
      '^(apply_patch|Edit|Write)$',
    ]);
    expect(config.hooks.PreCompact.map((group) => group.matcher)).toEqual(['manual|auto']);
  });

  it('should_referenceAqeAndRufloAdapters_for_sharedLifecycleEvents', () => {
    const sharedEvents = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'];

    for (const event of sharedEvents) {
      for (const group of config.hooks[event]) {
        const commands = group.hooks.map((hook) => hook.command);
        expect(commands.some((command) => command.includes('/aqe-codex-hook.cjs')),
          `${event} must reference the AQE adapter`).toBe(true);
        expect(commands.some((command) => command.includes('/ruflo-codex-hook.cjs')),
          `${event} must reference the Ruflo adapter`).toBe(true);
      }
    }
  });

  it('should_referenceExistingLocalScripts_with_boundedCommandSchema', () => {
    const commands = Object.values(config.hooks)
      .flatMap((groups) => groups)
      .flatMap((group) => group.hooks);

    expect(commands.length).toBeGreaterThan(0);
    for (const hook of commands) {
      expect(hook.type).toBe('command');
      expect(hook.timeout).toBeGreaterThan(0);
      expect(hook.timeout).toBeLessThanOrEqual(60);

      const script = hook.command.match(/\.codex\/hooks\/([a-z0-9-]+\.cjs)/i)?.[1];
      expect(script, `local script missing from command: ${hook.command}`).toBeDefined();
      expect(existsSync(join(REPO_ROOT, '.codex/hooks', script!)),
        `${script} must exist beside hooks.json`).toBe(true);
    }
  });
});
