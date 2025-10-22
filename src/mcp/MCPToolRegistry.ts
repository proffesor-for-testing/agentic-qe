/**
 * MCP Tool Registry
 * Registry for managing MCP tools and handlers
 */

export interface MCPTool {
  name: string;
  description: string;
  handler: (params: any) => Promise<any>;
  schema?: any;
}

export class MCPToolRegistry {
  private tools: Map<string, MCPTool> = new Map();

  /**
   * Register a new MCP tool
   */
  register(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name
   */
  get(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool
   */
  async execute(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.handler(params);
  }

  /**
   * List all registered tools
   */
  list(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
  }
}
