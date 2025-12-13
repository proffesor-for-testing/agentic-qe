/**
 * Accessible Name and Description Computation (AccName)
 *
 * Implementation of W3C Accessible Name and Description Computation 1.2
 * Version: Based on W3C Recommendation (2023)
 *
 * Purpose: Compute accessible names and descriptions for elements as perceived by assistive technologies
 * Reference: https://www.w3.org/TR/accname-1.2/
 *
 * WCAG Success Criteria:
 * - 4.1.2 Name, Role, Value - Level A
 * - 2.4.6 Headings and Labels - Level AA
 * - 3.3.2 Labels or Instructions - Level A
 */

export interface AccNameSource {
  /** Type of source used for the accessible name */
  type:
    | 'aria-labelledby'
    | 'aria-label'
    | 'native-label'
    | 'native-semantics'
    | 'title'
    | 'placeholder'
    | 'none';

  /** The computed name value */
  value: string;

  /** Priority in computation order (1 = highest) */
  priority: number;

  /** Whether this source is recommended for accessibility */
  recommended: boolean;

  /** Additional context about the source */
  details?: string;
}

export interface AccNameComputation {
  /** The final computed accessible name */
  accessibleName: string;

  /** How the name was computed */
  source: AccNameSource;

  /** All possible sources found (in priority order) */
  allSources: AccNameSource[];

  /** Accessible description (via aria-describedby, title, etc.) */
  accessibleDescription?: string;

  /** Whether the accessible name is sufficient */
  sufficient: boolean;

  /** Quality score (0-100) */
  quality: number;

  /** Issues found with the accessible name */
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    recommendation: string;
  }>;

  /** Step-by-step computation trace for debugging */
  trace: string[];
}

/**
 * Compute accessible name for an element
 *
 * Implements the W3C AccName algorithm
 */
