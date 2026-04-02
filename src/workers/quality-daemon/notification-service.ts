/**
 * IMP-10: QE Quality Daemon — Notification Service
 *
 * Delivers notifications via:
 * - File-based: JSON files in `.agentic-qe/notifications/`
 * - Webhook: POST to configured URL (with IMP-07 SSRF protection)
 *
 * Notification types: gate_failure, coverage_drop, flaky_detected, suggestion_available
 */

import { writeFileSync, mkdirSync, readdirSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join, resolve } from 'path';

export type NotificationType =
  | 'gate_failure'
  | 'coverage_drop'
  | 'flaky_detected'
  | 'suggestion_available'
  | 'ci_failure'
  | 'daemon_health';

export interface Notification {
  readonly id: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  readonly timestamp: number;
  readonly metadata?: Record<string, unknown>;
  readonly read: boolean;
}

export interface NotificationServiceOptions {
  /** Directory for file-based notifications */
  notificationsDir?: string;
  /** Maximum stored notifications (oldest pruned) */
  maxNotifications?: number;
  /** Webhook URL for push notifications (optional) */
  webhookUrl?: string;
  /** URL validator function (IMP-07 SSRF guard) */
  urlValidator?: (url: string) => boolean;
}

const DEFAULTS = {
  notificationsDir: resolve(process.cwd(), '.agentic-qe', 'notifications'),
  maxNotifications: 200,
};

export class NotificationService {
  private notificationsDir: string;
  private maxNotifications: number;
  private webhookUrl: string | undefined;
  private urlValidator: ((url: string) => boolean) | undefined;
  private _sentCount = 0;

  constructor(options?: NotificationServiceOptions) {
    this.notificationsDir = options?.notificationsDir ?? DEFAULTS.notificationsDir;
    this.maxNotifications = options?.maxNotifications ?? DEFAULTS.maxNotifications;
    this.webhookUrl = options?.webhookUrl;
    this.urlValidator = options?.urlValidator;
  }

  get sentCount(): number {
    return this._sentCount;
  }

  /**
   * Initialize the notifications directory.
   */
  initialize(): void {
    mkdirSync(this.notificationsDir, { recursive: true });
  }

  /**
   * Send a notification.
   */
  async send(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): Promise<Notification> {
    const full: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      read: false,
    };

    // File-based delivery
    this.writeToFile(full);

    // Webhook delivery (if configured)
    if (this.webhookUrl) {
      await this.sendWebhook(full);
    }

    this._sentCount++;
    this.pruneOldNotifications();

    return full;
  }

  /**
   * List recent notifications.
   */
  list(options?: { unreadOnly?: boolean; limit?: number; type?: NotificationType }): Notification[] {
    const limit = options?.limit ?? 50;

    try {
      const files = readdirSync(this.notificationsDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse(); // newest first

      const notifications: Notification[] = [];
      for (const file of files) {
        if (notifications.length >= limit) break;

        try {
          const content = readFileSync(
            join(this.notificationsDir, file),
            'utf-8'
          );
          const notif = JSON.parse(content) as Notification;

          if (options?.unreadOnly && notif.read) continue;
          if (options?.type && notif.type !== options.type) continue;

          notifications.push(notif);
        } catch {
          // corrupt file, skip
        }
      }

      return notifications;
    } catch {
      return [];
    }
  }

  /**
   * Mark a notification as read.
   */
  markRead(id: string): boolean {
    try {
      // Exact suffix match to prevent substring collisions (Finding 4)
      const files = readdirSync(this.notificationsDir).filter((f) =>
        f.endsWith(`-${id}.json`)
      );
      if (files.length === 0) return false;

      const filePath = join(this.notificationsDir, files[0]);
      const content = JSON.parse(readFileSync(filePath, 'utf-8')) as Notification;
      const updated = { ...content, read: true };
      writeFileSync(filePath, JSON.stringify(updated, null, 2));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear all notifications.
   */
  clear(): number {
    try {
      const files = readdirSync(this.notificationsDir).filter((f) =>
        f.endsWith('.json')
      );
      for (const file of files) {
        unlinkSync(join(this.notificationsDir, file));
      }
      return files.length;
    } catch {
      return 0;
    }
  }

  // ============================================================================
  // Private
  // ============================================================================

  private writeToFile(notification: Notification): void {
    try {
      mkdirSync(this.notificationsDir, { recursive: true });
      const filename = `${notification.timestamp}-${notification.id}.json`;
      const filePath = join(this.notificationsDir, filename);
      writeFileSync(filePath, JSON.stringify(notification, null, 2));
    } catch (err) {
      console.debug('[NotificationService] Failed to write notification:', err);
    }
  }

  private async sendWebhook(notification: Notification): Promise<void> {
    if (!this.webhookUrl) return;

    // IMP-07 SSRF guard: validate URL before sending
    if (this.urlValidator && !this.urlValidator(this.webhookUrl)) {
      console.warn(
        '[NotificationService] Webhook URL blocked by SSRF guard:',
        this.webhookUrl
      );
      return;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notification),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.debug(
          `[NotificationService] Webhook returned ${response.status}`
        );
      }
    } catch (err) {
      console.debug('[NotificationService] Webhook delivery failed:', err);
    }
  }

  private pruneOldNotifications(): void {
    try {
      const files = readdirSync(this.notificationsDir)
        .filter((f) => f.endsWith('.json'))
        .sort();

      if (files.length <= this.maxNotifications) return;

      const toRemove = files.slice(0, files.length - this.maxNotifications);
      for (const file of toRemove) {
        unlinkSync(join(this.notificationsDir, file));
      }
    } catch {
      // best-effort pruning
    }
  }
}
