/**
 * Issue #1494: the Claude Code plugin ships 9 of the AQE skills, plus agents and
 * commands. A plugin-only install gets just the plugin directory, so every relative
 * link in it must resolve inside that directory: a link to a sibling skill the plugin
 * does not ship is a dead end there, even though it works in a full `aqe init` install.
 *
 * Copies `plugins/agentic-qe-fleet` on its own into a scratch directory (as Claude Code
 * does when it installs a plugin) and runs the #1457 checker over it. Project paths
 * (`.claude/...`) are not checked here: they point into the user's project, not the
 * plugin directory.
 */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findBrokenReferences, walk } from './helpers/skill-link-check.js';

const PLUGIN_SRC = resolve(__dirname, '..', '..', '..', 'plugins', 'agentic-qe-fleet');
const TREES = ['skills', 'agents', 'commands'];

describe('plugin-only install has no broken links (#1494)', () => {
  let pluginRoot: string;
  let scratch: string;

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'aqe-plugin-links-1494-'));
    pluginRoot = join(scratch, 'agentic-qe-fleet');
    cpSync(PLUGIN_SRC, pluginRoot, { recursive: true, filter: (src) => !src.includes('node_modules') });
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('copies the trees it checks', () => {
    expect(walk(join(pluginRoot, 'skills')).length).toBeGreaterThan(9);
    expect(walk(join(pluginRoot, 'agents')).length).toBeGreaterThan(5);
    expect(walk(join(pluginRoot, 'commands')).length).toBeGreaterThan(5);
  });

  it('every relative link in the plugin resolves inside the plugin', () => {
    expect(findBrokenReferences(pluginRoot, TREES, { projectPaths: false })).toEqual([]);
  });

  it('reports a link to a skill the plugin does not ship, and a link out of the plugin', () => {
    const rel = 'skills/qe-test-generation/probe-1494.md';
    writeFileSync(
      join(pluginRoot, rel),
      [
        '- [shift-right-testing](../shift-right-testing/) - not shipped in the plugin',
        '- [tdd-london-chicago](../tdd-london-chicago/) - shipped: resolves',
        '- [src](../../../../src/index.ts) - outside the plugin directory',
        'Run `scripts/missing-1494.sh`.',
      ].join('\n'),
    );
    try {
      const found = findBrokenReferences(pluginRoot, ['skills'], { projectPaths: false })
        .filter((f) => f.includes('probe-1494'));
      expect(found).toEqual([
        `${rel}:1: link ../shift-right-testing/`,
        `${rel}:3: link ../../../../src/index.ts`,
        `${rel}:4: path scripts/missing-1494.sh`,
        `${rel}:4: script scripts/missing-1494.sh`,
      ]);
    } finally {
      rmSync(join(pluginRoot, rel), { force: true });
    }
  });
});
