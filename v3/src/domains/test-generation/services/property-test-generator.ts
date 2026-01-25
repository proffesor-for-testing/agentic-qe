/**
 * Agentic QE v3 - Property-Based Test Generator Service
 * Generates property-based tests using fast-check arbitraries
 *
 * Extracted from TestGeneratorService to follow Single Responsibility Principle
 */

import { PropertyTestRequest, PropertyTests } from '../interfaces';

/**
 * Interface for property-based test generation service
 * Enables dependency injection and mocking
 */
export interface IPropertyTestGeneratorService {
  generatePropertyTests(request: PropertyTestRequest): Promise<PropertyTests>;
}

/**
 * Property-Based Test Generator Service
 * Generates property-based tests with fast-check generators
 */
export class PropertyTestGeneratorService implements IPropertyTestGeneratorService {
  /**
   * Generate property-based tests
   */
  async generatePropertyTests(request: PropertyTestRequest): Promise<PropertyTests> {
    const { function: funcName, properties, constraints = {} } = request;

    const tests = properties.map((property) => ({
      property,
      testCode: this.generatePropertyTestCode(funcName, property, constraints),
      generators: this.inferGenerators(property, constraints),
    }));

    return {
      tests,
      arbitraries: this.collectArbitraries(tests),
    };
  }

  private generatePropertyTestCode(
    funcName: string,
    property: string,
    constraints: Record<string, unknown>
  ): string {
    const propertyLower = property.toLowerCase();
    const { generators, assertion, setupCode } = this.analyzePropertyForTestGeneration(
      propertyLower,
      funcName,
      constraints
    );

    return `import * as fc from 'fast-check';

describe('${funcName} property tests', () => {
  it('${property}', () => {
${setupCode}
    fc.assert(
      fc.property(${generators.join(', ')}, (${this.generatePropertyParams(generators)}) => {
        const result = ${funcName}(${this.generatePropertyArgs(generators)});
        ${assertion}
      })
    );
  });
});`;
  }

