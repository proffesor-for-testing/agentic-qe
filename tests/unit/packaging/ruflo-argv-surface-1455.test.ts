/**
 * Issue #1455: src/ code runs ruflo as `npx --no-install <ruflo> <argv...>`. Each argv
 * must name a command, subcommand and flags the pinned release has, and each MCP tool
 * run through `ruflo mcp exec` must exist in it. Checked against the committed
 * `--help` snapshot (tests/fixtures/ruflo-cli-surface/<version>.json); the #1417 test
 * covers shell commands in text.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RUFLO_PINNED_VERSION } from '../../../src/shared/pinned-tools.js';
import { RUFLO_TOOLS } from '../../../src/adapters/claude-flow/ruflo-tool.js';
import {
  checkArgvCall,
  extractArgvCalls,
  extractToolCalls,
  findInvalidArgvCalls,
} from '../../../scripts/ruflo-cli-surface.mjs';

const ROOT = process.cwd();
const surface = JSON.parse(
  readFileSync(join(ROOT, 'tests/fixtures/ruflo-cli-surface', `${RUFLO_PINNED_VERSION}.json`), 'utf8'),
) as { version: string; globalFlags: string[]; commands: Record<string, unknown>; mcpTools: string[] };

const invalid = (code: string) => findInvalidArgvCalls(code, surface).map((c: { reason: string }) => c.reason);

function sourceFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'src'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\0')
    .filter((f) => /\.(ts|mts|cts|js|mjs|cjs)$/.test(f))
    .filter((f) => existsSync(join(ROOT, f)));
}

describe('ruflo argv calls in src/ (#1455)', () => {
  describe('the checker', () => {
    it('should_listMcpTools_when_snapshotIsLoaded', () => {
      expect(surface.version).toBe(RUFLO_PINNED_VERSION);
      expect(surface.mcpTools.length).toBeGreaterThan(100);
      expect(surface.mcpTools).toContain('hooks_intelligence_trajectory-start');
    });

    it('should_rejectTheCallsFromTheIssue_when_rufloHasNoSuchSubcommand', () => {
      // The exact argv lists main had before #1455.
      expect(invalid("const args = ['--no-install', cliPkg, 'hooks', 'intelligence', 'trajectory-start', '--task', task];")).toEqual([
        "'hooks intelligence' has no subcommand 'trajectory-start'",
      ]);
      expect(invalid("cfCliArgs('hooks', 'intelligence', 'pattern-search', '--query', query, '--top-k', String(topK))")).toEqual([
        "'hooks intelligence' has no subcommand 'pattern-search'",
      ]);
      expect(
        invalid("['--no-install', cliPkg, 'hooks', 'transfer', '--source-path', sourcePath, '--min-confidence', String(m)]"),
      ).toEqual(["'hooks transfer' has no flag --source-path --min-confidence"]);
    });

    it('should_acceptRealCalls_when_theyExistInThePinnedRelease', () => {
      expect(invalid("['--no-install', cliPkg, 'hooks', 'model-route', '--task', task]")).toEqual([]);
      expect(
        invalid("['--no-install', cliPkg, 'hooks', 'model-outcome', '--task', o.task, '--model', o.model, '--outcome', o.outcome]"),
      ).toEqual([]);
      expect(invalid("cfCliArgs('hooks', 'pretrain', '--path', path, '--depth', depth)")).toEqual([]);
      expect(invalid("['--no-install', p, 'hooks', 'transfer', 'from-project', '--source', s, '--min-confidence', String(m)]")).toEqual([]);
      expect(invalid("['--no-install', cliPkg, 'mcp', 'exec', '--tool', tool, '--params', JSON.stringify(params)]")).toEqual([]);
    });

    it('should_checkFlagsInsideSpreads_when_argvIsBuiltConditionally', () => {
      expect(invalid("['--no-install', p, 'hooks', 'model-route', '--task', t, ...(c ? ['--bogus', c] : [])]")).toEqual([
        "'hooks model-route' has no flag --bogus",
      ]);
    });

    it('should_reportFlagsAppendedWithPush_when_theyCannotBeChecked', () => {
      const code = ["const args = ['--no-install', p, 'hooks', 'model-route', '--task', t];", "if (c) { args.push('--context', c); }"].join(
        '\n',
      );
      expect(findInvalidArgvCalls(code, surface)).toEqual([
        expect.objectContaining({ line: 2, reason: expect.stringMatching(/^UNVERIFIABLE: flag added with push\(\)/) }),
      ]);
    });

    it('should_rejectUnknownMcpTools_when_runThroughMcpExec', () => {
      expect(invalid("await runRufloTool('hooks_intelligence_trajectory-start', { task })")).toEqual([]);
      expect(invalid("await runRufloTool('hooks_intelligence_nope', {})")).toEqual(["unknown MCP tool 'hooks_intelligence_nope'"]);
      expect(findInvalidArgvCalls("runRufloTool('x_y', {})", { ...surface, mcpTools: undefined })).toEqual([
        expect.objectContaining({ reason: 'the snapshot has no mcpTools list' }),
      ]);
    });

    it('should_checkHelperCallSites_when_theHelperForwardsItsArguments', () => {
      const code = [
        'function cfCliArgs(...subcommand: string[]) {',
        "  return { bin: 'npx', args: ['--no-install', pkg, ...subcommand] };",
        '}',
        "cfCliArgs('hooks', 'model-route', '--task', task);",
        "cfCliArgs('hooks', 'intelligence', 'pattern-store');",
      ].join('\n');
      expect(extractArgvCalls(code).map((c: { line: number }) => c.line)).toEqual([2, 4, 5]);
      // The forwarding body is unverifiable until marked; the call sites are checked.
      expect(invalid(code)).toEqual([
        'UNVERIFIABLE: ...subcommand can add any subcommand or flag',
        "'hooks intelligence' has no subcommand 'pattern-store'",
      ]);
    });

    // Review of #1455 (PR #1489): argv shapes the first version of the checker passed.
    it.each([
      ['argv.push of a flag', "const argv = ['--no-install', p, 'hooks', 'model-route', '--task', t]; argv.push('--bogus', x);", /^UNVERIFIABLE: flag added with push/],
      ['spread of a variable', "execFileSync('npx', ['--no-install', p, 'hooks', 'model-route', ...extra]);", /^UNVERIFIABLE: \.\.\.extra/],
      ['variable command path', "execFileSync('npx', ['--no-install', p, ...rufloArgs]);", /^UNVERIFIABLE: \.\.\.rufloArgs/],
      ['variable subcommand', "execFileSync('npx', ['--no-install', p, 'hooks', sub, '--task', t]);", /^UNVERIFIABLE: the command path after 'hooks' is not a literal/],
      ['variable after a leaf', "execFileSync('npx', ['--no-install', p, 'hooks', 'intelligence', sub, '--task', t]);", /^'hooks intelligence' has no flag --task$/],
      ['no --no-install', "execFileSync('npx', ['ruflo', 'hooks', 'intelligence', 'trajectory-start']);", /^'hooks intelligence' has no subcommand 'trajectory-start'$/],
      ['ruflo binary', "execFileSync('ruflo', ['hooks', 'intelligence', 'trajectory-start']);", /^'hooks intelligence' has no subcommand 'trajectory-start'$/],
      ['pinned spec', "spawn('npx', ['-y', RUFLO_PINNED_SPEC, 'hooks', 'bogus-cmd']);", /^unknown subcommand 'hooks bogus-cmd'$/],
      ['versioned spec', "spawn('npx', ['-y', 'ruflo@3.76.0', 'truth']);", /^unknown command 'truth'$/],
      ['concat', "execFileSync('npx', ['--no-install', p].concat(['hooks', 'nope']));", /^unknown subcommand 'hooks nope'$/],
      ['concat of a variable', "execFileSync('npx', ['--no-install', p].concat(rest));", /^UNVERIFIABLE: \.\.\.rest/],
      ['tool name variable', "const tool = 'hooks_bogus'; runRufloTool(tool as any, {});", /^UNVERIFIABLE: the MCP tool name is not a literal$/],
      ['adapter tool method', "this.tool('hooks_bogus_x', {})", /^unknown MCP tool 'hooks_bogus_x'$/],
      ['mcp exec --tool literal', "['--no-install', p, 'mcp', 'exec', '--tool', 'hooks_bogus', '--params', '{}']", /^unknown MCP tool 'hooks_bogus'$/],
      ['template literal', "execFileSync('npx', ['--no-install', p, `hooks`, 'intelligence', 'trajectory-start']);", /^'hooks intelligence' has no subcommand 'trajectory-start'$/],
      ['block comment', "execFileSync('npx', ['--no-install', p, /* c */ 'hooks', 'intelligence', 'trajectory-start']);", /^'hooks intelligence' has no subcommand 'trajectory-start'$/],
      ['line comment', "execFileSync('npx', ['--no-install', p, // c\n 'hooks', 'intelligence', 'trajectory-start']);", /^'hooks intelligence' has no subcommand 'trajectory-start'$/],
      ['global --format value', "execFileSync('npx', ['--no-install', p, 'hooks', 'build-agents', '--format', 'yaml']);", /^--format must be one of text, json, table, not 'yaml'$/],
    ])('should_reject_when_%s', (_name, code, reason) => {
      const reasons = invalid(code);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(reason);
    });

    it('should_acceptAnUnverifiableCall_when_markedWithAReason', () => {
      const marked = ['// ruflo-argv-unverifiable: forwards the checked call sites', "args: ['--no-install', pkg, ...subcommand],"].join('\n');
      expect(invalid(marked)).toEqual([]);
      const noReason = ['// ruflo-argv-unverifiable:', "args: ['--no-install', pkg, ...subcommand],"].join('\n');
      expect(invalid(noReason)).toHaveLength(1);
      // The marker never hides a real error.
      expect(invalid("// ruflo-argv-unverifiable: because\n['--no-install', p, 'truth']")).toEqual(["unknown command 'truth'"]);
    });

    it('should_ignorePackageLists_when_theyOnlyNamePackages', () => {
      expect(extractArgvCalls("for (const pkg of ['ruflo', '@claude-flow/cli']) {}")).toEqual([]);
      expect(extractArgvCalls("if (servers['ruflo']) {}")).toEqual([]);
    });

    it('should_reportAnUnquotedWordAfterALeafCommand_when_rufloWouldIgnoreIt', () => {
      const tokens = (words: string[]) => words.map((text) => ({ text, quoted: false, startsQuoted: false }));
      expect(checkArgvCall(tokens(['hooks', 'model-stats', 'extra']), surface)).toBe("'hooks model-stats' has no subcommand 'extra'");
      expect(checkArgvCall(tokens(['doctor']), surface)).toBeNull();
    });
  });

  describe('source code', () => {
    const files = sourceFiles();
    const scanned = files.map((rel) => ({ rel, content: readFileSync(join(ROOT, rel), 'utf8') }));

    it('should_haveNoInvalidRufloArgv_when_scanningSrc', () => {
      const found = scanned.flatMap(({ rel, content }) =>
        findInvalidArgvCalls(content, surface).map(
          (c: { line: number; reason: string; text: string }) => `${rel}:${c.line} ${c.reason} — ${c.text.slice(0, 100)}`,
        ),
      );
      expect(found).toEqual([]);
    });

    it('should_findTheKnownRufloCalls_when_scanningSrc', () => {
      const calls = scanned.flatMap(({ rel, content }) =>
        extractArgvCalls(content).map((c: { text: string }) => `${rel} ${c.text}`),
      );
      expect(calls.length).toBeGreaterThanOrEqual(8);
      expect(calls.some((c) => c.startsWith('src/adapters/claude-flow/ruflo-tool.ts') && c.includes("'mcp' 'exec'"))).toBe(true);
      expect(calls.some((c) => c.includes("'transfer' 'from-project'"))).toBe(true);
      expect(calls.some((c) => c.includes("'intelligence'"))).toBe(false);
      expect(calls.some((c) => c.includes("'build-agents'"))).toBe(false);
      expect(scanned.some(({ content }) => extractToolCalls(content).length > 0)).toBe(true);
    });

    it('should_useOnlyToolsOfThePinnedRelease_when_runningMcpExec', () => {
      expect(RUFLO_TOOLS.filter((tool) => !surface.mcpTools.includes(tool))).toEqual([]);
    });
  });
});
