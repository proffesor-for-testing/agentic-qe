#!/usr/bin/env node
/**
 * Copy JSON data files to dist after TypeScript compilation
 */

const fs = require('fs');
const path = require('path');

const copyRecursive = (src, dest) => {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(child => {
      copyRecursive(path.join(src, child), path.join(dest, child));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
};

// Copy routing data files
const srcDataDir = path.join(__dirname, '../src/routing/data');
const destDataDir = path.join(__dirname, '../dist/routing/data');

if (fs.existsSync(srcDataDir)) {
  console.log('Copying JSON data files...');
  copyRecursive(srcDataDir, destDataDir);
  console.log('✅ JSON data files copied successfully');
} else {
  console.warn('⚠️  Source data directory not found:', srcDataDir);
}
