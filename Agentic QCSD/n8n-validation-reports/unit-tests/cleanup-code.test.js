/**
 * Unit Tests for "Cleanup Code" Code Node
 *
 * Purpose: Identify and separate Meta and Spotify reports from merged input,
 * then format them as director context with insights and full details.
 */

const { describe, it, expect } = require('@jest/globals');

// Function Under Test (extracted from n8n Code node)
function cleanupCode(inputItems) {
  const items = inputItems.map(item => item.json || item);

  // Initialize containers
  let metaReport = {};
  let spotifyReport = {};

  // LOGIC: Identify which report is which based on unique keys
  for (const item of items) {
    const content = JSON.stringify(item);

    if (content.includes("Spotify") || content.includes("Streams") || content.includes("Tracks")) {
      spotifyReport = item;
    } else {
      metaReport = item;
    }
  }

  // Format the Text for the Director
  let contextText = "### DIRECT INPUT: META ADS REPORT\n";
  contextText += `INSIGHT: ${metaReport.key_insight || "No Insight Generated"}\n`;
  contextText += `FULL DETAILS:\n${metaReport.email_body || metaReport.analysis_text || "No Data"}\n\n`;

  contextText += "### DIRECT INPUT: SPOTIFY REPORT\n";
  contextText += `INSIGHT: ${spotifyReport.key_insight || "No Insight Generated"}\n`;
  contextText += `FULL DETAILS:\n${spotifyReport.email_body || spotifyReport.analysis_text || "No Data"}\n`;

  return {
    json: {
      director_context: contextText,
      meta_insight: metaReport.key_insight,
      spotify_insight: spotifyReport.key_insight
    }
  };
}

