/**
 * Compilation Validation Loop (ADR-077)
 * Optional compile-check for generated tests with graceful fallback.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SupportedLanguage } from '../../../shared/types/test-frameworks.js';

/**
 * Compilation error details
 */
export interface CompilationError {
  message: string;
  line?: number;
  column?: number;
  file?: string;
}

/**
 * Result of compilation validation
 */
export interface ValidationResult {
  compiles: boolean;
  errors: CompilationError[];
  suggestions: string[];
}

/**
 * Compilation validator interface
 */
export interface ICompilationValidator {
  validate(code: string, language: SupportedLanguage, projectPath?: string): Promise<ValidationResult>;
}

// Per-language compile commands
const COMPILE_COMMANDS: Partial<Record<SupportedLanguage, { check: string; fileExt: string }>> = {
  typescript: { check: 'npx tsc --noEmit --strict', fileExt: '.ts' },
  java: { check: 'javac -d /dev/null', fileExt: '.java' },
  csharp: { check: 'dotnet build --no-restore', fileExt: '.cs' },
  go: { check: 'go vet', fileExt: '_test.go' },
  rust: { check: 'cargo check', fileExt: '.rs' },
  kotlin: { check: 'kotlinc -script', fileExt: '.kts' },
  swift: { check: 'swiftc -typecheck', fileExt: '.swift' },
  dart: { check: 'dart analyze', fileExt: '.dart' },
};

/**
 * Compilation validator with per-language support.
 * Writes generated test code to a temp file, runs the language's compile/check
 * command, and parses any errors into structured results with suggestions.
 */
export class CompilationValidator implements ICompilationValidator {
  async validate(
    code: string,
    language: SupportedLanguage,
    projectPath?: string
  ): Promise<ValidationResult> {
    const config = COMPILE_COMMANDS[language];

    // Languages without compile check (Python, JavaScript)
    if (!config) {
      return {
        compiles: true,
        errors: [],
        suggestions: [`No compilation check available for ${language} -- syntax validation skipped`],
      };
    }

    // Write code to temp file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-compile-'));
    const tmpFile = path.join(tmpDir, `test_validation${config.fileExt}`);

    try {
      fs.writeFileSync(tmpFile, code, 'utf-8');

      const cmd = `${config.check} ${tmpFile}`;
      const cwd = projectPath || tmpDir;

      execSync(cmd, {
        cwd,
        timeout: 30000,
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      return {
        compiles: true,
        errors: [],
        suggestions: [],
      };
    } catch (error: unknown) {
      // Compiler not found
      if (this.isCommandNotFound(error)) {
        return {
          compiles: false,
          errors: [{ message: `Compiler not found for ${language}` }],
          suggestions: [`Install the ${language} compiler to enable compilation validation`],
        };
      }

      // Compilation failed
      const stderr = this.getStderr(error);
      const errors = this.parseErrors(stderr, language);
      return {
        compiles: false,
        errors: errors.length > 0 ? errors : [{ message: stderr || 'Compilation failed' }],
        suggestions: this.generateSuggestions(errors, language),
      };
    } finally {
      // Cleanup
      try {
        fs.unlinkSync(tmpFile);
        fs.rmdirSync(tmpDir);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  private isCommandNotFound(error: unknown): boolean {
    const msg = String(error);
    return msg.includes('ENOENT') || msg.includes('not found') || msg.includes('command not found');
  }

  private getStderr(error: unknown): string {
    if (error && typeof error === 'object' && 'stderr' in error) {
      return String((error as { stderr: unknown }).stderr);
    }
    return String(error);
  }

  private parseErrors(stderr: string, _language: SupportedLanguage): CompilationError[] {
    if (!stderr) return [];

    const errors: CompilationError[] = [];
    const lines = stderr.split('\n').filter((l) => l.trim());

    for (const line of lines.slice(0, 10)) {
      // Try to parse line:col format (common across compilers)
      const match = line.match(/(?:.*?):(\d+):(\d+):\s*(?:error:\s*)?(.*)/);
      if (match) {
        errors.push({
          message: match[3].trim(),
          line: parseInt(match[1], 10),
          column: parseInt(match[2], 10),
        });
      } else if (line.includes('error') || line.includes('Error')) {
        errors.push({ message: line.trim() });
      }
    }

    return errors;
  }

  private generateSuggestions(errors: CompilationError[], _language: SupportedLanguage): string[] {
    const suggestions: string[] = [];

    for (const error of errors) {
      const msg = error.message.toLowerCase();
      if (msg.includes('import') || msg.includes('module')) {
        suggestions.push('Check import statements -- ensure all dependencies are available');
      }
      if (msg.includes('type') || msg.includes('cannot find')) {
        suggestions.push('Verify type definitions match the source code signatures');
      }
      if (msg.includes('undefined') || msg.includes('undeclared')) {
        suggestions.push('Ensure all referenced symbols are properly imported or declared');
      }
    }

    return [...new Set(suggestions)]; // Dedupe
  }
}

/** Singleton instance */
export const compilationValidator = new CompilationValidator();
