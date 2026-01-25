#!/usr/bin/env node
/**
 * Build script for CLI bundle
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

console.log(`Building CLI with version: ${version}`);

// Build CLI with version injected
const cmd = [
  'esbuild',
  'src/cli/index.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  '--packages=external',
  '--outfile=dist/cli/bundle.js',
  `--define:__CLI_VERSION__='"${version}"'`,
].join(' ');

try {
  execSync(cmd, { stdio: 'inherit', cwd: join(__dirname, '..') });
  console.log(`CLI bundle built successfully (v${version})`);
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
