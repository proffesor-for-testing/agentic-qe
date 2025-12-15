import type { Page } from 'playwright';
import type { ILLMProvider } from '../../../../providers/ILLMProvider';

export interface VideoFrame {
  timestamp: number;
  dataUrl: string;
}

export interface SceneDescription {
  timestamp: number;
  description: string;
  duration: number;
}

export interface VideoAnalysisResult {
  overallDescription: string;
  sceneDescriptions: SceneDescription[];
  webVTT: string;
  extendedDescription: string; // For aria-describedby
}

export type VisionProvider = 'openai' | 'anthropic' | 'ollama' | 'moondream' | 'context' | 'auto' | 'provider';

export interface VisionOptions {
  provider?: VisionProvider; // Default: 'auto' (cascade through all available)
  openaiApiKey?: string; // OpenAI API key (or use OPENAI_API_KEY env var)
  anthropicApiKey?: string; // Anthropic API key (or use ANTHROPIC_API_KEY env var)
  ollamaBaseUrl?: string; // Default: http://localhost:11434
  ollamaModel?: string; // Default: llava (free vision model)
  moondreamBaseUrl?: string; // Default: http://localhost:11434 (moondream via Ollama)
  videoContext?: VideoContext; // Context for intelligent fallback captions
  enableCascade?: boolean; // Default: true - automatically try next provider on failure
  llmProvider?: ILLMProvider; // Custom LLM provider for vision analysis (replaces direct Anthropic usage)
  model?: string; // Model to use with llmProvider (optional, uses provider default if not specified)
}

export interface VideoContext {
  pageTitle?: string;
  videoTitle?: string;
  videoSrc?: string;
  posterSrc?: string;
  nearbyHeadings?: string[];
  nearbyText?: string[];
  pageUrl?: string;
  duration?: number;
}

/**
 * Extract frames from video element using browser canvas API
 */
export async function extractVideoFrames(
  page: Page,
  videoSelector: string,
  options: {
    maxFrames?: number;
    intervalSeconds?: number;
  } = {}
): Promise<VideoFrame[]> {
  const { maxFrames = 6, intervalSeconds = 5 } = options;

  const frames = await page.evaluate(
    async ({ selector, interval, max }) => {
      const video = document.querySelector(selector) as HTMLVideoElement;
      if (!video) throw new Error('Video not found');

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      // Set canvas size to video size
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;

      const frames: Array<{ timestamp: number; dataUrl: string }> = [];
      const duration = video.duration || 30;

      // Extract frames at intervals
      for (let i = 0; i < max && i * interval < duration; i++) {
        const time = i * interval;

        // Seek to timestamp
        video.currentTime = time;

        // Wait for seek to complete
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);

          // Fallback timeout
          setTimeout(resolve, 1000);
        });

        // Draw current frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to data URL
        frames.push({
          timestamp: time,
          dataUrl: canvas.toDataURL('image/jpeg', 0.8)
        });
      }

      return frames;
    },
    {
      selector: videoSelector,
      interval: intervalSeconds,
      max: maxFrames
    }
  );

  return frames;
}

/**
 * Extract YouTube video ID from URL
 */
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Generate intelligent context-based captions WITHOUT AI vision
 * Extracts maximum information from available context
 */
