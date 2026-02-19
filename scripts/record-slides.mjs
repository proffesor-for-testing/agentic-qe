#!/usr/bin/env node
/**
 * Record each animated slide from the QCSD teaser HTML as an MP4 video.
 * Uses Playwright for headless browser rendering + built-in video capture.
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const HTML_FILE = path.resolve('/workspaces/agentic-qe/Agentic QCSD/03 Reference Docs/agentic-qcsd-teaser_9.html');
const OUTPUT_DIR = path.resolve('/workspaces/agentic-qe/Agentic QCSD/03 Reference Docs/slide-videos');

// Slide names matching the section comments in the HTML
const SLIDE_NAMES = [
  '01-opening-hook',
  '02-problem-stats',
  '03-faster-horses',
  '04-introducing-qcsd',
  '05-framework-diagram',
  '06-award-credibility',
  '07-five-swarms',
  '08-feedback-loops',
  '09-architecture-engine',
  '10-the-outcome',
  '11-claude-flow-plugin',
  '12-credits',
  '13-cta-closing',
];

// Per-slide record duration in ms (based on cinema holdTimes + animation settle)
const SLIDE_DURATIONS = [
  8000,   // 01: Opening Hook — simple text reveal
  12000,  // 02: Problem Stats — quote + 3 data counters
  6000,   // 03: Faster Horses — bold text reveal
  8000,   // 04: Introducing QCSD — title + subtitle reveal
  15000,  // 05: Framework — diagram + cycle + counters
  10000,  // 06: Award Credibility — image + text
  14000,  // 07: Five Swarms — 5 pipeline rows + bees
  12000,  // 08: Feedback Loops — 4 cards reveal
  14000,  // 09: Architecture Engine — 6 engine cards
  10000,  // 10: The Outcome — 3 benefit cards
  12000,  // 11: Claude Flow Plugin — ecosystem cards
  10000,  // 12: Credits — images + text
  10000,  // 13: CTA — final dramatic text
];

const VIEWPORT = { width: 1920, height: 1080 };

async function recordSlide(browser, slideIndex) {
  const slideName = SLIDE_NAMES[slideIndex];
  const duration = SLIDE_DURATIONS[slideIndex];
  const webmDir = path.join(OUTPUT_DIR, 'webm-raw');
  fs.mkdirSync(webmDir, { recursive: true });

  console.log(`\n▶ Recording slide ${slideIndex + 1}/${SLIDE_NAMES.length}: ${slideName} (${duration / 1000}s)`);

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: {
      dir: webmDir,
      size: VIEWPORT,
    },
  });

  const page = await context.newPage();

  // Load the HTML file
  await page.goto(`file://${HTML_FILE}`, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for fonts to load
  await page.waitForTimeout(2000);

  // Inject script to isolate one section and trigger its animations
  await page.evaluate((idx) => {
    const sections = document.querySelectorAll('section');

    // Hide ALL sections first
    sections.forEach((s, i) => {
      if (i !== idx) {
        s.style.display = 'none';
      }
    });

    const target = sections[idx];
    if (!target) return;

    // Make the target section fill the viewport
    target.style.minHeight = '100vh';
    target.style.display = 'flex';
    target.style.flexDirection = 'column';
    target.style.justifyContent = 'center';
    target.style.alignItems = 'center';
    target.style.position = 'relative';

    // Scroll to it
    target.scrollIntoView({ behavior: 'instant' });

    // Force trigger all reveal animations in this section
    // Small stagger for visual effect
    const revealElements = target.querySelectorAll(
      '.reveal, .swarm-row, .loop-card, .engine-card, .stat, .qcsd-def'
    );
    revealElements.forEach((el, i) => {
      setTimeout(() => {
        el.classList.add('visible');
      }, i * 300);
    });

    // Trigger counters
    const counters = target.querySelectorAll('.counter');
    counters.forEach(el => {
      el.classList.add('counting');
    });

    // Trigger typewriter elements
    const typewriters = target.querySelectorAll('.typewriter-text');
    typewriters.forEach(el => {
      el.classList.add('typing');
      const container = el.closest('.typewriter-container');
      if (container) {
        container.style.opacity = '1';
        container.style.visibility = 'visible';
      }
    });

    // Trigger and-counting elements
    const andCounting = target.querySelector('.and-counting');
    if (andCounting) {
      setTimeout(() => andCounting.classList.add('visible'), 3000);
    }
  }, slideIndex);

  // Wait for the animation duration
  await page.waitForTimeout(duration);

  // Close context to finalize video
  const video = page.video();
  await page.close();
  await context.close();

  // Get the recorded webm path
  if (video) {
    const webmPath = await video.path();
    const mp4Path = path.join(OUTPUT_DIR, `${slideName}.mp4`);

    // Convert webm to mp4 using system ffmpeg
    try {
      execSync(
        `ffmpeg -y -i "${webmPath}" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -movflags +faststart "${mp4Path}"`,
        { stdio: 'pipe', timeout: 120000 }
      );
      console.log(`  ✓ Saved: ${slideName}.mp4`);
      // Clean up webm
      fs.unlinkSync(webmPath);
    } catch (err) {
      console.error(`  ✗ ffmpeg conversion failed for ${slideName}:`, err.stderr?.toString().split('\n').slice(-3).join('\n'));
      console.log(`  WebM saved at: ${webmPath}`);
    }
  }
}

function findFfmpeg() {
  // Playwright bundles ffmpeg — find it
  const playwrightCache = path.join(
    process.env.HOME || '/home/vscode',
    '.cache/ms-playwright'
  );
  const ffmpegDirs = fs.readdirSync(playwrightCache).filter(d => d.startsWith('ffmpeg'));
  if (ffmpegDirs.length > 0) {
    const ffmpegDir = path.join(playwrightCache, ffmpegDirs[ffmpegDirs.length - 1]);
    const candidates = ['ffmpeg-linux', 'ffmpeg'];
    for (const c of candidates) {
      const p = path.join(ffmpegDir, c);
      if (fs.existsSync(p)) return p;
    }
  }
  // Fallback to system ffmpeg
  return 'ffmpeg';
}

async function main() {
  console.log('═══ QCSD Slide Video Recorder ═══');
  console.log(`Slides: ${SLIDE_NAMES.length}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Resolution: ${VIEWPORT.width}x${VIEWPORT.height}`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Verify ffmpeg
  const ffmpegBin = findFfmpeg();
  try {
    execSync(`"${ffmpegBin}" -version`, { stdio: 'pipe' });
    console.log(`ffmpeg: ${ffmpegBin}`);
  } catch {
    console.error('ERROR: ffmpeg not found. Videos will be saved as WebM only.');
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  for (let i = 0; i < SLIDE_NAMES.length; i++) {
    await recordSlide(browser, i);
  }

  await browser.close();

  // Clean up empty webm dir
  const webmDir = path.join(OUTPUT_DIR, 'webm-raw');
  try {
    const remaining = fs.readdirSync(webmDir);
    if (remaining.length === 0) fs.rmdirSync(webmDir);
  } catch {}

  console.log('\n═══ Done ═══');
  console.log(`Videos saved to: ${OUTPUT_DIR}`);

  // List results
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.mp4'));
  console.log(`\n${files.length} MP4 files created:`);
  files.forEach(f => {
    const stat = fs.statSync(path.join(OUTPUT_DIR, f));
    console.log(`  ${f} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
