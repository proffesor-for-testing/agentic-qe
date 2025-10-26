/**
 * MCP Server Tests
 *
 * Tests for MCP server initialization, tool registration, and error handling
 * Coverage target: 95%+
 *
 * Test scenarios:
 * 1. Server startup without errors
 * 2. Tools module import and exports validation
 * 3. MCP tool registration and discovery
 * 4. Error handling for missing dependencies
 * 5. Server lifecycle management
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@mcp/tools/index.js');

describe('MCP Server', () => {
  let mockServer: jest.Mocked<Server>;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create mock server instance
    mockServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn(),
      close: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('Server Initialization', () => {
    it('should start MCP server without errors', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

      // Act
      const { default: startServer } = await import('../../../src/mcp/server.js');
      await expect(startServer()).resolves.not.toThrow();

      // Assert
      expect(Server).toHaveBeenCalledTimes(1);
      expect(mockServer.setRequestHandler).toHaveBeenCalled();
    });

    it('should initialize with correct server configuration', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

      // Act
      const { default: startServer } = await import('../../../src/mcp/server.js');
      await startServer();

      // Assert
      expect(Server).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.any(String),
          version: expect.any(String),
        }),
        expect.any(Object)
      );
    });

    it('should handle server initialization errors gracefully', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const initError = new Error('Server initialization failed');
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => {
        throw initError;
      });

      // Act & Assert
      const { default: startServer } = await import('../../../src/mcp/server.js');
      await expect(startServer()).rejects.toThrow('Server initialization failed');
    });

    it('should set up error handlers', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

      // Act
      const { default: startServer } = await import('../../../src/mcp/server.js');
      await startServer();

      // Assert - verify error handlers are registered
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function)
      );
    });
  });

  describe('Tools Module Import and Exports', () => {
    it('should import tools module without errors', async () => {
      // Act & Assert
      await expect(import('../../../src/mcp/tools/index.js')).resolves.toBeDefined();
    });

    it('should export all required tool functions', async () => {
      // Arrange
      const expectedExports = [
        'testGenerate',
        'testExecute',
        'coverageAnalyze',
        'qualityAnalyze',
        'securityScan',
        'performanceTest',
      ];

      // Act
      const toolsModule = await import('../../../src/mcp/tools/index.js');

      // Assert
      expectedExports.forEach(exportName => {
        expect(toolsModule).toHaveProperty(exportName);
        expect(typeof (toolsModule as any)[exportName]).toBe('function');
      });
    });

    it('should export tool schemas', async () => {
      // Act
      const toolsModule = await import('../../../src/mcp/tools/index.js');

      // Assert
      expect(toolsModule).toHaveProperty('toolSchemas');
      expect(Array.isArray((toolsModule as any).toolSchemas)).toBe(true);
      expect((toolsModule as any).toolSchemas.length).toBeGreaterThan(0);
    });

    it('should have valid tool schema structure', async () => {
      // Act
      const toolsModule = await import('../../../src/mcp/tools/index.js');
      const schemas = (toolsModule as any).toolSchemas;

      // Assert
      schemas.forEach((schema: any) => {
        expect(schema).toHaveProperty('name');
        expect(schema).toHaveProperty('description');
        expect(schema).toHaveProperty('inputSchema');
        expect(typeof schema.name).toBe('string');
        expect(typeof schema.description).toBe('string');
        expect(typeof schema.inputSchema).toBe('object');
      });
    });

    it('should handle missing tools gracefully', async () => {
      // Arrange
      jest.doMock('../../../src/mcp/tools/index.js', () => {
        throw new Error('Tools module not found');
      });

      // Act & Assert
      await expect(import('../../../src/mcp/tools/index.js')).rejects.toThrow();
    });
  });

  describe('MCP Tool Registration', () => {
    it('should register all tools with the server', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

      const toolsModule = await import('../../../src/mcp/tools/index.js');
      const expectedToolCount = (toolsModule as any).toolSchemas?.length || 6;

      // Act
      const { default: startServer } = await import('../../../src/mcp/server.js');
      await startServer();

      // Assert
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(expectedToolCount + 1); // +1 for list_tools handler
    });

    it('should register tools/list handler', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

      // Act
      const { default: startServer } = await import('../../../src/mcp/server.js');
      await startServer();

      // Assert
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        'tools/list',
        expect.any(Function)
      );
    });

    it('should register tools/call handler', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

      // Act
      const { default: startServer } = await import('../../../src/mcp/server.js');
      await startServer();

      // Assert
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        'tools/call',
        expect.any(Function)
      );
    });

    it('should return tool list when tools/list is called', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      let listHandler: Function | undefined;

      mockServer.setRequestHandler.mockImplementation((method: string, handler: Function) => {
        if (method === 'tools/list') {
          listHandler = handler;
        }
      });

      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

      // Act
      const { default: startServer } = await import('../../../src/mcp/server.js');
      await startServer();

      const result = await listHandler?.();

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('tools');
      expect(Array.isArray(result.tools)).toBe(true);
    });

    it('should handle tool registration errors', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      mockServer.setRequestHandler.mockImplementation(() => {
        throw new Error('Registration failed');
      });
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

      // Act & Assert
      const { default: startServer } = await import('../../../src/mcp/server.js');
      await expect(startServer()).rejects.toThrow();
    });
  });

  describe('Server Lifecycle', () => {
    it('should handle server shutdown gracefully', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

      // Act
      const { default: startServer } = await import('../../../src/mcp/server.js');
      const server = await startServer();
      await server?.close();

      // Assert
      expect(mockServer.close).toHaveBeenCalledTimes(1);
    });

    it('should clean up resources on shutdown', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

      // Act
      const { default: startServer } = await import('../../../src/mcp/server.js');
      const server = await startServer();

      // Simulate SIGINT
      process.emit('SIGINT' as any);

      // Assert - verify cleanup happened
      expect(mockServer.close).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing dependencies gracefully', async () => {
      // Arrange
      jest.doMock('@modelcontextprotocol/sdk/server/index.js', () => {
        throw new Error('Module not found');
      });

      // Act & Assert
      await expect(import('../../../src/mcp/server.js')).rejects.toThrow();
    });

    it('should log errors appropriately', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => {
        throw new Error('Test error');
      });

      // Act
      try {
        const { default: startServer } = await import('../../../src/mcp/server.js');
        await startServer();
      } catch (error) {
        // Expected error
      }

      // Assert
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with legacy tool definitions', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

      // Mock legacy tools
      jest.doMock('../../../src/mcp/tools/index.js', () => ({
        // Legacy format without schemas
        testGenerate: jest.fn(),
        testExecute: jest.fn(),
      }));

      // Act & Assert
      const { default: startServer } = await import('../../../src/mcp/server.js');
      await expect(startServer()).resolves.not.toThrow();
    });

    it('should handle missing optional tools', async () => {
      // Arrange
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

      // Mock partial tools
      jest.doMock('../../../src/mcp/tools/index.js', () => ({
        toolSchemas: [
          { name: 'test_generate', description: 'Test', inputSchema: {} }
        ],
        testGenerate: jest.fn(),
      }));

      // Act & Assert
      const { default: startServer } = await import('../../../src/mcp/server.js');
      await expect(startServer()).resolves.not.toThrow();
    });
  });
});
