/**
 * Routing hook CLI - prompt extraction tests
 *
 * Regression coverage for the UserPromptSubmit stdin path. Claude Code
 * delivers the prompt body on stdin as a JSON event ({prompt: "..."}),
 * not as an env var. Before this fix, the init template passed
 * --task "$PROMPT" which the shell expanded to "" — so every routing
 * decision saw an empty task and routing_outcomes.task_json ended up
 * {"description":""} on every entry, breaking the learning loop.
 */

import { describe, it, expect } from 'vitest';
import { extractPromptFromEvent } from '../../../../src/cli/commands/hooks-handlers/routing-hooks.js';

describe('extractPromptFromEvent', () => {
  it('returns empty string for empty input', () => {
    expect(extractPromptFromEvent('')).toBe('');
    expect(extractPromptFromEvent('   ')).toBe('');
  });

  it('extracts prompt from UserPromptSubmit event shape', () => {
    const event = JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'abc',
      prompt: 'generate tests for auth module',
    });
    expect(extractPromptFromEvent(event)).toBe('generate tests for auth module');
  });

  it('falls back to user_prompt field', () => {
    const event = JSON.stringify({ user_prompt: 'find coverage gaps' });
    expect(extractPromptFromEvent(event)).toBe('find coverage gaps');
  });

  it('extracts command from PreToolUse Bash events', () => {
    const event = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      command: 'npm test',
    });
    expect(extractPromptFromEvent(event)).toBe('npm test');
  });

  it('reads tool_input.prompt for Task tool events (snake_case)', () => {
    const event = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Task',
      tool_input: { prompt: 'review PR for security issues' },
    });
    expect(extractPromptFromEvent(event)).toBe('review PR for security issues');
  });

  it('reads toolInput.description for Task tool events (camelCase)', () => {
    const event = JSON.stringify({
      toolInput: { description: 'run security scan' },
    });
    expect(extractPromptFromEvent(event)).toBe('run security scan');
  });

  it('treats non-JSON input as the prompt body verbatim', () => {
    expect(extractPromptFromEvent('plain text prompt\n')).toBe('plain text prompt');
  });

  it('returns empty string when no recognized field is present', () => {
    const event = JSON.stringify({ unrelated: 'data', count: 5 });
    expect(extractPromptFromEvent(event)).toBe('');
  });

  it('ignores empty or whitespace-only prompt fields and tries the next candidate', () => {
    const event = JSON.stringify({
      prompt: '',
      command: '   ',
      user_prompt: 'real prompt',
    });
    expect(extractPromptFromEvent(event)).toBe('real prompt');
  });

  it('does not crash on malformed JSON — falls through to verbatim path', () => {
    expect(extractPromptFromEvent('{not valid json')).toBe('{not valid json');
  });
});