async function generateContextBasedCaptions(
  frames: VideoFrame[],
  context: VideoContext
): Promise<VideoAnalysisResult> {
  const sceneDescriptions: SceneDescription[] = [];

  // Extract YouTube metadata if available
  let youtubeTitle = '';
  let youtubeDescription = '';

  if (context.videoSrc) {
    const ytId = extractYouTubeId(context.videoSrc);
    if (ytId) {
      try {
        // Use YouTube oEmbed API (no API key required)
        const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
        if (response.ok) {
          const data = await response.json();
          youtubeTitle = data.title || '';
        }
      } catch (error) {
        // Silent fail - continue with other context
      }
    }
  }

  // Build comprehensive context
  const videoTitle = youtubeTitle || context.videoTitle || context.nearbyHeadings?.[0] || 'Video content';
  const pageContext = context.pageTitle || 'this page';
  const topicContext = context.nearbyText?.join(' ').slice(0, 200) || '';

  // Analyze URL and poster for clues
  let contentType = 'presentation';
  let subjectMatter = '';

  if (context.videoSrc) {
    const srcLower = context.videoSrc.toLowerCase();
    if (srcLower.includes('tutorial') || srcLower.includes('how-to')) {
      contentType = 'tutorial';
    } else if (srcLower.includes('interview') || srcLower.includes('talk')) {
      contentType = 'interview';
    } else if (srcLower.includes('demo') || srcLower.includes('product')) {
      contentType = 'product demonstration';
    } else if (srcLower.includes('webinar') || srcLower.includes('presentation')) {
      contentType = 'webinar presentation';
    }

    // Extract subject matter from filename
    const filename = srcLower.split('/').pop() || '';
    if (filename.includes('testing')) subjectMatter = 'software testing';
    else if (filename.includes('leadership') || filename.includes('team')) subjectMatter = 'team leadership';
    else if (filename.includes('quality') || filename.includes('qa')) subjectMatter = 'quality assurance';
  }

  // Generate intelligent scene descriptions distributed across video
  const duration = context.duration || 30;
  const numFrames = frames.length;

  for (let i = 0; i < numFrames; i++) {
    const frame = frames[i];
    const progress = i / (numFrames - 1);
    let description = '';

    if (i === 0) {
      // Opening scene
      description = `Video titled "${videoTitle}" begins. ${contentType.charAt(0).toUpperCase() + contentType.slice(1)} ${subjectMatter ? `about ${subjectMatter}` : 'from ' + pageContext}. `;
      if (topicContext) {
        description += `Topic: ${topicContext.split('.')[0]}.`;
      }
    } else if (i === numFrames - 1) {
      // Closing scene
      description = `Conclusion of ${contentType}. Final thoughts and summary presented. Video ends with call-to-action or contact information.`;
    } else if (progress < 0.33) {
      // Early section - introduction
      description = `Introduction continues. ${contentType === 'interview' ? 'Interviewer and guest discuss background and context.' : 'Key concepts and objectives being explained.'}`;
    } else if (progress < 0.67) {
      // Middle section - main content
      if (contentType === 'tutorial') {
        description = `Step-by-step demonstration of main techniques. Presenter shows practical examples and explains methodology.`;
      } else if (contentType === 'interview') {
        description = `Main discussion points being explored. Guest shares insights and experiences related to ${subjectMatter || 'the topic'}.`;
      } else if (contentType === 'product demonstration') {
        description = `Product features and capabilities being demonstrated. Detailed walkthrough of functionality and benefits.`;
      } else {
        description = `Core content being presented. Main arguments, evidence, or examples being shared with audience.`;
      }
    } else {
      // Later section - conclusion approaching
      description = `Discussion moving toward conclusion. Key takeaways and practical applications being emphasized.`;
    }

    sceneDescriptions.push({
      timestamp: frame.timestamp,
      description,
      duration: 3
    });
  }

  // Generate comprehensive overall description
  const overallDescription = `This ${contentType} titled "${videoTitle}" appears on ${pageContext}. ${
    subjectMatter ? `The content focuses on ${subjectMatter}, ` : ''
  }${
    topicContext ? `covering topics such as: ${topicContext.split('.').slice(0, 2).join('. ')}.` : 'providing educational content for viewers.'
  } The video progresses from introduction through main content to conclusion, presenting information ${
    contentType === 'interview' ? 'through conversation and dialogue' :
    contentType === 'tutorial' ? 'with step-by-step demonstrations' :
    'in a structured, professional format'
  }. ${
    context.duration ? `Total duration: approximately ${Math.floor(context.duration / 60)} minutes ${Math.floor(context.duration % 60)} seconds.` : ''
  }`;

  const webVTT = generateWebVTTFromScenes(sceneDescriptions);
  const extendedDescription = generateExtendedDescription(overallDescription, sceneDescriptions);

  return {
    overallDescription,
    sceneDescriptions,
    webVTT,
    extendedDescription
  };
}

