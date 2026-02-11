#!/usr/bin/env node

/**
 * Cross-platform postinstall script for agentic-qe
 *
 * Replaces the bash-only: test -f v3/package.json && cd v3 && npm install || true
 * Works on Windows (cmd.exe, PowerShell) and Unix (bash, zsh) alike.
 *
 * Uses CommonJS for maximum Node.js compatibility during install.
 */

const { existsSync } = require('fs');
const { execSync } = require('child_process');
const { join } = require('path');

const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

function log(msg) {
  console.log(`${CYAN}[agentic-qe]${RESET} ${msg}`);
}

function main() {
  const v3PackageJson = join(__dirname, '..', 'v3', 'package.json');

  if (!existsSync(v3PackageJson)) {
    // v3/package.json not present (e.g. published package without v3 source)
    return;
  }

  const v3Dir = join(__dirname, '..', 'v3');

  log('Installing v3 dependencies...');

  try {
    execSync('npm install', {
      cwd: v3Dir,
      stdio: 'inherit',
      env: { ...process.env },
    });
    console.log(`${GREEN}[agentic-qe]${RESET} v3 dependencies installed successfully`);
  } catch (err) {
    // Don't fail the parent install if v3 install has issues
    console.log(`${YELLOW}[agentic-qe]${RESET} v3 dependency install had warnings (non-blocking): ${err.message}`);
  }
}

try {
  main();
} catch (err) {
  // Never block the parent install
  if (process.env.DEBUG) {
    console.error(`[agentic-qe] postinstall error: ${err.message}`);
  }
}
