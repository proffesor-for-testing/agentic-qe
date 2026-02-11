#!/usr/bin/env node

/**
 * Sync v3 QE agents from the repo to the v3 package assets (cross-platform).
 * Replaces the bash sync:agents npm script.
 *
 * Uses CommonJS for maximum Node.js compatibility across Windows, Mac, and Linux.
 */

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const V3_DIR = path.dirname(SCRIPT_DIR);
const REPO_ROOT = path.dirname(V3_DIR);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  const sourceAgentsDir = path.join(REPO_ROOT, '.claude', 'agents', 'v3');
  const destAgentsDir = path.join(V3_DIR, 'assets', 'agents', 'v3');
  const sourceSubagentsDir = path.join(sourceAgentsDir, 'subagents');
  const destSubagentsDir = path.join(destAgentsDir, 'subagents');

  ensureDir(destAgentsDir);

  let mainCount = 0;
  let subCount = 0;

  // Copy main qe-*.md agents
  try {
    const files = fs.readdirSync(sourceAgentsDir).filter(function (f) {
      return f.startsWith('qe-') && f.endsWith('.md');
    });
    for (const file of files) {
      const src = path.join(sourceAgentsDir, file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, path.join(destAgentsDir, file));
        mainCount++;
      }
    }
  } catch {
    // Source directory missing or unreadable -- silently ignore
  }

  // Copy subagent qe-*.md files
  ensureDir(destSubagentsDir);

  try {
    const files = fs.readdirSync(sourceSubagentsDir).filter(function (f) {
      return f.startsWith('qe-') && f.endsWith('.md');
    });
    for (const file of files) {
      const src = path.join(sourceSubagentsDir, file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, path.join(destSubagentsDir, file));
        subCount++;
      }
    }
  } catch {
    // Subagents directory missing or unreadable -- silently ignore
  }

  const total = mainCount + subCount;
  console.log(
    'Synced v3 QE agents (' +
      mainCount +
      ' main + ' +
      subCount +
      ' subagents = ' +
      total +
      ' total)'
  );
}

main();
