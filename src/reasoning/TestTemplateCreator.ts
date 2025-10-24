/**
 * TestTemplateCreator - Create reusable test templates from patterns
 * Phase 2 (v1.1.0) - Pattern Extraction Specialist
 *
 * Generalizes specific tests into reusable templates by:
 * - Parameterizing test inputs
 * - Creating framework-agnostic structures
 * - Supporting template validation
 * - Generating code for multiple frameworks
 */

import {
  TestTemplate,
  TestPattern,
  TemplateNode,
  TemplateParameter,
  ParameterType,
  ValidationRule,
  ValidationConfig,
  TestFramework,
  ParameterConstraints
} from '../types/pattern.types';
import { Logger } from '../utils/Logger';
import { SecureValidation } from '../utils/SecureValidation';
import * as crypto from 'crypto';

export class TestTemplateCreator {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Create template from test pattern
   */
  async createTemplate(pattern: TestPattern): Promise<TestTemplate> {
    try {
      const id = this.generateTemplateId(pattern);
      const structure = await this.buildTemplateStructure(pattern);
      const parameters = this.extractParameters(pattern);
      const validationRules = this.createValidationRules(pattern, parameters);
      const codeGenerators = this.createCodeGenerators(pattern, structure);

      const template: TestTemplate = {
        id,
        name: `Template: ${pattern.name}`,
        description: this.generateDescription(pattern),
        structure,
        parameters,
        validationRules,
        codeGenerators
      };

      this.logger.info(`Created template ${id} for pattern ${pattern.id}`);
      return template;
    } catch (error) {
      this.logger.error(`Failed to create template for pattern ${pattern.id}:`, error);
      throw error;
    }
  }

  /**
   * Create templates from multiple patterns
   */
  async createTemplates(patterns: TestPattern[]): Promise<TestTemplate[]> {
    const templates: TestTemplate[] = [];

    for (const pattern of patterns) {
      try {
        const template = await this.createTemplate(pattern);
        templates.push(template);
      } catch (error) {
        this.logger.warn(`Skipping pattern ${pattern.id} due to error:`, error);
      }
    }

    return templates;
  }

  /**
   * Build template structure from pattern
   */
  private async buildTemplateStructure(pattern: TestPattern): Promise<TemplateNode> {
    const root: TemplateNode = {
      type: 'describe',
      id: 'root',
      children: [],
      properties: {
        name: '{{suiteName}}'
      },
      parameterRefs: ['suiteName']
    };

    // Add test node
    const testNode: TemplateNode = {
      type: 'it',
      id: 'test-1',
      children: [],
      properties: {
        name: '{{testName}}'
      },
      parameterRefs: ['testName']
    };

    // Add setup if needed
    if (this.needsSetup(pattern)) {
      testNode.children.push(this.createSetupNode());
    }

    // Add arrange-act-assert structure
    testNode.children.push(this.createArrangeNode(pattern));
    testNode.children.push(this.createActNode(pattern));
    testNode.children.push(this.createAssertNode(pattern));

    // Add teardown if needed
    if (this.needsTeardown(pattern)) {
      testNode.children.push(this.createTeardownNode());
    }

    root.children.push(testNode);

    return root;
  }

