/**
 * agent-browser CLI Command Executor
 * Wraps CLI calls with type safety and error handling
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { safeJsonParse } from '../../../shared/safe-json.js';
import { npmCliInvocation } from '../../../shared/npm-cli-invocation.js';
import { runTestRunnerProcess, type TestRunnerProcessResult } from '../../../shared/test-runner-process.js';
import { toErrorMessage } from '../../../shared/error-utils.js';

const execFileAsync = promisify(execFile);

/**
 * Run `npx agent-browser ...` without blocking the event loop (#1115). A
 * timeout stops the whole npx process tree, as the synchronous call did not.
 */
export function runAgentBrowser(args: string[], timeout: number, maxBuffer?: number): Promise<TestRunnerProcessResult> {
  const npx = npmCliInvocation('npx');
  if (!npx) {
    const error = Object.assign(new Error('npx CLI not found next to node'), { code: 'ENOENT' });
    return Promise.resolve({ status: null, signal: null, stdout: '', stderr: '', error });
  }
  return runTestRunnerProcess(npx[0], [...npx[1], 'agent-browser', ...args], { cwd: process.cwd(), timeout, maxBuffer });
}

// Command result from --json output
export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Executor configuration
export interface CommandExecutorConfig {
  sessionName?: string;
  timeout?: number;      // ms, default 30000
  headed?: boolean;      // Show browser window
  debug?: boolean;       // Debug output
}

/**
 * Execute agent-browser CLI commands with type safety
 */
export class AgentBrowserCommandExecutor {
  private readonly config: Required<CommandExecutorConfig>;
  private browserLaunched = false;

