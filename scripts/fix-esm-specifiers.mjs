#!/usr/bin/env node

/**
 * Normalize relative ESM specifiers in TypeScript's emitted JavaScript.
 *
 * The source tree historically uses bundler-style extensionless imports. The
 * CLI/MCP bundles resolve those, but package exports point at raw `dist/` ESM,
 * where Node requires an explicit file or directory index. This post-emit pass
 * keeps source churn contained while making the published artifact valid ESM.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SPECIFIER_RE = /(from\s*|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/g;
const ALIAS_SPECIFIER_RE = /(from\s*|import\s*\(\s*|import\s+)(['"])(@(shared|kernel|domains|coordination|adapters|integrations)\/[^'"\n]+)\2/g;

export function resolveRelativeSpecifier(importerPath, specifier) {
  const suffixIndex = specifier.search(/[?#]/);
  const cleanSpecifier = suffixIndex === -1 ? specifier : specifier.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : specifier.slice(suffixIndex);
  if (/\.(?:[cm]?js|json|node)$/.test(cleanSpecifier)) return specifier;

  const resolved = path.resolve(path.dirname(importerPath), cleanSpecifier);
  if (fs.existsSync(`${resolved}.js`)) return `${cleanSpecifier}.js${suffix}`;
  if (fs.existsSync(path.join(resolved, 'index.js'))) return `${cleanSpecifier}/index.js${suffix}`;
  if (fs.existsSync(`${resolved}.json`)) return `${cleanSpecifier}.json${suffix}`;
  return specifier;
}

export function normalizeEmittedESM(distDir) {
  const files = listJavaScriptFiles(distDir);
  let rewrittenFiles = 0;
  let rewrittenSpecifiers = 0;

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    let normalized = original.replace(
      SPECIFIER_RE,
      (match, prefix, quote, specifier) => {
        const resolved = resolveRelativeSpecifier(file, specifier);
        if (resolved === specifier) return match;
        rewrittenSpecifiers++;
        return `${prefix}${quote}${resolved}${quote}`;
      },
    );
    normalized = normalized.replace(
      ALIAS_SPECIFIER_RE,
      (match, prefix, quote, specifier, alias) => {
        const target = path.join(distDir, alias, specifier.slice(alias.length + 2));
        const targetExists = fs.existsSync(target)
          || fs.existsSync(`${target}.js`)
          || fs.existsSync(path.join(target, 'index.js'))
          || fs.existsSync(`${target}.json`);
        if (!targetExists) return match;
        let relative = path.relative(path.dirname(file), target).split(path.sep).join('/');
        if (!relative.startsWith('.')) relative = `./${relative}`;
        const resolved = resolveRelativeSpecifier(file, relative);
        rewrittenSpecifiers++;
        return `${prefix}${quote}${resolved}${quote}`;
      },
    );
    if (normalized !== original) {
      fs.writeFileSync(file, normalized);
      rewrittenFiles++;
    }
  }

  return { scannedFiles: files.length, rewrittenFiles, rewrittenSpecifiers };
}

function listJavaScriptFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const resolved = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(resolved);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(resolved);
    }
  }
  return files;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const distDir = path.resolve(process.argv[2] ?? 'dist');
  const result = normalizeEmittedESM(distDir);
  const courtRefereeCli = path.join(distDir, 'skills', 'qe-court', 'cli.js');
  if (fs.existsSync(courtRefereeCli)) fs.chmodSync(courtRefereeCli, 0o755);
  console.log(
    `Normalized ESM specifiers: ${result.rewrittenSpecifiers} in `
      + `${result.rewrittenFiles}/${result.scannedFiles} emitted files`,
  );
}
