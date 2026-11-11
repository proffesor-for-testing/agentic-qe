/**
 * Issue #1404: shipped and generated files must not tell an agent to run a
 * third-party CLI through a floating dist-tag (`npx foo@latest`, `foo@alpha`, ...).
 * Every such call would execute whatever was published last, with the agent's
 * privileges. Pin an exact version instead.
 *
 * Scope: everything `package.json#files` ships (dist is covered through src/),
 * the Claude plugin marketplace tree, the repo's own Kiro config, and src/
 * (installers and generators that write files into a user's project).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

const FLOATING_TAGS = 'latest|next|alpha|beta|canary|rc';
const PKG = '@?[a-z0-9][\\w./-]*';
const COMMAND_FORM = new RegExp(
  `(?:\\bnpx|\\bnpm\\s+(?:i|install|exec|x)|\\bpnpm\\s+(?:dlx|add)|\\byarn\\s+(?:dlx|add)|\\bbunx)` +
    `(?:\\s+-{1,2}[\\w-]+)*\\s+(${PKG})@(${FLOATING_TAGS})\\b`,
  'g',
);
// argv arrays: spawn('npx', ['--yes', 'pkg@latest']) or "args": ["-y", "pkg@latest"]
const QUOTED_FORM = new RegExp(`[[,]\\s*["'\`](${PKG})@(${FLOATING_TAGS})["'\`]`, 'g');

/** Packages whose floating tag is intentional. */
const EXEMPT_PACKAGES: Record<string, string> = {
  // First-party: MCP entries launch the user's own AQE release on purpose (#1269).
  'agentic-qe': 'first-party package',
  // `npm install -g npm@latest` is an upgrade hint for npm itself.
  npm: 'npm self-upgrade hint',
};

/** Files owned and rewritten by `ruflo init`; floating tags there are an upstream Ruflo concern. */
const RUFLO_OWNED_FILES: Record<string, string> = {
  '.claude/helpers/ruflo-hook.cjs':
    'Ruflo projection; the Codex copy is only invoked with RUFLO_HOOK_NPX=0, which disables its npx fallback',
  '.claude/helpers/auto-memory-hook.mjs': 'Ruflo projection; tag appears in a help message only',
  '.claude/helpers/statusline.cjs': 'Ruflo projection',
  '.claude/helpers/guidance-hook.sh': 'Ruflo projection',
  '.claude/helpers/perf-worker.sh': 'Ruflo projection',
  '.claude/helpers/learning-optimizer.sh': 'Ruflo projection',
};

function findFloatingCliRefs(content: string): string[] {
  const hits: string[] = [];
  for (const pattern of [COMMAND_FORM, QUOTED_FORM]) {
    for (const match of content.matchAll(pattern)) {
      const pkg = match[1];
      if (!(pkg in EXEMPT_PACKAGES)) hits.push(`${pkg}@${match[2]}`);
    }
  }
  return hits;
}

function scannedPathspecs(): string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { files: string[] };
  const shipped = pkg.files
    .filter((entry) => !entry.startsWith('dist/'))
    .map((entry) => entry.replace(/\/\*\*.*$/, ''));
  return [...shipped, 'plugins', '.kiro', 'src'];
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
    .filter((file) => !/\.(png|jpe?g|gif|webp|ico|wasm|node|db|gz|zip)$/i.test(file))
    .filter((file) => existsSync(join(ROOT, file)) && lstatSync(join(ROOT, file)).isFile());
}

describe('floating third-party CLI versions (#1404)', () => {
  it('should_flagFloatingTags_when_commandOrArgvUsesDistTag', () => {
    expect(findFloatingCliRefs('npx @claude-flow/cli@latest memory store')).toEqual(['@claude-flow/cli@latest']);
    expect(findFloatingCliRefs('npm install -g claude-flow@alpha')).toEqual(['claude-flow@alpha']);
    expect(findFloatingCliRefs("spawn('npx', ['--yes', 'ruflo@latest'])")).toEqual(['ruflo@latest']);
    expect(findFloatingCliRefs('npx -y agentdb@next init')).toEqual(['agentdb@next']);
  });

  it('should_acceptPinnedAndExemptRefs_when_versionIsExactOrFirstParty', () => {
    expect(findFloatingCliRefs('npx ruflo@3.5.18 memory store')).toEqual([]);
    expect(findFloatingCliRefs('npx -y agentic-qe@latest mcp')).toEqual([]);
    expect(findFloatingCliRefs('npm install -g npm@latest')).toEqual([]);
    expect(findFloatingCliRefs('V3 deep agentic-flow@alpha integration')).toEqual([]);
    expect(findFloatingCliRefs('- **Root Cause**: `ruvector@latest` had a broken dependency')).toEqual([]);
  });

  it('should_findNoFloatingThirdPartyCli_when_scanningShippedAndGeneratorFiles', () => {
    const files = trackedFiles();
    expect(files.length).toBeGreaterThan(100);

    const offenders = files
      .filter((file) => !(file in RUFLO_OWNED_FILES))
      .flatMap((file) => {
        const refs = findFloatingCliRefs(readFileSync(join(ROOT, file), 'utf8'));
        return refs.length > 0 ? [`${file}: ${[...new Set(refs)].join(', ')}`] : [];
      });

    expect(offenders).toEqual([]);
  });

  it('should_useOneRufloPin_when_filesPinRuflo', () => {
    const setup = readFileSync(join(ROOT, 'src/cli/commands/claude-flow-setup.ts'), 'utf8');
    const canonical = /'ruflo@(\d+\.\d+\.\d+)'/.exec(setup)?.[1];
    expect(canonical, 'claude-flow-setup.ts no longer pins ruflo').toBeDefined();

    const mismatched = trackedFiles()
      // CHANGELOG.md records past pins on purpose.
      .filter((file) => !(file in RUFLO_OWNED_FILES) && file !== 'CHANGELOG.md')
      .flatMap((file) => {
        const versions = [...readFileSync(join(ROOT, file), 'utf8').matchAll(/\bruflo@(\d[\w.-]*)/g)]
          .map((m) => m[1])
          .filter((v) => v !== canonical);
        return versions.length > 0 ? [`${file}: ruflo@${[...new Set(versions)].join(', ruflo@')}`] : [];
      });

    expect(mismatched).toEqual([]);
  });

  it('should_keepAllowlistCurrent_when_rufloOwnedFilesChange', () => {
    for (const file of Object.keys(RUFLO_OWNED_FILES)) {
      expect(existsSync(join(ROOT, file)), `${file} no longer exists; drop it from the allowlist`).toBe(true);
    }
  });
});
