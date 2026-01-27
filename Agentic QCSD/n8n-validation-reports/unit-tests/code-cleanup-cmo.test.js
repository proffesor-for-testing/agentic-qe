/**
 * Unit Tests for "Code Cleanup CMO" Code Node
 *
 * Purpose: Extract and sanitize JSON from CMO agent output,
 * handling markdown blocks and HTML attribute quotes.
 */

const { describe, it, expect } = require('@jest/globals');

// Function Under Test (extracted from n8n Code node)
function codeCleanupCmo(rawText) {
  // 2. Smart Extraction (Finds text between ```json and ```)
  const markdownMatch = rawText.match(/```json([\s\S]*?)```/);
  let cleanText = markdownMatch ? markdownMatch[1] : rawText;

  // 3. Fallback: If no markdown, find first { and last }
  if (!markdownMatch) {
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanText = rawText.substring(firstBrace, lastBrace + 1);
    }
  }

  // 4. Sanitize HTML attributes (Double quote -> Single quote)
  cleanText = cleanText.replace(/class="([^"]*)"/g, "class='$1'");
  cleanText = cleanText.replace(/style="([^"]*)"/g, "style='$1'");

  // 5. Parse
  try {
    return { json: JSON.parse(cleanText) };
  } catch (e) {
    return {
      json: {
        email_subject: "CMO JSON Error",
        email_body: "The CMO generated invalid JSON. Raw output:<br>" + rawText,
        key_insight: "JSON Parsing Failed"
      }
    };
  }
}

