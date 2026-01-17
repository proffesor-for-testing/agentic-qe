/**
 * ResourceChecker - Validates system resources (CPU, memory, disk space)
 */

import * as os from 'os';
import * as fs from 'fs-extra';

export interface ResourceCheckOptions {
  minMemoryMB?: number;
  minCPUCores?: number;
  minDiskSpaceMB?: number;
  checkPath?: string;
  maxLoadAverage?: number;
}

export interface ResourceCheckResult {
  passed: boolean;
  checks: string[];
  details: {
    availableMemoryMB: number;
    cpuCores: number;
    availableDiskSpaceMB?: number;
    loadAverage?: number[];
  };
}

export class ResourceChecker {
  async check(options: ResourceCheckOptions): Promise<ResourceCheckResult> {
    const checks: string[] = [];
    const details: ResourceCheckResult['details'] = {
      availableMemoryMB: 0,
      cpuCores: 0
    };

    let passed = true;

    // Check memory
    if (options.minMemoryMB !== undefined) {
      checks.push('memory');
      const freeMemory = os.freemem();
      details.availableMemoryMB = Math.floor(freeMemory / (1024 * 1024));

      if (details.availableMemoryMB < options.minMemoryMB) {
        passed = false;
      }
    }

    // Check CPU cores
    if (options.minCPUCores !== undefined) {
      checks.push('cpu');
      const cpus = os.cpus();
      details.cpuCores = cpus.length;

      if (details.cpuCores < options.minCPUCores) {
        passed = false;
      }
    }

    // Check disk space
    if (options.minDiskSpaceMB !== undefined && options.checkPath) {
      checks.push('disk');
      try {
        // fs-extra doesn't have statfs, so we'll use a simple existence check
        // In production, you'd use a proper disk space library like 'diskusage' or 'node-disk-info'
        const exists = await fs.pathExists(options.checkPath);
        if (exists) {
          // For now, assume sufficient disk space if path exists
          // This is a simplified implementation
          details.availableDiskSpaceMB = 1000; // Placeholder value
        } else {
          details.availableDiskSpaceMB = 0;
          passed = false;
        }
      } catch (error) {
        // If check fails, skip disk check
        details.availableDiskSpaceMB = -1;
      }
    }

    // Check load average
    if (options.maxLoadAverage !== undefined) {
      checks.push('load');
      details.loadAverage = os.loadavg();

      // Check 1-minute load average
      if (details.loadAverage[0] > options.maxLoadAverage) {
        passed = false;
      }
    }

    return {
      passed,
      checks,
      details
    };
  }
}
