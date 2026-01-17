/**
 * MCP Test Harness
 * Shared utilities for testing MCP tool handlers
 */

import { AgenticQEMCPServer } from '@mcp/server';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';
import { EventBus } from '@core/EventBus';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { getSharedMemoryManager } from '@core/memory/MemoryManagerFactory';
import path from 'path';
import fs from 'fs-extra';
import { tmpdir } from 'os';

export interface ToolCallResult {
  success: boolean;
  data?: any;
  error?: string;
  isError?: boolean;
  content?: Array<{ type: string; text: string }>;
}

export class MCPTestHarness {
  private server!: AgenticQEMCPServer;
  private registry!: AgentRegistry;
  private hookExecutor!: HookExecutor;
  private memoryManager!: SwarmMemoryManager;
  private eventBus!: EventBus;
  private testDir!: string;
  private internalMemory: Map<string, any> = new Map();

  /**
   * Initialize the test harness
   */
  async initialize(): Promise<void> {
    // Create temporary test directory
    this.testDir = path.join(tmpdir(), `aqe-mcp-test-${Date.now()}`);
    await fs.ensureDir(this.testDir);

    // Initialize core services
    this.eventBus = new EventBus();

    // Get shared memory manager (singleton pattern used in production)
    this.memoryManager = await getSharedMemoryManager();

    // Initialize MCP server (this creates its own AgentRegistry and HookExecutor internally)
    this.server = new AgenticQEMCPServer();
  }

  /**
   * Clean up test resources
   */
  async cleanup(): Promise<void> {
    if (this.testDir && await fs.pathExists(this.testDir)) {
      await fs.remove(this.testDir);
    }

    // Clear internal memory
    this.internalMemory.clear();

    // Close event bus connections
    if (this.eventBus) {
      this.eventBus.removeAllListeners();
    }
  }

  /**
   * Call an MCP tool and handle the response
   */
  async callTool(toolName: string, params: any): Promise<ToolCallResult> {
    try {
      const result = await this.server.handleToolCall(toolName, params);

      // Handle different response formats
      if (Array.isArray(result.content)) {
        const textContent = result.content.find(c => c.type === 'text');
        if (textContent) {
          try {
            const parsed = JSON.parse(textContent.text);
            return {
              success: !parsed.error && !result.isError,
              data: parsed,
              error: parsed.error,
              content: result.content
            };
          } catch {
            return {
              success: !result.isError,
              data: textContent.text,
              content: result.content
            };
          }
        }
      }

      return {
        success: !result.isError,
        data: result,
        isError: result.isError
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get the server instance
   */
  getServer(): AgenticQEMCPServer {
    return this.server;
  }

  /**
   * Get the event bus
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Get the test directory
   */
  getTestDir(): string {
    return this.testDir;
  }

  /**
   * Create a mock test file for integration testing
   */
  async createMockTestFile(filename: string, content: string): Promise<string> {
    const filePath = path.join(this.testDir, filename);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  /**
   * Check if tool is supported
   */
  supportsTool(toolName: string): boolean {
    return this.server.supportsTool(toolName);
  }

  /**
   * Get all registered tools
   */
  getTools(): any[] {
    return this.server.getTools();
  }

  /**
   * Wait for a specific event
   */
  async waitForEvent(eventName: string, timeout: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Event ${eventName} did not fire within ${timeout}ms`));
      }, timeout);

      this.eventBus.once(eventName, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  /**
   * Store data in internal test memory
   */
  async storeMemory(key: string, value: any, options?: any): Promise<void> {
    this.internalMemory.set(key, { value, options, timestamp: Date.now() });
  }

  /**
   * Retrieve data from internal test memory
   */
  async retrieveMemory(key: string, options?: any): Promise<any> {
    const entry = this.internalMemory.get(key);
    return entry?.value;
  }

  /**
   * Query internal test memory store
   */
  async queryMemory(pattern: string, options?: any): Promise<any[]> {
    const results: any[] = [];
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));

    for (const [key, entry] of this.internalMemory) {
      if (regex.test(key)) {
        results.push({ key, ...entry });
      }
    }
    return results;
  }

  /**
   * Clear internal test memory
   */
  async clearMemory(): Promise<void> {
    this.internalMemory.clear();
  }

  /**
   * Verify tool parameter schema
   */
  verifyToolSchema(toolName: string, expectedProperties: string[]): boolean {
    const tools = this.getTools();
    const tool = tools.find(t => t.name === toolName);

    if (!tool || !tool.inputSchema || !tool.inputSchema.properties) {
      return false;
    }

    const actualProps = Object.keys(tool.inputSchema.properties);
    return expectedProperties.every(prop => actualProps.includes(prop));
  }

  /**
   * Parse tool response content
   */
  parseToolResponse(result: ToolCallResult): any {
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find(c => c.type === 'text');
      if (textContent) {
        try {
          return JSON.parse(textContent.text);
        } catch {
          return textContent.text;
        }
      }
    }
    return result.data;
  }

  /**
   * Assert tool response success
   */
  assertSuccess(result: ToolCallResult): void {
    if (!result.success) {
      throw new Error(`Tool call failed: ${result.error || 'Unknown error'}`);
    }
  }

  /**
   * Assert tool response contains fields
   */
  assertContainsFields(data: any, fields: string[]): void {
    for (const field of fields) {
      if (!(field in data)) {
        throw new Error(`Expected field '${field}' not found in response`);
      }
    }
  }
}
