/**
 * Bundle-relative require guard (issue #1237).
 *
 * A `require` created with `createRequire(import.meta.url)` resolves its path
 * at runtime against the file it runs in. Unbundled that is the source file's
 * own directory. Inside `dist/mcp/bundle.js` or a `dist/cli/chunks/*.js` file
 * it is the bundle's directory, so a relative module path points at a file that
 * does not exist. The surrounding `catch {}` then hid the failure: the HNSW
 * index fell back to a 10,000-entry cap and the transfer coherence gate fell
 * back to an approve-everything stub.
 *
 * Use a static import for project modules instead; the bundlers inline those.
 * Relative `package.json` reads stay allowed because every entry point sits two
 * levels below the package root, both bundled and unbundled.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const repoRoot = join(__dirname, '..', '..', '..');
const srcRoot = join(repoRoot, 'src');

// Known offenders with a tracking issue. Remove an entry when it is fixed.
const ALLOWED: Record<string, string> = {};

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return '';
  return line;
}

/** Relative-path calls through a createRequire()-made require, excluding package.json. */
function findBundleRelativeRequires(source: string): string[] {
  if (!source.includes('createRequire')) return [];
  const names = new Set<string>();
  for (const m of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createRequire\s*\(/g)) {
    names.add(m[1]);
  }
  const hits: string[] = [];
  source.split(/\r?\n/).forEach((raw, i) => {
    const line = stripComments(raw);
    if (!line) return;
    const callees = [...names].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const patterns = [/createRequire\s*\([^)]*\)\s*\(\s*(['"`])(\.\.?\/[^'"`]+)\1/g];
    if (callees) patterns.push(new RegExp(`\\b(?:${callees})\\s*\\(\\s*(['"\`])(\\.\\.?\\/[^'"\`]+)\\1`, 'g'));
    for (const re of patterns) {
      for (const m of line.matchAll(re)) {
        if (!m[2].endsWith('package.json')) hits.push(`${i + 1}: ${m[2]}`);
      }
    }
  });
  return hits;
}

describe('bundle-relative require guard (#1237)', () => {
  it('flags relative module requires made through createRequire', () => {
    const src = [
      "import { createRequire } from 'node:module';",
      'const require = createRequire(import.meta.url);',
      "// require('./ignored-comment.js')",
      "const a = require('../../kernel/hnsw-adapter.js');",
      "const pkg = require('../../package.json');",
      "const b = require('hnswlib-node');",
      "const c = createRequire(import.meta.url)('./inline.js');",
    ].join('\n');
    expect(findBundleRelativeRequires(src)).toEqual([
      '4: ../../kernel/hnsw-adapter.js',
      '7: ./inline.js',
    ]);
  });

  it('src/ has no createRequire-based relative module require outside the allowlist', () => {
    const offenders: string[] = [];
    for (const file of listTsFiles(srcRoot)) {
      const rel = relative(repoRoot, file).split('\\').join('/');
      const hits = findBundleRelativeRequires(readFileSync(file, 'utf-8'));
      if (hits.length === 0) continue;
      if (ALLOWED[rel]) continue;
      offenders.push(...hits.map((h) => `${rel}:${h}`));
    }
    expect(offenders).toEqual([]);
  });

  it('allowlisted files still contain the tracked pattern (drop the entry once fixed)', () => {
    for (const rel of Object.keys(ALLOWED)) {
      const hits = findBundleRelativeRequires(readFileSync(join(repoRoot, rel), 'utf-8'));
      expect(hits.length, `${rel} no longer needs its allowlist entry`).toBeGreaterThan(0);
    }
  });
});
