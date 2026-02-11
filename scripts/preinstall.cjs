#!/usr/bin/env node

/**
 * Preinstall script for agentic-qe
 * Detects and handles conflicts from:
 * - agentic-qe v2 (old package)
 * - @agentic-qe/v3 (alpha package)
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
  console.log(`${CYAN}[agentic-qe]${RESET} ${msg}`);
}

function warn(msg) {
  console.log(`${YELLOW}[agentic-qe]${RESET} ${msg}`);
}

function error(msg) {
  console.log(`${RED}[agentic-qe]${RESET} ${msg}`);
}

function success(msg) {
  console.log(`${GREEN}[agentic-qe]${RESET} ${msg}`);
}

function findExistingAqeBinary() {
  // Cross-platform binary lookup: use 'where' on Windows, 'which' elsewhere
  const isWindows = process.platform === 'win32';
  const lookupCmd = isWindows ? 'where' : 'which';

  try {
    const result = spawnSync(lookupCmd, ['aqe'], {
      encoding: 'utf-8',
      shell: isWindows,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status === 0 && result.stdout.trim()) {
      // 'where' on Windows may return multiple lines; take the first
      return result.stdout.trim().split(/\r?\n/)[0];
    }
  } catch {
    // Lookup command failed
  }

  // Try to find via npm prefix
  try {
    const prefix = execSync('npm config get prefix', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    // On Windows, global bins are in prefix directly; on Unix, prefix/bin
    const binName = isWindows ? 'aqe.cmd' : 'aqe';
    const binPath = isWindows ? join(prefix, binName) : join(prefix, 'bin', binName);
    if (existsSync(binPath)) {
      return binPath;
    }
    // Also check without .cmd extension on Windows
    if (isWindows) {
      const altPath = join(prefix, 'aqe');
      if (existsSync(altPath)) {
        return altPath;
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

function checkPackageInstalled(packageName) {
  try {
    const result = execSync(`npm list -g ${packageName} --depth=0`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.includes(`${packageName}@`);
  } catch {
    return false;
  }
}

function getPackageVersion(packageName) {
  try {
    const result = execSync(`npm list -g ${packageName} --depth=0`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const regex = new RegExp(`${packageName.replace('/', '\\/')}@([\\d\\.\\-a-z]+)`);
    const match = result.match(regex);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function uninstallPackage(packageName) {
  try {
    log(`Uninstalling ${packageName}...`);
    execSync(`npm uninstall -g ${packageName}`, {
      encoding: 'utf-8',
      stdio: 'inherit'
    });
    success(`Successfully uninstalled ${packageName}`);
    return true;
  } catch (err) {
    error(`Failed to uninstall ${packageName}: ${err.message}`);
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

  // Check for both old package names
  const v2Installed = checkPackageInstalled('agentic-qe');
  const alphaInstalled = checkPackageInstalled('@agentic-qe/v3');

  const v2Version = v2Installed ? getPackageVersion('agentic-qe') : null;
  const alphaVersion = alphaInstalled ? getPackageVersion('@agentic-qe/v3') : null;

  // If the currently installed agentic-qe is version 3.x, we're good (user is upgrading within v3)
  if (v2Version && v2Version.startsWith('3.')) {
    // User is upgrading from 3.x to newer 3.x - this should work normally
    return;
  }

  if (!aqeBinary && !v2Installed && !alphaInstalled) {
    // Clean install, nothing to do
    return;
  }

  console.log('');
  log(`${BOLD}Checking for existing agentic-qe installation...${RESET}`);

  // Handle alpha package conflict
  if (alphaInstalled) {
    warn(`Found @agentic-qe/v3@${alphaVersion || 'alpha'} installed globally`);
    warn('The alpha package uses the same "aqe" binary name as the released version');
    console.log('');

    // Check if we can auto-migrate
    const autoMigrate = process.env.AQE_AUTO_MIGRATE === 'true' ||
                        process.env.npm_config_yes === 'true';

    if (autoMigrate) {
      log('Auto-migrating from alpha to release...');
      if (uninstallPackage('@agentic-qe/v3')) {
        success('Migration complete. Continuing with install...');
        return;
      } else {
        error('Auto-migration failed. Please run manually:');
        console.log(`  ${CYAN}npm uninstall -g @agentic-qe/v3 && npm install -g agentic-qe@latest${RESET}`);
        process.exit(1);
      }
    }

    // Interactive mode
    console.log(`${YELLOW}To upgrade from alpha to release:${RESET}`);
    console.log('');
    console.log(`  ${BOLD}Option 1: Auto-migrate (recommended)${RESET}`);
    console.log(`  ${CYAN}AQE_AUTO_MIGRATE=true npm install -g agentic-qe@latest${RESET}`);
    console.log('');
    console.log(`  ${BOLD}Option 2: Manual uninstall first${RESET}`);
    console.log(`  ${CYAN}npm uninstall -g @agentic-qe/v3${RESET}`);
    console.log(`  ${CYAN}npm install -g agentic-qe@latest${RESET}`);
    console.log('');
    console.log(`  ${BOLD}Option 3: Force overwrite${RESET}`);
    console.log(`  ${CYAN}npm install -g agentic-qe@latest --force${RESET}`);
    console.log('');

    process.exit(1);
  }

  // Handle v2 package conflict
  if (v2Installed && !v2Version?.startsWith('3.')) {
    warn(`Found agentic-qe v${v2Version || '2.x'} installed globally`);
    warn('The v2 package uses the same "aqe" binary name as v3');
    console.log('');

    const autoMigrate = process.env.AQE_AUTO_MIGRATE === 'true' ||
                        process.env.npm_config_yes === 'true';

    if (autoMigrate) {
      log('Auto-migrating from v2 to v3...');
      if (uninstallPackage('agentic-qe')) {
        success('Migration complete. Continuing with v3 install...');
        return;
      } else {
        error('Auto-migration failed. Please run manually:');
        console.log(`  ${CYAN}npm uninstall -g agentic-qe && npm install -g agentic-qe@latest${RESET}`);
        process.exit(1);
      }
    }

    console.log(`${YELLOW}To upgrade from v2 to v3:${RESET}`);
    console.log('');
    console.log(`  ${BOLD}Option 1: Auto-migrate (recommended)${RESET}`);
    console.log(`  ${CYAN}AQE_AUTO_MIGRATE=true npm install -g agentic-qe@latest${RESET}`);
    console.log('');
    console.log(`  ${BOLD}Option 2: Manual uninstall first${RESET}`);
    console.log(`  ${CYAN}npm uninstall -g agentic-qe${RESET}`);
    console.log(`  ${CYAN}npm install -g agentic-qe@latest${RESET}`);
    console.log('');
    console.log(`  ${BOLD}Option 3: Force overwrite${RESET}`);
    console.log(`  ${CYAN}npm install -g agentic-qe@latest --force${RESET}`);
    console.log('');

    process.exit(1);

  } else if (aqeBinary && !v2Installed && !alphaInstalled) {
    // Binary exists but no known package found - stale symlink or different package
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
    console.log(`  ${CYAN}npm install -g agentic-qe@latest${RESET}`);
    console.log('');
    console.log(`  ${BOLD}Option 2: Force overwrite${RESET}`);
    console.log(`  ${CYAN}npm install -g agentic-qe@latest --force${RESET}`);
    console.log('');

    process.exit(1);
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
