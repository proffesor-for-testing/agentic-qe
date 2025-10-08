/**
 * ConfigurationChecker - Validates configuration schema and values
 */

import { ISwarmMemoryManager } from '../../../types/memory-interfaces';

export interface ConfigurationCheckOptions {
  config: Record<string, any>;
  schema?: Record<string, { type: string; min?: number; max?: number }>;
  requiredKeys?: string[];
  validateAgainstStored?: boolean;
  storedKey?: string;
}

export interface ConfigurationCheckResult {
  passed: boolean;
  checks: string[];
  details: {
    errors: string[];
    missingKeys?: string[];
    schemaViolations?: string[];
  };
}

export class ConfigurationChecker {
  constructor(private memory?: ISwarmMemoryManager) {}

  async check(options: ConfigurationCheckOptions): Promise<ConfigurationCheckResult> {
    const checks: string[] = [];
    const details: ConfigurationCheckResult['details'] = {
      errors: [],
      missingKeys: [],
      schemaViolations: []
    };

    let passed = true;

    // Validate schema
    if (options.schema) {
      checks.push('schema-validation');

      for (const [key, schema] of Object.entries(options.schema)) {
        const value = options.config[key];

        if (value === undefined) {
          details.schemaViolations!.push(`Missing key: ${key}`);
          passed = false;
          continue;
        }

        // Type validation
        const actualType = typeof value;
        if (actualType !== schema.type) {
          details.schemaViolations!.push(
            `Type mismatch for ${key}: expected ${schema.type}, got ${actualType}`
          );
          details.errors.push(`Invalid type for ${key}`);
          passed = false;
        }

        // Range validation for numbers
        if (schema.type === 'number' && typeof value === 'number') {
          if (schema.min !== undefined && value < schema.min) {
            details.schemaViolations!.push(`${key} below minimum: ${value} < ${schema.min}`);
            details.errors.push(`${key} out of range`);
            passed = false;
          }
          if (schema.max !== undefined && value > schema.max) {
            details.schemaViolations!.push(`${key} above maximum: ${value} > ${schema.max}`);
            details.errors.push(`${key} out of range`);
            passed = false;
          }
        }
      }
    }

    // Check required keys
    if (options.requiredKeys && options.requiredKeys.length > 0) {
      checks.push('required-keys');

      for (const key of options.requiredKeys) {
        if (options.config[key] === undefined) {
          details.missingKeys!.push(key);
          details.errors.push(`Missing required key: ${key}`);
          passed = false;
        }
      }
    }

    // Validate against stored configuration
    if (options.validateAgainstStored && this.memory && options.storedKey) {
      checks.push('baseline-comparison');

      try {
        const stored = await this.memory.retrieve(options.storedKey, {
          partition: 'configuration'
        });

        if (stored) {
          const differences = this.compareConfigs(options.config, stored);
          if (differences.length > 0) {
            details.errors.push(...differences);
            // Note: differences don't necessarily mean failure, just information
          }
        }
      } catch (error) {
        details.errors.push('Failed to retrieve stored configuration');
      }
    }

    return {
      passed,
      checks,
      details
    };
  }

  private compareConfigs(current: any, stored: any): string[] {
    const differences: string[] = [];

    for (const key of Object.keys(stored)) {
      if (JSON.stringify(current[key]) !== JSON.stringify(stored[key])) {
        differences.push(`Configuration mismatch for ${key}`);
      }
    }

    return differences;
  }
}
