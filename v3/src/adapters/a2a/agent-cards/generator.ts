/**
 * A2A Agent Card Generator
 *
 * Parses agent markdown files and generates A2A v0.3 compatible Agent Cards.
 * Supports batch generation for all QE agents.
 *
 * @module adapters/a2a/agent-cards/generator
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, basename, dirname } from 'path';

import { toError } from '../../../shared/error-utils.js';
import {
  AgentCard,
  AgentSkill,
  QEAgentCard,
  AgentCapabilities,
  AgentProvider,
  InputMode,
  OutputMode,
  DEFAULT_CAPABILITIES,
  DEFAULT_INPUT_MODES,
  DEFAULT_OUTPUT_MODES,
  DEFAULT_QE_PROVIDER,
  createAgentSkill,
  createQEAgentCard,
} from './schema.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the Agent Card Generator
 */
export interface AgentCardGeneratorConfig {
  /** Base URL for agent endpoints */
  readonly baseUrl: string;
  /** Default agent version if not specified in markdown */
  readonly defaultVersion?: string;
  /** Default provider information */
  readonly provider?: AgentProvider;
  /** Default capabilities */
  readonly defaultCapabilities?: AgentCapabilities;
  /** Default input modes */
  readonly defaultInputModes?: InputMode[];
  /** Default output modes */
  readonly defaultOutputModes?: OutputMode[];
  /** Whether to include QE-specific metadata */
  readonly includeQEMetadata?: boolean;
  /** Custom skill extractor function */
  readonly skillExtractor?: (markdown: string, parsedData: ParsedAgentMarkdown) => AgentSkill[];
  /** Custom tag extractor function */
  readonly tagExtractor?: (markdown: string, parsedData: ParsedAgentMarkdown) => string[];
}

/**
 * Default generator configuration
 */
export const DEFAULT_GENERATOR_CONFIG: Required<AgentCardGeneratorConfig> = {
  baseUrl: 'http://localhost:8080',
  defaultVersion: '3.0.0',
  provider: DEFAULT_QE_PROVIDER,
  defaultCapabilities: DEFAULT_CAPABILITIES,
  defaultInputModes: DEFAULT_INPUT_MODES,
  defaultOutputModes: DEFAULT_OUTPUT_MODES,
  includeQEMetadata: true,
  skillExtractor: defaultSkillExtractor,
  tagExtractor: defaultTagExtractor,
};

// ============================================================================
// Parsed Markdown Types
// ============================================================================

/**
 * YAML frontmatter data from agent markdown
 */
export interface AgentFrontmatter {
  readonly name?: string;
  readonly version?: string;
  readonly updated?: string;
  readonly description?: string;
  readonly domain?: string;
  readonly v2_compat?: {
    readonly name?: string;
    readonly deprecated_in?: string;
    readonly removed_in?: string;
  } | string;
}

/**
 * Parsed agent markdown data
 */
export interface ParsedAgentMarkdown {
  /** Frontmatter data */
  readonly frontmatter: AgentFrontmatter;
  /** Agent identity section */
  readonly identity?: string;
  /** Capabilities section */
  readonly capabilities?: string;
  /** Implementation status section */
  readonly implementationStatus?: string;
  /** Skills available section */
  readonly skillsAvailable?: string;
  /** Memory namespace section */
  readonly memoryNamespace?: string;
  /** Examples section */
  readonly examples?: string;
  /** Output format section */
  readonly outputFormat?: string;
  /** Coordination notes section */
  readonly coordinationNotes?: string;
  /** Learning protocol section */
  readonly learningProtocol?: string;
  /** Raw markdown content */
  readonly rawContent: string;
}

/**
 * Result from generating agent cards
 */
export interface GenerationResult {
  /** Successfully generated cards */
  readonly cards: Map<string, QEAgentCard>;
  /** Errors encountered during generation */
  readonly errors: Map<string, Error>;
  /** Statistics about the generation */
  readonly stats: {
    readonly total: number;
    readonly success: number;
    readonly failed: number;
    readonly duration: number;
  };
}

// ============================================================================
// Markdown Parsing
// ============================================================================

/**
 * Parse YAML frontmatter from markdown content
 */
