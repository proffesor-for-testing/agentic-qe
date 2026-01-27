/**
 * Unit Tests for "Merge Spotify Data" Code Node
 *
 * Purpose: Consolidate multiple Spotify data rows into a single report,
 * merging track-level and overall stats, then generating markdown output.
 */

const { describe, it, expect } = require('@jest/globals');

// Function Under Test (extracted from n8n Code node)
function mergeSpotifyData(items) {
  // Initialize containers for our merged data
  let overallStats = {
    report_date: "N/A",
    listeners: 0,
    streams: 0,
    saves: 0,
    playlist_adds: 0,
    followers: 0,
    popularity_score: "N/A"
  };

  let trackMap = {};

  // Loop through every item in the input
  for (const item of items) {
    const data = item.json || item;

    // CASE 1: INDIVIDUAL TRACK DATA
    if (data.track_name) {
      const name = data.track_name;

      // Initialize track if not seen yet
      if (!trackMap[name]) {
        trackMap[name] = {
          name: name,
          streams: 0,
          listeners: 0,
          popularity: "N/A",
          date: data.report_date
        };
      }

      // Merge Metrics
      if (parseInt(data.streams) > 0) {
        trackMap[name].streams = data.streams;
        trackMap[name].listeners = data.listeners;
        trackMap[name].date = data.report_date;
      }

      // Merge Popularity
      if (data.popularity_score !== null && data.popularity_score !== undefined) {
        trackMap[name].popularity = data.popularity_score;
      }
    }

    // CASE 2: OVERALL STATS (No track name)
    else {
      // Merge Metrics
      if (parseInt(data.streams) > 0) {
        overallStats.streams = data.streams;
        overallStats.listeners = data.listeners;
        overallStats.saves = data.saves;
        overallStats.playlist_adds = data.playlist_adds;
        overallStats.followers = data.followers;
        overallStats.report_date = data.report_date;
      }

      // Merge Popularity
      if (data.popularity_score !== null) {
        overallStats.popularity_score = data.popularity_score;
      }
    }
  }

  // --- BUILD THE REPORT TEXT ---

  // 1. Format Overall Stats Section
  let reportText = `### SPOTIFY CATALOG REPORT\n`;
  reportText += `**Report Date:** ${overallStats.report_date}\n`;
  reportText += `**Total Streams:** ${overallStats.streams}\n`;
  reportText += `**Total Listeners:** ${overallStats.listeners}\n`;
  reportText += `**Followers:** ${overallStats.followers}\n`;
  reportText += `**Global Popularity:** ${overallStats.popularity_score}\n\n`;

  // 2. Format Tracks Table
  reportText += `### TOP TRACKS (Consolidated)\n`;
  reportText += `| Track | Streams | Listeners | Popularity | Date |\n`;
  reportText += `|---|---|---|---|---|\n`;

  // Convert map to array and sort by Streams (descending)
  const sortedTracks = Object.values(trackMap).sort((a, b) => b.streams - a.streams);

  for (const t of sortedTracks) {
    reportText += `| ${t.name} | ${t.streams} | ${t.listeners} | ${t.popularity} | ${t.date} |\n`;
  }

  // Return the single text object for the Agent
  return [{
    json: {
      report_date: overallStats.report_date,
      table_text: reportText
    }
  }];
}

