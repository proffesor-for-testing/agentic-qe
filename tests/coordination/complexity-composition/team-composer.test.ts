/**
 * Tests for Complexity-Driven Team Composer
 */

import { describe, it, expect } from 'vitest';
import {
  TeamComposer,
  type TeamComposition,
  type ComplexityInput,
  type ExtendedDimensions,
} from '../../../src/coordination/complexity-composition/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const TRIVIAL_CODE = `
const add = (a: number, b: number) => a + b;
const subtract = (a: number, b: number) => a - b;
const multiply = (a: number, b: number) => a * b;
`;

const SIMPLE_CODE = `
function greet(name: string): string {
  if (!name) return 'Hello, World!';
  return \`Hello, \${name}!\`;
}

function farewell(name: string): string {
  return \`Goodbye, \${name}!\`;
}

function hello(): string {
  return 'hello';
}
`;

const COMPLEX_AUTH_CODE = `
import crypto from 'crypto';

export class AuthService {
  private secretKey: string;
  private tokenExpiry: number;

  constructor(private readonly db: Database) {
    this.secretKey = process.env.JWT_SECRET || 'default';
    this.tokenExpiry = 3600;
  }

  async authenticate(username: string, password: string): Promise<string> {
    const user = await this.db.findUser(username);
    if (!user) throw new Error('User not found');

    const hash = crypto.createHash('sha256').update(password).digest('hex');
    if (hash !== user.passwordHash) throw new Error('Invalid credentials');

    const token = this.generateJwt(user);
    await this.db.saveSession(user.id, token);
    return token;
  }

  async validateToken(token: string): Promise<boolean> {
    const decoded = this.decodeJwt(token);
    if (!decoded) return false;
    const session = await this.db.findSession(decoded.userId);
    if (!session) return false;
    if (session.expiresAt < Date.now()) return false;
    return true;
  }

  async refreshToken(oldToken: string): Promise<string> {
    const decoded = this.decodeJwt(oldToken);
    if (!decoded) throw new Error('Invalid token');
    const user = await this.db.findUserById(decoded.userId);
    if (!user) throw new Error('User not found');
    return this.generateJwt(user);
  }

  private generateJwt(user: any): string {
    const payload = { userId: user.id, role: user.role };
    return crypto.createHmac('sha256', this.secretKey)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  private decodeJwt(token: string): any {
    try {
      return JSON.parse(Buffer.from(token, 'base64').toString());
    } catch {
      return null;
    }
  }
}
`;

const CONCURRENT_CODE = `
export class WorkerPool {
  private workers: Worker[] = [];
  private mutex = new Mutex();

  async processAll(items: string[]): Promise<string[]> {
    const results = await Promise.all(
      items.map(async (item) => {
        await this.mutex.acquire();
        try {
          const worker = await this.getWorker();
          const result = await worker.process(item);
          return result;
        } finally {
          this.mutex.release();
        }
      })
    );

    setTimeout(() => this.cleanup(), 5000);
    setInterval(() => this.healthCheck(), 30000);
    return results;
  }

  private async getWorker(): Promise<Worker> {
    return new Worker('./worker.js');
  }

  private async cleanup(): Promise<void> {
    await Promise.all(this.workers.map(w => w.terminate()));
  }

  private async healthCheck(): Promise<void> {
    for (const worker of this.workers) {
      await worker.ping();
    }
  }

  async lock(): Promise<void> {
    await this.mutex.acquire();
  }
}
`;

const HIGH_API_SURFACE_CODE = `
export const API_VERSION = '2.0';
export type UserRole = 'admin' | 'user';
export interface User { id: string; name: string; }
export interface Config { debug: boolean; }
export function createUser(name: string): User { return { id: '1', name }; }
export function deleteUser(id: string): void {}
export function updateUser(id: string, name: string): User { return { id, name }; }
export function getUser(id: string): User { return { id, name: 'test' }; }
export class UserService {}
const internalHelper = () => {};
`;

const DATA_FLOW_CODE = `
export function processData(items: number[]): number {
  return items
    .filter(x => x > 0)
    .map(x => x * 2)
    .reduce((sum, x) => sum + x, 0);
}

export function transform(data: string[]): string[] {
  return data
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .flatMap(s => s.split(','))
    .map(s => s.toUpperCase());
}
`;

// ============================================================================
// Trivial/Simple Complexity
// ============================================================================

describe('TeamComposer', () => {
  const composer = new TeamComposer();

  describe('trivial complexity', () => {
    it('should produce trivial category with unit tests only and haiku tier', () => {
      const metrics: ComplexityInput = {
        cyclomatic: 1,
        cognitive: 2,
        linesOfCode: 5,
        maintainabilityIndex: 95,
      };

      const result = composer.compose(metrics, 'smoke', TRIVIAL_CODE);

      expect(result.complexityCategory).toBe('trivial');
      expect(result.testTypes).toEqual(['unit']);
      expect(result.recommendedTier).toBe('haiku');
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].agentType).toBe('qe-test-generator');
    });
  });

  describe('simple complexity', () => {
    it('should produce simple category with unit tests and haiku', () => {
      const metrics: ComplexityInput = {
        cyclomatic: 5,
        cognitive: 7,
        linesOfCode: 40,
        maintainabilityIndex: 80,
      };

      const result = composer.compose(metrics, 'standard', SIMPLE_CODE);

      expect(result.complexityCategory).toBe('simple');
      expect(result.testTypes).toEqual(['unit']);
      expect(result.recommendedTier).toBe('haiku');
      expect(result.agents.length).toBe(1);
    });
  });

  // ============================================================================
  // Moderate Complexity
  // ============================================================================

  describe('moderate complexity', () => {
    it('should produce moderate category with unit+integration and sonnet', () => {
      const metrics: ComplexityInput = {
        cyclomatic: 15,
        cognitive: 18,
        linesOfCode: 150,
        maintainabilityIndex: 55,
      };

      const result = composer.compose(metrics, 'standard', SIMPLE_CODE);

      expect(result.complexityCategory).toBe('moderate');
      expect(result.testTypes).toContain('unit');
      expect(result.testTypes).toContain('integration');
      expect(result.recommendedTier).toBe('sonnet');
      expect(result.agents.some(a => a.agentType === 'qe-test-generator')).toBe(true);
      expect(result.agents.some(a => a.agentType === 'qe-code-intelligence')).toBe(true);
    });
  });

  // ============================================================================
  // Complex Complexity
  // ============================================================================

  describe('complex complexity', () => {
    it('should produce complex category with security agent and sonnet', () => {
      const metrics: ComplexityInput = {
        cyclomatic: 25,
        cognitive: 30,
        linesOfCode: 300,
        maintainabilityIndex: 35,
      };

      const result = composer.compose(metrics, 'deep', SIMPLE_CODE);

      expect(result.complexityCategory).toBe('complex');
      expect(result.testTypes).toContain('unit');
      expect(result.testTypes).toContain('integration');
      expect(result.testTypes).toContain('security');
      expect(result.recommendedTier).toBe('sonnet');
      expect(result.agents.some(a => a.agentType === 'qe-security-scanner')).toBe(true);
    });
  });

  // ============================================================================
  // Critical Complexity
  // ============================================================================

  describe('critical complexity', () => {
    it('should produce critical category with full team and opus', () => {
      const metrics: ComplexityInput = {
        cyclomatic: 35,
        cognitive: 40,
        linesOfCode: 800,
        maintainabilityIndex: 15,
      };

      const result = composer.compose(metrics, 'crisis', COMPLEX_AUTH_CODE);

      expect(result.complexityCategory).toBe('critical');
      expect(result.recommendedTier).toBe('opus');
      expect(result.testTypes).toContain('unit');
      expect(result.testTypes).toContain('integration');
      expect(result.testTypes).toContain('security');
      expect(result.testTypes).toContain('chaos');
      expect(result.testTypes).toContain('performance');
      expect(result.agents.some(a => a.agentType === 'qe-test-generator')).toBe(true);
      expect(result.agents.some(a => a.agentType === 'qe-security-scanner')).toBe(true);
      expect(result.agents.some(a => a.agentType === 'qe-chaos-resilience')).toBe(true);
      expect(result.agents.some(a => a.agentType === 'qe-performance')).toBe(true);
      expect(result.agents.length).toBeGreaterThanOrEqual(5);
    });
  });

  // ============================================================================
  // Extended Dimension Analysis
  // ============================================================================

  describe('analyzeExtendedDimensions', () => {
    it('should detect high security surface from auth/crypto code', () => {
      const dims = composer.analyzeExtendedDimensions(COMPLEX_AUTH_CODE);

      expect(dims.securitySurface).toBeGreaterThan(0.1);
      // The code has password, secret, token, crypto, jwt mentions
      expect(dims.securitySurface).toBeGreaterThan(0);
    });

    it('should detect high concurrency from async/Promise code', () => {
      const dims = composer.analyzeExtendedDimensions(CONCURRENT_CODE);

      expect(dims.concurrency).toBeGreaterThan(0.2);
    });

    it('should detect data flow patterns', () => {
      const dims = composer.analyzeExtendedDimensions(DATA_FLOW_CODE);

      expect(dims.dataFlow).toBeGreaterThan(0);
    });

    it('should detect high API surface from many exports', () => {
      const dims = composer.analyzeExtendedDimensions(HIGH_API_SURFACE_CODE);

      // 9 exports out of 10 declarations (internal is not exported)
      expect(dims.apiSurface).toBeGreaterThan(0.5);
    });

    it('should return low scores for trivial code', () => {
      const dims = composer.analyzeExtendedDimensions(TRIVIAL_CODE);

      expect(dims.securitySurface).toBe(0);
      expect(dims.concurrency).toBe(0);
    });

    it('should clamp all values between 0 and 1', () => {
      const dims = composer.analyzeExtendedDimensions(COMPLEX_AUTH_CODE);

      expect(dims.securitySurface).toBeGreaterThanOrEqual(0);
      expect(dims.securitySurface).toBeLessThanOrEqual(1);
      expect(dims.concurrency).toBeGreaterThanOrEqual(0);
      expect(dims.concurrency).toBeLessThanOrEqual(1);
      expect(dims.dataFlow).toBeGreaterThanOrEqual(0);
      expect(dims.dataFlow).toBeLessThanOrEqual(1);
      expect(dims.apiSurface).toBeGreaterThanOrEqual(0);
      expect(dims.apiSurface).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Dimension-Driven Overrides
  // ============================================================================

  describe('dimension-driven overrides', () => {
    it('should add security scanner for moderate code with high security surface', () => {
      const metrics: ComplexityInput = {
        cyclomatic: 12,
        cognitive: 15,
        linesOfCode: 100,
        maintainabilityIndex: 60,
      };

      // Moderate code normally does not include security scanner
      const baseResult = composer.compose(metrics, 'standard', SIMPLE_CODE);
      expect(baseResult.agents.some(a => a.agentType === 'qe-security-scanner')).toBe(false);

      // Dense security code (> 30% of lines contain security keywords)
      const denseSecurityCode = [
        'const password = getPassword();',
        'const token = generateToken();',
        'const secret = loadSecret();',
        'const jwt = signJwt(payload);',
        'const credential = fetchCredential();',
        'const auth = authenticate(user);',
        'const crypto = initCrypto();',
        'const oauth = setupOAuth();',
        'const result = validate(input);',
        'return result;',
      ].join('\n');

      const secResult = composer.compose(metrics, 'standard', denseSecurityCode);
      expect(secResult.agents.some(a => a.agentType === 'qe-security-scanner')).toBe(true);
      expect(secResult.testTypes).toContain('security');
    });

    it('should add chaos agent for moderate code with high concurrency', () => {
      const metrics: ComplexityInput = {
        cyclomatic: 12,
        cognitive: 15,
        linesOfCode: 100,
        maintainabilityIndex: 60,
      };

      const result = composer.compose(metrics, 'standard', CONCURRENT_CODE);
      expect(result.agents.some(a => a.agentType === 'qe-chaos-resilience')).toBe(true);
      expect(result.testTypes).toContain('chaos');
    });

    it('should add integration test type for high API surface', () => {
      const metrics: ComplexityInput = {
        cyclomatic: 2,
        cognitive: 3,
        linesOfCode: 20,
        maintainabilityIndex: 90,
      };

      const result = composer.compose(metrics, 'smoke', HIGH_API_SURFACE_CODE);
      // trivial category normally only has 'unit'
      expect(result.testTypes).toContain('integration');
    });
  });

  // ============================================================================
  // Determinism
  // ============================================================================

  describe('determinism', () => {
    it('should produce identical results for the same input', () => {
      const metrics: ComplexityInput = {
        cyclomatic: 20,
        cognitive: 25,
        linesOfCode: 200,
        maintainabilityIndex: 40,
      };

      const result1 = composer.compose(metrics, 'standard', COMPLEX_AUTH_CODE);
      const result2 = composer.compose(metrics, 'standard', COMPLEX_AUTH_CODE);

      expect(result1.complexityCategory).toBe(result2.complexityCategory);
      expect(result1.recommendedTier).toBe(result2.recommendedTier);
      expect(result1.testTypes).toEqual(result2.testTypes);
      expect(result1.agents.length).toBe(result2.agents.length);
      for (let i = 0; i < result1.agents.length; i++) {
        expect(result1.agents[i].agentType).toBe(result2.agents[i].agentType);
        expect(result1.agents[i].priority).toBe(result2.agents[i].priority);
      }
    });
  });

  // ============================================================================
  // Custom Config
  // ============================================================================

  describe('custom configuration', () => {
    it('should accept custom security keywords', () => {
      const custom = new TeamComposer({
        securityKeywords: ['xyzSpecialKeyword'],
      });

      const codeWithCustomKw = 'const x = xyzSpecialKeyword;\nconst y = 1;\nconst z = 2;';
      const dims = custom.analyzeExtendedDimensions(codeWithCustomKw);
      expect(dims.securitySurface).toBeGreaterThan(0);

      // Default composer should not detect it
      const defaultDims = composer.analyzeExtendedDimensions(codeWithCustomKw);
      expect(defaultDims.securitySurface).toBe(0);
    });
  });

  // ============================================================================
  // Agent Priority Ordering
  // ============================================================================

  describe('agent priority ordering', () => {
    it('should sort agents by priority (lower number first)', () => {
      const metrics: ComplexityInput = {
        cyclomatic: 35,
        cognitive: 40,
        linesOfCode: 800,
        maintainabilityIndex: 15,
      };

      const result = composer.compose(metrics, 'crisis', COMPLEX_AUTH_CODE);
      for (let i = 1; i < result.agents.length; i++) {
        expect(result.agents[i].priority).toBeGreaterThanOrEqual(result.agents[i - 1].priority);
      }
    });
  });
});
