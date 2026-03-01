/**
 * Sample Authentication Service for Token Reduction Benchmark
 * ~300 lines of realistic TypeScript code
 *
 * This fixture simulates a real-world authentication module with:
 * - JWT token management
 * - Session handling
 * - Role-based access control
 * - Password hashing
 * - Refresh token rotation
 */

import { createHash, randomBytes } from 'crypto';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  roles: Role[];
  mfaEnabled: boolean;
  mfaSecret?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
}

export interface Session {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastActivityAt: Date;
  isRevoked: boolean;
}

export interface TokenPayload {
  sub: string;
  email: string;
  roles: Role[];
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
  jti: string;
}

export type Role = 'user' | 'admin' | 'moderator' | 'superadmin';

export interface LoginCredentials {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  session?: Session;
  error?: AuthError;
}

export type AuthError =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'MFA_REQUIRED'
  | 'MFA_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'SESSION_REVOKED'
  | 'INSUFFICIENT_PERMISSIONS';

// ============================================================================
// Configuration
// ============================================================================

export interface AuthConfig {
  accessTokenTTL: number; // seconds
  refreshTokenTTL: number; // seconds
  maxFailedAttempts: number;
  lockoutDuration: number; // seconds
  passwordMinLength: number;
  passwordRequireNumbers: boolean;
  passwordRequireSymbols: boolean;
  mfaIssuer: string;
  sessionMaxConcurrent: number;
}

const DEFAULT_CONFIG: AuthConfig = {
  accessTokenTTL: 900, // 15 minutes
  refreshTokenTTL: 604800, // 7 days
  maxFailedAttempts: 5,
  lockoutDuration: 1800, // 30 minutes
  passwordMinLength: 12,
  passwordRequireNumbers: true,
  passwordRequireSymbols: true,
  mfaIssuer: 'AgenticQE',
  sessionMaxConcurrent: 5,
};

// ============================================================================
// Authentication Service
// ============================================================================

export class AuthenticationService {
  private readonly config: AuthConfig;
  private readonly users: Map<string, User> = new Map();
  private readonly sessions: Map<string, Session> = new Map();
  private readonly tokenBlacklist: Set<string> = new Set();

  constructor(config: Partial<AuthConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // User Management
  // --------------------------------------------------------------------------

  async createUser(email: string, password: string, roles: Role[] = ['user']): Promise<User> {
    this.validateEmail(email);
    this.validatePassword(password);

    if (this.findUserByEmail(email)) {
      throw new Error('User already exists');
    }

    const salt = randomBytes(32).toString('hex');
    const passwordHash = this.hashPassword(password, salt);

    const user: User = {
      id: randomBytes(16).toString('hex'),
      email: email.toLowerCase(),
      passwordHash,
      salt,
      roles,
      mfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      failedLoginAttempts: 0,
    };

    this.users.set(user.id, user);
    return user;
  }

  findUserByEmail(email: string): User | undefined {
    const normalizedEmail = email.toLowerCase();
    for (const user of this.users.values()) {
      if (user.email === normalizedEmail) {
        return user;
      }
    }
    return undefined;
  }

  findUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  // --------------------------------------------------------------------------
  // Authentication Flow
  // --------------------------------------------------------------------------

  async login(credentials: LoginCredentials, ipAddress: string, userAgent: string): Promise<AuthResult> {
    const user = this.findUserByEmail(credentials.email);

    if (!user) {
      return { success: false, error: 'INVALID_CREDENTIALS' };
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return { success: false, error: 'ACCOUNT_LOCKED' };
    }

    // Verify password
    const passwordValid = this.verifyPassword(credentials.password, user.passwordHash, user.salt);

    if (!passwordValid) {
      await this.handleFailedLogin(user);
      return { success: false, error: 'INVALID_CREDENTIALS' };
    }

    // Check MFA if enabled
    if (user.mfaEnabled) {
      if (!credentials.mfaCode) {
        return { success: false, error: 'MFA_REQUIRED' };
      }
      if (!this.verifyMfaCode(user.mfaSecret!, credentials.mfaCode)) {
        return { success: false, error: 'MFA_INVALID' };
      }
    }

    // Reset failed attempts and create session
    await this.resetFailedAttempts(user);
    const session = await this.createSession(user, ipAddress, userAgent);

    return { success: true, user, session };
  }

  async logout(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isRevoked = true;
      this.tokenBlacklist.add(session.accessToken);
      this.tokenBlacklist.add(session.refreshToken);
    }
  }

  async refreshSession(refreshToken: string): Promise<AuthResult> {
    // Find session by refresh token
    let targetSession: Session | undefined;
    for (const session of this.sessions.values()) {
      if (session.refreshToken === refreshToken) {
        targetSession = session;
        break;
      }
    }

    if (!targetSession) {
      return { success: false, error: 'TOKEN_INVALID' };
    }

    if (targetSession.isRevoked) {
      return { success: false, error: 'SESSION_REVOKED' };
    }

    if (targetSession.refreshTokenExpiresAt < new Date()) {
      return { success: false, error: 'TOKEN_EXPIRED' };
    }

    const user = this.findUserById(targetSession.userId);
    if (!user) {
      return { success: false, error: 'TOKEN_INVALID' };
    }

    // Rotate tokens
    const newSession = await this.rotateTokens(targetSession, user);

    return { success: true, user, session: newSession };
  }

  // --------------------------------------------------------------------------
  // Token Management
  // --------------------------------------------------------------------------

