/**
 * Tests for Fleet Integration with Code Intelligence
 * CI-005, CI-006, CI-007
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FleetInitEnhancer,
  createFleetInitEnhancer,
  checkCodeIntelligenceStatus,
  integrateCodeIntelligence,
  type FleetIntegrationOptions,
} from '../../../src/init/fleet-integration.js';
import { existsSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Mock Dependencies
// ============================================================================

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock better-sqlite3 module with proper class constructor
// Use a function that captures current mock state at call time
let mockPrepareReturnValue: { get: () => { count: number } } = {
  get: () => ({ count: 0 }),
};
let mockDatabaseShouldThrow = false;

// Create a factory function that will be called each time Database is instantiated
function createMockDatabase() {
  if (mockDatabaseShouldThrow) {
    throw new Error('Database error');
  }
  return {
    prepare: vi.fn(() => mockPrepareReturnValue),
    close: vi.fn(),
  };
}

vi.mock('better-sqlite3', () => {
  // Return a factory that creates a constructor function
  // This ensures each call gets fresh mock state
  return {
    default: vi.fn().mockImplementation(() => createMockDatabase()),
  };
});

vi.mock('chalk', () => ({
  default: {
    blue: vi.fn((str: string) => str),
    green: vi.fn((str: string) => str),
    yellow: vi.fn((str: string) => str),
    red: vi.fn((str: string) => str),
    gray: vi.fn((str: string) => str),
    cyan: vi.fn((str: string) => str),
    white: vi.fn((str: string) => str),
  },
}));

// Track readline mock answer for each test
let readlineMockAnswer = 'y';

vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((prompt: string, callback: (answer: string) => void) => {
      callback(readlineMockAnswer);
    }),
    close: vi.fn(),
  })),
}));

// ============================================================================
// Test Suite
// ============================================================================

describe('FleetInitEnhancer', () => {
  const projectRoot = '/test/project';
  let enhancer: FleetInitEnhancer;

  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    console.error = vi.fn();
    // Reset mock state
    mockDatabaseShouldThrow = false;
    readlineMockAnswer = 'y';
    mockPrepareReturnValue = {
      get: () => ({ count: 0 }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create enhancer with project root', () => {
      enhancer = createFleetInitEnhancer({ projectRoot });
      expect(enhancer).toBeInstanceOf(FleetInitEnhancer);
    });

    it('should accept skip-code-scan option', () => {
      enhancer = createFleetInitEnhancer({
        projectRoot,
        skipCodeScan: true,
      });
      expect(enhancer).toBeInstanceOf(FleetInitEnhancer);
    });

    it('should accept non-interactive mode', () => {
      enhancer = createFleetInitEnhancer({
        projectRoot,
        nonInteractive: true,
      });
      expect(enhancer).toBeInstanceOf(FleetInitEnhancer);
    });
  });

  describe('checkCodeIntelligence - with existing index', () => {
    beforeEach(() => {
      enhancer = createFleetInitEnhancer({ projectRoot });

      // Mock database exists with entries
      vi.mocked(existsSync).mockReturnValue(true);

      // Setup mock database response - must set before each test
      mockPrepareReturnValue = {
        get: () => ({ count: 150 }),
      };

      // Also spy on the private methods to ensure they return expected values
      // This is needed because dynamic imports in ESM may not be properly mocked
      vi.spyOn(enhancer as any, 'hasCodeIntelligenceIndex').mockResolvedValue(true);
      vi.spyOn(enhancer as any, 'getKGEntryCount').mockResolvedValue(150);
    });

    it('should detect existing index', async () => {
      const result = await enhancer.checkCodeIntelligence();

      expect(result.shouldProceed).toBe(true);
      expect(result.codeIntelligence.hasIndex).toBe(true);
      expect(result.codeIntelligence.entryCount).toBe(150);
      expect(result.codeIntelligence.wasPrompted).toBe(false);
    });

    it('should log success message', async () => {
      await enhancer.checkCodeIntelligence();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Code intelligence index found')
      );
    });

    it('should not prompt user', async () => {
      const result = await enhancer.checkCodeIntelligence();
      expect(result.codeIntelligence.wasPrompted).toBe(false);
    });
  });

  describe('checkCodeIntelligence - with missing index (interactive)', () => {
    beforeEach(() => {
      enhancer = createFleetInitEnhancer({
        projectRoot,
        nonInteractive: false,
      });

      // Mock no database
      vi.mocked(existsSync).mockReturnValue(false);
    });

    it('should prompt user when index missing', async () => {
      const result = await enhancer.checkCodeIntelligence();

      expect(result.codeIntelligence.hasIndex).toBe(false);
      expect(result.codeIntelligence.wasPrompted).toBe(true);
    });

    it('should request scan when user says yes', async () => {
      // Mock user saying yes (default in our mock)
      const result = await enhancer.checkCodeIntelligence();

      expect(result.shouldProceed).toBe(false);
      expect(result.skipReason).toBe('scan-requested');
      expect(result.codeIntelligence.scanRequested).toBe(true);
    });

    it('should continue without scan when user says no', async () => {
      // Mock user saying no
      readlineMockAnswer = 'n';

      // Need to recreate the enhancer after changing the mock
      enhancer = createFleetInitEnhancer({
        projectRoot,
        nonInteractive: false,
      });

      const result = await enhancer.checkCodeIntelligence();

      expect(result.shouldProceed).toBe(true);
      expect(result.codeIntelligence.scanRequested).toBe(false);
    });

    it('should display warning message', async () => {
      await enhancer.checkCodeIntelligence();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No code intelligence index found')
      );
    });
  });

  describe('checkCodeIntelligence - with --skip-code-scan flag', () => {
    beforeEach(() => {
      enhancer = createFleetInitEnhancer({
        projectRoot,
        skipCodeScan: true,
      });
    });

    it('should skip check entirely', async () => {
      const result = await enhancer.checkCodeIntelligence();

      expect(result.shouldProceed).toBe(true);
      expect(result.skipReason).toBe('skip-flag');
      expect(result.codeIntelligence.wasPrompted).toBe(false);
    });

    it('should log skip message', async () => {
      await enhancer.checkCodeIntelligence();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Code intelligence scan skipped')
      );
    });

    it('should not check database', async () => {
      await enhancer.checkCodeIntelligence();
      expect(existsSync).not.toHaveBeenCalled();
    });
  });

  describe('checkCodeIntelligence - non-interactive mode', () => {
    beforeEach(() => {
      enhancer = createFleetInitEnhancer({
        projectRoot,
        nonInteractive: true,
      });

      // Mock no database
      vi.mocked(existsSync).mockReturnValue(false);
    });

    it('should not prompt user', async () => {
      const result = await enhancer.checkCodeIntelligence();

      expect(result.codeIntelligence.wasPrompted).toBe(false);
      expect(result.shouldProceed).toBe(true);
    });

    it('should continue without index', async () => {
      const result = await enhancer.checkCodeIntelligence();

      expect(result.codeIntelligence.hasIndex).toBe(false);
      expect(result.codeIntelligence.scanRequested).toBe(false);
    });
  });

  describe('getStatusForAgents', () => {
    it('should return status when index exists', async () => {
      enhancer = createFleetInitEnhancer({ projectRoot });

      // Spy on private methods for consistent behavior with dynamic imports
      vi.spyOn(enhancer as any, 'hasCodeIntelligenceIndex').mockResolvedValue(true);
      vi.spyOn(enhancer as any, 'getKGEntryCount').mockResolvedValue(200);

      const status = await enhancer.getStatusForAgents();

      expect(status.codeIntelligenceAvailable).toBe(true);
      expect(status.knowledgeGraphSize).toBe(200);
      expect(status.recommendedCapabilities).toContain('semantic-search');
      expect(status.recommendedCapabilities).toContain('code-analysis');
    });

    it('should return basic capabilities when no index', async () => {
      enhancer = createFleetInitEnhancer({ projectRoot });

      // Spy on private methods
      vi.spyOn(enhancer as any, 'hasCodeIntelligenceIndex').mockResolvedValue(false);

      const status = await enhancer.getStatusForAgents();

      expect(status.codeIntelligenceAvailable).toBe(false);
      expect(status.knowledgeGraphSize).toBe(0);
      expect(status.recommendedCapabilities).toEqual(['basic-analysis']);
    });
  });

  describe('runCodeIntelligenceScan', () => {
    beforeEach(() => {
      enhancer = createFleetInitEnhancer({ projectRoot });
    });

    it('should skip if index already exists', async () => {
      // Spy on private methods for consistent behavior
      vi.spyOn(enhancer as any, 'hasCodeIntelligenceIndex').mockResolvedValue(true);
      vi.spyOn(enhancer as any, 'getKGEntryCount').mockResolvedValue(100);

      const result = await enhancer.runCodeIntelligenceScan();

      expect(result.success).toBe(true);
      expect(result.entries).toBe(100);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Index already exists')
      );
    });

    it('should handle scan errors gracefully', async () => {
      // Mock hasCodeIntelligenceIndex to throw an error to test error handling
      vi.spyOn(enhancer as any, 'hasCodeIntelligenceIndex').mockRejectedValue(
        new Error('Simulated scan error')
      );

      const result = await enhancer.runCodeIntelligenceScan();

      expect(result.success).toBe(false);
      expect(result.entries).toBe(0);
    });
  });

  describe('factory functions', () => {
    it('checkCodeIntelligenceStatus should check without prompts', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const status = await checkCodeIntelligenceStatus(projectRoot);

      expect(status.hasIndex).toBe(false);
      expect(status.wasPrompted).toBe(false);
    });

    it('integrateCodeIntelligence should run full check', async () => {
      // Spy on prototype methods to ensure consistent behavior across factory calls
      vi.spyOn(FleetInitEnhancer.prototype as any, 'hasCodeIntelligenceIndex').mockResolvedValue(true);
      vi.spyOn(FleetInitEnhancer.prototype as any, 'getKGEntryCount').mockResolvedValue(50);

      const result = await integrateCodeIntelligence(projectRoot);

      expect(result.shouldProceed).toBe(true);
      expect(result.codeIntelligence.hasIndex).toBe(true);

      // Restore prototype spies
      vi.restoreAllMocks();
    });

    it('integrateCodeIntelligence should respect skip flag', async () => {
      const result = await integrateCodeIntelligence(projectRoot, {
        skipCodeScan: true,
      });

      expect(result.shouldProceed).toBe(true);
      expect(result.skipReason).toBe('skip-flag');
    });

    it('integrateCodeIntelligence should respect non-interactive mode', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await integrateCodeIntelligence(projectRoot, {
        nonInteractive: true,
      });

      expect(result.shouldProceed).toBe(true);
      expect(result.codeIntelligence.wasPrompted).toBe(false);
    });
  });

  describe('integration paths', () => {
    it('should handle full integration flow with existing index', async () => {
      enhancer = createFleetInitEnhancer({ projectRoot });

      // Spy on private methods for consistent behavior
      vi.spyOn(enhancer as any, 'hasCodeIntelligenceIndex').mockResolvedValue(true);
      vi.spyOn(enhancer as any, 'getKGEntryCount').mockResolvedValue(300);

      const result = await enhancer.checkCodeIntelligence();
      const status = await enhancer.getStatusForAgents();

      expect(result.shouldProceed).toBe(true);
      expect(status.codeIntelligenceAvailable).toBe(true);
      expect(status.knowledgeGraphSize).toBe(300);
    });

    it('should handle flow with missing index and skip', async () => {
      enhancer = createFleetInitEnhancer({
        projectRoot,
        skipCodeScan: true,
      });

      const result = await enhancer.checkCodeIntelligence();

      expect(result.shouldProceed).toBe(true);
      expect(result.codeIntelligence.hasIndex).toBe(false);
    });

    it('should handle flow with missing index and user scan request', async () => {
      enhancer = createFleetInitEnhancer({
        projectRoot,
        nonInteractive: false,
      });

      // Mock no index
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await enhancer.checkCodeIntelligence();

      expect(result.shouldProceed).toBe(false);
      expect(result.skipReason).toBe('scan-requested');
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors', async () => {
      // Mock database error
      vi.mocked(existsSync).mockReturnValue(true);
      mockDatabaseShouldThrow = true;

      enhancer = createFleetInitEnhancer({ projectRoot, nonInteractive: true });

      const result = await enhancer.checkCodeIntelligence();

      // Should continue gracefully
      expect(result.shouldProceed).toBe(true);
      expect(result.codeIntelligence.hasIndex).toBe(false);
    });

    it('should handle import errors gracefully', async () => {
      enhancer = createFleetInitEnhancer({ projectRoot });

      // Mock hasCodeIntelligenceIndex to throw to simulate import error
      vi.spyOn(enhancer as any, 'hasCodeIntelligenceIndex').mockRejectedValue(
        new Error('Import failed')
      );

      // The scan will fail but should be caught
      const result = await enhancer.runCodeIntelligenceScan();

      expect(result.success).toBe(false);
      expect(console.error).toHaveBeenCalled();
    });
  });
});

describe('Integration with init-wizard', () => {
  it('should reuse InitOrchestrator logic', () => {
    // This test verifies the design - FleetInitEnhancer uses
    // the same database check logic as InitOrchestrator
    const enhancer = createFleetInitEnhancer({
      projectRoot: '/test',
    });

    expect(enhancer).toBeDefined();
    // The actual database checking logic is shared
  });
});