  constructor(config: CommandExecutorConfig = {}) {
    const sessionName = config.sessionName ?? 'default';
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionName)) {
      throw new Error(
        `Invalid sessionName "${sessionName}": must match /^[a-zA-Z0-9_-]+$/`
      );
    }
    this.config = {
      sessionName,
      timeout: config.timeout ?? 30000,
      headed: config.headed ?? false,
      debug: config.debug ?? false,
    };
  }

  // ========================================================================
  // Core execution methods
  // ========================================================================

  /**
   * Execute a command and parse JSON result
   */
  async execute<T = unknown>(command: string, args: string[] = []): Promise<CommandResult<T>> {
    const fullArgs = this.buildArgs(command, args);

    if (this.config.debug) {
      console.log(`[agent-browser] Executing: npx agent-browser ${fullArgs.join(' ')}`);
    }

    try {
      const result = await runAgentBrowser(fullArgs, this.config.timeout, 10 * 1024 * 1024); // 10MB for screenshots

      if (result.error) {
        return { success: false, error: result.error.message };
      }

      if (result.status !== 0) {
        const stderr = result.stderr?.trim();
        return { success: false, error: stderr || `Exit code: ${result.status}` };
      }

      const output = result.stdout?.trim() ?? '';

      // Try to parse as JSON
      try {
        const parsed = safeJsonParse(output);
        return { success: true, data: parsed as T };
      } catch {
        // Not JSON, return as string
        return { success: true, data: output as unknown as T };
      }
    } catch (error) {
      const message = toErrorMessage(error);
      return { success: false, error: message };
    }
  }

  /**
   * Execute a command asynchronously (for long-running ops)
   */
  async executeAsync<T = unknown>(command: string, args: string[] = []): Promise<CommandResult<T>> {
    return new Promise((resolve) => {
      const fullArgs = this.buildArgs(command, args);

      if (this.config.debug) {
        console.log(`[agent-browser] Executing async: npx agent-browser ${fullArgs.join(' ')}`);
      }

      const process = spawn('npx', ['agent-browser', ...fullArgs], {
        timeout: this.config.timeout,
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          try {
            const parsed = safeJsonParse(stdout.trim());
            resolve({ success: true, data: parsed as T });
          } catch {
            resolve({ success: true, data: stdout.trim() as unknown as T });
          }
        } else {
          resolve({ success: false, error: stderr || `Exit code: ${code}` });
        }
      });

      process.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
    });
  }

  // ========================================================================
  // Browser lifecycle commands
  // ========================================================================

  /**
   * Open URL in browser (auto-launches if needed)
   */
  async open(url: string): Promise<CommandResult<void>> {
    const args = [url];
    if (this.config.headed) {
      args.push('--headed');
    }
    const result = await this.execute<void>('open', args);
    if (result.success) {
      this.browserLaunched = true;
    }
    return result;
  }

  /**
   * Close browser
   */
  async close(): Promise<CommandResult<void>> {
    const result = await this.execute<void>('close');
    if (result.success) {
      this.browserLaunched = false;
    }
    return result;
  }

  /**
   * Terminate the daemon process for this session
   * CRITICAL: Must be called to prevent memory leaks!
   * The daemon persists even after close() - this kills it entirely.
   */
  async terminateDaemon(): Promise<CommandResult<void>> {
    try {
      // First close the browser gracefully
      await this.close();

      // Kill all processes matching this session's daemon
      // The daemon runs as: node .../agent-browser/.../daemon.js
      // with environment variable AGENT_BROWSER_SESSION=<sessionName>
      const sessionName = this.config.sessionName;

      // Find and kill processes by session name
      // Use pkill with argument array to prevent shell injection
      try {
        await execFileAsync('pkill', ['-f', `agent-browser.*--session[= ]${sessionName}`], { timeout: 5000 });
      } catch {
        // Non-critical: pkill exits 1 when nothing matched, or the process is already dead
      }

      // Also try to kill by AGENT_BROWSER_SESSION env var (harder to match)
      // As a fallback, we'll rely on the session-specific matching above

      this.browserLaunched = false;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to terminate daemon'
      };
    }
  }

  // ========================================================================
  // Snapshot commands (key feature)
  // ========================================================================

  /**
   * Get accessibility snapshot with refs
   */
  async snapshot(options?: { interactive?: boolean; compact?: boolean; depth?: number }): Promise<CommandResult<string>> {
    const args: string[] = ['--json'];
    if (options?.interactive) args.push('-i');
    if (options?.compact) args.push('-c');
    if (options?.depth) args.push('-d', String(options.depth));
    return this.execute<string>('snapshot', args);
  }

  // ========================================================================
  // Element interaction commands
  // ========================================================================

  /**
   * Click element by ref or selector
   */
  async click(target: string): Promise<CommandResult<void>> {
    return this.execute('click', [target]);
  }

  /**
   * Fill input by ref or selector
   */
  async fill(target: string, text: string): Promise<CommandResult<void>> {
    return this.execute('fill', [target, text]);
  }

  /**
   * Type text (without clearing)
   */
  async type(target: string, text: string): Promise<CommandResult<void>> {
    return this.execute('type', [target, text]);
  }

  /**
   * Get element text
   */
  async getText(target: string): Promise<CommandResult<string>> {
    return this.execute<string>('get', ['text', target, '--json']);
  }

  /**
   * Check if element is visible
   */
  async isVisible(target: string): Promise<CommandResult<boolean>> {
    const result = await this.execute<{ success: boolean }>('is', ['visible', target, '--json']);
    if (result.success && result.data) {
      return { success: true, data: result.data.success };
    }
    return { success: false, error: result.error };
  }

  // ========================================================================
  // Screenshot commands
  // ========================================================================

  /**
   * Take screenshot
   */
  async screenshot(path?: string, fullPage?: boolean): Promise<CommandResult<string>> {
    const args: string[] = [];
    if (path) args.push(path);
    if (fullPage) args.push('--full');
    if (!path) args.push('--json'); // Return base64 if no path
    return this.execute<string>('screenshot', args);
  }

  // ========================================================================
  // Wait commands
  // ========================================================================

  /**
   * Wait for element
   */
  async waitForElement(target: string, timeout?: number): Promise<CommandResult<void>> {
    const args = [target];
    if (timeout) {
      // Wait command accepts ms or selector
      return this.execute('wait', args);
    }
    return this.execute('wait', args);
  }

  /**
   * Wait for text to appear
   */
  async waitForText(text: string): Promise<CommandResult<void>> {
    return this.execute('wait', ['--text', text]);
  }

  /**
   * Wait for URL pattern
   */
  async waitForUrl(pattern: string): Promise<CommandResult<void>> {
    // URL pattern needs to be a glob pattern, convert simple strings
    const urlPattern = pattern.includes('*') ? pattern : `**${pattern}**`;
    return this.execute('wait', ['--url', urlPattern]);
  }

  /**
   * Wait for network idle
   */
  async waitForNetworkIdle(): Promise<CommandResult<void>> {
    return this.execute('wait', ['--load', 'networkidle']);
  }

  // ========================================================================
  // Device/viewport commands
  // ========================================================================

  /**
   * Set device emulation
   */
  async setDevice(deviceName: string): Promise<CommandResult<void>> {
    return this.execute('set', ['device', deviceName]);
  }

  /**
   * Set viewport size
   */
  async setViewport(width: number, height: number): Promise<CommandResult<void>> {
    return this.execute('set', ['viewport', String(width), String(height)]);
  }

  // ========================================================================
  // Network commands
  // ========================================================================

  /**
   * Mock network route
   */
  async mockRoute(urlPattern: string, body: unknown): Promise<CommandResult<void>> {
    const bodyJson = JSON.stringify(body);
    return this.execute('network', ['route', urlPattern, '--body', bodyJson]);
  }

  /**
   * Abort network route
   */
  async abortRoute(urlPattern: string): Promise<CommandResult<void>> {
    return this.execute('network', ['route', urlPattern, '--abort']);
  }

  /**
   * Clear network routes
   */
  async clearRoutes(): Promise<CommandResult<void>> {
    return this.execute('network', ['unroute']);
  }

  // ========================================================================
  // State commands
  // ========================================================================

  /**
   * Save browser state (cookies, storage)
   */
  async saveState(path: string): Promise<CommandResult<void>> {
    return this.execute('state', ['save', path]);
  }

  /**
   * Load browser state
   */
  async loadState(path: string): Promise<CommandResult<void>> {
    return this.execute('state', ['load', path]);
  }

  // ========================================================================
  // Trace recording
  // ========================================================================

  /**
   * Start trace recording
   * Records browser activity for debugging and analysis
   */
  async startTrace(): Promise<CommandResult<void>> {
    return this.execute('trace', ['start']);
  }

  /**
   * Stop trace recording and save to file
   * @param outputPath - Path to save the trace file
   */
  async stopTrace(outputPath: string): Promise<CommandResult<string>> {
    const result = await this.execute<void>('trace', ['stop', outputPath]);
    if (result.success) {
      return { success: true, data: outputPath };
    }
    return { success: false, error: result.error };
  }

  // ========================================================================
  // JavaScript evaluation
  // ========================================================================

  /**
   * Evaluate JavaScript in page context
   */
  async eval<T = unknown>(script: string): Promise<CommandResult<T>> {
    return this.execute<T>('eval', [script, '--json']);
  }

  // ========================================================================
  // Session info
  // ========================================================================

  /**
   * Get current session name
   */
  getSessionName(): string {
    return this.config.sessionName;
  }

  /**
   * Check if browser is launched
   */
  isBrowserLaunched(): boolean {
    return this.browserLaunched;
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private buildArgs(command: string, args: string[]): string[] {
    const fullArgs: string[] = [];

    // Add session flag
    if (this.config.sessionName !== 'default') {
      fullArgs.push('--session', this.config.sessionName);
    }

    // Add command and args
    fullArgs.push(command, ...args);

    return fullArgs;
  }
}

/**
 * Check if agent-browser CLI is available
 */
export async function isAgentBrowserAvailable(): Promise<boolean> {
  try {
    // Use 'npx agent-browser' without args to check help output
    // --version is not a valid command, but running with no args shows help
    const result = await runAgentBrowser([], 10000);
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    return output.includes('agent-browser') && output.includes('Usage:');
  } catch {
    return false;
  }
}
