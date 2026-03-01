/**
 * Sample Authentication Middleware for Token Reduction Benchmark
 * Additional fixture file to simulate multi-file codebase
 *
 * This middleware handles:
 * - Request authentication
 * - Role-based access control
 * - Rate limiting
 * - Audit logging
 */

import type { User, Role, Session, AuthError } from './auth-service';

// ============================================================================
// Types
// ============================================================================

export interface AuthenticatedRequest {
  user?: User;
  session?: Session;
  isAuthenticated: boolean;
  permissions: Set<string>;
}

export interface MiddlewareContext {
  request: AuthenticatedRequest;
  path: string;
  method: string;
  timestamp: Date;
  requestId: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator: (ctx: MiddlewareContext) => string;
}

export interface AuditLogEntry {
  requestId: string;
  userId?: string;
  action: string;
  resource: string;
  result: 'success' | 'failure';
  reason?: string;
  timestamp: Date;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Rate Limiter
// ============================================================================

export class RateLimiter {
  private readonly requests: Map<string, number[]> = new Map();
  private readonly config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      windowMs: 60000, // 1 minute
      maxRequests: 100,
      keyGenerator: (ctx) => ctx.request.user?.id ?? 'anonymous',
      ...config,
    };
  }

  async checkLimit(ctx: MiddlewareContext): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const key = this.config.keyGenerator(ctx);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get existing requests and filter to current window
    const existingRequests = this.requests.get(key) ?? [];
    const recentRequests = existingRequests.filter((ts) => ts > windowStart);

    // Update stored requests
    recentRequests.push(now);
    this.requests.set(key, recentRequests);

    const remaining = Math.max(0, this.config.maxRequests - recentRequests.length);
    const resetAt = new Date(now + this.config.windowMs);

    return {
      allowed: recentRequests.length <= this.config.maxRequests,
      remaining,
      resetAt,
    };
  }

  clearExpired(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [key, timestamps] of this.requests.entries()) {
      const recent = timestamps.filter((ts) => ts > windowStart);
      if (recent.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recent);
      }
    }
  }
}

// ============================================================================
// Audit Logger
// ============================================================================

export class AuditLogger {
  private readonly logs: AuditLogEntry[] = [];
  private readonly maxLogSize: number;

  constructor(maxLogSize = 10000) {
    this.maxLogSize = maxLogSize;
  }

  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date(),
    };

    this.logs.push(fullEntry);

    // Trim if necessary
    if (this.logs.length > this.maxLogSize) {
      this.logs.splice(0, this.logs.length - this.maxLogSize);
    }
  }

  query(filter: Partial<AuditLogEntry>, limit = 100): AuditLogEntry[] {
    return this.logs
      .filter((entry) => {
        for (const [key, value] of Object.entries(filter)) {
          if (entry[key as keyof AuditLogEntry] !== value) {
            return false;
          }
        }
        return true;
      })
      .slice(-limit);
  }

  getRecentForUser(userId: string, limit = 50): AuditLogEntry[] {
    return this.logs.filter((e) => e.userId === userId).slice(-limit);
  }

  getFailures(since: Date): AuditLogEntry[] {
    return this.logs.filter((e) => e.result === 'failure' && e.timestamp >= since);
  }
}

// ============================================================================
// Permission Resolver
// ============================================================================

export class PermissionResolver {
  private readonly roleHierarchy: Map<Role, Role[]> = new Map([
    ['superadmin', ['admin', 'moderator', 'user']],
    ['admin', ['moderator', 'user']],
    ['moderator', ['user']],
    ['user', []],
  ]);

  private readonly resourcePermissions: Map<string, Map<string, Role[]>> = new Map([
    [
      'users',
      new Map([
        ['read', ['admin', 'moderator']],
        ['create', ['admin']],
        ['update', ['admin']],
        ['delete', ['superadmin']],
      ]),
    ],
    [
      'content',
      new Map([
        ['read', ['user', 'moderator', 'admin']],
        ['create', ['user', 'moderator', 'admin']],
        ['update', ['moderator', 'admin']],
        ['delete', ['admin']],
      ]),
    ],
    [
      'settings',
      new Map([
        ['read', ['admin']],
        ['update', ['admin']],
      ]),
    ],
  ]);

  getEffectiveRoles(userRoles: Role[]): Set<Role> {
    const effective = new Set<Role>(userRoles);

    for (const role of userRoles) {
      const inherited = this.roleHierarchy.get(role) ?? [];
      for (const inheritedRole of inherited) {
        effective.add(inheritedRole);
      }
    }

    return effective;
  }

