/**
 * Persistent Workflow Scheduler
 * ADR-041: Workflow Scheduling with Persistence
 *
 * Provides persistence layer for scheduled workflows.
 * Stores schedules in ~/.aqe-v3/schedules.json with proper file handling.
 *
 * Features:
 * - JSON file-based persistence
 * - Automatic directory creation
 * - Corrupt file recovery with backup
 * - File locking for concurrent access safety
 * - TTL-based schedule management
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { calculateNextRun } from '../utils/workflow-parser.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Persisted schedule record stored in schedules.json
 */
export interface PersistedSchedule {
  /** Unique schedule identifier */
  id: string;
  /** ID of the workflow definition */
  workflowId: string;
  /** Path to the pipeline YAML file */
  pipelinePath: string;
  /** Cron expression for scheduling */
  schedule: string;
  /** Human-readable schedule description */
  scheduleDescription: string;
  /** ISO date string for next scheduled run */
  nextRun: string;
  /** ISO date string for last execution (optional) */
  lastRun?: string;
  /** Whether the schedule is active */
  enabled: boolean;
  /** ISO date string when schedule was created */
  createdAt: string;
}

/**
 * Internal file format for schedules.json
 */
interface SchedulesFile {
  version: string;
  updatedAt: string;
  schedules: PersistedSchedule[];
}

/**
 * Configuration for the PersistentScheduler
 */
export interface PersistentSchedulerConfig {
  /** Path to store schedules.json (defaults to ~/.aqe-v3/schedules.json) */
  schedulesPath?: string;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG_DIR = '.aqe-v3';
const SCHEDULES_FILE = 'schedules.json';
const FILE_VERSION = '1.0.0';
const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_INTERVAL_MS = 50;

/**
 * Security: Maximum file size for schedules.json (10MB)
 * Prevents DoS attacks via extremely large files
 */
const MAX_SCHEDULES_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ============================================================================
// PersistentScheduler Implementation
// ============================================================================

/**
 * Persistent scheduler that stores workflow schedules to disk.
 * Provides CRUD operations and query methods for scheduled workflows.
 */
export class PersistentScheduler {
  private readonly schedulesPath: string;
  private readonly debug: boolean;
  private lockFile: string;
  private initialized = false;

  constructor(config: PersistentSchedulerConfig = {}) {
    // Security: Validate custom schedulesPath if provided
    if (config.schedulesPath) {
      this.validateSchedulesPath(config.schedulesPath);
    }
    this.schedulesPath = config.schedulesPath ?? this.getDefaultSchedulesPath();
    this.lockFile = `${this.schedulesPath}.lock`;
    this.debug = config.debug ?? false;
  }

  /**
   * Security: Validate that the schedules path is within a safe location
   * Prevents writing to arbitrary filesystem locations
   */
  private validateSchedulesPath(schedulesPath: string): void {
    const homeDir = os.homedir();
    const resolvedPath = path.resolve(schedulesPath);
    const resolvedHome = path.resolve(homeDir);

    // Allow paths within home directory
    if (resolvedPath.startsWith(resolvedHome + path.sep) || resolvedPath === resolvedHome) {
      return;
    }

    // Allow paths within current working directory
    const cwd = process.cwd();
    const resolvedCwd = path.resolve(cwd);
    if (resolvedPath.startsWith(resolvedCwd + path.sep) || resolvedPath === resolvedCwd) {
      return;
    }

    // Allow /tmp directory for testing
    const tmpDir = os.tmpdir();
    const resolvedTmp = path.resolve(tmpDir);
    if (resolvedPath.startsWith(resolvedTmp + path.sep) || resolvedPath === resolvedTmp) {
      return;
    }

    throw new Error(
      `Security: Custom schedulesPath must be within home directory (${homeDir}), ` +
      `current working directory (${cwd}), or temp directory (${tmpDir}). ` +
      `Provided path: ${schedulesPath}`
    );
  }

