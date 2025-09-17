/**
 * Claude Code Provider - Direct Integration
 * Executes agents using Claude Code with full tool access
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { BaseAIProvider, ExecutionResult, ProviderOptions } from './base-provider';
import { AgentRegistryEntry } from '../types/agent';
import { Logger } from '../utils/Logger';

const execAsync = promisify(exec);
const logger = new Logger('claude-code-provider');

export class ClaudeCodeProvider extends BaseAIProvider {
  private tempDir: string;

  constructor() {
    super('claude-code');
    this.tempDir = path.join(os.tmpdir(), 'aqe-claude-tasks');
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    await fs.ensureDir(this.tempDir);
  }

  async checkAvailability(): Promise<boolean> {
    try {
      // Check if Claude CLI exists and is executable
      // Use --help since --version might not exist
      const { stdout } = await execAsync('claude --help', { timeout: 5000 });
      // Check if it's the actual Claude CLI (not some other program)
      this.available = stdout.includes('Claude Code') || stdout.includes('[prompt]');
      logger.info(`Claude CLI availability: ${this.available}`);
      return this.available;
    } catch (error) {
      // Claude CLI not found or not working
      logger.info('Claude CLI not available or not configured properly');
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
          error: 'Claude CLI is not available or not properly configured. Please ensure Claude desktop app is installed and the CLI is set up.',
          metadata: {
            provider: this.name,
            executionTime: Date.now() - startTime,
          },
        };
      }

      // Generate the prompt with tool instructions
      const prompt = this.generatePrompt(agent, task);

      // Create a temporary script file
      const scriptFile = path.join(this.tempDir, `agent-${Date.now()}.md`);
      await fs.writeFile(scriptFile, prompt, 'utf-8');

      logger.info(`Executing agent ${agent.agent.name} via Claude Code`);
      logger.debug(`Script file: ${scriptFile}`);

      // Execute via Claude CLI using --print flag for non-interactive mode
      // We need to pass the prompt directly, not a script file
      // Use --print to get response without interaction
      // Note: Claude CLI has issues with duplicate tool names in some configs
      // so we'll read the prompt and pass it directly
      const promptContent = await fs.readFile(scriptFile, 'utf-8');

      // Escape the prompt for shell execution
      const escapedPrompt = promptContent.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');

      const command = `claude --print "${escapedPrompt}"`;

      logger.debug(`Executing Claude CLI with prompt length: ${promptContent.length}`);

      const { stdout, stderr } = await execAsync(command, {
        cwd: options.workingDirectory || process.cwd(),
        timeout: options.timeout || 120000, // 2 minutes default
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: {
          ...process.env,
          // Ensure we're in the right directory for file access
          PWD: options.workingDirectory || process.cwd(),
        },
      });

      // Clean up temp file
      await fs.remove(scriptFile);

      // Parse output for any file references or tools used
      const metadata = this.parseExecutionMetadata(stdout);

      return {
        success: true,
        output: stdout,
        error: stderr || undefined,
        metadata: {
          provider: this.name,
          executionTime: Date.now() - startTime,
          ...metadata,
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
    const agentDef = agent.agent;

    let prompt = `# ${agentDef.name} - AI-Powered Analysis\n\n`;

    // Add system prompt
    if (agentDef.system_prompt) {
      prompt += `## Role & Context\n${agentDef.system_prompt}\n\n`;
    }

    // Add the task
    prompt += `## Task\n${task}\n\n`;

    // Add tool usage instructions
    prompt += `## Instructions\n`;
    prompt += `You are executing in the directory: ${process.cwd()}\n\n`;
    prompt += `Please use the following tools to analyze the project:\n`;
    prompt += `1. **Read tool** - Read project files to understand structure and code\n`;
    prompt += `2. **Grep tool** - Search for patterns, vulnerabilities, or specific code\n`;
    prompt += `3. **Glob tool** - Find files by pattern\n`;
    prompt += `4. **Bash tool** - Run commands to check dependencies, tests, etc.\n\n`;

    // Add capability-specific instructions
    if (agentDef.capabilities && agentDef.capabilities.length > 0) {
      prompt += `## Your Capabilities\n`;
      prompt += `Focus your analysis on these areas:\n`;
      agentDef.capabilities.forEach(cap => {
        prompt += `- ${cap.replace(/_/g, ' ')}\n`;
      });
      prompt += `\n`;
    }

    // Add specific analysis requirements based on agent type
    if (agentDef.name.includes('risk')) {
      prompt += `## Risk Analysis Requirements\n`;
      prompt += `1. Read key project files (package.json, requirements.txt, pom.xml, etc.)\n`;
      prompt += `2. Search for security vulnerabilities and bad practices\n`;
      prompt += `3. Analyze code complexity and test coverage\n`;
      prompt += `4. Provide risk scores with evidence from actual files\n\n`;
    } else if (agentDef.name.includes('test')) {
      prompt += `## Testing Analysis Requirements\n`;
      prompt += `1. Read existing test files to understand coverage\n`;
      prompt += `2. Identify untested code paths\n`;
      prompt += `3. Suggest specific test cases with code examples\n`;
      prompt += `4. Check for testing best practices\n\n`;
    } else if (agentDef.name.includes('security')) {
      prompt += `## Security Analysis Requirements\n`;
      prompt += `1. Search for hardcoded credentials or API keys\n`;
      prompt += `2. Check for SQL injection vulnerabilities\n`;
      prompt += `3. Analyze authentication and authorization code\n`;
      prompt += `4. Review dependency versions for known vulnerabilities\n\n`;
    }

    // Add output format instructions
    prompt += `## Output Format\n`;
    prompt += `Please provide a detailed analysis with:\n`;
    prompt += `1. **Executive Summary** - Key findings and risk level\n`;
    prompt += `2. **Detailed Findings** - Specific issues with file references\n`;
    prompt += `3. **Evidence** - Code snippets or file contents supporting findings\n`;
    prompt += `4. **Recommendations** - Actionable steps to address issues\n`;
    prompt += `5. **Priority Actions** - What to fix first\n\n`;

    prompt += `Remember to base all findings on actual project files and provide specific file paths and line numbers where applicable.\n`;

    return prompt;
  }

  private parseExecutionMetadata(output: string): any {
    const metadata: any = {};

    // Try to detect which tools were used
    const toolsUsed = [];
    if (output.includes('Read tool') || output.includes('reading file')) {
      toolsUsed.push('Read');
    }
    if (output.includes('Grep tool') || output.includes('searching for')) {
      toolsUsed.push('Grep');
    }
    if (output.includes('Bash tool') || output.includes('executing command')) {
      toolsUsed.push('Bash');
    }
    if (output.includes('Glob tool') || output.includes('finding files')) {
      toolsUsed.push('Glob');
    }

    if (toolsUsed.length > 0) {
      metadata.toolsUsed = toolsUsed;
    }

    // Try to extract file references
    const filePattern = /(?:file|File|reading|Reading)\s+([\/\w\-\.]+\.\w+)/g;
    const filesAnalyzed = [];
    let match;
    while ((match = filePattern.exec(output)) !== null) {
      if (!filesAnalyzed.includes(match[1])) {
        filesAnalyzed.push(match[1]);
      }
    }

    if (filesAnalyzed.length > 0) {
      metadata.filesAnalyzed = filesAnalyzed;
    }

    return metadata;
  }
}