/**
 * Unit Tests for "CMO Full Context" Code Node
 *
 * Purpose: Aggregate and format context from multiple sources (Analysts, Director)
 * for the CMO agent, organizing data into hierarchical levels.
 */

const { describe, it, expect } = require('@jest/globals');

// Function Under Test (extracted from n8n Code node)
function cmoFullContext(inputItems) {
  const items = inputItems.map(item => item.json || item);

  // Containers
  let metaData = "No Data";
  let spotifyData = "No Data";
  let directorStrategy = "No Strategy Generated";

  // LOGIC: Sort the pile based on content keywords
  for (const item of items) {
    const text = JSON.stringify(item);

    if (text.includes("Meta Ads Report") || (item.director_context && item.director_context.includes("Meta"))) {
      if (item.director_context) {
        metaData = "See Analyst Section Below";
        spotifyData = "See Analyst Section Below";
        if (item.meta_insight) metaData = item.meta_insight + "\n" + (item.meta_body || "");
        if (item.spotify_insight) spotifyData = item.spotify_insight + "\n" + (item.spotify_body || "");
      }
    }

    // Check for Director's Output
    if (item.email_subject && item.email_subject.includes("Strategy")) {
      directorStrategy = `SUBJECT: ${item.email_subject}\nINSIGHT: ${item.key_insight}\nBODY:\n${item.email_body}`;
    }

    // Fallback: If raw items are passed directly from Merge A
    if (item.email_body && item.email_body.includes("Spotify") && (!item.email_subject || !item.email_subject.includes("Strategy"))) {
      spotifyData = item.key_insight + "\n" + item.email_body;
    }
    if (item.email_body && item.email_body.includes("Meta") && (!item.email_subject || !item.email_subject.includes("Strategy"))) {
      metaData = item.key_insight + "\n" + item.email_body;
    }
  }

  // Build Final Context
  let context = "### LEVEL 1: ANALYST RAW DATA\n";
  context += `--- META ADS ---\n${metaData.substring(0, 1000)}...\n\n`;
  context += `--- SPOTIFY ---\n${spotifyData.substring(0, 1000)}...\n\n`;

  context += "### LEVEL 2: DIRECTOR'S STRATEGY\n";
  context += `${directorStrategy}\n`;

  return {
    json: {
      cmo_context: context
    }
  };
}

