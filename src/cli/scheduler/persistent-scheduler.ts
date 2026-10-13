/**
 * Persistent Workflow Scheduler
 * ADR-041: Workflow Scheduling with Persistence
 *
 * Provides persistence layer for scheduled workflows.
 * Stores schedules in ~/.aqe/schedules.json with proper file handling.
 *
 * Features:
 * - JSON file-based persistence
 * - Automatic directory creation
 * - Corrupt file recovery with backup
 * - File locking for concurrent access safety
 * - TTL-based schedule management
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { calculateNextRun, isValidCronExpression } from '../utils/workflow-parser.js';
import { safeJsonParse } from '../../shared/safe-json.js';
import { toErrorMessage } from '../../shared/error-utils.js';

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
  /** Derived load diagnostic for a disabled legacy cron expression. */
  disabledReason?: string;
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
 * Result of parsing schedules.json. Entries that cannot be addressed (not an
 * object, no string id, or a duplicate id) are `skipped` rather than failing
 * the whole file (#991); they are quarantined to a side file before a write
 * drops them.
 */
interface ParsedSchedules {
  file: SchedulesFile;
  skipped: unknown[];
}

/**
 * Configuration for the PersistentScheduler
 */
export interface PersistentSchedulerConfig {
  /** Path to store schedules.json (defaults to ~/.aqe/schedules.json) */
  schedulesPath?: string;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG_DIR = '.aqe';
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
      const { file: data, skipped } = this.parseSchedulesFile(content);
      if (skipped.length > 0) {
        console.warn(
          `[PersistentScheduler] Skipped ${skipped.length} malformed schedule ` +
          `entries in ${this.schedulesPath} (not an object, no id, or duplicate id)`,
        );
      }
      this.log(`Loaded ${data.schedules.length} schedules`);
      return data.schedules;
    } catch (error) {
      // Only a genuinely unparseable file gets here (bad JSON, no schedules
      // array, oversize); malformed entries are disabled or skipped (#991).
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
      const { schedules, skipped } = this.loadForWrite();
      const existingIndex = schedules.findIndex(s => s.id === schedule.id);

      if (existingIndex >= 0) {
        schedules[existingIndex] = schedule;
        this.log(`Updated schedule: ${schedule.id}`);
      } else {
        schedules.push(schedule);
        this.log(`Added schedule: ${schedule.id}`);
      }

      await this.writeSchedules(schedules, skipped);
    });
  }

  /**
   * Remove a schedule by ID
   */
  async removeSchedule(id: string): Promise<void> {
    await this.initialize();
    await this.withFileLock(async () => {
      const { schedules, skipped } = this.loadForWrite();
      const newSchedules = schedules.filter(s => s.id !== id);

      if (newSchedules.length === schedules.length) {
        this.log(`Schedule not found: ${id}`);
        return;
      }

      await this.writeSchedules(newSchedules, skipped);
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
      const { schedules, skipped } = this.loadForWrite();
      const schedule = schedules.find(s => s.id === id);

      if (!schedule) {
        throw new Error(`Schedule not found: ${id}`);
      }

      const now = new Date();
      schedule.lastRun = now.toISOString();
      // #913: an entry disabled on load (legacy/invalid cron, missing fields)
      // has no computable next run. Record the run and keep it disabled
      // instead of throwing from calculateNextRun.
      if (!schedule.disabledReason) {
        schedule.nextRun = calculateNextRun(schedule.schedule, now).toISOString();
      }

      await this.writeSchedules(schedules, skipped);
      this.log(`Marked executed: ${id}, next run: ${schedule.nextRun}`);
    });
  }

  /**
   * Enable or disable a schedule
   */
  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.initialize();
    await this.withFileLock(async () => {
      const { schedules, skipped } = this.loadForWrite();
      const schedule = schedules.find(s => s.id === id);

      if (!schedule) {
        throw new Error(`Schedule not found: ${id}`);
      }

      // #913/#991: an entry disabled on load cannot run; say why instead of
      // failing inside calculateNextRun (or with no cron at all).
      if (enabled && schedule.disabledReason) {
        throw new Error(`Cannot enable schedule ${id}: ${schedule.disabledReason}`);
      }

      schedule.enabled = enabled;

      // If re-enabling, recalculate next run from now
      if (enabled) {
        schedule.nextRun = calculateNextRun(schedule.schedule, new Date()).toISOString();
      }

      await this.writeSchedules(schedules, skipped);
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
      const { skipped } = this.loadForWrite();
      await this.writeSchedules([], skipped);
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
   * Load schedules for a locked read-modify-write. A genuinely unparseable
   * file is backed up (not removed) first, so the write that follows cannot
   * silently replace it with fewer schedules.
   */
  private loadForWrite(): { schedules: PersistedSchedule[]; skipped: unknown[] } {
    if (!fs.existsSync(this.schedulesPath)) {
      return { schedules: [], skipped: [] };
    }

    try {
      const content = fs.readFileSync(this.schedulesPath, 'utf-8');
      const { file, skipped } = this.parseSchedulesFile(content);
      return { schedules: file.schedules, skipped };
    } catch (error) {
      this.backupCorruptFile(error);
      return { schedules: [], skipped: [] };
    }
  }

  /**
   * Parse schedules file content with validation
   * Security: Checks file size before parsing to prevent DoS
   */
  private parseSchedulesFile(content: string): ParsedSchedules {
    // Security: Check file size limit before parsing
    const contentSize = Buffer.byteLength(content, 'utf-8');
    if (contentSize > MAX_SCHEDULES_FILE_SIZE) {
      throw new Error(`Schedules file exceeds maximum allowed size (${MAX_SCHEDULES_FILE_SIZE / (1024 * 1024)}MB). File is ${(contentSize / (1024 * 1024)).toFixed(2)}MB.`);
    }

    const data = safeJsonParse<SchedulesFile>(content);

    // Validate structure: only a missing schedules array makes the file corrupt.
    if (!isPlainObject(data) || !Array.isArray(data.schedules)) {
      throw new Error('Invalid schedules file: missing schedules array');
    }

    // #991: validate each entry on its own. A malformed entry is disabled
    // (when it can still be addressed by id) or skipped; it never makes the
    // whole file "corrupt", which used to back up and REMOVE schedules.json.
    const schedules: PersistedSchedule[] = [];
    const skipped: unknown[] = [];
    const seen = new Set<string>();
    for (const entry of data.schedules as unknown[]) {
      if (!isPlainObject(entry) || typeof entry.id !== 'string' || entry.id.length === 0 || seen.has(entry.id)) {
        skipped.push(entry);
        continue;
      }
      const schedule = entry as unknown as PersistedSchedule;
      seen.add(schedule.id);
      const reason = scheduleDisabledReason(entry);
      if (reason) {
        schedule.disabledReason = reason;
        if (schedule.enabled) {
          console.warn(`[PersistentScheduler] Disabled schedule ${schedule.id}: ${reason}`);
        }
        schedule.enabled = false;
      } else {
        delete schedule.disabledReason;
      }
      schedules.push(schedule);
    }

    return { file: { ...data, schedules }, skipped };
  }

  /**
   * Write schedules to disk
   */
  private async writeSchedules(schedules: PersistedSchedule[], skipped: unknown[] = []): Promise<void> {
    // #991: entries skipped on load are not written back; keep a copy next to
    // the file first so nothing a user stored is lost silently.
    if (skipped.length > 0) {
      const quarantinePath = `${this.schedulesPath}.quarantine.${Date.now()}.json`;
      fs.writeFileSync(quarantinePath, JSON.stringify({
        quarantinedAt: new Date().toISOString(),
        reason: 'Malformed schedule entries (not an object, no id, or duplicate id)',
        entries: skipped,
      }, null, 2), { encoding: 'utf-8', flag: 'wx' });
      console.warn(
        `[PersistentScheduler] Moved ${skipped.length} malformed schedule entries to ${quarantinePath}`,
      );
    }

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
    const errorMsg = toErrorMessage(error);
    this.log(`Corrupt schedules file detected: ${errorMsg}`);

    this.backupCorruptFile(error);

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

  /** Copy an unparseable schedules file to `.corrupt.<ts>` (left in place). */
  private backupCorruptFile(error: unknown): void {
    this.log(`Corrupt schedules file detected: ${toErrorMessage(error)}`);
    const backupPath = `${this.schedulesPath}.corrupt.${Date.now()}`;
    try {
      if (fs.existsSync(this.schedulesPath)) {
        fs.copyFileSync(this.schedulesPath, backupPath, fs.constants.COPYFILE_EXCL);
        this.log(`Backed up corrupt file to: ${backupPath}`);
      }
    } catch (backupError) {
      this.log(`Failed to backup corrupt file: ${backupError}`);
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
    } catch (error) {
      // Non-critical: lock release errors don't affect scheduler
      console.debug('[PersistentScheduler] Lock release error:', error instanceof Error ? error.message : error);
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
// Entry validation (#991)
// ============================================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Why a persisted entry cannot run, or undefined when it is valid. Such
 * entries are kept (disabled) so `workflow list` shows them with the reason.
 */
function scheduleDisabledReason(entry: Record<string, unknown>): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(entry, 'schedule')) {
    return 'Missing cron expression (no schedule field)';
  }
  if (typeof entry.schedule !== 'string' || !isValidCronExpression(entry.schedule)) {
    return `Invalid cron expression: ${String(entry.schedule)}`;
  }
  if (typeof entry.workflowId !== 'string' || entry.workflowId.length === 0) {
    return 'Missing workflowId';
  }
  return undefined;
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
  const random = randomUUID().slice(0, 8);
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
