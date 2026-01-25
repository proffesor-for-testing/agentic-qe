import { ProcessExit } from '../../utils/ProcessExit';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { GenerateOptions } from '../../types';
import { getErrorMessage, getErrorStack } from '../../utils/ErrorUtils';

/** Represents a function extracted from source code */
interface FunctionInfo {
  name: string;
  line: number;
  type: string;
}

/** Represents analysis of a single source file */
interface FileAnalysis {
  path: string;
  extension: string;
  lines: number;
  functions: FunctionInfo[];
  complexity: number;
  imports: string[];
  exports: string[];
}

/** Represents the overall source code analysis */
interface SourceCodeAnalysis {
  files: FileAnalysis[];
  complexity: number;
  testable_functions: FunctionInfo[];
  dependencies: string[];
  coverage_gaps: string[];
  risk_areas: string[];
}

/** Represents a test case for a function */
interface TestCase {
  name: string;
  type: string;
  description: string;
}

/** Represents function test specification */
interface FunctionTestSpec {
  name: string;
  tests: TestCase[];
}

/** Represents a file's test specification */
interface FileTestSpec {
  sourceFile: string;
  testFile: string;
  functions: FunctionTestSpec[];
  coverage: {
    target: number;
    strategy: string;
  };
}

/** Represents a testing strategy */
interface TestingStrategy {
  type: string;
  target?: string | number;
  method?: string;
  focus?: string[];
  framework?: string;
  patterns?: string[];
}

/** Represents the complete test specification */
interface TestSpecification {
  target: string;
  type: string;
  framework: string;
  coverageTarget: number;
  files: FileTestSpec[];
  strategies: TestingStrategy[];
  metadata: {
    generated: string;
    sourceFiles: number;
    functions: number;
    complexity: number;
  };
}

/** Represents a generated test file */
interface GeneratedTest {
  sourceFile: string;
  testFile: string;
  testsCount: number;
}

export class GenerateCommand {
  static async execute(target: string, options: GenerateOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🧠 Generating Test Suites with AI Analysis\n'));

    try {
      const spinner = ora('Initializing test generation...').start();

      // Validate inputs
      await this.validateInputs(target, options);

      spinner.text = 'Analyzing source code...';

      // Analyze source code
      const analysis = await this.analyzeSourceCode(options.path);

      spinner.text = 'Generating test strategies...';

      // Generate test specifications
      const testSpecs = await this.generateTestSpecifications(target, options, analysis);

      spinner.text = 'Creating test files...';

      // Generate actual test files
      const generatedTests = await this.generateTestFiles(testSpecs, options);

      spinner.text = 'Setting up test infrastructure...';

      // Setup test infrastructure
      await this.setupTestInfrastructure(options);

      spinner.succeed(chalk.green('Test generation completed successfully!'));

      // Display summary
      this.displayGenerationSummary(generatedTests, options);

      // Store progress in coordination memory
      await this.storeGenerationProgress(generatedTests);

    } catch (error: unknown) {
      console.error(chalk.red('❌ Test generation failed:'), getErrorMessage(error));
      if (options.verbose) {
        const stack = getErrorStack(error);
        if (stack) {
          console.error(chalk.gray(stack));
        }
      }
      ProcessExit.exitIfNotTest(1);
    }
  }

  private static async validateInputs(target: string, options: GenerateOptions): Promise<void> {
    const validTargets = ['tests', 'integration', 'performance', 'security'];
    if (!validTargets.includes(target)) {
      throw new Error(`Invalid target '${target}'. Must be one of: ${validTargets.join(', ')}`);
    }

    const validTypes = ['unit', 'integration', 'e2e', 'performance', 'security'];
    if (!validTypes.includes(options.type)) {
      throw new Error(`Invalid type '${options.type}'. Must be one of: ${validTypes.join(', ')}`);
    }

    const coverageTarget = parseInt(options.coverageTarget);
    if (coverageTarget < 0 || coverageTarget > 100) {
      throw new Error('Coverage target must be between 0 and 100');
    }

    if (!await fs.pathExists(options.path)) {
      throw new Error(`Source path '${options.path}' does not exist`);
    }

    if (options.fromSwagger && !await fs.pathExists(options.fromSwagger)) {
      throw new Error(`Swagger file '${options.fromSwagger}' does not exist`);
    }
  }

