#!/usr/bin/env node
/** Verify the actual npm tarball surface used by Codex installations. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CODEX_SKILL_MANIFEST } from '../src/init/codex-skill-manifest.js';
import { createPlatformConfigGenerator } from '../src/init/platform-config-generator.js';

interface PackFile { path: string }
interface PackResult { files: PackFile[] }

export interface CodexPackageVerification {
  errors: string[];
  checkedFiles: number;
  guidanceTools: string[];
}

const REQUIRED_HOOK_ASSETS = [
  '.codex/hooks.json',
  '.codex/hooks/aqe-codex-hook.cjs',
  '.codex/hooks/ruflo-codex-hook.cjs',
  '.claude/hooks/aqe-hook.cjs',
  '.claude/helpers/ruflo-hook.cjs',
] as const;

export function extractGuidanceToolNames(content: string): string[] {
  const toolSection = content.split('## Best Practices')[0] ?? content;
  return [...toolSection.matchAll(/`([a-z][a-z0-9_]*_[a-z0-9_]+)`/g)]
    .map((match) => match[1])
    .filter((name, index, names) => names.indexOf(name) === index);
}

export function extractRegisteredToolNames(protocolSource: string): Set<string> {
  return new Set(
    [...protocolSource.matchAll(/definition:\s*{\s*name:\s*'([^']+)'/g)]
      .map((match) => match[1]),
  );
}

export function verifyCodexPackage(repoRoot: string, packedFiles: readonly string[]): CodexPackageVerification {
  const errors: string[] = [];
  const files = new Set(packedFiles);
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };

  for (const skill of CODEX_SKILL_MANIFEST) {
    const base = `.agents/skills/${skill.name}`;
    const required = skill.files?.map((file) => `${base}/${file}`) ?? [`${base}/SKILL.md`];
    for (const file of required) {
      if (!files.has(file)) errors.push(`missing curated Codex skill asset: ${file}`);
    }
  }
  for (const file of REQUIRED_HOOK_ASSETS) {
    if (!files.has(file)) errors.push(`missing Codex hook asset: ${file}`);
  }

  const leakedRufloFiles = packedFiles.filter((file) => file.startsWith('.agents/skills/ruflo/'));
  if (leakedRufloFiles.length > 0) {
    errors.push(`vendored Ruflo runtime leaked into package (${leakedRufloFiles.length} files)`);
  }
  for (const dependency of ['ruflo', 'claude-flow', '@claude-flow/cli']) {
    if (pkg.dependencies?.[dependency]) errors.push(`Ruflo runtime dependency leaked: ${dependency}`);
  }

  const guidance = createPlatformConfigGenerator().generateBehavioralRules('codex').content;
  const guidanceTools = extractGuidanceToolNames(guidance);
  const protocolSource = readFileSync(join(repoRoot, 'src/mcp/protocol-server.ts'), 'utf8');
  const registeredTools = extractRegisteredToolNames(protocolSource);
  for (const tool of guidanceTools) {
    if (!registeredTools.has(tool)) errors.push(`Codex AGENTS guidance names unregistered MCP tool: ${tool}`);
  }

  return { errors, checkedFiles: files.size, guidanceTools };
}

function main(): void {
  const repoRoot = process.cwd();
  const output = execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  const packed = JSON.parse(output) as PackResult[];
  const files = packed[0]?.files.map((file) => file.path) ?? [];
  const result = verifyCodexPackage(repoRoot, files);

  for (const error of result.errors) console.error(`❌ ${error}`);
  console.log(
    `Checked ${result.checkedFiles} packed files, ${CODEX_SKILL_MANIFEST.length} curated skills, `
    + `${REQUIRED_HOOK_ASSETS.length} hook assets, and ${result.guidanceTools.length} guidance tools.`,
  );
  process.exitCode = result.errors.length > 0 ? 1 : 0;
}

if (process.argv[1]?.endsWith('verify-codex-package.ts')) main();
