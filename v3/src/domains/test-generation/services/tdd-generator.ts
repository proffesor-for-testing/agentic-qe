/**
 * Agentic QE v3 - TDD Generator Service
 * Handles Test-Driven Development workflow (Red-Green-Refactor)
 *
 * Extracted from TestGeneratorService to follow Single Responsibility Principle
 */

import { TDDRequest, TDDResult } from '../interfaces';

/**
 * Interface for TDD generation service
 * Enables dependency injection and mocking
 */
export interface ITDDGeneratorService {
  generateTDDTests(request: TDDRequest): Promise<TDDResult>;
}

/**
 * TDD Generator Service
 * Generates code and tests following TDD workflow phases
 */
export class TDDGeneratorService implements ITDDGeneratorService {
  /**
   * Generate TDD artifacts based on the requested phase
   */
  async generateTDDTests(request: TDDRequest): Promise<TDDResult> {
    const { feature, behavior, framework, phase } = request;

    switch (phase) {
      case 'red':
        return this.generateRedPhaseTest(feature, behavior, framework);
      case 'green':
        return this.generateGreenPhaseCode(feature, behavior, framework);
      case 'refactor':
        return this.generateRefactoringSuggestions(feature, behavior);
      default:
        throw new Error(`Unknown TDD phase: ${phase}`);
    }
  }

  private generateRedPhaseTest(
    feature: string,
    behavior: string,
    _framework: string
  ): TDDResult {
    const funcName = this.camelCase(feature);
    const assertions = this.generateAssertionsFromBehavior(behavior, funcName);

    const testCode = `describe('${feature}', () => {
  it('${behavior}', () => {
    // Red phase: This test should fail initially
${assertions}
  });
});`;

    return {
      phase: 'red',
      testCode,
      nextStep: 'Write the minimal implementation to make this test pass',
    };
  }

