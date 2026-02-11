#!/usr/bin/env node

/**
 * Cross-platform Tier 3 skill validation runner
 *
 * Runs validate-skill.cjs --self-test for each tier 3 skill.
 * Fully cross-platform — no bash/shell dependency.
 *
 * Uses CommonJS for maximum Node.js compatibility.
 */

const { execSync } = require('child_process');
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
const validatorScript = join(__dirname, 'validate-skill.cjs');

let failures = 0;

for (const skill of TIER3_SKILLS) {
  const configPath = join(projectRoot, '.claude', 'skills', skill, 'scripts', 'validate-config.json');

  if (!existsSync(configPath)) {
    console.log(`${YELLOW}[tier3]${RESET} Skipping ${skill} — validate-config.json not found`);
    continue;
  }

  console.log(`${CYAN}[tier3]${RESET} Validating: ${skill}`);

  try {
    execSync(`node "${validatorScript}" ${skill} --self-test`, {
      cwd: projectRoot,
      stdio: 'inherit',
      timeout: 60000,
    });
    console.log(`${GREEN}[tier3]${RESET} ${skill}: PASS`);
  } catch (err) {
    console.log(`${RED}[tier3]${RESET} ${skill}: FAIL`);
    failures++;
  }
}

if (failures > 0) {
  console.log(`\n${RED}[tier3]${RESET} ${failures} skill(s) failed validation`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}[tier3]${RESET} All tier 3 skills validated`);
}