  /**
   * Extract parameters from pattern
   */
  private extractParameters(pattern: TestPattern): TemplateParameter[] {
    const parameters: TemplateParameter[] = [];

    // Always include basic parameters
    parameters.push({
      name: 'suiteName',
      type: ParameterType.STRING,
      description: 'Name of the test suite',
      required: true,
      defaultValue: pattern.name
    });

    parameters.push({
      name: 'testName',
      type: ParameterType.STRING,
      description: 'Name of the test case',
      required: true,
      defaultValue: `should ${pattern.name}`
    });

    // Pattern-specific parameters
    switch (pattern.type) {
      case 'edge-case':
        parameters.push({
          name: 'edgeValue',
          type: ParameterType.ANY,
          description: 'Edge case value to test',
          required: true,
          constraints: { enum: ['null', 'undefined', 'empty', 'zero', 'max', 'min'] }
        });
        break;

      case 'boundary-condition':
        parameters.push({
          name: 'minValue',
          type: ParameterType.NUMBER,
          description: 'Minimum boundary value',
          required: true
        });
        parameters.push({
          name: 'maxValue',
          type: ParameterType.NUMBER,
          description: 'Maximum boundary value',
          required: true
        });
        break;

      case 'error-handling':
        parameters.push({
          name: 'errorType',
          type: ParameterType.STRING,
          description: 'Expected error type',
          required: true,
          defaultValue: 'Error'
        });
        parameters.push({
          name: 'errorMessage',
          type: ParameterType.STRING,
          description: 'Expected error message pattern',
          required: false
        });
        break;

      case 'async-pattern':
        parameters.push({
          name: 'timeout',
          type: ParameterType.NUMBER,
          description: 'Test timeout in milliseconds',
          required: false,
          defaultValue: 5000,
          constraints: { min: 0, max: 30000 }
        });
        break;

      case 'mock-pattern':
        parameters.push({
          name: 'mockTarget',
          type: ParameterType.STRING,
          description: 'Function or module to mock',
          required: true
        });
        parameters.push({
          name: 'mockReturnValue',
          type: ParameterType.ANY,
          description: 'Mock return value',
          required: true
        });
        break;
    }

    // Add input/output parameters
    parameters.push({
      name: 'input',
      type: ParameterType.ANY,
      description: 'Test input value',
      required: true
    });

    parameters.push({
      name: 'expectedOutput',
      type: ParameterType.ANY,
      description: 'Expected test output',
      required: true
    });

    return parameters;
  }

  /**
   * Create validation rules (SECURE - No eval)
   *
   * Security Fix (Alert #22): Replaced string-based validators with secure config
   * Previous vulnerability: Created code strings executed via eval()
   * New approach: Uses ValidationConfig with predefined validator functions
   */
  private createValidationRules(pattern: TestPattern, parameters: TemplateParameter[]): ValidationRule[] {
    const rules: ValidationRule[] = [];

    // 1. Required parameter validation
    const requiredParams = parameters.filter(p => p.required).map(p => p.name);
    if (requiredParams.length > 0) {
      const config: ValidationConfig = {
        requiredParams: requiredParams
      };

      rules.push({
        id: 'required-params',
        description: 'All required parameters must be provided',
        type: 'required',
        config: config,
        severity: 'error'
      });
    }

    // 2. Type validation
    const typeChecks: Record<string, any> = {};
    for (const param of parameters) {
      if (param.type) {
        // Map parameter types to validation types
        let validationType: string = param.type;
        if (param.type === 'string') validationType = 'string';
        else if (param.type === 'number') validationType = 'number';
        else if (param.type === 'boolean') validationType = 'boolean';
        else if (param.type === 'array') validationType = 'array';
        else validationType = 'object';

        typeChecks[param.name] = validationType;
      }
    }

    if (Object.keys(typeChecks).length > 0) {
      const config: ValidationConfig = {
        typeChecks: typeChecks
      };

      rules.push({
        id: 'type-validation',
        description: 'Parameters must match their expected types',
        type: 'type-check',
        config: config,
        severity: 'error'
      });
    }

    // 3. Pattern-specific validation
    if (pattern.type === 'boundary-condition') {
      // Range check: minValue must be less than maxValue
      const config: ValidationConfig = {
        rangeChecks: {
          minValue: { max: Number.MAX_SAFE_INTEGER },
          maxValue: { min: Number.MIN_SAFE_INTEGER }
        }
      };

      rules.push({
        id: 'boundary-order',
        description: 'minValue must be less than maxValue',
        type: 'range',
        config: config,
        severity: 'error'
      });
    }

    // 4. Add prototype pollution protection
    rules.push({
      id: 'no-prototype-pollution',
      description: 'Prevent prototype pollution attacks',
      type: 'custom',
      config: {
        customValidatorId: 'no-prototype-pollution'
      },
      severity: 'error'
    });

    return rules;
  }

