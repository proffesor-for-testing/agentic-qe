#!/usr/bin/env node

/**
 * Check whether the v3 QE agents in the assets directory are in sync with the
 * source files in the repo (cross-platform replacement for the bash sync:agents:check script).
 *
 * Uses CommonJS for maximum Node.js compatibility across Windows, Mac, and Linux.
 */

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const V3_DIR = path.dirname(SCRIPT_DIR);
const REPO_ROOT = path.dirname(V3_DIR);

/**
 * Compare two files by reading their contents. Returns true if they are identical.
 * Returns false if either file does not exist or contents differ.
 */
function filesMatch(fileA, fileB) {
  try {
    const contentsA = fs.readFileSync(fileA);
    const contentsB = fs.readFileSync(fileB);
    return contentsA.equals(contentsB);
  } catch {
    return false;
  }
}

function main() {
  console.log('Checking v3 QE agents sync status:');

  const sourceAgentsDir = path.join(REPO_ROOT, '.claude', 'agents', 'v3');
  const destAgentsDir = path.join(V3_DIR, 'assets', 'agents', 'v3');
  const sourceSubagentsDir = path.join(sourceAgentsDir, 'subagents');
  const destSubagentsDir = path.join(destAgentsDir, 'subagents');

  let warnings = 0;

  // Check main agents
  try {
    const files = fs.readdirSync(sourceAgentsDir).filter(function (f) {
      return f.startsWith('qe-') && f.endsWith('.md');
    });
    for (const file of files) {
      const src = path.join(sourceAgentsDir, file);
      const dest = path.join(destAgentsDir, file);
      if (fs.statSync(src).isFile() && !filesMatch(src, dest)) {
        console.log('  Warning: ' + file);
        warnings++;
      }
    }
  } catch {
    // Source directory missing -- nothing to check
  }

  // Check subagents
  try {
    const files = fs.readdirSync(sourceSubagentsDir).filter(function (f) {
      return f.startsWith('qe-') && f.endsWith('.md');
    });
    for (const file of files) {
      const src = path.join(sourceSubagentsDir, file);
      const dest = path.join(destSubagentsDir, file);
      if (fs.statSync(src).isFile() && !filesMatch(src, dest)) {
        console.log('  Warning: subagents/' + file);
        warnings++;
      }
    }
  } catch {
    // Subagents directory missing -- nothing to check
  }

  if (warnings > 0) {
    console.log(warnings + ' file(s) out of sync. Run "npm run sync:agents" to update.');
  }

  console.log('Check complete');
}

main();
