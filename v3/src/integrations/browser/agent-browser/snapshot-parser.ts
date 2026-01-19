/**
 * agent-browser Snapshot Parser
 * Parses accessibility snapshots to extract refs for element selection
 */

// Element from snapshot
export interface SnapshotElement {
  ref: string;              // e1, e2, etc. (without @)
  refWithAt: string;        // @e1, @e2 (for CLI commands)
  role: string;             // button, textbox, heading, link, etc.
  name?: string;            // Accessible name (e.g., "Submit")
  text?: string;            // Text content
  level?: number;           // For headings
  attributes: Record<string, string>;
  depth: number;            // Nesting level in tree
  parent?: string;          // Parent ref
  children: string[];       // Child refs
}

// Parsed snapshot result
export interface ParsedSnapshot {
  url?: string;
  title?: string;
  rawTree: string;
  elements: SnapshotElement[];
  interactiveElements: SnapshotElement[];
  refMap: Map<string, SnapshotElement>;
  stats: {
    totalElements: number;
    interactiveCount: number;
    maxDepth: number;
  };
  parsedAt: Date;
}

// Interactive roles that get refs
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem',
]);

// Content roles that may have refs
const CONTENT_ROLES = new Set([
  'heading',
  'cell',
  'gridcell',
  'columnheader',
  'rowheader',
  'listitem',
]);

/**
 * Parse snapshot text output from agent-browser
 */
export class SnapshotParser {

  /**
   * Parse raw snapshot text into structured format
   */
  parse(snapshotOutput: string): ParsedSnapshot {
    const lines = snapshotOutput.split('\n');
    const elements: SnapshotElement[] = [];
    const refMap = new Map<string, SnapshotElement>();
    let maxDepth = 0;

    for (const line of lines) {
      const element = this.parseLine(line);
      if (element) {
        elements.push(element);
        refMap.set(element.ref, element);
        if (element.depth > maxDepth) {
          maxDepth = element.depth;
        }
      }
    }

    // Build parent-child relationships
    this.buildRelationships(elements);

    const interactiveElements = elements.filter(
      (el) => INTERACTIVE_ROLES.has(el.role.toLowerCase())
    );

    return {
      rawTree: snapshotOutput,
      elements,
      interactiveElements,
      refMap,
      stats: {
        totalElements: elements.length,
        interactiveCount: interactiveElements.length,
        maxDepth,
      },
      parsedAt: new Date(),
    };
  }

  /**
   * Parse JSON output from `agent-browser snapshot --json`
   */
  parseJson(jsonOutput: string | object): ParsedSnapshot {
    const data = typeof jsonOutput === 'string' ? JSON.parse(jsonOutput) : jsonOutput;

    // JSON format includes success, data.snapshot, data.refs
    if (data.success && data.data) {
      const snapshot = data.data.snapshot || data.data;
      const refs = data.data.refs || {};

      return this.parseWithRefs(snapshot, refs);
    }

    // Fallback to text parsing
    if (typeof data === 'string') {
      return this.parse(data);
    }

    throw new Error('Invalid snapshot JSON format');
  }

  /**
   * Parse snapshot with pre-extracted refs (from JSON)
   */
  private parseWithRefs(tree: string, refs: Record<string, { role: string; name?: string; nth?: number }>): ParsedSnapshot {
    const elements: SnapshotElement[] = [];
    const refMap = new Map<string, SnapshotElement>();
    let maxDepth = 0;

    // Build elements from refs
    for (const [refId, refData] of Object.entries(refs)) {
      const element: SnapshotElement = {
        ref: refId,
        refWithAt: `@${refId}`,
        role: refData.role,
        name: refData.name,
        attributes: {},
        depth: 0,
        children: [],
      };
      elements.push(element);
      refMap.set(refId, element);
    }

    // Also parse the tree for additional context
    const treeElements = this.parse(tree);

    // Merge tree info into elements
    for (const treeEl of treeElements.elements) {
      const existing = refMap.get(treeEl.ref);
      if (existing) {
        existing.text = treeEl.text;
        existing.depth = treeEl.depth;
        existing.level = treeEl.level;
        if (treeEl.depth > maxDepth) maxDepth = treeEl.depth;
      }
    }

    const interactiveElements = elements.filter(
      (el) => INTERACTIVE_ROLES.has(el.role.toLowerCase())
    );

    return {
      rawTree: tree,
      elements,
      interactiveElements,
      refMap,
      stats: {
        totalElements: elements.length,
        interactiveCount: interactiveElements.length,
        maxDepth,
      },
      parsedAt: new Date(),
    };
  }

