/**
 * Unit Tests for "Cleanup Output to JSON2" Code Node
 *
 * Purpose: Advanced JSON cleanup specifically for Director output.
 * Handles newline cleanup and smart quote sanitization in email_body field.
 * Uses lookbehind regex for quote escaping.
 */

const { describe, it, expect } = require('@jest/globals');

// Function Under Test (extracted from n8n Code node)
function cleanupOutputToJson2(item) {
  const raw = item.json?.output || item.output || "";

  // 1. Basic Extraction
  const firstOpen = raw.indexOf('{');
  const lastClose = raw.lastIndexOf('}');
  if (firstOpen === -1 || lastClose === -1) {
    return { json: { error: "No JSON brackets found", raw_output: raw } };
  }

  let jsonString = raw.substring(firstOpen, lastClose + 1);

  // 2. NEWLINE CLEANUP
  jsonString = jsonString.replace(/\n/g, " ").replace(/\r/g, "");

  // 3. SMART QUOTE SANITIZATION
  const bodyPattern = /("email_body"\s*:\s*")(.*?)("\s*,\s*"key_insight")/s;
  const match = jsonString.match(bodyPattern);

  if (match) {
    const prefix = match[1];
    let content = match[2];
    const suffix = match[3];

    // Escape any double quote that is NOT already escaped
    content = content.replace(/(?<!\\)"/g, '\\"');

    // Reconstruct the valid JSON string
    jsonString = jsonString.replace(match[0], prefix + content + suffix);
  }

  try {
    // 4. Parse
    const data = JSON.parse(jsonString);
    return { json: data };
  } catch (e) {
    return {
      json: {
        parse_error: e.message,
        debug_tip: "Check the 'sanitized_string' below to see where the quotes broke.",
        sanitized_string: jsonString
      }
    };
  }
}

describe('Cleanup Output to JSON2', () => {
  describe('Happy Path - Basic Extraction', () => {
    it('should extract JSON from surrounding text', () => {
      const input = {
        json: {
          output: 'Here is the strategy: {"email_subject": "Strategy Update", "email_body": "Content", "key_insight": "Insight"} - done'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.email_subject).toBe('Strategy Update');
      expect(result.json.email_body).toBe('Content');
      expect(result.json.key_insight).toBe('Insight');
    });

    it('should handle clean JSON input', () => {
      const input = {
        json: {
          output: '{"email_subject": "Report", "email_body": "Details here", "key_insight": "Key point"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.email_subject).toBe('Report');
    });

    it('should handle JSON at start of output', () => {
      const input = {
        json: {
          output: '{"data": "value", "email_body": "test", "key_insight": "insight"} additional text'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.data).toBe('value');
    });
  });

  describe('Newline Cleanup', () => {
    it('should replace newlines with spaces', () => {
      const input = {
        json: {
          output: `{
"email_subject": "Multi
line subject",
"email_body": "Body",
"key_insight": "Insight"
}`
        }
      };

      const result = cleanupOutputToJson2(input);

      // Newlines in the JSON structure should be removed, allowing parse
      expect(result.json.email_subject).toContain('Multi');
    });

    it('should handle carriage returns', () => {
      const input = {
        json: {
          output: '{"email_subject": "Test\r\n", "email_body": "Content\r", "key_insight": "Insight"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      // Should parse after CR/LF removal
      expect(result.json.error).toBeUndefined();
    });

    it('should handle mixed line endings', () => {
      const input = {
        json: {
          output: '{"a": "1",\n"email_body": "test",\r\n"key_insight": "insight"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.a).toBe('1');
    });
  });

  describe('Smart Quote Sanitization', () => {
    it('should escape unescaped quotes in email_body', () => {
      const input = {
        json: {
          output: '{"email_subject": "Subject", "email_body": "He said "hello" to me", "key_insight": "Quoted speech detected"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      // After sanitization, should parse successfully
      expect(result.json.email_body).toContain('hello');
      expect(result.json.key_insight).toBe('Quoted speech detected');
    });

    it('should preserve already escaped quotes', () => {
      const input = {
        json: {
          output: '{"email_subject": "Test", "email_body": "Already \\"escaped\\" quotes", "key_insight": "Insight"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.email_body).toBe('Already "escaped" quotes');
    });

    it('should handle HTML in email_body', () => {
      const input = {
        json: {
          output: '{"email_subject": "HTML Report", "email_body": "<div class="container"><p>Content</p></div>", "key_insight": "Styled content"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      // Should escape the HTML attribute quotes
      expect(result.json.email_body).toContain('class=');
      expect(result.json.parse_error).toBeUndefined();
    });

    it('should handle multiple unescaped quotes', () => {
      const input = {
        json: {
          output: '{"email_subject": "Quotes", "email_body": "First "quote" and second "quote" here", "key_insight": "Multiple quotes"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.email_body).toContain('First');
      expect(result.json.email_body).toContain('second');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty email_body', () => {
      const input = {
        json: {
          output: '{"email_subject": "Empty", "email_body": "", "key_insight": "Nothing"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.email_body).toBe('');
    });

    it('should handle email_body with only whitespace', () => {
      const input = {
        json: {
          output: '{"email_subject": "Space", "email_body": "   ", "key_insight": "Whitespace"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.email_body).toBe('   ');
    });

    it('should handle missing output field', () => {
      const input = {
        json: {}
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.error).toBe('No JSON brackets found');
    });

    it('should handle output at root level', () => {
      const input = {
        output: '{"email_subject": "Root", "email_body": "Test", "key_insight": "Direct"}'
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.email_subject).toBe('Root');
    });

    it('should handle nested JSON objects', () => {
      const input = {
        json: {
          output: '{"email_subject": "Nested", "email_body": "Test", "key_insight": "Data", "metrics": {"value": 100}}'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.metrics.value).toBe(100);
    });
  });

  describe('Error Handling', () => {
    it('should return error when no JSON brackets found', () => {
      const input = {
        json: {
          output: 'Just plain text without JSON'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.error).toBe('No JSON brackets found');
      expect(result.json.raw_output).toBe('Just plain text without JSON');
    });

    it('should return error for only opening bracket', () => {
      const input = {
        json: {
          output: 'Text with { opening only'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.error).toBe('No JSON brackets found');
    });

    it('should return error for only closing bracket', () => {
      const input = {
        json: {
          output: 'Text with } closing only'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.error).toBe('No JSON brackets found');
    });

    it('should return parse error for malformed JSON', () => {
      const input = {
        json: {
          output: '{incomplete: json without proper quotes}'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.parse_error).toBeDefined();
      expect(result.json.debug_tip).toContain('sanitized_string');
    });

    it('should include sanitized string for debugging', () => {
      const input = {
        json: {
          output: '{broken: true, "email_body": "test", "key_insight": "x"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.sanitized_string).toBeDefined();
    });
  });

  describe('Pattern Matching Edge Cases', () => {
    it('should handle different whitespace around email_body', () => {
      const input = {
        json: {
          output: '{"email_subject": "Test", "email_body"  :  "Content with "quotes"", "key_insight": "Spaced"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      // Pattern should match with flexible whitespace
      expect(result.json.parse_error).toBeUndefined();
    });

    it('should not modify content outside email_body', () => {
      const input = {
        json: {
          output: '{"email_subject": "Has \\"quotes\\"", "email_body": "Clean", "key_insight": "Also \\"quoted\\""}'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.email_subject).toBe('Has "quotes"');
      expect(result.json.key_insight).toBe('Also "quoted"');
    });

    it('should handle email_body as last field (no pattern match)', () => {
      // The pattern expects key_insight after email_body
      const input = {
        json: {
          output: '{"email_subject": "Test", "key_insight": "First", "email_body": "Content with "quotes""}'
        }
      };

      const result = cleanupOutputToJson2(input);

      // Will fail because pattern doesn't match - email_body isn't followed by key_insight
      expect(result.json.parse_error).toBeDefined();
    });
  });

  describe('Real-World Scenarios', () => {
    it('should parse typical Director output', () => {
      const input = {
        json: {
          output: `Based on the analyst reports, here is my strategic recommendation:

{"email_subject": "Weekly Marketing Strategy - Action Required", "email_body": "<h2>Strategic Overview</h2><p>Based on performance data, I recommend the following adjustments:</p><ul><li>Increase Meta spend by 15%</li><li>Focus on retargeting</li></ul>", "key_insight": "ROI opportunity: Shift 20% budget to top-performing channels"}`
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.email_subject).toContain('Strategy');
      expect(result.json.email_body).toContain('Strategic Overview');
      expect(result.json.key_insight).toContain('ROI');
    });

    it('should handle Director output with line breaks in content', () => {
      const input = {
        json: {
          output: `{
"email_subject": "Strategy Update",
"email_body": "Point 1: Do this
Point 2: Do that
Point 3: Final action",
"key_insight": "Three key actions identified"
}`
        }
      };

      const result = cleanupOutputToJson2(input);

      // After newline removal, content becomes space-separated
      expect(result.json.email_body).toContain('Point 1');
      expect(result.json.email_body).toContain('Point 3');
    });
  });

  describe('Lookbehind Regex Behavior', () => {
    it('should not double-escape already escaped quotes', () => {
      const input = {
        json: {
          output: '{"email_subject": "Test", "email_body": "Mix of \\"escaped\\" and "unescaped" quotes", "key_insight": "Mixed"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      // Both escaped and unescaped should result in proper quotes
      expect(result.json.email_body).toContain('escaped');
      expect(result.json.email_body).toContain('unescaped');
    });

    it('should handle backslash before non-quote character', () => {
      const input = {
        json: {
          output: '{"email_subject": "Test", "email_body": "Path: C:\\\\Users\\\\test and "quote"", "key_insight": "Paths"}'
        }
      };

      const result = cleanupOutputToJson2(input);

      expect(result.json.email_body).toContain('C:\\Users\\test');
    });
  });
});
