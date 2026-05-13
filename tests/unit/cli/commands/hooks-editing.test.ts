/**
 * Editing hook CLI - file_path extraction tests (#453)
 *
 * Regression coverage for the PostToolUse stdin path. Claude Code delivers
 * the edited file path on stdin as a JSON event (tool_input.file_path), not
 * as a reliable env var. Before this fix, the init template passed
 * --file "$TOOL_INPUT_file_path" which expanded to "" in many hook surfaces
 * — so 88% of captured_experiences rows ended up tagged `task = "edit: "`
 * with no file path, useless embeddings, and zero pattern lookups.
 */

import { describe, it, expect } from 'vitest';
import { extractFilePathFromEvent } from '../../../../src/cli/commands/hooks-handlers/hooks-shared.js';

describe('extractFilePathFromEvent', () => {
  it('returns empty string for empty input', () => {
    expect(extractFilePathFromEvent('')).toBe('');
    expect(extractFilePathFromEvent('   ')).toBe('');
  });

  it('extracts file_path from PostToolUse Edit events (snake_case)', () => {
    const event = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: '/workspaces/agentic-qe/src/example.ts',
        old_string: 'foo',
        new_string: 'bar',
      },
    });
    expect(extractFilePathFromEvent(event)).toBe(
      '/workspaces/agentic-qe/src/example.ts'
    );
  });

  it('extracts file_path from Write events', () => {
    const event = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: {
        file_path: '/tmp/output.json',
        content: '{}',
      },
    });
    expect(extractFilePathFromEvent(event)).toBe('/tmp/output.json');
  });

  it('extracts file_path from camelCase toolInput envelopes', () => {
    const event = JSON.stringify({
      toolInput: { file_path: '/src/legacy.ts' },
    });
    expect(extractFilePathFromEvent(event)).toBe('/src/legacy.ts');
  });

  it('falls back to camelCase filePath inside snake_case envelope', () => {
    const event = JSON.stringify({
      tool_input: { filePath: '/src/mixed.ts' },
    });
    expect(extractFilePathFromEvent(event)).toBe('/src/mixed.ts');
  });

  it('falls back to top-level file_path when no tool_input envelope is present', () => {
    const event = JSON.stringify({ file_path: '/src/top-level.ts' });
    expect(extractFilePathFromEvent(event)).toBe('/src/top-level.ts');
  });

  it('returns empty string when no recognized field is present', () => {
    const event = JSON.stringify({ unrelated: 'data', count: 5 });
    expect(extractFilePathFromEvent(event)).toBe('');
  });

  it('ignores empty or whitespace-only file_path candidates', () => {
    const event = JSON.stringify({
      tool_input: { file_path: '   ' },
      toolInput: { file_path: '/src/winner.ts' },
    });
    expect(extractFilePathFromEvent(event)).toBe('/src/winner.ts');
  });

  it('does not crash on malformed JSON — returns empty string', () => {
    expect(extractFilePathFromEvent('{not valid json')).toBe('');
  });

  it('does not throw on non-string file_path values', () => {
    const event = JSON.stringify({ tool_input: { file_path: 42 } });
    expect(extractFilePathFromEvent(event)).toBe('');
  });
});
