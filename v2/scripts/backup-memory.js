#!/usr/bin/env node
/**
 * Memory Database Backup Script
 *
 * Creates timestamped backups of memory.db to prevent data loss.
 * Automatically manages backup retention (keeps last 10 backups).
 *
 * Usage:
 *   node scripts/backup-memory.js              # Create backup
 *   node scripts/backup-memory.js --restore    # List available backups
 *   node scripts/backup-memory.js --restore <timestamp>  # Restore specific backup
 *
 * @version 1.0.0
 * @created 2025-12-29
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DB_PATH = path.join(process.cwd(), '.agentic-qe', 'memory.db');
const BACKUP_DIR = path.join(process.cwd(), '.agentic-qe', 'backups');
const MAX_BACKUPS = 10;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`Created backup directory: ${BACKUP_DIR}`);
  }
}

function getBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('memory-') && f.endsWith('.db'))
    .map(f => {
      const match = f.match(/memory-(\d+)\.db/);
      return {
        filename: f,
        timestamp: match ? parseInt(match[1]) : 0,
        path: path.join(BACKUP_DIR, f),
        size: fs.statSync(path.join(BACKUP_DIR, f)).size
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function createBackup() {
  ensureBackupDir();

  if (!fs.existsSync(MEMORY_DB_PATH)) {
    console.error('ERROR: memory.db does not exist at', MEMORY_DB_PATH);
    process.exit(1);
  }

  const stats = fs.statSync(MEMORY_DB_PATH);
  if (stats.size < 1024) {
    console.warn('WARNING: memory.db is very small (<1KB), may be empty');
  }

  const timestamp = Date.now();
  const backupPath = path.join(BACKUP_DIR, `memory-${timestamp}.db`);

  // Copy the file
  fs.copyFileSync(MEMORY_DB_PATH, backupPath);

  console.log(`Backup created: ${backupPath}`);
  console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`  Time: ${new Date(timestamp).toISOString()}`);

  // Clean old backups
  cleanOldBackups();

  return backupPath;
}

function cleanOldBackups() {
  const backups = getBackups();

  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(MAX_BACKUPS);
    for (const backup of toDelete) {
      fs.unlinkSync(backup.path);
      console.log(`Deleted old backup: ${backup.filename}`);
    }
  }
}

function listBackups() {
  const backups = getBackups();

  if (backups.length === 0) {
    console.log('No backups found.');
    return;
  }

  console.log('Available backups:');
  console.log('─'.repeat(60));

  for (const backup of backups) {
    const date = new Date(backup.timestamp);
    const sizeKB = (backup.size / 1024).toFixed(2);
    console.log(`  ${backup.timestamp}  ${date.toISOString()}  ${sizeKB} KB`);
  }

  console.log('─'.repeat(60));
  console.log(`\nTo restore: node scripts/backup-memory.js --restore <timestamp>`);
}

function restoreBackup(timestamp) {
  const backups = getBackups();
  const backup = backups.find(b => b.timestamp.toString() === timestamp);

  if (!backup) {
    console.error(`ERROR: Backup with timestamp ${timestamp} not found`);
    listBackups();
    process.exit(1);
  }

  // Create backup of current before restoring
  if (fs.existsSync(MEMORY_DB_PATH)) {
    const preRestoreBackup = path.join(BACKUP_DIR, `memory-pre-restore-${Date.now()}.db`);
    fs.copyFileSync(MEMORY_DB_PATH, preRestoreBackup);
    console.log(`Created pre-restore backup: ${preRestoreBackup}`);
  }

  // Restore
  fs.copyFileSync(backup.path, MEMORY_DB_PATH);

  console.log(`Restored memory.db from backup:`);
  console.log(`  Timestamp: ${backup.timestamp}`);
  console.log(`  Date: ${new Date(backup.timestamp).toISOString()}`);
  console.log(`  Size: ${(backup.size / 1024).toFixed(2)} KB`);
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--restore')) {
  const restoreIndex = args.indexOf('--restore');
  const timestamp = args[restoreIndex + 1];

  if (timestamp) {
    restoreBackup(timestamp);
  } else {
    listBackups();
  }
} else if (args.includes('--list')) {
  listBackups();
} else {
  createBackup();
}
