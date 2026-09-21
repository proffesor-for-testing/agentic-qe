import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

type Step = { name?: string; if?: string };
type Job = { if?: string; steps: Step[] };
const root = resolve(import.meta.dirname, '../../..');
const workflows = [
  ['optimized-ci.yml', 'dashboard', 'Comment on PR'],
  ['mcp-tools-test.yml', 'mcp-summary', 'Create summary comment'],
  ['skill-validation.yml', 'report', 'Comment on PR'],
] as const;

// These workflow guards use comparisons and boolean operators shared by
// JavaScript and Actions expressions. Exercise the actual YAML conditions.
function allowed(condition: string | undefined, event: string, headRepo?: string): boolean {
  if (!condition) return true;
  return Boolean(runInNewContext(condition, {
    always: () => true,
    github: {
      event_name: event,
      repository: 'upstream/agentic-qe',
      event: headRepo ? { pull_request: { head: { repo: { full_name: headRepo } } } } : {},
    },
  }));
}

describe.each(workflows)('%s PR reporting permissions', (file, jobName, stepName) => {
  const workflow = parse(readFileSync(resolve(root, '.github/workflows', file), 'utf8'));
  const job: Job = workflow.jobs[jobName];
  const comment = job.steps.find((step) => step.name === stepName)!;

  it('keeps the reporting job available but skips writes for fork PRs', () => {
    expect(comment).toBeDefined();
    expect(allowed(job.if, 'pull_request', 'contributor/agentic-qe')).toBe(true);
    expect(allowed(comment.if, 'pull_request', 'contributor/agentic-qe')).toBe(false);
  });

  it('retains comments for same-repository PRs', () => {
    expect(allowed(job.if, 'pull_request', 'upstream/agentic-qe')).toBe(true);
    expect(allowed(comment.if, 'pull_request', 'upstream/agentic-qe')).toBe(true);
  });

  it.each(['push', 'workflow_dispatch'])('does not post a PR comment on %s', (event) => {
    expect(allowed(job.if, event) && allowed(comment.if, event)).toBe(false);
  });
});
