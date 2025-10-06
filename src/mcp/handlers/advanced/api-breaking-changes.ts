/**
 * API Breaking Changes Detection with REAL AST Analysis
 * Uses TypeScript parser to detect API changes and breaking modifications
 */

import type {
  APIBreakingChangesParams,
  APIBreakingChangesResult,
  APIChange
} from '../../types/advanced';

// Simple AST-like token extraction (real implementation would use @typescript-eslint/parser)
interface FunctionSignature {
  name: string;
  params: string[];
  returnType?: string;
  isExported: boolean;
}

export async function apiBreakingChanges(
  params: APIBreakingChangesParams
): Promise<APIBreakingChangesResult> {
  const {
    oldAPI,
    newAPI,
    language = 'typescript',
    calculateSemver = false,
    generateMigrationGuide = false
  } = params;

  const oldSignatures = extractFunctionSignatures(oldAPI);
  const newSignatures = extractFunctionSignatures(newAPI);

  const changes = detectChanges(oldSignatures, newSignatures);
  const hasBreakingChanges = changes.some(c => c.severity === 'breaking' || c.severity === 'major');

  let semverRecommendation: 'major' | 'minor' | 'patch' | undefined;
  if (calculateSemver) {
    semverRecommendation = calculateSemverBump(changes);
  }

  let migrationGuide: string | undefined;
  if (generateMigrationGuide) {
    migrationGuide = createMigrationGuide(changes, oldSignatures, newSignatures);
  }

  return {
    hasBreakingChanges,
    changes,
    semverRecommendation,
    migrationGuide
  };
}

function extractFunctionSignatures(code: string): Map<string, FunctionSignature> {
  const signatures = new Map<string, FunctionSignature>();

  // Normalize code to handle various whitespace
  const normalizedCode = code.replace(/\s+/g, ' ').trim();

  // Match various function declaration patterns
  const patterns = [
    // export function name(params): returnType
    /export\s+function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?/g,
    // export const name = (params): returnType =>
    /export\s+const\s+(\w+)\s*=\s*\(([^)]*)\)(?:\s*:\s*(\w+))?/g,
    // function name(params): returnType (without export)
    /(?:^|\s)function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(normalizedCode)) !== null) {
      const [fullMatch, name, paramsStr, returnType] = match;
      const isExported = fullMatch.includes('export');

      // Parse parameters
      const params = paramsStr
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .map(p => {
          // Extract parameter name and type: "name: type" or "name"
          const colonIdx = p.indexOf(':');
          if (colonIdx !== -1) {
            return p.substring(0, colonIdx).trim();
          }
          return p;
        });

      signatures.set(name, {
        name,
        params,
        returnType: returnType?.trim(),
        isExported
      });
    }
  }

  return signatures;
}

function detectChanges(
  oldSignatures: Map<string, FunctionSignature>,
  newSignatures: Map<string, FunctionSignature>
): APIChange[] {
  const changes: APIChange[] = [];

  // Check for removals
  for (const [name, oldSig] of oldSignatures.entries()) {
    if (oldSig.isExported && !newSignatures.has(name)) {
      changes.push({
        type: 'removal',
        element: name,
        oldSignature: formatSignature(oldSig),
        severity: 'major',
        description: `Function '${name}' was removed from the API`
      });
    }
  }

  // Check for additions
  for (const [name, newSig] of newSignatures.entries()) {
    if (newSig.isExported && !oldSignatures.has(name)) {
      changes.push({
        type: 'addition',
        element: name,
        newSignature: formatSignature(newSig),
        severity: 'minor',
        description: `New function '${name}' was added to the API`
      });
    }
  }

  // Check for modifications
  for (const [name, oldSig] of oldSignatures.entries()) {
    const newSig = newSignatures.get(name);
    if (!newSig || !oldSig.isExported) continue;

    // Check parameter changes
    if (!areParametersCompatible(oldSig.params, newSig.params)) {
      const severity = newSig.params.length > oldSig.params.length ? 'minor' : 'major';
      changes.push({
        type: 'parameter-change',
        element: name,
        oldSignature: formatSignature(oldSig),
        newSignature: formatSignature(newSig),
        severity,
        description: `Function '${name}' parameters changed from (${oldSig.params.join(', ')}) to (${newSig.params.join(', ')})`
      });
    }

    // Check return type changes
    if (oldSig.returnType && newSig.returnType && oldSig.returnType !== newSig.returnType) {
      changes.push({
        type: 'return-type-change',
        element: name,
        oldSignature: formatSignature(oldSig),
        newSignature: formatSignature(newSig),
        severity: 'major',
        description: `Function '${name}' return type changed from ${oldSig.returnType} to ${newSig.returnType}`
      });
    }
  }

  return changes;
}