export function parseFrontmatter(markdown: string): AgentFrontmatter {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const frontmatterText = frontmatterMatch[1];
  const result: Record<string, unknown> = {};

  // Simple YAML parser for common patterns
  const lines = frontmatterText.split('\n');
  let currentKey = '';
  let indentLevel = 0;
  let nestedObj: Record<string, unknown> = {};

  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === '') continue;

    // Check indent level
    const leadingSpaces = line.match(/^(\s*)/)?.[1].length ?? 0;

    // Parse key-value pairs
    const keyValueMatch = line.match(/^(\s*)(\w+):\s*(.*)$/);
    if (keyValueMatch) {
      const [, indent, key, value] = keyValueMatch;
      const currentIndent = indent.length;

      if (currentIndent === 0) {
        // Top-level key
        if (currentKey && indentLevel > 0) {
          result[currentKey] = nestedObj;
          nestedObj = {};
        }
        currentKey = key;
        indentLevel = 0;

        if (value.trim()) {
          // Clean up quoted values
          result[key] = value.replace(/^["']|["']$/g, '');
        }
      } else if (currentIndent > 0 && currentKey) {
        // Nested key
        indentLevel = currentIndent;
        if (value.trim()) {
          nestedObj[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }
  }

  // Don't forget the last nested object
  if (currentKey && Object.keys(nestedObj).length > 0) {
    result[currentKey] = nestedObj;
  }

  return result as AgentFrontmatter;
}

/**
 * Extract a section from markdown by header name
 */
export function extractSection(markdown: string, sectionName: string): string | undefined {
  // Try XML-style tags first (used in agent definitions)
  const xmlTagPattern = new RegExp(`<${sectionName}>([\\s\\S]*?)</${sectionName}>`, 'i');
  const xmlMatch = markdown.match(xmlTagPattern);
  if (xmlMatch) {
    return xmlMatch[1].trim();
  }

  // Try markdown headers
  const headerPattern = new RegExp(`(?:^|\\n)##?\\s*${sectionName}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const headerMatch = markdown.match(headerPattern);
  if (headerMatch) {
    return headerMatch[1].trim();
  }

  return undefined;
}

/**
 * Parse agent markdown file content
 */
export function parseAgentMarkdown(markdown: string): ParsedAgentMarkdown {
  const frontmatter = parseFrontmatter(markdown);

  return {
    frontmatter,
    identity: extractSection(markdown, 'identity'),
    capabilities: extractSection(markdown, 'capabilities'),
    implementationStatus: extractSection(markdown, 'implementation_status'),
    skillsAvailable: extractSection(markdown, 'skills_available'),
    memoryNamespace: extractSection(markdown, 'memory_namespace'),
    examples: extractSection(markdown, 'examples'),
    outputFormat: extractSection(markdown, 'output_format'),
    coordinationNotes: extractSection(markdown, 'coordination_notes'),
    learningProtocol: extractSection(markdown, 'learning_protocol'),
    rawContent: markdown,
  };
}

// ============================================================================
// Skill Extraction
// ============================================================================

/**
 * Default skill extractor from markdown content
 */
function defaultSkillExtractor(markdown: string, parsed: ParsedAgentMarkdown): AgentSkill[] {
  const skills: AgentSkill[] = [];

  // Extract capabilities section
  const capabilitiesSection = parsed.capabilities ?? '';

  // Parse bullet points as skills
  const bulletPattern = /-\s*\*\*([^*]+)\*\*:\s*([^\n]+)/g;
  let match: RegExpExecArray | null;

  while ((match = bulletPattern.exec(capabilitiesSection)) !== null) {
    const [, name, description] = match;
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    skills.push(
      createAgentSkill(id, name.trim(), description.trim(), {
        tags: extractSkillTags(name, description, parsed.frontmatter.domain),
      })
    );
  }

  // If no skills found from capabilities section, try skills_available section
  if (skills.length === 0 && parsed.skillsAvailable) {
    const skillLines = parsed.skillsAvailable.split('\n');
    for (const line of skillLines) {
      const skillMatch = line.match(/-\s*([^:]+):\s*(.+)/);
      if (skillMatch) {
        const [, name, description] = skillMatch;
        const id = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        skills.push(
          createAgentSkill(id, name.trim(), description.trim(), {
            tags: extractSkillTags(name, description, parsed.frontmatter.domain),
          })
        );
      }
    }
  }

  // Generate a primary skill from the agent's main purpose if no skills found
  if (skills.length === 0 && parsed.frontmatter.name && parsed.frontmatter.description) {
    // Remove qe- prefix to get the skill ID (e.g., "qe-test-architect" -> "test-architect")
    const primaryId = parsed.frontmatter.name.replace(/^qe-/, '');

    skills.push(
      createAgentSkill(primaryId, formatSkillName(parsed.frontmatter.name), parsed.frontmatter.description, {
        tags: extractSkillTags(parsed.frontmatter.name, parsed.frontmatter.description, parsed.frontmatter.domain),
      })
    );
  }

  return skills;
}

/**
 * Extract tags from skill name and description
 */
function extractSkillTags(name: string, description: string, domain?: string): string[] {
  const tags: string[] = [];

  // Add domain as tag
  if (domain) {
    tags.push(domain);
  }

  // Extract common keywords
  const keywords = [
    'test', 'testing', 'security', 'coverage', 'performance', 'accessibility',
    'generation', 'analysis', 'scanning', 'validation', 'ai', 'ml', 'learning',
    'quality', 'automation', 'integration', 'e2e', 'unit', 'api', 'tdd', 'bdd',
    'mutation', 'flaky', 'chaos', 'resilience', 'compliance', 'owasp', 'wcag',
  ];

  const combinedText = `${name} ${description}`.toLowerCase();
  for (const keyword of keywords) {
    if (combinedText.includes(keyword) && !tags.includes(keyword)) {
      tags.push(keyword);
    }
  }

  return tags;
}

/**
 * Format agent name to human-readable skill name
 */
function formatSkillName(agentName: string): string {
  return agentName
    .replace(/^qe-/, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Default tag extractor
 */
function defaultTagExtractor(markdown: string, parsed: ParsedAgentMarkdown): string[] {
  const tags: string[] = [];

  // Add domain
  if (parsed.frontmatter.domain) {
    tags.push(parsed.frontmatter.domain);
  }

  // Extract from skills
  const skills = defaultSkillExtractor(markdown, parsed);
  for (const skill of skills) {
    if (skill.tags) {
      for (const tag of skill.tags) {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
  }

  return tags;
}

// ============================================================================
// Example Extraction
// ============================================================================

/**
 * Extract examples from markdown content
 */
export function extractExamples(markdown: string, parsed: ParsedAgentMarkdown): string[] {
  const examples: string[] = [];

  // Try examples section
  if (parsed.examples) {
    // Extract code blocks
    const codeBlockPattern = /```[\s\S]*?Input:\s*([^\n]+)/g;
    let match: RegExpExecArray | null;
    while ((match = codeBlockPattern.exec(parsed.examples)) !== null) {
      examples.push(match[1].trim());
    }

    // Extract quoted examples
    const quotedPattern = /-\s*"([^"]+)"/g;
    while ((match = quotedPattern.exec(parsed.examples)) !== null) {
      examples.push(match[1].trim());
    }
  }

  // Try skills_available section
  if (parsed.skillsAvailable) {
    const quotedPattern = /-\s*"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = quotedPattern.exec(parsed.skillsAvailable)) !== null) {
      if (!examples.includes(match[1])) {
        examples.push(match[1].trim());
      }
    }
  }

  return examples;
}

