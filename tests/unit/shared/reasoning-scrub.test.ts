/**
 * Unit tests for reasoning-tag scrubber (ADR-099)
 *
 * The scrubber strips extended-thinking blocks from text before it enters
 * the learning pipeline (trajectory persistence, distillation, embeddings).
 */

import { describe, it, expect } from 'vitest';
import { scrubReasoningBlocks, scrubReasoningDeep } from '../../../src/shared/reasoning-scrub';

describe('scrubReasoningBlocks', () => {
  it('should strip a thinking block and keep surrounding prose', () => {
    const input = '<thinking>secret scratchpad</thinking>real outcome';

    const result = scrubReasoningBlocks(input);

    expect(result).toBe('real outcome');
  });

  it('should strip think, reasoning and REASONING_SCRATCHPAD blocks', () => {
    const input =
      'a <think>t1</think> b <reasoning>t2</reasoning> c <REASONING_SCRATCHPAD>t3</REASONING_SCRATCHPAD> d';

    const result = scrubReasoningBlocks(input);

    expect(result).toBe('a b c d');
  });

  it('should match tag names case-insensitively', () => {
    const input = 'before <THINKING>upper</THINKING> after';

    const result = scrubReasoningBlocks(input);

    expect(result).toBe('before after');
  });

  it('should strip multiline blocks', () => {
    const input = 'fix applied\n<thinking>\nline one\nline two\n</thinking>\ntests green';

    const result = scrubReasoningBlocks(input);

    expect(result).not.toContain('line one');
    expect(result).toContain('fix applied');
    expect(result).toContain('tests green');
  });

  it('should strip multiple separate blocks without merging their gap', () => {
    const input = 'keep1 <thinking>a</thinking> keep2 <thinking>b</thinking> keep3';

    const result = scrubReasoningBlocks(input);

    expect(result).toBe('keep1 keep2 keep3');
  });

  it('should strip an open tag carrying attributes', () => {
    const input = 'x <thinking signature="abc">hidden</thinking> y';

    const result = scrubReasoningBlocks(input);

    expect(result).toBe('x y');
  });

  it('should handle nested same-tag blocks via repeated passes', () => {
    const input = 'a <thinking>outer <thinking>inner</thinking> tail</thinking> b';

    const result = scrubReasoningBlocks(input);

    expect(result).not.toContain('inner');
    expect(result).not.toContain('outer');
    expect(result).toContain('a');
    expect(result).toContain('b');
  });

  it('should leave prose mentioning a tag without a closing tag intact (boundary-gated)', () => {
    const input = 'the model emits <thinking> blocks which we strip before embedding';

    const result = scrubReasoningBlocks(input);

    expect(result).toBe(input);
  });

  it('should leave a lone closing tag intact', () => {
    const input = 'stray </thinking> in prose';

    const result = scrubReasoningBlocks(input);

    expect(result).toBe(input);
  });

  it('should not touch non-reasoning tags', () => {
    const input = '<div>markup</div> and <test>case</test> stay';

    const result = scrubReasoningBlocks(input);

    expect(result).toBe(input);
  });

  it('should return clean text unchanged (identity, no whitespace reflow)', () => {
    const input = 'indented\n    code block\n  stays';

    const result = scrubReasoningBlocks(input);

    expect(result).toBe(input);
  });

  it('should return empty and non-string input as-is', () => {
    expect(scrubReasoningBlocks('')).toBe('');
    expect(scrubReasoningBlocks(undefined as unknown as string)).toBeUndefined();
  });

  it('should tolerate whitespace before > in the closing tag', () => {
    const input = 'a <thinking>x</thinking > b';

    const result = scrubReasoningBlocks(input);

    expect(result).toBe('a b');
  });
});

describe('scrubReasoningDeep', () => {
  it('should scrub string leaves in nested objects and arrays', () => {
    const input = {
      summary: '<thinking>internal</thinking>done',
      steps: ['ok', '<reasoning>why</reasoning>applied fix'],
      nested: { note: 'plain' },
      count: 3,
    };

    const result = scrubReasoningDeep(input);

    expect(result.summary).toBe('done');
    expect(result.steps[1]).toBe('applied fix');
    expect(result.nested.note).toBe('plain');
    expect(result.count).toBe(3);
  });

  it('should pass through null and primitives unchanged', () => {
    expect(scrubReasoningDeep(null)).toBeNull();
    expect(scrubReasoningDeep(42)).toBe(42);
    expect(scrubReasoningDeep(true)).toBe(true);
  });
});
