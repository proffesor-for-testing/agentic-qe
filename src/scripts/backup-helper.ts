/**
 * Backup Helper for Database Migration
 * Integrates backup system with migration scripts
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface BackupResult {
  success: boolean;
  timestamp: string;
  files: string[];
  totalSize: number;
  compressed: boolean;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  timestamp: string;
  filesRestored: number;
  error?: string;
}

export class BackupHelper {
  private backupDir = '.agentic-qe/backups';
  private scriptsDir = 'scripts';

  /**
   * Create a database backup before migration
   */
  async createBackup(options: {
    compress?: boolean;
    verify?: boolean;
  } = {}): Promise<BackupResult> {
    const { compress = true, verify = true } = options;

    try {
      console.log('🔒 Creating database backup...');

      const flags = [
        compress ? '--compress' : '',
        !verify ? '--no-verify' : ''
      ].filter(Boolean).join(' ');

      const backupScript = path.join(this.scriptsDir, 'backup-databases.sh');

      // Make script executable
      await execAsync(`chmod +x ${backupScript}`);

      // Run backup
      const { stdout, stderr } = await execAsync(`${backupScript} ${flags}`);

      console.log(stdout);
      if (stderr) {
        console.warn('Backup warnings:', stderr);
      }

      // Parse output to get timestamp
      const timestampMatch = stdout.match(/Timestamp: (\d{8}-\d{6})/);
      const timestamp = timestampMatch ? timestampMatch[1] : '';

      // Get backup files
      const files = await this.getBackupFiles(timestamp);

      // Calculate total size
      let totalSize = 0;
      for (const file of files) {
        const stats = await fs.stat(file);
        totalSize += stats.size;
      }

      return {
        success: true,
        timestamp,
        files,
        totalSize,
        compressed: compress
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Backup failed:', errorMessage);

      return {
        success: false,
        timestamp: '',
        files: [],
        totalSize: 0,
        compressed: false,
        error: errorMessage
      };
    }
  }

  /**
   * Restore database from backup
   */
  async restoreBackup(timestamp: string, options: {
    verify?: boolean;
    force?: boolean;
  } = {}): Promise<RestoreResult> {
    const { verify = true, force = false } = options;

    try {
      console.log(`🔄 Restoring database backup: ${timestamp}...`);

      const flags = [
        !verify ? '--no-verify' : '',
        force ? '--force' : ''
      ].filter(Boolean).join(' ');

      const restoreScript = path.join(this.scriptsDir, 'restore-databases.sh');

      // Make script executable
      await execAsync(`chmod +x ${restoreScript}`);

      // Run restore (with force flag to skip confirmation)
      const { stdout, stderr } = await execAsync(`${restoreScript} ${timestamp} ${flags}`);

      console.log(stdout);
      if (stderr) {
        console.warn('Restore warnings:', stderr);
      }

      // Count restored files
      const filesRestored = await this.getBackupFiles(timestamp);

      return {
        success: true,
        timestamp,
        filesRestored: filesRestored.length
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Restore failed:', errorMessage);

      return {
        success: false,
        timestamp,
        filesRestored: 0,
        error: errorMessage
      };
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<Array<{
    timestamp: string;
    date: string;
    files: number;
    size: number;
    metadata?: any;
  }>> {
    try {
      const backupFiles = await fs.readdir(this.backupDir);
      const backupPattern = /\.backup\.(\d{8}-\d{6})/;

      const timestamps = new Set<string>();

      for (const file of backupFiles) {
        const match = file.match(backupPattern);
        if (match) {
          timestamps.add(match[1]);
        }
      }

      const backups = [];

      for (const timestamp of Array.from(timestamps).sort().reverse()) {
        const files = await this.getBackupFiles(timestamp);

        let totalSize = 0;
        for (const file of files) {
          const stats = await fs.stat(file);
          totalSize += stats.size;
        }

        let metadata;
        const metadataFile = path.join(this.backupDir, `backup-metadata.${timestamp}.json`);
        try {
          const metadataContent = await fs.readFile(metadataFile, 'utf-8');
          metadata = JSON.parse(metadataContent);
        } catch {
          // Metadata not available
        }

        backups.push({
          timestamp,
          date: metadata?.date || timestamp,
          files: files.length,
          size: totalSize,
          metadata
        });
      }

      return backups;
    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(timestamp: string): Promise<boolean> {
    try {
      const manageScript = path.join(this.scriptsDir, 'manage-backups.sh');
      await execAsync(`chmod +x ${manageScript}`);

      const { stdout } = await execAsync(`${manageScript} verify ${timestamp}`);

      return stdout.includes('All files verified');
    } catch (error) {
      console.error('Backup verification failed:', error);
      return false;
    }
  }

  /**
   * Clean old backups
   */
  async cleanOldBackups(keepLast: number = 10): Promise<number> {
    try {
      const manageScript = path.join(this.scriptsDir, 'manage-backups.sh');
      await execAsync(`chmod +x ${manageScript}`);

      const { stdout } = await execAsync(`${manageScript} clean ${keepLast}`);

      const removedMatch = stdout.match(/Removed (\d+) old backup/);
      return removedMatch ? parseInt(removedMatch[1]) : 0;
    } catch (error) {
      console.error('Failed to clean old backups:', error);
      return 0;
    }
  }

  /**
   * Get backup files for a specific timestamp
   */
  private async getBackupFiles(timestamp: string): Promise<string[]> {
    try {
      const allFiles = await fs.readdir(this.backupDir);
      const backupFiles = allFiles.filter(f =>
        f.includes(`.backup.${timestamp}`) && !f.endsWith('.sha256')
      );

      return backupFiles.map(f => path.join(this.backupDir, f));
    } catch {
      return [];
    }
  }

  /**
   * Create automatic backup before dangerous operation
   */
  async createSafetyBackup(operationName: string): Promise<BackupResult> {
    console.log(`🛡️ Creating safety backup before: ${operationName}`);

    const result = await this.createBackup({
      compress: true,
      verify: true
    });

    if (result.success) {
      console.log(`✅ Safety backup created: ${result.timestamp}`);
      console.log(`   Use this to rollback: ./scripts/restore-databases.sh ${result.timestamp}`);
    }

    return result;
  }
}

// Export singleton instance
export const backupHelper = new BackupHelper();