export function computeAccessibleName(
  element: {
    tagName: string;
    role?: string;
    attributes: Record<string, string>;
    textContent?: string;
    children?: Array<{
      tagName: string;
      attributes: Record<string, string>;
      textContent?: string;
    }>;
  },
  options: {
    /** Include computation trace for debugging */
    includeTrace?: boolean;
  } = {}
): AccNameComputation {
  const trace: string[] = [];
  const allSources: AccNameSource[] = [];

  if (options.includeTrace) {
    trace.push(`Starting AccName computation for <${element.tagName}${element.role ? ` role="${element.role}"` : ''}>`);
  }

  let accessibleName = '';
  let source: AccNameSource | null = null;

  // Step 1: Check aria-labelledby (highest priority)
  const ariaLabelledBy = element.attributes['aria-labelledby'];
  if (ariaLabelledBy) {
    trace.push(`Found aria-labelledby="${ariaLabelledBy}"`);

    // In real implementation, would fetch referenced element's text
    // For this implementation, we'll note it exists
    const labelledBySource: AccNameSource = {
      type: 'aria-labelledby',
      value: `[Referenced element: ${ariaLabelledBy}]`,
      priority: 1,
      recommended: true,
      details: 'Highest priority - references visible label element(s)'
    };

    allSources.push(labelledBySource);

    if (!source) {
      source = labelledBySource;
      accessibleName = labelledBySource.value;
      trace.push(`✓ Using aria-labelledby (priority 1)`);
    }
  }

  // Step 2: Check aria-label
  const ariaLabel = element.attributes['aria-label'];
  if (ariaLabel) {
    trace.push(`Found aria-label="${ariaLabel}"`);

    const ariaLabelSource: AccNameSource = {
      type: 'aria-label',
      value: ariaLabel,
      priority: 2,
      recommended: true,
      details: 'Direct text label - good for icon buttons or when visual label inadequate'
    };

    allSources.push(ariaLabelSource);

    if (!source) {
      source = ariaLabelSource;
      accessibleName = ariaLabel;
      trace.push(`✓ Using aria-label (priority 2)`);
    }
  }

  // Step 3: Check for native label (for form inputs)
  const id = element.attributes['id'];
  const nativeLabel = element.attributes['_native-label']; // Placeholder for <label for="id">
  if (id && nativeLabel) {
    trace.push(`Found <label for="${id}"> with text: "${nativeLabel}"`);

    const nativeLabelSource: AccNameSource = {
      type: 'native-label',
      value: nativeLabel,
      priority: 3,
      recommended: true,
      details: 'Native HTML label - preferred for form inputs'
    };

    allSources.push(nativeLabelSource);

    if (!source) {
      source = nativeLabelSource;
      accessibleName = nativeLabel;
      trace.push(`✓ Using native <label> (priority 3)`);
    }
  }

  // Step 4: Check native semantics
  const nativeSemantics = getNativeSemanticName(element);
  if (nativeSemantics) {
    trace.push(`Native semantics provide: "${nativeSemantics.value}"`);

    allSources.push(nativeSemantics);

    if (!source) {
      source = nativeSemantics;
      accessibleName = nativeSemantics.value;
      trace.push(`✓ Using native semantics (priority 4)`);
    }
  }

  // Step 5: Check title attribute
  const title = element.attributes['title'];
  if (title) {
    trace.push(`Found title="${title}"`);

    const titleSource: AccNameSource = {
      type: 'title',
      value: title,
      priority: 5,
      recommended: false,
      details: 'Title attribute - discouraged as primary name source (not always announced)'
    };

    allSources.push(titleSource);

    if (!source) {
      source = titleSource;
      accessibleName = title;
      trace.push(`⚠ Using title attribute (priority 5) - not recommended as primary source`);
    }
  }

  // Step 6: Check placeholder (for inputs only)
  const placeholder = element.attributes['placeholder'];
  if (placeholder && (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea')) {
    trace.push(`Found placeholder="${placeholder}"`);

    const placeholderSource: AccNameSource = {
      type: 'placeholder',
      value: placeholder,
      priority: 6,
      recommended: false,
      details: 'Placeholder - strongly discouraged as accessible name (disappears on focus)'
    };

    allSources.push(placeholderSource);

    if (!source) {
      source = placeholderSource;
      accessibleName = placeholder;
      trace.push(`❌ Using placeholder (priority 6) - NOT RECOMMENDED`);
    }
  }

  // If no source found, accessible name is empty
  if (!source) {
    source = {
      type: 'none',
      value: '',
      priority: 99,
      recommended: false,
      details: 'No accessible name found - CRITICAL ISSUE'
    };
    trace.push(`❌ No accessible name found!`);
  }

  // Compute accessible description
  const accessibleDescription = computeAccessibleDescription(element, trace);

  // Validate and score the accessible name
  const validation = validateAccessibleName(
    accessibleName,
    source,
    element
  );

  return {
    accessibleName,
    source,
    allSources,
    accessibleDescription,
    sufficient: validation.sufficient,
    quality: validation.quality,
    issues: validation.issues,
    trace: options.includeTrace ? trace : []
  };
}

/**
 * Get accessible name from native HTML semantics
 */
function getNativeSemanticName(element: {
  tagName: string;
  attributes: Record<string, string>;
  textContent?: string;
}): AccNameSource | null {
  const tagName = element.tagName.toLowerCase();

  // Image alt text
  if (tagName === 'img') {
    const alt = element.attributes['alt'];
    if (alt !== undefined) {
      return {
        type: 'native-semantics',
        value: alt,
        priority: 4,
        recommended: true,
        details: 'Alt attribute on <img> - required for accessibility'
      };
    }
  }

  // Button or link text content
  if (tagName === 'button' || tagName === 'a') {
    const textContent = element.textContent?.trim();
    if (textContent) {
      return {
        type: 'native-semantics',
        value: textContent,
        priority: 4,
        recommended: true,
        details: 'Text content of interactive element'
      };
    }
  }

  // Input type="submit" or type="button" value
  if (tagName === 'input') {
    const type = element.attributes['type'];
    if (type === 'submit' || type === 'button' || type === 'reset') {
      const value = element.attributes['value'];
      if (value) {
        return {
          type: 'native-semantics',
          value,
          priority: 4,
          recommended: true,
          details: `Value attribute on <input type="${type}">`
        };
      }
    }
  }

  // Area element with alt
  if (tagName === 'area') {
    const alt = element.attributes['alt'];
    if (alt !== undefined) {
      return {
        type: 'native-semantics',
        value: alt,
        priority: 4,
        recommended: true,
        details: 'Alt attribute on <area> (image map)'
      };
    }
  }

  return null;
}

/**
 * Compute accessible description
 */
function computeAccessibleDescription(
  element: { attributes: Record<string, string> },
  trace: string[]
): string | undefined {
  // aria-describedby (highest priority)
  const ariaDescribedBy = element.attributes['aria-describedby'];
  if (ariaDescribedBy) {
    trace.push(`Description: Found aria-describedby="${ariaDescribedBy}"`);
    return `[Referenced element: ${ariaDescribedBy}]`;
  }

  // title attribute (if not used for name)
  const title = element.attributes['title'];
  if (title) {
    trace.push(`Description: Using title="${title}"`);
    return title;
  }

  trace.push(`Description: None found`);
  return undefined;
}

/**
 * Validate accessible name quality
 */
function validateAccessibleName(
  name: string,
  source: AccNameSource,
  element: { tagName: string; role?: string; attributes: Record<string, string> }
): {
  sufficient: boolean;
  quality: number;
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    recommendation: string;
  }>;
} {
  const issues: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    recommendation: string;
  }> = [];

  let quality = 100;

  // Check if name exists
  if (!name || name.trim().length === 0) {
    issues.push({
      severity: 'error',
      message: 'No accessible name found',
      recommendation: 'Add aria-label, aria-labelledby, or native label to this element'
    });
    quality = 0;
    return { sufficient: false, quality, issues };
  }

  // Check if using non-recommended source
  if (!source.recommended) {
    if (source.type === 'placeholder') {
      issues.push({
        severity: 'error',
        message: 'Using placeholder as accessible name',
        recommendation: 'Add a proper <label> or aria-label. Placeholder disappears when user starts typing.'
      });
      quality -= 50;
    } else if (source.type === 'title') {
      issues.push({
        severity: 'warning',
        message: 'Using title attribute as accessible name',
        recommendation: 'Title is not consistently announced by screen readers. Use aria-label or visible label instead.'
      });
      quality -= 30;
    }
  }

  // Check name length
  if (name.length < 2) {
    issues.push({
      severity: 'warning',
      message: `Accessible name is very short: "${name}"`,
      recommendation: 'Provide more descriptive name for better context'
    });
    quality -= 20;
  }

  if (name.length > 100) {
    issues.push({
      severity: 'warning',
      message: `Accessible name is very long (${name.length} characters)`,
      recommendation: 'Consider using aria-describedby for detailed information, keep name concise'
    });
    quality -= 10;
  }

  // Check for generic names
  const genericNames = ['button', 'link', 'click here', 'read more', 'submit', 'image', 'icon'];
  const nameLower = name.toLowerCase().trim();

  if (genericNames.includes(nameLower)) {
    issues.push({
      severity: 'warning',
      message: `Accessible name is too generic: "${name}"`,
      recommendation: 'Provide specific, descriptive name (e.g., "Submit Contact Form" instead of "Submit")'
    });
    quality -= 25;
  }

  // Check for technical content (IDs, class names)
  if (/^[a-z0-9-_]+$/.test(name) && name.includes('-')) {
    issues.push({
      severity: 'warning',
      message: `Accessible name looks like technical identifier: "${name}"`,
      recommendation: 'Use human-readable text instead of IDs or class names'
    });
    quality -= 30;
  }

  // Element-specific validation
  if (element.tagName.toLowerCase() === 'img' && source.type === 'native-semantics') {
    if (name === '') {
      // Empty alt is valid for decorative images
      issues.push({
        severity: 'info',
        message: 'Image has empty alt attribute (alt="")',
        recommendation: 'This is correct for decorative images. If image conveys information, add descriptive alt text.'
      });
    }
  }

  // Form input specific checks
  if (['input', 'select', 'textarea'].includes(element.tagName.toLowerCase())) {
    if (source.type !== 'native-label' && source.type !== 'aria-labelledby' && source.type !== 'aria-label') {
      issues.push({
        severity: 'error',
        message: 'Form input lacks proper label',
        recommendation: 'Add <label for="inputId"> or aria-label for form inputs'
      });
      quality -= 40;
    }
  }

  // Interactive element checks
  if (['button', 'a'].includes(element.tagName.toLowerCase()) || element.role === 'button' || element.role === 'link') {
    if (!name || name.trim().length === 0) {
      issues.push({
        severity: 'error',
        message: 'Interactive element has no accessible name',
        recommendation: 'Add visible text content or aria-label to describe the action'
      });
      quality = 0;
    }
  }

  const sufficient = quality >= 60 && issues.filter(i => i.severity === 'error').length === 0;

  return {
    sufficient,
    quality: Math.max(0, quality),
    issues
  };
}

