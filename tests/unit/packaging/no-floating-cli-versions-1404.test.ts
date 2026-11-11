/**
 * Issue #1404: shipped and generated files must not tell an agent to run a
 * third-party CLI through a floating version. A dist-tag (`npx foo@latest`,
 * `claude-flow@v3alpha`), a range (`ruflo@3`) or no version at all (`npx ruflo`)
 * each run whatever was published last, with the agent's privileges.
 *
 * Scanned: everything `package.json#files` ships (dist is covered through src/),
 * the Claude plugin marketplace tree, the repo's own Kiro config, src/, and the
 * tree the `aqe init` installers write into a fresh project.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AGENTDB_PINNED_VERSION,
  FLOW_NEXUS_PINNED_VERSION,
  RUFLO_PINNED_VERSION,
} from '../../../src/shared/pinned-tools.js';
import { createSkillsInstaller } from '../../../src/init/skills-installer.js';
import { createAgentsInstaller } from '../../../src/init/agents-installer.js';
import { createKiroInstaller } from '../../../src/init/kiro-installer.js';
import { createOpenCodeInstaller } from '../../../src/init/opencode-installer.js';
import { createCodexInstaller } from '../../../src/init/codex-installer.js';
import { generateCLAUDEmd } from '../../../src/init/init-wizard-hooks.js';
import { createDefaultConfig } from '../../../src/init/types.js';

const ROOT = process.cwd();

/** Third-party CLIs we pin, and the exact version each must use. */
const PINNED: Record<string, string> = {
  ruflo: RUFLO_PINNED_VERSION,
  // claude-flow and @claude-flow/cli publish the same CLI; references must use ruflo.
  'claude-flow': '(use ruflo)',
  '@claude-flow/cli': '(use ruflo)',
  agentdb: AGENTDB_PINNED_VERSION,
  'flow-nexus': FLOW_NEXUS_PINNED_VERSION,
};

const FLOATING_TAGS = 'latest|next|alpha|beta|canary|rc|v\\d*alpha|v\\d*beta';
const PKG = '@?[a-z0-9][\\w./-]*';
const LAUNCHER = '(?:\\bnpx|\\bbunx|\\bnpm\\s+(?:i|install|exec|x)|\\bpnpm\\s+(?:dlx|add)|\\byarn\\s+(?:dlx|add))';
const FLAGS = '((?:\\s+-{1,2}[\\w-]+)*)';
/** `npx [-y] pkg@tag`, `npm i -g pkg@tag`, ... for any package. */
const TAGGED_COMMAND = new RegExp(`${LAUNCHER}${FLAGS}\\s+(${PKG})@(${FLOATING_TAGS})\\b`, 'g');
/** argv arrays: spawn('npx', ['--yes', 'pkg@latest']) or "args": ["-y", "pkg@latest"] */
const TAGGED_ARGV = new RegExp(`[[,]\\s*["'\`](${PKG})@(${FLOATING_TAGS})["'\`]`, 'g');
/** `npx [-y] ruflo` with no version, for the CLIs we pin. `--no-install` never downloads, so it is fine. */
const UNVERSIONED_PINNED = new RegExp(
  `${LAUNCHER}${FLAGS}\\s+(@claude-flow/cli|claude-flow|ruflo|agentdb|flow-nexus)(?![@\\w/-]|\\.\\w)`,
  'g',
);
/** Any versioned call of a CLI we pin (command or argv form), to check it is exactly the pinned version. */
const PINNED_NAMES = '(@claude-flow/cli|claude-flow|ruflo|agentdb|flow-nexus)';
const PINNED_REF_COMMAND = new RegExp(`${LAUNCHER}${FLAGS}\\s+${PINNED_NAMES}@([\\w.-]*\\w)`, 'g');
const PINNED_REF_ARGV = new RegExp(`()[[,]\\s*["'\`]${PINNED_NAMES}@([\\w.-]*\\w)["'\`]`, 'g');

/** Packages whose floating tag is intentional. */
const EXEMPT_PACKAGES: Record<string, string> = {
  // First-party: MCP entries launch the user's own AQE release on purpose (#1269).
  'agentic-qe': 'first-party package',
  // `npm install -g npm@latest` is an upgrade hint for npm itself.
  npm: 'npm self-upgrade hint',
};

