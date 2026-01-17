#!/usr/bin/env node

/**
 * Edge Bundle Script
 *
 * Bundles the edge module for browser deployment using esbuild.
 * Produces both ESM and IIFE bundles with WASM support.
 *
 * Usage:
 *   npm run build:edge
 *   node scripts/bundle-edge.js
 *
 * Output:
 *   dist/edge/agentic-qe-edge.esm.js     - ESM bundle for modern bundlers
 *   dist/edge/agentic-qe-edge.iife.js    - IIFE bundle for direct browser usage
 *   dist/edge/agentic-qe-edge.esm.js.map - Source maps
 */

const fs = require('fs');
const path = require('path');

// Check if esbuild is available (optional dependency for edge builds)
let esbuild;
try {
  esbuild = require('esbuild');
} catch (error) {
  console.log('[bundle-edge] esbuild not installed. Skipping browser bundle.');
  console.log('[bundle-edge] To enable browser bundles, run: npm install -D esbuild');
  console.log('[bundle-edge] TypeScript compilation completed successfully.');
  process.exit(0);
}

const OUT_DIR = path.join(__dirname, '..', 'dist', 'edge');
const ENTRY = path.join(__dirname, '..', 'src', 'edge', 'index.ts');

// Ensure output directory exists
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

/**
 * Common build options
 */
const commonOptions = {
  entryPoints: [ENTRY],
  bundle: true,
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  target: ['chrome87', 'firefox89', 'safari15'],
  platform: 'browser',
  external: ['@ruvector/edge'], // External - loaded separately as WASM
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  banner: {
    js: `/**
 * Agentic QE Edge Bundle
 * Browser-compatible AI agent capabilities using WASM-compiled vector operations
 *
 * @version 0.1.0
 * @license MIT
 */`,
  },
};

/**
 * Build ESM bundle
 */
async function buildESM() {
  console.log('[bundle-edge] Building ESM bundle...');

  await esbuild.build({
    ...commonOptions,
    outfile: path.join(OUT_DIR, 'agentic-qe-edge.esm.js'),
    format: 'esm',
  });

  console.log('[bundle-edge] ESM bundle created: dist/edge/agentic-qe-edge.esm.js');
}

/**
 * Build IIFE bundle for direct browser usage
 */
async function buildIIFE() {
  console.log('[bundle-edge] Building IIFE bundle...');

  await esbuild.build({
    ...commonOptions,
    outfile: path.join(OUT_DIR, 'agentic-qe-edge.iife.js'),
    format: 'iife',
    globalName: 'AgenticQEEdge',
  });

  console.log('[bundle-edge] IIFE bundle created: dist/edge/agentic-qe-edge.iife.js');
}

/**
 * Analyze bundle size
 */
async function analyzeBundle() {
  const esmPath = path.join(OUT_DIR, 'agentic-qe-edge.esm.js');
  const iifePath = path.join(OUT_DIR, 'agentic-qe-edge.iife.js');

  if (fs.existsSync(esmPath)) {
    const stats = fs.statSync(esmPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`[bundle-edge] ESM bundle size: ${sizeKB} KB`);
  }

  if (fs.existsSync(iifePath)) {
    const stats = fs.statSync(iifePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`[bundle-edge] IIFE bundle size: ${sizeKB} KB`);
  }
}

/**
 * Main build function
 */
async function build() {
  try {
    console.log('[bundle-edge] Starting edge module build...');
    console.log(`[bundle-edge] Entry: ${ENTRY}`);
    console.log(`[bundle-edge] Output: ${OUT_DIR}`);

    await buildESM();
    await buildIIFE();
    await analyzeBundle();

    console.log('[bundle-edge] Build completed successfully!');
  } catch (error) {
    console.error('[bundle-edge] Build failed:', error);
    process.exit(1);
  }
}

// Run build
build();