describe('Merge Spotify Data', () => {
  describe('Overall Stats Aggregation', () => {
    it('should capture overall stats from items without track_name', () => {
      const input = [
        {
          json: {
            streams: "125000",
            listeners: "45000",
            saves: "5000",
            playlist_adds: "250",
            followers: "12000",
            report_date: "2024-01-20"
          }
        }
      ];

      const result = mergeSpotifyData(input);

      expect(result[0].json.table_text).toContain('Total Streams:** 125000');
      expect(result[0].json.table_text).toContain('Total Listeners:** 45000');
      expect(result[0].json.table_text).toContain('Followers:** 12000');
      expect(result[0].json.report_date).toBe('2024-01-20');
    });

    it('should merge popularity score separately', () => {
      const input = [
        {
          json: {
            streams: "100000",
            listeners: "40000",
            saves: "4000",
            playlist_adds: "200",
            followers: "10000",
            report_date: "2024-01-20"
          }
        },
        {
          json: {
            popularity_score: 75
          }
        }
      ];

      const result = mergeSpotifyData(input);

      expect(result[0].json.table_text).toContain('Global Popularity:** 75');
    });

    it('should use last valid overall stats when multiple present', () => {
      const input = [
        {
          json: {
            streams: "50000",
            listeners: "20000",
            report_date: "2024-01-19"
          }
        },
        {
          json: {
            streams: "75000",
            listeners: "30000",
            report_date: "2024-01-20"
          }
        }
      ];

      const result = mergeSpotifyData(input);

      expect(result[0].json.table_text).toContain('Total Streams:** 75000');
      expect(result[0].json.report_date).toBe('2024-01-20');
    });
  });

  describe('Track Data Merging', () => {
    it('should capture individual track data', () => {
      const input = [
        {
          json: {
            track_name: "Summer Vibes",
            streams: "50000",
            listeners: "20000",
            report_date: "2024-01-20"
          }
        }
      ];

      const result = mergeSpotifyData(input);

      expect(result[0].json.table_text).toContain('| Summer Vibes | 50000 | 20000 |');
    });

    it('should merge multiple rows for same track', () => {
      const input = [
        {
          json: {
            track_name: "Hit Song",
            streams: "100000",
            listeners: "40000",
            report_date: "2024-01-20"
          }
        },
        {
          json: {
            track_name: "Hit Song",
            popularity_score: 82
          }
        }
      ];

      const result = mergeSpotifyData(input);

      // Should have combined data
      expect(result[0].json.table_text).toContain('Hit Song');
      expect(result[0].json.table_text).toContain('100000');
      expect(result[0].json.table_text).toContain('82');
    });

    it('should handle multiple different tracks', () => {
      const input = [
        { json: { track_name: "Track A", streams: "50000", listeners: "20000", report_date: "2024-01-20" } },
        { json: { track_name: "Track B", streams: "75000", listeners: "30000", report_date: "2024-01-20" } },
        { json: { track_name: "Track C", streams: "25000", listeners: "10000", report_date: "2024-01-20" } }
      ];

      const result = mergeSpotifyData(input);

      expect(result[0].json.table_text).toContain('Track A');
      expect(result[0].json.table_text).toContain('Track B');
      expect(result[0].json.table_text).toContain('Track C');
    });

    it('should sort tracks by streams descending', () => {
      const input = [
        { json: { track_name: "Low", streams: "10000", listeners: "5000", report_date: "2024-01-20" } },
        { json: { track_name: "High", streams: "100000", listeners: "40000", report_date: "2024-01-20" } },
        { json: { track_name: "Medium", streams: "50000", listeners: "20000", report_date: "2024-01-20" } }
      ];

      const result = mergeSpotifyData(input);
      const lines = result[0].json.table_text.split('\n');

      // Find track rows (after header and separator)
      const trackLines = lines.filter(l => l.startsWith('|') && !l.includes('Track | Streams') && !l.includes('|---|'));

      // High should be first, then Medium, then Low
      expect(trackLines[0]).toContain('High');
      expect(trackLines[1]).toContain('Medium');
      expect(trackLines[2]).toContain('Low');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const input = [];

      const result = mergeSpotifyData(input);

      expect(result[0].json.report_date).toBe('N/A');
      expect(result[0].json.table_text).toContain('N/A');
    });

    it('should handle items without json wrapper', () => {
      const input = [
        { track_name: "Direct Track", streams: "30000", listeners: "15000", report_date: "2024-01-20" }
      ];

      const result = mergeSpotifyData(input);

      expect(result[0].json.table_text).toContain('Direct Track');
    });

    it('should handle zero streams (not merged)', () => {
      const input = [
        { json: { track_name: "Zero Track", streams: "0", listeners: "0", report_date: "2024-01-20" } },
        { json: { track_name: "Zero Track", popularity_score: 50 } }
      ];

      const result = mergeSpotifyData(input);

      // Track should exist but with 0 streams (not overwritten)
      expect(result[0].json.table_text).toContain('Zero Track');
    });

    it('should handle null popularity_score', () => {
      const input = [
        {
          json: {
            track_name: "Null Pop",
            streams: "50000",
            listeners: "20000",
            popularity_score: null,
            report_date: "2024-01-20"
          }
        }
      ];

      const result = mergeSpotifyData(input);

      // Should keep "N/A" for popularity when null
      expect(result[0].json.table_text).toContain('| Null Pop | 50000 | 20000 | N/A |');
    });

    it('should handle string vs number types', () => {
      const input = [
        { json: { track_name: "String Track", streams: "50000", listeners: "20000", report_date: "2024-01-20" } },
        { json: { track_name: "Number Track", streams: 75000, listeners: 30000, report_date: "2024-01-20" } }
      ];

      const result = mergeSpotifyData(input);

      expect(result[0].json.table_text).toContain('String Track');
      expect(result[0].json.table_text).toContain('Number Track');
    });

    it('should handle missing report_date', () => {
      const input = [
        { json: { track_name: "No Date", streams: "50000", listeners: "20000" } }
      ];

      const result = mergeSpotifyData(input);

      // Should use undefined date from data
      expect(result[0].json.table_text).toContain('| No Date |');
    });
  });

  describe('Markdown Output Format', () => {
    it('should include catalog report header', () => {
      const input = [
        { json: { streams: "100000", listeners: "40000", report_date: "2024-01-20" } }
      ];

      const result = mergeSpotifyData(input);

      expect(result[0].json.table_text).toContain('### SPOTIFY CATALOG REPORT');
    });

    it('should include all overall stat fields', () => {
      const input = [
        {
          json: {
            streams: "100000",
            listeners: "40000",
            saves: "5000",
            playlist_adds: "250",
            followers: "12000",
            report_date: "2024-01-20"
          }
        }
      ];

      const result = mergeSpotifyData(input);

      expect(result[0].json.table_text).toContain('**Report Date:**');
      expect(result[0].json.table_text).toContain('**Total Streams:**');
      expect(result[0].json.table_text).toContain('**Total Listeners:**');
      expect(result[0].json.table_text).toContain('**Followers:**');
      expect(result[0].json.table_text).toContain('**Global Popularity:**');
    });

    it('should include tracks table header', () => {
      const input = [
        { json: { track_name: "Test", streams: "1000", listeners: "500", report_date: "2024-01-20" } }
      ];

      const result = mergeSpotifyData(input);

      expect(result[0].json.table_text).toContain('### TOP TRACKS (Consolidated)');
      expect(result[0].json.table_text).toContain('| Track | Streams | Listeners | Popularity | Date |');
      expect(result[0].json.table_text).toContain('|---|---|---|---|---|');
    });

    it('should format track rows correctly', () => {
      const input = [
        {
          json: {
            track_name: "Perfect Format",
            streams: "50000",
            listeners: "20000",
            popularity_score: 75,
            report_date: "2024-01-20"
          }
        }
      ];

      const result = mergeSpotifyData(input);

      expect(result[0].json.table_text).toContain('| Perfect Format | 50000 | 20000 | 75 | 2024-01-20 |');
    });
  });

  describe('Return Structure', () => {
    it('should return array with single item', () => {
      const input = [{ json: { streams: "1000", report_date: "2024-01-20" } }];

      const result = mergeSpotifyData(input);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });

    it('should have json wrapper on output', () => {
      const input = [{ json: { streams: "1000", report_date: "2024-01-20" } }];

      const result = mergeSpotifyData(input);

      expect(result[0]).toHaveProperty('json');
    });

    it('should include report_date and table_text in output', () => {
      const input = [{ json: { streams: "1000", report_date: "2024-01-20" } }];

      const result = mergeSpotifyData(input);

      expect(result[0].json).toHaveProperty('report_date');
      expect(result[0].json).toHaveProperty('table_text');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle typical Spotify API response split', () => {
      const input = [
        // Overall stats row
        {
          json: {
            streams: "125000",
            listeners: "45000",
            saves: "5000",
            playlist_adds: "250",
            followers: "12000",
            report_date: "2024-01-20"
          }
        },
        // Popularity row
        {
          json: {
            popularity_score: 72
          }
        },
        // Track 1 metrics
        {
          json: {
            track_name: "Summer Vibes",
            streams: "50000",
            listeners: "20000",
            report_date: "2024-01-20"
          }
        },
        // Track 1 popularity
        {
          json: {
            track_name: "Summer Vibes",
            popularity_score: 78
          }
        },
        // Track 2 metrics
        {
          json: {
            track_name: "Night Drive",
            streams: "35000",
            listeners: "15000",
            report_date: "2024-01-20"
          }
        },
        // Track 2 popularity
        {
          json: {
            track_name: "Night Drive",
            popularity_score: 65
          }
        },
        // Track 3 metrics
        {
          json: {
            track_name: "Morning Coffee",
            streams: "40000",
            listeners: "18000",
            report_date: "2024-01-20"
          }
        }
      ];

      const result = mergeSpotifyData(input);

      // Overall stats
      expect(result[0].json.table_text).toContain('Total Streams:** 125000');
      expect(result[0].json.table_text).toContain('Global Popularity:** 72');

      // Tracks should be sorted by streams
      const lines = result[0].json.table_text.split('\n');
      const trackLines = lines.filter(l => l.startsWith('| ') && l.includes('|') && !l.includes('Track | Streams') && !l.includes('|---'));

      // Summer Vibes (50000) should be first
      expect(trackLines[0]).toContain('Summer Vibes');
      // Morning Coffee (40000) second
      expect(trackLines[1]).toContain('Morning Coffee');
      // Night Drive (35000) last
      expect(trackLines[2]).toContain('Night Drive');
    });

    it('should handle combined row format', () => {
      const input = [
        {
          json: {
            track_name: "All In One",
            streams: "75000",
            listeners: "30000",
            popularity_score: 80,
            report_date: "2024-01-20"
          }
        }
      ];

      const result = mergeSpotifyData(input);

      expect(result[0].json.table_text).toContain('| All In One | 75000 | 30000 | 80 | 2024-01-20 |');
    });
  });
});