  private generateAssertionsFromBehavior(behavior: string, funcName: string): string {
    const behaviorLower = behavior.toLowerCase();
    const assertions: string[] = [];
    const context = this.extractBehaviorContext(behavior);
    const funcCall = this.buildFunctionCall(funcName, context, behaviorLower);

    if (context.setupCode) {
      assertions.push(context.setupCode);
    }

    if (behaviorLower.includes('return') && behaviorLower.includes('true')) {
      assertions.push(`    const result = ${funcCall};`);
      assertions.push(`    expect(result).toBe(true);`);
    } else if (behaviorLower.includes('return') && behaviorLower.includes('false')) {
      assertions.push(`    const result = ${funcCall};`);
      assertions.push(`    expect(result).toBe(false);`);
    } else if (behaviorLower.includes('throw') || behaviorLower.includes('error')) {
      const errorMsg = context.extractedString || 'Error';
      assertions.push(`    expect(() => ${funcCall}).toThrow(${context.extractedString ? `'${errorMsg}'` : ''});`);
    } else if (behaviorLower.includes('empty') || behaviorLower.includes('nothing')) {
      assertions.push(`    const result = ${funcCall};`);
      if (behaviorLower.includes('string')) {
        assertions.push(`    expect(result).toBe('');`);
      } else if (behaviorLower.includes('object')) {
        assertions.push(`    expect(result).toEqual({});`);
      } else {
        assertions.push(`    expect(result).toEqual([]);`);
      }
    } else if (behaviorLower.includes('null')) {
      assertions.push(`    const result = ${funcCall};`);
      assertions.push(`    expect(result).toBeNull();`);
    } else if (behaviorLower.includes('undefined')) {
      assertions.push(`    const result = ${funcCall};`);
      assertions.push(`    expect(result).toBeUndefined();`);
    } else if (behaviorLower.includes('contain') || behaviorLower.includes('include')) {
      assertions.push(`    const result = ${funcCall};`);
      const expectedValue = context.extractedString || context.extractedNumber?.toString() || 'expectedItem';
      if (context.extractedString) {
        assertions.push(`    expect(result).toContain('${expectedValue}');`);
      } else if (context.extractedNumber !== undefined) {
        assertions.push(`    expect(result).toContain(${expectedValue});`);
      } else {
        assertions.push(`    expect(result).toContain(testInput);`);
      }
    } else if (behaviorLower.includes('length') || behaviorLower.includes('count')) {
      assertions.push(`    const result = ${funcCall};`);
      const expectedLength = context.extractedNumber ?? 3;
      assertions.push(`    expect(result).toHaveLength(${expectedLength});`);
    } else if (behaviorLower.includes('equal') || behaviorLower.includes('match')) {
      assertions.push(`    const result = ${funcCall};`);
      if (context.extractedString) {
        assertions.push(`    expect(result).toEqual('${context.extractedString}');`);
      } else if (context.extractedNumber !== undefined) {
        assertions.push(`    expect(result).toEqual(${context.extractedNumber});`);
      } else {
        assertions.push(`    expect(result).toEqual(expectedOutput);`);
      }
    } else if (behaviorLower.includes('greater') || behaviorLower.includes('more than')) {
      assertions.push(`    const result = ${funcCall};`);
      const threshold = context.extractedNumber ?? 0;
      assertions.push(`    expect(result).toBeGreaterThan(${threshold});`);
    } else if (behaviorLower.includes('less') || behaviorLower.includes('fewer')) {
      assertions.push(`    const result = ${funcCall};`);
      const threshold = context.extractedNumber ?? 100;
      assertions.push(`    expect(result).toBeLessThan(${threshold});`);
    } else if (behaviorLower.includes('valid') || behaviorLower.includes('success')) {
      assertions.push(`    const result = ${funcCall};`);
      assertions.push(`    expect(result).toBeDefined();`);
      if (behaviorLower.includes('object') || behaviorLower.includes('response')) {
        assertions.push(`    expect(result.success ?? result.valid ?? result.ok).toBeTruthy();`);
      } else {
        assertions.push(`    expect(result).toBeTruthy();`);
      }
    } else if (behaviorLower.includes('array') || behaviorLower.includes('list')) {
      assertions.push(`    const result = ${funcCall};`);
      assertions.push(`    expect(Array.isArray(result)).toBe(true);`);
      if (context.extractedNumber !== undefined) {
        assertions.push(`    expect(result.length).toBeGreaterThanOrEqual(${context.extractedNumber});`);
      }
    } else if (behaviorLower.includes('object')) {
      assertions.push(`    const result = ${funcCall};`);
      assertions.push(`    expect(typeof result).toBe('object');`);
      assertions.push(`    expect(result).not.toBeNull();`);
    } else if (behaviorLower.includes('string')) {
      assertions.push(`    const result = ${funcCall};`);
      assertions.push(`    expect(typeof result).toBe('string');`);
      if (context.extractedString) {
        assertions.push(`    expect(result).toContain('${context.extractedString}');`);
      }
    } else if (behaviorLower.includes('number')) {
      assertions.push(`    const result = ${funcCall};`);
      assertions.push(`    expect(typeof result).toBe('number');`);
      assertions.push(`    expect(Number.isNaN(result)).toBe(false);`);
    } else {
      assertions.push(`    const result = ${funcCall};`);
      assertions.push(`    expect(result).toBeDefined();`);
    }

    return assertions.join('\n');
  }