/** Files owned and rewritten by `ruflo init`; their floating tags are an upstream Ruflo concern. */
const RUFLO_OWNED_FILES: Record<string, string> = {
  // aqe init --with-codex --with-ruflo copies this to .codex/hooks/ruflo-runtime.cjs. Its only
  // caller, ruflo-codex-hook.cjs, sets RUFLO_HOOK_NPX=0, which disables the `npx ruflo@latest`
  // fallback (asserted in tests/unit/hooks/codex-hook-adapters.test.ts).
  '.claude/helpers/ruflo-hook.cjs': 'Ruflo projection; npx fallback disabled by RUFLO_HOOK_NPX=0',
  '.claude/helpers/auto-memory-hook.mjs': 'Ruflo projection; tag appears in a help message only',
  '.claude/helpers/statusline.cjs': 'Ruflo projection',
  '.claude/helpers/guidance-hook.sh': 'Ruflo projection',
  '.claude/helpers/perf-worker.sh': 'Ruflo projection',
  '.claude/helpers/learning-optimizer.sh': 'Ruflo projection',
  // Written by `claude-flow init`; shipped in the tarball but never installed by aqe init.
  '.claude/helpers/github-setup.sh': 'claude-flow init projection',
  '.claude/helpers/quick-start.sh': 'claude-flow init projection',
  '.claude/helpers/setup-mcp.sh': 'claude-flow init projection',
  '.claude/helpers/pre-commit': 'claude-flow init projection',
  '.claude/helpers/post-commit': 'claude-flow init projection',
};
const GENERATED_RUFLO_OWNED = new Set(['.codex/hooks/ruflo-runtime.cjs']);

/**
 * Lines that still write the old ruflo@3.5.18 pin into users' MCP config. Moving them to
 * RUFLO_PINNED_VERSION changes existing installs, so it is tracked separately in #1413.
 */
const LEGACY_INIT_PIN_LINES: Array<{ file: string; text: string }> = [
  { file: 'src/cli/commands/claude-flow-setup.ts', text: "args: ['ruflo@3.5.18', 'mcp']," },
  { file: 'src/adapters/claude-flow/detect.ts', text: "'    npm install -g ruflo'," },
  { file: 'src/adapters/claude-flow/detect.ts', text: "'    claude mcp add ruflo -- npx -y ruflo@3.5.18'," },
];

function isLegacyInitPinLine(file: string, line: string): boolean {
  return LEGACY_INIT_PIN_LINES.some((l) => l.file === file && line.trim() === l.text.trim());
}

function findViolations(content: string, file = ''): string[] {
  const hits: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (isLegacyInitPinLine(file, line)) continue;
    for (const m of line.matchAll(TAGGED_COMMAND)) {
      if (!(m[2] in EXEMPT_PACKAGES)) hits.push(`${m[2]}@${m[3]}`);
    }
    for (const m of line.matchAll(TAGGED_ARGV)) {
      if (!(m[1] in EXEMPT_PACKAGES)) hits.push(`${m[1]}@${m[2]}`);
    }
    for (const m of line.matchAll(UNVERSIONED_PINNED)) {
      if (!/--no-install/.test(m[1])) hits.push(`${m[2]} (no version)`);
    }
    for (const m of [...line.matchAll(PINNED_REF_COMMAND), ...line.matchAll(PINNED_REF_ARGV)]) {
      const [pkg, version] = [m[2], m[3]];
      const expected = PINNED[pkg];
      const want = expected.startsWith('(') ? `ruflo@${RUFLO_PINNED_VERSION}` : `${pkg}@${expected}`;
      if (version !== expected) hits.push(`${pkg}@${version} (expected ${want})`);
    }
  }
  return hits;
}

function scannedPathspecs(): string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { files: string[] };
  const shipped = pkg.files
    .filter((entry) => !entry.startsWith('dist/') && entry !== 'CHANGELOG.md')
    .map((entry) => entry.replace(/\/\*\*.*$/, ''));
  return [...shipped, 'plugins', '.kiro', 'src'];
}

const isTextFile = (file: string) => !/\.(png|jpe?g|gif|webp|ico|wasm|node|db|gz|zip|rvf)$/i.test(file);

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...scannedPathspecs()], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\0')
    .filter(Boolean)
    .filter(isTextFile)
    .filter((file) => existsSync(join(ROOT, file)) && lstatSync(join(ROOT, file)).isFile());
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === '.git' ? [] : walk(full);
    return entry.isFile() && isTextFile(entry.name) ? [full] : [];
  });
}

function offendersIn(files: Array<{ rel: string; abs: string }>): string[] {
  return files.flatMap(({ rel, abs }) => {
    const hits = findViolations(readFileSync(abs, 'utf8'), rel);
    return hits.length > 0 ? [`${rel}: ${[...new Set(hits)].join(', ')}`] : [];
  });
}

