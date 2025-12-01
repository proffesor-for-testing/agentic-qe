#!/usr/bin/env node
/**
 * Testability Scorer - HTML Report Generator
 *
 * Generates professional HTML reports with Chart.js visualizations
 * matching the style from https://github.com/fndlalit/testability-scorer
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let reportData = args[0] ? JSON.parse(fs.readFileSync(args[0], 'utf8')) : null;

if (!reportData) {
  console.error('Usage: node generate-html-report.js <results.json>');
  process.exit(1);
}

/**
 * Normalize report data format
 * Handles both legacy format (overall/principles) and new format (overallScore/categories)
 */
function normalizeReportData(data) {
  const normalized = { ...data };
  
  // Normalize overall score
  if (data.overallScore !== undefined && data.overall === undefined) {
    normalized.overall = data.overallScore;
  }
  
  // Normalize principles/categories
  if (data.categories && !data.principles) {
    normalized.principles = data.categories;
  }
  
  // Ensure timestamp exists
  if (!normalized.timestamp) {
    normalized.timestamp = data.metadata?.assessmentDate || new Date().toISOString();
  }
  
  // Normalize recommendations to ensure all have required fields
  if (Array.isArray(normalized.recommendations)) {
    normalized.recommendations = normalized.recommendations.map((rec, index) => {
      // If recommendation is just a string, convert to object
      if (typeof rec === 'string') {
        return {
          principle: 'General',
          recommendation: rec,
          severity: index < 3 ? 'critical' : index < 6 ? 'high' : 'medium',
          impact: Math.max(1, 5 - Math.floor(index / 3)),
          effort: 'Medium'
        };
      }
      
      // Ensure all required fields exist
      return {
        principle: rec.principle || 'General',
        recommendation: rec.recommendation || rec.text || 'No description provided',
        severity: rec.severity || 'medium',
        impact: rec.impact !== undefined ? rec.impact : 3,
        effort: rec.effort || 'Medium'
      };
    });
  }
  
  return normalized;
}

// Normalize the data to handle different formats
reportData = normalizeReportData(reportData);

/**
 * Get color for grade
 */
function getGradeColor(score) {
  if (score >= 90) return '#28a745'; // Green (A)
  if (score >= 80) return '#20c997'; // Teal (B)
  if (score >= 70) return '#ffc107'; // Yellow (C)
  if (score >= 60) return '#fd7e14'; // Orange (D)
  return '#dc3545'; // Red (F)
}

/**
 * Get letter grade
 */
function getLetterGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Format principle name
 */
