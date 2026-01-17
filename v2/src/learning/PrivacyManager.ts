/**
 * PrivacyManager - Privacy Controls for Learning Data
 *
 * Implements privacy levels and data protection for the learning system:
 * - PUBLIC: Full sharing, all data visible
 * - TEAM: Share within team namespace only
 * - PRIVATE: No sharing, local learning only
 * - PARANOID: No persistence, in-memory only, auto-wipe
 *
 * Features:
 * - Code snippet sanitization
 * - Agent ID anonymization for cross-team sharing
 * - Data retention policies
 * - Encryption for sensitive patterns
 * - Integration with ExperienceSharingProtocol
 *
 * @module learning/PrivacyManager
 * @version 1.0.0
 */

import crypto from 'crypto';
import { TaskExperience, LearnedPattern } from './types';
import { SharedExperience } from './ExperienceSharingProtocol';
import { Logger } from '../utils/Logger';

/**
 * Privacy levels for learning data
 */
export enum PrivacyLevel {
  /** Full sharing, all data visible */
  PUBLIC = 'PUBLIC',
  /** Share within team namespace only */
  TEAM = 'TEAM',
  /** No sharing, local learning only */
  PRIVATE = 'PRIVATE',
  /** No persistence, in-memory only, auto-wipe */
  PARANOID = 'PARANOID'
}

/**
 * Privacy configuration
 */
export interface PrivacyConfig {
  /** Privacy level */
  level: PrivacyLevel;
  /** Team/organization namespace (required for TEAM level) */
  teamNamespace?: string;
  /** Encryption key for sensitive data (required for PRIVATE/PARANOID) */
  encryptionKey?: string;
  /** Data retention period in milliseconds (0 = forever) */
  retentionPeriod?: number;
  /** Whether to sanitize code snippets in experiences */
  sanitizeCode?: boolean;
  /** Whether to anonymize agent IDs for cross-team sharing */
  anonymizeAgentIds?: boolean;
  /** Maximum experience age in milliseconds before auto-deletion (PARANOID) */
  maxExperienceAge?: number;
  /** Patterns to redact from code (regex patterns) */
  redactionPatterns?: string[];
}

/**
 * Sanitized experience with privacy controls applied
 */
export interface SanitizedExperience {
  original: TaskExperience;
  sanitized: TaskExperience;
  redactions: string[]; // List of what was redacted
  anonymized: boolean; // Whether agent ID was anonymized
  encrypted: boolean; // Whether sensitive data was encrypted
}

/**
 * Data retention policy result
 */
export interface RetentionPolicyResult {
  shouldRetain: boolean;
  reason: string;
  expiresAt?: Date;
}

/**
 * Default privacy configurations for each level
 */
const DEFAULT_PRIVACY_CONFIGS: Record<PrivacyLevel, Partial<PrivacyConfig>> = {
  [PrivacyLevel.PUBLIC]: {
    retentionPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year
    sanitizeCode: false,
    anonymizeAgentIds: false,
    redactionPatterns: []
  },
  [PrivacyLevel.TEAM]: {
    retentionPeriod: 90 * 24 * 60 * 60 * 1000, // 90 days
    sanitizeCode: true,
    anonymizeAgentIds: true,
    redactionPatterns: [
      'password\\s*=\\s*["\'].*?["\']',
      'api[_-]?key\\s*=\\s*["\'].*?["\']',
      'secret\\s*=\\s*["\'].*?["\']',
      'token\\s*=\\s*["\'].*?["\']'
    ]
  },
  [PrivacyLevel.PRIVATE]: {
    retentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
    sanitizeCode: true,
    anonymizeAgentIds: true,
    redactionPatterns: [
      'password\\s*=\\s*["\'].*?["\']',
      'api[_-]?key\\s*=\\s*["\'].*?["\']',
      'secret\\s*=\\s*["\'].*?["\']',
      'token\\s*=\\s*["\'].*?["\']',
      '\\b\\d{3}-\\d{2}-\\d{4}\\b', // SSN
      '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b', // Email
      '\\b(?:\\d[ -]?){13,16}\\b' // Credit card
    ]
  },
  [PrivacyLevel.PARANOID]: {
    retentionPeriod: 0, // No persistence
    sanitizeCode: true,
    anonymizeAgentIds: true,
    maxExperienceAge: 60 * 60 * 1000, // 1 hour max age in memory
    redactionPatterns: [
      // All patterns from PRIVATE plus more aggressive ones
      'password\\s*=\\s*["\'].*?["\']',
      'api[_-]?key\\s*=\\s*["\'].*?["\']',
      'secret\\s*=\\s*["\'].*?["\']',
      'token\\s*=\\s*["\'].*?["\']',
      '\\b\\d{3}-\\d{2}-\\d{4}\\b',
      '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b',
      '\\b(?:\\d[ -]?){13,16}\\b',
      '\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b', // IP addresses
      '\\b[a-f0-9]{32}\\b', // MD5 hashes
      '\\b[a-f0-9]{40}\\b', // SHA1 hashes
      '\\b[a-f0-9]{64}\\b' // SHA256 hashes
    ]
  }
};

