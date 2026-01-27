/**
 * Unit Tests for "Format Output" Code Node
 *
 * Purpose: Convert ad data array into markdown table format
 * and calculate total spend across all ads.
 */

const { describe, it, expect } = require('@jest/globals');

// Function Under Test (extracted from n8n Code node)
function formatOutput(adsData) {
  // Create a header row
  let markdownTable = "| Ad Name | Spend | Impressions | CPM | CTR | Clicks |\n";
  markdownTable += "|---|---|---|---|---|---|\n";

  // Loop through rows and format them
  for (const ad of adsData) {
    markdownTable += `| ${ad.ad_name} | ${ad.spend} | ${ad.impressions} | ${ad.cpm} | ${ad.ctr} | ${ad.clicks} |\n`;
  }

  // Calculate Total Spend
  const totalSpend = adsData.reduce((acc, curr) => acc + parseFloat(curr.spend || 0), 0);

  return {
    json: {
      table_text: markdownTable,
      total_spend: totalSpend.toFixed(2)
    }
  };
}

describe('Format Output', () => {
  describe('Happy Path - Table Generation', () => {
    it('should generate markdown table with header', () => {
      const input = [
        { ad_name: 'Campaign A', spend: '100.00', impressions: '5000', cpm: '20.00', ctr: '2.5', clicks: '125' }
      ];

      const result = formatOutput(input);

      expect(result.json.table_text).toContain('| Ad Name | Spend | Impressions | CPM | CTR | Clicks |');
      expect(result.json.table_text).toContain('|---|---|---|---|---|---|');
    });

    it('should include ad data in table rows', () => {
      const input = [
        { ad_name: 'Campaign A', spend: '100.00', impressions: '5000', cpm: '20.00', ctr: '2.5', clicks: '125' }
      ];

      const result = formatOutput(input);

      expect(result.json.table_text).toContain('| Campaign A | 100.00 | 5000 | 20.00 | 2.5 | 125 |');
    });

    it('should format multiple ads correctly', () => {
      const input = [
        { ad_name: 'Ad 1', spend: '50.00', impressions: '2500', cpm: '20.00', ctr: '3.0', clicks: '75' },
        { ad_name: 'Ad 2', spend: '75.00', impressions: '3750', cpm: '20.00', ctr: '2.0', clicks: '75' },
        { ad_name: 'Ad 3', spend: '125.00', impressions: '5000', cpm: '25.00', ctr: '1.5', clicks: '75' }
      ];

      const result = formatOutput(input);

      expect(result.json.table_text).toContain('| Ad 1 |');
      expect(result.json.table_text).toContain('| Ad 2 |');
      expect(result.json.table_text).toContain('| Ad 3 |');
    });
  });

  describe('Total Spend Calculation', () => {
    it('should calculate total spend from single ad', () => {
      const input = [
        { ad_name: 'Campaign A', spend: '100.00', impressions: '5000', cpm: '20.00', ctr: '2.5', clicks: '125' }
      ];

      const result = formatOutput(input);

      expect(result.json.total_spend).toBe('100.00');
    });

    it('should calculate total spend from multiple ads', () => {
      const input = [
        { ad_name: 'Ad 1', spend: '50.00', impressions: '2500', cpm: '20.00', ctr: '3.0', clicks: '75' },
        { ad_name: 'Ad 2', spend: '75.00', impressions: '3750', cpm: '20.00', ctr: '2.0', clicks: '75' },
        { ad_name: 'Ad 3', spend: '125.00', impressions: '5000', cpm: '25.00', ctr: '1.5', clicks: '75' }
      ];

      const result = formatOutput(input);

      expect(result.json.total_spend).toBe('250.00');
    });

    it('should handle decimal precision correctly', () => {
      const input = [
        { ad_name: 'Ad 1', spend: '33.33', impressions: '1000', cpm: '33.33', ctr: '1.0', clicks: '10' },
        { ad_name: 'Ad 2', spend: '33.33', impressions: '1000', cpm: '33.33', ctr: '1.0', clicks: '10' },
        { ad_name: 'Ad 3', spend: '33.34', impressions: '1000', cpm: '33.34', ctr: '1.0', clicks: '10' }
      ];

      const result = formatOutput(input);

      expect(result.json.total_spend).toBe('100.00');
    });

    it('should handle string spend values with parseFloat', () => {
      const input = [
        { ad_name: 'Ad 1', spend: '  50.50  ', impressions: '1000', cpm: '10', ctr: '1', clicks: '10' }
      ];

      const result = formatOutput(input);

      expect(result.json.total_spend).toBe('50.50');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty ads array', () => {
      const input = [];

      const result = formatOutput(input);

      expect(result.json.table_text).toContain('| Ad Name | Spend |');
      expect(result.json.total_spend).toBe('0.00');
    });

    it('should handle missing spend (null/undefined)', () => {
      const input = [
        { ad_name: 'Ad 1', spend: null, impressions: '1000', cpm: '10', ctr: '1', clicks: '10' },
        { ad_name: 'Ad 2', spend: undefined, impressions: '1000', cpm: '10', ctr: '1', clicks: '10' },
        { ad_name: 'Ad 3', spend: '50.00', impressions: '1000', cpm: '10', ctr: '1', clicks: '10' }
      ];

      const result = formatOutput(input);

      expect(result.json.total_spend).toBe('50.00');
    });

    it('should handle spend value of zero', () => {
      const input = [
        { ad_name: 'Free Ad', spend: '0', impressions: '1000', cpm: '0', ctr: '1', clicks: '10' },
        { ad_name: 'Paid Ad', spend: '100.00', impressions: '5000', cpm: '20', ctr: '2', clicks: '100' }
      ];

      const result = formatOutput(input);

      expect(result.json.total_spend).toBe('100.00');
    });

    it('should handle ad names with special characters', () => {
      const input = [
        { ad_name: 'Summer Sale | 50% Off!', spend: '100.00', impressions: '5000', cpm: '20', ctr: '2', clicks: '100' }
      ];

      const result = formatOutput(input);

      expect(result.json.table_text).toContain('Summer Sale | 50% Off!');
    });

    it('should handle very large numbers', () => {
      const input = [
        { ad_name: 'Big Campaign', spend: '1000000.99', impressions: '50000000', cpm: '20.00', ctr: '0.5', clicks: '250000' }
      ];

      const result = formatOutput(input);

      expect(result.json.total_spend).toBe('1000000.99');
      expect(result.json.table_text).toContain('50000000');
    });

    it('should handle undefined fields in ad object', () => {
      const input = [
        { ad_name: 'Incomplete Ad', spend: '50.00' }
      ];

      const result = formatOutput(input);

      expect(result.json.table_text).toContain('| Incomplete Ad | 50.00 | undefined | undefined | undefined | undefined |');
      expect(result.json.total_spend).toBe('50.00');
    });
  });

  describe('Error Handling', () => {
    it('should handle NaN spend values gracefully', () => {
      const input = [
        { ad_name: 'Ad 1', spend: 'not-a-number', impressions: '1000', cpm: '10', ctr: '1', clicks: '10' },
        { ad_name: 'Ad 2', spend: '100.00', impressions: '1000', cpm: '10', ctr: '1', clicks: '10' }
      ];

      const result = formatOutput(input);

      // parseFloat('not-a-number') returns NaN, NaN + 100 = NaN
      // This is a potential bug in the original code
      expect(result.json.total_spend).toBe('NaN');
    });

    it('should handle empty string spend', () => {
      const input = [
        { ad_name: 'Ad 1', spend: '', impressions: '1000', cpm: '10', ctr: '1', clicks: '10' }
      ];

      const result = formatOutput(input);

      // parseFloat('') returns NaN, || 0 catches this
      expect(result.json.total_spend).toBe('0.00');
    });
  });

  describe('Markdown Format Validation', () => {
    it('should produce valid markdown table format', () => {
      const input = [
        { ad_name: 'Test Ad', spend: '100.00', impressions: '5000', cpm: '20.00', ctr: '2.5', clicks: '125' }
      ];

      const result = formatOutput(input);
      const lines = result.json.table_text.split('\n').filter(l => l.trim());

      // Should have header, separator, and data row
      expect(lines.length).toBe(3);
      expect(lines[0]).toMatch(/^\|.*\|$/);
      expect(lines[1]).toMatch(/^\|[-|]+\|$/);
      expect(lines[2]).toMatch(/^\|.*\|$/);
    });

    it('should have consistent column count', () => {
      const input = [
        { ad_name: 'Ad 1', spend: '50', impressions: '2500', cpm: '20', ctr: '3', clicks: '75' },
        { ad_name: 'Ad 2', spend: '75', impressions: '3750', cpm: '20', ctr: '2', clicks: '75' }
      ];

      const result = formatOutput(input);
      const lines = result.json.table_text.split('\n').filter(l => l.trim());

      const headerPipes = (lines[0].match(/\|/g) || []).length;

      lines.forEach(line => {
        const pipes = (line.match(/\|/g) || []).length;
        expect(pipes).toBe(headerPipes);
      });
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle typical Meta Ads API response', () => {
      const input = [
        { ad_name: 'Prospecting - Broad', spend: '156.78', impressions: '12500', cpm: '12.54', ctr: '1.85', clicks: '231' },
        { ad_name: 'Retargeting - Website Visitors', spend: '89.45', impressions: '4500', cpm: '19.88', ctr: '3.21', clicks: '145' },
        { ad_name: 'Lookalike - Top Customers', spend: '234.12', impressions: '18000', cpm: '13.01', ctr: '2.15', clicks: '387' }
      ];

      const result = formatOutput(input);

      expect(result.json.total_spend).toBe('480.35');
      expect(result.json.table_text).toContain('Prospecting - Broad');
      expect(result.json.table_text).toContain('Retargeting');
      expect(result.json.table_text).toContain('Lookalike');
    });
  });
});
