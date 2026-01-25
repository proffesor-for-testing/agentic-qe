/**
 * EnvironmentChecker - Validates environment variables, Node.js version, and dependencies
 */

import * as process from 'process';

export interface EnvironmentCheckOptions {
  requiredVars?: string[];
  minNodeVersion?: string;
  requiredModules?: string[];
}

export interface EnvironmentCheckResult {
  passed: boolean;
  checks: string[];
  details: {
    missing: string[];
    nodeVersion?: string;
    availableModules?: string[];
    unavailableModules?: string[];
  };
}

export class EnvironmentChecker {
  async check(options: EnvironmentCheckOptions): Promise<EnvironmentCheckResult> {
    const checks: string[] = [];
    const details: EnvironmentCheckResult['details'] = {
      missing: [],
      availableModules: [],
      unavailableModules: []
    };

    let passed = true;

    // Check required environment variables
    if (options.requiredVars && options.requiredVars.length > 0) {
      checks.push('env-vars');

      for (const varName of options.requiredVars) {
        if (!process.env[varName]) {
          details.missing.push(varName);
          passed = false;
        }
      }
    }

    // Check Node.js version
    if (options.minNodeVersion) {
      checks.push('node-version');
      details.nodeVersion = process.version;

      if (!this.isVersionCompatible(process.version, options.minNodeVersion)) {
        passed = false;
      }
    }

    // Check required modules
    if (options.requiredModules && options.requiredModules.length > 0) {
      checks.push('dependencies');

      for (const moduleName of options.requiredModules) {
        try {
          require.resolve(moduleName);
          details.availableModules!.push(moduleName);
        } catch {
          details.unavailableModules!.push(moduleName);
          passed = false;
        }
      }
    }

    return {
      passed,
      checks,
      details
    };
  }

  private isVersionCompatible(current: string, required: string): boolean {
    const currentParts = current.replace('v', '').split('.').map(Number);
    const requiredParts = required.replace('v', '').split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const curr = currentParts[i] || 0;
      const req = requiredParts[i] || 0;

      if (curr > req) return true;
      if (curr < req) return false;
    }

    return true;
  }
}