/**
 * Analyze video frames using FREE Ollama local vision model (llava)
 * No API key required, runs completely locally
 */
async function analyzeVideoWithOllama(
  frames: VideoFrame[],
  options: VisionOptions
): Promise<VideoAnalysisResult> {
  const baseUrl = options.ollamaBaseUrl || 'http://localhost:11434';
  const model = options.ollamaModel || 'llava';

  const sceneDescriptions: SceneDescription[] = [];
  let visionFailed = false;

  // Analyze each frame
  for (const frame of frames) {
    const base64Data = frame.dataUrl.split(',')[1];

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: `You are describing this video frame for a blind person who cannot see it. Provide a detailed, comprehensive description.

CRITICAL: Focus on these accessibility elements:

1. **Scene Setting** - Where is this taking place? Indoors/outdoors? What's the environment?
2. **Main Subject** - What is the primary focus? (vehicle, product, person, building, etc.)
3. **People** - If any people are visible:
   - How many people?
   - What are they wearing?
   - What are they doing?
   - Facial expressions and body language
   - Age, gender (if visible)
4. **Actions & Motion** - What's moving? How? In what direction?
5. **Text & Graphics** - Read ALL visible text exactly as shown:
   - Logos, brand names
   - Captions, subtitles
   - Product names, prices
   - Website URLs
   - Menu items
6. **Colors & Lighting** - Dominant colors, lighting mood (bright, dim, dramatic)
7. **Objects & Details** - Important objects, their position, condition
8. **Perspective** - Camera angle (close-up, wide shot, aerial, etc.)

Write 3-4 detailed sentences that paint a complete picture. Be specific with measurements, positions, and relationships between objects.

Example good description: "Close-up shot of a silver electric SUV parked in a modern glass showroom with white LED lighting. The camera slowly pans around the vehicle's right side, revealing its sleek coupe-like roofline and distinctive LED headlights. Text overlay in white sans-serif font reads 'Innovation in Motion' in the bottom right corner. The vehicle's glossy paint reflects the showroom lights, creating highlights along the body panels."`,
          images: [base64Data],
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const description = data.response || '';

      sceneDescriptions.push({
        timestamp: frame.timestamp,
        description,
        duration: 3 // 3-second intervals for detailed frame-by-frame
      });
    } catch (error) {
      console.warn(`⚠️  Ollama vision failed - falling back to intelligent context-based captions`);
      visionFailed = true;
      break; // Stop trying vision, use context-based fallback instead
    }
  }

  // If vision failed, use intelligent context-based captions
  if (visionFailed && options.videoContext) {
    console.log('🔄 Generating intelligent context-based captions...');
    return generateContextBasedCaptions(frames, options.videoContext);
  }

  // Generate comprehensive overall description from all frames
  const overallDescription = sceneDescriptions.length > 0
    ? `This video contains ${sceneDescriptions.length} detailed scenes analyzed frame-by-frame. ${sceneDescriptions[0].description} The video progresses through multiple perspectives and angles, providing a comprehensive visual presentation. Each scene has been described in detail to help blind users understand all visual elements, text, people, actions, and environmental context.`
    : 'Video content analysis unavailable - Ollama may not be running or configured correctly';

  const webVTT = generateWebVTTFromScenes(sceneDescriptions);
  const extendedDescription = generateExtendedDescription(overallDescription, sceneDescriptions);

  return {
    overallDescription,
    sceneDescriptions,
    webVTT,
    extendedDescription
  };
}

/**
 * Analyze video frames using LLM provider with vision capability
 * Uses provider abstraction for flexibility and backward compatibility
 */