function formatPrincipleName(name) {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Generate HTML report
 */
function generateHTML(data) {
  const timestamp = new Date(data.timestamp).toLocaleString();
  const overall = data.overall || 0;
  const grade = getLetterGrade(overall);
  const gradeColor = getGradeColor(overall);

  const principles = data.principles || {};
  const recommendations = data.recommendations || [];
  const metadata = data.metadata || {};

  // Prepare chart data
  const principleNames = Object.keys(principles).map(formatPrincipleName);
  const principleScores = Object.values(principles).map(p => p.score || p);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Testability Assessment Report - ${overall}/100 (${grade})</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f7fa;
      padding: 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }

    h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
      font-weight: 700;
    }

    .subtitle {
      font-size: 1.1em;
      opacity: 0.9;
    }

    .overall-score {
      background: white;
      margin: -30px 40px 0;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      text-align: center;
      position: relative;
    }

    .score-display {
      font-size: 5em;
      font-weight: 700;
      color: ${gradeColor};
      line-height: 1;
    }

    .grade-badge {
      display: inline-block;
      background: ${gradeColor};
      color: white;
      padding: 8px 20px;
      border-radius: 20px;
      font-size: 1.5em;
      font-weight: 700;
      margin-top: 10px;
    }

    .metadata {
      display: flex;
      justify-content: space-around;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px solid #f0f0f0;
      font-size: 0.9em;
      color: #666;
    }

    .metadata-item {
      text-align: center;
    }

    .metadata-label {
      font-weight: 600;
      color: #333;
      display: block;
      margin-bottom: 5px;
    }

    .content {
      padding: 40px;
    }

    .section {
      margin-bottom: 40px;
    }

    h2 {
      font-size: 1.8em;
      margin-bottom: 20px;
      color: #2c3e50;
      border-bottom: 3px solid #667eea;
      padding-bottom: 10px;
    }

    .chart-container {
      max-width: 600px;
      margin: 0 auto 40px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .principles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-top: 30px;
    }

    .principle-card {
      background: #fff;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      transition: all 0.3s ease;
    }

    .principle-card:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      transform: translateY(-2px);
    }

    .principle-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }

    .principle-name {
      font-size: 1.1em;
      font-weight: 600;
      color: #2c3e50;
    }

    .principle-score {
      font-size: 1.8em;
      font-weight: 700;
    }

    .principle-grade {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      color: white;
      font-weight: 600;
      font-size: 0.9em;
      margin-left: 8px;
    }

    .progress-bar {
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
      margin: 10px 0;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      border-radius: 4px;
      transition: width 1s ease;
    }

    .recommendations {
      margin-top: 30px;
    }

    .recommendation-card {
      background: #fff;
      border-left: 4px solid #667eea;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .recommendation-card.critical {
      border-left-color: #dc3545;
      background: #fff5f5;
    }

    .recommendation-card.high {
      border-left-color: #fd7e14;
      background: #fff8f0;
    }

    .recommendation-card.medium {
      border-left-color: #ffc107;
      background: #fffbf0;
    }

    .recommendation-card.low {
      border-left-color: #20c997;
      background: #f0fdf9;
    }

    .recommendation-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .recommendation-title {
      font-size: 1.2em;
      font-weight: 600;
      color: #2c3e50;
    }

    .severity-badge {
      padding: 4px 12px;
      border-radius: 4px;
      color: white;
      font-weight: 600;
      font-size: 0.85em;
      text-transform: uppercase;
    }

    .severity-critical { background: #dc3545; }
    .severity-high { background: #fd7e14; }
    .severity-medium { background: #ffc107; color: #333; }
    .severity-low { background: #20c997; }

    .recommendation-text {
      color: #555;
      line-height: 1.8;
      margin-top: 10px;
    }

    .recommendation-impact {
      margin-top: 15px;
      padding: 10px;
      background: rgba(102, 126, 234, 0.1);
      border-radius: 4px;
      font-size: 0.9em;
    }

    .impact-label {
      font-weight: 600;
      color: #667eea;
    }

    .grade-distribution {
      display: flex;
      justify-content: space-around;
      margin: 30px 0;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .grade-item {
      text-align: center;
    }

    .grade-count {
      font-size: 2em;
      font-weight: 700;
      display: block;
      margin-bottom: 5px;
    }

    .grade-label {
      color: #666;
      font-size: 0.9em;
    }

    footer {
      background: #2c3e50;
      color: white;
      padding: 30px;
      text-align: center;
      margin-top: 40px;
    }

    .footer-links {
      margin-top: 15px;
    }

    .footer-links a {
      color: #667eea;
      text-decoration: none;
      margin: 0 15px;
    }

    .footer-links a:hover {
      text-decoration: underline;
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .container {
        box-shadow: none;
      }

      .principle-card:hover {
        transform: none;
      }
    }

    .emoji {
      font-size: 1.2em;
      margin-right: 8px;
    }

    .timestamp {
      color: #666;
      font-size: 0.9em;
      margin-top: 10px;
    }

    .status-icon {
      font-size: 1.5em;
      margin-left: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🎯 Testability Assessment Report</h1>
      <p class="subtitle">Comprehensive analysis using 10 principles of intrinsic testability</p>
    </header>

    <div class="overall-score">
      <div>
        <span class="score-display">${overall}<span style="font-size: 0.5em; color: #999;">/100</span></span>
        <div class="grade-badge">${grade}</div>
      </div>

      <div class="metadata">
        <div class="metadata-item">
          <span class="metadata-label">📅 Date</span>
          ${timestamp}
        </div>
        <div class="metadata-item">
          <span class="metadata-label">🌐 URL</span>
          ${metadata.url || 'N/A'}
        </div>
        <div class="metadata-item">
          <span class="metadata-label">🖥️ Browser</span>
          ${metadata.browser || 'Chromium'}
        </div>
        <div class="metadata-item">
          <span class="metadata-label">⏱️ Duration</span>
          ${metadata.duration ? Math.round(metadata.duration / 1000) + 's' : 'N/A'}
        </div>
      </div>
    </div>

    <div class="content">
      <!-- Grade Distribution -->
      <section class="section">
        <h2>📊 Grade Distribution</h2>
        <div class="grade-distribution">
          ${['A', 'B', 'C', 'D', 'F'].map(g => {
            const count = Object.values(principles).filter(p => {
              const s = p.score || p;
              return getLetterGrade(s) === g;
            }).length;
            return `
              <div class="grade-item">
                <span class="grade-count" style="color: ${getGradeColor(g === 'A' ? 95 : g === 'B' ? 85 : g === 'C' ? 75 : g === 'D' ? 65 : 55)}">${count}</span>
                <span class="grade-label">Grade ${g}</span>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <!-- Radar Chart -->
      <section class="section">
        <h2>📈 Testability Radar</h2>
        <div class="chart-container">
          <canvas id="radarChart"></canvas>
        </div>
      </section>

      <!-- Principle Scores -->
      <section class="section">
        <h2>🎯 Principle Scores</h2>
        <div class="principles-grid">
          ${Object.entries(principles).map(([key, value]) => {
            const score = value.score || value;
            const grade = getLetterGrade(score);
            const color = getGradeColor(score);
            const statusIcon = score >= 70 ? '✓' : score >= 50 ? '⚠️' : '✗';

            return `
              <div class="principle-card">
                <div class="principle-header">
                  <div class="principle-name">${formatPrincipleName(key)}</div>
                  <span class="status-icon">${statusIcon}</span>
                </div>
                <div>
                  <span class="principle-score" style="color: ${color}">${score}</span>
                  <span class="principle-grade" style="background: ${color}">${grade}</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${score}%; background: ${color}"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <!-- Recommendations -->
      ${recommendations.length > 0 ? `
      <section class="section recommendations">
        <h2>💡 AI-Powered Recommendations</h2>
        <p style="color: #666; margin-bottom: 20px;">
          Top ${recommendations.length} recommendations prioritized by impact and effort
        </p>

        ${recommendations.map((rec, index) => `
          <div class="recommendation-card ${rec.severity}">
            <div class="recommendation-header">
              <span class="recommendation-title">
                <span class="emoji">${index + 1 <= 3 ? '🔴' : index + 1 <= 5 ? '🟡' : '🟢'}</span>
                ${rec.principle}
              </span>
              <span class="severity-badge severity-${rec.severity}">${rec.severity}</span>
            </div>
            <div class="recommendation-text">
              ${rec.recommendation}
            </div>
            ${rec.impact ? `
              <div class="recommendation-impact">
                <span class="impact-label">Expected Impact:</span>
                +${rec.impact} points improvement
              </div>
            ` : ''}
            ${rec.effort ? `
              <div style="margin-top: 10px; color: #666; font-size: 0.9em;">
                <strong>Effort:</strong> ${rec.effort}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </section>
      ` : ''}

      <!-- Summary -->
      <section class="section">
        <h2>📝 Summary</h2>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; line-height: 1.8;">
          ${overall >= 90 ? `
            <p><strong style="color: #28a745;">Excellent testability!</strong> Your application demonstrates outstanding testability across all principles. Continue maintaining these high standards.</p>
          ` : overall >= 70 ? `
            <p><strong style="color: #ffc107;">Good testability with room for improvement.</strong> Your application has solid fundamentals but could benefit from addressing the recommendations above.</p>
          ` : overall >= 50 ? `
            <p><strong style="color: #fd7e14;">Acceptable testability but needs work.</strong> Focus on critical and high-priority recommendations to significantly improve test automation capabilities.</p>
          ` : `
            <p><strong style="color: #dc3545;">Poor testability - urgent improvements needed.</strong> Implementing the critical recommendations will dramatically improve your ability to test this application effectively.</p>
          `}

          <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <strong>Next Steps:</strong>
            <ol style="margin-top: 10px; padding-left: 20px;">
              <li>Review and prioritize the recommendations above</li>
              <li>Implement critical and high-priority fixes first</li>
              <li>Re-run assessment after improvements</li>
              <li>Track progress over time</li>
            </ol>
          </div>
        </div>
      </section>
    </div>

    <footer>
      <p><strong>Generated by Testability Scorer</strong></p>
      <p style="margin-top: 10px; font-size: 0.9em; opacity: 0.8;">
        Based on 10 Principles of Intrinsic Testability
      </p>
      <div class="footer-links">
        <a href="https://github.com/fndlalit/testability-scorer" target="_blank">Original Framework</a>
        <a href="https://playwright.dev/" target="_blank">Powered by Playwright</a>
        <a href="https://github.com/ruvnet/claude-flow" target="_blank">Agentic QE Fleet</a>
      </div>
      <p class="timestamp" style="margin-top: 20px;">
        Report generated: ${new Date().toLocaleString()}
      </p>
    </footer>
  </div>

  <script>
    // Radar Chart
    const ctx = document.getElementById('radarChart').getContext('2d');
    new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ${JSON.stringify(principleNames)},
        datasets: [{
          label: 'Testability Score',
          data: ${JSON.stringify(principleScores)},
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.2)',
          borderWidth: 3,
          pointBackgroundColor: '#667eea',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          r: {
            min: 0,
            max: 100,
            beginAtZero: true,
            ticks: {
              stepSize: 20,
              font: {
                size: 12
              }
            },
            pointLabels: {
              font: {
                size: 13,
                weight: '600'
              }
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.parsed.r + '/100 (' + getLetterGrade(context.parsed.r) + ')';
              }
            }
          }
        }
      }
    });

    function getLetterGrade(score) {
      if (score >= 90) return 'A';
      if (score >= 80) return 'B';
      if (score >= 70) return 'C';
      if (score >= 60) return 'D';
      return 'F';
    }

    // Animate progress bars on load
    window.addEventListener('load', () => {
      document.querySelectorAll('.progress-fill').forEach(bar => {
        const width = bar.style.width;
        bar.style.width = '0%';
        setTimeout(() => {
          bar.style.width = width;
        }, 100);
      });
    });
  </script>
</body>
</html>`;
}

// Generate and save HTML report
const html = generateHTML(reportData);
const outputPath = args[1] || `tests/reports/testability-report-${Date.now()}.html`;

// Ensure directory exists
const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(outputPath, html);

console.log(`✓ HTML report generated: ${outputPath}`);
console.log(`✓ Overall score: ${reportData.overall}/100 (${getLetterGrade(reportData.overall)})`);

// Auto-open by default (disable with AUTO_OPEN=false)
if (process.env.AUTO_OPEN !== 'false') {
  console.log(`\n🌐 Starting HTTP server...`);

  const { exec } = require('child_process');
  const http = require('http');
  const fs = require('fs');
  const absolutePath = path.resolve(outputPath);
  const reportDir = path.dirname(absolutePath);
  const reportFile = path.basename(absolutePath);

  // Find a free port starting from 8080
  const findFreePort = (startPort = 8080) => {
    return new Promise((resolve) => {
      const server = http.createServer();
      server.listen(startPort, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      }).on('error', () => {
        resolve(findFreePort(startPort + 1));
      });
    });
  };

  findFreePort().then(port => {
    // Create Node.js HTTP server (more reliable than Python in containers)
    const server = http.createServer((_req, res) => {
      const filePath = path.join(reportDir, reportFile);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading report');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data);
        }
      });
    });

    server.listen(port, '0.0.0.0', () => {
      const reportUrl = `http://localhost:${port}`;

      // Display prominent, clickable URL
      console.log(`\n┌─────────────────────────────────────────────────────────────┐`);
      console.log(`│                                                             │`);
      console.log(`│  ✅ HTTP Server Running on Port ${port}                       │`);
      console.log(`│                                                             │`);
      console.log(`│  📊 CLICK HERE TO OPEN REPORT:                              │`);
      console.log(`│                                                             │`);
      console.log(`│     ${reportUrl}                              │`);
      console.log(`│                                                             │`);
      console.log(`│  (VS Code will forward this port automatically)            │`);
      console.log(`│                                                             │`);
      console.log(`└─────────────────────────────────────────────────────────────┘\n`);
      console.log(`💡 Server will keep running until you stop it (Ctrl+C)\n`);
    });

    server.on('error', (err) => {
      console.error(`❌ Server error: ${err.message}`);
      console.log(`\n📄 Report saved to: ${absolutePath}`);
    });
  }).catch(err => {
    console.error(`❌ Failed to start server: ${err.message}`);
    console.log(`\n📄 Report saved to: ${absolutePath}`);
  });
} else {
  console.log(`\nView report:`);
  console.log(`  google-chrome ${outputPath}`);
  console.log(`  # or`);
  console.log(`  open ${outputPath}`);
}

// Don't exit immediately - let server keep running
if (process.env.AUTO_OPEN !== 'false') {
  console.log(`\n💡 Tip: Set AUTO_OPEN=false to disable automatic browser opening`);
  console.log(`💡 Server is running in background. Kill process to stop.`);
}
