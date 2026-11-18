/**
 * Issue #1417: the skills, commands and agents AQE ships tell agents to run
 * `npx ruflo@<RUFLO_PINNED_VERSION> <command> ...`. #1404 pinned the version; this
 * test checks that every call names a command, subcommand and flags that the pinned
 * release actually has, using the committed `--help` snapshot of that release
 * (tests/fixtures/ruflo-cli-surface/<version>.json, made by scripts/ruflo-cli-surface.mjs).
 *
 * - Content that reaches users (the Claude Code plugin, assets/, the tree `aqe init`
 *   writes, Codex/OpenCode skills, src/) must have no invalid call.
 * - Content that ships but is never installed (Claude Flow platform agents, commands and
 *   skills under .claude/, the repo's .kiro copies, docs) still has stale calls. Their
 *   per-file counts are frozen in known-stale-1417.json and may only go down.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RUFLO_PINNED_VERSION } from '../../../src/shared/pinned-tools.js';
import { checkCall, extractCalls, findInvalidCalls, tokenize } from '../../../scripts/ruflo-cli-surface.mjs';
import { createSkillsInstaller } from '../../../src/init/skills-installer.js';
import { createAgentsInstaller } from '../../../src/init/agents-installer.js';
import { createKiroInstaller } from '../../../src/init/kiro-installer.js';
import { createOpenCodeInstaller } from '../../../src/init/opencode-installer.js';
import { createCodexInstaller } from '../../../src/init/codex-installer.js';
import { createN8nInstaller } from '../../../src/init/n8n-installer.js';
import { generateCLAUDEmd } from '../../../src/init/init-wizard-hooks.js';
import { createDefaultConfig } from '../../../src/init/types.js';

const ROOT = process.cwd();
const FIXTURES = join(ROOT, 'tests/fixtures/ruflo-cli-surface');
const SURFACE_FILE = join(FIXTURES, `${RUFLO_PINNED_VERSION}.json`);
const BASELINE_FILE = join(FIXTURES, 'known-stale-1417.json');

interface Surface {
  version: string;
  globalFlags: string[];
  commands: Record<string, unknown>;
}

const surface = JSON.parse(readFileSync(SURFACE_FILE, 'utf8')) as Surface;
const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as { files: Record<string, number> };

/**
 * Tracked paths whose content reaches users: the Claude Code plugin, the npm assets the
 * installers copy from, the shipped Codex/OpenCode trees, the .claude files `aqe init`
 * copies (QE agents, the two platform skills it installs, the /aqe-* commands), and src/.
 */
const USER_FACING = [
  /^plugins\//,
  /^assets\//,
  /^\.agents\/skills\//,
  /^\.opencode\//,
  /^src\//,
  /^\.claude\/agents\/v3\/qe-[^/]+\.md$/,
  /^\.claude\/skills\/(verification-quality|pair-programming)\//,
  /^\.claude\/commands\/aqe-[^/]+\.md$/,
  // --with-n8n agents, and the Codex hooks aqe init --with-codex copies
  /^\.claude\/agents\/n8n\//,
  /^\.codex\/hooks(\/|\.json$)/,
  /^\.claude\/hooks\/aqe-hook\.cjs$/,
];

const isTextFile = (file: string) => !/\.(png|jpe?g|gif|webp|ico|wasm|node|db|gz|zip|rvf|tgz)$/i.test(file);

function scannedPathspecs(): string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { files: string[] };
  const shipped = pkg.files
    .filter((entry) => !entry.startsWith('dist/') && entry !== 'CHANGELOG.md')
    .map((entry) => entry.replace(/\/\*\*.*$/, ''));
  return [...shipped, 'plugins', '.kiro', 'src', 'docs'];
}

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

function invalidIn(abs: string) {
  return findInvalidCalls(readFileSync(abs, 'utf8'), surface);
}

function describeInvalid(rel: string, abs: string): string[] {
  return invalidIn(abs).map((c) => `${rel}:${c.line} ${c.reason} — ${c.text.slice(0, 120)}`);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === '.git' ? [] : walk(full);
    return entry.isFile() && isTextFile(entry.name) ? [full] : [];
  });
}

const tok = (s: string) => tokenize(s);
const check = (rest: string) => checkCall(tok(rest), surface);