  private extractBehaviorContext(behavior: string): {
    extractedString?: string;
    extractedNumber?: number;
    inputType?: string;
    setupCode?: string;
  } {
    const context: {
      extractedString?: string;
      extractedNumber?: number;
      inputType?: string;
      setupCode?: string;
    } = {};

    const stringMatch = behavior.match(/["']([^"']+)["']/);
    if (stringMatch) {
      context.extractedString = stringMatch[1];
    }

    const numberMatch = behavior.match(/\b(\d+)\b/);
    if (numberMatch) {
      context.extractedNumber = parseInt(numberMatch[1], 10);
    }

    if (/\b(email|e-mail)\b/i.test(behavior)) {
      context.inputType = 'email';
      context.setupCode = `    const testInput = 'test@example.com';`;
    } else if (/\b(url|link|href)\b/i.test(behavior)) {
      context.inputType = 'url';
      context.setupCode = `    const testInput = 'https://example.com';`;
    } else if (/\b(date|time|timestamp)\b/i.test(behavior)) {
      context.inputType = 'date';
      context.setupCode = `    const testInput = new Date('2024-01-15');`;
    } else if (/\b(id|uuid|identifier)\b/i.test(behavior)) {
      context.inputType = 'id';
      context.setupCode = `    const testInput = 'abc-123-def';`;
    } else if (/\b(user|person|customer)\b/i.test(behavior)) {
      context.inputType = 'user';
      context.setupCode = `    const testInput = { id: '1', name: 'Test User', email: 'test@example.com' };`;
    } else if (/\b(config|options|settings)\b/i.test(behavior)) {
      context.inputType = 'config';
      context.setupCode = `    const testInput = { enabled: true, timeout: 5000 };`;
    }

    return context;
  }

  private buildFunctionCall(
    funcName: string,
    context: { inputType?: string; extractedString?: string; extractedNumber?: number },
    behaviorLower: string
  ): string {
    if (context.inputType) {
      return `${funcName}(testInput)`;
    }

    if (!behaviorLower.includes('with') && !behaviorLower.includes('given') && !behaviorLower.includes('for')) {
      return `${funcName}()`;
    }

    if (behaviorLower.includes('string') || behaviorLower.includes('text') || behaviorLower.includes('name')) {
      const value = context.extractedString || 'test input';
      return `${funcName}('${value}')`;
    }
    if (behaviorLower.includes('number') || behaviorLower.includes('count') || behaviorLower.includes('amount')) {
      const value = context.extractedNumber ?? 42;
      return `${funcName}(${value})`;
    }
    if (behaviorLower.includes('array') || behaviorLower.includes('list') || behaviorLower.includes('items')) {
      return `${funcName}([1, 2, 3])`;
    }
    if (behaviorLower.includes('object') || behaviorLower.includes('data') || behaviorLower.includes('payload')) {
      return `${funcName}({ key: 'value' })`;
    }
    if (behaviorLower.includes('boolean') || behaviorLower.includes('flag')) {
      return `${funcName}(true)`;
    }

    if (context.extractedString) {
      return `${funcName}('${context.extractedString}')`;
    }
    if (context.extractedNumber !== undefined) {
      return `${funcName}(${context.extractedNumber})`;
    }

    return `${funcName}(input)`;
  }

  private generateGreenPhaseCode(
    feature: string,
    behavior: string,
    _framework: string
  ): TDDResult {
    const behaviorLower = behavior.toLowerCase();
    const funcName = this.camelCase(feature);
    const { returnType, implementation, params } = this.inferImplementationFromBehavior(behaviorLower);

    const implementationCode = `/**
 * ${feature}
 * Behavior: ${behavior}
 */
export function ${funcName}(${params}): ${returnType} {
${implementation}
}`;

    return {
      phase: 'green',
      implementationCode,
      nextStep: 'Refactor the code while keeping tests green',
    };
  }