  /**
   * Get the default path for schedules.json
   */
  private getDefaultSchedulesPath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, DEFAULT_CONFIG_DIR, SCHEDULES_FILE);
  }

  /**
   * Initialize the scheduler (ensure directory exists)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dir = path.dirname(this.schedulesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      this.log(`Created directory: ${dir}`);
    }

    this.initialized = true;
  }

  /**
   * Load all schedules from disk
   */
  async loadSchedules(): Promise<PersistedSchedule[]> {
    await this.initialize();

    if (!fs.existsSync(this.schedulesPath)) {
      this.log('Schedules file does not exist, returning empty array');
      return [];
    }

    try {
      const content = fs.readFileSync(this.schedulesPath, 'utf-8');
      const data = this.parseSchedulesFile(content);
      this.log(`Loaded ${data.schedules.length} schedules`);
      return data.schedules;
    } catch (error) {
      // Handle corrupt file - backup and recreate
      await this.handleCorruptFile(error);
      return [];
    }
  }

  /**
   * Save a schedule (add new or update existing)
   */
  async saveSchedule(schedule: PersistedSchedule): Promise<void> {
    await this.initialize();
    await this.withFileLock(async () => {
      const schedules = await this.loadSchedulesUnsafe();
      const existingIndex = schedules.findIndex(s => s.id === schedule.id);

      if (existingIndex >= 0) {
        schedules[existingIndex] = schedule;
        this.log(`Updated schedule: ${schedule.id}`);
      } else {
        schedules.push(schedule);
        this.log(`Added schedule: ${schedule.id}`);
      }

      await this.writeSchedules(schedules);
    });
  }

  /**
   * Remove a schedule by ID
   */
  async removeSchedule(id: string): Promise<void> {
    await this.initialize();
    await this.withFileLock(async () => {
      const schedules = await this.loadSchedulesUnsafe();
      const newSchedules = schedules.filter(s => s.id !== id);

      if (newSchedules.length === schedules.length) {
        this.log(`Schedule not found: ${id}`);
        return;
      }

      await this.writeSchedules(newSchedules);
      this.log(`Removed schedule: ${id}`);
    });
  }

  /**
   * Get all schedules
   */
  async getSchedules(): Promise<PersistedSchedule[]> {
    return this.loadSchedules();
  }

  /**
   * Get a single schedule by ID
   */
  async getSchedule(id: string): Promise<PersistedSchedule | undefined> {
    const schedules = await this.loadSchedules();
    return schedules.find(s => s.id === id);
  }

  /**
   * Get schedules that are due for execution (nextRun <= now)
   */
  async getDueSchedules(): Promise<PersistedSchedule[]> {
    const schedules = await this.loadSchedules();
    const now = new Date();

    return schedules.filter(schedule => {
      if (!schedule.enabled) return false;
      const nextRun = new Date(schedule.nextRun);
      return nextRun <= now;
    });
  }

  /**
   * Mark a schedule as executed and calculate next run time
   */
  async markExecuted(id: string): Promise<void> {
    await this.initialize();
    await this.withFileLock(async () => {
      const schedules = await this.loadSchedulesUnsafe();
      const schedule = schedules.find(s => s.id === id);

      if (!schedule) {
        throw new Error(`Schedule not found: ${id}`);
      }

      const now = new Date();
      schedule.lastRun = now.toISOString();
      schedule.nextRun = calculateNextRun(schedule.schedule, now).toISOString();

      await this.writeSchedules(schedules);
      this.log(`Marked executed: ${id}, next run: ${schedule.nextRun}`);
    });
  }

  /**
   * Enable or disable a schedule
   */
  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.initialize();
    await this.withFileLock(async () => {
      const schedules = await this.loadSchedulesUnsafe();
      const schedule = schedules.find(s => s.id === id);

      if (!schedule) {
        throw new Error(`Schedule not found: ${id}`);
      }

      schedule.enabled = enabled;

      // If re-enabling, recalculate next run from now
      if (enabled) {
        schedule.nextRun = calculateNextRun(schedule.schedule, new Date()).toISOString();
      }

      await this.writeSchedules(schedules);
      this.log(`Set enabled=${enabled}: ${id}`);
    });
  }

  /**
   * Get enabled schedules only
   */
  async getEnabledSchedules(): Promise<PersistedSchedule[]> {
    const schedules = await this.loadSchedules();
    return schedules.filter(s => s.enabled);
  }

  /**
   * Get schedules by workflow ID
   */
  async getSchedulesByWorkflow(workflowId: string): Promise<PersistedSchedule[]> {
    const schedules = await this.loadSchedules();
    return schedules.filter(s => s.workflowId === workflowId);
  }

  /**
   * Clear all schedules (use with caution)
   */
  async clearAll(): Promise<void> {
    await this.initialize();
    await this.withFileLock(async () => {
      await this.writeSchedules([]);
      this.log('Cleared all schedules');
    });
  }

  /**
   * Get scheduler statistics
   */
  async getStats(): Promise<{
    total: number;
    enabled: number;
    disabled: number;
    due: number;
  }> {
    const schedules = await this.loadSchedules();
    const now = new Date();

    return {
      total: schedules.length,
      enabled: schedules.filter(s => s.enabled).length,
      disabled: schedules.filter(s => !s.enabled).length,
      due: schedules.filter(s => s.enabled && new Date(s.nextRun) <= now).length,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Load schedules without acquiring lock (for use within locked context)
   */
  private async loadSchedulesUnsafe(): Promise<PersistedSchedule[]> {
    if (!fs.existsSync(this.schedulesPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(this.schedulesPath, 'utf-8');
      const data = this.parseSchedulesFile(content);
      return data.schedules;
    } catch {
      return [];
    }
  }

  /**
   * Parse schedules file content with validation
   * Security: Checks file size before parsing to prevent DoS
   */
  private parseSchedulesFile(content: string): SchedulesFile {
    // Security: Check file size limit before parsing
    const contentSize = Buffer.byteLength(content, 'utf-8');
    if (contentSize > MAX_SCHEDULES_FILE_SIZE) {
      throw new Error(`Schedules file exceeds maximum allowed size (${MAX_SCHEDULES_FILE_SIZE / (1024 * 1024)}MB). File is ${(contentSize / (1024 * 1024)).toFixed(2)}MB.`);
    }

    const data = JSON.parse(content) as SchedulesFile;

    // Validate structure
    if (!data.schedules || !Array.isArray(data.schedules)) {
      throw new Error('Invalid schedules file: missing schedules array');
    }

    // Validate each schedule has required fields
    for (const schedule of data.schedules) {
      if (!schedule.id || !schedule.workflowId || !schedule.schedule) {
        throw new Error(`Invalid schedule entry: missing required fields`);
      }
    }

    return data;
  }

  /**
   * Write schedules to disk
   */
  private async writeSchedules(schedules: PersistedSchedule[]): Promise<void> {
    const data: SchedulesFile = {
      version: FILE_VERSION,
      updatedAt: new Date().toISOString(),
      schedules,
    };

    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(this.schedulesPath, content, 'utf-8');
    this.log(`Wrote ${schedules.length} schedules to disk`);
  }

  /**
   * Handle corrupt schedules file by backing up and creating new
   */
  private async handleCorruptFile(error: unknown): Promise<void> {
    const errorMsg = error instanceof Error ? error.message : String(error);
    this.log(`Corrupt schedules file detected: ${errorMsg}`);

    // Create backup of corrupt file
    const backupPath = `${this.schedulesPath}.corrupt.${Date.now()}`;
    try {
      if (fs.existsSync(this.schedulesPath)) {
        fs.copyFileSync(this.schedulesPath, backupPath);
        this.log(`Backed up corrupt file to: ${backupPath}`);
      }
    } catch (backupError) {
      this.log(`Failed to backup corrupt file: ${backupError}`);
    }

    // Remove corrupt file
    try {
      if (fs.existsSync(this.schedulesPath)) {
        fs.unlinkSync(this.schedulesPath);
        this.log('Removed corrupt schedules file');
      }
    } catch (removeError) {
      this.log(`Failed to remove corrupt file: ${removeError}`);
    }
  }

  /**
   * Execute a function with file locking for safe concurrent access
   */
  private async withFileLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireLock();
    try {
      return await fn();
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Acquire file lock with timeout
   */
  private async acquireLock(): Promise<void> {
    const startTime = Date.now();

    while (fs.existsSync(this.lockFile)) {
      // Check if lock is stale (older than timeout)
      try {
        const lockStat = fs.statSync(this.lockFile);
        const lockAge = Date.now() - lockStat.mtimeMs;
        if (lockAge > LOCK_TIMEOUT_MS) {
          // Stale lock, remove it
          fs.unlinkSync(this.lockFile);
          this.log('Removed stale lock file');
          break;
        }
      } catch {
        // Lock file might have been removed by another process
        break;
      }

      // Check for timeout
      if (Date.now() - startTime > LOCK_TIMEOUT_MS) {
        throw new Error('Timeout waiting for scheduler lock');
      }

      // Wait and retry
      await this.sleep(LOCK_RETRY_INTERVAL_MS);
    }

    // Create lock file
    try {
      fs.writeFileSync(this.lockFile, `${process.pid}:${Date.now()}`, { flag: 'wx' });
    } catch (error) {
      // Another process might have created the lock, retry
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return this.acquireLock();
      }
      throw error;
    }
  }

  /**
   * Release file lock
   */
  private releaseLock(): void {
    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
      }
    } catch {
      // Ignore errors when releasing lock
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log debug message if debug mode is enabled
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[PersistentScheduler] ${message}`);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PersistentScheduler instance
 */
export function createPersistentScheduler(
  config: PersistentSchedulerConfig = {}
): PersistentScheduler {
  return new PersistentScheduler(config);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique schedule ID
 */
export function generateScheduleId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `sched-${timestamp}-${random}`;
}

/**
 * Create a new schedule entry with defaults
 */
export function createScheduleEntry(
  params: {
    workflowId: string;
    pipelinePath: string;
    schedule: string;
    scheduleDescription: string;
    enabled?: boolean;
  }
): PersistedSchedule {
  const now = new Date();
  return {
    id: generateScheduleId(),
    workflowId: params.workflowId,
    pipelinePath: params.pipelinePath,
    schedule: params.schedule,
    scheduleDescription: params.scheduleDescription,
    nextRun: calculateNextRun(params.schedule, now).toISOString(),
    enabled: params.enabled ?? true,
    createdAt: now.toISOString(),
  };
}
