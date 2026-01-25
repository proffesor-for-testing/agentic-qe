import { EventEmitter } from 'events';

/**
 * Quota configuration for a specific LLM provider
 */
export interface ProviderQuota {
  providerId: string;
  dailyLimit: number;
  minuteLimit?: number;
  resetTimeUtc: string; // HH:MM format, e.g., "00:00"
  warningThresholds: number[]; // e.g., [80, 90]
}

/**
 * Current quota status for a provider
 */
export interface QuotaStatus {
  providerId: string;
  dailyUsed: number;
  dailyRemaining: number;
  dailyLimit: number;
  minuteUsed: number;
  minuteRemaining: number;
  minuteLimit: number;
  percentageUsed: number;
  nextResetTime: Date;
  isExhausted: boolean;
  warningLevel: 'none' | 'warning' | 'critical' | 'exhausted';
}

/**
 * Configuration for QuotaManager
 */
export interface QuotaManagerConfig {
  providers: ProviderQuota[];
  enforcementMode: 'warn' | 'block' | 'none';
  alertCallback?: (status: QuotaStatus) => void;
  persistState?: boolean;
}

interface UsageRecord {
  dailyCount: number;
  minuteWindow: Array<{ timestamp: number; count: number }>;
  lastResetTime: Date;
  triggeredThresholds: Set<number>;
}

/**
 * Manages quota tracking and enforcement across LLM providers
 */
