/**
 * agent-browser CLI Command Executor
 * Wraps CLI calls with type safety and error handling
 */

import { execSync, spawn } from 'child_process';

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
    this.config = {
      sessionName: config.sessionName ?? 'default',
      timeout: config.timeout ?? 30000,
      headed: config.headed ?? false,
      debug: config.debug ?? false,
    };
  }

  // ========================================================================
  // Core execution methods
  // ========================================================================

  /**
   * Execute a command synchronously and parse JSON result
   */
  execute<T = unknown>(command: string, args: string[] = []): CommandResult<T> {
    const fullArgs = this.buildArgs(command, args);
    const cmdString = `npx agent-browser ${fullArgs.join(' ')}`;

    if (this.config.debug) {
      console.log(`[agent-browser] Executing: ${cmdString}`);
    }

    try {
      const output = execSync(cmdString, {
        encoding: 'utf-8',
        timeout: this.config.timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB for screenshots
      });

      // Try to parse as JSON
      try {
        const parsed = JSON.parse(output.trim());
        return { success: true, data: parsed as T };
      } catch {
        // Not JSON, return as string
        return { success: true, data: output.trim() as unknown as T };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
            const parsed = JSON.parse(stdout.trim());
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
  open(url: string): CommandResult<void> {
    const args = [url];
    if (this.config.headed) {
      args.push('--headed');
    }
    const result = this.execute<void>('open', args);
    if (result.success) {
      this.browserLaunched = true;
    }
    return result;
  }

  /**
   * Close browser
   */
  close(): CommandResult<void> {
    const result = this.execute<void>('close');
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
  terminateDaemon(): CommandResult<void> {
    try {
      // First close the browser gracefully
      this.close();

      // Kill all processes matching this session's daemon
      // The daemon runs as: node .../agent-browser/.../daemon.js
      // with environment variable AGENT_BROWSER_SESSION=<sessionName>
      const sessionName = this.config.sessionName;

      // Find and kill processes by session name
      // Use pkill to find processes with matching session in command line
      try {
        execSync(
          `pkill -f "agent-browser.*--session[= ]${sessionName}" 2>/dev/null || true`,
          { timeout: 5000, stdio: 'ignore' }
        );
      } catch {
        // Ignore pkill errors - process might already be dead
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
  snapshot(options?: { interactive?: boolean; compact?: boolean; depth?: number }): CommandResult<string> {
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
  click(target: string): CommandResult<void> {
    return this.execute('click', [target]);
  }

  /**
   * Fill input by ref or selector
   */
  fill(target: string, text: string): CommandResult<void> {
    return this.execute('fill', [target, `"${text.replace(/"/g, '\\"')}"`]);
  }

  /**
   * Type text (without clearing)
   */
  type(target: string, text: string): CommandResult<void> {
    return this.execute('type', [target, `"${text.replace(/"/g, '\\"')}"`]);
  }

  /**
   * Get element text
   */
  getText(target: string): CommandResult<string> {
    return this.execute<string>('get', ['text', target, '--json']);
  }

  /**
   * Check if element is visible
   */
  isVisible(target: string): CommandResult<boolean> {
    const result = this.execute<{ success: boolean }>('is', ['visible', target, '--json']);
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
  screenshot(path?: string, fullPage?: boolean): CommandResult<string> {
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
  waitForElement(target: string, timeout?: number): CommandResult<void> {
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
  waitForText(text: string): CommandResult<void> {
    return this.execute('wait', ['--text', text]);
  }

  /**
   * Wait for URL pattern
   */
  waitForUrl(pattern: string): CommandResult<void> {
    // URL pattern needs to be a glob pattern, convert simple strings
    const urlPattern = pattern.includes('*') ? pattern : `**${pattern}**`;
    return this.execute('wait', ['--url', urlPattern]);
  }

  /**
   * Wait for network idle
   */
  waitForNetworkIdle(): CommandResult<void> {
    return this.execute('wait', ['--load', 'networkidle']);
  }

  // ========================================================================
  // Device/viewport commands
  // ========================================================================

  /**
   * Set device emulation
   */
  setDevice(deviceName: string): CommandResult<void> {
    return this.execute('set', ['device', `"${deviceName}"`]);
  }

  /**
   * Set viewport size
   */
  setViewport(width: number, height: number): CommandResult<void> {
    return this.execute('set', ['viewport', String(width), String(height)]);
  }

  // ========================================================================
  // Network commands
  // ========================================================================

  /**
   * Mock network route
   */
  mockRoute(urlPattern: string, body: unknown): CommandResult<void> {
    const bodyJson = JSON.stringify(body).replace(/"/g, '\\"');
    return this.execute('network', ['route', urlPattern, '--body', `"${bodyJson}"`]);
  }

  /**
   * Abort network route
   */
  abortRoute(urlPattern: string): CommandResult<void> {
    return this.execute('network', ['route', urlPattern, '--abort']);
  }

  /**
   * Clear network routes
   */
  clearRoutes(): CommandResult<void> {
    return this.execute('network', ['unroute']);
  }

  // ========================================================================
  // State commands
  // ========================================================================

  /**
   * Save browser state (cookies, storage)
   */
  saveState(path: string): CommandResult<void> {
    return this.execute('state', ['save', path]);
  }

  /**
   * Load browser state
   */
  loadState(path: string): CommandResult<void> {
    return this.execute('state', ['load', path]);
  }

  // ========================================================================
  // Trace recording
  // ========================================================================

  /**
   * Start trace recording
   * Records browser activity for debugging and analysis
   */
  startTrace(): CommandResult<void> {
    return this.execute('trace', ['start']);
  }

  /**
   * Stop trace recording and save to file
   * @param outputPath - Path to save the trace file
   */
  stopTrace(outputPath: string): CommandResult<string> {
    const result = this.execute<void>('trace', ['stop', outputPath]);
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
  eval<T = unknown>(script: string): CommandResult<T> {
    const escapedScript = script.replace(/"/g, '\\"').replace(/\n/g, ' ');
    return this.execute<T>('eval', [`"${escapedScript}"`, '--json']);
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
export function isAgentBrowserAvailable(): boolean {
  try {
    // Use 'npx agent-browser' without args to check help output
    // --version is not a valid command, but running with no args shows help
    const output = execSync('npx agent-browser 2>&1', { encoding: 'utf-8', timeout: 10000 });
    return output.includes('agent-browser') && output.includes('Usage:');
  } catch {
    return false;
  }
}
