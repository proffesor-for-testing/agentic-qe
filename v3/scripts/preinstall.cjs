#!/usr/bin/env node

/**
 * Preinstall script for @agentic-qe/v3
 * Detects and handles v2 installation conflicts
 *
 * Uses CommonJS for maximum Node.js compatibility
 */

const { execSync, spawnSync } = require('child_process');
const { existsSync, unlinkSync, lstatSync } = require('fs');
const { join } = require('path');

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';

function log(msg) {
  console.log(`${CYAN}[@agentic-qe/v3]${RESET} ${msg}`);
}

function warn(msg) {
  console.log(`${YELLOW}[@agentic-qe/v3]${RESET} ${msg}`);
}

function error(msg) {
  console.log(`${RED}[@agentic-qe/v3]${RESET} ${msg}`);
}

function success(msg) {
  console.log(`${GREEN}[@agentic-qe/v3]${RESET} ${msg}`);
}

function findExistingAqeBinary() {
  // Try 'which' command first
  try {
    const result = spawnSync('which', ['aqe'], { encoding: 'utf-8' });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {
    // which command failed
  }

  // Try to find via npm prefix
  try {
    const prefix = execSync('npm config get prefix', { encoding: 'utf-8' }).trim();
    const binPath = join(prefix, 'bin', 'aqe');
    if (existsSync(binPath)) {
      return binPath;
    }
  } catch {
    // Ignore
  }

  return null;
}

function checkV2Installed() {
  try {
    const result = execSync('npm list -g agentic-qe --depth=0 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.includes('agentic-qe@');
  } catch {
    return false;
  }
}

function getV2Version() {
  try {
    const result = execSync('npm list -g agentic-qe --depth=0 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const match = result.match(/agentic-qe@(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function uninstallV2() {
  try {
    log('Uninstalling agentic-qe v2...');
    execSync('npm uninstall -g agentic-qe', {
      encoding: 'utf-8',
      stdio: 'inherit'
    });
    success('Successfully uninstalled agentic-qe v2');
    return true;
  } catch (err) {
    error(`Failed to uninstall v2: ${err.message}`);
    return false;
  }
}

function removeStaleSymlink(binaryPath) {
  try {
    const stats = lstatSync(binaryPath);
    if (stats.isSymbolicLink()) {
      unlinkSync(binaryPath);
      success(`Removed stale symlink: ${binaryPath}`);
      return true;
    }
  } catch {
    // Not a symlink or can't remove
  }
  return false;
}

function main() {
  // Skip in CI environments unless explicitly requested
  if (process.env.CI && !process.env.AQE_PREINSTALL_CHECK) {
    return;
  }

  const aqeBinary = findExistingAqeBinary();
  const v2Installed = checkV2Installed();
  const v2Version = v2Installed ? getV2Version() : null;

  if (!aqeBinary && !v2Installed) {
    // Clean install, nothing to do
    return;
  }

  console.log('');
  log(`${BOLD}Checking for existing agentic-qe installation...${RESET}`);

  if (v2Installed) {
    warn(`Found agentic-qe v${v2Version || '2.x'} installed globally`);
    warn('The v2 package uses the same "aqe" binary name as v3');
    console.log('');

    // Check if we can auto-migrate
    const autoMigrate = process.env.AQE_AUTO_MIGRATE === 'true' ||
                        process.env.npm_config_yes === 'true';

    if (autoMigrate) {
      log('Auto-migrating from v2 to v3...');
      if (uninstallV2()) {
        success('Migration preparation complete. Continuing with v3 install...');
        return;
      } else {
        error('Auto-migration failed. Please run manually:');
        console.log(`  ${CYAN}npm uninstall -g agentic-qe && npm install -g @agentic-qe/v3@alpha${RESET}`);
        process.exit(1);
      }
    }

    // Interactive mode - provide clear instructions
    console.log(`${YELLOW}To upgrade from v2 to v3, choose one option:${RESET}`);
    console.log('');
    console.log(`  ${BOLD}Option 1: Auto-migrate (recommended)${RESET}`);
    console.log(`  ${CYAN}AQE_AUTO_MIGRATE=true npm install -g @agentic-qe/v3@alpha${RESET}`);
    console.log('');
    console.log(`  ${BOLD}Option 2: Manual uninstall first${RESET}`);
    console.log(`  ${CYAN}npm uninstall -g agentic-qe${RESET}`);
    console.log(`  ${CYAN}npm install -g @agentic-qe/v3@alpha${RESET}`);
    console.log('');
    console.log(`  ${BOLD}Option 3: Force overwrite${RESET}`);
    console.log(`  ${CYAN}npm install -g @agentic-qe/v3@alpha --force${RESET}`);
    console.log('');

  } else if (aqeBinary) {
    // Binary exists but v2 package not found - stale symlink or different package
    warn(`Found existing 'aqe' binary at: ${aqeBinary}`);

    // Try to identify what it's from
    try {
      const realpath = require('fs').realpathSync(aqeBinary);
      if (realpath.includes('agentic-qe')) {
        warn('This appears to be from a previous agentic-qe installation.');
      }
    } catch {
      // Can't resolve realpath
    }

    console.log('');
    console.log(`${YELLOW}To resolve the conflict:${RESET}`);
    console.log('');
    console.log(`  ${BOLD}Option 1: Remove existing binary${RESET}`);
    console.log(`  ${CYAN}rm ${aqeBinary}${RESET}`);
    console.log(`  ${CYAN}npm install -g @agentic-qe/v3@alpha${RESET}`);
    console.log('');
    console.log(`  ${BOLD}Option 2: Force overwrite${RESET}`);
    console.log(`  ${CYAN}npm install -g @agentic-qe/v3@alpha --force${RESET}`);
    console.log('');
  }
}

try {
  main();
} catch (err) {
  // Don't let preinstall failures block installation
  // Just log and continue
  if (process.env.DEBUG) {
    error(`Preinstall check error: ${err.message}`);
  }
}
