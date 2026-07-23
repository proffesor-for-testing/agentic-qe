/**
 * Packaging-surface guards (issue #565, ADR-115 amendment 2026-07-23).
 *
 * These assert facts about what a *consumer* of `npm install agentic-qe` ends up
 * with. They are cheap manifest reads — no install, no network — and exist so a
 * well-meaning "let's declare the peer again" edit fails in CI instead of on a
 * user's machine three weeks later.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = join(__dirname, '..', '..', '..');

const pkg = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf-8')
) as {
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

const lock = JSON.parse(
  readFileSync(join(repoRoot, 'package-lock.json'), 'utf-8')
) as {
  packages: Record<
    string,
    { version?: string; dev?: boolean; peer?: boolean; optional?: boolean }
  >;
};

describe('consumer dependency surface (#565)', () => {
  it('does not declare @huggingface/transformers as a peer dependency', () => {
    // npm >=7 auto-installs OPTIONAL peers — `optional: true` only suppresses
    // the resolution error. Declaring this peer put onnxruntime-node ->
    // adm-zip@0.5.x (GHSA-xcpc-8h2w-3j85) in every consumer's tree, and no
    // resolvable version of that chain is unaffected.
    expect(pkg.peerDependencies ?? {}).not.toHaveProperty(
      '@huggingface/transformers'
    );
    expect(pkg.peerDependenciesMeta ?? {}).not.toHaveProperty(
      '@huggingface/transformers'
    );
  });

  it('keeps @huggingface/transformers available for our own dev/test runs', () => {
    // Dropping the peer must not break the in-process embedding path locally.
    expect(pkg.devDependencies ?? {}).toHaveProperty('@huggingface/transformers');
  });

  it('leaves the transformers/onnx/adm-zip chain dev-only in the lockfile', () => {
    for (const path of [
      'node_modules/@huggingface/transformers',
      'node_modules/onnxruntime-node',
      'node_modules/adm-zip',
    ]) {
      const entry = lock.packages[path];
      expect(entry, `${path} missing from lockfile`).toBeDefined();
      expect(entry.dev, `${path} is reachable by consumers`).toBe(true);
    }
  });

  it('resolves adm-zip to a version without GHSA-xcpc-8h2w-3j85', () => {
    const version = lock.packages['node_modules/adm-zip']?.version ?? '0.0.0';
    const [major, minor] = version.split('.').map(Number);
    // Advisory range is <0.6.0.
    expect(major > 0 || minor >= 6).toBe(true);
  });

  it('retains every declared optionalDependency in the lockfile', () => {
    // Guards the known dependabot failure mode: a lock regenerated on one
    // platform prunes the other platforms' @ruvector native binaries, and
    // `npm ci` then fails with EUSAGE everywhere else.
    for (const name of Object.keys(pkg.optionalDependencies ?? {})) {
      expect(
        lock.packages[`node_modules/${name}`],
        `optionalDependency ${name} was pruned from the lockfile`
      ).toBeDefined();
    }
  });
});
