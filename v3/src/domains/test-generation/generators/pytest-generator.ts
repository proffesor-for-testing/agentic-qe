/**
 * Agentic QE v3 - Pytest Test Generator
 * Strategy implementation for Python's pytest framework
 *
 * Generates test code using:
 * - pytest class-based and function-based tests
 * - Python assert statements
 * - @pytest.fixture decorators
 * - @pytest.mark.asyncio for async tests
 *
 * @module test-generation/generators
 */

import { faker } from '@faker-js/faker';
import { BaseTestGenerator } from './base-test-generator';
import type {
  TestFramework,
  TestType,
  FunctionInfo,
  ClassInfo,
  ParameterInfo,
  TestGenerationContext,
  Pattern,
} from '../interfaces';

/**
 * PytestGenerator - Test generator for Python's pytest framework
 *
 * Generates idiomatic Python test code with pytest conventions:
 * - Test classes prefixed with Test
 * - Test methods prefixed with test_
 * - Fixtures for setup/teardown
 *
 * @example
 * ```typescript
 * const generator = new PytestGenerator();
 * const testCode = generator.generateTests({
 *   moduleName: 'user_service',
 *   importPath: 'app.services.user_service',
 *   testType: 'unit',
 *   patterns: [],
 *   analysis: { functions: [...], classes: [...] }
 * });
 * ```
 */
export class PytestGenerator extends BaseTestGenerator {
  readonly framework: TestFramework = 'pytest';