// ============================================================================
// Memory Namespace Extraction
// ============================================================================

/**
 * Extract memory namespaces from markdown
 */
export function extractMemoryNamespaces(markdown: string, parsed: ParsedAgentMarkdown): {
  reads: string[];
  writes: string[];
} {
  const reads: string[] = [];
  const writes: string[] = [];

  if (!parsed.memoryNamespace) {
    return { reads, writes };
  }

  const lines = parsed.memoryNamespace.split('\n');
  let currentSection: 'reads' | 'writes' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.toLowerCase().startsWith('reads:')) {
      currentSection = 'reads';
    } else if (trimmed.toLowerCase().startsWith('writes:')) {
      currentSection = 'writes';
    } else if (trimmed.startsWith('-')) {
      const namespace = trimmed.replace(/^-\s*/, '').split(' ')[0];
      if (currentSection === 'reads') {
        reads.push(namespace);
      } else if (currentSection === 'writes') {
        writes.push(namespace);
      }
    }
  }

  return { reads, writes };
}

// ============================================================================
// Implementation Status Extraction
// ============================================================================

/**
 * Extract implementation status from markdown
 */
export function extractImplementationStatus(markdown: string, parsed: ParsedAgentMarkdown): {
  working: string[];
  partial: string[];
  planned: string[];
} {
  const working: string[] = [];
  const partial: string[] = [];
  const planned: string[] = [];

  if (!parsed.implementationStatus) {
    return { working, partial, planned };
  }

  const lines = parsed.implementationStatus.split('\n');
  let currentSection: 'working' | 'partial' | 'planned' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.toLowerCase().startsWith('working:')) {
      currentSection = 'working';
    } else if (trimmed.toLowerCase().startsWith('partial:')) {
      currentSection = 'partial';
    } else if (trimmed.toLowerCase().startsWith('planned:')) {
      currentSection = 'planned';
    } else if (trimmed.startsWith('-')) {
      const item = trimmed.replace(/^-\s*/, '');
      if (currentSection === 'working') {
        working.push(item);
      } else if (currentSection === 'partial') {
        partial.push(item);
      } else if (currentSection === 'planned') {
        planned.push(item);
      }
    }
  }

  return { working, partial, planned };
}

// ============================================================================
// Agent Card Generator Class
// ============================================================================

/**
 * Generator for A2A Agent Cards from agent markdown files
 */
