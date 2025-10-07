/**
 * PermissionChecker - Validates file and directory permissions
 */

import * as fs from 'fs-extra';

export interface PermissionCheckOptions {
  files?: string[];
  directories?: string[];
  requiredPermissions?: ('read' | 'write' | 'execute')[];
  requiredAccess?: ('read' | 'write')[];
}

export interface PermissionCheckResult {
  passed: boolean;
  checks: string[];
  details: {
    permissions: Record<string, string[]>;
    violations: Array<{ path: string; missing: string[] }>;
  };
}

export class PermissionChecker {
  async check(options: PermissionCheckOptions): Promise<PermissionCheckResult> {
    const checks: string[] = [];
    const details: PermissionCheckResult['details'] = {
      permissions: {},
      violations: []
    };

    let passed = true;

    // Check file permissions
    if (options.files && options.files.length > 0) {
      checks.push('file-permissions');

      for (const file of options.files) {
        const perms = await this.checkFilePermissions(file, options.requiredPermissions || []);
        details.permissions[file] = perms.granted;

        if (perms.missing.length > 0) {
          details.violations.push({ path: file, missing: perms.missing });
          passed = false;
        }
      }
    }

    // Check directory access
    if (options.directories && options.directories.length > 0) {
      checks.push('directory-access');

      for (const dir of options.directories) {
        const perms = await this.checkDirectoryAccess(dir, options.requiredAccess || []);
        details.permissions[dir] = perms.granted;

        if (perms.missing.length > 0) {
          details.violations.push({ path: dir, missing: perms.missing });
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

  private async checkFilePermissions(
    file: string,
    required: string[]
  ): Promise<{ granted: string[]; missing: string[] }> {
    const granted: string[] = [];
    const missing: string[] = [];

    try {
      const exists = await fs.pathExists(file);
      if (!exists) {
        return { granted, missing: required };
      }

      for (const perm of required) {
        try {
          if (perm === 'read') {
            await fs.access(file, fs.constants.R_OK);
            granted.push('read');
          } else if (perm === 'write') {
            await fs.access(file, fs.constants.W_OK);
            granted.push('write');
          } else if (perm === 'execute') {
            await fs.access(file, fs.constants.X_OK);
            granted.push('execute');
          }
        } catch {
          missing.push(perm);
        }
      }
    } catch {
      missing.push(...required);
    }

    return { granted, missing };
  }

  private async checkDirectoryAccess(
    dir: string,
    required: string[]
  ): Promise<{ granted: string[]; missing: string[] }> {
    const granted: string[] = [];
    const missing: string[] = [];

    try {
      const exists = await fs.pathExists(dir);
      if (!exists) {
        return { granted, missing: required };
      }

      for (const access of required) {
        try {
          if (access === 'read') {
            await fs.readdir(dir);
            granted.push('read');
          } else if (access === 'write') {
            // Try to create a temporary file
            const testFile = `${dir}/.permission_test_${Date.now()}`;
            await fs.writeFile(testFile, 'test');
            await fs.remove(testFile);
            granted.push('write');
          }
        } catch {
          missing.push(access);
        }
      }
    } catch {
      missing.push(...required);
    }

    return { granted, missing };
  }
}
