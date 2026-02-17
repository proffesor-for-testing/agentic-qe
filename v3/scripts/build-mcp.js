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
const rootPkgPath = join(__dirname, '..', '..', 'package.json');
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
  '@xenova/transformers',
  'vibium',
  '@claude-flow/browser',
  'prime-radiant-advanced-wasm',
  'pg',
  'pg-native',
];

// Pure JS externals that work fine with ESM import
const esmExternals = [
  'typescript',
  'fast-glob',
  'fast-json-patch',
  'yaml',
  'commander',
  'chalk',
  'cli-progress',
  'ora',
  'express',
];

/**
 * esbuild plugin: Rewrite bare "typescript" import to explicit subpath.
 *
 * TypeScript's package.json has no "exports" field — only "main": "./lib/typescript.js".
 * Node.js 22+ ESM legacyMainResolve fails to resolve the bare specifier in some
 * environments (devcontainers, NVM-managed Node). Rewriting to the explicit subpath
 * bypasses legacyMainResolve entirely (see issue #267).
 */
const typescriptResolvePlugin = {
  name: 'typescript-resolve',
  setup(build) {
    build.onResolve({ filter: /^typescript$/ }, () => ({
      path: 'typescript/lib/typescript.js',
      external: true,
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
    platform: 'node',
    format: 'esm',
    external: esmExternals,
    plugins: [typescriptResolvePlugin, nativeRequirePlugin],
    outfile: join(__dirname, '..', 'dist/mcp/bundle.js'),
    define: {
      '__CLI_VERSION__': JSON.stringify(version),
    },
    banner: {
      js: '#!/usr/bin/env node',
    },
  });
  console.log(`MCP bundle built successfully (v${version})`);
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