describe('Cleanup Code', () => {
  describe('Report Identification', () => {
    it('should identify Spotify report by "Spotify" keyword', () => {
      const input = [
        { json: { key_insight: 'Meta performance up', email_body: 'Ad metrics...' } },
        { json: { key_insight: 'Spotify streams increased', email_body: 'Stream data...' } }
      ];

      const result = cleanupCode(input);

      expect(result.json.spotify_insight).toContain('Spotify');
      expect(result.json.meta_insight).toContain('Meta');
    });

    it('should identify Spotify report by "Streams" keyword', () => {
      const input = [
        { json: { key_insight: 'CTR improved', email_body: 'Click data' } },
        { json: { key_insight: 'Streams up 20%', email_body: 'Audio metrics' } }
      ];

      const result = cleanupCode(input);

      expect(result.json.spotify_insight).toContain('Streams');
    });

    it('should identify Spotify report by "Tracks" keyword', () => {
      const input = [
        { json: { key_insight: 'Ad engagement high', email_body: 'Engagement data' } },
        { json: { key_insight: 'Top Tracks performing well', email_body: 'Track list' } }
      ];

      const result = cleanupCode(input);

      expect(result.json.spotify_insight).toContain('Tracks');
    });

    it('should default to Meta when no Spotify keywords found', () => {
      const input = [
        { json: { key_insight: 'Insight 1', email_body: 'Data 1' } },
        { json: { key_insight: 'Insight 2', email_body: 'Data 2' } }
      ];

      const result = cleanupCode(input);

      // Both get classified as Meta (last one wins), Spotify stays empty
      expect(result.json.director_context).toContain('META ADS REPORT');
    });
  });

  describe('Context Formatting', () => {
    it('should format director context with proper sections', () => {
      const input = [
        { json: { key_insight: 'Meta insight', email_body: 'Meta body' } },
        { json: { key_insight: 'Spotify insight', email_body: 'Spotify body' } }
      ];

      const result = cleanupCode(input);

      expect(result.json.director_context).toContain('### DIRECT INPUT: META ADS REPORT');
      expect(result.json.director_context).toContain('### DIRECT INPUT: SPOTIFY REPORT');
      expect(result.json.director_context).toContain('INSIGHT:');
      expect(result.json.director_context).toContain('FULL DETAILS:');
    });

    it('should include insight text in output', () => {
      const input = [
        { json: { key_insight: 'CTR improved by 25%', email_body: 'Details...' } },
        { json: { key_insight: 'Streams doubled', email_body: 'Spotify data...' } }
      ];

      const result = cleanupCode(input);

      expect(result.json.director_context).toContain('CTR improved by 25%');
      expect(result.json.director_context).toContain('Streams doubled');
    });

    it('should include email_body as full details', () => {
      const input = [
        { json: { key_insight: 'Insight', email_body: '<p>Full HTML content here</p>' } }
      ];

      const result = cleanupCode(input);

      expect(result.json.director_context).toContain('<p>Full HTML content here</p>');
    });
  });

  describe('Fallback Values', () => {
    it('should use "No Insight Generated" when key_insight missing', () => {
      const input = [
        { json: { email_body: 'Body without insight' } }
      ];

      const result = cleanupCode(input);

      expect(result.json.director_context).toContain('No Insight Generated');
    });

    it('should use analysis_text when email_body missing', () => {
      const input = [
        { json: { key_insight: 'Insight', analysis_text: 'Alternative body content' } }
      ];

      const result = cleanupCode(input);

      expect(result.json.director_context).toContain('Alternative body content');
    });

    it('should use "No Data" when both email_body and analysis_text missing', () => {
      const input = [
        { json: { key_insight: 'Just insight' } }
      ];

      const result = cleanupCode(input);

      expect(result.json.director_context).toContain('No Data');
    });

    it('should handle completely empty items', () => {
      const input = [
        { json: {} }
      ];

      const result = cleanupCode(input);

      expect(result.json.director_context).toContain('No Insight Generated');
      expect(result.json.director_context).toContain('No Data');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single input item', () => {
      const input = [
        { json: { key_insight: 'Single insight', email_body: 'Single body' } }
      ];

      const result = cleanupCode(input);

      expect(result.json.meta_insight).toBe('Single insight');
      expect(result.json.spotify_insight).toBeUndefined();
    });

    it('should handle more than two items', () => {
      const input = [
        { json: { key_insight: 'Meta 1', email_body: 'Body 1' } },
        { json: { key_insight: 'Spotify tracks', email_body: 'Body 2' } },
        { json: { key_insight: 'Meta 2', email_body: 'Body 3' } }
      ];

      const result = cleanupCode(input);

      // Last non-Spotify item should be used as Meta
      expect(result.json.meta_insight).toBe('Meta 2');
      expect(result.json.spotify_insight).toContain('Spotify');
    });

    it('should handle items without json wrapper', () => {
      const input = [
        { key_insight: 'Direct insight', email_body: 'Direct body' }
      ];

      const result = cleanupCode(input);

      expect(result.json.meta_insight).toBe('Direct insight');
    });

    it('should handle mixed json/non-json items', () => {
      const input = [
        { json: { key_insight: 'Wrapped', email_body: 'W body' } },
        { key_insight: 'Spotify direct', email_body: 'D body' }
      ];

      const result = cleanupCode(input);

      expect(result.json.spotify_insight).toContain('Spotify');
    });

    it('should handle empty array input', () => {
      const input = [];

      const result = cleanupCode(input);

      expect(result.json.director_context).toContain('No Insight Generated');
      expect(result.json.director_context).toContain('No Data');
    });
  });

  describe('Output Structure', () => {
    it('should return all expected fields', () => {
      const input = [
        { json: { key_insight: 'Meta', email_body: 'M body' } },
        { json: { key_insight: 'Spotify', email_body: 'S body' } }
      ];

      const result = cleanupCode(input);

      expect(result.json).toHaveProperty('director_context');
      expect(result.json).toHaveProperty('meta_insight');
      expect(result.json).toHaveProperty('spotify_insight');
    });

    it('should separate insights into individual fields', () => {
      const input = [
        { json: { key_insight: 'Meta specific insight', email_body: 'Meta data' } },
        { json: { key_insight: 'Spotify specific insight', email_body: 'Spotify data' } }
      ];

      const result = cleanupCode(input);

      expect(result.json.meta_insight).toBe('Meta specific insight');
      expect(result.json.spotify_insight).toBe('Spotify specific insight');
    });
  });

  describe('Keyword Detection Case Sensitivity', () => {
    it('should NOT detect "spotify" lowercase (case-sensitive matching)', () => {
      const input = [
        { json: { key_insight: 'Meta first', email_body: 'Body' } },
        { json: { key_insight: 'spotify streams', email_body: 'Audio' } }
      ];

      const result = cleanupCode(input);

      // BUG: The original code uses includes("Spotify") which is case-sensitive
      // lowercase "spotify" will NOT match - both items go to Meta, last wins
      expect(result.json.meta_insight).toBe('spotify streams');
      expect(result.json.spotify_insight).toBeUndefined();
    });

    it('should NOT detect "SPOTIFY" uppercase (case-sensitive matching)', () => {
      const input = [
        { json: { key_insight: 'Meta first', email_body: 'Body' } },
        { json: { key_insight: 'SPOTIFY REPORT', email_body: 'Audio' } }
      ];

      const result = cleanupCode(input);

      // BUG: The original code uses includes("Spotify") which is case-sensitive
      // uppercase "SPOTIFY" will NOT match - both items go to Meta, last wins
      expect(result.json.meta_insight).toBe('SPOTIFY REPORT');
      expect(result.json.spotify_insight).toBeUndefined();
    });

    it('should detect "Spotify" with exact casing', () => {
      const input = [
        { json: { key_insight: 'Meta', email_body: 'Body' } },
        { json: { key_insight: 'Spotify streams up', email_body: 'Audio' } }
      ];

      const result = cleanupCode(input);

      // Exact casing matches
      expect(result.json.spotify_insight).toBe('Spotify streams up');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle typical analyst outputs', () => {
      const input = [
        {
          json: {
            key_insight: "Meta Ads CTR improved by 15% this week",
            email_body: "<h2>Meta Ads Weekly Report</h2><p>Total Spend: $1,500</p><p>Impressions: 250,000</p>"
          }
        },
        {
          json: {
            key_insight: "Spotify Streams up 20%, new track trending",
            email_body: "<h2>Spotify Performance</h2><p>Total Streams: 125,000</p><p>New Followers: 500</p>"
          }
        }
      ];

      const result = cleanupCode(input);

      expect(result.json.director_context).toContain('Meta Ads CTR improved');
      expect(result.json.director_context).toContain('Spotify Streams up');
      expect(result.json.director_context).toContain('Total Spend');
      expect(result.json.director_context).toContain('Total Streams');
    });

    it('should handle reports with special characters', () => {
      const input = [
        { json: { key_insight: 'ROI: $500 -> $750 (50% increase)', email_body: 'Details with $ & % symbols' } },
        { json: { key_insight: 'Spotify: Track "Summer" hit #1', email_body: 'Track rankings' } }
      ];

      const result = cleanupCode(input);

      expect(result.json.director_context).toContain('$500');
      expect(result.json.director_context).toContain('50%');
      expect(result.json.director_context).toContain('"Summer"');
    });
  });
});