/**
 * PrivacyManager - Manages privacy controls for learning data
 */
export class PrivacyManager {
  private readonly logger: Logger;
  private config: Required<PrivacyConfig>;
  private anonymizationMap: Map<string, string>; // Original ID -> Anonymous ID
  private encryptionAlgorithm: string = 'aes-256-cbc';
  private encryptionKey?: Buffer;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: PrivacyConfig) {
    this.logger = Logger.getInstance();

    // Merge with defaults for the privacy level
    const defaults = DEFAULT_PRIVACY_CONFIGS[config.level];
    this.config = {
      level: config.level,
      teamNamespace: config.teamNamespace ?? '',
      encryptionKey: config.encryptionKey ?? this.generateEncryptionKey(),
      retentionPeriod: config.retentionPeriod ?? defaults.retentionPeriod ?? 0,
      sanitizeCode: config.sanitizeCode ?? defaults.sanitizeCode ?? false,
      anonymizeAgentIds: config.anonymizeAgentIds ?? defaults.anonymizeAgentIds ?? false,
      maxExperienceAge: config.maxExperienceAge ?? defaults.maxExperienceAge ?? 0,
      redactionPatterns: config.redactionPatterns ?? defaults.redactionPatterns ?? []
    };

    this.anonymizationMap = new Map();

    // Initialize encryption key
    if (this.config.encryptionKey) {
      this.encryptionKey = this.deriveKey(this.config.encryptionKey);
    }

    // Validate configuration
    this.validateConfig();

    // Start cleanup timer for PARANOID mode
    if (this.config.level === PrivacyLevel.PARANOID && this.config.maxExperienceAge > 0) {
      this.startCleanupTimer();
    }

    this.logger.info(`PrivacyManager initialized with level: ${this.config.level}`);
  }

  /**
   * Validate privacy configuration
   */
  private validateConfig(): void {
    if (this.config.level === PrivacyLevel.TEAM && !this.config.teamNamespace) {
      throw new Error('teamNamespace is required for TEAM privacy level');
    }

    if ((this.config.level === PrivacyLevel.PRIVATE || this.config.level === PrivacyLevel.PARANOID) &&
        !this.config.encryptionKey) {
      this.logger.warn('No encryption key provided for PRIVATE/PARANOID mode, using auto-generated key');
    }
  }

  /**
   * Generate a random encryption key
   */
  private generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Derive encryption key from password
   */
  private deriveKey(password: string): Buffer {
    return crypto.pbkdf2Sync(password, 'agentic-qe-salt', 100000, 32, 'sha256');
  }

  /**
   * Get current privacy level
   */
  getPrivacyLevel(): PrivacyLevel {
    return this.config.level;
  }

  /**
   * Check if experience sharing is allowed
   */
  canShareExperiences(): boolean {
    return this.config.level === PrivacyLevel.PUBLIC ||
           this.config.level === PrivacyLevel.TEAM;
  }

  /**
   * Check if persistence is allowed
   */
  canPersist(): boolean {
    return this.config.level !== PrivacyLevel.PARANOID;
  }

  /**
   * Check if an experience can be shared with a specific agent
   */
  canShareWith(targetAgentId: string, targetTeamNamespace?: string): boolean {
    switch (this.config.level) {
      case PrivacyLevel.PUBLIC:
        return true;

      case PrivacyLevel.TEAM:
        return targetTeamNamespace === this.config.teamNamespace;

      case PrivacyLevel.PRIVATE:
      case PrivacyLevel.PARANOID:
        return false;

      default:
        return false;
    }
  }

  /**
   * Sanitize an experience based on privacy settings
   */
  sanitizeExperience(experience: TaskExperience): SanitizedExperience {
    const redactions: string[] = [];
    let sanitized = { ...experience };
    let anonymized = false;
    let encrypted = false;

    // Anonymize agent ID if configured
    if (this.config.anonymizeAgentIds) {
      sanitized.agentId = this.anonymizeAgentId(experience.agentId);
      anonymized = true;
      redactions.push('agent_id');
    }

    // Sanitize code snippets in context features
    if (this.config.sanitizeCode && sanitized.state.contextFeatures) {
      const { sanitized: sanitizedContext, redacted } = this.sanitizeObject(
        sanitized.state.contextFeatures
      );
      sanitized.state.contextFeatures = sanitizedContext;
      redactions.push(...redacted);
    }

    // Encrypt sensitive action data for PRIVATE/PARANOID
    if ((this.config.level === PrivacyLevel.PRIVATE || this.config.level === PrivacyLevel.PARANOID) &&
        this.encryptionKey) {
      sanitized.action = this.encryptActionData(sanitized.action);
      encrypted = true;
      redactions.push('action_encrypted');
    }

    return {
      original: experience,
      sanitized,
      redactions,
      anonymized,
      encrypted
    };
  }

  /**
   * Sanitize a shared experience before sharing
   */
  sanitizeSharedExperience(sharedExperience: SharedExperience): SharedExperience {
    const { sanitized } = this.sanitizeExperience(sharedExperience.experience);

    return {
      ...sharedExperience,
      experience: sanitized,
      sourceAgentId: this.config.anonymizeAgentIds
        ? this.anonymizeAgentId(sharedExperience.sourceAgentId)
        : sharedExperience.sourceAgentId
    };
  }

  /**
   * Sanitize a learned pattern
   */
  sanitizePattern(pattern: LearnedPattern): LearnedPattern {
    const sanitized = { ...pattern };

    // Sanitize pattern string (may contain code)
    if (this.config.sanitizeCode) {
      const { sanitized: sanitizedPattern } = this.sanitizeString(pattern.pattern);
      sanitized.pattern = sanitizedPattern;
    }

    // Sanitize contexts (may contain sensitive task types)
    if (this.config.sanitizeCode && sanitized.contexts) {
      sanitized.contexts = sanitized.contexts.map(ctx => {
        const { sanitized: sanitizedCtx } = this.sanitizeString(ctx);
        return sanitizedCtx;
      });
    }

    return sanitized;
  }

  /**
   * Anonymize an agent ID
   */
  anonymizeAgentId(agentId: string): string {
    if (!this.anonymizationMap.has(agentId)) {
      const hash = crypto.createHash('sha256').update(agentId).digest('hex').substring(0, 16);
      const anonymousId = `agent-${hash}`;
      this.anonymizationMap.set(agentId, anonymousId);
    }

    return this.anonymizationMap.get(agentId)!;
  }

  /**
   * De-anonymize an agent ID (if mapping exists)
   */
  deAnonymizeAgentId(anonymousId: string): string | undefined {
    for (const [original, anonymous] of this.anonymizationMap.entries()) {
      if (anonymous === anonymousId) {
        return original;
      }
    }
    return undefined;
  }

  /**
   * Sanitize a string by applying redaction patterns
   */
  private sanitizeString(input: string): { sanitized: string; redacted: string[] } {
    let sanitized = input;
    const redacted: string[] = [];

    for (const pattern of this.config.redactionPatterns) {
      const regex = new RegExp(pattern, 'gi');
      const matches = sanitized.match(regex);

      if (matches) {
        sanitized = sanitized.replace(regex, '[REDACTED]');
        redacted.push(`pattern_${pattern.substring(0, 20)}`);
      }
    }

    return { sanitized, redacted };
  }

  /**
   * Sanitize an object recursively
   */
  private sanitizeObject(obj: any): { sanitized: any; redacted: string[] } {
    const redacted: string[] = [];

    if (typeof obj === 'string') {
      const result = this.sanitizeString(obj);
      redacted.push(...result.redacted);
      return { sanitized: result.sanitized, redacted };
    }

    if (Array.isArray(obj)) {
      const sanitized = obj.map(item => {
        const result = this.sanitizeObject(item);
        redacted.push(...result.redacted);
        return result.sanitized;
      });
      return { sanitized, redacted };
    }

    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const result = this.sanitizeObject(value);
        sanitized[key] = result.sanitized;
        redacted.push(...result.redacted);
      }
      return { sanitized, redacted };
    }

    return { sanitized: obj, redacted };
  }

  /**
   * Encrypt action data
   */
  private encryptActionData(action: any): any {
    if (!this.encryptionKey) {
      return action;
    }

    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.encryptionAlgorithm, this.encryptionKey, iv);

      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(action), 'utf8'),
        cipher.final()
      ]);

      return {
        encrypted: true,
        iv: iv.toString('hex'),
        data: encrypted.toString('hex')
      };
    } catch (error) {
      this.logger.warn('Failed to encrypt action data:', error);
      return action;
    }
  }

  /**
   * Decrypt action data
   */
  decryptActionData(encryptedAction: any): any {
    if (!encryptedAction.encrypted || !this.encryptionKey) {
      return encryptedAction;
    }

    try {
      const iv = Buffer.from(encryptedAction.iv, 'hex');
      const encryptedData = Buffer.from(encryptedAction.data, 'hex');

      const decipher = crypto.createDecipheriv(this.encryptionAlgorithm, this.encryptionKey, iv);

      const decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
      ]);

      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      this.logger.warn('Failed to decrypt action data:', error);
      return encryptedAction;
    }
  }

  /**
   * Encrypt a pattern for storage
   */
  encryptPattern(pattern: string): string {
    if (!this.encryptionKey ||
        (this.config.level !== PrivacyLevel.PRIVATE && this.config.level !== PrivacyLevel.PARANOID)) {
      return pattern;
    }

    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.encryptionAlgorithm, this.encryptionKey, iv);

      const encrypted = Buffer.concat([
        cipher.update(pattern, 'utf8'),
        cipher.final()
      ]);

      return `encrypted:${iv.toString('hex')}:${encrypted.toString('hex')}`;
    } catch (error) {
      this.logger.warn('Failed to encrypt pattern:', error);
      return pattern;
    }
  }

  /**
   * Decrypt a pattern from storage
   */
  decryptPattern(encryptedPattern: string): string {
    if (!encryptedPattern.startsWith('encrypted:') || !this.encryptionKey) {
      return encryptedPattern;
    }

    try {
      const parts = encryptedPattern.split(':');
      if (parts.length !== 3) {
        return encryptedPattern;
      }

      const iv = Buffer.from(parts[1], 'hex');
      const encryptedData = Buffer.from(parts[2], 'hex');

      const decipher = crypto.createDecipheriv(this.encryptionAlgorithm, this.encryptionKey, iv);

      const decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      this.logger.warn('Failed to decrypt pattern:', error);
      return encryptedPattern;
    }
  }

  /**
   * Apply data retention policy
   */
  applyRetentionPolicy(timestamp: Date | number): RetentionPolicyResult {
    const experienceTime = timestamp instanceof Date ? timestamp.getTime() : timestamp;
    const now = Date.now();
    const age = now - experienceTime;

    // PARANOID mode: check max experience age
    if (this.config.level === PrivacyLevel.PARANOID) {
      if (this.config.maxExperienceAge > 0 && age > this.config.maxExperienceAge) {
        return {
          shouldRetain: false,
          reason: `Experience exceeds max age for PARANOID mode (${this.config.maxExperienceAge}ms)`
        };
      }
      return {
        shouldRetain: true,
        reason: 'In-memory only, auto-wipe on cleanup',
        expiresAt: new Date(experienceTime + this.config.maxExperienceAge)
      };
    }

    // No retention period means keep forever
    if (this.config.retentionPeriod === 0) {
      return {
        shouldRetain: true,
        reason: 'No retention period configured, keep forever'
      };
    }

    // Check if within retention period
    if (age <= this.config.retentionPeriod) {
      return {
        shouldRetain: true,
        reason: 'Within retention period',
        expiresAt: new Date(experienceTime + this.config.retentionPeriod)
      };
    }

    return {
      shouldRetain: false,
      reason: `Experience older than retention period (${this.config.retentionPeriod}ms)`
    };
  }

  /**
   * Start cleanup timer for PARANOID mode
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Run cleanup every 5 minutes
    const cleanupInterval = 5 * 60 * 1000;

    this.cleanupTimer = setInterval(() => {
      this.logger.debug('Running PARANOID mode cleanup');
      // Cleanup is handled by LearningEngine based on retention policy
    }, cleanupInterval);

    this.logger.info(`Started PARANOID mode cleanup timer (interval: ${cleanupInterval}ms)`);
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
      this.logger.info('Stopped PARANOID mode cleanup timer');
    }
  }

  /**
   * Clear all anonymization mappings
   */
  clearAnonymizationMappings(): void {
    this.anonymizationMap.clear();
    this.logger.info('Cleared all anonymization mappings');
  }

  /**
   * Get privacy configuration
   */
  getConfig(): Required<PrivacyConfig> {
    return { ...this.config };
  }

  /**
   * Update privacy configuration
   */
  updateConfig(config: Partial<PrivacyConfig>): void {
    const oldLevel = this.config.level;

    this.config = {
      ...this.config,
      ...config
    };

    // Update encryption key if changed
    if (config.encryptionKey && config.encryptionKey !== this.config.encryptionKey) {
      this.encryptionKey = this.deriveKey(config.encryptionKey);
    }

    // Handle privacy level changes
    if (config.level && config.level !== oldLevel) {
      this.logger.info(`Privacy level changed from ${oldLevel} to ${config.level}`);

      // Start/stop cleanup timer as needed
      if (config.level === PrivacyLevel.PARANOID && !this.cleanupTimer) {
        this.startCleanupTimer();
      } else if (config.level !== PrivacyLevel.PARANOID && this.cleanupTimer) {
        this.stopCleanupTimer();
      }
    }

    this.validateConfig();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopCleanupTimer();
    this.clearAnonymizationMappings();

    // Clear encryption key from memory
    if (this.encryptionKey) {
      this.encryptionKey.fill(0);
      this.encryptionKey = undefined;
    }

    this.logger.info('PrivacyManager disposed');
  }

  /**
   * Export privacy statistics
   */
  getStats(): {
    privacyLevel: PrivacyLevel;
    canShare: boolean;
    canPersist: boolean;
    retentionPeriod: number;
    anonymizedAgents: number;
    redactionPatterns: number;
  } {
    return {
      privacyLevel: this.config.level,
      canShare: this.canShareExperiences(),
      canPersist: this.canPersist(),
      retentionPeriod: this.config.retentionPeriod,
      anonymizedAgents: this.anonymizationMap.size,
      redactionPatterns: this.config.redactionPatterns.length
    };
  }
}