export class AgentCardGenerator {
  private readonly config: Required<AgentCardGeneratorConfig>;

  constructor(config: Partial<AgentCardGeneratorConfig> = {}) {
    this.config = {
      ...DEFAULT_GENERATOR_CONFIG,
      ...config,
    };
  }

  /**
   * Generate an agent card from markdown content
   */
  generateFromMarkdown(markdown: string, agentId?: string): QEAgentCard {
    const parsed = parseAgentMarkdown(markdown);
    const frontmatter = parsed.frontmatter;

    // Determine agent name
    const name = frontmatter.name ?? agentId ?? 'unknown-agent';

    // Extract description
    let description = frontmatter.description ?? '';
    if (!description && parsed.identity) {
      // Try to extract from identity section
      const missionMatch = parsed.identity.match(/Mission:\s*([^\n]+)/);
      if (missionMatch) {
        description = missionMatch[1].trim();
      }
    }

    // Extract skills
    const skills = this.config.skillExtractor(markdown, parsed);

    // Add examples to skills
    const examples = extractExamples(markdown, parsed);
    if (examples.length > 0 && skills.length > 0) {
      // Add examples to the first (primary) skill
      const primarySkill = skills[0];
      skills[0] = {
        ...primarySkill,
        examples: [...(primarySkill.examples ?? []), ...examples],
      };
    }

    // Extract memory namespaces
    const memoryNamespaces = extractMemoryNamespaces(markdown, parsed);

    // Extract implementation status
    const implementationStatus = extractImplementationStatus(markdown, parsed);

    // Extract v2 compatibility
    let v2Compat: NonNullable<QEAgentCard['qeMetadata']>['v2Compatibility'] | undefined;
    if (frontmatter.v2_compat) {
      if (typeof frontmatter.v2_compat === 'string') {
        v2Compat = { name: frontmatter.v2_compat };
      } else {
        v2Compat = {
          name: frontmatter.v2_compat.name,
          deprecatedIn: frontmatter.v2_compat.deprecated_in,
          removedIn: frontmatter.v2_compat.removed_in,
        };
      }
    }

    // Build QE metadata
    const qeMetadata: QEAgentCard['qeMetadata'] = this.config.includeQEMetadata
      ? {
          domain: frontmatter.domain,
          v2Compatibility: v2Compat,
          memoryReads: memoryNamespaces.reads,
          memoryWrites: memoryNamespaces.writes,
          implementationStatus,
        }
      : undefined;

    // Build the agent card
    return createQEAgentCard(
      name,
      description,
      `${this.config.baseUrl}/a2a/${name}`,
      frontmatter.version ?? this.config.defaultVersion,
      skills,
      qeMetadata,
      {
        provider: this.config.provider,
        capabilities: this.config.defaultCapabilities,
        defaultInputModes: this.config.defaultInputModes,
        defaultOutputModes: this.config.defaultOutputModes,
        supportsAuthenticatedExtendedCard: true,
      }
    );
  }

  /**
   * Generate an agent card from a markdown file path
   */
  async generateFromFile(filePath: string): Promise<QEAgentCard> {
    const markdown = await readFile(filePath, 'utf-8');
    const agentId = basename(filePath, '.md');
    return this.generateFromMarkdown(markdown, agentId);
  }

  /**
   * Generate cards for all agent markdown files in a directory
   */
  async generateFromDirectory(directoryPath: string, recursive = true): Promise<GenerationResult> {
    const startTime = Date.now();
    const cards = new Map<string, QEAgentCard>();
    const errors = new Map<string, Error>();

    const processDirectory = async (dirPath: string): Promise<void> => {
      const entries = await readdir(dirPath);

      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stats = await stat(fullPath);

        if (stats.isDirectory() && recursive) {
          await processDirectory(fullPath);
        } else if (stats.isFile() && entry.endsWith('.md') && entry !== 'README.md') {
          try {
            const card = await this.generateFromFile(fullPath);
            cards.set(card.name, card);
          } catch (error) {
            errors.set(fullPath, toError(error));
          }
        }
      }
    };

    await processDirectory(directoryPath);

    const duration = Date.now() - startTime;

    return {
      cards,
      errors,
      stats: {
        total: cards.size + errors.size,
        success: cards.size,
        failed: errors.size,
        duration,
      },
    };
  }

  /**
   * Generate cards for all 68 QE agents
   */
  async generateAllCards(agentsBasePath: string): Promise<GenerationResult> {
    return this.generateFromDirectory(agentsBasePath, true);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an Agent Card Generator instance
 */
export function createAgentCardGenerator(
  config: Partial<AgentCardGeneratorConfig> = {}
): AgentCardGenerator {
  return new AgentCardGenerator(config);
}