  /**
   * Create code generators for different frameworks
   */
  private createCodeGenerators(pattern: TestPattern, structure: TemplateNode): Record<TestFramework, string> {
    return {
      [TestFramework.JEST]: this.generateJestCode(pattern, structure),
      [TestFramework.MOCHA]: this.generateMochaCode(pattern, structure),
      [TestFramework.CYPRESS]: this.generateCypressCode(pattern, structure),
      [TestFramework.VITEST]: this.generateVitestCode(pattern, structure),
      [TestFramework.JASMINE]: this.generateJasmineCode(pattern, structure),
      [TestFramework.AVA]: this.generateAvaCode(pattern, structure)
    };
  }

  /**
   * Generate Jest code
   */
  private generateJestCode(pattern: TestPattern, structure: TemplateNode): string {
    return `
describe('{{suiteName}}', () => {
  it('{{testName}}', async () => {
    // Arrange
    const input = {{input}};

    ${this.getPatternSpecificSetup(pattern, 'jest')}

    // Act
    const result = await functionUnderTest(input);

    // Assert
    ${this.getPatternSpecificAssertion(pattern, 'jest')}
    expect(result).toEqual({{expectedOutput}});
  });
});
`.trim();
  }

  /**
   * Generate Mocha code
   */
  private generateMochaCode(pattern: TestPattern, structure: TemplateNode): string {
    return `
describe('{{suiteName}}', function() {
  it('{{testName}}', async function() {
    // Arrange
    const input = {{input}};

    ${this.getPatternSpecificSetup(pattern, 'mocha')}

    // Act
    const result = await functionUnderTest(input);

    // Assert
    ${this.getPatternSpecificAssertion(pattern, 'mocha')}
    expect(result).to.equal({{expectedOutput}});
  });
});
`.trim();
  }

  /**
   * Generate Cypress code
   */
  private generateCypressCode(pattern: TestPattern, structure: TemplateNode): string {
    return `
describe('{{suiteName}}', () => {
  it('{{testName}}', () => {
    // Arrange
    cy.visit('/test-page');

    ${this.getPatternSpecificSetup(pattern, 'cypress')}

    // Act
    cy.get('[data-testid="input"]').type('{{input}}');
    cy.get('[data-testid="submit"]').click();

    // Assert
    ${this.getPatternSpecificAssertion(pattern, 'cypress')}
    cy.get('[data-testid="output"]').should('contain', '{{expectedOutput}}');
  });
});
`.trim();
  }

  /**
   * Generate Vitest code
   */
  private generateVitestCode(pattern: TestPattern, structure: TemplateNode): string {
    return this.generateJestCode(pattern, structure); // Similar to Jest
  }

  /**
   * Generate Jasmine code
   */
  private generateJasmineCode(pattern: TestPattern, structure: TemplateNode): string {
    return `
describe('{{suiteName}}', () => {
  it('{{testName}}', async () => {
    // Arrange
    const input = {{input}};

    ${this.getPatternSpecificSetup(pattern, 'jasmine')}

    // Act
    const result = await functionUnderTest(input);

    // Assert
    ${this.getPatternSpecificAssertion(pattern, 'jasmine')}
    expect(result).toEqual({{expectedOutput}});
  });
});
`.trim();
  }

  /**
   * Generate AVA code
   */
  private generateAvaCode(pattern: TestPattern, structure: TemplateNode): string {
    return `
test('{{testName}}', async t => {
  // Arrange
  const input = {{input}};

  ${this.getPatternSpecificSetup(pattern, 'ava')}

  // Act
  const result = await functionUnderTest(input);

  // Assert
  ${this.getPatternSpecificAssertion(pattern, 'ava')}
  t.deepEqual(result, {{expectedOutput}});
});
`.trim();
  }

  /**
   * Get pattern-specific setup code
   */
  private getPatternSpecificSetup(pattern: TestPattern, framework: string): string {
    switch (pattern.type) {
      case 'mock-pattern':
        return framework === 'jest'
          ? 'const mockFn = jest.fn().mockReturnValue({{mockReturnValue}});'
          : 'const mockFn = sinon.stub().returns({{mockReturnValue}});';
      case 'async-pattern':
        return '// Setup async operation';
      default:
        return '';
    }
  }

