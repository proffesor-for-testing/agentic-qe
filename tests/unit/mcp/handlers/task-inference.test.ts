/**
 * #1146: task_orchestrate inferred `optimize-learning` from any "learn",
 * "optimize" or "improve", and indexed (then refused) search descriptions
 * such as "semantic search for auth code" for lacking files to index.
 */
import { describe, expect, it } from 'vitest';
import { inferTaskType, isCodeSearch } from '../../../../src/mcp/handlers/task-inference.js';

describe('inferTaskType: learning wording (#1146)', () => {
  it.each([
    ['improve the login page performance', 'generate-tests'],
    ['optimize the checkout flow', 'generate-tests'],
    ['improve test coverage for src/auth', 'analyze-coverage'],
    ['improve code quality of the parser', 'assess-quality'],
    ['improve testability of the checkout epic', 'ideation-assessment'],
  ])('does not infer a learning optimisation from "%s"', (description, expected) => {
    expect(inferTaskType(description)).toBe(expected);
  });

  it.each([
    'optimize the learning strategies',
    'review the learned patterns',
    'learn from failed pipeline runs',
  ])('infers optimize-learning when learning itself is the subject: "%s"', (description) => {
    expect(inferTaskType(description)).toBe('optimize-learning');
  });
});

describe('code search descriptions (#1146)', () => {
  it.each([
    'semantic search for auth code',
    'search the codebase for token refresh',
    'Code search for parseConfig',
    'please search the repository for retry logic',
  ])('infers code intelligence for "%s" and recognises it as a search', (description) => {
    expect(inferTaskType(description)).toBe('index-code');
    expect(isCodeSearch(description)).toBe(true);
  });

  it('keeps an indexing request an index', () => {
    expect(inferTaskType('index the code knowledge graph')).toBe('index-code');
    expect(isCodeSearch('index the code knowledge graph')).toBe(false);
    expect(isCodeSearch('index src and build a semantic search')).toBe(false);
  });

  it('leaves descriptions that ask for other work alone', () => {
    expect(inferTaskType('search for security vulnerabilities')).toBe('scan-security');
    expect(isCodeSearch('generate tests for src/a.ts')).toBe(false);
  });
});