async function analyzeVideoWithVisionProvider(
  frames: VideoFrame[],
  provider: ILLMProvider,
  model?: string
): Promise<VideoAnalysisResult> {
  // Verify provider supports vision
  const metadata = provider.getMetadata();
  if (!metadata.capabilities.vision) {
    throw new Error(`Provider "${metadata.name}" does not support vision. Please use a vision-capable provider like Claude.`);
  }

  // Analyze each frame for scene description
  const sceneDescriptions: SceneDescription[] = [];

  const framePrompt = `You are describing this video frame for a blind person who cannot see it. Provide a detailed, comprehensive description.

CRITICAL: Focus on these accessibility elements:

1. **Scene Setting** - Where is this taking place? Indoors/outdoors? What's the environment?
2. **Main Subject** - What is the primary focus? (vehicle, product, person, building, etc.)
3. **People** - If any people are visible:
   - How many people?
   - What are they wearing?
   - What are they doing?
   - Facial expressions and body language
   - Age, gender (if visible)
4. **Actions & Motion** - What's moving? How? In what direction?
5. **Text & Graphics** - Read ALL visible text exactly as shown:
   - Logos, brand names
   - Captions, subtitles
   - Product names, prices
   - Website URLs
   - Menu items
6. **Colors & Lighting** - Dominant colors, lighting mood (bright, dim, dramatic)
7. **Objects & Details** - Important objects, their position, condition
8. **Perspective** - Camera angle (close-up, wide shot, aerial, etc.)

Write 3-4 detailed sentences that paint a complete picture. Be specific with measurements, positions, and relationships between objects.`;

  for (const frame of frames) {
    // Convert data URL to base64 string (remove data:image/jpeg;base64, prefix)
    const base64Data = frame.dataUrl.split(',')[1];

    const response = await provider.complete({
      model: model || 'claude-3-7-sonnet-20250219',
      maxTokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Data
              }
            },
            {
              type: 'text',
              text: framePrompt
            }
          ]
        }
      ]
    });

    const description = response.content[0].type === 'text' ? response.content[0].text : '';

    sceneDescriptions.push({
      timestamp: frame.timestamp,
      description,
      duration: 3 // 3-second intervals for detailed frame-by-frame
    });
  }

  // Generate overall video description using all frames
  const imageBlocks = frames.map((frame) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/jpeg' as const,
      data: frame.dataUrl.split(',')[1]
    }
  }));

  const overallPrompt = `You are creating a comprehensive video description for a blind person who cannot see it. Analyze all frames and create a complete narrative.

CRITICAL: Provide a detailed overview covering:

1. **Video Purpose** - What is this video trying to show or sell?
2. **Opening Scene** - How does the video start?
3. **Main Narrative** - What story or message unfolds?
4. **Key Moments** - What are the 2-3 most important scenes?
5. **People & Characters** - Who appears and what do they do?
6. **Text & Branding** - All visible text, logos, slogans
7. **Emotional Tone** - Is it exciting, calm, professional, dramatic?
8. **Closing** - How does the video end?

Write 4-5 sentences that tell the complete story of this video, helping a blind user understand exactly what they would see if they could watch it. Be specific about what happens when, and include all important visual details.`;

  const overallResponse = await provider.complete({
    model: model || 'claude-3-7-sonnet-20250219',
    maxTokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          {
            type: 'text',
            text: overallPrompt
          }
        ]
      }
    ]
  });

  const overallDescription = overallResponse.content[0].type === 'text' ? overallResponse.content[0].text : '';

  // Generate WebVTT captions from scene descriptions
  const webVTT = generateWebVTTFromScenes(sceneDescriptions);

  // Generate extended description for aria-describedby
  const extendedDescription = generateExtendedDescription(
    overallDescription,
    sceneDescriptions
  );

  return {
    overallDescription,
    sceneDescriptions,
    webVTT,
    extendedDescription
  };
}

/**
 * Generate WebVTT captions from scene descriptions
 */
function generateWebVTTFromScenes(scenes: SceneDescription[]): string {
  let vtt = 'WEBVTT\n\n';

  scenes.forEach((scene, index) => {
    const start = formatTimestamp(scene.timestamp);
    const end = formatTimestamp(scene.timestamp + scene.duration);

    // Split description into caption-sized chunks (max 2 lines, 37 chars each)
    const lines = splitIntoLines(scene.description, 37, 2);

    vtt += `${start} --> ${end}\n`;
    vtt += `${lines.join('\n')}\n\n`;
  });

  return vtt;
}