/**
 * Generate accessible name recommendation
 */
export function generateAccessibleNameRecommendation(
  computation: AccNameComputation,
  element: {
    tagName: string;
    role?: string;
    attributes: Record<string, string>;
    context?: string;
  }
): {
  recommendation: string;
  codeExample: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
} {
  const tagName = element.tagName.toLowerCase();
  const role = element.role;

  // No accessible name - CRITICAL
  if (!computation.accessibleName || computation.accessibleName.trim().length === 0) {
    if (tagName === 'img') {
      return {
        recommendation: 'Add descriptive alt attribute to image',
        codeExample: `<img src="..." alt="Description of what the image shows">`,
        priority: 'critical'
      };
    }

    if (tagName === 'button' || role === 'button') {
      const context = element.context?.toLowerCase() || '';
      const suggestedLabel = context.includes('close') ? 'Close dialog' :
        context.includes('menu') ? 'Open menu' :
        context.includes('search') ? 'Search' :
        'Describe button action';

      return {
        recommendation: 'Add accessible name to button',
        codeExample: `<!-- Option 1: Visible text (preferred) -->
<button type="button">${suggestedLabel}</button>

<!-- Option 2: aria-label for icon buttons -->
<button type="button" aria-label="${suggestedLabel}">
  <svg aria-hidden="true">...</svg>
</button>`,
        priority: 'critical'
      };
    }

    if (['input', 'select', 'textarea'].includes(tagName)) {
      const type = element.attributes['type'] || 'text';
      return {
        recommendation: 'Add label to form input',
        codeExample: `<!-- Preferred: Visible label -->
<label for="inputId">Field label:</label>
<input type="${type}" id="inputId" name="...">

<!-- Alternative: aria-label if visible label not possible -->
<input type="${type}" aria-label="Field label">`,
        priority: 'critical'
      };
    }

    return {
      recommendation: 'Add accessible name via aria-label or aria-labelledby',
      codeExample: `<${tagName} aria-label="Descriptive name">...</${tagName}>`,
      priority: 'critical'
    };
  }

  // Using placeholder as name - HIGH PRIORITY FIX
  if (computation.source.type === 'placeholder') {
    return {
      recommendation: 'Replace placeholder with proper label',
      codeExample: `<!-- WRONG (current) -->
<input type="text" placeholder="Enter email">

<!-- CORRECT -->
<label for="email">Email address:</label>
<input type="text" id="email" placeholder="you@example.com">`,
      priority: 'high'
    };
  }

  // Using title as name - MEDIUM PRIORITY
  if (computation.source.type === 'title') {
    return {
      recommendation: 'Replace title with aria-label or visible label',
      codeExample: `<!-- WRONG (current) -->
<button title="Submit form">→</button>

<!-- CORRECT -->
<button type="button" aria-label="Submit form">→</button>

<!-- BETTER: Visible text -->
<button type="button">Submit Form</button>`,
      priority: 'medium'
    };
  }

  // Name too generic - MEDIUM PRIORITY
  if (computation.quality < 70) {
    return {
      recommendation: 'Make accessible name more descriptive',
      codeExample: `<!-- Current: Generic -->
<button>Click Here</button>

<!-- Better: Specific -->
<button>Download PDF Report</button>`,
      priority: 'medium'
    };
  }

  return {
    recommendation: 'Accessible name is adequate',
    codeExample: '',
    priority: 'low'
  };
}

