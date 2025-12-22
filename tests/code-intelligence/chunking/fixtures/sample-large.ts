/**
 * Large TypeScript File Fixture for Chunking Tests
 *
 * Purpose: Test AST chunker's ability to handle large files (500+ lines)
 * with complex nested structures, multiple classes, interfaces, and functions.
 *
 * Tests:
 * - Recursive splitting of large entities
 * - Semantic boundary preservation across many functions
 * - Performance with deep nesting
 * - Metadata accuracy for complex relationships
 */

/**
 * User management interface hierarchy
 */
export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  profile: UserProfile;
  settings: UserSettings;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'admin' | 'moderator' | 'user' | 'guest';

export interface UserProfile {
  firstName: string;
  lastName: string;
  avatar?: string;
  bio?: string;
  location?: string;
  website?: string;
  socialLinks?: {
    twitter?: string;
    github?: string;
    linkedin?: string;
  };
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'auto';
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  language: string;
  timezone: string;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
  frequency: 'realtime' | 'daily' | 'weekly';
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'private' | 'friends';
  showEmail: boolean;
  showLocation: boolean;
  allowMessaging: boolean;
}

/**
 * Data Transfer Objects
 */
export interface CreateUserDTO {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
  profile?: Partial<UserProfile>;
}

export interface UpdateUserDTO {
  username?: string;
  email?: string;
  role?: UserRole;
  profile?: Partial<UserProfile>;
  settings?: Partial<UserSettings>;
}

export interface UserFilterDTO {
  role?: UserRole;
  createdAfter?: Date;
  createdBefore?: Date;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Main UserService class with comprehensive user management functionality
 *
 * This class demonstrates:
 * - Multiple public and private methods
 * - Async operations
 * - Complex error handling
 * - Nested business logic
 */
export class UserService {
  private users: Map<string, User> = new Map();
  private emailIndex: Map<string, string> = new Map();
  private usernameIndex: Map<string, string> = new Map();
  private roleIndex: Map<UserRole, Set<string>> = new Map();

  constructor(private readonly config: ServiceConfig) {
    this.initializeIndexes();
  }

  /**
   * Initialize all internal indexes
   */
  private initializeIndexes(): void {
    this.roleIndex.set('admin', new Set());
    this.roleIndex.set('moderator', new Set());
    this.roleIndex.set('user', new Set());
    this.roleIndex.set('guest', new Set());
  }

