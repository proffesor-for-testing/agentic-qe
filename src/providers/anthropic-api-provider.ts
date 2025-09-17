/**
 * Anthropic API Provider - Direct Integration with Claude API
 * Based on claude-flow's implementation approach
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as path from 'path';
import { BaseAIProvider, ExecutionResult, ProviderOptions } from './base-provider';
import { AgentRegistryEntry } from '../types/agent';
import { Logger } from '../utils/Logger';

const execAsync = promisify(exec);
const logger = new Logger('anthropic-api-provider');

export interface AnthropicConfig {
  apiKey: string;
  apiUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  retryAttempts?: number;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  stream?: boolean;
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicAPIProvider extends BaseAIProvider {
  private config: AnthropicConfig;
  private apiKey: string;
  private apiUrl: string = 'https://api.anthropic.com/v1/messages';
  private defaultModel: string = 'claude-3-5-sonnet-20241022'; // Updated to current model
  private defaultTemperature: number = 0.7;
  private defaultMaxTokens: number = 4096;

  constructor(config?: Partial<AnthropicConfig>) {
    super('anthropic-api');

    // Get API key from environment or config
    // Check multiple possible environment variable names
    this.apiKey = config?.apiKey ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.SENTINEL_APP_ANTHROPIC_API_KEY ||
      '';

    this.config = {
      apiKey: this.apiKey,
      apiUrl: config?.apiUrl || this.apiUrl,
      model: config?.model || this.defaultModel,
      temperature: config?.temperature || this.defaultTemperature,
      maxTokens: config?.maxTokens || this.defaultMaxTokens,
      timeout: config?.timeout || 120000,
      retryAttempts: config?.retryAttempts || 3,
    };
  }

  async checkAvailability(): Promise<boolean> {
    if (!this.apiKey) {
      logger.warn('Anthropic API key not configured');
      this.available = false;
      return false;
    }

    try {
      // Make a simple test request to check if API is accessible
      const testRequest: AnthropicRequest = {
        model: this.config.model!,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
        temperature: 0.0,
      };

      const response = await this.makeAPIRequest(testRequest);
      this.available = response !== null;
      logger.info(`Anthropic API availability: ${this.available}`);
      return this.available;
    } catch (error) {
      logger.info('Anthropic API not available:', error);
      this.available = false;
      return false;
    }
  }

  async execute(
    agent: AgentRegistryEntry,
    task: string,
    options: ProviderOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Check availability first
      if (!this.available && !(await this.checkAvailability())) {
        return {
          success: false,
          output: '',
          error: 'Anthropic API is not available. Please ensure ANTHROPIC_API_KEY is set.',
          metadata: {
            provider: this.name,
            executionTime: Date.now() - startTime,
          },
        };
      }

      // Generate the prompt with instructions for analysis
      const systemPrompt = this.generateSystemPrompt(agent);
      const userPrompt = this.generateUserPrompt(agent, task, options);

      // Create the request
      const request: AnthropicRequest = {
        model: this.config.model!,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
        max_tokens: options.maxTokens || this.config.maxTokens!,
        temperature: options.temperature || this.config.temperature,
      };

      logger.info(`Executing agent ${agent.agent.name} via Anthropic API`);

      // Make the API request
      const response = await this.makeAPIRequest(request);

      if (!response) {
        throw new Error('No response from Anthropic API');
      }

      // Extract the text response
      const output = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      return {
        success: true,
        output,
        metadata: {
          provider: this.name,
          model: response.model,
          executionTime: Date.now() - startTime,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
        },
      };
    } catch (error) {
      logger.error(`Failed to execute agent ${agent.agent.name}:`, error);

      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          provider: this.name,
          executionTime: Date.now() - startTime,
        },
      };
    }
  }

  generatePrompt(agent: AgentRegistryEntry, task: string): string {
    // This is handled by generateSystemPrompt and generateUserPrompt
    return '';
  }

  private generateSystemPrompt(agent: AgentRegistryEntry): string {
    const agentDef = agent.agent;

    let prompt = agentDef.system_prompt ||
      `You are ${agentDef.name}, ${agentDef.description}. You are a specialized agent focused on ${agentDef.category}.`;

    if (agentDef.capabilities && agentDef.capabilities.length > 0) {
      prompt += '\n\nYour capabilities include:\n';
      agentDef.capabilities.forEach(cap => {
        prompt += `- ${cap.replace(/_/g, ' ')}\n`;
      });
    }

    return prompt;
  }

  private generateUserPrompt(agent: AgentRegistryEntry, task: string, options: ProviderOptions): string {
    const agentDef = agent.agent;
    const projectPath = options.workingDirectory || process.cwd();
    const projectName = path.basename(projectPath);

    let prompt = `Please perform the following task:\n\n${task}\n\n`;

    prompt += `Project Context:\n`;
    prompt += `- Project Name: ${projectName}\n`;
    prompt += `- Project Path: ${projectPath}\n`;
    prompt += `- Absolute Path: ${path.resolve(projectPath)}\n`;
    prompt += `- Project Type: Quality Engineering Framework\n`;
    prompt += `- Current Directory: ${process.cwd()}\n\n`;

    // Add specific instructions based on agent type
    if (agentDef.name.includes('risk')) {
      prompt += `Please provide a comprehensive risk analysis including:\n`;
      prompt += `1. Identification of potential risks and vulnerabilities\n`;
      prompt += `2. Risk severity assessment (Critical, High, Medium, Low)\n`;
      prompt += `3. Likelihood of occurrence\n`;
      prompt += `4. Potential impact on the system\n`;
      prompt += `5. Recommended mitigation strategies\n\n`;
    } else if (agentDef.name.includes('test')) {
      prompt += `Please provide comprehensive testing analysis including:\n`;
      prompt += `1. Test coverage assessment\n`;
      prompt += `2. Missing test scenarios\n`;
      prompt += `3. Test quality evaluation\n`;
      prompt += `4. Recommended test cases\n`;
      prompt += `5. Testing strategy improvements\n\n`;
    } else if (agentDef.name.includes('security')) {
      prompt += `Please provide security analysis including:\n`;
      prompt += `1. Security vulnerability assessment\n`;
      prompt += `2. Authentication and authorization review\n`;
      prompt += `3. Data protection evaluation\n`;
      prompt += `4. Security best practices compliance\n`;
      prompt += `5. Remediation recommendations\n\n`;
    }

    prompt += `Note: Since you don't have direct file system access in this context, please provide `;
    prompt += `general analysis and recommendations based on the task description and common patterns `;
    prompt += `in quality engineering projects. Focus on actionable insights and best practices.\n`;

    return prompt;
  }

  private async makeAPIRequest(request: AnthropicRequest): Promise<AnthropicResponse | null> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(request);

      const options = {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: this.config.timeout,
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const response = JSON.parse(data) as AnthropicResponse;
              resolve(response);
            } else {
              logger.error(`API request failed with status ${res.statusCode}: ${data}`);
              reject(new Error(`API request failed: ${res.statusCode} - ${data}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        logger.error('API request error:', error);
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`API request timeout after ${this.config.timeout}ms`));
      });

      req.write(postData);
      req.end();
    });
  }
}