/**
 * Visualize accessible name computation for debugging
 */
export function visualizeAccNameComputation(
  computation: AccNameComputation
): string {
  let output = '=== Accessible Name Computation ===\n\n';

  output += `Final Name: "${computation.accessibleName}"\n`;
  output += `Quality Score: ${computation.quality}/100\n`;
  output += `Sufficient: ${computation.sufficient ? '✓ Yes' : '✗ No'}\n`;
  output += `Source: ${computation.source.type} (priority ${computation.source.priority})\n`;

  if (computation.accessibleDescription) {
    output += `Description: "${computation.accessibleDescription}"\n`;
  }

  output += '\n--- All Sources (Priority Order) ---\n';
  computation.allSources.forEach(source => {
    const icon = source === computation.source ? '→' : ' ';
    output += `${icon} [${source.priority}] ${source.type}: "${source.value}"\n`;
    output += `   ${source.recommended ? '✓' : '⚠'} ${source.details}\n`;
  });

  if (computation.issues.length > 0) {
    output += '\n--- Issues ---\n';
    computation.issues.forEach(issue => {
      const icon = issue.severity === 'error' ? '❌' :
        issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      output += `${icon} ${issue.message}\n`;
      output += `   Recommendation: ${issue.recommendation}\n`;
    });
  }

  if (computation.trace.length > 0) {
    output += '\n--- Computation Trace ---\n';
    computation.trace.forEach(step => {
      output += `${step}\n`;
    });
  }

  return output;
}