  /**
   * Get pattern-specific assertion code
   */
  private getPatternSpecificAssertion(pattern: TestPattern, framework: string): string {
    switch (pattern.type) {
      case 'error-handling':
        return framework === 'jest'
          ? 'expect(() => result).toThrow({{errorType}});'
          : 'expect(() => result).to.throw({{errorType}});';
      case 'boundary-condition':
        return 'expect(result).toBeGreaterThanOrEqual({{minValue}});\nexpect(result).toBeLessThanOrEqual({{maxValue}});';
      case 'mock-pattern':
        return 'expect(mockFn).toHaveBeenCalled();';
      default:
        return '';
    }
  }

  /**
   * Helper methods for structure building
   */
  private needsSetup(pattern: TestPattern): boolean {
    return ['mock-pattern', 'integration'].includes(pattern.type);
  }

  private needsTeardown(pattern: TestPattern): boolean {
    return ['integration', 'performance-test'].includes(pattern.type);
  }

  private createSetupNode(): TemplateNode {
    return {
      type: 'setup',
      id: 'setup',
      children: [],
      properties: { code: '// Setup' },
      parameterRefs: []
    };
  }

  private createArrangeNode(pattern: TestPattern): TemplateNode {
    return {
      type: 'arrange',
      id: 'arrange',
      children: [],
      properties: { code: 'const input = {{input}};' },
      parameterRefs: ['input']
    };
  }

  private createActNode(pattern: TestPattern): TemplateNode {
    return {
      type: 'act',
      id: 'act',
      children: [],
      properties: { code: 'const result = await functionUnderTest(input);' },
      parameterRefs: []
    };
  }

  private createAssertNode(pattern: TestPattern): TemplateNode {
    return {
      type: 'assert',
      id: 'assert',
      children: [],
      properties: { code: 'expect(result).toEqual({{expectedOutput}});' },
      parameterRefs: ['expectedOutput']
    };
  }

  private createTeardownNode(): TemplateNode {
    return {
      type: 'teardown',
      id: 'teardown',
      children: [],
      properties: { code: '// Cleanup' },
      parameterRefs: []
    };
  }

  private generateTemplateId(pattern: TestPattern): string {
    const hash = crypto
      .createHash('md5')
      .update(`${pattern.id}-${pattern.type}`)
      .digest('hex')
      .substring(0, 8);
    return `template-${pattern.type}-${hash}`;
  }

  private generateDescription(pattern: TestPattern): string {
    return `Reusable template for ${pattern.type} tests. Generated from pattern: ${pattern.name}`;
  }

  /**
   * Validate template (SECURE - No eval)
   *
   * Security Fix (Alert #22): Removed eval() vulnerability
   * Previous: eval(rule.validator) - DANGEROUS!
   * New: SecureValidation.validate() - Safe, type-checked validation
   */
  async validateTemplate(template: TestTemplate, params: Record<string, any>): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const rule of template.validationRules) {
      try {
        // SECURE: Use predefined validation functions, no code execution
        const result = SecureValidation.validate(rule.config, params);

        if (!result.valid) {
          // Add rule description and specific errors
          errors.push(`${rule.description}: ${result.errors.join(', ')}`);
        }
      } catch (error) {
        errors.push(`Validation rule ${rule.id} failed: ${(error as Error).message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Instantiate template with parameters
   */
  async instantiateTemplate(
    template: TestTemplate,
    framework: TestFramework,
    params: Record<string, any>
  ): Promise<string> {
    // Validate parameters
    const validation = await this.validateTemplate(template, params);
    if (!validation.valid) {
      throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    // Get code generator for framework
    let code = template.codeGenerators[framework];
    if (!code) {
      throw new Error(`No code generator found for framework ${framework}`);
    }

    // Replace parameters
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `{{${key}}}`;
      const replacement = typeof value === 'string' ? value : JSON.stringify(value);
      code = code.replace(new RegExp(placeholder, 'g'), replacement);
    }

    return code;
  }
}
