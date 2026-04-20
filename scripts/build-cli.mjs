#!/usr/bin/env node
/**
 * Build script for CLI bundle
 * Injects version from root package.json at build time
 *
 * Uses createRequire shim for native/CJS modules to fix ESM resolution
 * in Node.js 22+ where legacyMainResolve fails for packages without
 * an "exports" field (e.g. better-sqlite3 with main: "lib/index.js").
 */

import { build } from 'esbuild';
import { readFileSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from ROOT package.json (published package)
const rootPkgPath = join(__dirname, '..', 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));
const version = rootPkg.version;

console.log(`Building CLI with version: ${version}`);

// Pre-build clean: delete stale code-split chunks so only fresh artefacts ship.
// Without this, dist/cli/chunks/ accumulates across builds (audit found 799
// chunks shipped with only 240 fresh), inflating the npm tarball by ~79%.
const chunksDir = join(__dirname, '..', 'dist/cli/chunks');
rmSync(chunksDir, { recursive: true, force: true });

// Native modules with CJS-only exports or native addons.
// These fail with ESM static import in Node.js 22+ due to missing
// "exports" field in their package.json — legacyMainResolve cannot
// resolve the entry point. We intercept these and use createRequire().
const nativeModules = [
  'better-sqlite3',
  'hnswlib-node',
  '@ruvector/attention',
  '@ruvector/gnn',
  '@ruvector/sona',
  '@ruvector/attention-darwin-arm64',
  '@ruvector/attention-linux-arm64-gnu',
  '@ruvector/gnn-darwin-arm64',
  '@ruvector/gnn-linux-arm64-gnu',
  '@ruvector/rvf-node',
  '@ruvector/rvf-node-darwin-arm64',
  '@ruvector/rvf-node-darwin-x64',
  '@ruvector/rvf-node-linux-arm64-gnu',
  '@ruvector/rvf-node-linux-x64-gnu',
  '@ruvector/rvf-node-win32-x64-msvc',
  '@xenova/transformers',
  'vibium',
  '@claude-flow/browser',
  'prime-radiant-advanced-wasm',
  'pg',
  'pg-native',
  'web-tree-sitter',
];

// Pure JS externals that work fine with ESM import
const esmExternals = [
  'fast-glob',
  'yaml',
  'commander',
  'chalk',
  'cli-progress',
  'ora',
  'express',
];

/**
 * esbuild plugin: Lazy-load typescript via createRequire().
 *
 * typescript is a devDependency — it won't be available when users install
 * agentic-qe globally. A top-level ESM `import` would crash the entire CLI
 * (even `aqe --version`). This plugin replaces the static import with a
 * lazy createRequire() call that only executes when the TypeScript parser
 * is actually used, and throws a helpful error if typescript is missing.
 */
/**
 * esbuild plugin: Lazy-load typescript via createRequire().
 *
 * typescript is a devDependency — it won't be available when users install
 * agentic-qe globally. A top-level ESM `import` would crash the entire CLI
 * (even `aqe --version`). This plugin replaces the static import with a
 * lazy createRequire() call that only executes when the TypeScript parser
 * is actually used, and throws a helpful error if typescript is missing.
 *
 * The source code uses `import * as ts from 'typescript'` (namespace import),
 * so we keep typescript external but rewrite the import sites in the output
 * bundle to use a lazy-loading wrapper instead of a top-level import.
 */