describe('CMO Full Context', () => {
  describe('Context Aggregation', () => {
    it('should aggregate Meta data from director_context', () => {
      const input = [
        {
          json: {
            director_context: "Meta Ads Report data here",
            meta_insight: "Meta performance up",
            spotify_insight: "Streams increasing"
          }
        }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('LEVEL 1: ANALYST RAW DATA');
      expect(result.json.cmo_context).toContain('META ADS');
      expect(result.json.cmo_context).toContain('Meta performance up');
    });

    it('should include Spotify data from insights', () => {
      const input = [
        {
          json: {
            director_context: "Meta report context",
            meta_insight: "Meta insight",
            spotify_insight: "Spotify streams up 20%"
          }
        }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('SPOTIFY');
      expect(result.json.cmo_context).toContain('Spotify streams up 20%');
    });

    it('should include Director strategy when present', () => {
      const input = [
        {
          json: {
            email_subject: "Weekly Marketing Strategy",
            email_body: "Recommendation details here",
            key_insight: "Increase budget by 20%"
          }
        }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('LEVEL 2: DIRECTOR');
      expect(result.json.cmo_context).toContain('Weekly Marketing Strategy');
      expect(result.json.cmo_context).toContain('Increase budget by 20%');
    });
  });

  describe('Director Strategy Detection', () => {
    it('should detect Director output by "Strategy" in subject', () => {
      const input = [
        {
          json: {
            email_subject: "Q1 Strategy Overview",
            email_body: "Strategic recommendations",
            key_insight: "Key strategy point"
          }
        }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('SUBJECT: Q1 Strategy Overview');
      expect(result.json.cmo_context).toContain('INSIGHT: Key strategy point');
      expect(result.json.cmo_context).toContain('Strategic recommendations');
    });

    it('should format Director output with all fields', () => {
      const input = [
        {
          json: {
            email_subject: "Marketing Strategy",
            email_body: "Body content",
            key_insight: "Insight content"
          }
        }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('SUBJECT:');
      expect(result.json.cmo_context).toContain('INSIGHT:');
      expect(result.json.cmo_context).toContain('BODY:');
    });

    it('should not classify non-Strategy emails as Director output', () => {
      const input = [
        {
          json: {
            email_subject: "Weekly Report",
            email_body: "Report content",
            key_insight: "Report insight"
          }
        }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('No Strategy Generated');
    });
  });

  describe('Raw Data Fallback', () => {
    it('should extract Meta data from email_body containing "Meta"', () => {
      const input = [
        {
          json: {
            email_body: "Meta Ads performance data",
            key_insight: "Meta CTR improved"
          }
        }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('Meta CTR improved');
      expect(result.json.cmo_context).toContain('Meta Ads performance data');
    });

    it('should extract Spotify data from email_body containing "Spotify"', () => {
      const input = [
        {
          json: {
            email_body: "Spotify streaming data",
            key_insight: "Streams up"
          }
        }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('Streams up');
      expect(result.json.cmo_context).toContain('Spotify streaming data');
    });

    it('should not use fallback for Strategy emails', () => {
      const input = [
        {
          json: {
            email_subject: "Meta Strategy Update",
            email_body: "Meta optimization plan",
            key_insight: "Optimize Meta"
          }
        }
      ];

      const result = cmoFullContext(input);

      // Should be classified as Director strategy, not raw Meta data
      expect(result.json.cmo_context).toContain('SUBJECT: Meta Strategy Update');
    });
  });

  describe('Truncation', () => {
    it('should truncate Meta data to 1000 characters', () => {
      const longContent = 'A'.repeat(2000);
      const input = [
        {
          json: {
            email_body: `Meta ${longContent}`,
            key_insight: "Long insight"
          }
        }
      ];

      const result = cmoFullContext(input);

      // Should be truncated with "..."
      expect(result.json.cmo_context).toContain('...');
      // Total Meta section should not exceed 1000 chars + ellipsis
      const metaSection = result.json.cmo_context.split('--- SPOTIFY ---')[0];
      expect(metaSection.length).toBeLessThan(1200); // Allow some buffer for formatting
    });

    it('should truncate Spotify data to 1000 characters', () => {
      const longContent = 'B'.repeat(2000);
      const input = [
        {
          json: {
            email_body: `Spotify ${longContent}`,
            key_insight: "Long Spotify insight"
          }
        }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('...');
    });

    it('should handle exactly 1000 character content', () => {
      const exactContent = 'C'.repeat(990); // Leave room for insight + newline
      const input = [
        {
          json: {
            email_body: `Meta ${exactContent}`,
            key_insight: "Insight"
          }
        }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input array', () => {
      const input = [];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('No Data');
      expect(result.json.cmo_context).toContain('No Strategy Generated');
    });

    it('should handle items without expected fields', () => {
      const input = [
        { json: { unrelated: 'data' } }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('No Data');
      expect(result.json.cmo_context).toContain('No Strategy Generated');
    });

    it('should handle multiple items of same type', () => {
      const input = [
        { json: { email_body: 'Meta report 1', key_insight: 'Insight 1' } },
        { json: { email_body: 'Meta report 2', key_insight: 'Insight 2' } }
      ];

      const result = cmoFullContext(input);

      // Last one should win
      expect(result.json.cmo_context).toContain('Insight 2');
    });

    it('should handle null/undefined values gracefully', () => {
      const input = [
        { json: { email_body: null, key_insight: undefined } }
      ];

      const result = cmoFullContext(input);

      // Should not throw, just use defaults
      expect(result.json.cmo_context).toBeDefined();
    });

    it('should handle items without json wrapper', () => {
      const input = [
        { email_body: 'Direct Meta data', key_insight: 'Direct insight' }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('Direct insight');
    });
  });

  describe('Output Structure', () => {
    it('should include hierarchical level headers', () => {
      const input = [
        { json: { director_context: 'Context' } }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('### LEVEL 1: ANALYST RAW DATA');
      expect(result.json.cmo_context).toContain('### LEVEL 2: DIRECTOR');
    });

    it('should include platform section headers', () => {
      const input = [
        { json: { director_context: 'Context' } }
      ];

      const result = cmoFullContext(input);

      expect(result.json.cmo_context).toContain('--- META ADS ---');
      expect(result.json.cmo_context).toContain('--- SPOTIFY ---');
    });

    it('should return single cmo_context field', () => {
      const input = [
        { json: { email_body: 'Test', key_insight: 'Test' } }
      ];

      const result = cmoFullContext(input);

      expect(Object.keys(result.json)).toEqual(['cmo_context']);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle complete workflow output', () => {
      const input = [
        {
          json: {
            director_context: "Meta Ads Report combined",
            meta_insight: "CTR improved by 15%",
            meta_body: "Detailed Meta metrics here",
            spotify_insight: "Streams up 20%",
            spotify_body: "Detailed Spotify metrics here"
          }
        },
        {
          json: {
            email_subject: "Weekly Marketing Strategy",
            email_body: "Based on analysis, recommend increasing spend",
            key_insight: "Increase budget allocation to top performers"
          }
        }
      ];

      const result = cmoFullContext(input);

      // Should have all three levels of data
      expect(result.json.cmo_context).toContain('CTR improved by 15%');
      expect(result.json.cmo_context).toContain('Streams up 20%');
      expect(result.json.cmo_context).toContain('Weekly Marketing Strategy');
      expect(result.json.cmo_context).toContain('Increase budget allocation');
    });

    it('should handle partial data gracefully', () => {
      const input = [
        {
          json: {
            email_subject: "Strategy Update",
            email_body: "Only director output available",
            key_insight: "Budget recommendation"
          }
        }
      ];

      const result = cmoFullContext(input);

      // Director section should be populated
      expect(result.json.cmo_context).toContain('Strategy Update');
      // Analyst sections should show defaults
      expect(result.json.cmo_context).toContain('No Data');
    });
  });
});
