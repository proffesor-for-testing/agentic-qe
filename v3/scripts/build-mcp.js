#!/usr/bin/env node
/**
 * Build script for MCP bundle
 * Injects version from root package.json at build time
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from ROOT package.json (published package)
const rootPkgPath = join(__dirname, '..', '..', 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));
const version = rootPkg.version;

console.log(`Building MCP with version: ${version}`);

// Native modules and packages that cannot be bundled
// (native binaries, dynamic requires, or optional dependencies)
const nativeExternals = [
  // Native modules with platform-specific binaries
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
  // PostgreSQL driver (optional)
  'pg',
  'pg-native',
  // CommonJS modules with dynamic requires (incompatible with ESM bundling)
  'typescript',
  'fast-glob',
  'yaml',
  'commander',
  'cli-progress',
  'ora',
  // Optional dependencies
  'express',
];

// Build MCP with version injected
// Bundle pure JS dependencies inline, externalize only native modules
const cmd = [
  'esbuild',
  'src/mcp/entry.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  ...nativeExternals.map(pkg => `--external:${pkg}`),
  '--outfile=dist/mcp/bundle.js',
  `--define:__CLI_VERSION__='"${version}"'`,
  "--banner:js='#!/usr/bin/env node'",
].join(' ');

try {
  execSync(cmd, { stdio: 'inherit', cwd: join(__dirname, '..') });
  console.log(`MCP bundle built successfully (v${version})`);
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