describe('floating third-party CLI versions (#1404)', () => {
  it('should_flagFloatingVersions_when_commandArgvOrBareCallFloats', () => {
    expect(findViolations('npx @claude-flow/cli@latest memory store')).toContain('@claude-flow/cli@latest');
    expect(findViolations('npm install -g claude-flow@alpha')).toContain('claude-flow@alpha');
    expect(findViolations('npx claude-flow@v3alpha hooks pre-task')).toContain('claude-flow@v3alpha');
    expect(findViolations("spawn('npx', ['--yes', 'ruflo@latest'])")).toContain('ruflo@latest');
    expect(findViolations('npx -y agentdb@next init')).toContain('agentdb@next');
    expect(findViolations('npx ruflo memory store')).toEqual(['ruflo (no version)']);
    expect(findViolations('npx -y claude-flow swarm init')).toEqual(['claude-flow (no version)']);
    expect(findViolations('npm install -g ruflo@3')[0]).toMatch(/^ruflo@3 \(expected/);
    expect(findViolations('npx ruflo@3.5.18 mcp start')[0]).toMatch(/^ruflo@3\.5\.18 \(expected/);
  });

  it('should_acceptPinnedAndExemptRefs_when_versionIsExactOrFirstParty', () => {
    expect(findViolations(`npx ruflo@${RUFLO_PINNED_VERSION} memory store`)).toEqual([]);
    expect(findViolations(`npx agentdb@${AGENTDB_PINNED_VERSION} init`)).toEqual([]);
    expect(findViolations('npx --no-install ruflo memory search --query x')).toEqual([]);
    expect(findViolations('npx -y agentic-qe@latest mcp')).toEqual([]);
    expect(findViolations('npm install -g npm@latest')).toEqual([]);
    expect(findViolations('V3 deep agentic-flow@alpha integration')).toEqual([]);
    expect(findViolations('- **Root Cause**: `ruvector@latest` had a broken dependency')).toEqual([]);
  });

  it('should_findNoFloatingThirdPartyCli_when_scanningShippedAndSourceFiles', () => {
    const files = trackedFiles().filter((file) => !(file in RUFLO_OWNED_FILES));
    expect(files.length).toBeGreaterThan(100);

    expect(offendersIn(files.map((rel) => ({ rel, abs: join(ROOT, rel) })))).toEqual([]);
  });

  it('should_keepLegacyInitPinAllowlistCurrent_when_initPinMoves', () => {
    for (const { file, text } of LEGACY_INIT_PIN_LINES) {
      const lines = readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/).map((l) => l.trim());
      expect(lines, `${file} no longer contains the allowlisted line; drop it from LEGACY_INIT_PIN_LINES`).toContain(text.trim());
    }
  });

  it('should_keepRufloOwnedAllowlistCurrent_when_helpersChange', () => {
    for (const file of Object.keys(RUFLO_OWNED_FILES)) {
      expect(existsSync(join(ROOT, file)), `${file} no longer exists; drop it from the allowlist`).toBe(true);
    }
  });

  describe('tree generated by the aqe init installers', () => {
    let projectRoot: string;

    beforeAll(async () => {
      projectRoot = mkdtempSync(join(tmpdir(), 'aqe-1404-'));
      writeFileSync(join(projectRoot, 'package.json'), '{"name":"fixture","version":"1.0.0"}');
      await createSkillsInstaller({ projectRoot, installV2Skills: true, installV3Skills: true }).install();
      await createAgentsInstaller({ projectRoot, installQEAgents: true, installSubagents: true }).install();
      await createKiroInstaller({ projectRoot }).install();
      await createOpenCodeInstaller({ projectRoot }).install();
      await createCodexInstaller({ projectRoot, includeRuflo: true }).install();
      await generateCLAUDEmd(projectRoot, createDefaultConfig('fixture', projectRoot));
    }, 120_000);

    afterAll(() => {
      if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    });

    it('should_findNoFloatingThirdPartyCli_when_scanningGeneratedProject', () => {
      const files = walk(projectRoot)
        .map((abs) => ({ rel: relative(projectRoot, abs), abs }))
        .filter(({ rel }) => !GENERATED_RUFLO_OWNED.has(rel));
      const rels = files.map((f) => f.rel);
      expect(rels.some((r) => r.startsWith('.claude/skills/'))).toBe(true);
      expect(rels.some((r) => r.startsWith('.kiro/skills/'))).toBe(true);
      expect(rels).toContain('CLAUDE.md');

      expect(offendersIn(files)).toEqual([]);
    });
  });
});
