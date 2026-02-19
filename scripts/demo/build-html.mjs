#!/usr/bin/env node
// Builds a self-contained HTML file with embedded asciinema player + cast data

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const castData = readFileSync(resolve(__dirname, 'aqe-demo.cast'), 'utf-8');
const outputPath = resolve(__dirname, 'aqe-demo.html');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AQE Framework - AI-Powered Defect Intelligence Demo</title>
  <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/asciinema-player@3.9.0/dist/bundle/asciinema-player.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #0a0e1a;
      color: #e0e0e0;
      font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
    }

    /* ── Header ── */
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      border-bottom: 1px solid #1e3a5f;
      padding: 24px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #06b6d4, #3b82f6);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 700;
      color: white;
    }

    .header-title {
      font-size: 20px;
      font-weight: 700;
      color: #f1f5f9;
    }

    .header-subtitle {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 2px;
    }

    .badge {
      background: linear-gradient(135deg, #06b6d4, #3b82f6);
      color: white;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    /* ── Main Layout ── */
    .main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 24px;
    }

    /* ── Info Cards ── */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }

    .info-card {
      background: #111827;
      border: 1px solid #1e3a5f;
      border-radius: 12px;
      padding: 20px;
      transition: border-color 0.2s;
    }

    .info-card:hover {
      border-color: #3b82f6;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }

    .card-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }

    .card-icon.quality { background: rgba(34, 197, 94, 0.15); }
    .card-icon.duplicate { background: rgba(234, 179, 8, 0.15); }
    .card-icon.rca { background: rgba(168, 85, 247, 0.15); }

    .card-title {
      font-size: 15px;
      font-weight: 600;
      color: #e2e8f0;
    }

    .card-desc {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
    }

    .card-tag {
      display: inline-block;
      margin-top: 10px;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }

    .tag-green { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
    .tag-yellow { background: rgba(234, 179, 8, 0.15); color: #facc15; }
    .tag-purple { background: rgba(168, 85, 247, 0.15); color: #c084fc; }

    /* ── Player Section ── */
    .player-section {
      background: #111827;
      border: 1px solid #1e3a5f;
      border-radius: 16px;
      overflow: hidden;
      margin-bottom: 32px;
    }

    .player-toolbar {
      background: #1e293b;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #1e3a5f;
    }

    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .dot-red { background: #ef4444; }
    .dot-yellow { background: #eab308; }
    .dot-green { background: #22c55e; }

    .toolbar-title {
      font-size: 13px;
      color: #94a3b8;
      margin-left: 12px;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    }

    .toolbar-right {
      font-size: 12px;
      color: #64748b;
    }

    #player-container {
      padding: 8px;
    }

    /* Override asciinema player styles */
    .ap-wrapper .ap-player {
      border-radius: 8px;
    }

    /* ── Chapters ── */
    .chapters {
      margin-bottom: 32px;
    }

    .chapters-title {
      font-size: 16px;
      font-weight: 600;
      color: #e2e8f0;
      margin-bottom: 16px;
    }

    .chapter-list {
      display: flex;
      gap: 12px;
    }

    .chapter-btn {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 12px 16px;
      cursor: pointer;
      transition: all 0.2s;
      flex: 1;
    }

    .chapter-btn:hover {
      border-color: #3b82f6;
      background: #1e3a5f;
    }

    .chapter-time {
      font-size: 11px;
      color: #06b6d4;
      font-weight: 600;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .chapter-name {
      font-size: 13px;
      color: #e2e8f0;
      margin-top: 4px;
      font-weight: 500;
    }

    .chapter-detail {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }

    /* ── Tech Footer ── */
    .tech-footer {
      background: #111827;
      border: 1px solid #1e3a5f;
      border-radius: 12px;
      padding: 24px;
    }

    .tech-title {
      font-size: 14px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }

    .tech-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
    }

    .tech-item {
      text-align: center;
      padding: 12px;
      background: #0f172a;
      border-radius: 8px;
    }

    .tech-item-label {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 4px;
    }

    .tech-item-value {
      font-size: 13px;
      color: #06b6d4;
      font-weight: 600;
    }

    /* ── Footer ── */
    .footer {
      text-align: center;
      padding: 24px;
      color: #475569;
      font-size: 12px;
    }

    .footer a {
      color: #3b82f6;
      text-decoration: none;
    }

    @media (max-width: 768px) {
      .info-grid { grid-template-columns: 1fr; }
      .tech-grid { grid-template-columns: repeat(2, 1fr); }
      .chapter-list { flex-direction: column; }
      .header { flex-direction: column; gap: 12px; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="header-left">
      <div class="logo">AQ</div>
      <div>
        <div class="header-title">AI-Powered Defect Intelligence</div>
        <div class="header-subtitle">Agentic Quality Engineering (AQE) Framework</div>
      </div>
    </div>
    <div class="badge">AUTOMOTIVE DEMO</div>
  </div>

  <div class="main">

    <div class="info-grid">
      <div class="info-card">
        <div class="card-header">
          <div class="card-icon quality">&#x2713;</div>
          <div class="card-title">Defect Quality Check</div>
        </div>
        <div class="card-desc">
          AI validates every defect against configurable guidelines, ensuring mandatory fields
          (steps to reproduce, expected vs actual, environment) are populated before submission.
        </div>
        <span class="card-tag tag-green">Configurable Rules + Quality Scoring</span>
      </div>

      <div class="info-card">
        <div class="card-header">
          <div class="card-icon duplicate">&#x2261;</div>
          <div class="card-title">Duplicate Detection</div>
        </div>
        <div class="card-desc">
          Semantic vector embeddings catch duplicates that keyword search misses.
          "System hangs" matches "route guidance freezes" at 94% similarity.
        </div>
        <span class="card-tag tag-yellow">AI Semantic Matching</span>
      </div>

      <div class="info-card">
        <div class="card-header">
          <div class="card-icon rca">&#x26A0;</div>
          <div class="card-title">Root Cause Analysis</div>
        </div>
        <div class="card-desc">
          Multi-method RCA (Five-Whys, Fishbone, Fault Tree) analyzes defect clusters
          and historical patterns to identify probable root causes with 92% confidence.
        </div>
        <span class="card-tag tag-purple">Multi-Method Analysis + Pattern Learning</span>
      </div>
    </div>

    <div class="player-section">
      <div class="player-toolbar">
        <div class="toolbar-left">
          <div class="dot dot-red"></div>
          <div class="dot dot-yellow"></div>
          <div class="dot dot-green"></div>
          <span class="toolbar-title">aqe-demo &mdash; Agentic Quality Engineering</span>
        </div>
        <div class="toolbar-right">Automotive Domain &bull; BMW / Mercedes-Benz</div>
      </div>
      <div id="player-container"></div>
    </div>

    <div class="chapters">
      <div class="chapters-title">Chapters</div>
      <div class="chapter-list">
        <div class="chapter-btn" onclick="seekTo(0)">
          <div class="chapter-time">0:00</div>
          <div class="chapter-name">Intro</div>
          <div class="chapter-detail">Framework overview &amp; capabilities</div>
        </div>
        <div class="chapter-btn" onclick="seekTo(8)">
          <div class="chapter-time">0:08</div>
          <div class="chapter-name">1. Quality Check</div>
          <div class="chapter-detail">Mandatory field validation (pass/fail)</div>
        </div>
        <div class="chapter-btn" onclick="seekTo(32)">
          <div class="chapter-time">0:32</div>
          <div class="chapter-name">2. Duplicate Detection</div>
          <div class="chapter-detail">Semantic similarity matching</div>
        </div>
        <div class="chapter-btn" onclick="seekTo(50)">
          <div class="chapter-time">0:50</div>
          <div class="chapter-name">3. Root Cause Analysis</div>
          <div class="chapter-detail">Five-Whys + Fishbone + Report</div>
        </div>
      </div>
    </div>

    <div class="tech-footer">
      <div class="tech-title">Why AQE</div>
      <div class="tech-grid">
        <div class="tech-item">
          <div class="tech-item-label">Semantic Understanding</div>
          <div class="tech-item-value">Beyond Keywords</div>
        </div>
        <div class="tech-item">
          <div class="tech-item-label">Pattern Learning</div>
          <div class="tech-item-value">Gets Smarter Over Time</div>
        </div>
        <div class="tech-item">
          <div class="tech-item-label">Root Cause</div>
          <div class="tech-item-value">Multi-Method Analysis</div>
        </div>
        <div class="tech-item">
          <div class="tech-item-label">Quality Gates</div>
          <div class="tech-item-value">Your Rules, Enforced</div>
        </div>
        <div class="tech-item">
          <div class="tech-item-label">Integration</div>
          <div class="tech-item-value">Plugs Into Your Stack</div>
        </div>
      </div>
    </div>

  </div>

  <div class="footer">
    Powered by <strong>Agentic Quality Engineering (AQE)</strong> Framework &bull;
    <a href="https://agentic-qe.dev" target="_blank">agentic-qe.dev</a>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/asciinema-player@3.9.0/dist/bundle/asciinema-player.min.js"></script>
  <script>
    // Embedded cast data
    const castContent = ${JSON.stringify(castData)};

    // Create player
    let player;
    function initPlayer() {
      const blob = new Blob([castContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);

      player = AsciinemaPlayer.create(url, document.getElementById('player-container'), {
        cols: 100,
        rows: 40,
        autoPlay: false,
        loop: false,
        speed: 1,
        theme: 'dracula',
        fit: 'width',
        fontSize: '14px',
        terminalLineHeight: 1.2,
        idleTimeLimit: 3
      });
    }

    function seekTo(seconds) {
      if (player) {
        player.seek(seconds);
        player.play();
      }
    }

    initPlayer();
  </script>
</body>
</html>`;

writeFileSync(outputPath, html, 'utf-8');
console.log(`HTML demo written to: ${outputPath}`);
console.log(`Size: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
