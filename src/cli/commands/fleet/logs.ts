import chalk from 'chalk';
import * as fs from 'fs-extra';

export interface FleetLogsOptions {
  lines?: number; // Number of lines to show
  follow?: boolean; // Follow logs in real-time
  level?: string; // Filter by log level (error, warn, info, debug)
  agent?: string; // Filter by specific agent
  since?: string; // Show logs since timestamp
}

export class FleetLogsCommand {
  private static isFollowing = false;
  private static followInterval: NodeJS.Timeout | null = null;

  static async execute(options: FleetLogsOptions): Promise<string> {
    // Check if fleet is initialized
    if (!await fs.pathExists('.agentic-qe/config/fleet.json')) {
      throw new Error('Fleet not initialized. Run: aqe fleet init');
    }

    console.log(chalk.blue.bold('\n📜 Fleet Logs\n'));

    // Ensure logs directory exists
    const logsDir = '.agentic-qe/logs';
    await fs.ensureDir(logsDir);

    // Get log files
    const logFiles = await this.getLogFiles(logsDir);

    if (logFiles.length === 0) {
      console.log(chalk.yellow('No log files found'));
      return '';
    }

    // Read and filter logs
    const logs = await this.readLogs(logFiles, options);

    // Display logs
    this.displayLogs(logs, options);

    // Follow mode
    if (options.follow) {
      await this.followLogs(logFiles, options);
    }

    // Store log access in coordination
    await this.storeLogAccess();

    return logs;
  }

  private static async getLogFiles(logsDir: string): Promise<string[]> {
    const files = await fs.readdir(logsDir);
    return files
      .filter(f => f.endsWith('.log'))
      .map(f => `${logsDir}/${f}`)
      .sort()
      .reverse(); // Most recent first
  }

  private static async readLogs(logFiles: string[], options: FleetLogsOptions): Promise<string> {
    let allLogs = '';

    // Read logs from all files
    for (const logFile of logFiles) {
      if (await fs.pathExists(logFile)) {
        const content = await fs.readFile(logFile, 'utf-8');
        allLogs += content;
      }
    }

    // Split into lines
    let lines = allLogs.split('\n').filter(line => line.trim().length > 0);

    // Filter by level
    if (options.level) {
      const levelUpper = options.level.toUpperCase();
      lines = lines.filter(line => line.includes(`[${levelUpper}]`));
    }

    // Filter by agent
    if (options.agent) {
      lines = lines.filter(line => line.includes(options.agent!));
    }

    // Filter by timestamp
    if (options.since) {
      const sinceDate = new Date(options.since);
      lines = lines.filter(line => {
        const timestamp = this.extractTimestamp(line);
        return timestamp && new Date(timestamp) >= sinceDate;
      });
    }

    // Limit lines
    const lineLimit = options.lines || 100;
    lines = lines.slice(-lineLimit);

    return lines.join('\n');
  }

  private static displayLogs(logs: string, options: FleetLogsOptions): void {
    if (!logs) {
      console.log(chalk.yellow('No logs match the specified filters'));
      return;
    }

    const lines = logs.split('\n');

    lines.forEach(line => {
      // Colorize log levels
      if (line.includes('[ERROR]')) {
        console.log(chalk.red(line));
      } else if (line.includes('[WARN]')) {
        console.log(chalk.yellow(line));
      } else if (line.includes('[INFO]')) {
        console.log(chalk.blue(line));
      } else if (line.includes('[DEBUG]')) {
        console.log(chalk.gray(line));
      } else {
        console.log(line);
      }
    });

    console.log(chalk.gray(`\n(Showing ${lines.length} lines)`));
  }

  private static async followLogs(logFiles: string[], options: FleetLogsOptions): Promise<void> {
    console.log(chalk.blue('\n📡 Following logs... (Press Ctrl+C to stop)\n'));

    this.isFollowing = true;
    let lastPosition = 0;

    // Get initial file sizes
    const fileSizes: Record<string, number> = {};
    for (const file of logFiles) {
      const stats = await fs.stat(file);
      fileSizes[file] = stats.size;
    }

    this.followInterval = setInterval(async () => {
      if (!this.isFollowing) {
        this.stopFollowing();
        return;
      }

      // Check each log file for new content
      for (const file of logFiles) {
        try {
          const stats = await fs.stat(file);
          const currentSize = stats.size;
          const lastSize = fileSizes[file] || 0;

          if (currentSize > lastSize) {
            // Read new content
            const stream = fs.createReadStream(file, {
              start: lastSize,
              end: currentSize
            });

            let newContent = '';
            for await (const chunk of stream) {
              newContent += chunk.toString();
            }

            // Display new lines
            const newLines = newContent.split('\n').filter(l => l.trim().length > 0);
            newLines.forEach(line => {
              // Apply filters
              if (options.level && !line.includes(`[${options.level.toUpperCase()}]`)) {
                return;
              }
              if (options.agent && !line.includes(options.agent)) {
                return;
              }

              // Colorize and display
              if (line.includes('[ERROR]')) {
                console.log(chalk.red(line));
              } else if (line.includes('[WARN]')) {
                console.log(chalk.yellow(line));
              } else if (line.includes('[INFO]')) {
                console.log(chalk.blue(line));
              } else if (line.includes('[DEBUG]')) {
                console.log(chalk.gray(line));
              } else {
                console.log(line);
              }
            });

            fileSizes[file] = currentSize;
          }
        } catch (error) {
          // File might have been rotated or removed
        }
      }
    }, 1000); // Check every second

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      this.stopFollowing();
      console.log(chalk.yellow('\n\n📜 Log following stopped'));
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});
  }

  private static stopFollowing(): void {
    this.isFollowing = false;
    if (this.followInterval) {
      clearInterval(this.followInterval);
      this.followInterval = null;
    }
  }

  private static extractTimestamp(line: string): string | null {
    // Try to extract ISO timestamp
    const isoMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    if (isoMatch) {
      return isoMatch[0];
    }

    // Try to extract other timestamp formats
    const dateMatch = line.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    if (dateMatch) {
      return dateMatch[0];
    }

    return null;
  }

  private static async storeLogAccess(): Promise<void> {
    try {
      const { execSync } = require('child_process');
      const data = JSON.stringify({
        accessedAt: new Date().toISOString()
      });
      const command = `npx claude-flow@alpha memory store --key "aqe/swarm/fleet-cli-commands/logs" --value '${data}'`;
      execSync(command, { stdio: 'ignore', timeout: 5000 });
    } catch (error) {
      // Silently handle coordination errors
    }
  }

  // Helper method to generate sample logs for testing
  static async generateSampleLogs(): Promise<void> {
    const logsDir = '.agentic-qe/logs';
    await fs.ensureDir(logsDir);

    const timestamp = new Date().toISOString();
    const logFile = `${logsDir}/fleet-${new Date().toISOString().split('T')[0]}.log`;

    const sampleLogs = [
      `${timestamp} [INFO] Fleet initialized with topology: hierarchical`,
      `${timestamp} [INFO] Agent qe-test-generator spawned`,
      `${timestamp} [INFO] Agent qe-test-executor spawned`,
      `${timestamp} [WARN] Agent qe-coverage-analyzer: High memory usage detected`,
      `${timestamp} [ERROR] Task execution failed: timeout after 30s`,
      `${timestamp} [INFO] Task completed successfully in 1250ms`,
      `${timestamp} [DEBUG] Coordination message sent to agent qe-quality-gate`
    ].join('\n') + '\n';

    await fs.appendFile(logFile, sampleLogs);
  }
}