  private analyzePropertyForTestGeneration(
    propertyLower: string,
    funcName: string,
    constraints: Record<string, unknown>
  ): { generators: string[]; assertion: string; setupCode: string } {
    const generators: string[] = [];
    let assertion = 'return result !== undefined;';
    let setupCode = '';

    if (propertyLower.includes('idempotent') || propertyLower.includes('same result')) {
      generators.push(this.inferGeneratorFromConstraints(constraints, 'input'));
      assertion = `// Idempotent: applying twice gives same result
        const firstResult = ${funcName}(input);
        const secondResult = ${funcName}(firstResult);
        return JSON.stringify(firstResult) === JSON.stringify(secondResult);`;
    } else if (propertyLower.includes('commutative') || propertyLower.includes('order independent')) {
      const gen = this.inferGeneratorFromConstraints(constraints, 'value');
      generators.push(gen, gen);
      assertion = `// Commutative: order doesn't matter
        const result1 = ${funcName}(a, b);
        const result2 = ${funcName}(b, a);
        return JSON.stringify(result1) === JSON.stringify(result2);`;
    } else if (propertyLower.includes('associative')) {
      const gen = this.inferGeneratorFromConstraints(constraints, 'value');
      generators.push(gen, gen, gen);
      assertion = `// Associative: grouping doesn't matter
        const left = ${funcName}(${funcName}(a, b), c);
        const right = ${funcName}(a, ${funcName}(b, c));
        return JSON.stringify(left) === JSON.stringify(right);`;
    } else if (propertyLower.includes('identity') || propertyLower.includes('neutral element')) {
      generators.push(this.inferGeneratorFromConstraints(constraints, 'input'));
      const identity = constraints.identity !== undefined ? String(constraints.identity) : '0';
      setupCode = `    const identity = ${identity};`;
      assertion = `// Identity: operation with identity returns original
        const result = ${funcName}(input, identity);
        return JSON.stringify(result) === JSON.stringify(input);`;
    } else if (propertyLower.includes('inverse') || propertyLower.includes('reversible') ||
               propertyLower.includes('round-trip') || propertyLower.includes('encode') ||
               propertyLower.includes('decode')) {
      generators.push(this.inferGeneratorFromConstraints(constraints, 'input'));
      const inverseFn = constraints.inverse as string || `${funcName}Inverse`;
      assertion = `// Inverse: applying function and its inverse returns original
        const encoded = ${funcName}(input);
        const decoded = ${inverseFn}(encoded);
        return JSON.stringify(decoded) === JSON.stringify(input);`;
    } else if (propertyLower.includes('distributive')) {
      const gen = this.inferGeneratorFromConstraints(constraints, 'number');
      generators.push(gen, gen, gen);
      assertion = `// Distributive: f(a, b + c) === f(a, b) + f(a, c)
        const left = ${funcName}(a, b + c);
        const right = ${funcName}(a, b) + ${funcName}(a, c);
        return Math.abs(left - right) < 0.0001;`;
    } else if (propertyLower.includes('monotonic') || propertyLower.includes('preserves order') ||
               propertyLower.includes('non-decreasing') || propertyLower.includes('sorted')) {
      generators.push('fc.integer()', 'fc.integer()');
      assertion = `// Monotonic: preserves order
        const [small, large] = a <= b ? [a, b] : [b, a];
        const resultSmall = ${funcName}(small);
        const resultLarge = ${funcName}(large);
        return resultSmall <= resultLarge;`;
    } else if (propertyLower.includes('bound') || propertyLower.includes('range') ||
               propertyLower.includes('between') || propertyLower.includes('clamp')) {
      generators.push(this.inferGeneratorFromConstraints(constraints, 'input'));
      const min = constraints.min !== undefined ? constraints.min : 0;
      const max = constraints.max !== undefined ? constraints.max : 100;
      assertion = `// Bounded: result is within expected range
        const result = ${funcName}(input);
        return result >= ${min} && result <= ${max};`;
    } else if (propertyLower.includes('length') || propertyLower.includes('size')) {
      generators.push('fc.array(fc.anything())');
      if (propertyLower.includes('preserve')) {
        assertion = `// Length preserved: output has same length as input
        const result = ${funcName}(input);
        return Array.isArray(result) && result.length === input.length;`;
      } else {
        assertion = `// Length invariant
        const result = ${funcName}(input);
        return typeof result.length === 'number' || typeof result.size === 'number';`;
      }
    } else if (propertyLower.includes('type') && propertyLower.includes('preserve')) {
      generators.push('fc.anything()');
      assertion = `// Type preserved: output has same type as input
        const result = ${funcName}(input);
        return typeof result === typeof input;`;
    } else if (propertyLower.includes('never null') || propertyLower.includes('always defined') ||
               propertyLower.includes('non-null')) {
      generators.push(this.inferGeneratorFromConstraints(constraints, 'input'));
      assertion = `// Never null: always returns defined value
        const result = ${funcName}(input);
        return result !== null && result !== undefined;`;
    } else if (propertyLower.includes('deterministic') || propertyLower.includes('pure') ||
               propertyLower.includes('consistent')) {
      generators.push(this.inferGeneratorFromConstraints(constraints, 'input'));
      assertion = `// Deterministic: same input always gives same output
        const result1 = ${funcName}(input);
        const result2 = ${funcName}(input);
        return JSON.stringify(result1) === JSON.stringify(result2);`;
    } else {
      generators.push(this.inferGeneratorFromConstraints(constraints, 'input'));
      assertion = `// Basic property: function returns a value
        return result !== undefined;`;
    }

    return { generators, assertion, setupCode };
  }

  private inferGeneratorFromConstraints(
    constraints: Record<string, unknown>,
    hint: string
  ): string {
    const type = (constraints.type as string)?.toLowerCase() || hint.toLowerCase();

    if (type.includes('string') || type.includes('text')) {
      const minLength = constraints.minLength as number | undefined;
      const maxLength = constraints.maxLength as number | undefined;
      if (minLength !== undefined || maxLength !== undefined) {
        return `fc.string({ minLength: ${minLength ?? 0}, maxLength: ${maxLength ?? 100} })`;
      }
      return 'fc.string()';
    }

    if (type.includes('number') || type.includes('int') || type.includes('value')) {
      const min = constraints.min as number | undefined;
      const max = constraints.max as number | undefined;
      if (min !== undefined || max !== undefined) {
        return `fc.integer({ min: ${min ?? Number.MIN_SAFE_INTEGER}, max: ${max ?? Number.MAX_SAFE_INTEGER} })`;
      }
      return 'fc.integer()';
    }

    if (type.includes('float') || type.includes('decimal')) return 'fc.float()';
    if (type.includes('boolean') || type.includes('bool')) return 'fc.boolean()';
    if (type.includes('array') || type.includes('list')) {
      const itemType = constraints.itemType as string || 'anything';
      const itemGen = this.getSimpleGenerator(itemType);
      return `fc.array(${itemGen})`;
    }
    if (type.includes('object') || type.includes('record')) return 'fc.object()';
    if (type.includes('date')) return 'fc.date()';
    if (type.includes('uuid') || type.includes('id')) return 'fc.uuid()';
    if (type.includes('email')) return 'fc.emailAddress()';

    return 'fc.anything()';
  }

