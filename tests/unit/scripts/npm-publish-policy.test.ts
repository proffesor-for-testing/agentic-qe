import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(import.meta.dirname, '../../../.github/workflows/npm-publish.yml'),
  'utf8',
);

describe('npm publish workflow policy', () => {
  it('keeps manual workflow dispatch dry-run only', () => {
    expect(workflow).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("if: github.event_name == 'release'");
    expect(workflow).not.toContain('github.event.inputs.dry_run');
  });

  it('passes the absolute sealed artifact directly to consumer install', () => {
    expect(workflow).toContain(
      'npm install --no-audit --no-fund "${{ steps.pack.outputs.tarball }}"',
    );
    expect(workflow).not.toContain(
      '"${GITHUB_WORKSPACE}/${{ steps.pack.outputs.tarball }}"',
    );
  });

  it('binds release publication to current merged main', () => {
    expect(workflow).toContain('git fetch origin main --no-tags --depth=1');
    expect(workflow).toContain('if [ "$TAG_SHA" != "$MAIN_SHA" ]; then');
  });
});