export class QuotaManager extends EventEmitter {
  private config: QuotaManagerConfig;
  private quotas: Map<string, ProviderQuota>;
  private usage: Map<string, UsageRecord>;
  private resetTimers: Map<string, NodeJS.Timeout>;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: QuotaManagerConfig) {
    super();
    this.config = config;
    this.quotas = new Map();
    this.usage = new Map();
    this.resetTimers = new Map();

    // Register all providers
    config.providers.forEach(provider => this.registerProvider(provider));

    // Load persisted state if enabled
    if (config.persistState) {
      this.loadState();
    }

    // Start cleanup interval for minute windows
    this.cleanupInterval = setInterval(() => this.cleanupMinuteWindows(), 60000);
  }

  /**
   * Register a new provider with quota limits
   */
  registerProvider(quota: ProviderQuota): void {
    this.quotas.set(quota.providerId, quota);

    if (!this.usage.has(quota.providerId)) {
      this.usage.set(quota.providerId, {
        dailyCount: 0,
        minuteWindow: [],
        lastResetTime: new Date(),
        triggeredThresholds: new Set()
      });
    }
  }

  /**
   * Update quota configuration for a provider
   */
  updateQuota(providerId: string, updates: Partial<ProviderQuota>): void {
    const existing = this.quotas.get(providerId);
    if (!existing) {
      throw new Error(`Provider ${providerId} not registered`);
    }

    const updated = { ...existing, ...updates };
    this.quotas.set(providerId, updated);
  }

  /**
   * Record a single request for a provider
   */
  recordRequest(providerId: string): void {
    this.recordRequests(providerId, 1);
  }

  /**
   * Record multiple requests for a provider
   */
  recordRequests(providerId: string, count: number): void {
    const quota = this.quotas.get(providerId);
    const record = this.usage.get(providerId);

    if (!quota || !record) {
      throw new Error(`Provider ${providerId} not registered`);
    }

    const now = Date.now();

    // Update daily count
    record.dailyCount += count;

    // Update minute window
    record.minuteWindow.push({ timestamp: now, count });
    this.cleanupOldMinuteEntries(providerId);

    // Check quota status and emit events
    const status = this.getQuotaStatus(providerId);
    if (status) {
      this.checkThresholds(status, record);

      if (this.config.alertCallback) {
        this.config.alertCallback(status);
      }
    }

    // Persist state if enabled
    if (this.config.persistState) {
      this.saveState();
    }
  }

  /**
   * Check if a request can be made without exceeding quota
   */
  canMakeRequest(providerId: string): boolean {
    const status = this.getQuotaStatus(providerId);
    if (!status) {
      return false;
    }

    const canMake = !status.isExhausted;

    if (!canMake && this.config.enforcementMode === 'block') {
      return false;
    }

    return canMake;
  }

  /**
   * Get remaining quota for a provider
   */
  getRemainingQuota(providerId: string): { daily: number; minute: number } {
    const status = this.getQuotaStatus(providerId);
    if (!status) {
      return { daily: 0, minute: 0 };
    }

    return {
      daily: status.dailyRemaining,
      minute: status.minuteRemaining
    };
  }

  /**
   * Get current quota status for a provider
   */
  getQuotaStatus(providerId: string): QuotaStatus | undefined {
    const quota = this.quotas.get(providerId);
    const record = this.usage.get(providerId);

    if (!quota || !record) {
      return undefined;
    }

    const minuteUsed = this.getMinuteUsage(providerId);
    const minuteLimit = quota.minuteLimit || Infinity;
    const percentageUsed = quota.dailyLimit === Infinity
      ? 0
      : (record.dailyCount / quota.dailyLimit) * 100;

    const isExhausted =
      (quota.dailyLimit !== Infinity && record.dailyCount >= quota.dailyLimit) ||
      (quota.minuteLimit !== undefined && minuteUsed >= quota.minuteLimit);

    const warningLevel = this.determineWarningLevel(percentageUsed, isExhausted);

    return {
      providerId,
      dailyUsed: record.dailyCount,
      dailyRemaining: Math.max(0, quota.dailyLimit - record.dailyCount),
      dailyLimit: quota.dailyLimit,
      minuteUsed,
      minuteRemaining: Math.max(0, minuteLimit - minuteUsed),
      minuteLimit,
      percentageUsed,
      nextResetTime: this.calculateNextResetTime(quota.resetTimeUtc),
      isExhausted,
      warningLevel
    };
  }

  /**
   * Get quota status for all providers
   */
  getAllQuotaStatus(): Map<string, QuotaStatus> {
    const statusMap = new Map<string, QuotaStatus>();

    for (const providerId of Array.from(this.quotas.keys())) {
      const status = this.getQuotaStatus(providerId);
      if (status) {
        statusMap.set(providerId, status);
      }
    }

    return statusMap;
  }

  /**
   * Reset daily quota for a provider
   */
  resetDailyQuota(providerId: string): void {
    const record = this.usage.get(providerId);
    if (!record) {
      throw new Error(`Provider ${providerId} not registered`);
    }

    record.dailyCount = 0;
    record.lastResetTime = new Date();
    record.triggeredThresholds.clear();

    const status = this.getQuotaStatus(providerId);
    if (status) {
      this.emit('quota-reset', status);
    }

    if (this.config.persistState) {
      this.saveState();
    }
  }

  /**
   * Reset daily quotas for all providers
   */
  resetAllDailyQuotas(): void {
    for (const providerId of Array.from(this.quotas.keys())) {
      this.resetDailyQuota(providerId);
    }
  }

  /**
   * Start automatic quota reset scheduling
   */
  startAutoReset(): void {
    // Schedule reset for each provider
    for (const [providerId, quota] of Array.from(this.quotas.entries())) {
      const nextReset = this.calculateNextResetTime(quota.resetTimeUtc);
      const timeUntilReset = nextReset.getTime() - Date.now();

      const timer = setTimeout(() => {
        this.resetDailyQuota(providerId);
        // Schedule next reset
        this.scheduleNextReset(providerId);
      }, timeUntilReset);

      this.resetTimers.set(providerId, timer);
    }
  }

  /**
   * Stop automatic quota reset scheduling
   */
  stopAutoReset(): void {
    for (const timer of Array.from(this.resetTimers.values())) {
      clearTimeout(timer);
    }
    this.resetTimers.clear();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Stop cleanup interval (alias for use in CLI commands)
   */
  stopCleanup(): void {
    this.stopAutoReset();
  }

  /**
   * Save current state for persistence
   */
  saveState(): void {
    // This is a placeholder - implementation would depend on storage mechanism
    // Could save to file, database, or memory cache
    const state = {
      usage: Array.from(this.usage.entries()).map(([id, record]) => ({
        providerId: id,
        dailyCount: record.dailyCount,
        lastResetTime: record.lastResetTime.toISOString(),
        triggeredThresholds: Array.from(record.triggeredThresholds)
      }))
    };

    // Store state (implementation specific)
    // For now, this is a no-op
  }

  /**
   * Load persisted state
   */
  loadState(): void {
    // This is a placeholder - implementation would depend on storage mechanism
    // Would restore usage counts and reset times from storage
  }

  private scheduleNextReset(providerId: string): void {
    const quota = this.quotas.get(providerId);
    if (!quota) return;

    const nextReset = this.calculateNextResetTime(quota.resetTimeUtc);
    const timeUntilReset = nextReset.getTime() - Date.now();

    const timer = setTimeout(() => {
      this.resetDailyQuota(providerId);
      this.scheduleNextReset(providerId);
    }, timeUntilReset);

    this.resetTimers.set(providerId, timer);
  }

  private getMinuteUsage(providerId: string): number {
    const record = this.usage.get(providerId);
    if (!record) return 0;

    const oneMinuteAgo = Date.now() - 60000;
    return record.minuteWindow
      .filter(entry => entry.timestamp > oneMinuteAgo)
      .reduce((sum, entry) => sum + entry.count, 0);
  }

  private cleanupOldMinuteEntries(providerId: string): void {
    const record = this.usage.get(providerId);
    if (!record) return;

    const oneMinuteAgo = Date.now() - 60000;
    record.minuteWindow = record.minuteWindow.filter(
      entry => entry.timestamp > oneMinuteAgo
    );
  }

  private cleanupMinuteWindows(): void {
    for (const providerId of Array.from(this.usage.keys())) {
      this.cleanupOldMinuteEntries(providerId);
    }
  }

  private determineWarningLevel(
    percentageUsed: number,
    isExhausted: boolean
  ): 'none' | 'warning' | 'critical' | 'exhausted' {
    if (isExhausted) return 'exhausted';
    if (percentageUsed >= 90) return 'critical';
    if (percentageUsed >= 80) return 'warning';
    return 'none';
  }

  private checkThresholds(status: QuotaStatus, record: UsageRecord): void {
    const quota = this.quotas.get(status.providerId);
    if (!quota) return;

    // Check if we've crossed any new thresholds
    for (const threshold of quota.warningThresholds) {
      if (
        status.percentageUsed >= threshold &&
        !record.triggeredThresholds.has(threshold)
      ) {
        record.triggeredThresholds.add(threshold);
        this.emit('quota-warning', status);
      }
    }

    // Check for exhaustion
    if (status.isExhausted && status.warningLevel === 'exhausted') {
      this.emit('quota-exhausted', status);
    }
  }

  private calculateNextResetTime(resetTimeUtc: string): Date {
    const [hours, minutes] = resetTimeUtc.split(':').map(Number);
    const now = new Date();
    const reset = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hours,
      minutes,
      0,
      0
    ));

    // If reset time has passed today, schedule for tomorrow
    if (reset.getTime() <= now.getTime()) {
      reset.setUTCDate(reset.getUTCDate() + 1);
    }

    return reset;
  }
}

/**
 * Factory function to create QuotaManager with common provider presets
 */
export function createQuotaManager(
  config: Partial<QuotaManagerConfig> = {}
): QuotaManager {
  const defaultProviders: ProviderQuota[] = [
    {
      providerId: 'groq',
      dailyLimit: 14400,
      minuteLimit: 10,
      resetTimeUtc: '00:00',
      warningThresholds: [80, 90]
    },
    {
      providerId: 'openrouter',
      dailyLimit: 50,
      resetTimeUtc: '00:00',
      warningThresholds: [80, 90]
    },
    {
      providerId: 'github-models',
      dailyLimit: Infinity,
      resetTimeUtc: '00:00',
      warningThresholds: []
    },
    {
      providerId: 'ollama',
      dailyLimit: Infinity,
      resetTimeUtc: '00:00',
      warningThresholds: []
    }
  ];

  const fullConfig: QuotaManagerConfig = {
    providers: defaultProviders,
    enforcementMode: 'warn',
    persistState: false,
    ...config
  };

  return new QuotaManager(fullConfig);
}