  private inferImplementationFromBehavior(behavior: string): {
    returnType: string;
    implementation: string;
    params: string;
  } {
    let returnType = 'unknown';
    let implementation = '  return undefined;';
    let params = '';

    if (behavior.includes('return') || behavior.includes('returns')) {
      if (behavior.includes('boolean') || behavior.includes('true') || behavior.includes('false') ||
          behavior.includes('valid') || behavior.includes('is ') || behavior.includes('has ') ||
          behavior.includes('can ') || behavior.includes('should ')) {
        returnType = 'boolean';
        implementation = '  // Validate and return boolean result\n  return true;';
      } else if (behavior.includes('number') || behavior.includes('count') || behavior.includes('sum') ||
                 behavior.includes('total') || behavior.includes('calculate') || behavior.includes('average')) {
        returnType = 'number';
        implementation = '  // Perform calculation and return result\n  return 0;';
      } else if (behavior.includes('string') || behavior.includes('text') || behavior.includes('message') ||
                 behavior.includes('name') || behavior.includes('format')) {
        returnType = 'string';
        implementation = "  // Process and return string result\n  return '';";
      } else if (behavior.includes('array') || behavior.includes('list') || behavior.includes('items') ||
                 behavior.includes('collection') || behavior.includes('filter') || behavior.includes('map')) {
        returnType = 'unknown[]';
        implementation = '  // Process and return array\n  return [];';
      } else if (behavior.includes('object') || behavior.includes('data') || behavior.includes('result') ||
                 behavior.includes('response')) {
        returnType = 'Record<string, unknown>';
        implementation = '  // Build and return object\n  return {};';
      }
    }

    if (behavior.includes('async') || behavior.includes('await') || behavior.includes('promise') ||
        behavior.includes('fetch') || behavior.includes('load') || behavior.includes('save') ||
        behavior.includes('api') || behavior.includes('request')) {
      returnType = `Promise<${returnType}>`;
      implementation = implementation.replace('return ', 'return await Promise.resolve(').replace(';', ');');
    }

    const paramPatterns: Array<{ pattern: RegExp; param: string }> = [
      { pattern: /(?:with|given|for|using)\s+(?:a\s+)?(?:string|text|name)/i, param: 'input: string' },
      { pattern: /(?:with|given|for|using)\s+(?:a\s+)?(?:number|count|amount)/i, param: 'value: number' },
      { pattern: /(?:with|given|for|using)\s+(?:an?\s+)?(?:array|list|items)/i, param: 'items: unknown[]' },
      { pattern: /(?:with|given|for|using)\s+(?:an?\s+)?(?:object|data)/i, param: 'data: Record<string, unknown>' },
      { pattern: /(?:with|given|for|using)\s+(?:an?\s+)?id/i, param: 'id: string' },
      { pattern: /(?:with|given|for|using)\s+(?:valid|invalid)\s+input/i, param: 'input: unknown' },
      { pattern: /(?:when|if)\s+(?:called\s+)?(?:with|without)/i, param: 'input?: unknown' },
    ];

    const detectedParams: string[] = [];
    for (const { pattern, param } of paramPatterns) {
      if (pattern.test(behavior) && !detectedParams.includes(param)) {
        detectedParams.push(param);
      }
    }
    params = detectedParams.join(', ');

    if (behavior.includes('validate') || behavior.includes('check') || behavior.includes('verify')) {
      if (params.includes('input')) {
        implementation = `  // Validate the input
  if (input === undefined || input === null) {
    throw new Error('Invalid input');
  }
${implementation}`;
      }
    }

    if (behavior.includes('throw') || behavior.includes('error') || behavior.includes('exception') ||
        behavior.includes('invalid') || behavior.includes('fail')) {
      if (behavior.includes('when') || behavior.includes('if')) {
        implementation = `  // Check for error conditions
  if (!input) {
    throw new Error('Validation failed');
  }
${implementation}`;
      }
    }

    return { returnType, implementation, params };
  }

  private generateRefactoringSuggestions(
    _feature: string,
    _behavior: string
  ): TDDResult {
    return {
      phase: 'refactor',
      refactoringChanges: [
        'Extract common logic into helper functions',
        'Apply single responsibility principle',
        'Consider adding type safety improvements',
        'Review naming conventions',
        'Optimize performance if needed',
      ],
      nextStep: 'Apply refactoring changes and ensure all tests still pass',
    };
  }

  private camelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^./, (chr) => chr.toLowerCase());
  }
}
