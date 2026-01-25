/**
 * WebVTT Caption File Generator
 *
 * Generate Web Video Text Tracks (WebVTT) caption files for video accessibility
 * Version: Based on W3C WebVTT Specification (W3C Candidate Recommendation)
 *
 * Purpose: Generate properly formatted caption files with AI-assisted transcription
 * Reference: https://www.w3.org/TR/webvtt1/
 *
 * WCAG Success Criteria:
 * - 1.2.2 Captions (Prerecorded) - Level A
 * - 1.2.4 Captions (Live) - Level AA
 * - 1.2.6 Sign Language (Prerecorded) - Level AAA
 */

export interface WebVTTCue {
  /** Unique identifier for the cue (optional) */
  identifier?: string;

  /** Start time in seconds */
  startTime: number;

  /** End time in seconds */
  endTime: number;

  /** Caption text (can include formatting tags) */
  text: string;

  /** Speaker name (optional, for dialogue) */
  speaker?: string;

  /** Cue settings (position, alignment, etc.) */
  settings?: {
    vertical?: 'rl' | 'lr';
    line?: number | 'auto';
    position?: number; // 0-100%
    size?: number; // 0-100%
    align?: 'start' | 'center' | 'end' | 'left' | 'right';
  };
}

export interface WebVTTStyle {
  selector: string;
  properties: Record<string, string>;
}

export interface WebVTTMetadata {
  title?: string;
  language?: string;
  description?: string;
  [key: string]: string | undefined;
}

export interface WebVTTFile {
  metadata?: WebVTTMetadata;
  styles?: WebVTTStyle[];
  cues: WebVTTCue[];
}

export interface WebVTTGeneratorOptions {
  /** Include NOTE blocks with metadata */
  includeNotes?: boolean;

  /** Validate caption best practices (length, reading speed) */
  validateBestPractices?: boolean;

  /** Maximum characters per line (default: 37) */
  maxCharsPerLine?: number;

  /** Maximum lines per cue (default: 2) */
  maxLinesPerCue?: number;

  /** Target reading speed in words per minute (default: 160) */
  targetWPM?: number;
}

export interface CaptionValidationIssue {
  cueIndex: number;
  severity: 'error' | 'warning';
  issue: string;
  suggestion: string;
}

/**
 * Format time in WebVTT timestamp format (HH:MM:SS.mmm)
 */
export function formatWebVTTTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Parse WebVTT timestamp to seconds
 */
