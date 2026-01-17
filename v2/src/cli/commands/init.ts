import { ProcessExit } from '../../utils/ProcessExit';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as fssync from 'fs';
import { InitOptions, FleetConfig } from '../../types';
import { generateCondensedClaudeMd } from './init-claude-md-template';

// ⚡ NEW: Import modular initialization orchestrator
// This is the new way to initialize the fleet using the modular structure in src/cli/init/
import { initCommand as newInitCommand } from '../init/index';

// Import version from package.json to maintain consistency
const packageJson = require('../../../package.json');
const PACKAGE_VERSION = packageJson.version;

export class InitCommand {
  /**
   * ⚡ UPDATED: Now uses modular orchestrator from src/cli/init/
   *
   * This method acts as a thin wrapper that delegates to the new modular
   * initialization system. The old monolithic methods below are deprecated
   * and kept for backward compatibility.
   *
   * @see src/cli/init/index.ts for the new orchestrator
   * @see src/cli/init/README.md for documentation
   */
  static async execute(options: InitOptions): Promise<void> {
    // ⚡ NEW: Use the modular orchestrator
    // All initialization logic has been moved to src/cli/init/ modules
    await newInitCommand(options);

    // That's it! The orchestrator handles everything:
    // - Directory structure
    // - Database initialization
    // - Claude configuration
    // - Documentation
    // - Bash wrapper
    // - Error handling and rollback

    return;
  }
}
