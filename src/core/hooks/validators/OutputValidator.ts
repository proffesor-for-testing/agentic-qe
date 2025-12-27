/**
 * OutputValidator - Validates task output structure and data types
 */

export interface OutputValidationOptions {
  output: Record<string, unknown>;
  expectedStructure?: Record<string, string>;
  expectedTypes?: Record<string, string>;
  requiredFields?: string[];
}

export interface OutputValidationResult {
  valid: boolean;
  validations: string[];
  errors: string[];
  details?: Record<string, unknown>;
}

export class OutputValidator {
  async validate(options: OutputValidationOptions): Promise<OutputValidationResult> {
    const validations: string[] = [];
    const errors: string[] = [];
    let valid = true;

    // Validate structure
    if (options.expectedStructure) {
      validations.push('structure');

      for (const [key, type] of Object.entries(options.expectedStructure)) {
        if (options.output[key] === undefined) {
          errors.push(`Missing field: ${key}`);
          valid = false;
        } else if (typeof options.output[key] !== type) {
          errors.push(`Type mismatch for ${key}: expected ${type}, got ${typeof options.output[key]}`);
          valid = false;
        }
      }
    }

    // Validate types
    if (options.expectedTypes) {
      validations.push('types');

      for (const [key, type] of Object.entries(options.expectedTypes)) {
        if (options.output[key] !== undefined && typeof options.output[key] !== type) {
          errors.push(`Type validation failed for ${key}: expected ${type}, got ${typeof options.output[key]}`);
          valid = false;
        }
      }
    }

    // Check required fields
    if (options.requiredFields) {
      validations.push('required-fields');

      for (const field of options.requiredFields) {
        if (options.output[field] === undefined) {
          errors.push(`Missing required field: ${field}`);
          valid = false;
        }
      }
    }

    return {
      valid,
      validations,
      errors,
      details: {
        checkedFields: Object.keys(options.output)
      }
    };
  }
}
