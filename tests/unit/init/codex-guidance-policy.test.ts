import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CODEX_COMPACT_GUIDANCE_MAX_BYTES,
  createCodexInstaller,
} from '../../../src/init/codex-installer.js';

const START = '<!-- BEGIN AGENTIC-QE CODEX -->';
const END = '<!-- END AGENTIC-QE CODEX -->';

describe('Codex guidance policy', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function projectRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'aqe-codex-guidance-'));
    roots.push(root);
    return root;
  }

  it('should_writeCompactGuidance_withinDocumentedByteBudget', async () => {
    const root = projectRoot();

    const result = await createCodexInstaller({
      projectRoot: root,
      installMcp: false,
      guidancePolicy: 'compact',
    }).install();

    const content = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(result.guidancePolicy).toBe('compact');
    expect(result.ownedGuidanceBytes).toBe(Buffer.byteLength(content));
    expect(result.ownedGuidanceBytes).toBeLessThanOrEqual(CODEX_COMPACT_GUIDANCE_MAX_BYTES);
    expect(content).toContain('Discover AQE tools and skills from their live schemas');
  });

  it('should_removeEveryWellFormedOwnedBlock_andPreserveForeignBytes_when_policyIsNone', async () => {
    const root = projectRoot();
    const existing = `alpha\r\n${START}\r\nold one\r\n${END}\r\nbeta\r\n${START}\r\nold two\r\n${END}\r\nomega\r\n`;
    writeFileSync(join(root, 'AGENTS.md'), existing);

    const result = await createCodexInstaller({
      projectRoot: root,
      installMcp: false,
      guidancePolicy: 'none',
    }).install();

    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe('alpha\r\nbeta\r\nomega\r\n');
    expect(result.ownedGuidanceBytes).toBe(0);
    expect(result.components.rules.status).toBe('updated');
  });

  it('should_notCreateAgentsFile_when_nonePolicyHasNoOwnedBlock', async () => {
    const root = projectRoot();

    const result = await createCodexInstaller({
      projectRoot: root,
      installMcp: false,
      guidancePolicy: 'none',
    }).install();

    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
    expect(result.ownedGuidanceBytes).toBe(0);
  });

  it('should_writeOnlyCompactBlock_when_existingAgentsFileIsEmpty', async () => {
    const root = projectRoot();
    writeFileSync(join(root, 'AGENTS.md'), '');

    await createCodexInstaller({
      projectRoot: root,
      installMcp: false,
      guidancePolicy: 'compact',
    }).install();

    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toMatch(/^<!-- BEGIN AGENTIC-QE CODEX -->/);
  });

  it('should_collapseDuplicateOwnedBlocks_when_compactPolicyIsApplied', async () => {
    const root = projectRoot();
    writeFileSync(join(root, 'AGENTS.md'), `before\n${START}\nold one\n${END}\nmiddle\n${START}\nold two\n${END}\nafter\n`);

    await createCodexInstaller({
      projectRoot: root,
      installMcp: false,
      guidancePolicy: 'compact',
    }).install();

    const content = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(content.match(/BEGIN AGENTIC-QE CODEX/g)).toHaveLength(1);
    expect(content).toContain('before\n');
    expect(content).toContain('middle\n');
    expect(content).toContain('after\n');
  });

  it('should_preserveMalformedSentinel_when_policyIsNone', async () => {
    const root = projectRoot();
    const malformed = `user bytes\n${START}\nunterminated user-visible text\n`;
    writeFileSync(join(root, 'AGENTS.md'), malformed);

    const result = await createCodexInstaller({
      projectRoot: root,
      installMcp: false,
      guidancePolicy: 'none',
    }).install();

    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(malformed);
    expect(result.success).toBe(false);
    expect(result.components.rules.status).toBe('failed');
    expect(result.errors[0]).toContain('Malformed Agentic QE Codex sentinel');
  });

  it('should_remainByteIdempotent_withCrLf_when_compactPolicyRunsAgain', async () => {
    const root = projectRoot();
    writeFileSync(join(root, 'AGENTS.md'), 'user line\r\n');
    const options = { projectRoot: root, installMcp: false, guidancePolicy: 'compact' as const };

    await createCodexInstaller(options).install();
    const first = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    await createCodexInstaller(options).install();
    const second = readFileSync(join(root, 'AGENTS.md'), 'utf8');

    expect(second).toBe(first);
    expect(second).toContain('\r\n');
    expect(second.match(/BEGIN AGENTIC-QE CODEX/g)).toHaveLength(1);
  });
});