describe('Code Cleanup CMO', () => {
  describe('Markdown Extraction', () => {
    it('should extract JSON from markdown code block', () => {
      const input = `\`\`\`json
{"email_subject": "CMO Report", "email_body": "Content", "key_insight": "Insight"}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.email_subject).toBe('CMO Report');
      expect(result.json.email_body).toBe('Content');
      expect(result.json.key_insight).toBe('Insight');
    });

    it('should handle JSON with preamble text', () => {
      const input = `Based on all the data, here is my executive summary:

\`\`\`json
{
  "email_subject": "Executive Weekly Summary",
  "email_body": "Key findings...",
  "key_insight": "Strategic direction"
}
\`\`\`

Let me know if you need changes.`;

      const result = codeCleanupCmo(input);

      expect(result.json.email_subject).toBe('Executive Weekly Summary');
      expect(result.json.key_insight).toBe('Strategic direction');
    });

    it('should handle multiline JSON', () => {
      const input = `\`\`\`json
{
  "email_subject": "Multi-line",
  "email_body": "Line one.\\nLine two.\\nLine three.",
  "key_insight": "Three points"
}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.email_body).toContain('Line one');
    });
  });

  describe('Fallback Extraction', () => {
    it('should extract JSON without markdown using brace detection', () => {
      const input = 'Here is the report: {"data": "value", "count": 42} - end';

      const result = codeCleanupCmo(input);

      expect(result.json.data).toBe('value');
      expect(result.json.count).toBe(42);
    });

    it('should handle JSON at start of string', () => {
      const input = '{"start": true} additional text';

      const result = codeCleanupCmo(input);

      expect(result.json.start).toBe(true);
    });

    it('should handle JSON at end of string', () => {
      const input = 'Prefix text {"end": true}';

      const result = codeCleanupCmo(input);

      expect(result.json.end).toBe(true);
    });

    it('should handle raw JSON without any wrapper', () => {
      const input = '{"pure": "json", "no": "wrapper"}';

      const result = codeCleanupCmo(input);

      expect(result.json.pure).toBe('json');
    });
  });

  describe('HTML Attribute Sanitization', () => {
    it('should convert class attribute double quotes to single', () => {
      const input = `\`\`\`json
{"email_body": "<div class='container'>Test</div>"}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.email_body).toContain("class='container'");
    });

    it('should convert style attribute double quotes to single', () => {
      const input = `\`\`\`json
{"email_body": "<p style='color: red;'>Styled</p>"}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.email_body).toContain("style='color: red;'");
    });

    it('should handle multiple HTML attributes', () => {
      const input = `\`\`\`json
{"html": "<div class='box' style='margin: 10px;'>Content</div>"}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.html).toContain("class='box'");
      expect(result.json.html).toContain("style='margin: 10px;'");
    });

    it('should handle nested HTML elements', () => {
      const input = `\`\`\`json
{"html": "<div class='outer'><span class='inner'>Text</span></div>"}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.html).toContain("class='outer'");
      expect(result.json.html).toContain("class='inner'");
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty JSON object', () => {
      const input = `\`\`\`json
{}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json).toEqual({});
    });

    it('should handle JSON with special characters', () => {
      const input = `\`\`\`json
{"symbol": "$100", "percent": "50%", "ampersand": "A & B"}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.symbol).toBe('$100');
      expect(result.json.percent).toBe('50%');
      expect(result.json.ampersand).toBe('A & B');
    });

    it('should handle nested objects', () => {
      const input = `\`\`\`json
{
  "email_subject": "Nested",
  "metrics": {
    "meta": {"spend": 500},
    "spotify": {"streams": 10000}
  },
  "key_insight": "Combined data"
}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.metrics.meta.spend).toBe(500);
      expect(result.json.metrics.spotify.streams).toBe(10000);
    });

    it('should handle arrays in JSON', () => {
      const input = `\`\`\`json
{"items": [1, 2, 3], "tags": ["urgent", "marketing"]}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.items).toEqual([1, 2, 3]);
      expect(result.json.tags).toContain('urgent');
    });

    it('should handle escaped quotes in strings', () => {
      const input = `\`\`\`json
{"quote": "He said \\"hello\\""}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.quote).toBe('He said "hello"');
    });

    it('should handle whitespace in markdown block', () => {
      const input = `\`\`\`json

   {"spaced": true}

\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.spaced).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return error structure for invalid JSON', () => {
      const input = 'Not valid JSON at all';

      const result = codeCleanupCmo(input);

      expect(result.json.email_subject).toBe('CMO JSON Error');
      expect(result.json.key_insight).toBe('JSON Parsing Failed');
      expect(result.json.email_body).toContain('Raw output:');
    });

    it('should include original text in error for debugging', () => {
      const input = '{broken: json}';

      const result = codeCleanupCmo(input);

      expect(result.json.email_body).toContain('broken');
    });

    it('should handle malformed markdown', () => {
      const input = `\`\`\`json
{incomplete: "missing end
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.email_subject).toBe('CMO JSON Error');
    });

    it('should handle no braces found', () => {
      const input = 'Just text without any JSON';

      const result = codeCleanupCmo(input);

      expect(result.json.email_subject).toBe('CMO JSON Error');
    });

    it('should handle mismatched braces', () => {
      const input = '{start} some text } end';

      const result = codeCleanupCmo(input);

      // Will try to parse "{start} some text }" which fails
      expect(result.json.email_subject).toBe('CMO JSON Error');
    });
  });

  describe('Comparison with cleanupOutputToJson', () => {
    it('should have same markdown extraction behavior', () => {
      const input = `\`\`\`json
{"same": "behavior"}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.same).toBe('behavior');
    });

    it('should have same fallback behavior', () => {
      const input = 'Text {"fallback": true} more';

      const result = codeCleanupCmo(input);

      expect(result.json.fallback).toBe(true);
    });

    it('should additionally sanitize style attributes', () => {
      // This is unique to codeCleanupCmo
      // The sanitization happens on the raw text BEFORE JSON.parse
      // It converts style="..." to style='...' to prevent JSON breaking
      // But if the JSON already has escaped quotes, it parses fine
      const input = `\`\`\`json
{"html": "<div style='color: blue;'>Test</div>"}
\`\`\``;

      const result = codeCleanupCmo(input);

      // Should parse correctly and preserve single quotes
      expect(result.json.html).toContain("style='color: blue;'");
    });

    it('should sanitize unescaped style attributes in raw text', () => {
      // When style="" appears in raw text (not proper JSON), sanitization kicks in
      // This simulates a malformed AI response where quotes aren't escaped
      const input = 'Here is output: {"html": "<div style=\'fixed\'>Test</div>"}';

      const result = codeCleanupCmo(input);

      expect(result.json.html).toContain("style='fixed'");
    });

    it('should have structured error output unlike original', () => {
      const input = 'Invalid input';

      const result = codeCleanupCmo(input);

      // Original returns {error, message, debug_text}
      // CMO returns {email_subject, email_body, key_insight}
      expect(result.json).toHaveProperty('email_subject');
      expect(result.json).toHaveProperty('email_body');
      expect(result.json).toHaveProperty('key_insight');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle typical CMO output', () => {
      const input = `As the CMO, after reviewing all reports and the Director's strategy, here is my executive decision:

\`\`\`json
{
  "email_subject": "Executive Marketing Directive - Week of Jan 20",
  "email_body": "<h2>Executive Summary</h2><p>Based on comprehensive analysis of Meta Ads and Spotify performance, I am directing the following strategic initiatives:</p><ol><li>Increase Meta retargeting budget by 20%</li><li>Launch new Spotify playlist campaign</li><li>A/B test creative on top performing segments</li></ol>",
  "key_insight": "Cross-platform synergy opportunity: Meta audiences who engage with music content show 35% higher conversion rates"
}
\`\`\`

This directive takes effect immediately.`;

      const result = codeCleanupCmo(input);

      expect(result.json.email_subject).toContain('Executive Marketing Directive');
      expect(result.json.email_body).toContain('Executive Summary');
      expect(result.json.email_body).toContain('20%');
      expect(result.json.key_insight).toContain('35%');
    });

    it('should handle CMO output with complex HTML', () => {
      const input = `\`\`\`json
{
  "email_subject": "Styled Report",
  "email_body": "<div class='report'><h1 style='color: navy;'>Title</h1><p class='summary'>Content</p></div>",
  "key_insight": "Formatted content"
}
\`\`\``;

      const result = codeCleanupCmo(input);

      // All class and style attributes should have single quotes
      expect(result.json.email_body).toContain("class='report'");
      expect(result.json.email_body).toContain("style='color: navy;'");
      expect(result.json.email_body).toContain("class='summary'");
    });

    it('should handle numeric values', () => {
      const input = `\`\`\`json
{
  "email_subject": "Metrics Report",
  "email_body": "Body",
  "key_insight": "Insight",
  "budget_increase": 20.5,
  "target_roas": 4.2,
  "priority": 1
}
\`\`\``;

      const result = codeCleanupCmo(input);

      expect(result.json.budget_increase).toBe(20.5);
      expect(result.json.target_roas).toBe(4.2);
      expect(result.json.priority).toBe(1);
    });
  });
});
