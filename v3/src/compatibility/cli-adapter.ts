/**
 * CLI Adapter - Adapts V2 CLI commands to V3 format
 */

import { CLICommandMapping, CLIResolution } from './types';
import { AgentMapper } from './agent-mapper';

/**
 * V2 to V3 CLI command mappings
 */
const CLI_MAPPINGS: CLICommandMapping[] = [
  // Test commands
  {
    v2Command: 'aqe generate tests',
    v3Command: 'aqe-v3 test generate',
    argMapping: {
      '--file': '--file',
      '--coverage': '--coverage',
      '--framework': '--framework',
    },
    deprecated: true,
  },
  {
    v2Command: 'aqe run tests',
    v3Command: 'aqe-v3 test run',
    argMapping: {
      '--parallel': '--parallel',
      '--workers': '--workers',
      '--retry': '--retry',
    },
    deprecated: true,
  },

  // Coverage commands
  {
    v2Command: 'aqe analyze coverage',
    v3Command: 'aqe-v3 coverage analyze',
    argMapping: {
      '--source': '--source',
      '--threshold': '--threshold',
    },
    deprecated: true,
  },
  {
    v2Command: 'aqe coverage gaps',
    v3Command: 'aqe-v3 coverage gaps',
    deprecated: true,
  },
  {
    v2Command: 'aqe coverage report',
    v3Command: 'aqe-v3 coverage report',
    deprecated: true,
  },

  // Quality commands
  {
    v2Command: 'aqe check quality',
    v3Command: 'aqe-v3 quality assess',
    argMapping: {
      '--gates': '--gates',
    },
    deprecated: true,
  },
  {
    v2Command: 'aqe quality gate',
    v3Command: 'aqe-v3 quality assess --gates all',
    deprecated: true,
  },

  // Security commands
  {
    v2Command: 'aqe security scan',
    v3Command: 'aqe-v3 security scan',
    deprecated: true,
  },
  {
    v2Command: 'aqe security audit',
    v3Command: 'aqe-v3 security compliance',
    deprecated: true,
  },

  // Code intelligence commands
  {
    v2Command: 'aqe kg index',
    v3Command: 'aqe-v3 kg index',
    deprecated: true,
  },
  {
    v2Command: 'aqe kg search',
    v3Command: 'aqe-v3 kg search',
    deprecated: true,
  },

  // Learning commands
  {
    v2Command: 'aqe learn status',
    v3Command: 'aqe-v3 learn status',
    deprecated: true,
  },
  {
    v2Command: 'aqe patterns list',
    v3Command: 'aqe-v3 learn patterns',
    deprecated: true,
  },

  // Init command
  {
    v2Command: 'aqe init',
    v3Command: 'aqe-v3 init',
    deprecated: true,
  },
];

/**
 * CLI Adapter class for V2 to V3 command translation
 */
export class CLIAdapter {
  private mappings: Map<string, CLICommandMapping>;
  private readonly _agentMapper: AgentMapper;

  constructor(agentMapper: AgentMapper) {
    this._agentMapper = agentMapper;
    this.mappings = new Map();

    for (const mapping of CLI_MAPPINGS) {
      // Normalize command for matching
      const normalized = this.normalizeCommand(mapping.v2Command);
      this.mappings.set(normalized, mapping);
    }
  }

  /**
   * Get the agent mapper for agent-related resolution
   */
  get agentMapper(): AgentMapper {
    return this._agentMapper;
  }

  /**
   * Resolve a CLI command from v2 to v3 format
   */
  resolve(command: string, args: string[] = []): CLIResolution {
    const normalized = this.normalizeCommand(command);

    // Already v3 format
    if (command.startsWith('aqe-v3')) {
      return {
        resolved: true,
        v3Command: command,
        v3Args: args,
        wasV2: false,
      };
    }

    // Try to find mapping
    for (const [key, mapping] of this.mappings) {
      if (normalized.startsWith(key)) {
        const v3Args = this.translateArgs(args, mapping.argMapping);
        return {
          resolved: true,
          v3Command: mapping.v3Command,
          v3Args,
          wasV2: true,
          deprecationWarning: `Command "${command}" is deprecated. Use "${mapping.v3Command}" instead.`,
        };
      }
    }

    // Try partial match
    const partialMatch = this.findPartialMatch(normalized);
    if (partialMatch) {
      const v3Args = this.translateArgs(args, partialMatch.argMapping);
      return {
        resolved: true,
        v3Command: partialMatch.v3Command,
        v3Args,
        wasV2: true,
        deprecationWarning: `Command "${command}" is deprecated. Use "${partialMatch.v3Command}" instead.`,
      };
    }

    return {
      resolved: false,
      v3Command: null,
      v3Args: args,
      wasV2: false,
    };
  }

  /**
   * Translate v2 command arguments to v3 format
   */
  private translateArgs(
    args: string[],
    mapping?: Record<string, string>
  ): string[] {
    if (!mapping) return args;

    const translated: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (mapping[arg]) {
        translated.push(mapping[arg]);
      } else {
        translated.push(arg);
      }
    }
    return translated;
  }

  /**
   * Normalize command for comparison
   */
  private normalizeCommand(command: string): string {
    return command.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Find partial match for command
   */
  private findPartialMatch(command: string): CLICommandMapping | null {
    for (const [key, mapping] of this.mappings) {
      if (command.includes(key.split(' ').slice(1).join(' '))) {
        return mapping;
      }
    }
    return null;
  }

  /**
   * Get all CLI mappings
   */
  getAllMappings(): CLICommandMapping[] {
    return CLI_MAPPINGS;
  }

  /**
   * Build full v3 command from parts
   */
  buildV3Command(v3Command: string, args: string[]): string {
    if (args.length === 0) return v3Command;
    return `${v3Command} ${args.join(' ')}`;
  }

  /**
   * Parse a command string into command and args
   */
  parseCommand(fullCommand: string): { command: string; args: string[] } {
    const parts = fullCommand.split(/\s+/);
    // Find where args start (first part starting with -)
    const argsStartIndex = parts.findIndex((p) => p.startsWith('-'));

    if (argsStartIndex === -1) {
      return { command: fullCommand, args: [] };
    }

    return {
      command: parts.slice(0, argsStartIndex).join(' '),
      args: parts.slice(argsStartIndex),
    };
  }

  /**
   * Generate CLI migration guide
   */
  generateMigrationGuide(): string {
    let guide = '# CLI Command Migration Guide\n\n';
    guide += '| V2 Command | V3 Command |\n';
    guide += '|------------|------------|\n';

    for (const mapping of CLI_MAPPINGS) {
      guide += `| \`${mapping.v2Command}\` | \`${mapping.v3Command}\` |\n`;
    }

    return guide;
  }
}
