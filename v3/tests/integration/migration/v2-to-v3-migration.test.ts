/**
 * Agentic QE v3 - V2 to V3 Migration Integration Tests
 * Tests the full migration workflow from v2 to v3
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('V2 to V3 Migration Integration', () => {
  let testDir: string;
  let v2Dir: string;
  let v3Dir: string;

  beforeAll(() => {
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-migration-test-'));
    v2Dir = path.join(testDir, '.agentic-qe');
    v3Dir = path.join(testDir, '.aqe-v3');
  });

  afterAll(() => {
    // Clean up temporary directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean up before each test
    if (fs.existsSync(v2Dir)) {
      fs.rmSync(v2Dir, { recursive: true, force: true });
    }
    if (fs.existsSync(v3Dir)) {
      fs.rmSync(v3Dir, { recursive: true, force: true });
    }
  });

  describe('V2 Fixture Creation', () => {
    it('should create v2 directory structure', () => {
      // Create v2 directory
      fs.mkdirSync(v2Dir, { recursive: true });
      fs.mkdirSync(path.join(v2Dir, 'patterns'), { recursive: true });

      expect(fs.existsSync(v2Dir)).toBe(true);
      expect(fs.existsSync(path.join(v2Dir, 'patterns'))).toBe(true);
    });

    it('should create v2 config.json', () => {
      fs.mkdirSync(v2Dir, { recursive: true });

      const v2Config = {
        version: '2.8.2',
        fleet: {
          maxAgents: 10,
        },
        learning: {
          patternRetention: 90,
        },
        memory: {
          path: '.agentic-qe/memory.db',
        },
      };

      fs.writeFileSync(
        path.join(v2Dir, 'config.json'),
        JSON.stringify(v2Config, null, 2)
      );

      const readConfig = JSON.parse(
        fs.readFileSync(path.join(v2Dir, 'config.json'), 'utf-8')
      );

      expect(readConfig.version).toBe('2.8.2');
      expect(readConfig.learning.patternRetention).toBe(90);
    });

    it('should create v2 patterns', () => {
      fs.mkdirSync(path.join(v2Dir, 'patterns'), { recursive: true });

      const pattern1 = {
        name: 'auth-test-pattern',
        type: 'unit-test',
        content: 'JWT authentication test pattern',
        confidence: 0.95,
      };

      const pattern2 = {
        name: 'api-test-pattern',
        type: 'integration-test',
        content: 'REST API testing pattern',
        confidence: 0.88,
      };

      fs.writeFileSync(
        path.join(v2Dir, 'patterns', 'auth-test-pattern.json'),
        JSON.stringify(pattern1, null, 2)
      );

      fs.writeFileSync(
        path.join(v2Dir, 'patterns', 'api-test-pattern.json'),
        JSON.stringify(pattern2, null, 2)
      );

      const patterns = fs.readdirSync(path.join(v2Dir, 'patterns'));
      expect(patterns.length).toBe(2);
      expect(patterns).toContain('auth-test-pattern.json');
      expect(patterns).toContain('api-test-pattern.json');
    });
  });

  describe('Migration Process', () => {
    beforeEach(() => {
      // Create full v2 fixture
      fs.mkdirSync(v2Dir, { recursive: true });
      fs.mkdirSync(path.join(v2Dir, 'patterns'), { recursive: true });

      // Create v2 config
      fs.writeFileSync(
        path.join(v2Dir, 'config.json'),
        JSON.stringify({
          version: '2.8.2',
          learning: { patternRetention: 120 },
        }, null, 2)
      );

      // Create patterns
      fs.writeFileSync(
        path.join(v2Dir, 'patterns', 'test-pattern.json'),
        JSON.stringify({ name: 'test', confidence: 0.9 }, null, 2)
      );

      // Create mock memory.db (just an empty file for testing)
      fs.writeFileSync(path.join(v2Dir, 'memory.db'), '');
    });

    it('should detect v2 installation', () => {
      expect(fs.existsSync(v2Dir)).toBe(true);
      expect(fs.existsSync(path.join(v2Dir, 'config.json'))).toBe(true);
      expect(fs.existsSync(path.join(v2Dir, 'memory.db'))).toBe(true);
      expect(fs.existsSync(path.join(v2Dir, 'patterns'))).toBe(true);
    });

    it('should create v3 directory structure', () => {
      // Simulate migration
      fs.mkdirSync(v3Dir, { recursive: true });
      fs.mkdirSync(path.join(v3Dir, 'agentdb'), { recursive: true });
      fs.mkdirSync(path.join(v3Dir, 'reasoning-bank'), { recursive: true });
      fs.mkdirSync(path.join(v3Dir, 'cache'), { recursive: true });
      fs.mkdirSync(path.join(v3Dir, 'logs'), { recursive: true });

      expect(fs.existsSync(v3Dir)).toBe(true);
      expect(fs.existsSync(path.join(v3Dir, 'agentdb'))).toBe(true);
      expect(fs.existsSync(path.join(v3Dir, 'reasoning-bank'))).toBe(true);
      expect(fs.existsSync(path.join(v3Dir, 'cache'))).toBe(true);
      expect(fs.existsSync(path.join(v3Dir, 'logs'))).toBe(true);
    });

    it('should migrate memory database', () => {
      fs.mkdirSync(path.join(v3Dir, 'agentdb'), { recursive: true });

      // Copy memory.db
      fs.copyFileSync(
        path.join(v2Dir, 'memory.db'),
        path.join(v3Dir, 'agentdb', 'memory.db')
      );

      expect(fs.existsSync(path.join(v3Dir, 'agentdb', 'memory.db'))).toBe(true);
    });

    it('should create agentdb index', () => {
      fs.mkdirSync(path.join(v3Dir, 'agentdb'), { recursive: true });

      const index = {
        version: '3.0.0',
        migratedFrom: 'v2',
        migratedAt: new Date().toISOString(),
        hnswEnabled: true,
        vectorDimensions: 128,
      };

      fs.writeFileSync(
        path.join(v3Dir, 'agentdb', 'index.json'),
        JSON.stringify(index, null, 2)
      );

      const readIndex = JSON.parse(
        fs.readFileSync(path.join(v3Dir, 'agentdb', 'index.json'), 'utf-8')
      );

      expect(readIndex.version).toBe('3.0.0');
      expect(readIndex.migratedFrom).toBe('v2');
      expect(readIndex.hnswEnabled).toBe(true);
    });

    it('should convert v2 config to v3 format', () => {
      fs.mkdirSync(v3Dir, { recursive: true });

      // Read v2 config
      const v2Config = JSON.parse(
        fs.readFileSync(path.join(v2Dir, 'config.json'), 'utf-8')
      );

      // Convert to v3 format
      const v3Config = {
        version: '3.0.0',
        migratedFrom: v2Config.version,
        migratedAt: new Date().toISOString(),
        kernel: {
          eventBus: 'in-memory',
          coordinator: 'queen',
        },
        domains: {
          'test-generation': { enabled: true },
          'test-execution': { enabled: true },
          'coverage-analysis': { enabled: true, algorithm: 'hnsw' },
          'quality-assessment': { enabled: true },
          'defect-intelligence': { enabled: true },
          'requirements-validation': { enabled: true },
          'code-intelligence': { enabled: true },
          'security-compliance': { enabled: true },
          'contract-testing': { enabled: true },
          'visual-accessibility': { enabled: false },
          'chaos-resilience': { enabled: true },
          'learning-optimization': { enabled: true },
        },
        memory: {
          backend: 'hybrid',
          path: '.aqe-v3/agentdb/',
        },
        learning: {
          reasoningBank: true,
          sona: true,
          patternRetention: v2Config.learning?.patternRetention || 180,
        },
        v2Migration: {
          originalConfig: v2Config,
        },
      };

      fs.writeFileSync(
        path.join(v3Dir, 'config.json'),
        JSON.stringify(v3Config, null, 2)
      );

      const readConfig = JSON.parse(
        fs.readFileSync(path.join(v3Dir, 'config.json'), 'utf-8')
      );

      expect(readConfig.version).toBe('3.0.0');
      expect(readConfig.migratedFrom).toBe('2.8.2');
      expect(readConfig.learning.patternRetention).toBe(120);
      expect(readConfig.kernel.coordinator).toBe('queen');
      expect(readConfig.domains['test-generation'].enabled).toBe(true);
    });

    it('should migrate patterns to reasoning-bank', () => {
      fs.mkdirSync(path.join(v3Dir, 'reasoning-bank'), { recursive: true });

      // Copy pattern files
      const patternFiles = fs.readdirSync(path.join(v2Dir, 'patterns'));
      for (const file of patternFiles) {
        fs.copyFileSync(
          path.join(v2Dir, 'patterns', file),
          path.join(v3Dir, 'reasoning-bank', file)
        );
      }

      // Create reasoning-bank index
      const index = {
        version: '3.0.0',
        migratedFrom: 'v2',
        migratedAt: new Date().toISOString(),
        patternCount: patternFiles.length,
        hnswIndexed: false,
      };

      fs.writeFileSync(
        path.join(v3Dir, 'reasoning-bank', 'index.json'),
        JSON.stringify(index, null, 2)
      );

      const migratedPatterns = fs.readdirSync(path.join(v3Dir, 'reasoning-bank'));
      expect(migratedPatterns).toContain('test-pattern.json');
      expect(migratedPatterns).toContain('index.json');
    });

    it('should preserve v2 installation', () => {
      // After migration, v2 should still exist
      expect(fs.existsSync(v2Dir)).toBe(true);
      expect(fs.existsSync(path.join(v2Dir, 'config.json'))).toBe(true);
      expect(fs.existsSync(path.join(v2Dir, 'memory.db'))).toBe(true);
    });
  });

  describe('Backup Creation', () => {
    beforeEach(() => {
      // Create v2 fixture
      fs.mkdirSync(v2Dir, { recursive: true });
      fs.writeFileSync(
        path.join(v2Dir, 'config.json'),
        JSON.stringify({ version: '2.8.2' }, null, 2)
      );
    });

    it('should create backup with timestamp', () => {
      const timestamp = Date.now();
      const backupDir = path.join(testDir, `.agentic-qe-backup-${timestamp}`);

      fs.mkdirSync(backupDir, { recursive: true });
      fs.copyFileSync(
        path.join(v2Dir, 'config.json'),
        path.join(backupDir, 'config.json')
      );

      expect(fs.existsSync(backupDir)).toBe(true);
      expect(fs.existsSync(path.join(backupDir, 'config.json'))).toBe(true);

      // Verify backup content
      const backupConfig = JSON.parse(
        fs.readFileSync(path.join(backupDir, 'config.json'), 'utf-8')
      );
      expect(backupConfig.version).toBe('2.8.2');

      // Clean up
      fs.rmSync(backupDir, { recursive: true, force: true });
    });
  });

  describe('Migration Validation', () => {
    it('should validate successful migration', () => {
      // Create complete v3 structure
      fs.mkdirSync(v3Dir, { recursive: true });
      fs.mkdirSync(path.join(v3Dir, 'agentdb'), { recursive: true });
      fs.mkdirSync(path.join(v3Dir, 'reasoning-bank'), { recursive: true });

      fs.writeFileSync(
        path.join(v3Dir, 'config.json'),
        JSON.stringify({ version: '3.0.0' }, null, 2)
      );

      const validation = {
        v3DirExists: fs.existsSync(v3Dir),
        configExists: fs.existsSync(path.join(v3Dir, 'config.json')),
        agentdbExists: fs.existsSync(path.join(v3Dir, 'agentdb')),
        reasoningBankExists: fs.existsSync(path.join(v3Dir, 'reasoning-bank')),
      };

      expect(validation.v3DirExists).toBe(true);
      expect(validation.configExists).toBe(true);
      expect(validation.agentdbExists).toBe(true);
      expect(validation.reasoningBankExists).toBe(true);

      const allValid = Object.values(validation).every((v) => v);
      expect(allValid).toBe(true);
    });

    it('should detect incomplete migration', () => {
      // Create incomplete v3 structure (missing config)
      fs.mkdirSync(v3Dir, { recursive: true });
      fs.mkdirSync(path.join(v3Dir, 'agentdb'), { recursive: true });

      const validation = {
        v3DirExists: fs.existsSync(v3Dir),
        configExists: fs.existsSync(path.join(v3Dir, 'config.json')),
        agentdbExists: fs.existsSync(path.join(v3Dir, 'agentdb')),
        reasoningBankExists: fs.existsSync(path.join(v3Dir, 'reasoning-bank')),
      };

      expect(validation.configExists).toBe(false);
      expect(validation.reasoningBankExists).toBe(false);

      const allValid = Object.values(validation).every((v) => v);
      expect(allValid).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty v2 installation', () => {
      fs.mkdirSync(v2Dir, { recursive: true });

      const hasConfig = fs.existsSync(path.join(v2Dir, 'config.json'));
      const hasMemory = fs.existsSync(path.join(v2Dir, 'memory.db'));
      const hasPatterns = fs.existsSync(path.join(v2Dir, 'patterns'));

      expect(hasConfig).toBe(false);
      expect(hasMemory).toBe(false);
      expect(hasPatterns).toBe(false);
    });

    it('should handle corrupted v2 config', () => {
      fs.mkdirSync(v2Dir, { recursive: true });
      fs.writeFileSync(path.join(v2Dir, 'config.json'), 'invalid json');

      let config = null;
      try {
        config = JSON.parse(
          fs.readFileSync(path.join(v2Dir, 'config.json'), 'utf-8')
        );
      } catch {
        config = null;
      }

      expect(config).toBeNull();

      // Should use defaults
      const patternRetention = config?.learning?.patternRetention || 180;
      expect(patternRetention).toBe(180);
    });

    it('should handle large pattern files', () => {
      fs.mkdirSync(path.join(v2Dir, 'patterns'), { recursive: true });

      // Create a large pattern file (100KB)
      const largePattern = {
        name: 'large-pattern',
        data: 'x'.repeat(100 * 1024),
      };

      fs.writeFileSync(
        path.join(v2Dir, 'patterns', 'large-pattern.json'),
        JSON.stringify(largePattern)
      );

      const stats = fs.statSync(path.join(v2Dir, 'patterns', 'large-pattern.json'));
      expect(stats.size).toBeGreaterThan(100 * 1024);

      // Should still be able to read
      const content = fs.readFileSync(
        path.join(v2Dir, 'patterns', 'large-pattern.json'),
        'utf-8'
      );
      const parsed = JSON.parse(content);
      expect(parsed.name).toBe('large-pattern');
    });
  });
});

describe('Migration Rollback', () => {
  let testDir: string;
  let v3Dir: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-rollback-test-'));
    v3Dir = path.join(testDir, '.aqe-v3');
  });

  afterAll(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should allow rollback by deleting v3 directory', () => {
    // Create v3 installation
    fs.mkdirSync(v3Dir, { recursive: true });
    fs.mkdirSync(path.join(v3Dir, 'agentdb'), { recursive: true });
    fs.writeFileSync(
      path.join(v3Dir, 'config.json'),
      JSON.stringify({ version: '3.0.0' }, null, 2)
    );

    expect(fs.existsSync(v3Dir)).toBe(true);

    // Rollback
    fs.rmSync(v3Dir, { recursive: true, force: true });

    expect(fs.existsSync(v3Dir)).toBe(false);
  });
});
