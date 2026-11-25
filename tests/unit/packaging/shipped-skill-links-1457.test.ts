/**
 * Issue #1457: skills, agents, guidance and OpenCode/Kiro/Codex configs that `aqe init`
 * installs must not point at files that are not there.
 *
 * Installs the real packaged content (Claude Code skills, agents and guidance, Kiro,
 * OpenCode, Codex) into a scratch project, then checks every text file it wrote
 * (helpers/skill-link-check.ts) for:
 * - Markdown links: inline `[x](t)`, `[x](<t>)`, `[x](t "title")` and reference
 *   definitions `[x]: t`, in .md files and in yaml/json prompts; absolute targets fail;
 * - backticked skill-local paths (`steps/...`, `schemas/...`, `scripts/...`, ...);
 * - project paths into `.claude/{skills,agents,helpers,guidance}/`, `.kiro/`, `.opencode/`;
 * - bare `scripts/<file>.<ext>` paths, which must resolve in the skill or the project;
 * - `node_modules/agentic-qe/<path>` paths, which must exist in this package and be
 *   covered by package.json `files`.
 *
 * There is no allowlist: a new broken link fails this test.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSkillsInstaller } from '../../../src/init/skills-installer.js';
import { createAgentsInstaller } from '../../../src/init/agents-installer.js';
import { createKiroInstaller } from '../../../src/init/kiro-installer.js';
import { createOpenCodeInstaller } from '../../../src/init/opencode-installer.js';
import { createCodexInstaller } from '../../../src/init/codex-installer.js';
import { createGovernanceInstaller } from '../../../src/init/governance-installer.js';
import { findBrokenReferences, walk } from './helpers/skill-link-check.js';

describe('installed skills, agents and OpenCode configs have no broken references (#1457)', () => {
  let projectRoot: string;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    projectRoot = mkdtempSync(join(tmpdir(), 'aqe-links-1457-'));
    writeFileSync(join(projectRoot, 'package.json'), '{"name":"fx"}\n');
    await createSkillsInstaller({ projectRoot, installV2Skills: true, installV3Skills: true }).install();
    await createAgentsInstaller({ projectRoot, installQEAgents: true, installSubagents: true }).install();
    await createKiroInstaller({ projectRoot }).install();
    await createOpenCodeInstaller({ projectRoot }).install();
    await createCodexInstaller({ projectRoot, includeRuflo: true }).install();
    await createGovernanceInstaller({ projectRoot }).install();
  }, 180_000);

  afterAll(() => {
    vi.restoreAllMocks();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('installs the trees it checks', () => {
    for (const tree of ['.claude/skills', '.claude/agents', '.claude/guidance', '.kiro/skills', '.kiro/agents', '.opencode/skills', '.opencode/agent', '.agents/skills']) {
      expect(walk(join(projectRoot, tree)).length, tree).toBeGreaterThan(10);
    }
  });

  it('every relative link and path in installed content resolves', () => {
    expect(findBrokenReferences(projectRoot)).toEqual([]);
  });

  it('installed URL-fetch instructions treat a degraded fetch-content.cjs result as a failure', () => {
    // fetch-content.cjs exits 0 with status "degraded" and a placeholder page when every
    // real tier fails; the agent must fall back to WebFetch instead of analysing it.
    for (const rel of [
      '.claude/skills/qcsd-ideation-swarm/steps/01-flag-detection.md',
      '.kiro/skills/qcsd-ideation-swarm/steps/01-flag-detection.md',
      '.claude/agents/v3/qe-qx-partner.md',
      '.opencode/agent/qe-qx-partner.md',
    ]) {
      const text = readFileSync(join(projectRoot, rel), 'utf8');
      expect(text, rel).toContain('fetch-content.cjs');
      expect(text, rel).toMatch(/degraded/);
      expect(text, rel).toContain('WebFetch');
    }
  });

  it('qcsd-development-swarm does not make the uninstalled workflow its primary path', () => {
    expect(walk(join(projectRoot, '.claude', 'workflows'))).toEqual([]);
    for (const rel of [
      '.claude/skills/qcsd-development-swarm/SKILL.md',
      '.kiro/skills/qcsd-development-swarm/SKILL.md',
    ]) {
      const text = readFileSync(join(projectRoot, rel), 'utf8');
      expect(text, rel).not.toMatch(/^\s*primary:\s*workflow\b/m);
      expect(text, rel).not.toContain('**Workflow** (PRIMARY');
      expect(text, rel).toContain('**Task Tool** (PRIMARY)');
    }
  });

  /** Write probe files, run the checker over the trees they sit in, return only their findings. */
  function probe(files: Record<string, string>): string[] {
    const paths = Object.keys(files).map((rel) => join(projectRoot, rel));
    Object.entries(files).forEach(([rel, body]) => writeFileSync(join(projectRoot, rel), body));
    try {
      const trees = [...new Set(Object.keys(files).map((rel) => rel.split('/').slice(0, 2).join('/')))];
      return findBrokenReferences(projectRoot, trees).filter((f) => f.includes('probe-1457'));
    } finally {
      paths.forEach((f) => rmSync(f, { force: true }));
    }
  }

  it('reports each kind of broken link and path', () => {
    const md = '.claude/skills/qe-test-generation/probe-1457.md';
    const found = probe({
      [md]: [
        '[gone](../continuous-testing-shift-left/)',
        'Read `steps/01a-url-fetch.md`.',
        'node .claude/skills/testability-scorer/scripts/x.js',
        'via scripts/fetch-content.js',
        'node node_modules/agentic-qe/scripts/does-not-exist.cjs',
        '[angle](<steps/missing.md>)',
        '[titled](missing.md "Title")',
        '[ref]: ../missing-ref/',
        '[abs](/x.md)',
        'Read `.claude/agents/v3/qe-missing.md`.',
        'Run .claude/helpers/missing-helper.cjs',
        'See .kiro/skills/qe-missing/SKILL.md and .opencode/agent/qe-missing.md',
        '```bash',
        'node .claude/helpers/fenced-missing.cjs',
        '```',
      ].join('\n'),
    });
    expect(found).toEqual([
      `${md}:1: link ../continuous-testing-shift-left/`,
      `${md}:2: path steps/01a-url-fetch.md`,
      `${md}:3: path .claude/skills/testability-scorer/scripts/x.js`,
      `${md}:4: script scripts/fetch-content.js`,
      `${md}:5: package path scripts/does-not-exist.cjs`,
      `${md}:6: link steps/missing.md`,
      `${md}:7: link missing.md`,
      `${md}:8: link ../missing-ref/`,
      `${md}:9: absolute link /x.md`,
      `${md}:10: path .claude/agents/v3/qe-missing.md`,
      `${md}:11: path .claude/helpers/missing-helper.cjs`,
      `${md}:12: path .kiro/skills/qe-missing/SKILL.md`,
      `${md}:12: path .opencode/agent/qe-missing.md`,
      `${md}:14: path .claude/helpers/fenced-missing.cjs`,
    ]);
  });

  it('checks links in OpenCode, Kiro agent and guidance files too', () => {
    const found = probe({
      '.opencode/agent/probe-1457.md': 'See [x](../missing-agent.md).',
      '.kiro/agents/probe-1457.json': '{"prompt": "Read [y](missing.md)\\nthen .claude/agents/v3/qe-gone.md"}',
      '.claude/guidance/probe-1457.md': '[adr](../../docs/adrs/ADR-000.md)',
    });
    expect(found.sort()).toEqual([
      '.claude/guidance/probe-1457.md:1: link ../../docs/adrs/ADR-000.md',
      '.kiro/agents/probe-1457.json:1: link missing.md',
      '.kiro/agents/probe-1457.json:2: path .claude/agents/v3/qe-gone.md',
      '.opencode/agent/probe-1457.md:1: link ../missing-agent.md',
    ]);
  });

  it('does not report things that are not paths', () => {
    const found = probe({
      '.claude/skills/qe-test-generation/probe-1457.md': [
        '[ok](../qe-test-execution/) [url](https://example.com/a.md) [anchor](#top)',
        '`node_modules/agentic-qe/schemas/finding-verdict.schema.json`',
        'The fleet lives in `.claude/agents/v3/qe-*.md`; add `.claude/skills/{name}/SKILL.md`.',
        '```css',
        '[role="button"]:focus-visible { outline: 2px; }',
        '```',
        '[tmpl]({SKILL_DIR}/x.md)',
      ].join('\n'),
      '.claude/skills/qe-test-generation/probe-1457.yaml': '- "8[0-9](\\\\.\\\\d+)?%"\n',
    });
    expect(found).toEqual([]);
  });
});
