# A11y-Ally Agent Enhancement Plan

## Overview

Rebuilding the qe-a11y-ally agent to provide context-specific, copy-paste ready accessibility remediations with multi-provider vision cascade.

## Changes Completed

### 1. Agent Definition Updated ✅

**File**: `.claude/agents/qe-a11y-ally.md`

**Changes**:
- Added mandatory @accessibility-testing skill invocation as Step 1
- Updated default_to_action section with 4-step workflow
- Enhanced video analysis section with multi-provider cascade (OpenAI → Anthropic → Ollama → moondream → context)
- Added requirement for copy-paste ready code snippets
- Removed manual provider selection (now auto-detects)

**New Workflow**:
```
Step 1: Skill("accessibility-testing") → Load WCAG 2.2 principles
Step 2: Run comprehensive scan with auto-detected vision provider
Step 3: Generate context-specific remediations (MULTIPLE options)
Step 4: Enhance report with frame-by-frame descriptions, WebVTT, ARIA code
```

### 2. Vision Options Interface Updated ✅

**File**: `src/mcp/tools/qe/accessibility/video-vision-analyzer.ts`

**Changes**:
- Added OpenAI support: `openaiApiKey` option
- Added moondream support: `moondreamBaseUrl` option
- Changed default provider from `'free'` to `'auto'` (cascade mode)
- Added `enableCascade` option (default: true)
- Updated `VisionProvider` type to include all 6 providers

## Changes Required

###  3. Implement Vision Provider Cascade 🔧

**File**: `src/mcp/tools/qe/accessibility/video-vision-analyzer.ts`

**Need to add**:

1. `analyzeVideoWithOpenAI()` function
2. `analyzeVideoWithMoondream()` function
3. `checkProviderAvailability()` function
4. Enhanced `analyzeVideoWithVision()` with cascade logic

**Cascade Priority**:
```
1. OpenAI GPT-4 Vision (if OPENAI_API_KEY set)
2. Anthropic Claude 3.5 Sonnet (if ANTHROPIC_API_KEY set)
3. Ollama llava (if localhost:11434 responds)
4. Ollama moondream (if moondream model installed)
5. Context-based (always available)
```

### 4. Context-Specific ARIA Remediation Generator 🔧

**New File**: `src/mcp/tools/qe/accessibility/aria-remediation-generator.ts`

**Purpose**: Generate intelligent, context-aware ARIA labels based on:
- Element type (button, link, input, etc.)
- Surrounding DOM (parent elements, nearby headings, siblings)
- User flow context (navigation, form, modal, etc.)
- Existing attributes (class names, data attributes, etc.)

**Example Output**:
```typescript
{
  current: '<button class="close-btn"><svg icon="x" /></button>',
  recommended: '<button class="close-btn" aria-label="Close navigation menu">',
  alternative: '<button class="close-btn"><span class="sr-only">Close</span>',
  rationale: 'Button in navigation header, closes mobile menu based on class name and parent context',
  confidence: 0.92,
  wcagCriteria: ['4.1.2', '2.4.4']
}
```

### 5. Frame-by-Frame Video Description Generator 🔧

**Enhancement to**: `src/mcp/tools/qe/accessibility/video-vision-analyzer.ts`

**Already exists** but needs enhancement for:
- Audio transcription (not just visual)
- Speaker identification
- On-screen text OCR accuracy
- Emotional tone description
- Camera movement description

### 6. Audio CC Generation 🔧

**New File**: `src/mcp/tools/qe/accessibility/audio-cc-generator.ts`

**Purpose**: Generate captions for audio-only content (podcasts, interviews)

**Uses**:
- OpenAI Whisper API (if OPENAI_API_KEY available)
- Ollama whisper model (if installed locally)
- Context-based fallback (topic + duration estimate)

**Output**: WebVTT file with speaker identification

### 7. Enhanced Markdown Report with Copy-Paste Snippets 🔧

**File**: `src/mcp/tools/qe/accessibility/markdown-report-generator.ts`

