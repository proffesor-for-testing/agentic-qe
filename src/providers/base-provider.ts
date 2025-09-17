/**
 * Base Provider Interface for AI Execution
 * Defines the contract that all AI providers must implement
 */

import { AgentRegistryEntry } from '../types/agent';

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: {
    provider: string;
    executionTime: number;
    model?: string;
    toolsUsed?: string[];
    filesAnalyzed?: string[];
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface ProviderOptions {
  timeout?: number;
  workingDirectory?: string;
  enableTools?: boolean;
  tools?: string[];
  verbose?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export abstract class BaseAIProvider {
  protected name: string;
  protected available: boolean = false;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Check if this provider is available on the system
   */
  abstract checkAvailability(): Promise<boolean>;

  /**
   * Execute an agent task using this provider
   */
  abstract execute(
    agent: AgentRegistryEntry,
    task: string,
    options?: ProviderOptions
  ): Promise<ExecutionResult>;

  /**
   * Generate a prompt suitable for this provider
   */
  abstract generatePrompt(agent: AgentRegistryEntry, task: string): string;

  /**
   * Get provider name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Check if provider is available
   */
  isAvailable(): boolean {
    return this.available;
  }
}