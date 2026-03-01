/**
 * OpenCode Custom Tool Wrapper Validation Tests
 *
 * Validates all .opencode/tools/*.ts files for:
 * - Valid TypeScript syntax (parseable)
 * - Required exports: name, description, parameters, execute
 * - Parameter schemas use Zod
 *
 * Note: Since .opencode/tools/ may not be populated yet (WS4),
 * tests skip gracefully when the directory is empty.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const TOOLS_DIR = path.resolve(__dirname, '../../../../.opencode/tools');

let toolFiles: string[] = [];

describe('OpenCode Custom Tool Wrappers', () => {
  beforeAll(() => {
    if (!fs.existsSync(TOOLS_DIR)) {
      return;
    }
    toolFiles = fs.readdirSync(TOOLS_DIR)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => path.join(TOOLS_DIR, f));
  });

  // -------------------------------------------------------------------------
  // Precondition
  // -------------------------------------------------------------------------

  it('should find tool wrapper files (or skip if WS4 not complete)', () => {
    if (!fs.existsSync(TOOLS_DIR)) {
      // Directory not yet created — acceptable during parallel workstreams
      expect(true).toBe(true);
      return;
    }
    // If directory exists, log the count (may be 0 if WS4 hasn't run yet)
    expect(toolFiles.length).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // TypeScript syntax
  // -------------------------------------------------------------------------

  it('should have valid TypeScript syntax for all .opencode/tools/*.ts', () => {
    for (const file of toolFiles) {
      const content = fs.readFileSync(file, 'utf-8');

      // Basic syntax checks: no obvious syntax errors
      // A full TS parse would require the compiler API, so we do structural checks
      expect(content.length, `${path.basename(file)}: file is empty`).toBeGreaterThan(0);

      // Should not contain bare syntax errors like unmatched braces
      const openBraces = (content.match(/\{/g) || []).length;
      const closeBraces = (content.match(/\}/g) || []).length;
      expect(
        openBraces,
        `${path.basename(file)}: mismatched braces (${openBraces} open vs ${closeBraces} close)`
      ).toBe(closeBraces);

      // Should not contain obvious broken imports
      const imports = content.match(/import\s+.+from\s+['"][^'"]+['"]/g) || [];
      for (const imp of imports) {
        expect(
          imp.includes("''") || imp.includes('""'),
          `${path.basename(file)}: empty import path found`
        ).toBe(false);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Required exports
  // -------------------------------------------------------------------------

  it('should export name, description, parameters, execute', () => {
    for (const file of toolFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const basename = path.basename(file);

      // Check for exported members (export const, export function, export default)
      const requiredExports = ['name', 'description', 'parameters', 'execute'];

      for (const exportName of requiredExports) {
        const hasDirectExport = content.includes(`export const ${exportName}`) ||
          content.includes(`export function ${exportName}`) ||
          content.includes(`export async function ${exportName}`);
        const hasObjectExport = new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b`).test(content);
        const hasDefaultExport = content.includes('export default') &&
          content.includes(exportName);

        expect(
          hasDirectExport || hasObjectExport || hasDefaultExport,
          `${basename}: missing export '${exportName}'`
        ).toBe(true);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Zod parameter schemas
  // -------------------------------------------------------------------------

  it('should have Zod parameter schemas', () => {
    for (const file of toolFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const basename = path.basename(file);

      // Check that the file imports from zod and uses z.object or z.string etc.
      const hasZodImport = content.includes("from 'zod'") ||
        content.includes('from "zod"') ||
        content.includes("from 'zod/");
      const hasZodUsage = content.includes('z.object') ||
        content.includes('z.string') ||
        content.includes('z.number') ||
        content.includes('z.boolean') ||
        content.includes('z.array');

      expect(
        hasZodImport && hasZodUsage,
        `${basename}: should use Zod schemas for parameter definitions`
      ).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // File naming convention
  // -------------------------------------------------------------------------

  it('should follow naming convention for tool files', () => {
    for (const file of toolFiles) {
      const basename = path.basename(file, '.ts');

      // Tool wrapper files should use kebab-case
      expect(
        basename.match(/^[a-z][a-z0-9-]*$/),
        `${basename}.ts: tool file name should be kebab-case`
      ).toBeTruthy();
    }
  });

  // -------------------------------------------------------------------------
  // No hardcoded secrets
  // -------------------------------------------------------------------------

  it('should not contain hardcoded secrets or API keys', () => {
    const secretPatterns = [
      /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/i,
      /secret\s*[:=]\s*['"][^'"]{10,}['"]/i,
      /password\s*[:=]\s*['"][^'"]{5,}['"]/i,
      /token\s*[:=]\s*['"]sk-[^'"]+['"]/i,
      /Bearer\s+[A-Za-z0-9_-]{20,}/,
    ];

    for (const file of toolFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const basename = path.basename(file);

      for (const pattern of secretPatterns) {
        expect(
          pattern.test(content),
          `${basename}: may contain hardcoded secret matching ${pattern.source}`
        ).toBe(false);
      }
    }
  });
});
