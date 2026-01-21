/**
 * Unit tests for ComponentBoundaryAnalyzer
 */

import { ComponentBoundaryAnalyzer } from '../../../src/code-intelligence/inference/ComponentBoundaryAnalyzer';
import type { Component, ComponentRelationship } from '../../../src/code-intelligence/inference/types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fast-glob
jest.mock('fast-glob');
import fg from 'fast-glob';
const mockFg = fg as jest.MockedFunction<typeof fg>;

// Mock fs/promises
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ComponentBoundaryAnalyzer', () => {
  const rootDir = '/test/src';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Detection', () => {
    it('should detect layered architecture components', async () => {
      // Mock file system structure
      mockFg.mockResolvedValue([
        '/test/src/controllers/UserController.ts',
        '/test/src/controllers/AuthController.ts',
        '/test/src/services/UserService.ts',
        '/test/src/services/AuthService.ts',
        '/test/src/repositories/UserRepository.ts',
        '/test/src/repositories/AuthRepository.ts',
      ]);

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: false,
        minFilesPerComponent: 2,
      });

      const result = await analyzer.analyze();

      expect(result.components).toHaveLength(3);
      expect(result.components.map(c => c.type)).toEqual(['layer', 'layer', 'layer']);

      const componentNames = result.components.map(c => c.name).sort();
      expect(componentNames).toContain('Controllers');
      expect(componentNames).toContain('Services');
      expect(componentNames).toContain('Repositories');
    });

    it('should detect feature-based components', async () => {
      mockFg.mockResolvedValue([
        '/test/src/features/user/controller.ts',
        '/test/src/features/user/service.ts',
        '/test/src/features/user/repository.ts',
        '/test/src/features/auth/controller.ts',
        '/test/src/features/auth/service.ts',
        '/test/src/features/auth/repository.ts',
      ]);

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: false,
        minFilesPerComponent: 2,
      });

      const result = await analyzer.analyze();

      expect(result.components).toHaveLength(2);
      expect(result.components.every(c => c.type === 'feature')).toBe(true);
    });

    it('should respect minFilesPerComponent threshold', async () => {
      mockFg.mockResolvedValue([
        '/test/src/controllers/UserController.ts',
        '/test/src/controllers/AuthController.ts',
        '/test/src/services/UserService.ts',
        '/test/src/services/AuthService.ts',
        '/test/src/utils/helper.ts', // Only 1 file in utils
      ]);

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: false,
        minFilesPerComponent: 2,
      });

      const result = await analyzer.analyze();

      expect(result.components).toHaveLength(2);
      expect(result.components.map(c => c.name)).not.toContain('Utils');
    });

    it('should detect technology from file extensions', async () => {
      mockFg.mockResolvedValue([
        '/test/src/controllers/UserController.ts',
        '/test/src/controllers/AuthController.tsx',
      ]);

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: false,
        minFilesPerComponent: 1,
      });

      const result = await analyzer.analyze();

      const component = result.components[0];
      expect(component.technology).toMatch(/TypeScript/);
    });
  });

  describe('Relationship Analysis', () => {
    beforeEach(() => {
      mockFg.mockResolvedValue([
        '/test/src/controllers/UserController.ts',
        '/test/src/controllers/AuthController.ts',
        '/test/src/services/UserService.ts',
        '/test/src/services/AuthService.ts',
      ]);
    });

    it('should analyze import relationships', async () => {
      // Mock file contents with imports
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.includes('UserController.ts')) {
          return "import { UserService } from '../services/UserService';\n";
        }
        if (filePath.includes('AuthController.ts')) {
          return "import { AuthService } from '../services/AuthService';\n";
        }
        return '';
      });

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: true,
        minFilesPerComponent: 2,
      });

      const result = await analyzer.analyze();

      expect(result.relationships.length).toBeGreaterThan(0);
      expect(result.relationships[0]).toHaveProperty('sourceId');
      expect(result.relationships[0]).toHaveProperty('targetId');
      expect(result.relationships[0]).toHaveProperty('type');
      expect(result.relationships[0].type).toBe('uses');
    });

    it('should skip external package imports', async () => {
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.includes('UserController.ts')) {
          return "import express from 'express';\nimport { UserService } from '../services/UserService';\n";
        }
        return '';
      });

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: true,
        minFilesPerComponent: 2,
      });

      const result = await analyzer.analyze();

      // Should only have internal relationships, not to 'express'
      result.relationships.forEach(rel => {
        expect(rel.sourceId).not.toContain('express');
        expect(rel.targetId).not.toContain('express');
      });
    });

    it('should handle require statements', async () => {
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.includes('UserController.ts')) {
          return "const { UserService } = require('../services/UserService');\n";
        }
        return '';
      });

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: true,
        minFilesPerComponent: 2,
      });

      const result = await analyzer.analyze();

      expect(result.relationships.length).toBeGreaterThan(0);
    });

    it('should prevent duplicate relationships', async () => {
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.includes('UserController.ts')) {
          // Multiple imports from same service
          return "import { UserService } from '../services/UserService';\nimport { User } from '../services/UserService';\n";
        }
        return '';
      });

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: true,
        minFilesPerComponent: 2,
      });

      const result = await analyzer.analyze();

      // Should have unique relationships only
      const relationshipKeys = result.relationships.map(r => `${r.sourceId}->${r.targetId}`);
      const uniqueKeys = new Set(relationshipKeys);
      expect(relationshipKeys.length).toBe(uniqueKeys.size);
    });
  });

  describe('Component Metadata', () => {
    it('should include component responsibilities for layers', async () => {
      mockFg.mockResolvedValue([
        '/test/src/controllers/UserController.ts',
        '/test/src/controllers/AuthController.ts',
      ]);

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: false,
        minFilesPerComponent: 2,
      });

      const result = await analyzer.analyze();

      const component = result.components[0];
      expect(component.responsibilities).toBeDefined();
      expect(component.responsibilities!.length).toBeGreaterThan(0);
    });

    it('should include file paths relative to rootDir', async () => {
      mockFg.mockResolvedValue([
        '/test/src/controllers/UserController.ts',
        '/test/src/controllers/AuthController.ts',
      ]);

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: false,
        minFilesPerComponent: 2,
      });

      const result = await analyzer.analyze();

      const component = result.components[0];
      expect(component.files).toBeDefined();
      component.files.forEach(file => {
        expect(file).not.toContain('/test/src');
        expect(file).toContain('controllers/');
      });
    });

    it('should include analysis metadata', async () => {
      mockFg.mockResolvedValue([
        '/test/src/controllers/UserController.ts',
        '/test/src/controllers/AuthController.ts',
      ]);

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: false,
        minFilesPerComponent: 2,
      });

      const result = await analyzer.analyze();

      expect(result.metadata).toBeDefined();
      expect(result.metadata.timestamp).toBeGreaterThan(0);
      expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.filesAnalyzed).toBeGreaterThan(0);
    });
  });

  describe('Configuration', () => {
    it('should use custom exclude patterns', async () => {
      mockFg.mockResolvedValue([
        '/test/src/controllers/UserController.ts',
      ]);

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: false,
        excludePatterns: ['**/*.test.ts', '**/*.custom.ts'],
      });

      await analyzer.analyze();

      expect(mockFg).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          ignore: expect.arrayContaining(['**/*.custom.ts']),
        })
      );
    });

    it('should respect maxDepth configuration', async () => {
      mockFg.mockResolvedValue([
        '/test/src/a/b/c/d/e/f/deep.ts',
        '/test/src/a/b/c/d/e/f/deeper.ts',
      ]);

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: false,
        maxDepth: 3,
        minFilesPerComponent: 1,
      });

      const result = await analyzer.analyze();

      // Should not detect components at depth > 3
      expect(result.components.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty codebase', async () => {
      mockFg.mockResolvedValue([]);

      const analyzer = new ComponentBoundaryAnalyzer(rootDir);
      const result = await analyzer.analyze();

      expect(result.components).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });

    it('should handle file read errors gracefully', async () => {
      mockFg.mockResolvedValue([
        '/test/src/controllers/UserController.ts',
        '/test/src/controllers/AuthController.ts',
      ]);

      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: true,
        minFilesPerComponent: 2,
      });

      // Should not throw
      await expect(analyzer.analyze()).resolves.toBeDefined();
    });

    it('should generate unique component IDs', async () => {
      mockFg.mockResolvedValue([
        '/test/src/controllers/UserController.ts',
        '/test/src/controllers/AuthController.ts',
        '/test/src/services/UserService.ts',
        '/test/src/services/AuthService.ts',
      ]);

      const analyzer = new ComponentBoundaryAnalyzer(rootDir, {
        analyzeImports: false,
        minFilesPerComponent: 2,
      });

      const result = await analyzer.analyze();

      const ids = result.components.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });
  });
});
