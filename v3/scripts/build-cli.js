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
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from ROOT package.json (published package)
const rootPkgPath = join(__dirname, '..', '..', 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));
const version = rootPkg.version;

console.log(`Building CLI with version: ${version}`);

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
  'yaml',
  'commander',
  'cli-progress',
  'ora',
  'express',
];

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
        // Re-export all properties as named exports so destructured imports work
        'const __keys = __mod && typeof __mod === "object" ? Object.keys(__mod) : [];',
        'const __proxy = new Proxy(__mod || {}, { get: (t, k) => t[k] });',
        'export const { pipeline, SonaEngine, HNSWIndex, AttentionEngine, GNNEngine } = __proxy;',
      ].join('\n'),
      loader: 'js',
    }));
  },
};

try {
  await build({
    entryPoints: [join(__dirname, '..', 'src/cli/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: esmExternals,
    plugins: [nativeRequirePlugin],
    outfile: join(__dirname, '..', 'dist/cli/bundle.js'),
    define: {
      '__CLI_VERSION__': JSON.stringify(version),
    },
    banner: {
      js: '#!/usr/bin/env node',
    },
  });
  console.log(`CLI bundle built successfully (v${version})`);
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