export function parseWebVTTTimestamp(timestamp: string): number {
  const parts = timestamp.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const secondsParts = parts[2].split('.');
  const seconds = parseInt(secondsParts[0], 10);
  const milliseconds = parseInt(secondsParts[1] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

/**
 * Format cue settings object to WebVTT settings string
 */
function formatCueSettings(settings?: WebVTTCue['settings']): string {
  if (!settings) return '';

  const parts: string[] = [];

  if (settings.vertical) {
    parts.push(`vertical:${settings.vertical}`);
  }
  if (settings.line !== undefined) {
    parts.push(`line:${settings.line}`);
  }
  if (settings.position !== undefined) {
    parts.push(`position:${settings.position}%`);
  }
  if (settings.size !== undefined) {
    parts.push(`size:${settings.size}%`);
  }
  if (settings.align) {
    parts.push(`align:${settings.align}`);
  }

  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

/**
 * Generate WebVTT file content from cues
 */
export function generateWebVTT(
  file: WebVTTFile,
  options: WebVTTGeneratorOptions = {}
): string {
  let content = 'WEBVTT\n';

  // Add metadata as NOTE blocks
  if (options.includeNotes && file.metadata) {
    content += '\n';
    Object.entries(file.metadata).forEach(([key, value]) => {
      if (value) {
        content += `NOTE ${key}\n${value}\n\n`;
      }
    });
  }

  // Add STYLE blocks
  if (file.styles && file.styles.length > 0) {
    content += '\nSTYLE\n';
    file.styles.forEach(style => {
      content += `${style.selector} {\n`;
      Object.entries(style.properties).forEach(([prop, value]) => {
        content += `  ${prop}: ${value};\n`;
      });
      content += '}\n';
    });
    content += '\n';
  }

  // Add cues
  file.cues.forEach((cue, index) => {
    // Optional identifier
    if (cue.identifier) {
      content += `${cue.identifier}\n`;
    }

    // Timestamp line
    const startTimestamp = formatWebVTTTimestamp(cue.startTime);
    const endTimestamp = formatWebVTTTimestamp(cue.endTime);
    const settings = formatCueSettings(cue.settings);

    content += `${startTimestamp} --> ${endTimestamp}${settings}\n`;

    // Caption text
    let text = cue.text;

    // Add speaker identification if provided
    if (cue.speaker) {
      text = `<v ${cue.speaker}>${text}</v>`;
    }

    content += `${text}\n\n`;
  });

  return content.trim();
}

/**
 * Validate WebVTT file against best practices
 */
export function validateWebVTT(
  file: WebVTTFile,
  options: WebVTTGeneratorOptions = {}
): CaptionValidationIssue[] {
  const issues: CaptionValidationIssue[] = [];

  const maxCharsPerLine = options.maxCharsPerLine || 37;
  const maxLinesPerCue = options.maxLinesPerCue || 2;
  const targetWPM = options.targetWPM || 160;
  const maxWPM = 180; // Maximum comfortable reading speed

  file.cues.forEach((cue, index) => {
    // Check cue duration
    const duration = cue.endTime - cue.startTime;

    if (duration < 1) {
      issues.push({
        cueIndex: index,
        severity: 'warning',
        issue: 'Cue duration less than 1 second',
        suggestion: 'Captions should remain on screen for at least 1 second for readability'
      });
    }

    // Check overlapping cues
    if (index > 0) {
      const previousCue = file.cues[index - 1];
      if (cue.startTime < previousCue.endTime) {
        issues.push({
          cueIndex: index,
          severity: 'error',
          issue: 'Cue overlaps with previous cue',
          suggestion: `Start time ${formatWebVTTTimestamp(cue.startTime)} is before previous cue end time ${formatWebVTTTimestamp(previousCue.endTime)}`
        });
      }
    }

    // Remove speaker tags and formatting tags for text analysis
    // Apply sanitization repeatedly until no more changes occur (CWE-1333 fix)
    // This prevents incomplete sanitization with nested tags like <<script>script>
    let plainText = cue.text;
    let previousText: string;
    do {
      previousText = plainText;
      plainText = plainText
        .replace(/<v\s+[^>]+>/g, '')
        .replace(/<\/v>/g, '')
        .replace(/<[^>]+>/g, '');
    } while (plainText !== previousText);

    // Check line length
    const lines = plainText.split('\n');

    if (lines.length > maxLinesPerCue) {
      issues.push({
        cueIndex: index,
        severity: 'warning',
        issue: `Cue has ${lines.length} lines (max recommended: ${maxLinesPerCue})`,
        suggestion: 'Split long captions into multiple cues for better readability'
      });
    }

    lines.forEach((line, lineIndex) => {
      if (line.length > maxCharsPerLine) {
        issues.push({
          cueIndex: index,
          severity: 'warning',
          issue: `Line ${lineIndex + 1} has ${line.length} characters (max recommended: ${maxCharsPerLine})`,
          suggestion: 'Break long lines at natural phrase boundaries'
        });
      }
    });

    // Check reading speed
    const wordCount = plainText.split(/\s+/).length;
    const durationMinutes = duration / 60;
    const wpm = wordCount / durationMinutes;

    if (wpm > maxWPM) {
      issues.push({
        cueIndex: index,
        severity: 'warning',
        issue: `Reading speed is ${Math.round(wpm)} WPM (max comfortable: ${maxWPM} WPM)`,
        suggestion: 'Increase cue duration or split into multiple cues'
      });
    }

    // Check for empty captions
    if (plainText.trim().length === 0) {
      issues.push({
        cueIndex: index,
        severity: 'error',
        issue: 'Empty caption text',
        suggestion: 'Remove empty cue or add caption text'
      });
    }
  });

  return issues;
}

/**
 * Create a WebVTT file from a transcript
 *
 * @param transcript - Array of transcript segments with timestamps
 * @param options - Generation options
 */
export function createWebVTTFromTranscript(
  transcript: Array<{
    text: string;
    startTime: number;
    endTime: number;
    speaker?: string;
  }>,
  options: WebVTTGeneratorOptions = {}
): WebVTTFile {
  const maxCharsPerLine = options.maxCharsPerLine || 37;

  const cues: WebVTTCue[] = transcript.map((segment, index) => {
    // Smart line breaking at natural boundaries
    const words = segment.text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (testLine.length <= maxCharsPerLine) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    // Join lines (max 2 lines per cue recommended)
    const text = lines.slice(0, options.maxLinesPerCue || 2).join('\n');

    return {
      identifier: `cue-${index + 1}`,
      startTime: segment.startTime,
      endTime: segment.endTime,
      text,
      speaker: segment.speaker
    };
  });

  return { cues };
}

/**
 * Common caption templates and patterns
 */
export const CAPTION_TEMPLATES = {
  /**
   * Generate sound effect caption
   */
  soundEffect: (description: string, startTime: number, endTime: number): WebVTTCue => ({
    startTime,
    endTime,
    text: `[${description}]`,
    settings: { align: 'center' }
  }),

  /**
   * Generate music caption
   */
  music: (description: string, startTime: number, endTime: number): WebVTTCue => ({
    startTime,
    endTime,
    text: `♪ ${description} ♪`,
    settings: { align: 'center' }
  }),

  /**
   * Generate speaker change caption
   */
  dialogue: (speaker: string, text: string, startTime: number, endTime: number): WebVTTCue => ({
    startTime,
    endTime,
    text,
    speaker
  }),

  /**
   * Generate atmosphere/ambient sound caption
   */
  ambient: (description: string, startTime: number, endTime: number): WebVTTCue => ({
    startTime,
    endTime,
    text: `(${description})`,
    settings: { position: 50, align: 'center' }
  })
};

/**
 * WebVTT style presets for common use cases
 */
export const WEBVTT_STYLE_PRESETS = {
  /**
   * High contrast style for better visibility
   */
  highContrast: (): WebVTTStyle[] => [
    {
      selector: '::cue',
      properties: {
        'background-color': 'rgba(0, 0, 0, 0.9)',
        'color': '#FFFFFF',
        'font-size': '1.5em',
        'font-family': 'Arial, sans-serif'
      }
    }
  ],

  /**
   * Speaker differentiation with colors
   */
  speakerColors: (): WebVTTStyle[] => [
    {
      selector: '::cue(v[voice="Speaker 1"])',
      properties: {
        'color': '#00CCFF'
      }
    },
    {
      selector: '::cue(v[voice="Speaker 2"])',
      properties: {
        'color': '#FFCC00'
      }
    },
    {
      selector: '::cue(v[voice="Speaker 3"])',
      properties: {
        'color': '#FF66CC'
      }
    }
  ],

  /**
   * Sound effect styling
   */
  soundEffects: (): WebVTTStyle[] => [
    {
      selector: '::cue(i)',
      properties: {
        'color': '#CCCCCC',
        'font-style': 'italic'
      }
    }
  ]
};

/**
 * AI-Assisted Caption Generation Helpers
 */

export interface AITranscriptionSegment {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  speaker?: string;
}

/**
 * Generate caption generation prompt for AI services
 *
 * @param videoMetadata - Video information
 * @returns Prompt for AI transcription services
 */
export function generateAICaptionPrompt(videoMetadata: {
  title?: string;
  duration?: number;
  topic?: string;
  language?: string;
}): string {
  return `Generate accurate captions for a video with the following details:

Title: ${videoMetadata.title || 'Untitled Video'}
Duration: ${videoMetadata.duration ? formatWebVTTTimestamp(videoMetadata.duration) : 'Unknown'}
Topic: ${videoMetadata.topic || 'General'}
Language: ${videoMetadata.language || 'English'}

Caption Requirements:
- Maximum 37 characters per line
- Maximum 2 lines per caption
- Reading speed: 160-180 words per minute
- Include speaker identification for dialogue
- Mark sound effects with [brackets]
- Mark music with ♪ symbols
- Mark ambient sounds with (parentheses)
- Ensure accurate timing synchronization
- Follow WebVTT format specification

Please provide:
1. Timestamp (HH:MM:SS.mmm format)
2. Speaker name (if applicable)
3. Caption text with proper line breaks
4. Confidence score (0-1)`;
}

/**
 * Convert AI transcription to WebVTT file
 */
export function convertAITranscriptionToWebVTT(
  segments: AITranscriptionSegment[],
  options: WebVTTGeneratorOptions = {}
): WebVTTFile {
  const cues = segments.map((segment, index) => {
    // Filter out low-confidence segments (you may want manual review)
    if (segment.confidence < 0.8) {
      console.warn(`Low confidence segment at ${formatWebVTTTimestamp(segment.startTime)}: ${segment.confidence}`);
    }

    return {
      identifier: `ai-cue-${index + 1}`,
      startTime: segment.startTime,
      endTime: segment.endTime,
      text: segment.text,
      speaker: segment.speaker
    };
  });

  const file: WebVTTFile = {
    metadata: {
      title: 'AI-Generated Captions',
      description: 'Generated using AI transcription service'
    },
    cues
  };

  return file;
}

/**
 * Caption quality scoring
 */
export function scoreCaptionQuality(file: WebVTTFile): {
  score: number;
  breakdown: {
    timing: number;
    readability: number;
    completeness: number;
    formatting: number;
  };
  recommendations: string[];
} {
  const issues = validateWebVTT(file, { validateBestPractices: true });
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  // Scoring components (0-100)
  let timing = 100;
  let readability = 100;
  let completeness = 100;
  let formatting = 100;

  const recommendations: string[] = [];

  // Penalize for errors and warnings
  timing -= errorCount * 10;
  readability -= warningCount * 5;

  // Check completeness (minimum 80% of expected cues)
  if (file.cues.length === 0) {
    completeness = 0;
    recommendations.push('Add captions to the video');
  }

  // Check formatting
  const hasSpeakers = file.cues.some(c => c.speaker);
  if (!hasSpeakers && file.cues.length > 5) {
    formatting -= 10;
    recommendations.push('Consider adding speaker identification for dialogue');
  }

  // Overall score (weighted average)
  const score = Math.max(0, Math.round(
    timing * 0.3 +
    readability * 0.3 +
    completeness * 0.2 +
    formatting * 0.2
  ));

  if (score < 80) {
    recommendations.push('Review and address validation issues for better quality');
  }
  if (errorCount > 0) {
    recommendations.push('Fix critical errors (overlapping cues, empty captions)');
  }
  if (warningCount > 5) {
    recommendations.push('Consider revising captions for better readability');
  }

  return {
    score,
    breakdown: {
      timing: Math.max(0, timing),
      readability: Math.max(0, readability),
      completeness: Math.max(0, completeness),
      formatting: Math.max(0, formatting)
    },
    recommendations
  };
}

/**
 * Export WebVTT file to disk
 */
export function saveWebVTT(
  file: WebVTTFile,
  options: WebVTTGeneratorOptions = {}
): { content: string; filename: string } {
  const content = generateWebVTT(file, options);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `captions-${timestamp}.vtt`;

  return { content, filename };
}

/**
 * Example usage and best practices
 */
export const WEBVTT_EXAMPLES = {
  /**
   * Basic video with dialogue
   */
  simpleDialogue: (): WebVTTFile => ({
    metadata: {
      title: 'Product Demo Video',
      language: 'en'
    },
    cues: [
      {
        identifier: 'intro',
        startTime: 0,
        endTime: 3.5,
        text: 'Welcome to our product demo.',
        speaker: 'Narrator'
      },
      {
        identifier: 'feature-1',
        startTime: 3.5,
        endTime: 7.0,
        text: 'Today we\'ll show you\nthree amazing features.',
        speaker: 'Narrator'
      },
      CAPTION_TEMPLATES.music('Upbeat background music', 7.0, 10.0)
    ]
  }),

  /**
   * Educational video with sound effects
   */
  educational: (): WebVTTFile => ({
    metadata: {
      title: 'Science Experiment',
      language: 'en',
      description: 'Chemistry demonstration with captions'
    },
    styles: WEBVTT_STYLE_PRESETS.highContrast(),
    cues: [
      {
        startTime: 0,
        endTime: 4,
        text: 'First, we add the sodium chloride\nto the beaker.',
        speaker: 'Professor'
      },
      CAPTION_TEMPLATES.soundEffect('Bubbling sounds', 4, 6),
      {
        startTime: 6,
        endTime: 10,
        text: 'Notice the chemical reaction\noccurring.',
        speaker: 'Professor'
      }
    ]
  })
};