/**
 * Example usage and test cases
 */
export const ACCNAME_EXAMPLES = {
  /**
   * Perfect accessible name (visible label)
   */
  perfectButton: (): AccNameComputation => {
    return computeAccessibleName({
      tagName: 'button',
      attributes: {},
      textContent: 'Submit Contact Form'
    }, { includeTrace: true });
  },

  /**
   * Icon button with aria-label
   */
  iconButton: (): AccNameComputation => {
    return computeAccessibleName({
      tagName: 'button',
      role: 'button',
      attributes: {
        'aria-label': 'Close navigation menu'
      },
      textContent: '' // No visible text
    }, { includeTrace: true });
  },

  /**
   * Form input with label
   */
  formInput: (): AccNameComputation => {
    return computeAccessibleName({
      tagName: 'input',
      attributes: {
        'type': 'email',
        'id': 'user-email',
        '_native-label': 'Email Address' // Simulated <label for="user-email">
      }
    }, { includeTrace: true });
  },

  /**
   * WRONG: Using placeholder as name
   */
  wrongPlaceholder: (): AccNameComputation => {
    return computeAccessibleName({
      tagName: 'input',
      attributes: {
        'type': 'text',
        'placeholder': 'Enter your name'
        // Missing: aria-label or <label>
      }
    }, { includeTrace: true });
  },

  /**
   * Image with alt text
   */
  imageWithAlt: (): AccNameComputation => {
    return computeAccessibleName({
      tagName: 'img',
      attributes: {
        'src': 'logo.png',
        'alt': 'Company Logo'
      }
    }, { includeTrace: true });
  },

  /**
   * Missing accessible name
   */
  missingName: (): AccNameComputation => {
    return computeAccessibleName({
      tagName: 'button',
      attributes: {},
      textContent: '' // Empty button
    }, { includeTrace: true });
  }
};