  /**
   * Create a new user with validation
   */
  public async createUser(data: CreateUserDTO): Promise<User> {
    // Validate input
    this.validateCreateUserData(data);

    // Check for existing user
    if (this.emailIndex.has(data.email)) {
      throw new Error(`User with email ${data.email} already exists`);
    }

    if (this.usernameIndex.has(data.username)) {
      throw new Error(`Username ${data.username} is already taken`);
    }

    // Hash password
    const hashedPassword = await this.hashPassword(data.password);

    // Create user object
    const user: User = {
      id: this.generateUserId(),
      username: data.username,
      email: data.email,
      role: data.role || 'user',
      profile: {
        firstName: '',
        lastName: '',
        ...data.profile,
      },
      settings: this.getDefaultSettings(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store user
    this.users.set(user.id, user);
    this.emailIndex.set(user.email, user.id);
    this.usernameIndex.set(user.username, user.id);
    this.roleIndex.get(user.role)?.add(user.id);

    // Trigger events
    await this.onUserCreated(user);

    return user;
  }

  /**
   * Get user by ID
   */
  public async getUserById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  /**
   * Get user by email
   */
  public async getUserByEmail(email: string): Promise<User | null> {
    const userId = this.emailIndex.get(email);
    return userId ? this.getUserById(userId) : null;
  }

  /**
   * Get user by username
   */
  public async getUserByUsername(username: string): Promise<User | null> {
    const userId = this.usernameIndex.get(username);
    return userId ? this.getUserById(userId) : null;
  }

  /**
   * Update user with partial data
   */
  public async updateUser(id: string, data: UpdateUserDTO): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User ${id} not found`);
    }

    // Handle username change
    if (data.username && data.username !== user.username) {
      if (this.usernameIndex.has(data.username)) {
        throw new Error(`Username ${data.username} is already taken`);
      }
      this.usernameIndex.delete(user.username);
      this.usernameIndex.set(data.username, user.id);
      user.username = data.username;
    }

    // Handle email change
    if (data.email && data.email !== user.email) {
      if (this.emailIndex.has(data.email)) {
        throw new Error(`Email ${data.email} is already in use`);
      }
      this.emailIndex.delete(user.email);
      this.emailIndex.set(data.email, user.id);
      user.email = data.email;
    }

    // Handle role change
    if (data.role && data.role !== user.role) {
      this.roleIndex.get(user.role)?.delete(user.id);
      this.roleIndex.get(data.role)?.add(user.id);
      user.role = data.role;
    }

    // Update profile
    if (data.profile) {
      user.profile = { ...user.profile, ...data.profile };
    }

    // Update settings
    if (data.settings) {
      user.settings = { ...user.settings, ...data.settings };
    }

    user.updatedAt = new Date();

    await this.onUserUpdated(user);

    return { ...user };
  }

  /**
   * Delete user by ID
   */
  public async deleteUser(id: string): Promise<boolean> {
    const user = this.users.get(id);
    if (!user) {
      return false;
    }

    // Remove from indexes
    this.emailIndex.delete(user.email);
    this.usernameIndex.delete(user.username);
    this.roleIndex.get(user.role)?.delete(user.id);

    // Remove user
    this.users.delete(id);

    await this.onUserDeleted(user);

    return true;
  }

  /**
   * Find users with filters
   */
  public async findUsers(filter: UserFilterDTO): Promise<User[]> {
    let users = Array.from(this.users.values());

    // Filter by role
    if (filter.role) {
      const roleUserIds = this.roleIndex.get(filter.role);
      if (roleUserIds) {
        users = users.filter(u => roleUserIds.has(u.id));
      }
    }

    // Filter by creation date
    if (filter.createdAfter) {
      users = users.filter(u => u.createdAt >= filter.createdAfter!);
    }

    if (filter.createdBefore) {
      users = users.filter(u => u.createdAt <= filter.createdBefore!);
    }

    // Search filter
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      users = users.filter(u =>
        u.username.toLowerCase().includes(searchLower) ||
        u.email.toLowerCase().includes(searchLower) ||
        u.profile.firstName?.toLowerCase().includes(searchLower) ||
        u.profile.lastName?.toLowerCase().includes(searchLower)
      );
    }

    // Pagination
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const start = (page - 1) * limit;
    const end = start + limit;

    return users.slice(start, end).map(u => ({ ...u }));
  }

  /**
   * Count users by role
   */
  public getUserCountByRole(role: UserRole): number {
    return this.roleIndex.get(role)?.size || 0;
  }

  /**
   * Get total user count
   */
  public getTotalUserCount(): number {
    return this.users.size;
  }

  /**
   * Validate user data
   */
  private validateCreateUserData(data: CreateUserDTO): void {
    if (!data.username || data.username.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }

    if (!data.email || !this.isValidEmail(data.email)) {
      throw new Error('Invalid email address');
    }

    if (!data.password || data.password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
  }

  /**
   * Email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Generate unique user ID
   */
  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Hash password (mock implementation)
   */
  private async hashPassword(password: string): Promise<string> {
    // In real implementation, use bcrypt or similar
    return `hashed_${password}`;
  }

  /**
   * Get default user settings
   */
  private getDefaultSettings(): UserSettings {
    return {
      theme: 'auto',
      notifications: {
        email: true,
        push: true,
        sms: false,
        frequency: 'realtime',
      },
      privacy: {
        profileVisibility: 'public',
        showEmail: false,
        showLocation: false,
        allowMessaging: true,
      },
      language: 'en',
      timezone: 'UTC',
    };
  }

  /**
   * Event handlers
   */
  private async onUserCreated(user: User): Promise<void> {
    console.log(`User created: ${user.id}`);
    // Emit events, send notifications, etc.
  }

  private async onUserUpdated(user: User): Promise<void> {
    console.log(`User updated: ${user.id}`);
  }

  private async onUserDeleted(user: User): Promise<void> {
    console.log(`User deleted: ${user.id}`);
  }
}

/**
 * Configuration interface
 */
interface ServiceConfig {
  maxUsers?: number;
  enableLogging?: boolean;
  enableMetrics?: boolean;
}

/**
 * Utility functions for user management
 */
export class UserUtils {
  /**
   * Format user display name
   */
  public static formatDisplayName(user: User): string {
    if (user.profile.firstName && user.profile.lastName) {
      return `${user.profile.firstName} ${user.profile.lastName}`;
    }
    return user.username;
  }

  /**
   * Check if user is admin
   */
  public static isAdmin(user: User): boolean {
    return user.role === 'admin';
  }

  /**
   * Check if user is moderator or admin
   */
  public static isModerator(user: User): boolean {
    return user.role === 'admin' || user.role === 'moderator';
  }

  /**
   * Calculate user age (if DOB in profile)
   */
  public static calculateAccountAge(user: User): number {
    const now = new Date();
    const created = new Date(user.createdAt);
    const diffMs = now.getTime() - created.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24)); // Days
  }

  /**
   * Sanitize user data for public display
   */
  public static sanitizeForPublic(user: User): Partial<User> {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      profile: {
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        avatar: user.profile.avatar,
        bio: user.profile.bio,
      },
    };
  }
}

/**
 * Export everything
 */
export default UserService;
