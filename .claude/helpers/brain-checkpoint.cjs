#!/usr/bin/env node
/**
 * Brain Checkpoint Helper
 *
 * Automatic brain export/verify for session hooks.
 *
 * Usage:
 *   node brain-checkpoint.cjs export   # Export brain to aqe.rvf (session-end)
 *   node brain-checkpoint.cjs verify   # Verify aqe.rvf exists and is recent (session-start)
 *   node brain-checkpoint.cjs info     # Show aqe.rvf info
 *
 * Called from .claude/settings.json Stop and SessionStart hooks.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const AQE_DIR = path.join(process.cwd(), '.agentic-qe');
const RVF_PATH = path.join(AQE_DIR, 'aqe.rvf');
const DB_PATH = path.join(AQE_DIR, 'memory.db');
const CLI = path.join(process.cwd(), 'dist', 'cli', 'bundle.js');
const MAX_AGE_HOURS = 24;

function log(msg) {
  process.stderr.write(`[brain-checkpoint] ${msg}\n`);
}

function exportBrain() {
  if (!fs.existsSync(DB_PATH)) {
    log('No memory.db found, skipping export');
    return { exported: false, reason: 'no-db' };
  }

  if (!fs.existsSync(CLI)) {
    log('CLI bundle not found, skipping export');
    return { exported: false, reason: 'no-cli' };
  }

  try {
    // Remove existing to avoid LockHeld errors
    if (fs.existsSync(RVF_PATH)) {
      fs.unlinkSync(RVF_PATH);
    }
    const idmap = `${RVF_PATH}.idmap.json`;
    if (fs.existsSync(idmap)) {
      fs.unlinkSync(idmap);
    }

    const result = execSync(
      `node "${CLI}" brain export -o "${RVF_PATH}" --format rvf 2>&1`,
      { timeout: 60000, encoding: 'utf-8' }
    );

    const sizeMatch = result.match(/RVF Size:\s+(.+)/);
    const patternsMatch = result.match(/Patterns:\s+(\d+)/);
    const size = sizeMatch ? sizeMatch[1].trim() : 'unknown';
    const patterns = patternsMatch ? patternsMatch[1] : '0';

    log(`Exported ${patterns} patterns (${size}) to aqe.rvf`);
    return { exported: true, patterns: parseInt(patterns), size };
  } catch (e) {
    log(`Export failed: ${e.message}`);
    return { exported: false, reason: e.message };
  }
}

function verifyBrain() {
  if (!fs.existsSync(RVF_PATH)) {
    log('No aqe.rvf found — brain checkpoint missing');
    return { valid: false, reason: 'missing' };
  }

  const stat = fs.statSync(RVF_PATH);
  const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);

  if (stat.size < 1024) {
    log('aqe.rvf is too small — likely corrupt');
    return { valid: false, reason: 'too-small', sizeBytes: stat.size };
  }

  if (ageHours > MAX_AGE_HOURS) {
    log(`aqe.rvf is ${ageHours.toFixed(1)}h old — consider re-exporting`);
    return { valid: true, stale: true, ageHours: Math.round(ageHours) };
  }

  log(`aqe.rvf OK (${(stat.size / 1024 / 1024).toFixed(1)} MB, ${ageHours.toFixed(1)}h old)`);
  return { valid: true, stale: false, ageHours: Math.round(ageHours), sizeBytes: stat.size };
}

function infoBrain() {
  if (!fs.existsSync(RVF_PATH)) {
    log('No aqe.rvf found');
    return { exists: false };
  }

  if (!fs.existsSync(CLI)) {
    const stat = fs.statSync(RVF_PATH);
    return { exists: true, sizeBytes: stat.size, modified: stat.mtime.toISOString() };
  }

  try {
    const result = execSync(
      `node "${CLI}" brain info -i "${RVF_PATH}" 2>&1`,
      { timeout: 15000, encoding: 'utf-8' }
    );
    return { exists: true, info: result.trim() };
  } catch (e) {
    return { exists: true, error: e.message };
  }
}

// Main
const command = process.argv[2] || 'verify';
let result;

switch (command) {
  case 'export':
    result = exportBrain();
    break;
  case 'verify':
    result = verifyBrain();
    break;
  case 'info':
    result = infoBrain();
    break;
  default:
    log(`Unknown command: ${command}`);
    process.exit(1);
}

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(result));
}