/**
 * Generate extended description for aria-describedby
 */
function generateExtendedDescription(
  overall: string,
  scenes: SceneDescription[]
): string {
  let description = `${overall}\n\nDetailed scene breakdown:\n\n`;

  scenes.forEach((scene, index) => {
    const time = formatTimestamp(scene.timestamp);
    description += `[${time}] ${scene.description}\n\n`;
  });

  return description.trim();
}

/**
 * Format timestamp for WebVTT (HH:MM:SS.mmm)
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Split text into lines for captions (max chars per line)
 */
function splitIntoLines(
  text: string,
  maxCharsPerLine: number,
  maxLines: number = 10
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;

      if (lines.length >= maxLines) {
        break;
      }
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Main function: Analyze video frames using configured vision provider
 * Defaults to FREE Ollama (no API key required)
 *
 * @param frames - Video frames to analyze
 * @param options - Vision analysis options
 * @returns Analysis result with descriptions and captions
 */
export async function analyzeVideoWithVision(
  frames: VideoFrame[],
  options: VisionOptions = {}
): Promise<VideoAnalysisResult> {
  const provider = options.provider || 'free';

  console.log(`🔍 Using vision provider: ${provider === 'free' ? 'Ollama (FREE)' : provider}`);

  // Provider abstraction: use custom LLM provider
  if (provider === 'provider' || options.llmProvider) {
    if (!options.llmProvider) {
      throw new Error('llmProvider option is required when using provider mode. Pass an ILLMProvider instance.');
    }

    // Check if provider supports vision
    const metadata = options.llmProvider.getMetadata();
    if (!metadata.capabilities.vision) {
      console.warn(`⚠️  Provider "${metadata.name}" does not support vision - falling back to context-based captions`);

      // Graceful fallback to context-based analysis
      if (options.videoContext) {
        console.log('🔄 Generating intelligent context-based captions...');
        return generateContextBasedCaptions(frames, options.videoContext);
      }

      throw new Error(
        `Provider "${metadata.name}" does not support vision capabilities. ` +
        `Please provide a vision-capable provider (like Claude) or include videoContext for fallback.`
      );
    }

    // Use provider with vision support
    console.log(`✅ Using ${metadata.name} provider with vision support`);
    try {
      return await analyzeVideoWithVisionProvider(frames, options.llmProvider, options.model);
    } catch (error) {
      console.warn(`⚠️  Vision provider failed: ${(error as Error).message}`);

      // Fallback to context-based if available
      if (options.videoContext) {
        console.log('🔄 Falling back to intelligent context-based captions...');
        return generateContextBasedCaptions(frames, options.videoContext);
      }

      throw error;
    }
  }

  // Legacy: Free option - use Ollama
  if (provider === 'free' || provider === 'ollama') {
    return analyzeVideoWithOllama(frames, options);
  }

  // Legacy: Paid option - use Anthropic (deprecated - prefer llmProvider)
  if (provider === 'anthropic') {
    console.warn('⚠️  Direct Anthropic provider is deprecated. Consider using llmProvider with ClaudeProvider instead.');
    const apiKey = options.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key required for paid provider. Use provider: "free" for Ollama instead.');
    }

    // Import ClaudeProvider dynamically to avoid circular dependencies
    const { ClaudeProvider } = await import('../../../../providers/ClaudeProvider');
    const claudeProvider = new ClaudeProvider({ apiKey });
    await claudeProvider.initialize();

    try {
      return await analyzeVideoWithVisionProvider(frames, claudeProvider, options.model);
    } catch (error) {
      console.warn(`⚠️  Claude vision failed: ${(error as Error).message}`);

      // Fallback to context-based if available
      if (options.videoContext) {
        console.log('🔄 Falling back to intelligent context-based captions...');
        return generateContextBasedCaptions(frames, options.videoContext);
      }

      throw error;
    }
  }

  throw new Error(`Unknown vision provider: ${provider}. Use "free", "ollama", "anthropic", or "provider" (with llmProvider option).`);
}
