/**
 * Claude Code PreToolUse payload builders and guide-command runners for #1470 hook tests.
 */
import { expect } from 'vitest';
import { cpSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fencedBlockAfter, type BsdHarness, type RunResult } from './bsd-grep-env';

export const BLOCKED = 2;
export const ALLOWED = 0;

export const write = (filePath: string, content: string): string =>
  JSON.stringify({ session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: filePath, content } });
export const edit = (filePath: string, newString: string): string =>
  JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath, old_string: 'placeholder', new_string: newString } });
export const multiEdit = (filePath: string, ...newStrings: string[]): string =>
  JSON.stringify({
    tool_name: 'MultiEdit',
    tool_input: { file_path: filePath, edits: newStrings.map((s) => ({ old_string: 'placeholder', new_string: s })) },
  });

/** Payloads that must never read as "allowed". */
export const MALFORMED_PAYLOADS: Array<[string, string]> = [
  ['truncated JSON', '{"tool_name":"Write","tool_input":{"file_path":"/r/a.test.ts","content":"x'],
  ['no tool_input', '{"tool_name":"Write"}'],
  ['null tool_input', '{"tool_input":null}'],
  ['array tool_input', '{"tool_input":[]}'],
  ['non-string file_path', '{"tool_input":{"file_path":42,"content":"x"}}'],
];

export const BOM = '﻿';

/** Stage the packaged skill into a fresh project, as an install would. */
export function stagedProject(h: BsdHarness, skill: string): string {
  const dir = mkdtempSync(join(h.work, `${skill}-`));
  cpSync(join(ROOT, 'assets/skills', skill), join(dir, '.claude/skills', skill), { recursive: true });
  return dir;
}

/** The `command` from the guide's settings.json example. */
export function guideHookCommand(skill: string): string {
  const config = JSON.parse(fencedBlockAfter(`assets/skills/${skill}/SKILL.md`, '## Hook Configuration', 'json'));
  const group = config.hooks.PreToolUse[0];
  expect(group.matcher).toBe('Write|Edit|MultiEdit');
  expect(group.hooks[0].type).toBe('command');
  return group.hooks[0].command as string;
}

export function guideManualCommands(skill: string, heading: string): string[] {
  const cmds = fencedBlockAfter(`assets/skills/${skill}/SKILL.md`, heading, 'bash')
    .split('\n').filter((l) => /^(bash|printf) /.test(l));
  expect(cmds.length, `${skill} manual commands`).toBeGreaterThanOrEqual(2);
  return cmds;
}

/** Run the guide's hook command from a staged project with a hook payload on stdin. */
export function runGuideHook(h: BsdHarness, skill: string, payload: string): RunResult {
  const project = stagedProject(h, skill);
  return h.run('bash', ['-c', guideHookCommand(skill)], { cwd: project, input: payload, env: h.env({ CLAUDE_PROJECT_DIR: project }) });
}

/** Run each documented manual command from a staged project with `vars` in the environment. */
export function runGuideManual(h: BsdHarness, skill: string, heading: string, vars: Record<string, string>): RunResult[] {
  const project = stagedProject(h, skill);
  return guideManualCommands(skill, heading).map((command) => h.run('bash', ['-c', command], { cwd: project, env: h.env(vars) }));
}

export function expectBlocked(r: RunResult, reason: RegExp): void {
  expect(r.status, r.stdout + r.stderr).toBe(BLOCKED);
  expect(r.stderr).toMatch(reason);
  expect(r.stderr).not.toMatch(/invalid option/);
}