describe('ruflo command surface (#1417)', () => {
  describe('the checker', () => {
    it('should_matchThePinnedVersion_when_snapshotIsLoaded', () => {
      expect(surface.version).toBe(RUFLO_PINNED_VERSION);
      expect(Object.keys(surface.commands).length).toBeGreaterThan(30);
    });

    it('should_acceptRealCommandsAndFlags_when_theyExistIn3760', () => {
      expect(check(' hooks pre-task --task-id "t-1" --description "Generate tests"')).toBeNull();
      expect(check(' hooks post-task -i t-1 --success true --agent qe-test-generator --task "x"')).toBeNull();
      expect(check(' memory store --key "aqe/x" --value \'{"a": 1}\' --namespace aqe')).toBeNull();
      expect(check(' memory get --key k')).toBeNull(); // alias of retrieve
      expect(check(' doctor --fix')).toBeNull();
      expect(check(' verify --json')).toBeNull();
      expect(check(' --version')).toBeNull();
      expect(check('')).toBeNull(); // prose: "use `npx ruflo@x`"
      expect(check(' <command> [options]')).toBeNull(); // placeholder in prose
    });

    it('should_rejectStaleCalls_when_commandSubcommandOrFlagIsMissing', () => {
      expect(check(' truth --period 7d')).toBe("unknown command 'truth'");
      expect(check(' hook pre-task')).toBe("unknown command 'hook'");
      expect(check(' memory store-pattern --session-id x')).toBe("unknown subcommand 'memory store-pattern'");
      expect(check(' hooks pre-task --description "x" --agent "qe-test-generator"')).toBe(
        "'hooks pre-task' has no flag --agent",
      );
      expect(check(' hooks post-task --task-id x --results "${R}"')).toBe("'hooks post-task' has no flag --results");
      expect(check(' verify check --file src/app.js --threshold 0.98')).toMatch(/^'verify' has no flag --file --threshold$/);
    });

    it('should_ignoreFlagLookingText_when_itIsQuotedOrAfterAShellOperator', () => {
      expect(check(' hooks notify --message "run --fast now"')).toBeNull();
      expect(check(' memory store --key k --value "$(date -Iseconds)"')).toBeNull();
      expect(check(' doctor | grep --color fail')).toBeNull();
      expect(check(' doctor && npm test -- --coverage')).toBeNull();
      expect(check(' doctor # --not-a-flag')).toBeNull();
    });

    it('should_joinBackslashContinuations_when_extractingCalls', () => {
      const calls = extractCalls(
        ['npx ruflo@3.76.0 hooks pre-task \\', '  --task-id "x" \\', '  --agent "y"', 'echo done'].join('\n'),
        RUFLO_PINNED_VERSION,
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].line).toBe(1);
      expect(checkCall(calls[0].tokens, surface)).toBe("'hooks pre-task' has no flag --agent");
    });

    it('should_ignoreOtherVersions_when_extractingCalls', () => {
      expect(extractCalls('npx ruflo@3.76.01 truth', RUFLO_PINNED_VERSION)).toEqual([]);
    });

    // Review of #1417
    it('should_onlyCountLaunchedCalls_when_theSpecIsMentionedInProse', () => {
      expect(extractCalls('requires ruflo@3.76.0 or later', RUFLO_PINNED_VERSION)).toEqual([]);
      expect(extractCalls('npm install -g ruflo@3.76.0', RUFLO_PINNED_VERSION)).toEqual([]);
      expect(extractCalls('"prompt": "x\\nnpx ruflo@3.76.0 truth"', RUFLO_PINNED_VERSION)).toHaveLength(1);
      expect(extractCalls('npx -y ruflo@3.76.0 doctor', RUFLO_PINNED_VERSION)).toHaveLength(1);
    });

    it('should_checkNoInstallCalls_when_theyRunTheInstalledCli', () => {
      const [call] = extractCalls('npx --no-install ruflo memory search --bogus x', RUFLO_PINNED_VERSION);
      expect(checkCall(call.tokens, surface)).toBe("'memory search' has no flag --bogus");
      expect(extractCalls('npx ruflo memory search', RUFLO_PINNED_VERSION)).toEqual([]); // #1404 flags that one
    });

    it('should_keepCheckingFlags_when_aPlaceholderComesFirst', () => {
      const [call] = extractCalls('npx ruflo@3.76.0 hooks post-edit --file <path> --memory-key x', RUFLO_PINNED_VERSION);
      expect(checkCall(call.tokens, surface)).toBe("'hooks post-edit' has no flag --memory-key");
    });

    it('should_rejectUnknownSubcommands_when_theyAreBelowTheTopLevel', () => {
      expect(check(' hooks worker bogus')).toBe("unknown subcommand 'hooks worker bogus'");
      expect(check(' hooks transfer store search -q x')).toBeNull();
    });

    it('should_checkTheFlagName_when_onlyItsValueIsQuoted', () => {
      expect(check(' hooks notify --bogus="x" -m "--y"')).toBe("'hooks notify' has no flag --bogus");
    });

    it('should_knowHiddenCommandsAndOnlyRealAliases_when_snapshotIsLoaded', () => {
      expect(check(' benchmark --help')).toBeNull();
      expect(check(' security code')).toBe("unknown subcommand 'security code'");
      expect(check(' mcp start')).toBeNull();
    });
  });

  describe('shipped and tracked content', () => {
    const files = trackedFiles();
    const userFacing = files.filter((f) => USER_FACING.some((re) => re.test(f)));
    const rest = files.filter((f) => !USER_FACING.some((re) => re.test(f)));

    it('should_haveNoInvalidRufloCall_when_contentReachesUsers', () => {
      expect(userFacing.length).toBeGreaterThan(500);
      expect(userFacing).toContain('plugins/agentic-qe-fleet/commands/aqe-generate.md');
      expect(userFacing).toContain('assets/skills/verification-quality/SKILL.md');

      expect(userFacing.flatMap((rel) => describeInvalid(rel, join(ROOT, rel)))).toEqual([]);
    });

    it('should_notAddStaleRufloCalls_when_contentShipsButIsNotInstalled', () => {
      const grown: string[] = [];
      const shrunk: string[] = [];
      for (const rel of rest) {
        const count = invalidIn(join(ROOT, rel)).length;
        const allowed = baseline.files[rel] ?? 0;
        if (count > allowed) grown.push(`${rel}: ${count} invalid ruflo calls (baseline ${allowed})`);
        else if (count < allowed) shrunk.push(`${rel}: ${count} (baseline ${allowed})`);
      }
      expect(grown, 'New stale ruflo calls; check them against `npx ruflo@<pin> <cmd> --help`').toEqual([]);
      expect(shrunk, 'Fewer stale calls than the baseline; lower known-stale-1417.json to lock it in').toEqual([]);
    });

    it('should_keepBaselineCurrent_when_filesMoveOrDisappear', () => {
      const tracked = new Set(rest);
      const missing = Object.keys(baseline.files).filter((rel) => !tracked.has(rel));
      expect(missing, 'Baseline lists files that are gone or now user-facing; drop them').toEqual([]);
    });
  });

  describe('tree generated by the aqe init installers', () => {
    let projectRoot: string;

    beforeAll(async () => {
      projectRoot = mkdtempSync(join(tmpdir(), 'aqe-1417-'));
      writeFileSync(join(projectRoot, 'package.json'), '{"name":"fixture","version":"1.0.0"}');
      await createSkillsInstaller({ projectRoot, installV2Skills: true, installV3Skills: true }).install();
      await createAgentsInstaller({ projectRoot, installQEAgents: true, installSubagents: true }).install();
      await createN8nInstaller({ projectRoot }).install();
      await createKiroInstaller({ projectRoot }).install();
      await createOpenCodeInstaller({ projectRoot }).install();
      await createCodexInstaller({ projectRoot, includeRuflo: true }).install();
      await generateCLAUDEmd(projectRoot, createDefaultConfig('fixture', projectRoot));
    }, 120_000);

    afterAll(() => {
      if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    });

    it('should_haveNoInvalidRufloCall_when_scanningGeneratedProject', () => {
      const files = walk(projectRoot).map((abs) => ({ rel: relative(projectRoot, abs), abs }));
      const rels = files.map((f) => f.rel);
      expect(rels).toContain('.claude/skills/verification-quality/SKILL.md');
      expect(rels).toContain('.claude/agents/v3/qe-integration-architect.md');
      expect(rels.some((r) => r.startsWith('.kiro/skills/'))).toBe(true);

      expect(files.flatMap(({ rel, abs }) => describeInvalid(rel, abs))).toEqual([]);
    });
  });
});
