#!/usr/bin/env node

/**
 * Cross-platform Tier 3 skill validation runner
 *
 * Replaces the bash-only:
 *   for skill in api-testing-patterns security-testing performance-testing; do
 *     .claude/skills/$skill/scripts/validate.sh --self-test;
 *   done
 *
 * Uses CommonJS for maximum Node.js compatibility.
 */

const { execSync, spawnSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

const TIER3_SKILLS = [
  'api-testing-patterns',
  'security-testing',
  'performance-testing',
];

const projectRoot = join(__dirname, '..');

// Detect available shell: prefer bash (supports pipefail), fall back to sh
function findShell() {
  for (const shell of ['bash', 'sh']) {
    const check = spawnSync(process.platform === 'win32' ? 'where' : 'which', [shell], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    if (check.status === 0) return shell;
  }
  return null;
}

const shell = findShell();

if (!shell) {
  console.log(`${YELLOW}[tier3]${RESET} No shell (bash/sh) found — skipping tier 3 validation`);
  console.log(`${YELLOW}[tier3]${RESET} On Windows, install Git for Windows to get bash`);
  process.exit(0);
}

let failures = 0;

for (const skill of TIER3_SKILLS) {
  const scriptPath = join(projectRoot, '.claude', 'skills', skill, 'scripts', 'validate.sh');

  if (!existsSync(scriptPath)) {
    console.log(`${YELLOW}[tier3]${RESET} Skipping ${skill} — validate.sh not found`);
    continue;
  }

  console.log(`${CYAN}[tier3]${RESET} Validating: ${skill}`);

  try {
    execSync(`${shell} "${scriptPath}" --self-test`, {
      cwd: projectRoot,
      stdio: 'inherit',
      timeout: 60000,
    });
    console.log(`${GREEN}[tier3]${RESET} ${skill}: PASS`);
  } catch (err) {
    if (err.message && err.message.includes('ENOENT')) {
      console.log(`${YELLOW}[tier3]${RESET} ${skill}: SKIPPED (shell not available)`);
    } else {
      console.log(`${RED}[tier3]${RESET} ${skill}: FAIL`);
      failures++;
    }
  }
}

if (failures > 0) {
  console.log(`\n${RED}[tier3]${RESET} ${failures} skill(s) failed validation`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}[tier3]${RESET} All tier 3 skills validated`);
}