  canPerform(user: User, resource: string, action: string): boolean {
    const effectiveRoles = this.getEffectiveRoles(user.roles);

    // Superadmin can do anything
    if (effectiveRoles.has('superadmin')) {
      return true;
    }

    const resourcePerms = this.resourcePermissions.get(resource);
    if (!resourcePerms) {
      return false;
    }

    const allowedRoles = resourcePerms.get(action);
    if (!allowedRoles) {
      return false;
    }

    return allowedRoles.some((role) => effectiveRoles.has(role));
  }

  getAllPermissions(user: User): Set<string> {
    const permissions = new Set<string>();
    const effectiveRoles = this.getEffectiveRoles(user.roles);

    for (const [resource, actions] of this.resourcePermissions.entries()) {
      for (const [action, allowedRoles] of actions.entries()) {
        if (allowedRoles.some((role) => effectiveRoles.has(role))) {
          permissions.add(`${resource}:${action}`);
        }
      }
    }

    return permissions;
  }
}

// ============================================================================
// Authentication Middleware
// ============================================================================

export class AuthMiddleware {
  private readonly rateLimiter: RateLimiter;
  private readonly auditLogger: AuditLogger;
  private readonly permissionResolver: PermissionResolver;

  constructor() {
    this.rateLimiter = new RateLimiter();
    this.auditLogger = new AuditLogger();
    this.permissionResolver = new PermissionResolver();
  }

  async authenticate(ctx: MiddlewareContext, token?: string): Promise<AuthenticatedRequest> {
    const request: AuthenticatedRequest = {
      isAuthenticated: false,
      permissions: new Set(),
    };

    if (!token) {
      this.auditLogger.log({
        requestId: ctx.requestId,
        action: 'authenticate',
        resource: ctx.path,
        result: 'failure',
        reason: 'no_token',
      });
      return request;
    }

    // In real implementation, verify token signature and decode
    // Here we simulate successful authentication
    const mockUser: User = {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: '',
      salt: '',
      roles: ['user'],
      mfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      failedLoginAttempts: 0,
    };

    request.user = mockUser;
    request.isAuthenticated = true;
    request.permissions = this.permissionResolver.getAllPermissions(mockUser);

    this.auditLogger.log({
      requestId: ctx.requestId,
      userId: mockUser.id,
      action: 'authenticate',
      resource: ctx.path,
      result: 'success',
    });

    return request;
  }

  async authorize(
    ctx: MiddlewareContext,
    requiredRole?: Role,
    requiredPermission?: string
  ): Promise<{ allowed: boolean; error?: AuthError }> {
    if (!ctx.request.isAuthenticated || !ctx.request.user) {
      return { allowed: false, error: 'TOKEN_INVALID' };
    }

    const user = ctx.request.user;

    // Check rate limit first
    const rateLimit = await this.rateLimiter.checkLimit(ctx);
    if (!rateLimit.allowed) {
      this.auditLogger.log({
        requestId: ctx.requestId,
        userId: user.id,
        action: 'authorize',
        resource: ctx.path,
        result: 'failure',
        reason: 'rate_limited',
      });
      return { allowed: false, error: 'INSUFFICIENT_PERMISSIONS' };
    }

    // Check role if required
    if (requiredRole) {
      const effectiveRoles = this.permissionResolver.getEffectiveRoles(user.roles);
      if (!effectiveRoles.has(requiredRole)) {
        this.auditLogger.log({
          requestId: ctx.requestId,
          userId: user.id,
          action: 'authorize',
          resource: ctx.path,
          result: 'failure',
          reason: `missing_role:${requiredRole}`,
        });
        return { allowed: false, error: 'INSUFFICIENT_PERMISSIONS' };
      }
    }

    // Check specific permission if required
    if (requiredPermission && !ctx.request.permissions.has(requiredPermission)) {
      this.auditLogger.log({
        requestId: ctx.requestId,
        userId: user.id,
        action: 'authorize',
        resource: ctx.path,
        result: 'failure',
        reason: `missing_permission:${requiredPermission}`,
      });
      return { allowed: false, error: 'INSUFFICIENT_PERMISSIONS' };
    }

    this.auditLogger.log({
      requestId: ctx.requestId,
      userId: user.id,
      action: 'authorize',
      resource: ctx.path,
      result: 'success',
    });

    return { allowed: true };
  }

  getAuditLogs(filter?: Partial<AuditLogEntry>): AuditLogEntry[] {
    return this.auditLogger.query(filter ?? {});
  }
}
