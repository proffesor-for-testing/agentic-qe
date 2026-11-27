/**
 * Shared harness for #1470 skill-script tests.
 *
 * Puts a BSD-like `grep` first on PATH: it rejects -P / --perl-regexp with exit 2
 * (as macOS grep does) and otherwise execs the real grep, so GNU-only usage fails
 * on Linux CI the same way it fails on stock macOS.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const ROOT = resolve(__dirname, '../../../..');
export const MIRRORS = ['assets/skills', '.claude/skills'] as const;

export interface RunResult { status: number | null; stdout: string; stderr: string }

export interface BsdHarness {
  work: string;
  bsdBin: string;
  env(extra?: Record<string, string>, prependPath?: string): NodeJS.ProcessEnv;
  run(cmd: string, args: string[], opts?: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv }): RunResult;
  dispose(): void;
}

export function writeExec(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

export function realBinary(name: string): string {
  return execFileSync('bash', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
}

export function createBsdHarness(prefix: string): BsdHarness {
  const work = mkdtempSync(join(tmpdir(), prefix));
  const bsdBin = join(work, 'bsd-bin');
  mkdirSync(bsdBin);
  writeExec(join(bsdBin, 'grep'), `#!/bin/sh
# Emulates BSD grep's rejection of -P / --perl-regexp; everything else is the real grep.
for a in "$@"; do
  case "$a" in
    --) break ;;
    --perl-regexp) echo "grep: unrecognized option \\\`--perl-regexp'" >&2; exit 2 ;;
    --*) ;;
    -*P*) echo "grep: invalid option -- P" >&2; exit 2 ;;
  esac
done
exec ${realBinary('grep')} "$@"
`);
  const env = (extra: Record<string, string> = {}, prependPath?: string): NodeJS.ProcessEnv => ({
    ...process.env,
    PATH: `${prependPath ? `${prependPath}:` : ''}${bsdBin}:${process.env.PATH}`,
    NO_COLOR: '1',
    ...extra,
  });
  return {
    work,
    bsdBin,
    env,
    run(cmd, args, opts = {}) {
      const r = spawnSync(cmd, args, {
        cwd: opts.cwd ?? work, input: opts.input ?? '', env: opts.env ?? env(), encoding: 'utf8', timeout: 30_000,
      });
      return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    },
    dispose() {
      rmSync(work, { recursive: true, force: true });
    },
  };
}

/** Body of the first fenced block of `lang` after `heading` in a markdown file. */
export function fencedBlockAfter(markdownPath: string, heading: string, lang: 'bash' | 'json'): string {
  const markdown = readFileSync(join(ROOT, markdownPath), 'utf8');
  const from = markdown.indexOf(heading);
  if (from < 0) throw new Error(`${markdownPath}: heading ${heading} not found`);
  const m = new RegExp('```' + lang + '\\n([\\s\\S]*?)```').exec(markdown.slice(from));
  if (!m) throw new Error(`${markdownPath}: no \`\`\`${lang} block after ${heading}`);
  return m[1];
}
