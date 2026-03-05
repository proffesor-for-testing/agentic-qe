/**
 * Language Auto-Detection (ADR-078)
 * Detects programming language and test framework from file extensions and project files.
 */

import * as path from 'path';
import * as fs from 'fs';
import type { SupportedLanguage, TestFramework } from './types/test-frameworks.js';
import { DEFAULT_FRAMEWORKS, getLanguageFromExtension } from './types/test-frameworks.js';

/**
 * Project configuration detected from build files
 */
export interface ProjectConfig {
  buildTool: string;
  configPath: string;
  languageVersion?: string;
}

/**
 * Resolved request with language and framework
 */
export interface ResolvedRequest {
  language: SupportedLanguage;
  framework: TestFramework;
}

// File patterns to exclude from analysis (generated code)
const EXCLUSION_PATTERNS = [
  /\.g\.cs$/,           // C# generated
  /\.pb\.go$/,          // protobuf Go
  /\.freezed\.dart$/,   // Dart Freezed generated
  /_generated\.go$/,    // Go generated
  /\.generated\.\w+$/,  // General generated
  /\.min\.\w+$/,        // Minified
];

// Build tool detection map
const BUILD_TOOL_DETECTION: Record<string, { buildTool: string; language: SupportedLanguage }> = {
  'pom.xml': { buildTool: 'maven', language: 'java' },
  'build.gradle': { buildTool: 'gradle', language: 'java' },
  'build.gradle.kts': { buildTool: 'gradle-kts', language: 'kotlin' },
  'Cargo.toml': { buildTool: 'cargo', language: 'rust' },
  'go.mod': { buildTool: 'go-mod', language: 'go' },
  'Package.swift': { buildTool: 'spm', language: 'swift' },
  'pubspec.yaml': { buildTool: 'pub', language: 'dart' },
  'package.json': { buildTool: 'npm', language: 'typescript' },
  'tsconfig.json': { buildTool: 'tsc', language: 'typescript' },
};

/**
 * Check if a file path matches any exclusion pattern
 */
export function isExcludedFile(filePath: string): boolean {
  return EXCLUSION_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Detect language from file paths (majority vote)
 */
export function detectLanguage(filePaths: string[]): SupportedLanguage | undefined {
  const validFiles = filePaths.filter(f => !isExcludedFile(f));
  if (validFiles.length === 0) return undefined;

  const langCounts = new Map<SupportedLanguage, number>();

  for (const filePath of validFiles) {
    const ext = path.extname(filePath);
    const lang = getLanguageFromExtension(ext);
    if (lang) {
      langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
    }
  }

  if (langCounts.size === 0) return undefined;

  // Return the most frequent language
  let maxLang: SupportedLanguage | undefined;
  let maxCount = 0;
  for (const [lang, count] of langCounts) {
    if (count > maxCount) {
      maxCount = count;
      maxLang = lang;
    }
  }
  return maxLang;
}

/**
 * Detect test framework from language and optional project root scanning
 */
export function detectFramework(language: SupportedLanguage, projectRoot?: string): TestFramework {
  // If we have a project root, try to detect from config files
  if (projectRoot) {
    const detected = detectFrameworkFromProject(language, projectRoot);
    if (detected) return detected;
  }

  // Fall back to default framework for this language
  return DEFAULT_FRAMEWORKS[language];
}

/**
 * Detect framework from project configuration files
 */
function detectFrameworkFromProject(language: SupportedLanguage, projectRoot: string): TestFramework | undefined {
  try {
    switch (language) {
      case 'typescript':
      case 'javascript': {
        const pkgPath = path.join(projectRoot, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          if (allDeps['vitest']) return 'vitest';
          if (allDeps['jest']) return 'jest';
          if (allDeps['mocha']) return 'mocha';
        }
        return undefined;
      }
      case 'python':
        return 'pytest'; // pytest is dominant
      case 'java': {
        // Check for TestNG vs JUnit
        const pomPath = path.join(projectRoot, 'pom.xml');
        if (fs.existsSync(pomPath)) {
          const content = fs.readFileSync(pomPath, 'utf-8');
          if (content.includes('testng')) return 'testng';
        }
        return 'junit5';
      }
      case 'csharp': {
        // Check for NUnit vs xUnit
        const csprojFiles = findFiles(projectRoot, '*.csproj');
        for (const f of csprojFiles) {
          try {
            const content = fs.readFileSync(f, 'utf-8');
            if (content.includes('NUnit')) return 'nunit';
          } catch { /* ignore */ }
        }
        return 'xunit';
      }
      case 'swift': {
        // Check for Swift Testing vs XCTest
        return 'swift-testing'; // Default to newer framework
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * Find files matching a pattern in a directory (non-recursive, simple)
 */
function findFiles(dir: string, pattern: string): string[] {
  try {
    const ext = pattern.replace('*', '');
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(ext))
      .map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Detect project configuration from build files
 */
export function detectProjectConfig(projectRoot: string): ProjectConfig | undefined {
  for (const [filename, config] of Object.entries(BUILD_TOOL_DETECTION)) {
    const filePath = path.join(projectRoot, filename);
    if (fs.existsSync(filePath)) {
      return {
        buildTool: config.buildTool,
        configPath: filePath,
      };
    }
  }
  return undefined;
}

/**
 * Full resolution chain: resolve language and framework from partial request
 */
export function resolveRequest(request: {
  sourceFiles?: string[];
  language?: SupportedLanguage;
  framework?: TestFramework;
  projectRoot?: string;
}): ResolvedRequest | undefined {
  // 1. Use explicit language if provided
  let language = request.language;

  // 2. Otherwise detect from source files
  if (!language && request.sourceFiles?.length) {
    language = detectLanguage(request.sourceFiles);
  }

  if (!language) return undefined;

  // 3. Use explicit framework if provided
  let framework = request.framework;

  // 4. Otherwise detect from project or default
  if (!framework) {
    framework = detectFramework(language, request.projectRoot);
  }

  return { language, framework };
}
