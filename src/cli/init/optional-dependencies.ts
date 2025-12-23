/**
 * Optional Dependencies Installer
 *
 * Handles installation of optional dependencies based on user preferences.
 * Used during `aqe init` to offer optional features like accessibility testing.
 *
 * @module cli/init/optional-dependencies
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { InitOptions } from '../../types';

/**
 * Optional dependency configuration
 */
interface OptionalDependency {
  name: string;
  packages: string[];
  prompt: string;
  description: string;
  defaultInNonInteractive: boolean;  // Default when -y flag is used
}

/**
 * Registry of optional dependencies
 */
const OPTIONAL_DEPENDENCIES: OptionalDependency[] = [
  {
    name: 'accessibility',
    packages: ['@axe-core/playwright'],
    prompt: 'Do you plan to use accessibility testing features?',
    description: 'WCAG 2.2 accessibility scanning with axe-core',
    defaultInNonInteractive: false,  // Skip in -y mode for faster init
  },
];

/**
 * Check if a package is installed
 */
function isPackageInstalled(packageName: string): boolean {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Install packages using npm
 */
function installPackages(packages: string[]): void {
  const packageList = packages.join(' ');
  console.log(chalk.gray(`  Running: npm install ${packageList}`));

  try {
    execSync(`npm install ${packageList}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch (error) {
    throw new Error(`Failed to install packages: ${packageList}`);
  }
}

/**
 * Prompt user for optional dependencies and install selected ones
 *
 * @param options - Init options (includes yes/nonInteractive flags)
 * @returns Object with installation results
 */
export async function installOptionalDependencies(
  options: InitOptions
): Promise<{ installed: string[]; skipped: string[] }> {
  const isNonInteractive = options.yes || options.nonInteractive;
  const installed: string[] = [];
  const skipped: string[] = [];

  for (const dep of OPTIONAL_DEPENDENCIES) {
    // Check if already installed
    const allInstalled = dep.packages.every(pkg => isPackageInstalled(pkg));
    if (allInstalled) {
      console.log(chalk.gray(`  ✓ ${dep.name}: already installed`));
      installed.push(dep.name);
      continue;
    }

    let shouldInstall = false;

    if (isNonInteractive) {
      // Use default for non-interactive mode
      shouldInstall = dep.defaultInNonInteractive;
      if (!shouldInstall) {
        console.log(chalk.gray(`  ○ ${dep.name}: skipped (use interactive mode to enable)`));
      }
    } else {
      // Prompt user
      const { install } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'install',
          message: dep.prompt,
          default: true,  // Default to yes in interactive mode
        },
      ]);
      shouldInstall = install;
    }

    if (shouldInstall) {
      try {
        console.log(chalk.blue(`  Installing ${dep.name} (${dep.description})...`));
        installPackages(dep.packages);
        installed.push(dep.name);
        console.log(chalk.green(`  ✓ ${dep.name}: installed successfully`));
      } catch (error) {
        console.warn(chalk.yellow(`  ⚠️ ${dep.name}: installation failed`));
        console.warn(chalk.gray(`     ${error instanceof Error ? error.message : String(error)}`));
        console.warn(chalk.gray(`     You can install later: npm install ${dep.packages.join(' ')}`));
        skipped.push(dep.name);
      }
    } else {
      skipped.push(dep.name);
    }
  }

  return { installed, skipped };
}

/**
 * Display post-init message about optional dependencies
 */
export function displayOptionalDependenciesHelp(skipped: string[]): void {
  if (skipped.length === 0) return;

  console.log(chalk.cyan('\n📦 Optional Features:'));

  for (const depName of skipped) {
    const dep = OPTIONAL_DEPENDENCIES.find(d => d.name === depName);
    if (dep) {
      console.log(chalk.gray(`  • ${dep.description}:`));
      console.log(chalk.cyan(`    npm install ${dep.packages.join(' ')}`));
    }
  }
}
