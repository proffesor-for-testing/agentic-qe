/**
 * Project Analyzer Tests
 * ADR-025: Enhanced Init with Self-Configuration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import {
  ProjectAnalyzer,
  createProjectAnalyzer,
} from '../../../src/init/project-analyzer.js';
import type { ProjectAnalysis } from '../../../src/init/types.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

import { existsSync, readFileSync, statSync, readdirSync } from 'fs';

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
const mockStatSync = statSync as ReturnType<typeof vi.fn>;
const mockReaddirSync = readdirSync as ReturnType<typeof vi.fn>;

describe('ProjectAnalyzer', () => {
  const testProjectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('');
    mockStatSync.mockReturnValue({ isDirectory: () => false, isFile: () => true });
    mockReaddirSync.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createProjectAnalyzer', () => {
    it('should create a project analyzer', () => {
      const analyzer = createProjectAnalyzer(testProjectRoot);
      expect(analyzer).toBeInstanceOf(ProjectAnalyzer);
    });
  });

  describe('Framework Detection', () => {
    it('should detect Jest framework from config file', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === join(testProjectRoot, 'jest.config.js');
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(testProjectRoot, 'package.json')) {
          return JSON.stringify({
            name: 'test-project',
            devDependencies: { jest: '^29.0.0' },
          });
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const frameworks = await analyzer.detectFrameworks();

      expect(frameworks).toHaveLength(1);
      expect(frameworks[0].name).toBe('jest');
      expect(frameworks[0].confidence).toBe(1.0);
    });

    it('should detect Vitest framework', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === join(testProjectRoot, 'vitest.config.ts');
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(testProjectRoot, 'package.json')) {
          return JSON.stringify({
            name: 'test-project',
            devDependencies: { vitest: '^1.0.0' },
          });
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const frameworks = await analyzer.detectFrameworks();

      expect(frameworks).toHaveLength(1);
      expect(frameworks[0].name).toBe('vitest');
    });

    it('should detect multiple frameworks', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === join(testProjectRoot, 'jest.config.js') ||
          path === join(testProjectRoot, 'playwright.config.ts')
        );
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(testProjectRoot, 'package.json')) {
          return JSON.stringify({
            name: 'test-project',
            devDependencies: {
              jest: '^29.0.0',
              '@playwright/test': '^1.40.0',
            },
          });
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const frameworks = await analyzer.detectFrameworks();

      expect(frameworks).toHaveLength(2);
      const names = frameworks.map((f) => f.name);
      expect(names).toContain('jest');
      expect(names).toContain('playwright');
    });

    it('should detect pytest from pyproject.toml', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === join(testProjectRoot, 'pyproject.toml');
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(testProjectRoot, 'pyproject.toml')) {
          return '[tool.pytest]\ntestpaths = ["tests"]';
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const frameworks = await analyzer.detectFrameworks();

      expect(frameworks).toHaveLength(1);
      expect(frameworks[0].name).toBe('pytest');
    });
  });

  describe('Language Detection', () => {
    it('should detect TypeScript files', async () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['src'];
        if (dir === join(testProjectRoot, 'src')) return ['index.ts', 'utils.ts', 'types.ts'];
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const isDir = path === testProjectRoot || path === join(testProjectRoot, 'src');
        return {
          isDirectory: () => isDir,
          isFile: () => !isDir,
        };
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const languages = await analyzer.detectLanguages();

      expect(languages).toHaveLength(1);
      expect(languages[0].name).toBe('typescript');
      expect(languages[0].fileCount).toBe(3);
    });

    it('should detect multiple languages', async () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['src', 'scripts'];
        if (dir === join(testProjectRoot, 'src')) return ['index.ts', 'utils.ts'];
        if (dir === join(testProjectRoot, 'scripts')) return ['build.py', 'deploy.py'];
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const dirs = [testProjectRoot, join(testProjectRoot, 'src'), join(testProjectRoot, 'scripts')];
        return {
          isDirectory: () => dirs.includes(path),
          isFile: () => !dirs.includes(path),
        };
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const languages = await analyzer.detectLanguages();

      expect(languages).toHaveLength(2);
      const names = languages.map((l) => l.name);
      expect(names).toContain('typescript');
      expect(names).toContain('python');
    });
  });

  describe('Test Detection', () => {
    it('should detect test files', async () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['tests'];
        if (dir === join(testProjectRoot, 'tests')) {
          return ['unit.test.ts', 'integration.test.ts', 'e2e.spec.ts'];
        }
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const dirs = [testProjectRoot, join(testProjectRoot, 'tests')];
        return {
          isDirectory: () => dirs.includes(path),
          isFile: () => !dirs.includes(path),
        };
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const tests = await analyzer.detectExistingTests();

      expect(tests.totalCount).toBe(3);
    });

    it('should categorize test types', async () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['tests'];
        if (dir === join(testProjectRoot, 'tests')) return ['unit', 'integration', 'e2e'];
        if (dir === join(testProjectRoot, 'tests', 'unit')) return ['foo.test.ts'];
        if (dir === join(testProjectRoot, 'tests', 'integration')) return ['bar.test.ts'];
        if (dir === join(testProjectRoot, 'tests', 'e2e')) return ['baz.test.ts'];
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const dirs = [
          testProjectRoot,
          join(testProjectRoot, 'tests'),
          join(testProjectRoot, 'tests', 'unit'),
          join(testProjectRoot, 'tests', 'integration'),
          join(testProjectRoot, 'tests', 'e2e'),
        ];
        return {
          isDirectory: () => dirs.includes(path),
          isFile: () => !dirs.includes(path),
        };
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const tests = await analyzer.detectExistingTests();

      expect(tests.byType.unit).toBe(1);
      expect(tests.byType.integration).toBe(1);
      expect(tests.byType.e2e).toBe(1);
    });
  });

  describe('Project Type Detection', () => {
    it('should detect monorepo from lerna.json', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === join(testProjectRoot, 'lerna.json') ||
          path === join(testProjectRoot, 'package.json')
        );
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(testProjectRoot, 'package.json')) {
          return JSON.stringify({ name: 'monorepo' });
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const analysis = await analyzer.analyze();

      expect(analysis.projectType).toBe('monorepo');
    });

    it('should detect monorepo from workspaces', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === join(testProjectRoot, 'package.json');
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(testProjectRoot, 'package.json')) {
          return JSON.stringify({
            name: 'monorepo',
            workspaces: ['packages/*'],
          });
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const analysis = await analyzer.analyze();

      expect(analysis.projectType).toBe('monorepo');
    });

    it('should detect library from package.json exports', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === join(testProjectRoot, 'package.json');
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(testProjectRoot, 'package.json')) {
          return JSON.stringify({
            name: 'my-library',
            main: 'dist/index.js',
            exports: { '.': './dist/index.js' },
          });
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const analysis = await analyzer.analyze();

      expect(analysis.projectType).toBe('library');
    });
  });

  describe('Package Manager Detection', () => {
    it('should detect npm from package-lock.json', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === join(testProjectRoot, 'package-lock.json') ||
          path === join(testProjectRoot, 'package.json')
        );
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(testProjectRoot, 'package.json')) {
          return JSON.stringify({ name: 'test' });
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const analysis = await analyzer.analyze();

      expect(analysis.packageManager).toBe('npm');
    });

    it('should detect pnpm from pnpm-lock.yaml', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === join(testProjectRoot, 'pnpm-lock.yaml') ||
          path === join(testProjectRoot, 'package.json')
        );
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(testProjectRoot, 'package.json')) {
          return JSON.stringify({ name: 'test' });
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const analysis = await analyzer.analyze();

      expect(analysis.packageManager).toBe('pnpm');
    });
  });

  describe('CI Detection', () => {
    it('should detect GitHub Actions', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === join(testProjectRoot, '.github/workflows') ||
          path === join(testProjectRoot, 'package.json')
        );
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(testProjectRoot, 'package.json')) {
          return JSON.stringify({ name: 'test' });
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const analysis = await analyzer.analyze();

      expect(analysis.hasCIConfig).toBe(true);
      expect(analysis.ciProvider).toBe('github-actions');
    });

    it('should detect GitLab CI', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === join(testProjectRoot, '.gitlab-ci.yml') ||
          path === join(testProjectRoot, 'package.json')
        );
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(testProjectRoot, 'package.json')) {
          return JSON.stringify({ name: 'test' });
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const analysis = await analyzer.analyze();

      expect(analysis.hasCIConfig).toBe(true);
      expect(analysis.ciProvider).toBe('gitlab-ci');
    });
  });

  describe('Complete Analysis', () => {
    it('should perform complete analysis', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === join(testProjectRoot, 'package.json') ||
          path === join(testProjectRoot, 'tsconfig.json') ||
          path === join(testProjectRoot, 'vitest.config.ts') ||
          path === join(testProjectRoot, 'package-lock.json') ||
          path === join(testProjectRoot, '.github/workflows')
        );
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(testProjectRoot, 'package.json')) {
          return JSON.stringify({
            name: 'test-project',
            devDependencies: { vitest: '^1.0.0' },
          });
        }
        return '';
      });

      mockReaddirSync.mockReturnValue([]);

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const analysis = await analyzer.analyze();

      expect(analysis.projectName).toBe('test-project');
      expect(analysis.hasTypeScript).toBe(true);
      expect(analysis.hasCIConfig).toBe(true);
      expect(analysis.ciProvider).toBe('github-actions');
      expect(analysis.packageManager).toBe('npm');
      expect(analysis.analysisTimestamp).toBeInstanceOf(Date);
      expect(analysis.analysisDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cyclomatic Complexity Analysis', () => {
    it('should calculate complexity 1 for empty function', async () => {
      // Create a mock TypeScript file with a simple function
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['src'];
        if (dir === join(testProjectRoot, 'src')) return ['simple.ts'];
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const dirs = [testProjectRoot, join(testProjectRoot, 'src')];
        return {
          isDirectory: () => dirs.includes(path),
          isFile: () => !dirs.includes(path),
        };
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('simple.ts')) {
          return `
function empty() {
  return 42;
}
`;
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const complexity = await analyzer.analyzeComplexity();

      // Empty function = base complexity of 1
      expect(complexity.averageCyclomatic).toBe(1);
      expect(complexity.maxCyclomatic).toBe(1);
    });

    it('should count if statements as decision points', async () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['src'];
        if (dir === join(testProjectRoot, 'src')) return ['conditionals.ts'];
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const dirs = [testProjectRoot, join(testProjectRoot, 'src')];
        return {
          isDirectory: () => dirs.includes(path),
          isFile: () => !dirs.includes(path),
        };
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('conditionals.ts')) {
          return `
function checkValue(x: number) {
  if (x > 0) {
    return 'positive';
  } else if (x < 0) {
    return 'negative';
  } else {
    return 'zero';
  }
}
`;
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const complexity = await analyzer.analyzeComplexity();

      // 1 (base) + 1 (if) + 1 (else if) = 3
      expect(complexity.averageCyclomatic).toBe(3);
    });

    it('should count logical operators as decision points', async () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['src'];
        if (dir === join(testProjectRoot, 'src')) return ['logical.ts'];
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const dirs = [testProjectRoot, join(testProjectRoot, 'src')];
        return {
          isDirectory: () => dirs.includes(path),
          isFile: () => !dirs.includes(path),
        };
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('logical.ts')) {
          return `
function validate(a: boolean, b: boolean, c: boolean) {
  if (a && b || c) {
    return true;
  }
  return false;
}
`;
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const complexity = await analyzer.analyzeComplexity();

      // 1 (base) + 1 (if) + 1 (&&) + 1 (||) = 4
      expect(complexity.averageCyclomatic).toBe(4);
    });

    it('should count loops as decision points', async () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['src'];
        if (dir === join(testProjectRoot, 'src')) return ['loops.ts'];
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const dirs = [testProjectRoot, join(testProjectRoot, 'src')];
        return {
          isDirectory: () => dirs.includes(path),
          isFile: () => !dirs.includes(path),
        };
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('loops.ts')) {
          return `
function processItems(items: string[]) {
  for (let i = 0; i < items.length; i++) {
    console.log(items[i]);
  }

  while (items.length > 0) {
    items.pop();
  }
}
`;
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const complexity = await analyzer.analyzeComplexity();

      // 1 (base) + 1 (for) + 1 (while) = 3
      expect(complexity.averageCyclomatic).toBe(3);
    });

    it('should count switch cases as decision points', async () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['src'];
        if (dir === join(testProjectRoot, 'src')) return ['switch.ts'];
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const dirs = [testProjectRoot, join(testProjectRoot, 'src')];
        return {
          isDirectory: () => dirs.includes(path),
          isFile: () => !dirs.includes(path),
        };
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('switch.ts')) {
          return `
function getDay(num: number) {
  switch (num) {
    case 1:
      return 'Monday';
    case 2:
      return 'Tuesday';
    case 3:
      return 'Wednesday';
    default:
      return 'Unknown';
  }
}
`;
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const complexity = await analyzer.analyzeComplexity();

      // 1 (base) + 3 (cases) = 4
      expect(complexity.averageCyclomatic).toBe(4);
    });

    it('should count ternary operators as decision points', async () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['src'];
        if (dir === join(testProjectRoot, 'src')) return ['ternary.ts'];
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const dirs = [testProjectRoot, join(testProjectRoot, 'src')];
        return {
          isDirectory: () => dirs.includes(path),
          isFile: () => !dirs.includes(path),
        };
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('ternary.ts')) {
          return `
function getLabel(isActive: boolean) {
  return isActive ? 'Active' : 'Inactive';
}
`;
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const complexity = await analyzer.analyzeComplexity();

      // 1 (base) + 1 (ternary) = 2
      expect(complexity.averageCyclomatic).toBe(2);
    });

    it('should ignore keywords in comments and strings', async () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['src'];
        if (dir === join(testProjectRoot, 'src')) return ['comments.ts'];
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const dirs = [testProjectRoot, join(testProjectRoot, 'src')];
        return {
          isDirectory: () => dirs.includes(path),
          isFile: () => !dirs.includes(path),
        };
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('comments.ts')) {
          return `
function demo() {
  // This comment has if (x) and for (i) and while (true)
  const str = "if (x > 0) { for (i=0) { while (true) } }";
  /* Multi-line comment
     if (shouldNotCount) {
       for (let i = 0; i < 10; i++) {}
     }
  */
  return str;
}
`;
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const complexity = await analyzer.analyzeComplexity();

      // Should only count base complexity, not keywords in comments/strings
      expect(complexity.averageCyclomatic).toBe(1);
    });

    it('should count catch blocks as decision points', async () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['src'];
        if (dir === join(testProjectRoot, 'src')) return ['tryCatch.ts'];
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const dirs = [testProjectRoot, join(testProjectRoot, 'src')];
        return {
          isDirectory: () => dirs.includes(path),
          isFile: () => !dirs.includes(path),
        };
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('tryCatch.ts')) {
          return `
