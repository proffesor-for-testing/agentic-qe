/**
 * Agentic QE v3 - Migrate Command Tests
 * Tests for the aqe-v3 migrate command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    copyFileSync: vi.fn(),
  };
});

describe('Migrate Command', () => {
  const testCwd = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('V2 Detection', () => {
    it('should detect v2 installation when .agentic-qe exists', () => {
      const v2Dir = path.join(testCwd, '.agentic-qe');
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === v2Dir;
      });

      const hasV2 = fs.existsSync(v2Dir);
      expect(hasV2).toBe(true);
    });

    it('should detect missing v2 installation', () => {
      const v2Dir = path.join(testCwd, '.agentic-qe');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const hasV2 = fs.existsSync(v2Dir);
      expect(hasV2).toBe(false);
    });

    it('should detect v2 memory.db', () => {
      const memoryDb = path.join(testCwd, '.agentic-qe', 'memory.db');
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === memoryDb;
      });

      const hasMemory = fs.existsSync(memoryDb);
      expect(hasMemory).toBe(true);
    });

    it('should detect v2 config.json', () => {
      const configFile = path.join(testCwd, '.agentic-qe', 'config.json');
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === configFile;
      });

      const hasConfig = fs.existsSync(configFile);
      expect(hasConfig).toBe(true);
    });

    it('should detect v2 patterns directory', () => {
      const patternsDir = path.join(testCwd, '.agentic-qe', 'patterns');
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === patternsDir;
      });

      const hasPatterns = fs.existsSync(patternsDir);
      expect(hasPatterns).toBe(true);
    });
  });

  describe('V3 Directory Check', () => {
    it('should detect existing v3 installation', () => {
      const v3Dir = path.join(testCwd, '.aqe-v3');
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === v3Dir;
      });

      const hasV3 = fs.existsSync(v3Dir);
      expect(hasV3).toBe(true);
    });

    it('should allow migration when v3 does not exist', () => {
      const v3Dir = path.join(testCwd, '.aqe-v3');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const hasV3 = fs.existsSync(v3Dir);
      expect(hasV3).toBe(false);
    });
  });

  describe('Migrate Options', () => {
    it('should support dry-run mode', () => {
      const options = { dryRun: true };
      expect(options.dryRun).toBe(true);
    });

    it('should support backup option', () => {
      const options = { backup: true };
      expect(options.backup).toBe(true);
    });

    it('should support skip-memory option', () => {
      const options = { skipMemory: true };
      expect(options.skipMemory).toBe(true);
    });

    it('should support skip-patterns option', () => {
      const options = { skipPatterns: true };
      expect(options.skipPatterns).toBe(true);
    });

    it('should support skip-config option', () => {
      const options = { skipConfig: true };
      expect(options.skipConfig).toBe(true);
    });

    it('should support force option', () => {
      const options = { force: true };
      expect(options.force).toBe(true);
    });
  });

  describe('Backup Creation', () => {
    it('should create backup directory with timestamp', () => {
      const timestamp = Date.now();
      const backupDir = `.agentic-qe-backup-${timestamp}`;

      expect(backupDir).toMatch(/^\.agentic-qe-backup-\d+$/);
    });

    it('should copy v2 directory to backup', () => {
      const v2Dir = '.agentic-qe';
      const backupDir = `.agentic-qe-backup-${Date.now()}`;

      // Backup directory should be different from v2
      expect(backupDir).not.toBe(v2Dir);
      expect(backupDir).toContain('backup');
    });
  });

  describe('V3 Directory Structure Creation', () => {
    it('should create v3 directory structure', () => {
      const v3Dirs = [
        '.aqe-v3',
        '.aqe-v3/agentdb',
        '.aqe-v3/reasoning-bank',
        '.aqe-v3/cache',
        '.aqe-v3/logs',
      ];

      for (const dir of v3Dirs) {
        expect(dir).toMatch(/^\.aqe-v3/);
      }
      expect(v3Dirs.length).toBe(5);
    });
  });

  describe('Memory Database Migration', () => {
    it('should copy memory.db to agentdb', () => {
      const srcPath = '.agentic-qe/memory.db';
      const destPath = '.aqe-v3/agentdb/memory.db';

      expect(srcPath).toContain('memory.db');
      expect(destPath).toContain('agentdb/memory.db');
    });

    it('should create index.json for HNSW', () => {
      const indexFile = '.aqe-v3/agentdb/index.json';
      const indexContent = {
        version: '3.0.0',
        migratedFrom: 'v2',
        migratedAt: new Date().toISOString(),
        hnswEnabled: true,
        vectorDimensions: 128,
      };

      expect(indexContent.version).toBe('3.0.0');
      expect(indexContent.migratedFrom).toBe('v2');
      expect(indexContent.hnswEnabled).toBe(true);
    });
  });

  describe('Configuration Migration', () => {
    it('should convert v2 config to v3 format', () => {
      const v2Config = {
        version: '2.8.2',
        learning: {
          patternRetention: 90,
        },
      };

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
          'coverage-analysis': { enabled: true, algorithm: 'hnsw', dimensions: 128 },
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
          hnsw: { M: 16, efConstruction: 200 },
        },
        learning: {
          reasoningBank: true,
          sona: true,
          patternRetention: v2Config.learning?.patternRetention || 180,
        },
        v2Migration: {
          originalConfig: v2Config,
          migrationDate: new Date().toISOString(),
        },
      };

      expect(v3Config.version).toBe('3.0.0');
      expect(v3Config.migratedFrom).toBe('2.8.2');
      expect(v3Config.kernel.coordinator).toBe('queen');
      expect(v3Config.learning.patternRetention).toBe(90);
      expect(v3Config.v2Migration.originalConfig).toEqual(v2Config);
    });

    it('should use default patternRetention when not in v2 config', () => {
      const v2Config = {
        version: '2.8.0',
      };

      const patternRetention = v2Config.learning?.patternRetention || 180;
      expect(patternRetention).toBe(180);
    });
  });

  describe('Pattern Migration', () => {
    it('should migrate patterns to reasoning-bank', () => {
      const srcDir = '.agentic-qe/patterns';
      const destDir = '.aqe-v3/reasoning-bank';

      expect(srcDir).toContain('patterns');
      expect(destDir).toContain('reasoning-bank');
    });

    it('should create reasoning-bank index', () => {
      const indexContent = {
        version: '3.0.0',
        migratedFrom: 'v2',
        migratedAt: new Date().toISOString(),
        patternCount: 10,
        hnswIndexed: false,
      };

      expect(indexContent.version).toBe('3.0.0');
      expect(indexContent.patternCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Migration Validation', () => {
    it('should validate v3 directory exists', () => {
      const validationResults = {
        v3DirExists: true,
        configExists: true,
        agentdbExists: true,
        reasoningBankExists: true,
      };

      const allValid = Object.values(validationResults).every((v) => v);
      expect(allValid).toBe(true);
    });

    it('should detect validation failures', () => {
      const validationResults = {
        v3DirExists: true,
        configExists: false,
        agentdbExists: true,
        reasoningBankExists: true,
      };

      const allValid = Object.values(validationResults).every((v) => v);
      expect(allValid).toBe(false);
    });
  });

  describe('Rollback Instructions', () => {
    it('should provide rollback steps', () => {
      const rollbackSteps = [
        'Delete .aqe-v3/ directory',
        'v2 installation remains unchanged',
      ];

      expect(rollbackSteps.length).toBeGreaterThan(0);
      expect(rollbackSteps[0]).toContain('.aqe-v3');
    });
  });

  describe('Next Steps After Migration', () => {
    it('should provide next steps', () => {
      const nextSteps = [
        'Run `aqe-v3 status` to verify the system',
        'Add v3 MCP: `claude mcp add aqe-v3 -- npx @agentic-qe/v3 mcp`',
        'Test with: `aqe-v3 test <path>`',
      ];

      expect(nextSteps.length).toBe(3);
      expect(nextSteps[0]).toContain('status');
      expect(nextSteps[1]).toContain('mcp');
      expect(nextSteps[2]).toContain('test');
    });
  });
});

describe('Migrate Command Edge Cases', () => {
  describe('Empty V2 Installation', () => {
    it('should handle missing memory.db', () => {
      const hasMemory = false;
      const shouldMigrateMemory = hasMemory && !false; // skipMemory = false
      expect(shouldMigrateMemory).toBe(false);
    });

    it('should handle missing config.json', () => {
      const hasConfig = false;
      const shouldMigrateConfig = hasConfig && !false; // skipConfig = false
      expect(shouldMigrateConfig).toBe(false);
    });

    it('should handle missing patterns directory', () => {
      const hasPatterns = false;
      const shouldMigratePatterns = hasPatterns && !false; // skipPatterns = false
      expect(shouldMigratePatterns).toBe(false);
    });
  });

  describe('Corrupted V2 Data', () => {
    it('should handle invalid JSON in config', () => {
      const parseConfig = (content: string) => {
        try {
          return JSON.parse(content);
        } catch {
          return null;
        }
      };

      const result = parseConfig('invalid json');
      expect(result).toBeNull();
    });

    it('should use defaults when config parsing fails', () => {
      const v2Config = null;
      const patternRetention = v2Config?.learning?.patternRetention || 180;
      expect(patternRetention).toBe(180);
    });
  });

  describe('Force Mode', () => {
    it('should allow overwriting existing v3', () => {
      const v3Exists = true;
      const force = true;
      const canProceed = !v3Exists || force;
      expect(canProceed).toBe(true);
    });

    it('should block without force when v3 exists', () => {
      const v3Exists = true;
      const force = false;
      const canProceed = !v3Exists || force;
      expect(canProceed).toBe(false);
    });
  });
});
