#!/usr/bin/env node
/**
 * Build script for MCP bundle
 * Injects version from root package.json at build time
 *
 * Uses createRequire shim for native/CJS modules to fix ESM resolution
 * in Node.js 22+ where legacyMainResolve fails for packages without
 * an "exports" field (e.g. better-sqlite3 with main: "lib/index.js").
 */

import { build } from 'esbuild';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from ROOT package.json (published package)
const rootPkgPath = join(__dirname, '..', 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));
const version = rootPkg.version;

console.log(`Building MCP with version: ${version}`);

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
  'fast-json-patch',
  'yaml',
  'commander',
  'chalk',
  'cli-progress',
  'ora',
  'express',
  // @faker-js/faker is a devDep loaded lazily from test-data-generator.ts.
  // Keeping it external means it is never bundled into the shipped MCP —
  // callers that invoke test-data generation need to install it themselves.
  '@faker-js/faker',
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
 */
const typescriptLazyPlugin = {
  name: 'typescript-lazy',
  setup(build) {
    build.onResolve({ filter: /^typescript$/ }, () => ({
      path: 'typescript',
      namespace: 'typescript-lazy',
    }));

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
        // Re-export all named exports used across the codebase
        'export const {',
        '  RuvectorLayer, TensorCompress, differentiableSearch,',
        '  hierarchicalForward, getCompressionLevel, init,',
        '  FlashAttention, DotProductAttention, MultiHeadAttention,',
        '  HyperbolicAttention, LinearAttention, MoEAttention,',
        '  SonaEngine, pipeline,',
        '} = __mod || {};',
      ].join('\n'),
      loader: 'js',
    }));
  },
};

try {
  await build({
    entryPoints: [join(__dirname, '..', 'src/mcp/entry.ts')],
    bundle: true,
    minify: true,
    platform: 'node',
    format: 'esm',
    external: esmExternals,
    plugins: [typescriptLazyPlugin, nativeRequirePlugin],
    outfile: join(__dirname, '..', 'dist/mcp/bundle.js'),
    define: {
      '__CLI_VERSION__': JSON.stringify(version),
    },
    banner: {
      // Shebang + CJS require shim for ESM output (see build-cli.mjs for details)
      js: '#!/usr/bin/env node\nimport{createRequire as __cr}from"module";const require=__cr(import.meta.url);',
    },
  });
  console.log(`MCP bundle built successfully (v${version})`);
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
