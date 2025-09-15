/**
 * GitHub Security Controls and Authentication
 * Implements comprehensive security measures for GitHub integration
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { createHash, timingSafeEqual } from 'crypto';

export interface SecurityConfig {
  secrets: {
    webhook_secret?: string;
    github_app_private_key?: string;
    github_token?: string;
  };
  encryption: {
    algorithm: string;
    key: string;
    iv_length: number;
  };
  audit: {
    enabled: boolean;
    log_level: 'debug' | 'info' | 'warn' | 'error';
    retention_days: number;
  };
  rate_limiting: {
    enabled: boolean;
    requests_per_hour: number;
    burst_limit: number;
  };
}

export interface AuditEvent {
  timestamp: string;
  event_type: string;
  user_id?: string;
  repository?: string;
  action: string;
  result: 'success' | 'failure' | 'blocked';
  ip_address?: string;
  user_agent?: string;
  details?: Record<string, any>;
}

export interface WebhookPayload {
  action: string;
  repository?: {
    name: string;
    full_name: string;
    owner: {
      login: string;
      id: number;
    };
  };
  sender: {
    login: string;
    id: number;
  };
  [key: string]: any;
}

export class GitHubSecurityManager {
  private config: SecurityConfig;
  private auditLog: AuditEvent[] = [];
  private rateLimitCache: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  /**
   * Webhook Security
   */
  verifyWebhookSignature(payload: string, signature: string, secret?: string): boolean {
    try {
      const webhookSecret = secret || this.config.secrets.webhook_secret;
      if (!webhookSecret) {
        this.logAuditEvent({
          event_type: 'webhook_verification',
          action: 'verify_signature',
          result: 'failure',
          details: { error: 'No webhook secret configured' },
        });
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');

      const providedSignature = signature.replace('sha256=', '');

      const isValid = timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );

      this.logAuditEvent({
        event_type: 'webhook_verification',
        action: 'verify_signature',
        result: isValid ? 'success' : 'failure',
        details: { signature_match: isValid },
      });

      return isValid;
    } catch (error) {
      this.logAuditEvent({
        event_type: 'webhook_verification',
        action: 'verify_signature',
        result: 'failure',
        details: { error: (error as Error).message },
      });
      return false;
    }
  }

  validateWebhookPayload(payload: WebhookPayload): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Basic structure validation
    if (!payload.sender || !payload.sender.login) {
      issues.push('Missing or invalid sender information');
    }

    if (!payload.action) {
      issues.push('Missing action field');
    }

    // Repository validation for repo-specific events
    if (payload.repository) {
      if (!payload.repository.name || !payload.repository.full_name) {
        issues.push('Missing or invalid repository information');
      }

      if (!payload.repository.owner || !payload.repository.owner.login) {
        issues.push('Missing or invalid repository owner information');
      }
    }

    // Validate against known malicious patterns
    const suspiciousPatterns = [
      /script[^>]*>.*<\/script>/gi, // Script injection
      /javascript:/gi, // JavaScript protocol
      /data:/gi, // Data URLs
      /vbscript:/gi, // VBScript protocol
    ];

    const payloadString = JSON.stringify(payload);
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(payloadString)) {
        issues.push('Potentially malicious content detected');
        break;
      }
    }

    const isValid = issues.length === 0;

    this.logAuditEvent({
      event_type: 'webhook_validation',
      action: 'validate_payload',
      result: isValid ? 'success' : 'blocked',
      details: {
        issues: issues.length > 0 ? issues : undefined,
        sender: payload.sender?.login,
        repository: payload.repository?.full_name,
      },
    });

    return { valid: isValid, issues };
  }

  /**
   * GitHub App JWT Authentication
   */
  generateAppJWT(appId: number, privateKey?: string): string {
    try {
      const key = privateKey || this.config.secrets.github_app_private_key;
      if (!key) {
        throw new Error('GitHub App private key not configured');
      }

      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iat: now - 60, // Issued at (1 minute ago to account for clock skew)
        exp: now + (10 * 60), // Expires at (10 minutes from now)
        iss: appId, // Issuer (GitHub App ID)
      };

      const token = jwt.sign(payload, key, { algorithm: 'RS256' });

      this.logAuditEvent({
        event_type: 'authentication',
        action: 'generate_app_jwt',
        result: 'success',
        details: { app_id: appId },
      });

      return token;
    } catch (error) {
      this.logAuditEvent({
        event_type: 'authentication',
        action: 'generate_app_jwt',
        result: 'failure',
        details: { app_id: appId, error: (error as Error).message },
      });
      throw error;
    }
  }

  /**
   * Token Management
   */
  encryptToken(token: string): string {
    try {
      const cipher = crypto.createCipher(this.config.encryption.algorithm, this.config.encryption.key);
      let encrypted = cipher.update(token, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      this.logAuditEvent({
        event_type: 'token_management',
        action: 'encrypt_token',
        result: 'success',
      });

      return encrypted;
    } catch (error) {
      this.logAuditEvent({
        event_type: 'token_management',
        action: 'encrypt_token',
        result: 'failure',
        details: { error: (error as Error).message },
      });
      throw error;
    }
  }

  decryptToken(encryptedToken: string): string {
    try {
      const decipher = crypto.createDecipher(this.config.encryption.algorithm, this.config.encryption.key);
      let decrypted = decipher.update(encryptedToken, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      this.logAuditEvent({
        event_type: 'token_management',
        action: 'decrypt_token',
        result: 'success',
      });

      return decrypted;
    } catch (error) {
      this.logAuditEvent({
        event_type: 'token_management',
        action: 'decrypt_token',
        result: 'failure',
        details: { error: (error as Error).message },
      });
      throw error;
    }
  }

  rotateToken(oldToken: string, newToken: string): { success: boolean; rotationId: string } {
    try {
      const rotationId = crypto.randomUUID();

      // Encrypt new token
      const encryptedNewToken = this.encryptToken(newToken);

      // Securely wipe old token from memory
      this.secureWipe(oldToken);

      this.logAuditEvent({
        event_type: 'token_management',
        action: 'rotate_token',
        result: 'success',
        details: { rotation_id: rotationId },
      });

      return { success: true, rotationId };
    } catch (error) {
      this.logAuditEvent({
        event_type: 'token_management',
        action: 'rotate_token',
        result: 'failure',
        details: { error: (error as Error).message },
      });
      return { success: false, rotationId: '' };
    }
  }

  /**
   * Rate Limiting
   */
  checkRateLimit(identifier: string, action: string): { allowed: boolean; remainingRequests: number; resetTime: number } {
    if (!this.config.rate_limiting.enabled) {
      return { allowed: true, remainingRequests: this.config.rate_limiting.requests_per_hour, resetTime: 0 };
    }

    const now = Date.now();
    const key = `${identifier}:${action}`;
    const entry = this.rateLimitCache.get(key);

    if (!entry || now > entry.resetTime) {
      // Reset or initialize rate limit
      const resetTime = now + (60 * 60 * 1000); // 1 hour from now
      this.rateLimitCache.set(key, { count: 1, resetTime });

      this.logAuditEvent({
        event_type: 'rate_limiting',
        action: 'reset_limit',
        result: 'success',
        details: { identifier, action_type: action },
      });

      return {
        allowed: true,
        remainingRequests: this.config.rate_limiting.requests_per_hour - 1,
        resetTime
      };
    }

    if (entry.count >= this.config.rate_limiting.requests_per_hour) {
      this.logAuditEvent({
        event_type: 'rate_limiting',
        action: 'block_request',
        result: 'blocked',
        details: { identifier, action_type: action, count: entry.count },
      });

      return { allowed: false, remainingRequests: 0, resetTime: entry.resetTime };
    }

    // Increment counter
    entry.count++;
    this.rateLimitCache.set(key, entry);

    return {
      allowed: true,
      remainingRequests: this.config.rate_limiting.requests_per_hour - entry.count,
      resetTime: entry.resetTime
    };
  }

  /**
   * Permission Validation
   */
  validatePermissions(requiredPermissions: string[], userPermissions: string[]): { valid: boolean; missing: string[] } {
    const missing = requiredPermissions.filter(perm => !userPermissions.includes(perm));
    const valid = missing.length === 0;

    this.logAuditEvent({
      event_type: 'permission_validation',
      action: 'validate_permissions',
      result: valid ? 'success' : 'blocked',
      details: {
        required: requiredPermissions,
        user_permissions: userPermissions,
        missing: missing.length > 0 ? missing : undefined,
      },
    });

    return { valid, missing };
  }

  /**
   * Input Sanitization
   */
  sanitizeInput(input: string): string {
    // Remove potentially dangerous characters and patterns
    return input
      .replace(/[<>\"']/g, '') // Remove HTML/JS injection chars
      .replace(/javascript:/gi, '') // Remove JS protocol
      .replace(/data:/gi, '') // Remove data URLs
      .replace(/vbscript:/gi, '') // Remove VBScript
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim()
      .slice(0, 1000); // Limit length
  }

  sanitizeObject<T extends Record<string, any>>(obj: T): T {
    const sanitized = {} as T;

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key as keyof T] = this.sanitizeInput(value) as T[keyof T];
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key as keyof T] = this.sanitizeObject(value) as T[keyof T];
      } else if (Array.isArray(value)) {
        sanitized[key as keyof T] = value.map(item =>
          typeof item === 'string' ? this.sanitizeInput(item) :
          typeof item === 'object' ? this.sanitizeObject(item) : item
        ) as T[keyof T];
      } else {
        sanitized[key as keyof T] = value;
      }
    }

    return sanitized;
  }

  /**
   * Security Monitoring
   */
  detectSuspiciousActivity(events: AuditEvent[]): { suspicious: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Check for unusual patterns
    const recentEvents = events.filter(e =>
      Date.now() - new Date(e.timestamp).getTime() < 15 * 60 * 1000 // Last 15 minutes
    );

    // Too many failed attempts
    const failedEvents = recentEvents.filter(e => e.result === 'failure');
    if (failedEvents.length > 10) {
      reasons.push('High failure rate detected');
    }

    // Unusual access patterns
    const uniqueIPs = new Set(recentEvents.map(e => e.ip_address).filter(Boolean));
    if (uniqueIPs.size > 5) {
      reasons.push('Multiple IP addresses detected');
    }

    // Rapid fire requests
    if (recentEvents.length > 100) {
      reasons.push('High request volume detected');
    }

    const suspicious = reasons.length > 0;

    if (suspicious) {
      this.logAuditEvent({
        event_type: 'security_monitoring',
        action: 'detect_suspicious_activity',
        result: 'blocked',
        details: { reasons, event_count: recentEvents.length },
      });
    }

    return { suspicious, reasons };
  }

  /**
   * Audit Logging
   */
  private logAuditEvent(event: Partial<AuditEvent>): void {
    if (!this.config.audit.enabled) return;

    const auditEvent: AuditEvent = {
      timestamp: new Date().toISOString(),
      event_type: event.event_type || 'unknown',
      action: event.action || 'unknown',
      result: event.result || 'success',
      user_id: event.user_id,
      repository: event.repository,
      ip_address: event.ip_address,
      user_agent: event.user_agent,
      details: event.details,
    };

    this.auditLog.push(auditEvent);

    // Rotate logs if necessary
    const maxEvents = this.config.audit.retention_days * 24 * 60; // Assuming 1 event per minute
    if (this.auditLog.length > maxEvents) {
      this.auditLog = this.auditLog.slice(-maxEvents);
    }

    // Log to console based on level
    const logLevel = this.config.audit.log_level;
    const message = `[${auditEvent.timestamp}] ${auditEvent.event_type}:${auditEvent.action} - ${auditEvent.result}`;

    switch (logLevel) {
      case 'debug':
        console.debug(message, auditEvent.details);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        if (auditEvent.result === 'failure' || auditEvent.result === 'blocked') {
          console.warn(message, auditEvent.details);
        }
        break;
      case 'error':
        if (auditEvent.result === 'failure' || auditEvent.result === 'blocked') {
          console.error(message, auditEvent.details);
        }
        break;
    }
  }

  getAuditLog(filters?: {
    eventType?: string;
    result?: 'success' | 'failure' | 'blocked';
    userId?: string;
    repository?: string;
    startTime?: Date;
    endTime?: Date;
  }): AuditEvent[] {
    let filteredLog = [...this.auditLog];

    if (filters) {
      if (filters.eventType) {
        filteredLog = filteredLog.filter(e => e.event_type === filters.eventType);
      }
      if (filters.result) {
        filteredLog = filteredLog.filter(e => e.result === filters.result);
      }
      if (filters.userId) {
        filteredLog = filteredLog.filter(e => e.user_id === filters.userId);
      }
      if (filters.repository) {
        filteredLog = filteredLog.filter(e => e.repository === filters.repository);
      }
      if (filters.startTime) {
        filteredLog = filteredLog.filter(e => new Date(e.timestamp) >= filters.startTime!);
      }
      if (filters.endTime) {
        filteredLog = filteredLog.filter(e => new Date(e.timestamp) <= filters.endTime!);
      }
    }

    return filteredLog;
  }

  /**
   * Utility Methods
   */
  private secureWipe(sensitive: string): void {
    // Overwrite memory with random data (basic implementation)
    for (let i = 0; i < sensitive.length; i++) {
      (sensitive as any)[i] = String.fromCharCode(Math.floor(Math.random() * 256));
    }
  }

  generateSecureSecret(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  hashSensitiveData(data: string, salt?: string): { hash: string; salt: string } {
    const useSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = createHash('sha256').update(data + useSalt).digest('hex');
    return { hash, salt: useSalt };
  }

  validateHash(data: string, hash: string, salt: string): boolean {
    const computedHash = createHash('sha256').update(data + salt).digest('hex');
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computedHash, 'hex'));
  }
}

export default GitHubSecurityManager;