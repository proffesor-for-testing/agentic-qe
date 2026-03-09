/**
 * Daily Log Tier - Human-readable Markdown audit trail
 *
 * Writes daily learning summaries to memory/YYYY-MM-DD.md files.
 * Provides a browsable history of what AQE learned each day.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DailyLogEntry {
  timestamp: Date;
  type: 'pattern-learned' | 'pattern-promoted' | 'pattern-quarantined' | 'experience-captured' | 'search-performed' | 'reward-assigned';
  summary: string;
  details?: Record<string, unknown>;
}

export interface DailyLogConfig {
  /** Directory to write daily logs (default: .agentic-qe/logs) */
  logDir?: string;
  /** Whether daily logging is enabled (default: true) */
  enabled?: boolean;
  /** Maximum entries per daily log before rotation (default: 500) */
  maxEntriesPerDay?: number;
}

const LOG_ICONS: Record<string, string> = {
  'pattern-learned': '\u{1F9E0}',
  'pattern-promoted': '\u2B06\uFE0F',
  'pattern-quarantined': '\u{1F512}',
  'experience-captured': '\u{1F4F8}',
  'search-performed': '\u{1F50D}',
  'reward-assigned': '\u{1F3AF}',
};

export class DailyLogger {
  private config: Required<DailyLogConfig>;
  private buffer: DailyLogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: DailyLogConfig) {
    this.config = {
      logDir: config?.logDir ?? path.join(process.cwd(), '.agentic-qe', 'logs'),
      enabled: config?.enabled ?? true,
      maxEntriesPerDay: config?.maxEntriesPerDay ?? 500,
    };
  }

  /**
   * Log a learning event
   */
  log(entry: DailyLogEntry): void {
    if (!this.config.enabled) return;
    this.buffer.push(entry);

    // Auto-flush every 10 entries
    if (this.buffer.length >= 10) {
      this.flush();
    }
  }

  /**
   * Flush buffered entries to the daily log file
   */
  flush(): void {
    if (this.buffer.length === 0) return;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logPath = path.join(this.config.logDir, `${today}.md`);

    try {
      // Ensure directory exists
      fs.mkdirSync(this.config.logDir, { recursive: true });

      // Build markdown content
      const entries = this.buffer.splice(0, this.buffer.length);
      const lines: string[] = [];

      // Add header if file doesn't exist
      if (!fs.existsSync(logPath)) {
        lines.push(`# AQE Daily Log \u2014 ${today}\n`);
        lines.push('| Time | Event | Summary |');
        lines.push('|------|-------|---------|');
      }

      for (const entry of entries) {
        const time = entry.timestamp.toISOString().split('T')[1]?.slice(0, 8) ?? '00:00:00';
        const icon = LOG_ICONS[entry.type] ?? '\u{1F4DD}';
        const escapedSummary = entry.summary.replace(/\|/g, '\\|').replace(/\n/g, ' ');
        lines.push(`| ${time} | ${icon} ${entry.type} | ${escapedSummary} |`);
      }

      fs.appendFileSync(logPath, lines.join('\n') + '\n');
    } catch (error) {
      // Non-critical - don't fail the learning pipeline for logging
      console.debug('[DailyLog] Write failed:', error);
    }
  }

  /**
   * Get the path to today's log file
   */
  getTodayLogPath(): string {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.config.logDir, `${today}.md`);
  }

  /**
   * Dispose and flush remaining entries
   */
  dispose(): void {
    this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
