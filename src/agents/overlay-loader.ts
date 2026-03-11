/**
 * Agent Overlay Loader (BMAD-002)
 *
 * Discovers, validates, and applies agent customization overlays from
 * .claude/agent-overrides/*.yaml files.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { AgentOverlay, OverlayLoadResult, AppliedOverlay, validateOverlay } from './overlay-schema.js';

const OVERRIDES_DIR = '.claude/agent-overrides';

/**
 * Parse YAML-like overlay files.
 * Uses a simple parser to avoid adding a yaml dependency.
 * Supports basic key-value pairs and nested objects.
 */
function parseSimpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentSection: string | null = null;
  let currentSubSection: string | null = null;
  let currentArray: string[] | null = null;
  let currentArrayKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');

    // Skip comments and empty lines
    if (line.trim().startsWith('#') || line.trim() === '') continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Array item
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
      if (currentArray) {
        currentArray.push(value);
      }
      continue;
    }

    // Flush any pending array
    if (currentArray && currentArrayKey) {
      if (currentSubSection && currentSection) {
        const section = result[currentSection] as Record<string, unknown> || {};
        section[currentArrayKey] = currentArray;
        result[currentSection] = section;
      } else if (currentSection) {
        const section = result[currentSection] as Record<string, unknown> || {};
        section[currentArrayKey] = currentArray;
        result[currentSection] = section;
      }
      currentArray = null;
      currentArrayKey = null;
    }

    // Key-value pair
    const match = trimmed.match(/^(\w[\w.-]*)\s*:\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim().replace(/^["']|["']$/g, '');

    if (indent === 0) {
      // Top-level key
      if (value === '' || value === undefined) {
        currentSection = key;
        currentSubSection = null;
        if (!result[key]) result[key] = {};
      } else {
        result[key] = parseValue(value);
        currentSection = null;
        currentSubSection = null;
      }
    } else if (indent <= 4 && currentSection) {
      if (value === '' || value === undefined) {
        // Sub-section or array start
        currentSubSection = key;
        currentArray = [];
        currentArrayKey = key;
      } else {
        const section = result[currentSection] as Record<string, unknown> || {};
        section[key] = parseValue(value);
        result[currentSection] = section;
      }
    }
  }

  // Flush final array
  if (currentArray && currentArrayKey && currentSection) {
    const section = result[currentSection] as Record<string, unknown> || {};
    section[currentArrayKey] = currentArray;
    result[currentSection] = section;
  }

  return result;
}

function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  return value;
}

/**
 * Load all overlay files from the overrides directory.
 */
export function loadOverlays(projectRoot: string): OverlayLoadResult {
  const overlaysDir = join(projectRoot, OVERRIDES_DIR);
  const result: OverlayLoadResult = {
    overlays: [],
    warnings: [],
    errors: [],
  };

  if (!existsSync(overlaysDir)) {
    return result;
  }

  let files: string[];
  try {
    files = readdirSync(overlaysDir).filter(
      f => (f.endsWith('.yaml') || f.endsWith('.yml')) && !f.startsWith('_')
    );
  } catch (err) {
    result.errors.push(`Failed to read overrides directory: ${(err as Error).message}`);
    return result;
  }

  for (const file of files) {
    const filePath = join(overlaysDir, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseSimpleYaml(content);

      // Infer agent name from filename if not specified
      if (!parsed.agent) {
        const agentName = basename(file).replace(/\.(override|customize)\.(yaml|yml)$/, '');
        parsed.agent = agentName;
      }

      const validationErrors = validateOverlay(parsed);
      if (validationErrors.length > 0) {
        result.warnings.push(
          `Overlay ${file} has validation issues: ${validationErrors.join('; ')}. Loading without overlay.`
        );
        continue;
      }

      result.overlays.push(parsed as unknown as AgentOverlay);
    } catch (err) {
      result.warnings.push(
        `Failed to parse overlay ${file}: ${(err as Error).message}. Agent loads without overlay.`
      );
    }
  }

  return result;
}

/**
 * Apply an overlay to agent markdown content.
 * Returns the modified content and a record of what was applied.
 */
export function applyOverlayToContent(
  agentContent: string,
  overlay: AgentOverlay,
): { content: string; applied: AppliedOverlay } {
  let content = agentContent;
  const applied: AppliedOverlay = {
    agentName: overlay.agent,
    overlayFile: `${overlay.agent}.override.yaml`,
    replacedFields: [],
    appendedFields: [],
    configOverrides: [],
  };

  // Apply replacements in frontmatter-like sections
  if (overlay.replace) {
    if (overlay.replace.description) {
      // Replace description in markdown metadata comment or first paragraph
      const descRegex = /^(description:\s*).+$/m;
      if (descRegex.test(content)) {
        content = content.replace(descRegex, `$1${overlay.replace.description}`);
        applied.replacedFields.push('description');
      }
    }

    if (overlay.replace.domains) {
      const domainRegex = /^(domain:\s*).+$/m;
      if (domainRegex.test(content)) {
        content = content.replace(domainRegex, `$1${overlay.replace.domains.join(', ')}`);
        applied.replacedFields.push('domains');
      }
    }

    if (overlay.replace.complexity) {
      const complexityRegex = /^(complexity:\s*).+$/m;
      if (complexityRegex.test(content)) {
        content = content.replace(complexityRegex, `$1${overlay.replace.complexity}`);
        applied.replacedFields.push('complexity');
      }
    }
  }

  // Append additional content
  if (overlay.append) {
    if (overlay.append.instructions) {
      content += `\n\n## Custom Instructions (User Override)\n\n${overlay.append.instructions}\n`;
      applied.appendedFields.push('instructions');
    }

    if (overlay.append.capabilities && overlay.append.capabilities.length > 0) {
      const capsSection = overlay.append.capabilities.map(c => `- ${c}`).join('\n');
      content += `\n\n### Additional Capabilities (User Override)\n\n${capsSection}\n`;
      applied.appendedFields.push('capabilities');
    }

    if (overlay.append.tags && overlay.append.tags.length > 0) {
      // Append tags to existing tags line or add new
      const tagsRegex = /^(tags:\s*).+$/m;
      if (tagsRegex.test(content)) {
        content = content.replace(tagsRegex, (match) => {
          const existing = match.replace(/^tags:\s*/, '').split(',').map(t => t.trim());
          const merged = [...new Set([...existing, ...overlay.append!.tags!])];
          return `tags: ${merged.join(', ')}`;
        });
      }
      applied.appendedFields.push('tags');
    }
  }

  // Track config overrides
  if (overlay.config) {
    applied.configOverrides = Object.keys(overlay.config);
  }

  return { content, applied };
}

/**
 * Get overlay for a specific agent by name.
 */
export function getOverlayForAgent(
  overlays: AgentOverlay[],
  agentName: string,
): AgentOverlay | undefined {
  return overlays.find(o => o.agent === agentName);
}

/**
 * Get config overrides for a specific agent.
 */
export function getAgentConfigOverrides(
  overlays: AgentOverlay[],
  agentName: string,
): AgentOverlay['config'] | undefined {
  const overlay = getOverlayForAgent(overlays, agentName);
  return overlay?.config;
}