  /**
   * Parse a single line from snapshot output
   */
  private parseLine(line: string): SnapshotElement | null {
    // Skip empty lines
    if (!line.trim()) return null;

    // Calculate depth from indentation (2 spaces per level)
    const depth = this.getIndentLevel(line);

    // Match patterns like:
    // - button "Submit" [ref=e2]
    // - heading "Title" [ref=e1] [level=1]
    // - textbox "Email" [ref=e3]
    const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
    if (!match) return null;

    const [, , role, name, suffix] = match;

    // Extract ref
    const refMatch = suffix?.match(/\[ref=(\w+)\]/);
    if (!refMatch) return null;

    const ref = refMatch[1];

    // Extract level (for headings)
    const levelMatch = suffix?.match(/\[level=(\d+)\]/);
    const level = levelMatch ? parseInt(levelMatch[1], 10) : undefined;

    // Extract nth (for duplicates)
    const nthMatch = suffix?.match(/\[nth=(\d+)\]/);
    const nth = nthMatch ? parseInt(nthMatch[1], 10) : undefined;

    // Extract any text content after colon
    const textMatch = line.match(/:\s*(.+)$/);
    const text = textMatch ? textMatch[1].trim() : undefined;

    const attributes: Record<string, string> = {};
    if (level) attributes['level'] = String(level);
    if (nth !== undefined) attributes['nth'] = String(nth);

    return {
      ref,
      refWithAt: `@${ref}`,
      role: role.toLowerCase(),
      name,
      text,
      level,
      attributes,
      depth,
      children: [],
    };
  }

  /**
   * Get indentation level (2 spaces per level)
   */
  private getIndentLevel(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? Math.floor(match[1].length / 2) : 0;
  }

  /**
   * Build parent-child relationships between elements
   */
  private buildRelationships(elements: SnapshotElement[]): void {
    const stack: SnapshotElement[] = [];

    for (const element of elements) {
      // Pop stack until we find parent at lower depth
      while (stack.length > 0 && stack[stack.length - 1].depth >= element.depth) {
        stack.pop();
      }

      // Set parent and add as child
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        element.parent = parent.ref;
        parent.children.push(element.ref);
      }

      stack.push(element);
    }
  }

  // ========================================================================
  // Query methods
  // ========================================================================

  /**
   * Find element by ref
   */
  findByRef(snapshot: ParsedSnapshot, ref: string): SnapshotElement | null {
    // Normalize ref (remove @ if present)
    const normalizedRef = ref.startsWith('@') ? ref.slice(1) : ref;
    return snapshot.refMap.get(normalizedRef) || null;
  }

  /**
   * Find elements by role
   */
  findByRole(snapshot: ParsedSnapshot, role: string): SnapshotElement[] {
    return snapshot.elements.filter(
      (el) => el.role.toLowerCase() === role.toLowerCase()
    );
  }

  /**
   * Find elements by name (accessible name)
   */
  findByName(snapshot: ParsedSnapshot, name: string, exact = false): SnapshotElement[] {
    return snapshot.elements.filter((el) => {
      if (!el.name) return false;
      if (exact) return el.name === name;
      return el.name.toLowerCase().includes(name.toLowerCase());
    });
  }

  /**
   * Find elements by text content
   */
  findByText(snapshot: ParsedSnapshot, text: string, exact = false): SnapshotElement[] {
    return snapshot.elements.filter((el) => {
      const content = el.text || el.name || '';
      if (exact) return content === text;
      return content.toLowerCase().includes(text.toLowerCase());
    });
  }

  /**
   * Find first interactive element matching criteria
   */
  findInteractive(
    snapshot: ParsedSnapshot,
    criteria: { role?: string; name?: string; text?: string }
  ): SnapshotElement | null {
    for (const el of snapshot.interactiveElements) {
      if (criteria.role && el.role.toLowerCase() !== criteria.role.toLowerCase()) {
        continue;
      }
      if (criteria.name && el.name !== criteria.name) {
        continue;
      }
      if (criteria.text) {
        const content = el.text || el.name || '';
        if (!content.toLowerCase().includes(criteria.text.toLowerCase())) {
          continue;
        }
      }
      return el;
    }
    return null;
  }

  /**
   * Convert ref to CSS selector (for Vibium fallback)
   * Uses role + name as best guess
   */
  refToCssSelector(snapshot: ParsedSnapshot, ref: string): string | null {
    const element = this.findByRef(snapshot, ref);
    if (!element) return null;

    // Build selector based on role and name
    const role = element.role;
    const name = element.name;

    // Common mappings
    const selectorMap: Record<string, string> = {
      button: name ? `button:has-text("${name}")` : 'button',
      link: name ? `a:has-text("${name}")` : 'a',
      textbox: name ? `input[placeholder="${name}"], input[aria-label="${name}"]` : 'input[type="text"]',
      heading: name ? `h1:has-text("${name}"), h2:has-text("${name}"), h3:has-text("${name}")` : 'h1, h2, h3',
      checkbox: name ? `input[type="checkbox"][aria-label="${name}"]` : 'input[type="checkbox"]',
    };

    return selectorMap[role] || `[role="${role}"]`;
  }
}

// Singleton instance
let parserInstance: SnapshotParser | null = null;

export function getSnapshotParser(): SnapshotParser {
  if (!parserInstance) {
    parserInstance = new SnapshotParser();
  }
  return parserInstance;
}