  private getSimpleGenerator(typeName: string): string {
    const typeMap: Record<string, string> = {
      string: 'fc.string()',
      number: 'fc.integer()',
      integer: 'fc.integer()',
      float: 'fc.float()',
      boolean: 'fc.boolean()',
      date: 'fc.date()',
      uuid: 'fc.uuid()',
      anything: 'fc.anything()',
    };
    return typeMap[typeName.toLowerCase()] || 'fc.anything()';
  }

  private generatePropertyParams(generators: string[]): string {
    if (generators.length === 1) return 'input';
    return generators.map((_, i) => String.fromCharCode(97 + i)).join(', ');
  }

  private generatePropertyArgs(generators: string[]): string {
    if (generators.length === 1) return 'input';
    return generators.map((_, i) => String.fromCharCode(97 + i)).join(', ');
  }

  private inferGenerators(
    property: string,
    constraints: Record<string, unknown>
  ): string[] {
    const generators: string[] = [];
    const propertyLower = property.toLowerCase();

    if (propertyLower.includes('string') || propertyLower.includes('text') ||
        propertyLower.includes('name') || propertyLower.includes('email')) {
      if (constraints.minLength || constraints.maxLength) {
        const min = constraints.minLength ?? 0;
        const max = constraints.maxLength ?? 100;
        generators.push(`fc.string({ minLength: ${min}, maxLength: ${max} })`);
      } else {
        generators.push('fc.string()');
      }
      if (propertyLower.includes('email')) {
        generators.push('fc.emailAddress()');
      }
    }

    if (propertyLower.includes('number') || propertyLower.includes('count') ||
        propertyLower.includes('amount') || propertyLower.includes('integer') ||
        propertyLower.includes('positive') || propertyLower.includes('negative')) {
      if (propertyLower.includes('positive')) {
        generators.push('fc.nat()');
      } else if (propertyLower.includes('negative')) {
        generators.push('fc.integer({ max: -1 })');
      } else if (constraints.min !== undefined || constraints.max !== undefined) {
        const min = constraints.min ?? Number.MIN_SAFE_INTEGER;
        const max = constraints.max ?? Number.MAX_SAFE_INTEGER;
        generators.push(`fc.integer({ min: ${min}, max: ${max} })`);
      } else {
        generators.push('fc.integer()');
      }
      if (propertyLower.includes('float') || propertyLower.includes('decimal')) {
        generators.push('fc.float()');
      }
    }

    if (propertyLower.includes('boolean') || propertyLower.includes('flag')) {
      generators.push('fc.boolean()');
    }

    if (propertyLower.includes('array') || propertyLower.includes('list') ||
        propertyLower.includes('collection')) {
      const itemType = constraints.itemType as string || 'anything';
      const itemGen = this.getGeneratorForType(itemType);
      if (constraints.minItems || constraints.maxItems) {
        const min = constraints.minItems ?? 0;
        const max = constraints.maxItems ?? 10;
        generators.push(`fc.array(${itemGen}, { minLength: ${min}, maxLength: ${max} })`);
      } else {
        generators.push(`fc.array(${itemGen})`);
      }
    }

    if (propertyLower.includes('object') || propertyLower.includes('record')) {
      generators.push('fc.object()');
      generators.push('fc.dictionary(fc.string(), fc.anything())');
    }

    if (propertyLower.includes('date') || propertyLower.includes('time')) {
      generators.push('fc.date()');
    }

    if (propertyLower.includes('uuid') || propertyLower.includes('id')) {
      generators.push('fc.uuid()');
    }

    if (generators.length === 0) {
      generators.push('fc.anything()');
    }

    return generators;
  }

  private getGeneratorForType(type: string): string {
    const typeGenerators: Record<string, string> = {
      string: 'fc.string()',
      number: 'fc.integer()',
      integer: 'fc.integer()',
      float: 'fc.float()',
      boolean: 'fc.boolean()',
      date: 'fc.date()',
      uuid: 'fc.uuid()',
      anything: 'fc.anything()',
    };
    return typeGenerators[type.toLowerCase()] || 'fc.anything()';
  }

  private collectArbitraries(tests: { generators: string[] }[]): string[] {
    const arbitraries = new Set<string>();
    for (const test of tests) {
      test.generators.forEach((g) => arbitraries.add(g));
    }
    return Array.from(arbitraries);
  }
}
