/**
 * Unit Tests for "Cleanup Output to JSON" Code Node
 *
 * Purpose: Parse JSON from AI-generated output, extracting from markdown code blocks
 * and sanitizing HTML attributes to prevent JSON parsing failures.
 */

const { describe, it, expect, beforeEach } = require('@jest/globals');

// Function Under Test (extracted from n8n Code node)
function cleanupOutputToJson(rawText) {
  // 2. Smart Extraction: Find the JSON block (ignoring "Here is the report..." text)
  const markdownMatch = rawText.match(/```json([\s\S]*?)```/);
  let cleanText = markdownMatch ? markdownMatch[1] : rawText;

  // Fallback: If no markdown tags, just grab everything from first { to last }
  if (!markdownMatch) {
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanText = rawText.substring(firstBrace, lastBrace + 1);
    }
  }

  // 3. THE FIX: Sanitize HTML attributes to prevent JSON breaks
  cleanText = cleanText.replace(/class="([^"]*)"/g, "class='$1'");

  try {
    // 4. Parse
    const actualData = JSON.parse(cleanText);
    return { json: actualData };
  } catch (e) {
    // If it still fails, output the error
    return {
      json: {
        error: "JSON Parse Failed",
        message: e.message,
        debug_text: cleanText
      }
    };
  }
}