  private static async analyzeSourceCode(sourcePath: string): Promise<SourceCodeAnalysis> {
    const analysis: SourceCodeAnalysis = {
      files: [],
      complexity: 0,
      testable_functions: [],
      dependencies: [],
      coverage_gaps: [],
      risk_areas: []
    };

    // Recursively analyze source files
    const files = await this.getSourceFiles(sourcePath);

    for (const file of files) {
      const fileAnalysis = await this.analyzeFile(file);
      analysis.files.push(fileAnalysis);
      analysis.complexity += fileAnalysis.complexity;
      analysis.testable_functions.push(...fileAnalysis.functions);
    }

    return analysis;
  }

  private static async getSourceFiles(sourcePath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.go'];

    const traverse = async (dir: string): Promise<void> => {
      const items = await fs.readdir(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          await traverse(fullPath);
        } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    };

    await traverse(sourcePath);
    return files;
  }

  private static async analyzeFile(filePath: string): Promise<FileAnalysis> {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath);

    // Basic analysis - would be enhanced with actual AST parsing
    const lines = content.split('\n');
    const functions = this.extractFunctions(content, ext);
    const complexity = this.calculateComplexity(content);

    return {
      path: filePath,
      extension: ext,
      lines: lines.length,
      functions,
      complexity,
      imports: this.extractImports(content, ext),
      exports: this.extractExports(content, ext)
    };
  }

  private static extractFunctions(content: string, extension: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];

    // Simple regex patterns for different languages
    const patterns: Record<string, RegExp[]> = {
      '.js': [/function\s+(\w+)\s*\(/g, /(\w+)\s*[=:]\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/g],
      '.ts': [/function\s+(\w+)\s*\(/g, /(\w+)\s*[=:]\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/g],
      '.py': [/def\s+(\w+)\s*\(/g],
      '.java': [/(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)*(\w+)\s*\(/g],
    };

    const funcPatterns = patterns[extension] || patterns['.js'];

    funcPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        functions.push({
          name: match[1],
          line: content.substring(0, match.index).split('\n').length,
          type: 'function'
        });
      }
    });

    return functions;
  }

  private static calculateComplexity(content: string): number {
    // Basic cyclomatic complexity calculation
    const complexityKeywords = [
      'if', 'else', 'while', 'for', 'switch', 'case', 'catch', 'try',
      '&&', '||', '?', ':', 'break', 'continue'
    ];

    let complexity = 1; // Base complexity

    complexityKeywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = content.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    });

    return complexity;
  }

  private static extractImports(content: string, extension: string): string[] {
    const imports: string[] = [];

    if (extension === '.js' || extension === '.ts') {
      const importRegex = /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    return imports;
  }

  private static extractExports(content: string, extension: string): string[] {
    const exports: string[] = [];

    if (extension === '.js' || extension === '.ts') {
      const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g;
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
    }

    return exports;
  }

  private static async generateTestSpecifications(target: string, options: GenerateOptions, analysis: SourceCodeAnalysis): Promise<TestSpecification> {
    const testSpecs: TestSpecification = {
      target,
      type: options.type,
      framework: options.framework,
      coverageTarget: parseInt(options.coverageTarget),
      files: [],
      strategies: [],
      metadata: {
        generated: new Date().toISOString(),
        sourceFiles: analysis.files.length,
        functions: analysis.testable_functions.length,
        complexity: analysis.complexity
      }
    };

    // Generate test specifications for each file
    for (const file of analysis.files) {
      const fileTestSpec = this.generateFileTestSpec(file, options);
      testSpecs.files.push(fileTestSpec);
    }

    // Generate testing strategies
    testSpecs.strategies = this.generateTestingStrategies(options, analysis);

    return testSpecs;
  }

  private static generateFileTestSpec(fileAnalysis: FileAnalysis, options: GenerateOptions): FileTestSpec {
    const testFile = this.getTestFilePath(fileAnalysis.path, options);

    return {
      sourceFile: fileAnalysis.path,
      testFile,
      functions: fileAnalysis.functions.map((func: FunctionInfo) => ({
        name: func.name,
        tests: this.generateFunctionTests(func, options)
      })),
      coverage: {
        target: parseInt(options.coverageTarget),
        strategy: 'comprehensive'
      }
    };
  }

  private static getTestFilePath(sourcePath: string, options: GenerateOptions): string {
    const relativePath = path.relative(options.path, sourcePath);
    const parsedPath = path.parse(relativePath);
    const testFileName = `${parsedPath.name}.test${parsedPath.ext}`;
    return path.join(options.output, parsedPath.dir, testFileName);
  }

  private static generateFunctionTests(func: FunctionInfo, options: GenerateOptions): TestCase[] {
    const tests: TestCase[] = [];

    // Basic test cases
    tests.push({
      name: `should ${func.name} with valid input`,
      type: 'happy-path',
      description: `Test ${func.name} function with valid parameters`
    });

    tests.push({
      name: `should handle edge cases for ${func.name}`,
      type: 'edge-case',
      description: `Test ${func.name} function with edge case scenarios`
    });

    tests.push({
      name: `should handle errors in ${func.name}`,
      type: 'error-handling',
      description: `Test ${func.name} function error handling`
    });

    // Property-based testing
    if (options.propertyBased) {
      tests.push({
        name: `property-based tests for ${func.name}`,
        type: 'property-based',
        description: `Generated property-based tests for ${func.name}`
      });
    }

    return tests;
  }

  private static generateTestingStrategies(options: GenerateOptions, analysis: SourceCodeAnalysis): TestingStrategy[] {
    const strategies: TestingStrategy[] = [];

    // Coverage strategy
    strategies.push({
      type: 'coverage',
      target: parseInt(options.coverageTarget),
      method: 'comprehensive',
      focus: ['statements', 'branches', 'functions']
    });

    // Complexity-based strategy
    if (analysis.complexity > 10) {
      strategies.push({
        type: 'complexity-focused',
        target: 'high-complexity-functions',
        method: 'intensive-testing'
      });
    }

    // Framework-specific strategy
    strategies.push({
      type: 'framework-optimized',
      framework: options.framework,
      patterns: this.getFrameworkPatterns(options.framework)
    });

    return strategies;
  }

  private static getFrameworkPatterns(framework: string): string[] {
    const patterns: Record<string, string[]> = {
      'jest': ['describe-it', 'beforeEach-afterEach', 'mock-spy'],
      'mocha': ['describe-it', 'before-after', 'chai-assertions'],
      'pytest': ['fixtures', 'parametrize', 'markers'],
      'junit': ['test-annotations', 'setup-teardown', 'assertions']
    };

    return patterns[framework] || patterns['jest'];
  }

  private static async generateTestFiles(testSpecs: TestSpecification, options: GenerateOptions): Promise<GeneratedTest[]> {
    const generatedTests: GeneratedTest[] = [];

    // Ensure output directory exists
    await fs.ensureDir(options.output);

    for (const fileSpec of testSpecs.files) {
      const testContent = await this.generateTestFileContent(fileSpec, options);

      // Ensure test file directory exists
      await fs.ensureDir(path.dirname(fileSpec.testFile));

      // Write test file
      await fs.writeFile(fileSpec.testFile, testContent);

      generatedTests.push({
        sourceFile: fileSpec.sourceFile,
        testFile: fileSpec.testFile,
        testsCount: fileSpec.functions.reduce((sum: number, func: FunctionTestSpec) => sum + func.tests.length, 0)
      });
    }

    return generatedTests;
  }

  private static async generateTestFileContent(fileSpec: FileTestSpec, options: GenerateOptions): Promise<string> {
    const framework = options.framework;
    const sourceFile = fileSpec.sourceFile;
    const relativePath = path.relative(path.dirname(fileSpec.testFile), sourceFile);

    let content = '';

    // Framework-specific imports and setup
    if (framework === 'jest') {
      content += `import { ${fileSpec.functions.map((f: FunctionTestSpec) => f.name).join(', ')} } from '${relativePath}';\n\n`;
      content += `describe('${path.basename(sourceFile)}', () => {\n`;

      for (const func of fileSpec.functions) {
        content += `  describe('${func.name}', () => {\n`;

        for (const test of func.tests) {
          content += `    it('${test.name}', () => {\n`;
          content += `      // ${test.description}\n`;
          content += `      // TODO: Implement test logic\n`;
          content += `      expect(${func.name}).toBeDefined();\n`;
          content += `    });\n\n`;
        }

        content += `  });\n\n`;
      }

      content += `});\n`;
    }

    return content;
  }

  private static async setupTestInfrastructure(options: GenerateOptions): Promise<void> {
    // Create test configuration files
    const configDir = '.agentic-qe/config';
    await fs.ensureDir(configDir);

    // Jest configuration
    if (options.framework === 'jest') {
      const jestConfig = {
        testEnvironment: 'node',
        collectCoverage: true,
        coverageDirectory: 'coverage',
        coverageReporters: ['text', 'lcov', 'html'],
        testMatch: ['**/*.test.js', '**/*.test.ts'],
        coverageThreshold: {
          global: {
            branches: parseInt(options.coverageTarget),
            functions: parseInt(options.coverageTarget),
            lines: parseInt(options.coverageTarget),
            statements: parseInt(options.coverageTarget)
          }
        }
      };

      await fs.writeJson(`${configDir}/jest.config.json`, jestConfig, { spaces: 2 });
    }

    // Create test scripts
    const scriptsDir = '.agentic-qe/scripts';
    await fs.ensureDir(scriptsDir);

    const testScript = `#!/bin/bash
# Auto-generated test execution script
echo "Running ${options.framework} tests..."
${options.framework} --config .agentic-qe/config/${options.framework}.config.json
`;

    await fs.writeFile(`${scriptsDir}/run-tests.sh`, testScript);
    await fs.chmod(`${scriptsDir}/run-tests.sh`, '755');
  }

  private static displayGenerationSummary(generatedTests: GeneratedTest[], options: GenerateOptions): void {
    console.log(chalk.yellow('\n📊 Test Generation Summary:'));
    console.log(chalk.gray(`  Framework: ${options.framework}`));
    console.log(chalk.gray(`  Coverage Target: ${options.coverageTarget}%`));
    console.log(chalk.gray(`  Files Generated: ${generatedTests.length}`));

    const totalTests = generatedTests.reduce((sum, file) => sum + file.testsCount, 0);
    console.log(chalk.gray(`  Total Tests: ${totalTests}`));

    if (options.propertyBased) {
      console.log(chalk.gray(`  Property-based Testing: Enabled`));
    }

    if (options.mutationTesting) {
      console.log(chalk.gray(`  Mutation Testing: Enabled`));
    }

    console.log(chalk.yellow('\n📁 Generated Files:'));
    generatedTests.forEach(test => {
      console.log(chalk.gray(`  ${test.testFile} (${test.testsCount} tests)`));
    });

    console.log(chalk.yellow('\n💡 Next Steps:'));
    console.log(chalk.gray('  1. Review generated tests and add implementation details'));
    console.log(chalk.gray('  2. Run tests: agentic-qe run tests --parallel'));
    console.log(chalk.gray('  3. Analyze coverage: agentic-qe analyze coverage --gaps'));
  }

  private static async storeGenerationProgress(generatedTests: GeneratedTest[]): Promise<void> {
    const progress = {
      timestamp: new Date().toISOString(),
      files: generatedTests.length,
      tests: generatedTests.reduce((sum, file) => sum + file.testsCount, 0),
      status: 'completed'
    };

    // Store in coordination memory for other agents
    const coordinationScript = `
npx claude-flow@alpha memory store --key "agentic-qe/generation/progress" --value '${JSON.stringify(progress)}'
npx claude-flow@alpha hooks notify --message "Test generation completed: ${progress.tests} tests in ${progress.files} files"
`;

    await fs.writeFile('.agentic-qe/scripts/store-generation-progress.sh', coordinationScript);
    await fs.chmod('.agentic-qe/scripts/store-generation-progress.sh', '755');
  }
}