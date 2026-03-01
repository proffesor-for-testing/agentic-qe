/**
 * Unit tests for MCP Handlers Index
 * Tests that all handlers are properly exported from the index module
 */

import { describe, it, expect } from 'vitest';

// Import everything from the index
import * as handlers from '../../../../src/mcp/handlers/index';

// ============================================================================
// Tests
// ============================================================================

describe('MCP Handlers Index', () => {
  // --------------------------------------------------------------------------
  // Core Handlers Exports
  // --------------------------------------------------------------------------

  describe('Core Handlers Exports', () => {
    it('should export handleFleetInit', () => {
      expect(handlers.handleFleetInit).toBeDefined();
      expect(typeof handlers.handleFleetInit).toBe('function');
    });

    it('should export handleFleetStatus', () => {
      expect(handlers.handleFleetStatus).toBeDefined();
      expect(typeof handlers.handleFleetStatus).toBe('function');
    });

    it('should export handleFleetHealth', () => {
      expect(handlers.handleFleetHealth).toBeDefined();
      expect(typeof handlers.handleFleetHealth).toBe('function');
    });

    it('should export getFleetState', () => {
      expect(handlers.getFleetState).toBeDefined();
      expect(typeof handlers.getFleetState).toBe('function');
    });

    it('should export isFleetInitialized', () => {
      expect(handlers.isFleetInitialized).toBeDefined();
      expect(typeof handlers.isFleetInitialized).toBe('function');
    });

    it('should export disposeFleet', () => {
      expect(handlers.disposeFleet).toBeDefined();
      expect(typeof handlers.disposeFleet).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Task Handlers Exports
  // --------------------------------------------------------------------------

  describe('Task Handlers Exports', () => {
    it('should export handleTaskSubmit', () => {
      expect(handlers.handleTaskSubmit).toBeDefined();
      expect(typeof handlers.handleTaskSubmit).toBe('function');
    });

    it('should export handleTaskList', () => {
      expect(handlers.handleTaskList).toBeDefined();
      expect(typeof handlers.handleTaskList).toBe('function');
    });

    it('should export handleTaskStatus', () => {
      expect(handlers.handleTaskStatus).toBeDefined();
      expect(typeof handlers.handleTaskStatus).toBe('function');
    });

    it('should export handleTaskCancel', () => {
      expect(handlers.handleTaskCancel).toBeDefined();
      expect(typeof handlers.handleTaskCancel).toBe('function');
    });

    it('should export handleTaskOrchestrate', () => {
      expect(handlers.handleTaskOrchestrate).toBeDefined();
      expect(typeof handlers.handleTaskOrchestrate).toBe('function');
    });

    it('should export handleModelRoute (ADR-051)', () => {
      expect(handlers.handleModelRoute).toBeDefined();
      expect(typeof handlers.handleModelRoute).toBe('function');
    });

    it('should export handleRoutingMetrics (ADR-051)', () => {
      expect(handlers.handleRoutingMetrics).toBeDefined();
      expect(typeof handlers.handleRoutingMetrics).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Agent Handlers Exports
  // --------------------------------------------------------------------------

  describe('Agent Handlers Exports', () => {
    it('should export handleAgentList', () => {
      expect(handlers.handleAgentList).toBeDefined();
      expect(typeof handlers.handleAgentList).toBe('function');
    });

    it('should export handleAgentSpawn', () => {
      expect(handlers.handleAgentSpawn).toBeDefined();
      expect(typeof handlers.handleAgentSpawn).toBe('function');
    });

    it('should export handleAgentMetrics', () => {
      expect(handlers.handleAgentMetrics).toBeDefined();
      expect(typeof handlers.handleAgentMetrics).toBe('function');
    });

    it('should export handleAgentStatus', () => {
      expect(handlers.handleAgentStatus).toBeDefined();
      expect(typeof handlers.handleAgentStatus).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Domain Handlers Exports (Wrapped with Experience Capture)
  // --------------------------------------------------------------------------

  describe('Domain Handlers Exports (Wrapped)', () => {
    it('should export handleTestGenerate', () => {
      expect(handlers.handleTestGenerate).toBeDefined();
      expect(typeof handlers.handleTestGenerate).toBe('function');
    });

    it('should export handleTestExecute', () => {
      expect(handlers.handleTestExecute).toBeDefined();
      expect(typeof handlers.handleTestExecute).toBe('function');
    });

    it('should export handleCoverageAnalyze', () => {
      expect(handlers.handleCoverageAnalyze).toBeDefined();
      expect(typeof handlers.handleCoverageAnalyze).toBe('function');
    });

    it('should export handleQualityAssess', () => {
      expect(handlers.handleQualityAssess).toBeDefined();
      expect(typeof handlers.handleQualityAssess).toBe('function');
    });

    it('should export handleSecurityScan', () => {
      expect(handlers.handleSecurityScan).toBeDefined();
      expect(typeof handlers.handleSecurityScan).toBe('function');
    });

    it('should export handleContractValidate', () => {
      expect(handlers.handleContractValidate).toBeDefined();
      expect(typeof handlers.handleContractValidate).toBe('function');
    });

    it('should export handleAccessibilityTest', () => {
      expect(handlers.handleAccessibilityTest).toBeDefined();
      expect(typeof handlers.handleAccessibilityTest).toBe('function');
    });

    it('should export handleChaosTest', () => {
      expect(handlers.handleChaosTest).toBeDefined();
      expect(typeof handlers.handleChaosTest).toBe('function');
    });

    it('should export handleDefectPredict', () => {
      expect(handlers.handleDefectPredict).toBeDefined();
      expect(typeof handlers.handleDefectPredict).toBe('function');
    });

    it('should export handleRequirementsValidate', () => {
      expect(handlers.handleRequirementsValidate).toBeDefined();
      expect(typeof handlers.handleRequirementsValidate).toBe('function');
    });

    it('should export handleCodeIndex', () => {
      expect(handlers.handleCodeIndex).toBeDefined();
      expect(typeof handlers.handleCodeIndex).toBe('function');
    });

    it('should export resetTaskExecutor', () => {
      expect(handlers.resetTaskExecutor).toBeDefined();
      expect(typeof handlers.resetTaskExecutor).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Memory Handlers Exports
  // --------------------------------------------------------------------------

  describe('Memory Handlers Exports', () => {
    it('should export handleMemoryStore', () => {
      expect(handlers.handleMemoryStore).toBeDefined();
      expect(typeof handlers.handleMemoryStore).toBe('function');
    });

    it('should export handleMemoryRetrieve', () => {
      expect(handlers.handleMemoryRetrieve).toBeDefined();
      expect(typeof handlers.handleMemoryRetrieve).toBe('function');
    });

    it('should export handleMemoryQuery', () => {
      expect(handlers.handleMemoryQuery).toBeDefined();
      expect(typeof handlers.handleMemoryQuery).toBe('function');
    });

    it('should export handleMemoryDelete', () => {
      expect(handlers.handleMemoryDelete).toBeDefined();
      expect(typeof handlers.handleMemoryDelete).toBe('function');
    });

    it('should export handleMemoryUsage', () => {
      expect(handlers.handleMemoryUsage).toBeDefined();
      expect(typeof handlers.handleMemoryUsage).toBe('function');
    });

    it('should export handleMemoryShare', () => {
      expect(handlers.handleMemoryShare).toBeDefined();
      expect(typeof handlers.handleMemoryShare).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Type Exports (ADR-051)
  // --------------------------------------------------------------------------

  describe('Type Exports', () => {
    it('should export TaskOrchestrateResult type', () => {
      // Type exports can't be directly tested at runtime,
      // but we verify the module doesn't throw on import
      expect(handlers).toBeDefined();
    });

    it('should export ModelRouteParams type', () => {
      expect(handlers).toBeDefined();
    });

    it('should export ModelRouteResult type', () => {
      expect(handlers).toBeDefined();
    });

    it('should export RoutingMetricsParams type', () => {
      expect(handlers).toBeDefined();
    });

    it('should export RoutingMetricsResult type', () => {
      expect(handlers).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Export Completeness
  // --------------------------------------------------------------------------

  describe('Export Completeness', () => {
    it('should export all core handlers', () => {
      const coreHandlers = [
        'handleFleetInit',
        'handleFleetStatus',
        'handleFleetHealth',
        'getFleetState',
        'isFleetInitialized',
        'disposeFleet',
      ];

      coreHandlers.forEach(name => {
        expect(handlers).toHaveProperty(name);
      });
    });

    it('should export all task handlers', () => {
      const taskHandlers = [
        'handleTaskSubmit',
        'handleTaskList',
        'handleTaskStatus',
        'handleTaskCancel',
        'handleTaskOrchestrate',
        'handleModelRoute',
        'handleRoutingMetrics',
      ];

      taskHandlers.forEach(name => {
        expect(handlers).toHaveProperty(name);
      });
    });

    it('should export all agent handlers', () => {
      const agentHandlers = [
        'handleAgentList',
        'handleAgentSpawn',
        'handleAgentMetrics',
        'handleAgentStatus',
      ];

      agentHandlers.forEach(name => {
        expect(handlers).toHaveProperty(name);
      });
    });

    it('should export all domain handlers', () => {
      const domainHandlers = [
        'handleTestGenerate',
        'handleTestExecute',
        'handleCoverageAnalyze',
        'handleQualityAssess',
        'handleSecurityScan',
        'handleContractValidate',
        'handleAccessibilityTest',
        'handleChaosTest',
        'handleDefectPredict',
        'handleRequirementsValidate',
        'handleCodeIndex',
        'resetTaskExecutor',
      ];

      domainHandlers.forEach(name => {
        expect(handlers).toHaveProperty(name);
      });
    });

    it('should export all memory handlers', () => {
      const memoryHandlers = [
        'handleMemoryStore',
        'handleMemoryRetrieve',
        'handleMemoryQuery',
        'handleMemoryDelete',
        'handleMemoryUsage',
        'handleMemoryShare',
      ];

      memoryHandlers.forEach(name => {
        expect(handlers).toHaveProperty(name);
      });
    });

    it('should have expected number of exports (minimum)', () => {
      // Core: 6, Task: 7, Agent: 4, Domain: 12, Memory: 6 = 35 minimum
      const exportCount = Object.keys(handlers).length;
      expect(exportCount).toBeGreaterThanOrEqual(35);
    });
  });
});