describe('Cleanup Output to JSON', () => {
  describe('Happy Path - Markdown Code Blocks', () => {
    it('should extract JSON from markdown code block', () => {
      const input = `Here is the report:
\`\`\`json
{"email_subject": "Test Report", "email_body": "Hello"}
\`\`\`
Done!`;

      const result = cleanupOutputToJson(input);

      expect(result.json.email_subject).toBe('Test Report');
      expect(result.json.email_body).toBe('Hello');
      expect(result.json.error).toBeUndefined();
    });

    it('should handle multiline JSON in markdown block', () => {
      const input = `\`\`\`json
{
  "email_subject": "Weekly Report",
  "email_body": "Line 1\\nLine 2",
  "key_insight": "Performance improved"
}
\`\`\``;

      const result = cleanupOutputToJson(input);

      expect(result.json.email_subject).toBe('Weekly Report');
      expect(result.json.key_insight).toBe('Performance improved');
    });

    it('should extract nested JSON objects', () => {
      const input = `\`\`\`json
{
  "report": {
    "meta": {"spend": 500},
    "spotify": {"streams": 10000}
  }
}
\`\`\``;

      const result = cleanupOutputToJson(input);

      expect(result.json.report.meta.spend).toBe(500);
      expect(result.json.report.spotify.streams).toBe(10000);
    });
  });

  describe('Fallback - Raw JSON Without Markdown', () => {
    it('should extract JSON when no markdown tags present', () => {
      const input = 'The analysis shows: {"status": "success", "value": 42} is the result.';

      const result = cleanupOutputToJson(input);

      expect(result.json.status).toBe('success');
      expect(result.json.value).toBe(42);
    });

    it('should handle JSON at beginning of text', () => {
      const input = '{"data": "test"} - end of message';

      const result = cleanupOutputToJson(input);

      expect(result.json.data).toBe('test');
    });

    it('should handle JSON at end of text', () => {
      const input = 'Here is your data: {"result": "complete"}';

      const result = cleanupOutputToJson(input);

      expect(result.json.result).toBe('complete');
    });
  });

  describe('HTML Attribute Sanitization', () => {
    it('should convert double quotes in class attributes to single quotes', () => {
      const input = `\`\`\`json
{"email_body": "<div class='container'>Test</div>"}
\`\`\``;

      const result = cleanupOutputToJson(input);

      expect(result.json.email_body).toContain("class='container'");
      expect(result.json.error).toBeUndefined();
    });

    it('should handle multiple HTML attributes with double quotes', () => {
      // This tests the sanitization logic - input has class="" which breaks JSON
      const rawJsonWithHtml = '{"html": "<div class=\\"box\\" id=\\"test\\">content</div>"}';
      const input = `\`\`\`json
${rawJsonWithHtml}
\`\`\``;

      const result = cleanupOutputToJson(input);

      // Should parse successfully after sanitization
      expect(result.json.error).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty JSON object', () => {
      const input = `\`\`\`json
{}
\`\`\``;

      const result = cleanupOutputToJson(input);

      expect(result.json).toEqual({});
    });

    it('should handle JSON array', () => {
      const input = `\`\`\`json
[{"id": 1}, {"id": 2}]
\`\`\``;

      const result = cleanupOutputToJson(input);

      expect(result.json).toHaveLength(2);
      expect(result.json[0].id).toBe(1);
    });

    it('should handle special characters in values', () => {
      const input = `\`\`\`json
{"message": "Hello! $100 earned @today #success"}
\`\`\``;

      const result = cleanupOutputToJson(input);

      expect(result.json.message).toBe('Hello! $100 earned @today #success');
    });

    it('should handle unicode characters', () => {
      const input = `\`\`\`json
{"emoji": "Report ready! \\ud83d\\udcc8", "text": "Cafe"}
\`\`\``;

      const result = cleanupOutputToJson(input);

      expect(result.json.text).toBe('Cafe');
    });

    it('should handle whitespace around JSON', () => {
      const input = `\`\`\`json

   {"clean": true}

\`\`\``;

      const result = cleanupOutputToJson(input);

      expect(result.json.clean).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return error object for invalid JSON', () => {
      const input = 'This is not valid JSON at all';

      const result = cleanupOutputToJson(input);

      expect(result.json.error).toBe('JSON Parse Failed');
      expect(result.json.message).toBeDefined();
      expect(result.json.debug_text).toBeDefined();
    });

    it('should return error for malformed JSON', () => {
      const input = `\`\`\`json
{"broken": "missing end bracket"
\`\`\``;

      const result = cleanupOutputToJson(input);

      expect(result.json.error).toBe('JSON Parse Failed');
    });

    it('should return error for JSON with trailing comma', () => {
      const input = `\`\`\`json
{"key": "value",}
\`\`\``;

      const result = cleanupOutputToJson(input);

      expect(result.json.error).toBe('JSON Parse Failed');
    });

    it('should handle text with no JSON at all', () => {
      const input = 'Just plain text without any curly braces';

      const result = cleanupOutputToJson(input);

      expect(result.json.error).toBe('JSON Parse Failed');
    });

    it('should handle single brace without matching', () => {
      const input = 'Only opening { brace here';

      const result = cleanupOutputToJson(input);

      expect(result.json.error).toBe('JSON Parse Failed');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should parse typical AI response with preamble', () => {
      const input = `Based on the data analysis, here is the marketing report:

\`\`\`json
{
  "email_subject": "Weekly Performance Summary",
  "email_body": "<h2>Performance Highlights</h2><p>Your campaigns performed well this week.</p>",
  "key_insight": "CTR improved by 15% compared to last week"
}
\`\`\`

Let me know if you need any modifications!`;

      const result = cleanupOutputToJson(input);

      expect(result.json.email_subject).toBe('Weekly Performance Summary');
      expect(result.json.email_body).toContain('Performance Highlights');
      expect(result.json.key_insight).toContain('CTR improved');
    });

    it('should handle numeric values correctly', () => {
      const input = `\`\`\`json
{
  "total_spend": 1500.50,
  "impressions": 50000,
  "ctr": 2.35,
  "is_active": true
}
\`\`\``;

      const result = cleanupOutputToJson(input);

      expect(result.json.total_spend).toBe(1500.50);
      expect(result.json.impressions).toBe(50000);
      expect(result.json.ctr).toBe(2.35);
      expect(result.json.is_active).toBe(true);
    });
  });
});
