/**
 * Task hook CLI - agent extraction tests (Issue #460)
 *
 * Regression coverage for the PostToolUse stdin path. `$TOOL_INPUT_subagent_type`
 * env-var substitution is not reliable on every hook surface (same class of
 * problem #453's file-path fallback and the UserPromptSubmit prompt fallback
 * exist to work around). Before this fix, post-task's `agent` collapsed to
 * 'unknown' whenever the env var resolved empty, so every rl_q_values row
 * landed in the same state-action bucket and the router could never learn
 * per-agent differentiation.
 */

import { describe, it, expect } from 'vitest';
import { extractAgentFromEvent } from '../../../../src/cli/commands/hooks-handlers/hooks-shared.js';

describe('extractAgentFromEvent', () => {
  it('returns empty string for empty input', () => {
    expect(extractAgentFromEvent('')).toBe('');
    expect(extractAgentFromEvent('   ')).toBe('');
  });

  it('reads tool_input.subagent_type for PostToolUse Task events (snake_case)', () => {
    const event = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Task',
      tool_input: { subagent_type: 'qe-test-architect' },
    });
    expect(extractAgentFromEvent(event)).toBe('qe-test-architect');
  });

  it('reads toolInput.subagentType for Task tool events (camelCase)', () => {
    const event = JSON.stringify({
      toolInput: { subagentType: 'qe-coverage-specialist' },
    });
    expect(extractAgentFromEvent(event)).toBe('qe-coverage-specialist');
  });

  it('falls back to a top-level subagent_type field', () => {
    const event = JSON.stringify({ subagent_type: 'qe-security-auditor' });
    expect(extractAgentFromEvent(event)).toBe('qe-security-auditor');
  });

  it('returns empty string when no recognized field is present', () => {
    const event = JSON.stringify({ unrelated: 'data', count: 5 });
    expect(extractAgentFromEvent(event)).toBe('');
  });

  it('ignores empty or whitespace-only subagent_type fields and tries the next candidate', () => {
    const event = JSON.stringify({
      tool_input: { subagent_type: '' },
      subagentType: '   ',
      subagent_type: 'qe-flaky-hunter',
    });
    expect(extractAgentFromEvent(event)).toBe('qe-flaky-hunter');
  });

  it('does not crash on malformed JSON — returns empty string', () => {
    expect(extractAgentFromEvent('{not valid json')).toBe('');
  });
});