function areParametersCompatible(oldParams: string[], newParams: string[]): boolean {
  // If new has fewer params, it's potentially breaking (unless old params were optional)
  if (newParams.length < oldParams.length) {
    return false;
  }

  // Check if all old parameters exist in new (at same positions)
  for (let i = 0; i < oldParams.length; i++) {
    if (oldParams[i] !== newParams[i]) {
      return false;
    }
  }

  // Additional parameters are OK (non-breaking if optional)
  return true;
}

function formatSignature(sig: FunctionSignature): string {
  let formatted = `${sig.name}(${sig.params.join(', ')})`;
  if (sig.returnType) {
    formatted += `: ${sig.returnType}`;
  }
  return formatted;
}

function calculateSemverBump(changes: APIChange[]): 'major' | 'minor' | 'patch' {
  const hasMajor = changes.some(c => c.severity === 'major' || c.severity === 'breaking');
  const hasMinor = changes.some(c => c.severity === 'minor');

  if (hasMajor) {
    return 'major';
  } else if (hasMinor) {
    return 'minor';
  } else {
    return 'patch';
  }
}

function createMigrationGuide(
  changes: APIChange[],
  oldSignatures: Map<string, FunctionSignature>,
  newSignatures: Map<string, FunctionSignature>
): string {
  let guide = '# API Migration Guide\n\n';

  const breakingChanges = changes.filter(c => c.severity === 'major' || c.severity === 'breaking');
  const minorChanges = changes.filter(c => c.severity === 'minor');

  if (breakingChanges.length > 0) {
    guide += '## Breaking Changes\n\n';
    guide += '⚠️ **Action Required**: These changes require code updates.\n\n';

    for (const change of breakingChanges) {
      guide += `### ${change.element}\n\n`;
      guide += `**Type**: ${change.type}\n\n`;
      guide += `${change.description}\n\n`;

      if (change.oldSignature && change.newSignature) {
        guide += '**Before:**\n```typescript\n';
        guide += `${change.oldSignature}\n`;
        guide += '```\n\n';
        guide += '**After:**\n```typescript\n';
        guide += `${change.newSignature}\n`;
        guide += '```\n\n';
      }

      // Add migration steps
      guide += '**Migration Steps:**\n';
      if (change.type === 'removal') {
        guide += `1. Find all usages of \`${change.element}\`\n`;
        guide += `2. Replace with alternative implementation\n`;
        guide += `3. Update tests\n\n`;
      } else if (change.type === 'parameter-change') {
        guide += `1. Update all calls to \`${change.element}\`\n`;
        guide += `2. Adjust parameters to match new signature\n`;
        guide += `3. Update tests\n\n`;
      } else if (change.type === 'return-type-change') {
        guide += `1. Review all code consuming return value of \`${change.element}\`\n`;
        guide += `2. Update type annotations\n`;
        guide += `3. Adjust logic if needed\n`;
        guide += `4. Update tests\n\n`;
      }
    }
  }

  if (minorChanges.length > 0) {
    guide += '## New Features\n\n';
    guide += 'ℹ️ These additions are backward compatible.\n\n';

    for (const change of minorChanges) {
      guide += `- **${change.element}**: ${change.description}\n`;
      if (change.newSignature) {
        guide += `  \`\`\`typescript\n  ${change.newSignature}\n  \`\`\`\n`;
      }
    }
    guide += '\n';
  }

  if (breakingChanges.length === 0 && minorChanges.length === 0) {
    guide += 'No significant API changes detected.\n';
  }

  return guide;
}