**Current**: Basic code examples
**Enhanced**: For EACH violation, provide:

```markdown
### Violation: Missing ARIA Label on Icon Button

**Current Code**:
```html
<button class="nav-toggle" onclick="toggleMenu()">
  <svg><use xlink:href="#icon-menu"></use></svg>
</button>
```

**Option 1: Semantic HTML (RECOMMENDED)**:
```html
<button class="nav-toggle"
        aria-label="Open main menu"
        aria-expanded="false"
        aria-controls="main-nav">
  <svg aria-hidden="true">
    <use xlink:href="#icon-menu"></use>
  </svg>
  <span class="visually-hidden">Menu</span>
</button>
```

**Option 2: If Button Text Not Visible**:
```html
<button class="nav-toggle"
        aria-label="Open main menu"
        aria-expanded="false">
  <svg aria-hidden="true">
    <use xlink:href="#icon-menu"></use>
  </svg>
</button>
```

**Why "Open main menu"?**
- Context: Button in header navigation
- Function: Opens mobile navigation overlay
- State: Uses aria-expanded to communicate open/closed
- Icon: Menu hamburger icon (decorative, hidden from screen readers)

**WCAG Success Criteria**:
- ✅ 4.1.2 Name, Role, Value (Level A)
- ✅ 2.4.4 Link Purpose (Level A)
- ✅ 2.1.1 Keyboard (Level A)

**Testing**:
```bash
# Screen reader test (macOS)
# VoiceOver should announce: "Open main menu, button, collapsed"
```

**Estimated Fix Time**: 15 minutes
**User Impact**: 15% (blind screen reader users)
**Legal Risk**: MEDIUM (ADA Section 508 non-compliance)
```

## Implementation Priority

1. **HIGH PRIORITY** (This Sprint):
   - ✅ Update agent definition
   - ✅ Update vision options interface
   - 🔧 Implement vision provider cascade with OpenAI/moondream
   - 🔧 Add context-specific ARIA remediation generator
   - 🔧 Update markdown report with copy-paste snippets

2. **MEDIUM PRIORITY** (Next Sprint):
   - 🔧 Frame-by-frame video enhancement (audio transcription)
   - 🔧 Audio CC generation (Whisper integration)
   - 🔧 Automated testing of remediation code

3. **LOW PRIORITY** (Future):
   - Auto-fix capabilities (one-click remediation)
   - Real-time video transcription
   - Interactive remediation wizard

## Testing Plan

1. **Unit Tests**:
   - Test vision provider cascade (mock each provider)
   - Test ARIA remediation accuracy (10 common patterns)
   - Test WebVTT generation format

2. **Integration Tests**:
   - Test full scan with sample e-commerce page (already done)
   - Test with teatimewithtesters.com (already done)
   - Test with various video providers

3. **Manual Validation**:
   - Screen reader testing (NVDA, JAWS, VoiceOver)
   - Keyboard navigation testing
   - Copy-paste remediation code and verify it works

## Success Metrics

- ✅ Agent ALWAYS invokes @accessibility-testing skill first
- 🎯 90%+ of remediation code works without modification
- 🎯 Context-specific ARIA labels have 85%+ developer acceptance rate
- 🎯 Vision cascade successfully falls back to available provider
- 🎯 All video violations include frame-by-frame descriptions
- 🎯 All remediations include MULTIPLE options (semantic HTML + ARIA)

## Blocked Items

**None currently** - All dependencies available

## Next Actions

1. Implement `analyzeVideoWithOpenAI()` using OpenAI SDK
2. Implement `analyzeVideoWithMoondream()` via Ollama API
3. Create `aria-remediation-generator.ts` with context analysis
4. Update `markdown-report-generator.ts` with enhanced code snippets
5. Add comprehensive test suite
6. Document new capabilities in agent README

---

**Status**: 🟡 In Progress (40% complete)
**ETA**: 6-8 hours remaining
**Blockers**: None