  async createSession(user: User, ipAddress: string, userAgent: string): Promise<Session> {
    // Enforce max concurrent sessions
    await this.enforceMaxSessions(user.id);

    const now = new Date();
    const accessTokenExpiresAt = new Date(now.getTime() + this.config.accessTokenTTL * 1000);
    const refreshTokenExpiresAt = new Date(now.getTime() + this.config.refreshTokenTTL * 1000);

    const session: Session = {
      id: randomBytes(16).toString('hex'),
      userId: user.id,
      accessToken: this.generateToken(user, 'access', accessTokenExpiresAt),
      refreshToken: this.generateToken(user, 'refresh', refreshTokenExpiresAt),
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      ipAddress,
      userAgent,
      createdAt: now,
      lastActivityAt: now,
      isRevoked: false,
    };

    this.sessions.set(session.id, session);
    user.lastLoginAt = now;

    return session;
  }

  private generateToken(user: User, type: 'access' | 'refresh', expiresAt: Date): string {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      type,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      jti: randomBytes(16).toString('hex'),
    };

    // Simplified JWT creation (in real implementation, use proper JWT library)
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHash('sha256').update(`${header}.${body}`).digest('base64url');

    return `${header}.${body}.${signature}`;
  }

  private async rotateTokens(session: Session, user: User): Promise<Session> {
    // Blacklist old tokens
    this.tokenBlacklist.add(session.accessToken);
    this.tokenBlacklist.add(session.refreshToken);

    const now = new Date();
    const accessTokenExpiresAt = new Date(now.getTime() + this.config.accessTokenTTL * 1000);
    const refreshTokenExpiresAt = new Date(now.getTime() + this.config.refreshTokenTTL * 1000);

    session.accessToken = this.generateToken(user, 'access', accessTokenExpiresAt);
    session.refreshToken = this.generateToken(user, 'refresh', refreshTokenExpiresAt);
    session.accessTokenExpiresAt = accessTokenExpiresAt;
    session.refreshTokenExpiresAt = refreshTokenExpiresAt;
    session.lastActivityAt = now;

    return session;
  }

  // --------------------------------------------------------------------------
  // Authorization
  // --------------------------------------------------------------------------

  hasRole(user: User, requiredRole: Role): boolean {
    return user.roles.includes(requiredRole);
  }

  hasAnyRole(user: User, requiredRoles: Role[]): boolean {
    return requiredRoles.some((role) => user.roles.includes(role));
  }

  hasAllRoles(user: User, requiredRoles: Role[]): boolean {
    return requiredRoles.every((role) => user.roles.includes(role));
  }

  canAccess(user: User, resource: string, action: string): boolean {
    // Superadmin can access everything
    if (user.roles.includes('superadmin')) {
      return true;
    }

    // Define permission matrix
    const permissions: Record<Role, Record<string, string[]>> = {
      user: {
        profile: ['read', 'update'],
        settings: ['read', 'update'],
      },
      moderator: {
        users: ['read'],
        content: ['read', 'update', 'delete'],
      },
      admin: {
        users: ['read', 'update', 'delete'],
        content: ['read', 'create', 'update', 'delete'],
        settings: ['read', 'update'],
      },
      superadmin: {
        '*': ['*'],
      },
    };

    for (const role of user.roles) {
      const rolePerms = permissions[role];
      if (rolePerms?.[resource]?.includes(action)) {
        return true;
      }
    }

    return false;
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private hashPassword(password: string, salt: string): string {
    return createHash('sha512').update(password + salt).digest('hex');
  }

  private verifyPassword(password: string, hash: string, salt: string): boolean {
    const computedHash = this.hashPassword(password, salt);
    return computedHash === hash;
  }

  private validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
  }

  private validatePassword(password: string): void {
    if (password.length < this.config.passwordMinLength) {
      throw new Error(`Password must be at least ${this.config.passwordMinLength} characters`);
    }
    if (this.config.passwordRequireNumbers && !/\d/.test(password)) {
      throw new Error('Password must contain at least one number');
    }
    if (this.config.passwordRequireSymbols && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      throw new Error('Password must contain at least one symbol');
    }
  }

  private verifyMfaCode(secret: string, code: string): boolean {
    // Simplified TOTP verification (use proper library in production)
    // Using SHA-256 instead of SHA-1 for better security
    const timeStep = Math.floor(Date.now() / 30000);
    const expectedCode = createHash('sha256')
      .update(secret + timeStep.toString())
      .digest('hex')
      .slice(0, 6);
    return code === expectedCode;
  }

  private async handleFailedLogin(user: User): Promise<void> {
    user.failedLoginAttempts++;
    user.updatedAt = new Date();

    if (user.failedLoginAttempts >= this.config.maxFailedAttempts) {
      user.lockedUntil = new Date(Date.now() + this.config.lockoutDuration * 1000);
    }
  }

  private async resetFailedAttempts(user: User): Promise<void> {
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.updatedAt = new Date();
  }

  private async enforceMaxSessions(userId: string): Promise<void> {
    const userSessions = Array.from(this.sessions.values())
      .filter((s) => s.userId === userId && !s.isRevoked)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    while (userSessions.length >= this.config.sessionMaxConcurrent) {
      const oldest = userSessions.shift()!;
      oldest.isRevoked = true;
      this.tokenBlacklist.add(oldest.accessToken);
      this.tokenBlacklist.add(oldest.refreshToken);
    }
  }

  isTokenBlacklisted(token: string): boolean {
    return this.tokenBlacklist.has(token);
  }
}
