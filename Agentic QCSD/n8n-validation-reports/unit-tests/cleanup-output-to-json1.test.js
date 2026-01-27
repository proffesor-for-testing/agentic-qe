/**
 * Unit Tests for "Cleanup Output to JSON1" Code Node
 *
 * Purpose: Simple cleanup of AI response by removing markdown wrappers
 * and parsing the resulting JSON. This is the basic version without
 * HTML sanitization or fallback extraction.
 */

const { describe, it, expect } = require('@jest/globals');

// Function Under Test (extracted from n8n Code node)
function cleanupOutputToJson1(rawText) {
  // 2. Clean up the Markdown wrappers (```json and ```)
  const cleanText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

  // 3. Convert text into a real JSON object
  try {
    const actualData = JSON.parse(cleanText);
    return { json: actualData };
  } catch (e) {
    return {
      json: {
        error: "JSON Parse Failed",
        message: e.message,
        raw_text: cleanText
      }
    };
  }
}

describe('Cleanup Output to JSON1', () => {
  describe('Happy Path - Markdown Removal', () => {
    it('should remove ```json wrapper and parse', () => {
      const input = `\`\`\`json
{"status": "success", "count": 42}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.status).toBe('success');
      expect(result.json.count).toBe(42);
    });

    it('should handle JSON without markdown wrappers', () => {
      const input = '{"simple": "json", "value": 123}';

      const result = cleanupOutputToJson1(input);

      expect(result.json.simple).toBe('json');
      expect(result.json.value).toBe(123);
    });

    it('should trim whitespace', () => {
      const input = `

\`\`\`json
{"trimmed": true}
\`\`\`

`;

      const result = cleanupOutputToJson1(input);

      expect(result.json.trimmed).toBe(true);
    });

    it('should handle multiline JSON', () => {
      const input = `\`\`\`json
{
  "email_subject": "Report",
  "email_body": "Content here",
  "key_insight": "Important finding"
}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.email_subject).toBe('Report');
      expect(result.json.email_body).toBe('Content here');
      expect(result.json.key_insight).toBe('Important finding');
    });
  });

  describe('Multiple Markdown Blocks', () => {
    it('should handle multiple ```json tags (removes all)', () => {
      // Edge case: malformed input with extra tags
      const input = `\`\`\`json
\`\`\`json
{"nested": "tags"}
\`\`\`
\`\`\``;

      const result = cleanupOutputToJson1(input);

      // After removing all ```json and ```, should get just the JSON
      expect(result.json.nested).toBe('tags');
    });

    it('should handle code blocks with just ``` (no json)', () => {
      const input = `\`\`\`
{"data": "without json specifier"}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.data).toBe('without json specifier');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty JSON object', () => {
      const input = `\`\`\`json
{}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json).toEqual({});
    });

    it('should handle JSON array', () => {
      const input = `\`\`\`json
[1, 2, 3]
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json).toEqual([1, 2, 3]);
    });

    it('should handle boolean and null values', () => {
      const input = `\`\`\`json
{"active": true, "archived": false, "deleted": null}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.active).toBe(true);
      expect(result.json.archived).toBe(false);
      expect(result.json.deleted).toBe(null);
    });

    it('should handle nested objects', () => {
      const input = `\`\`\`json
{"level1": {"level2": {"level3": "deep value"}}}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.level1.level2.level3).toBe('deep value');
    });

    it('should handle arrays of objects', () => {
      const input = `\`\`\`json
{"items": [{"id": 1}, {"id": 2}, {"id": 3}]}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.items).toHaveLength(3);
      expect(result.json.items[0].id).toBe(1);
    });

    it('should handle escaped quotes in strings', () => {
      const input = `\`\`\`json
{"message": "He said \\"hello\\""}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.message).toBe('He said "hello"');
    });

    it('should handle unicode characters', () => {
      const input = `\`\`\`json
{"emoji": "\\u2705", "text": "Success!"}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.emoji).toBe('\u2705');
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid JSON', () => {
      const input = `\`\`\`json
{invalid json here}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.error).toBe('JSON Parse Failed');
      expect(result.json.message).toBeDefined();
    });

    it('should return error for unclosed string', () => {
      const input = `\`\`\`json
{"broken": "unclosed string
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.error).toBe('JSON Parse Failed');
    });

    it('should return error for trailing comma', () => {
      const input = `\`\`\`json
{"key": "value",}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.error).toBe('JSON Parse Failed');
    });

    it('should return error for plain text', () => {
      const input = 'Just some plain text without JSON';

      const result = cleanupOutputToJson1(input);

      expect(result.json.error).toBe('JSON Parse Failed');
    });

    it('should include raw text in error for debugging', () => {
      const input = `\`\`\`json
{bad: json}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.raw_text).toBeDefined();
      expect(result.json.raw_text).toContain('bad');
    });
  });

  describe('Comparison with cleanupOutputToJson (original)', () => {
    it('should NOT handle text before JSON (unlike original)', () => {
      // This is a key difference - JSON1 is simpler and expects clean input
      const input = `Here is the report:
\`\`\`json
{"data": "value"}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      // Will fail because "Here is the report:" remains after removing markdown
      expect(result.json.error).toBe('JSON Parse Failed');
    });

    it('should NOT handle JSON without markdown (unlike fallback in original)', () => {
      // This tests the "{ to }" fallback that doesn't exist in JSON1
      const input = 'Some text {"key": "value"} more text';

      const result = cleanupOutputToJson1(input);

      // Will fail because the surrounding text isn't removed
      expect(result.json.error).toBe('JSON Parse Failed');
    });

    it('should NOT sanitize HTML attributes (unlike original)', () => {
      // JSON1 doesn't have HTML sanitization
      const input = `\`\`\`json
{"html": "<div class="broken">test</div>"}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      // Will fail due to unescaped quotes in HTML
      expect(result.json.error).toBe('JSON Parse Failed');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should parse typical Spotify analyst output', () => {
      const input = `\`\`\`json
{
  "email_subject": "Spotify Weekly Performance Report",
  "email_body": "Your streams increased by 15% this week.",
  "key_insight": "Top track: Summer Vibes with 50,000 streams"
}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.email_subject).toContain('Spotify');
      expect(result.json.key_insight).toContain('Summer Vibes');
    });

    it('should handle numeric metrics', () => {
      const input = `\`\`\`json
{
  "total_streams": 125000,
  "growth_rate": 15.5,
  "playlist_adds": 42,
  "is_trending": true
}
\`\`\``;

      const result = cleanupOutputToJson1(input);

      expect(result.json.total_streams).toBe(125000);
      expect(result.json.growth_rate).toBe(15.5);
      expect(result.json.is_trending).toBe(true);
    });
  });
});