const typescriptLazyPlugin = {
  name: 'typescript-lazy',
  setup(build) {
    // Keep typescript external so it's not bundled (~9MB)
    build.onResolve({ filter: /^typescript$/ }, () => ({
      path: 'typescript',
      namespace: 'typescript-lazy',
    }));

    // Generate a virtual module that lazy-loads via createRequire on first use
    build.onLoad({ filter: /.*/, namespace: 'typescript-lazy' }, () => ({
      contents: [
        'import { createRequire } from "module";',
        'let _ts;',
        'function _load() {',
        '  if (!_ts) {',
        '    const req = createRequire(import.meta.url);',
        '    try { _ts = req("typescript"); }',
        '    catch {',
        '      try { _ts = req("typescript/lib/typescript.js"); }',
        '      catch {',
        '        _ts = new Proxy({}, { get(_, p) {',
        '          if (p === "__esModule" || typeof p === "symbol") return undefined;',
        '          throw new Error("TypeScript is required for code analysis. Install it: npm install -g typescript");',
        '        }});',
        '      }',
        '    }',
        '  }',
        '  return _ts;',
        '}',
        // Use a Proxy as the default export so `import * as ts` works.
        // When esbuild bundles `import * as ts from "typescript"` with this
        // virtual module, it accesses properties on the default export.
        'export default new Proxy({}, {',
        '  get(_, p) { return _load()[p]; },',
        '  has(_, p) { return p in _load(); },',
        '  ownKeys() { return Object.keys(_load()); },',
        '  getOwnPropertyDescriptor(_, p) {',
        '    const v = _load()[p];',
        '    if (v !== undefined) return { configurable: true, enumerable: true, value: v };',
        '  },',
        '});',
      ].join('\n'),
      loader: 'js',
    }));
  },
};

/**
 * esbuild plugin: Rewrite native/CJS module imports to use createRequire()
 *
 * Instead of generating `import X from "better-sqlite3"` (which fails in
 * Node 22 ESM), this plugin inlines a virtual module that does:
 *   const X = createRequire(import.meta.url)("better-sqlite3")
 */
const nativeRequirePlugin = {
  name: 'native-require',
  setup(build) {
    const escapedNames = nativeModules.map(m =>
      m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const filter = new RegExp(`^(${escapedNames.join('|')})(\/.*)?$`);

    build.onResolve({ filter }, (args) => ({
      path: args.path,
      namespace: 'native-require',
    }));

    build.onLoad({ filter: /.*/, namespace: 'native-require' }, (args) => ({
      contents: [
        'import { createRequire } from "module";',
        'const __require = createRequire(import.meta.url);',
        `const __mod = __require(${JSON.stringify(args.path)});`,
        'export default __mod;',
        // Re-export all named exports used across the codebase.
        // Each module only defines its own exports; the rest resolve to undefined
        // which is fine since they are never imported from the wrong module.
        'export const {',
        '  // @ruvector/gnn',
        '  RuvectorLayer, TensorCompress, differentiableSearch,',
        '  hierarchicalForward, getCompressionLevel, init,',
        '  // @ruvector/attention',
        '  FlashAttention, DotProductAttention, MultiHeadAttention,',
        '  HyperbolicAttention, LinearAttention, MoEAttention,',
        '  // @ruvector/sona',
        '  SonaEngine,',
        '  // @xenova/transformers',
        '  pipeline,',
        '} = __mod || {};',
      ].join('\n'),
      loader: 'js',
    }));
  },
};

try {
  await build({
    entryPoints: [join(__dirname, '..', 'src/cli/index.ts')],
    bundle: true,
    splitting: true,
    minify: true,
    platform: 'node',
    format: 'esm',
    external: esmExternals,
    plugins: [typescriptLazyPlugin, nativeRequirePlugin],
    outdir: join(__dirname, '..', 'dist/cli'),
    entryNames: 'bundle',
    chunkNames: 'chunks/[name]-[hash]',
    define: {
      '__CLI_VERSION__': JSON.stringify(version),
    },
    banner: {
      // Provide a real `require` for CJS compatibility in ESM chunks.
      // esbuild generates a CJS shim that checks `typeof require < "u"` —
      // without this, every require('fs')/require('path')/etc. in chunks
      // throws "Dynamic require of X is not supported" because ESM has no
      // global `require`. createRequire gives us a standards-compliant one.
      js: [
        'import{createRequire as __cr}from"module";const require=__cr(import.meta.url);',
        `if(process.argv.includes('--version')||process.argv.includes('-v')){console.log(${JSON.stringify(version)});process.exit(0)}`,
      ].join(''),
    },
  });
  console.log(`CLI bundle built successfully (v${version})`);
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