function riskyOperation() {
  try {
    doSomething();
  } catch (error) {
    handleError(error);
  }
}
`;
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const complexity = await analyzer.analyzeComplexity();

      // 1 (base) + 1 (catch) = 2
      expect(complexity.averageCyclomatic).toBe(2);
    });

    it('should flag complex files correctly', async () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === testProjectRoot) return ['src'];
        if (dir === join(testProjectRoot, 'src')) return ['complex.ts'];
        return [];
      });

      mockStatSync.mockImplementation((path: string) => {
        const dirs = [testProjectRoot, join(testProjectRoot, 'src')];
        return {
          isDirectory: () => dirs.includes(path),
          isFile: () => !dirs.includes(path),
        };
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('complex.ts')) {
          // Create a complex function with many decision points
          return `
function veryComplex(a: number, b: number, c: boolean) {
  if (a > 0) {
    if (b > 0) {
      if (c) {
        for (let i = 0; i < a; i++) {
          while (i < b) {
            if (i % 2 === 0 && i % 3 === 0) {
              switch (i % 4) {
                case 0: return 'zero';
                case 1: return 'one';
                case 2: return 'two';
                default: return 'other';
              }
            }
          }
        }
      }
    }
  }
  return c ? 'yes' : 'no';
}
`;
        }
        return '';
      });

      const analyzer = createProjectAnalyzer(testProjectRoot);
      const complexity = await analyzer.analyzeComplexity();

      // This should flag as complex (> 10)
      expect(complexity.maxCyclomatic).toBeGreaterThan(10);
      expect(complexity.complexFiles).toContain('src/complex.ts');
    });
  });
});