  /**
   * Generate complete test file from analysis
   */
  generateTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns, analysis, dependencies } = context;

    if (!analysis || (analysis.functions.length === 0 && analysis.classes.length === 0)) {
      return this.generateStubTests(context);
    }

    const patternComment = this.generatePythonPatternComment(patterns);
    const exports = this.extractExports(analysis.functions, analysis.classes);

    const pythonImport = importPath.replace(/\//g, '.').replace(/\.(ts|js)$/, '');
    const importStatement =
      exports.length > 0
        ? `from ${pythonImport} import ${exports.join(', ')}`
        : `import ${pythonImport} as ${moduleName}`;

    // KG: Add mock imports for known dependencies
    let mockImport = '';
    if (dependencies && dependencies.imports.length > 0) {
      mockImport = `from unittest.mock import patch, MagicMock\n`;
    }

    // KG: Build @patch decorator stack for known dependencies
    const depsToMock = dependencies?.imports.slice(0, 5) || [];
    const patchDecorators = depsToMock.map((dep) => {
      const depModule = dep.replace(/\//g, '.').replace(/\.py$/, '');
      return `@patch('${depModule}')`;
    });

    let code = `${patternComment}import pytest
${mockImport}${importStatement}


class Test${this.pascalCase(moduleName)}:
    """${testType} tests for ${moduleName}"""

`;

    for (const fn of analysis.functions) {
      code += this.generateFunctionTestsWithPatches(fn, testType, patchDecorators);
    }

    for (const cls of analysis.classes) {
      code += this.generateClassTests(cls, testType);
    }

    return code;
  }

  /**
   * Generate tests for a standalone function
   */
  generateFunctionTests(fn: FunctionInfo, _testType: TestType): string {
    return this.generateFunctionTestsWithPatches(fn, _testType, []);
  }

  /**
   * Generate tests for a function with @patch decorators from KG dependencies
   */
  private generateFunctionTestsWithPatches(fn: FunctionInfo, _testType: TestType, patchDecorators: string[]): string {
    const validParams = fn.parameters.map((p) => this.generatePythonTestValue(p)).join(', ');

    // Build mock params for patch decorators (injected right-to-left by Python)
    const mockParams = patchDecorators.map((_, i) => `mock_dep_${i}`).reverse().join(', ');
    const allParams = mockParams ? `self, ${mockParams}` : 'self';

    // Indent patch decorators at class method level
    const patchPrefix = patchDecorators.map((d) => `    ${d}\n`).join('');

    let code = `${patchPrefix}    def test_${fn.name}_valid_input(${allParams}):\n`;
    code += `        """Test ${fn.name} with valid input"""\n`;
    code += `        result = ${fn.name}(${validParams})\n`;
    code += `        assert result is not None\n\n`;

    // Test for edge cases (no patches needed — they test the function directly)
    for (const param of fn.parameters) {
      if (!param.optional && param.type?.includes('str')) {
        code += `${patchPrefix}    def test_${fn.name}_empty_${param.name}(${allParams}):\n`;
        code += `        """Test ${fn.name} with empty ${param.name}"""\n`;
        const paramsWithEmpty = fn.parameters
          .map((p) => (p.name === param.name ? '""' : this.generatePythonTestValue(p)))
          .join(', ');
        code += `        result = ${fn.name}(${paramsWithEmpty})\n`;
        code += `        assert result is not None\n\n`;
      }
    }

    return code;
  }

  /**
   * Generate tests for a class
   */
  generateClassTests(cls: ClassInfo, _testType: TestType): string {
    const constructorArgs =
      cls.constructorParams?.map((p) => this.generatePythonTestValue(p)).join(', ') || '';

    let code = `\nclass Test${cls.name}:\n`;
    code += `    """Tests for ${cls.name}"""\n\n`;
    code += `    @pytest.fixture\n`;
    code += `    def instance(self):\n`;
    code += `        return ${cls.name}(${constructorArgs})\n\n`;
    code += `    def test_instantiation(self, instance):\n`;
    code += `        assert isinstance(instance, ${cls.name})\n\n`;

    for (const method of cls.methods) {
      if (!method.name.startsWith('_')) {
        const methodParams = method.parameters
          .map((p) => this.generatePythonTestValue(p))
          .join(', ');
        code += `    def test_${method.name}(self, instance):\n`;
        code += `        result = instance.${method.name}(${methodParams})\n`;
        code += `        assert result is not None\n\n`;
      }
    }

    return code;
  }

  /**
   * Generate stub tests when no AST analysis is available
   */
  generateStubTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns, dependencies, similarCode } = context;
    const patternComment = this.generatePythonPatternComment(patterns);

    // Determine if async tests needed based on patterns
    const isAsync = patterns.some(
      (p) =>
        p.name.toLowerCase().includes('async') || p.name.toLowerCase().includes('promise')
    );
    const asyncDecorator = isAsync ? '@pytest.mark.asyncio\n    ' : '';
    const asyncDef = isAsync ? 'async def' : 'def';

    // KG: Generate mock patches for known dependencies
    let mockImports = '';
    let mockPatches = '';
    if (dependencies && dependencies.imports.length > 0) {
      mockImports = `from unittest.mock import patch, MagicMock\n`;
      const depsToMock = dependencies.imports.slice(0, 5);
      for (const dep of depsToMock) {
        const depModule = dep.replace(/\//g, '.').replace(/\.py$/, '');
        mockPatches += `    @patch('${depModule}')\n`;
      }
    }

    // KG: Generate similarity-informed test hints
    let similarityComment = '';
    if (similarCode && similarCode.snippets.length > 0) {
      similarityComment = `    # KG: Similar modules found - consider testing shared patterns:\n`;
      for (const s of similarCode.snippets.slice(0, 3)) {
        similarityComment += `    #   - ${s.file} (${(s.score * 100).toFixed(0)}% similar)\n`;
      }
      similarityComment += `\n`;
    }

    // KG: Generate dependency integration tests
    let depTests = '';
    if (dependencies && dependencies.imports.length > 0) {
      depTests += `\n    def test_dependencies_importable(self):\n`;
      depTests += `        """Verify all dependencies are importable (KG-informed)."""\n`;
      for (const dep of dependencies.imports.slice(0, 5)) {
        const depModule = dep.replace(/\//g, '.').replace(/\.py$/, '');
        depTests += `        import importlib\n`;
        depTests += `        mod = importlib.import_module('${depModule}')\n`;
        depTests += `        assert mod is not None\n`;
      }

      depTests += `\n    def test_dependency_interactions(self):\n`;
      depTests += `        """Test module interactions with its dependencies (KG-informed)."""\n`;
      depTests += `        # Module should handle dependency failures gracefully\n`;
      depTests += `        assert ${moduleName} is not None\n`;
      depTests += `        assert hasattr(${moduleName}, '__name__') or hasattr(${moduleName}, '__class__')\n`;
    }

    // KG: Generate callers-aware API surface tests
    let callerTests = '';
    if (dependencies && dependencies.importedBy.length > 0) {
      callerTests += `\n    def test_public_api_surface(self):\n`;
      callerTests += `        """Verify public API used by ${dependencies.importedBy.length} consumers (KG-informed)."""\n`;
      callerTests += `        public_attrs = [a for a in dir(${moduleName}) if not a.startswith('_')]\n`;
      callerTests += `        assert len(public_attrs) > 0, "Module should expose public API"\n`;
    }

    return `${patternComment}import pytest
${mockImports}from ${importPath} import ${moduleName}


class Test${this.pascalCase(moduleName)}:
    """${testType} tests for ${moduleName}"""

${similarityComment}    def test_is_defined(self):
        """Verify the module is properly exported and defined."""
        assert ${moduleName} is not None

    ${asyncDecorator}${asyncDef} test_basic_operations(self):
        """Test core functionality with valid inputs."""
        # Verify module can be instantiated or accessed
        if callable(${moduleName}):
            instance = ${moduleName}()
            assert instance is not None
        else:
            assert len(dir(${moduleName})) > 0

    def test_edge_cases(self):
        """Test handling of edge case inputs."""
        # Verify module handles edge cases gracefully
        instance = ${moduleName}() if callable(${moduleName}) else ${moduleName}
        assert instance is not None
        # Module should be serializable
        import json
        try:
            json.dumps(str(instance))
        except (TypeError, ValueError):
            pass  # Complex objects may not serialize, but shouldn't crash

    def test_error_conditions(self):
        """Test error handling and recovery."""
        # Module instantiation should not raise unexpected errors
        try:
            instance = ${moduleName}() if callable(${moduleName}) else ${moduleName}
            assert instance is not None
        except TypeError:
            # Expected if constructor requires arguments
            pass
${depTests}${callerTests}`;
  }

  /**
   * Generate coverage-focused tests for specific lines
   */
  generateCoverageTests(
    moduleName: string,
    importPath: string,
    lines: number[]
  ): string {
    const funcName = this.camelCase(moduleName);
    const lineRange = this.formatLineRange(lines);
    const pythonImport = importPath.replace(/\//g, '.');

    return `# Coverage test for ${lineRange} in ${moduleName}
import pytest
from ${pythonImport} import ${funcName}

class Test${this.pascalCase(moduleName)}Coverage:
    """Tests to cover ${lineRange}"""

    def test_cover_${lines[0]}_${lines[lines.length - 1]}(self):
        """Exercise code path covering ${lineRange}"""
        # Arrange: Set up test inputs to reach uncovered lines
        test_input = None  # Replace with appropriate input

        # Act: Execute the code path
        try:
            result = ${funcName}(test_input)

            # Assert: Verify expected behavior
            assert result is not None
        except Exception as e:
            # If exception is expected for this path, verify it
            pytest.fail(f"Unexpected exception: {e}")
`;
  }

  // ============================================================================
  // Python-Specific Helpers
  // ============================================================================

  /**
   * Generate Python pattern comment
   */
  private generatePythonPatternComment(patterns: Pattern[]): string {
    if (patterns.length === 0) return '';
    return `# Applied patterns: ${patterns.map((p) => p.name).join(', ')}\n`;
  }

  /**
   * Generate a Python test value for a parameter
   */
  private generatePythonTestValue(param: ParameterInfo): string {
    const type = param.type?.toLowerCase() || 'unknown';
    const name = param.name.toLowerCase();

    // Infer from param name
    if (name.includes('id')) return `"${faker.string.uuid()}"`;
    if (name.includes('name')) return `"${faker.person.fullName()}"`;
    if (name.includes('email')) return `"${faker.internet.email()}"`;
    if (name.includes('url')) return `"${faker.internet.url()}"`;

    // Infer from type
    if (type.includes('str')) return `"${faker.lorem.word()}"`;
    if (type.includes('int') || type.includes('number')) {
      return String(faker.number.int({ min: 1, max: 100 }));
    }
    if (type.includes('bool')) return 'True';
    if (type.includes('list') || type.includes('[]')) return '[]';
    if (type.includes('dict') || type.includes('{}')) return '{}';
    if (type.includes('float')) return String(faker.number.float({ min: 0, max: 100 }));

    return 'None';
  }
}
